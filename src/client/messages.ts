import type { PoolDetail, Promise_, Round } from "../shared/types";
import { formatDue, yen } from "./format";
import { inviteUrl } from "./platform";

// LINE のトークに送る文面

const name = (pool: PoolDetail, id: string) => pool.members.find((m) => m.id === id)?.displayName ?? "?";

export async function inviteMessage(pool: PoolDetail) {
  return `「${pool.name}」に招待します。約束を守れなかったら罰金をこのプールに積み立てて、飲み会で使おう！\n${await inviteUrl(pool.inviteCode)}`;
}

export async function agreeRequestMessage(pool: PoolDetail, p: Promise_) {
  return [
    `【約束の確認】${p.title}`,
    `やる人：${name(pool, p.doerId)} / 確認する人：${name(pool, p.checkerId)}`,
    `守れなかったら ${yen(p.penaltyAmount)} をプールへ（${p.cadence === "weekly" ? "毎週" : "1回きり"}、初回期限 ${formatDue(p.firstDueAt)}）`,
    `内容を確認して同意してね`,
    await inviteUrl(pool.inviteCode),
  ].join("\n");
}

export async function judgedMessage(pool: PoolDetail, p: Promise_, r: Round, result: "pass" | "fail", score: number | null) {
  const head = `【${p.title}】第${r.seq}回`;
  const scoreText = score !== null ? `（${score}点）` : "";
  const body =
    result === "pass"
      ? `達成！${scoreText} おつかれさま`
      : `未達成${scoreText}。${name(pool, p.doerId)}さんの罰金 ${yen(p.penaltyAmount)} がプールに記録されました`;
  return `${head}\n${body}\n${await inviteUrl(pool.inviteCode)}`;
}
