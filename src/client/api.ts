import type { CreatePromiseInput, JudgeInput, Me, PoolDetail, User } from "../shared/types";
import { authHeaders } from "./platform";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...authHeaders(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `エラーが発生しました (${res.status})`);
  return data as T;
}

export type InvitePreview = { id: string; name: string; holderName: string; memberCount: number; joined: boolean };

export const api = {
  me: () => request<Me>("GET", "/me"),
  updateMe: (paypayId: string | null) => request<User>("PUT", "/me", { paypayId }),
  createPool: (name: string) => request<{ id: string }>("POST", "/pools", { name }),
  pool: (id: string) => request<PoolDetail>("GET", `/pools/${id}`),
  invite: (code: string) => request<InvitePreview>("GET", `/invites/${encodeURIComponent(code)}`),
  join: (code: string) => request<{ id: string }>("POST", `/invites/${encodeURIComponent(code)}/join`),
  createPromise: (poolId: string, input: CreatePromiseInput) =>
    request<{ id: string }>("POST", `/pools/${poolId}/promises`, input),
  agree: (promiseId: string) => request<{ status: string }>("POST", `/promises/${promiseId}/agree`),
  endPromise: (promiseId: string) => request<{ status: string }>("POST", `/promises/${promiseId}/end`),
  judge: (roundId: string, input: JudgeInput) => request<{ result: string }>("POST", `/rounds/${roundId}/judge`, input),
  report: (entryId: string) => request("POST", `/ledger/${entryId}/report`),
  confirm: (entryId: string) => request("POST", `/ledger/${entryId}/confirm`),
  voidEntry: (entryId: string) => request("POST", `/ledger/${entryId}/void`),
  addExpense: (poolId: string, amount: number, memo: string) =>
    request<{ id: string }>("POST", `/pools/${poolId}/expenses`, { amount, memo }),
};
