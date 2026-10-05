import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import app from "../src/worker/index";
import type { Me, PoolDetail } from "../src/shared/types";

let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
let env: Env;

const schema = readFileSync("migrations/0001_init.sql", "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ configPath: "wrangler.jsonc", persist: false });
  env = { ...proxy.env, DEV_AUTH: "1" };
});

afterAll(async () => {
  await proxy?.dispose();
});

beforeEach(async () => {
  for (const t of ["ledger_entries", "rounds", "promises", "pool_members", "pools", "users"]) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  for (const s of schema) await env.DB.prepare(s).run();
});

// 開発用ヘッダーでユーザーになりすまして API を呼ぶ
function as(userId: string) {
  const call = async <T = any>(method: string, path: string, body?: unknown) => {
    const res = await app.request(
      `/api${path}`,
      {
        method,
        headers: { "X-Dev-User": userId, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    );
    return { status: res.status, body: (await res.json()) as T };
  };
  return {
    get: <T = any>(path: string) => call<T>("GET", path),
    post: <T = any>(path: string, body: unknown = {}) => call<T>("POST", path, body),
    put: <T = any>(path: string, body: unknown) => call<T>("PUT", path, body),
  };
}

const taro = as("taro");
const hana = as("hana");
const ken = as("ken");

async function setupPool() {
  const { body } = await hana.post<{ id: string }>("/pools", { name: "宿題プール" });
  const pool = (await hana.get<PoolDetail>(`/pools/${body.id}`)).body;
  await taro.post(`/invites/${pool.inviteCode}/join`);
  return pool;
}

async function setupPromise(cadence: "once" | "weekly" = "weekly") {
  const pool = await setupPool();
  const { body } = await taro.post<{ id: string }>(`/pools/${pool.id}/promises`, {
    title: "数学の宿題を出す",
    doerId: "taro",
    checkerId: "hana",
    penaltyAmount: 1000,
    cadence,
    firstDueAt: "2026-10-10T12:00:00.000Z",
  });
  await hana.post(`/promises/${body.id}/agree`);
  const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
  return { pool: detail, promise: detail.promises[0]! };
}

describe("認証", () => {
  it("ログインしていないと 401", async () => {
    const res = await app.request("/api/me", {}, env);
    expect(res.status).toBe(401);
  });

  it("DEV_AUTH が 1 でなければ開発用ヘッダーは使えない", async () => {
    const res = await app.request("/api/me", { headers: { "X-Dev-User": "taro" } }, { ...env, DEV_AUTH: "0" });
    expect(res.status).toBe(401);
  });
});

describe("プール", () => {
  it("作成して招待コードで参加できる", async () => {
    const pool = await setupPool();
    const me = (await taro.get<Me>("/me")).body;
    expect(me.pools).toEqual([{ id: pool.id, name: "宿題プール", holderId: "hana", memberCount: 2, myOwed: 0 }]);
  });

  it("メンバー以外は中身を見られない", async () => {
    const pool = await setupPool();
    expect((await ken.get(`/pools/${pool.id}`)).status).toBe(404);
  });

  it("招待コードでプールの概要を確認できる", async () => {
    const pool = await setupPool();
    const res = await ken.get(`/invites/${pool.inviteCode}`);
    expect(res.body).toMatchObject({ name: "宿題プール", memberCount: 2, joined: false });
  });
});

describe("約束", () => {
  it("相手が同意すると有効になり、1 回目ができる", async () => {
    const pool = await setupPool();
    const { body } = await taro.post<{ id: string }>(`/pools/${pool.id}/promises`, {
      title: "数学の宿題を出す",
      doerId: "taro",
      checkerId: "hana",
      penaltyAmount: 1000,
      cadence: "weekly",
      firstDueAt: "2026-10-10T12:00:00.000Z",
    });
    let detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.promises[0]).toMatchObject({ status: "pending", rounds: [] });

    // 作った本人がもう一度同意しても有効にはならない
    expect((await taro.post(`/promises/${body.id}/agree`)).body).toEqual({ status: "pending" });
    expect((await hana.post(`/promises/${body.id}/agree`)).body).toEqual({ status: "active" });

    detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.promises[0]!.rounds).toMatchObject([{ seq: 1, dueAt: "2026-10-10T12:00:00.000Z", result: "pending" }]);
  });

  it("入力チェック", async () => {
    const pool = await setupPool();
    const base = {
      title: "x",
      doerId: "taro",
      checkerId: "hana",
      penaltyAmount: 1000,
      cadence: "once",
      firstDueAt: "2026-10-10T12:00:00.000Z",
    };
    expect((await taro.post(`/pools/${pool.id}/promises`, { ...base, checkerId: "taro" })).status).toBe(400);
    expect((await taro.post(`/pools/${pool.id}/promises`, { ...base, penaltyAmount: 0 })).status).toBe(400);
    expect((await taro.post(`/pools/${pool.id}/promises`, { ...base, checkerId: "ken" })).status).toBe(400);
  });

  it("不合格なら罰金が帳簿に載り、毎週の約束は次の回ができる", async () => {
    const { pool, promise } = await setupPromise();
    const round = promise.rounds[0]!;

    expect((await taro.post(`/rounds/${round.id}/judge`, { result: "pass" })).status).toBe(403);
    expect((await hana.post(`/rounds/${round.id}/judge`, { result: "fail", score: 25, note: "赤点" })).status).toBe(200);
    expect((await hana.post(`/rounds/${round.id}/judge`, { result: "fail" })).status).toBe(409);

    const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.promises[0]!.rounds.map((r) => [r.seq, r.result, r.dueAt])).toEqual([
      [2, "pending", "2026-10-17T12:00:00.000Z"],
      [1, "fail", "2026-10-10T12:00:00.000Z"],
    ]);
    expect(detail.ledger).toMatchObject([
      { kind: "penalty", userId: "taro", amount: 1000, status: "unpaid", memo: "数学の宿題を出す（第1回）" },
    ]);
    expect(detail.balance).toMatchObject({ outstanding: 1000, cashOnHand: 0 });
    expect((await taro.get<Me>("/me")).body.pools[0]!.myOwed).toBe(1000);
  });

  it("1 回きりの約束は判定で終わる", async () => {
    const { pool, promise } = await setupPromise("once");
    await hana.post(`/rounds/${promise.rounds[0]!.id}/judge`, { result: "pass" });
    const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.promises[0]).toMatchObject({ status: "ended" });
    expect(detail.promises[0]!.rounds).toHaveLength(1);
    expect(detail.ledger).toEqual([]);
  });

  it("終了しても今の回は判定でき、次の回は作られない", async () => {
    const { pool, promise } = await setupPromise();
    expect((await taro.post(`/promises/${promise.id}/end`)).body).toEqual({ status: "ended" });
    await hana.post(`/rounds/${promise.rounds[0]!.id}/judge`, { result: "fail" });
    const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.promises[0]!.rounds).toHaveLength(1);
    expect(detail.ledger).toHaveLength(1);
  });
});

