import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { summarizeLedger } from "../shared/ledger";
import { nextDueAt } from "../shared/schedule";
import type { Me, PoolDetail, PoolSummary } from "../shared/types";
import { validateAmount, validateCreatePromise, validateJudge, MAX_TEXT } from "../shared/validation";
import { auth, type AppEnv } from "./auth";
import {
  getLedgerEntry,
  getPool,
  getPromise,
  isMember,
  listLedger,
  listMembers,
  listPromises,
  now,
  setPaypayId,
  type RoundRow,
} from "./db";

const fail = (status: 400 | 403 | 404 | 409, message: string): never => {
  throw new HTTPException(status, { message });
};

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return fail(400, "入力が不正です");
  }
}

const INVITE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
function inviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

async function requireMember(db: D1Database, poolId: string, userId: string) {
  const pool = await getPool(db, poolId);
  if (!pool || !(await isMember(db, poolId, userId))) fail(404, "プールが見つかりません");
  return pool!;
}

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "サーバーでエラーが発生しました" }, 500);
});

app.use("*", auth);

// ---- 自分 ----

app.get("/me", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.holder_id,
       (SELECT COUNT(*) FROM pool_members x WHERE x.pool_id = p.id) AS member_count,
       (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries l
         WHERE l.pool_id = p.id AND l.kind = 'penalty' AND l.user_id = ?1
           AND l.status IN ('unpaid', 'reported')) AS my_owed
     FROM pools p JOIN pool_members m ON m.pool_id = p.id
     WHERE m.user_id = ?1 ORDER BY m.joined_at DESC`,
  )
    .bind(user.id)
    .all<{ id: string; name: string; holder_id: string; member_count: number; my_owed: number }>();
  const pools: PoolSummary[] = results.map((r) => ({
    id: r.id,
    name: r.name,
    holderId: r.holder_id,
    memberCount: r.member_count,
    myOwed: r.my_owed,
  }));
  return c.json<Me>({ user, pools });
});

app.put("/me", async (c) => {
  const body = await readJson(c.req.raw);
  const raw = (body as { paypayId?: unknown } | null)?.paypayId;
  if (raw !== null && typeof raw !== "string") fail(400, "PayPay ID が不正です");
  const paypayId = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  if (paypayId && paypayId.length > 50) fail(400, "PayPay ID が長すぎます");
  return c.json(await setPaypayId(c.env.DB, c.get("user").id, paypayId));
});

// ---- プール ----

app.post("/pools", async (c) => {
  const body = (await readJson(c.req.raw)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) fail(400, "プール名は1〜40文字で入力してください");
  const user = c.get("user");
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO pools (id, name, holder_id, invite_code) VALUES (?, ?, ?, ?)`).bind(
      id,
      name,
      user.id,
      inviteCode(),
    ),
    c.env.DB.prepare(`INSERT INTO pool_members (pool_id, user_id) VALUES (?, ?)`).bind(id, user.id),
  ]);
  return c.json({ id }, 201);
});

app.get("/invites/:code", async (c) => {
  const pool = await c.env.DB.prepare(
    `SELECT p.id, p.name, u.display_name AS holder_name,
       (SELECT COUNT(*) FROM pool_members x WHERE x.pool_id = p.id) AS member_count
     FROM pools p JOIN users u ON u.id = p.holder_id WHERE p.invite_code = ?`,
  )
    .bind(c.req.param("code"))
    .first<{ id: string; name: string; holder_name: string; member_count: number }>();
  if (!pool) fail(404, "招待リンクが無効です");
  return c.json({
    id: pool!.id,
    name: pool!.name,
    holderName: pool!.holder_name,
    memberCount: pool!.member_count,
    joined: await isMember(c.env.DB, pool!.id, c.get("user").id),
  });
});

app.post("/invites/:code/join", async (c) => {
  const pool = await c.env.DB.prepare(`SELECT id FROM pools WHERE invite_code = ?`)
    .bind(c.req.param("code"))
    .first<{ id: string }>();
  if (!pool) fail(404, "招待リンクが無効です");
  await c.env.DB.prepare(`INSERT OR IGNORE INTO pool_members (pool_id, user_id) VALUES (?, ?)`)
    .bind(pool!.id, c.get("user").id)
    .run();
  return c.json({ id: pool!.id });
});

app.get("/pools/:id", async (c) => {
  const db = c.env.DB;
  const pool = await requireMember(db, c.req.param("id"), c.get("user").id);
  const [members, promises, ledger] = await Promise.all([
    listMembers(db, pool.id),
    listPromises(db, pool.id),
    listLedger(db, pool.id),
  ]);
  return c.json<PoolDetail>({
    id: pool.id,
    name: pool.name,
    holderId: pool.holder_id,
    inviteCode: pool.invite_code,
    members,
    promises,
    ledger,
    balance: summarizeLedger(
      ledger,
      members.map((m) => m.id),
    ),
  });
});

