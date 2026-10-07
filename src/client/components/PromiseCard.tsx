import { confirmDialog } from "../dialog";
import { useState } from "react";
import type { PoolDetail, Promise_, Round, User } from "../../shared/types";
import { api } from "../api";
import { formatDue, yen } from "../format";
import { agreeRequestMessage, judgedMessage } from "../messages";
import { shareText } from "../platform";
import { useAction } from "../useAsync";

const STATUS_LABEL: Record<Promise_["status"], string> = {
  pending: "同意待ち",
  active: "進行中",
  ended: "終了",
  cancelled: "取り消し",
};

type Props = { pool: PoolDetail; promise: Promise_; me: User; onChange: () => void };

export function PromiseCard({ pool, promise: p, me, onChange }: Props) {
  const { busy, run } = useAction();
  const name = (id: string) => pool.members.find((m) => m.id === id)?.displayName ?? "?";
  const isParty = me.id === p.doerId || me.id === p.checkerId;
  const myAgreed = me.id === p.doerId ? p.doerAgreedAt : me.id === p.checkerId ? p.checkerAgreedAt : null;
  const current = p.rounds.find((r) => r.result === "pending");
  const past = p.rounds.filter((r) => r.result !== "pending");

  return (
    <div className="card">
      <div className="row">
        <b>{p.title}</b>
        <span className={`chip ${p.status}`}>{STATUS_LABEL[p.status]}</span>
      </div>
      <div className="muted small">
        {name(p.doerId)} がやる → {name(p.checkerId)} が確認・{p.cadence === "weekly" ? "毎週" : "1回きり"}・罰金 {yen(p.penaltyAmount)}
      </div>
      {p.detail && <p className="detail">{p.detail}</p>}

      {p.status === "pending" &&
        (isParty && !myAgreed ? (
          <div className="row">
            <button
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog("この約束を断りますか？", { okLabel: "断る", danger: true })) {
                  await run(() => api.endPromise(p.id));
                  onChange();
                }
              }}
            >
              断る
            </button>
            <button className="primary" disabled={busy} onClick={() => run(() => api.agree(p.id)).then(onChange)}>
              同意する
            </button>
          </div>
        ) : (
          <div className="row">
            <span className="muted small">相手の同意待ちです</span>
            {isParty && (
              <button className="link" onClick={async () => shareText(await agreeRequestMessage(pool, p))}>
                LINE で頼む
              </button>
            )}
          </div>
        ))}

      {current && <CurrentRound key={current.id} pool={pool} promise={p} round={current} me={me} onChange={onChange} />}

      {past.length > 0 && (
        <details>
          <summary className="small">これまでの結果（{past.length}回）</summary>
          <ul className="history">
            {past.map((r) => (
              <li key={r.id}>
                第{r.seq}回 {formatDue(r.dueAt)}：
                <b className={r.result}>{r.result === "pass" ? "達成" : "未達成"}</b>
                {r.score !== null && `（${r.score}点）`}
                {r.note && ` ${r.note}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      {p.status === "active" && isParty && (
        <button
          className="link small"
          disabled={busy}
          onClick={async () => {
            if (await confirmDialog("この約束をやめますか？（今の回の判定は残ります）", { okLabel: "やめる", danger: true })) {
              await run(() => api.endPromise(p.id));
              onChange();
            }
          }}
        >
          約束をやめる
        </button>
      )}
    </div>
  );
}

function CurrentRound({ pool, promise: p, round, me, onChange }: Props & { round: Round }) {
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  const overdue = new Date(round.dueAt).getTime() < Date.now();

  const judge = async (result: "pass" | "fail") => {
    const s = score.trim() === "" ? null : Number(score);
    const label = result === "pass" ? "達成" : `未達成（罰金 ${yen(p.penaltyAmount)}）`;
    if (!(await confirmDialog(`第${round.seq}回を「${label}」にしますか？`, { okLabel: "決定", danger: result === "fail" }))) return;
    const ok = await run(() => api.judge(round.id, { result, score: s, note }));
    if (!ok) return;
    if (await confirmDialog("結果を LINE で知らせますか？", { okLabel: "送る", cancelLabel: "送らない" })) await shareText(await judgedMessage(pool, p, round, result, s));
    onChange();
  };

  return (
    <div className={`round ${overdue ? "overdue" : ""}`}>
      <div>
        第{round.seq}回 期限 <b>{formatDue(round.dueAt)}</b>
        {overdue && <span className="chip warn">期限切れ・判定待ち</span>}
      </div>
      {me.id === p.checkerId ? (
        <>
          <div className="row">
            <input type="number" inputMode="numeric" placeholder="点数（任意）" value={score} onChange={(e) => setScore(e.target.value)} />
            <input placeholder="メモ（任意）" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
          <div className="row">
            <button className="danger" disabled={busy} onClick={() => judge("fail")}>
              未達成
            </button>
            <button className="primary" disabled={busy} onClick={() => judge("pass")}>
              達成
            </button>
          </div>
        </>
      ) : me.id === p.doerId ? (
        <p className="hint">提出物（写真など）は LINE のトークで確認する人に送ってください。</p>
      ) : null}
    </div>
  );
}
