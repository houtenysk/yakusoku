import type { LedgerEntry, Promise_, Round, User } from "../shared/types";

type UserRow = { id: string; display_name: string; picture_url: string | null; paypay_id: string | null };

export type PoolRow = { id: string; name: string; holder_id: string; invite_code: string };

export type PromiseRow = {
  id: string;
  pool_id: string;
  title: string;
  detail: string;
  doer_id: string;
  checker_id: string;
  penalty_amount: number;
  cadence: Promise_["cadence"];
  first_due_at: string;
  status: Promise_["status"];
  created_by: string;
  doer_agreed_at: string | null;
  checker_agreed_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type RoundRow = {
  id: string;
  promise_id: string;
  seq: number;
  due_at: string;
  result: Round["result"];
  score: number | null;
  note: string;
  judged_at: string | null;
};

export type LedgerRow = {
  id: string;
  pool_id: string;
  kind: LedgerEntry["kind"];
  promise_id: string | null;
  round_id: string | null;
  user_id: string;
  amount: number;
  memo: string;
  status: LedgerEntry["status"];
  reported_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export const toUser = (r: UserRow): User => ({
  id: r.id,
  displayName: r.display_name,
  pictureUrl: r.picture_url,
  paypayId: r.paypay_id,
});

export const toRound = (r: RoundRow): Round => ({
  id: r.id,
  promiseId: r.promise_id,
  seq: r.seq,
  dueAt: r.due_at,
  result: r.result,
  score: r.score,
  note: r.note,
  judgedAt: r.judged_at,
});

export const toPromise = (r: PromiseRow, rounds: Round[]): Promise_ => ({
  id: r.id,
  poolId: r.pool_id,
  title: r.title,
  detail: r.detail,
  doerId: r.doer_id,
  checkerId: r.checker_id,
  penaltyAmount: r.penalty_amount,
  cadence: r.cadence,
  firstDueAt: r.first_due_at,
  status: r.status,
  createdBy: r.created_by,
  doerAgreedAt: r.doer_agreed_at,
  checkerAgreedAt: r.checker_agreed_at,
  endedAt: r.ended_at,
  createdAt: r.created_at,
  rounds,
});

export const toLedger = (r: LedgerRow): LedgerEntry => ({
  id: r.id,
  poolId: r.pool_id,
  kind: r.kind,
  promiseId: r.promise_id,
  roundId: r.round_id,
  userId: r.user_id,
  amount: r.amount,
  memo: r.memo,
  status: r.status,
  reportedAt: r.reported_at,
  confirmedAt: r.confirmed_at,
  createdAt: r.created_at,
});

export const now = () => new Date().toISOString();

export async function upsertUser(db: D1Database, id: string, name: string, picture: string | null): Promise<User> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, display_name, picture_url) VALUES (?1, ?2, ?3)
       ON CONFLICT (id) DO UPDATE SET display_name = ?2, picture_url = ?3
       RETURNING id, display_name, picture_url, paypay_id`,
    )
    .bind(id, name, picture)
    .first<UserRow>();
  return toUser(row!);
}

export async function setPaypayId(db: D1Database, userId: string, paypayId: string | null): Promise<User> {
  const row = await db
    .prepare(`UPDATE users SET paypay_id = ? WHERE id = ? RETURNING id, display_name, picture_url, paypay_id`)
    .bind(paypayId, userId)
    .first<UserRow>();
  return toUser(row!);
}

export async function getPool(db: D1Database, poolId: string): Promise<PoolRow | null> {
  return db.prepare(`SELECT id, name, holder_id, invite_code FROM pools WHERE id = ?`).bind(poolId).first<PoolRow>();
}

export async function isMember(db: D1Database, poolId: string, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM pool_members WHERE pool_id = ? AND user_id = ?`)
    .bind(poolId, userId)
    .first();
  return row !== null;
}

export async function listMembers(db: D1Database, poolId: string): Promise<User[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.display_name, u.picture_url, u.paypay_id
       FROM pool_members m JOIN users u ON u.id = m.user_id
       WHERE m.pool_id = ? ORDER BY m.joined_at`,
    )
    .bind(poolId)
    .all<UserRow>();
  return results.map(toUser);
}

export async function getPromise(db: D1Database, promiseId: string): Promise<PromiseRow | null> {
  return db.prepare(`SELECT * FROM promises WHERE id = ?`).bind(promiseId).first<PromiseRow>();
}

export async function listPromises(db: D1Database, poolId: string): Promise<Promise_[]> {
  const [promises, rounds] = await db.batch([
    db.prepare(`SELECT * FROM promises WHERE pool_id = ? ORDER BY created_at DESC`).bind(poolId),
    db
      .prepare(
        `SELECT r.* FROM rounds r JOIN promises p ON p.id = r.promise_id
         WHERE p.pool_id = ? ORDER BY r.seq DESC`,
      )
      .bind(poolId),
  ]);
  const byPromise = new Map<string, Round[]>();
  for (const r of rounds.results as RoundRow[]) {
    const list = byPromise.get(r.promise_id) ?? [];
    list.push(toRound(r));
    byPromise.set(r.promise_id, list);
  }
  return (promises.results as PromiseRow[]).map((p) => toPromise(p, byPromise.get(p.id) ?? []));
}

export async function listLedger(db: D1Database, poolId: string): Promise<LedgerEntry[]> {
  const { results } = await db
    .prepare(`SELECT * FROM ledger_entries WHERE pool_id = ? ORDER BY created_at DESC`)
    .bind(poolId)
    .all<LedgerRow>();
  return results.map(toLedger);
}

export async function getLedgerEntry(db: D1Database, id: string): Promise<LedgerRow | null> {
  return db.prepare(`SELECT * FROM ledger_entries WHERE id = ?`).bind(id).first<LedgerRow>();
}