// プールからの支出（飲み会代など）を記録する。幹事のみ
app.post("/pools/:id/expenses", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const pool = await requireMember(db, c.req.param("id"), user.id);
  if (pool.holder_id !== user.id) fail(403, "支出を記録できるのは幹事だけです");
  const body = (await readJson(c.req.raw)) as { amount?: unknown; memo?: unknown } | null;
  if (!validateAmount(body?.amount)) fail(400, "金額は1円以上の整数で入力してください");
  const memo = typeof body?.memo === "string" ? body.memo.trim().slice(0, MAX_TEXT) : "";
  const id = crypto.randomUUID();
  const t = now();
  await db
    .prepare(
      `INSERT INTO ledger_entries (id, pool_id, kind, user_id, amount, memo, status, confirmed_at)
       VALUES (?, ?, 'expense', ?, ?, ?, 'confirmed', ?)`,
    )
    .bind(id, pool.id, user.id, body!.amount, memo, t)
    .run();
  return c.json({ id }, 201);
});

// ---- 約束 ----

app.post("/pools/:id/promises", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const pool = await requireMember(db, c.req.param("id"), user.id);
  const v = validateCreatePromise(await readJson(c.req.raw));
  if (!v.ok) return fail(400, v.error);
  const input = v.value;
  if (user.id !== input.doerId && user.id !== input.checkerId) {
    fail(400, "自分がやる人か確認する人のどちらかになる約束だけ作れます");
  }
  const other = user.id === input.doerId ? input.checkerId : input.doerId;
  if (!(await isMember(db, pool.id, other))) fail(400, "相手がプールのメンバーではありません");

  const id = crypto.randomUUID();
  const t = now();
  // 作った人は同意済みとし、相手の同意で有効になる
  await db
    .prepare(
      `INSERT INTO promises (id, pool_id, title, detail, doer_id, checker_id, penalty_amount, cadence,
         first_due_at, status, created_by, doer_agreed_at, checker_agreed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .bind(
      id,
      pool.id,
      input.title,
      input.detail ?? "",
      input.doerId,
      input.checkerId,
      input.penaltyAmount,
      input.cadence,
      input.firstDueAt,
      user.id,
      user.id === input.doerId ? t : null,
      user.id === input.checkerId ? t : null,
    )
    .run();
  return c.json({ id }, 201);
});

async function requireParty(db: D1Database, promiseId: string, userId: string) {
  const promise = await getPromise(db, promiseId);
  if (!promise || !(await isMember(db, promise.pool_id, userId))) fail(404, "約束が見つかりません");
  return promise!;
}

app.post("/promises/:id/agree", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const p = await requireParty(db, c.req.param("id"), user.id);
  if (p.status !== "pending") fail(409, "この約束は同意待ちではありません");
  const [mine, theirs] =
    user.id === p.doer_id
      ? ["doer_agreed_at", "checker_agreed_at"]
      : user.id === p.checker_id
        ? ["checker_agreed_at", "doer_agreed_at"]
        : fail(403, "この約束の当事者ではありません");

  const updated = await db
    .prepare(
      `UPDATE promises SET ${mine} = COALESCE(${mine}, ?),
         status = CASE WHEN ${theirs} IS NOT NULL THEN 'active' ELSE status END
       WHERE id = ? AND status = 'pending' RETURNING status`,
    )
    .bind(now(), p.id)
    .first<{ status: string }>();
  if (updated?.status === "active") {
    // 同時に同意しても 1 回目は 1 つだけ作られる（UNIQUE(promise_id, seq)）
    await db
      .prepare(
        `INSERT OR IGNORE INTO rounds (id, promise_id, seq, due_at, result) VALUES (?, ?, 1, ?, 'pending')`,
      )
      .bind(crypto.randomUUID(), p.id, p.first_due_at)
      .run();
  }
  return c.json({ status: updated?.status ?? p.status });
});

// 同意前なら取り消し、有効中なら次回以降の更新をやめる（今の回の判定は残る）
app.post("/promises/:id/end", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const p = await requireParty(db, c.req.param("id"), user.id);
  if (user.id !== p.doer_id && user.id !== p.checker_id) fail(403, "この約束の当事者ではありません");
  if (p.status === "pending") {
    await db.prepare(`UPDATE promises SET status = 'cancelled', ended_at = ? WHERE id = ?`).bind(now(), p.id).run();
    return c.json({ status: "cancelled" });
  }
  if (p.status !== "active") fail(409, "この約束はすでに終わっています");
  await db.prepare(`UPDATE promises SET status = 'ended', ended_at = ? WHERE id = ?`).bind(now(), p.id).run();
  return c.json({ status: "ended" });
});

app.post("/rounds/:id/judge", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const round = await db.prepare(`SELECT * FROM rounds WHERE id = ?`).bind(c.req.param("id")).first<RoundRow>();
  if (!round) return fail(404, "回が見つかりません");
  const p = await requireParty(db, round.promise_id, user.id);
  if (user.id !== p.checker_id) fail(403, "判定できるのは確認する人だけです");
  if (round.result !== "pending") fail(409, "この回はすでに判定済みです");
  const v = validateJudge(await readJson(c.req.raw));
  if (!v.ok) return fail(400, v.error);

  const t = now();
  const stmts = [
    db
      .prepare(`UPDATE rounds SET result = ?, score = ?, note = ?, judged_at = ? WHERE id = ? AND result = 'pending'`)
      .bind(v.value.result, v.value.score ?? null, v.value.note ?? "", t, round.id),
  ];
  if (v.value.result === "fail") {
    stmts.push(
      db
        .prepare(
          `INSERT INTO ledger_entries (id, pool_id, kind, promise_id, round_id, user_id, amount, memo, status)
           VALUES (?, ?, 'penalty', ?, ?, ?, ?, ?, 'unpaid')`,
        )
        .bind(crypto.randomUUID(), p.pool_id, p.id, round.id, p.doer_id, p.penalty_amount, `${p.title}（第${round.seq}回）`),
    );
  }
  if (p.cadence === "weekly" && p.status === "active") {
    stmts.push(
      db
        .prepare(`INSERT INTO rounds (id, promise_id, seq, due_at, result) VALUES (?, ?, ?, ?, 'pending')`)
        .bind(crypto.randomUUID(), p.id, round.seq + 1, nextDueAt(round.due_at)),
    );
  } else if (p.cadence === "once" && p.status === "active") {
    stmts.push(db.prepare(`UPDATE promises SET status = 'ended', ended_at = ? WHERE id = ?`).bind(t, p.id));
  }

  try {
    // 罰金の round_id と次回の (promise_id, seq) が UNIQUE なので、二重判定はまとめて失敗する
    const [res] = await db.batch(stmts);
    if (res.meta.changes === 0) fail(409, "この回はすでに判定済みです");
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    if (String(e).includes("UNIQUE")) fail(409, "この回はすでに判定済みです");
    throw e;
  }
  return c.json({ result: v.value.result });
});

// ---- 帳簿 ----

async function requireEntry(db: D1Database, id: string, userId: string) {
  const entry = await getLedgerEntry(db, id);
  if (!entry || !(await isMember(db, entry.pool_id, userId))) fail(404, "記録が見つかりません");
  return entry!;
}

// 払った人が「支払った」と報告する
app.post("/ledger/:id/report", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const e = await requireEntry(db, c.req.param("id"), user.id);
  if (e.kind !== "penalty" || e.user_id !== user.id) fail(403, "自分の罰金だけ報告できます");
  if (e.status !== "unpaid") fail(409, "この罰金は未払いではありません");
  await db
    .prepare(`UPDATE ledger_entries SET status = 'reported', reported_at = ? WHERE id = ? AND status = 'unpaid'`)
    .bind(now(), e.id)
    .run();
  return c.json({ status: "reported" });
});

// 幹事が受け取りを確認する（飲み会で現金で受け取った場合など、報告前でも確認できる）
app.post("/ledger/:id/confirm", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const e = await requireEntry(db, c.req.param("id"), user.id);
  const pool = await getPool(db, e.pool_id);
  if (pool!.holder_id !== user.id) fail(403, "受け取りを確認できるのは幹事だけです");
  if (e.kind !== "penalty" || (e.status !== "unpaid" && e.status !== "reported")) {
    fail(409, "この記録は確認できません");
  }
  await db
    .prepare(
      `UPDATE ledger_entries SET status = 'confirmed', confirmed_at = ?
       WHERE id = ? AND status IN ('unpaid', 'reported')`,
    )
    .bind(now(), e.id)
    .run();
  return c.json({ status: "confirmed" });
});

// 記録の取り消し。罰金は確認する人か幹事が、受け取り確認前に限り取り消せる。支出は幹事が取り消せる
app.post("/ledger/:id/void", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const e = await requireEntry(db, c.req.param("id"), user.id);
  const pool = await getPool(db, e.pool_id);
  const isHolder = pool!.holder_id === user.id;
  if (e.kind === "penalty") {
    const p = e.promise_id ? await getPromise(db, e.promise_id) : null;
    if (!isHolder && p?.checker_id !== user.id) fail(403, "取り消せるのは確認する人か幹事だけです");
    if (e.status !== "unpaid" && e.status !== "reported") fail(409, "受け取り確認済みの罰金は取り消せません");
  } else {
    if (!isHolder) fail(403, "支出を取り消せるのは幹事だけです");
    if (e.status === "void") fail(409, "すでに取り消されています");
  }
  await db.prepare(`UPDATE ledger_entries SET status = 'void' WHERE id = ?`).bind(e.id).run();
  return c.json({ status: "void" });
});

export default app;
