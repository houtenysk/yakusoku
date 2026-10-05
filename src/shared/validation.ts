import type { CreatePromiseInput, JudgeInput } from "./types";

export const MAX_PENALTY = 10_000;
export const MAX_TITLE = 60;
export const MAX_TEXT = 500;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function validateCreatePromise(body: unknown): ValidationResult<CreatePromiseInput> {
  if (!isObject(body)) return { ok: false, error: "入力が不正です" };
  const { title, detail, doerId, checkerId, penaltyAmount, cadence, firstDueAt } = body;

  if (typeof title !== "string" || !title.trim()) return { ok: false, error: "約束の内容を入力してください" };
  if (title.length > MAX_TITLE) return { ok: false, error: `約束の内容は${MAX_TITLE}文字以内にしてください` };
  if (detail !== undefined && (typeof detail !== "string" || detail.length > MAX_TEXT)) {
    return { ok: false, error: `詳細は${MAX_TEXT}文字以内にしてください` };
  }
  if (typeof doerId !== "string" || typeof checkerId !== "string") {
    return { ok: false, error: "やる人と確認する人を選んでください" };
  }
  if (doerId === checkerId) return { ok: false, error: "やる人と確認する人は別の人にしてください" };
  if (
    typeof penaltyAmount !== "number" ||
    !Number.isInteger(penaltyAmount) ||
    penaltyAmount < 1 ||
    penaltyAmount > MAX_PENALTY
  ) {
    return { ok: false, error: `罰金は1〜${MAX_PENALTY.toLocaleString()}円の整数にしてください` };
  }
  if (cadence !== "once" && cadence !== "weekly") return { ok: false, error: "繰り返しの設定が不正です" };
  if (typeof firstDueAt !== "string" || Number.isNaN(Date.parse(firstDueAt))) {
    return { ok: false, error: "期限を入力してください" };
  }

  return {
    ok: true,
    value: {
      title: title.trim(),
      detail: typeof detail === "string" ? detail.trim() : "",
      doerId,
      checkerId,
      penaltyAmount,
      cadence,
      firstDueAt: new Date(firstDueAt).toISOString(),
    },
  };
}

export function validateJudge(body: unknown): ValidationResult<JudgeInput> {
  if (!isObject(body)) return { ok: false, error: "入力が不正です" };
  const { result, score, note } = body;
  if (result !== "pass" && result !== "fail") return { ok: false, error: "判定結果を選んでください" };
  if (score !== undefined && score !== null && (typeof score !== "number" || !Number.isInteger(score))) {
    return { ok: false, error: "点数は整数で入力してください" };
  }
  if (note !== undefined && (typeof note !== "string" || note.length > MAX_TEXT)) {
    return { ok: false, error: `メモは${MAX_TEXT}文字以内にしてください` };
  }
  return {
    ok: true,
    value: { result, score: typeof score === "number" ? score : null, note: typeof note === "string" ? note.trim() : "" },
  };
}

export function validateAmount(v: unknown, max = 1_000_000): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max;
}
