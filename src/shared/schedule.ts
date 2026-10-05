const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// weekly の約束で、ある回の期限から次の回の期限を求める
export function nextDueAt(dueAt: string): string {
  return new Date(new Date(dueAt).getTime() + WEEK_MS).toISOString();
}
