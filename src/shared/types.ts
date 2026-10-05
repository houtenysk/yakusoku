// API でやり取りする型。サーバーとクライアントで共有する

export type User = {
  id: string;
  displayName: string;
  pictureUrl: string | null;
  paypayId: string | null;
};

export type PoolSummary = {
  id: string;
  name: string;
  holderId: string;
  memberCount: number;
  // 自分の未払い罰金（unpaid + reported）の合計
  myOwed: number;
};

export type Me = {
  user: User;
  pools: PoolSummary[];
};

export type Cadence = "once" | "weekly";
export type PromiseStatus = "pending" | "active" | "ended" | "cancelled";
export type RoundResult = "pending" | "pass" | "fail";

export type Round = {
  id: string;
  promiseId: string;
  seq: number;
  dueAt: string;
  result: RoundResult;
  score: number | null;
  note: string;
  judgedAt: string | null;
};

export type Promise_ = {
  id: string;
  poolId: string;
  title: string;
  detail: string;
  doerId: string;
  checkerId: string;
  penaltyAmount: number;
  cadence: Cadence;
  firstDueAt: string;
  status: PromiseStatus;
  createdBy: string;
  doerAgreedAt: string | null;
  checkerAgreedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  rounds: Round[];
};

export type LedgerKind = "penalty" | "expense";
export type LedgerStatus = "unpaid" | "reported" | "confirmed" | "void";

export type LedgerEntry = {
  id: string;
  poolId: string;
  kind: LedgerKind;
  promiseId: string | null;
  roundId: string | null;
  userId: string;
  amount: number;
  memo: string;
  status: LedgerStatus;
  reportedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

export type MemberBalance = {
  userId: string;
  // 未払い（ツケ）
  unpaid: number;
  // 支払い報告済みで幹事の確認待ち
  reported: number;
  // 幹事が受け取りを確認した額
  paid: number;
};

export type PoolBalance = {
  // 幹事の手元にあるはずの額（受け取り確認済みの罰金 − 支出）
  cashOnHand: number;
  // まだ集まっていない罰金（未払い + 確認待ち）
  outstanding: number;
  // 受け取り確認済みの罰金の累計
  collected: number;
  // 支出の累計
  spent: number;
  members: MemberBalance[];
};

export type PoolDetail = {
  id: string;
  name: string;
  holderId: string;
  inviteCode: string;
  members: User[];
  promises: Promise_[];
  ledger: LedgerEntry[];
  balance: PoolBalance;
};

export type CreatePromiseInput = {
  title: string;
  detail?: string;
  doerId: string;
  checkerId: string;
  penaltyAmount: number;
  cadence: Cadence;
  firstDueAt: string;
};

export type JudgeInput = {
  result: "pass" | "fail";
  score?: number | null;
  note?: string;
};
