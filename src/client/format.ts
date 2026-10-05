export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function formatDue(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${hh}:${mm}`;
}

// <input type="datetime-local"> 用の値（ローカル時刻）
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 次の日曜 21:00
export function defaultDue(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(21, 0, 0, 0);
  return d;
}