describe("帳簿と支払い", () => {
  async function withPenalty() {
    const { pool, promise } = await setupPromise();
    await hana.post(`/rounds/${promise.rounds[0]!.id}/judge`, { result: "fail" });
    const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    return { pool: detail, entry: detail.ledger[0]! };
  }

  it("払った人が報告し、幹事が受け取りを確認する", async () => {
    const { pool, entry } = await withPenalty();
    expect((await hana.post(`/ledger/${entry.id}/report`)).status).toBe(403);
    expect((await taro.post(`/ledger/${entry.id}/report`)).body).toEqual({ status: "reported" });
    expect((await taro.post(`/ledger/${entry.id}/confirm`)).status).toBe(403);
    expect((await hana.post(`/ledger/${entry.id}/confirm`)).body).toEqual({ status: "confirmed" });

    const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.balance).toMatchObject({ cashOnHand: 1000, outstanding: 0, collected: 1000 });
    expect((await hana.post(`/ledger/${entry.id}/void`)).status).toBe(409);
  });

  it("幹事は支出を記録でき、残高から引かれる", async () => {
    const { pool, entry } = await withPenalty();
    await hana.post(`/ledger/${entry.id}/confirm`);
    expect((await taro.post(`/pools/${pool.id}/expenses`, { amount: 600, memo: "飲み会" })).status).toBe(403);
    expect((await hana.post(`/pools/${pool.id}/expenses`, { amount: 600, memo: "飲み会" })).status).toBe(201);
    const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.balance).toMatchObject({ cashOnHand: 400, spent: 600 });
  });

  it("確認する人は未確認の罰金を取り消せる", async () => {
    const { pool, entry } = await withPenalty();
    expect((await taro.post(`/ledger/${entry.id}/void`)).status).toBe(403);
    expect((await hana.post(`/ledger/${entry.id}/void`)).body).toEqual({ status: "void" });
    const detail = (await hana.get<PoolDetail>(`/pools/${pool.id}`)).body;
    expect(detail.balance.outstanding).toBe(0);
  });
});

describe("PayPay ID", () => {
  it("登録と削除", async () => {
    expect((await hana.put("/me", { paypayId: " hana_pp " })).body).toMatchObject({ paypayId: "hana_pp" });
    expect((await hana.put("/me", { paypayId: "" })).body).toMatchObject({ paypayId: null });
  });
});
