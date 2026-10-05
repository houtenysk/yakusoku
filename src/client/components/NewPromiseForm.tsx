import { useState } from "react";
import type { Cadence, PoolDetail, User } from "../../shared/types";
import { MAX_PENALTY } from "../../shared/validation";
import { api } from "../api";
import { defaultDue, toLocalInput } from "../format";
import { agreeRequestMessage } from "../messages";
import { shareText } from "../platform";
import { useAction } from "../useAsync";

export function NewPromiseForm({ pool, me, onDone }: { pool: PoolDetail; me: User; onDone: () => void }) {
  const others = pool.members.filter((m) => m.id !== me.id);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [myRole, setMyRole] = useState<"doer" | "checker">("doer");
  const [partner, setPartner] = useState(others[0]?.id ?? "");
  const [penalty, setPenalty] = useState(1000);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [due, setDue] = useState(() => toLocalInput(defaultDue()));
  const { busy, run } = useAction();

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        await run(async () => {
          const input = {
            title,
            detail,
            doerId: myRole === "doer" ? me.id : partner,
            checkerId: myRole === "checker" ? me.id : partner,
            penaltyAmount: penalty,
            cadence,
            firstDueAt: new Date(due).toISOString(),
          };
          const { id } = await api.createPromise(pool.id, input);
          const fresh = await api.pool(pool.id);
          const created = fresh.promises.find((p) => p.id === id);
          if (created && confirm("相手に同意をお願いするメッセージを LINE で送りますか？")) {
            await shareText(await agreeRequestMessage(fresh, created));
          }
          onDone();
        });
      }}
    >
      <h2>約束を作る</h2>
      <label>
        約束の内容
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：数学の宿題を出す" maxLength={60} required />
      </label>
      <label>
        判定の基準（任意）
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="例：期限までに写真をトークに送る。60点未満は未達成" maxLength={500} />
      </label>
      <label>
        あなたは
        <select value={myRole} onChange={(e) => setMyRole(e.target.value as "doer" | "checker")}>
          <option value="doer">やる人</option>
          <option value="checker">確認する人</option>
        </select>
      </label>
      <label>
        {myRole === "doer" ? "確認する人" : "やる人"}
        <select value={partner} onChange={(e) => setPartner(e.target.value)}>
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        守れなかったときの罰金（円）
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PENALTY}
          value={penalty}
          onChange={(e) => setPenalty(Number(e.target.value))}
        />
      </label>
      <label>
        繰り返し
        <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
          <option value="weekly">毎週（判定すると次の週の回ができる）</option>
          <option value="once">1回きり</option>
        </select>
      </label>
      <label>
        {cadence === "weekly" ? "初回の期限" : "期限"}
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} required />
      </label>
      <p className="hint">罰金を払うのは「やる人」だけです。相手が同意すると約束が始まります。</p>
      <div className="row">
        <button type="button" onClick={onDone}>
          やめる
        </button>
        <button className="primary" disabled={busy || !title.trim() || !partner}>
          作成
        </button>
      </div>
    </form>
  );
}
