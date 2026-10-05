import type { LedgerEntry, MemberBalance, PoolBalance } from "./types";

// 帳簿からプール残高とメンバーごとの支払い状況を集計する
export function summarizeLedger(entries: LedgerEntry[], memberIds: string[]): PoolBalance {
  const members = new Map<string, MemberBalance>(
    memberIds.map((id) => [id, { userId: id, unpaid: 0, reported: 0, paid: 0 }]),
  );
  let collected = 0;
  let spent = 0;
  let outstanding = 0;

  for (const e of entries) {
    if (e.status === "void") continue;
    if (e.kind === "expense") {
      spent += e.amount;
      continue;
    }
    // プールを抜けたメンバーの罰金も残高には含める
    let m = members.get(e.userId);
    if (!m) {
      m = { userId: e.userId, unpaid: 0, reported: 0, paid: 0 };
      members.set(e.userId, m);
    }
    if (e.status === "confirmed") {
      m.paid += e.amount;
      collected += e.amount;
    } else {
      m[e.status] += e.amount;
      outstanding += e.amount;
    }
  }

  return {
    cashOnHand: collected - spent,
    outstanding,
    collected,
    spent,
    members: [...members.values()],
  };
}
