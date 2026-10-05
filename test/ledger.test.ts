import { describe, expect, it } from "vitest";
import { summarizeLedger } from "../src/shared/ledger";
import { nextDueAt } from "../src/shared/schedule";
import type { LedgerEntry } from "../src/shared/types";

let n = 0;
const entry = (e: Partial<LedgerEntry>): LedgerEntry => ({
  id: String(n++),
  poolId: "p",
  kind: "penalty",
  promiseId: null,
  roundId: null,
  userId: "a",
  amount: 1000,
  memo: "",
  status: "unpaid",
  reportedAt: null,
  confirmedAt: null,
  createdAt: "",
  ...e,
});

describe("summarizeLedger", () => {
  it("罰金の状態ごとに集計し、支出を差し引く", () => {
    const b = summarizeLedger(
      [
        entry({ userId: "a", status: "unpaid" }),
        entry({ userId: "a", status: "reported", amount: 500 }),
        entry({ userId: "b", status: "confirmed" }),
        entry({ userId: "b", status: "confirmed", amount: 2000 }),
        entry({ userId: "b", status: "void", amount: 9999 }),
        entry({ kind: "expense", userId: "b", status: "confirmed", amount: 1200 }),
      ],
      ["a", "b", "c"],
    );
    expect(b).toEqual({
      cashOnHand: 1800,
      outstanding: 1500,
      collected: 3000,
      spent: 1200,
      members: [
        { userId: "a", unpaid: 1000, reported: 500, paid: 0 },
        { userId: "b", unpaid: 0, reported: 0, paid: 3000 },
        { userId: "c", unpaid: 0, reported: 0, paid: 0 },
      ],
    });
  });

  it("プールにいない人の罰金も残高に含める", () => {
    const b = summarizeLedger([entry({ userId: "gone", status: "confirmed" })], ["a"]);
    expect(b.collected).toBe(1000);
    expect(b.members.map((m) => m.userId)).toEqual(["a", "gone"]);
  });
});

describe("nextDueAt", () => {
  it("1 週間後を返す", () => {
    expect(nextDueAt("2026-10-05T12:00:00.000Z")).toBe("2026-10-12T12:00:00.000Z");
  });
});
