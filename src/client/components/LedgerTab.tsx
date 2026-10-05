import { useState } from "react";
import type { LedgerEntry, PoolDetail, User } from "../../shared/types";
import { api } from "../api";
import { formatDue, yen } from "../format";
import { copyText, openPayPay } from "../platform";
import { useAction } from "../useAsync";

const STATUS_LABEL: Record<LedgerEntry["status"], string> = {
  unpaid: "未払い",
  reported: "確認待ち",
  confirmed: "受け取り済み",
  void: "取り消し",
};

type Props = { pool: PoolDetail; me: User; onChange: () => void };

export function LedgerTab({ pool, me, onChange }: Props) {
  const [paying, setPaying] = useState<LedgerEntry | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const isHolder = pool.holderId === me.id;
  const name = (id: string) => pool.members.find((m) => m.id === id)?.displayName ?? "?";

  if (paying) {
    return (
      <PaySheet
        pool={pool}
        entry={paying}
        onClose={() => {
          setPaying(null);
          onChange();
        }}
      />
    );
  }

  return (
    <>
      <p className="hint">
        罰金はすぐ PayPay で幹事に送っても、ツケにして飲み会でまとめて払っても OK。アプリはお金を預からず、記録だけします。
      </p>
      {isHolder &&
        (addingExpense ? (
          <ExpenseForm poolId={pool.id} onDone={() => (setAddingExpense(false), onChange())} />
        ) : (
          <button className="wide" onClick={() => setAddingExpense(true)}>
            ＋ 支出を記録（飲み会代など）
          </button>
        ))}
      {pool.ledger.length === 0 && <p className="muted">まだ記録はありません。</p>}
      <ul className="list">
        {pool.ledger.map((e) => (
          <EntryRow key={e.id} pool={pool} me={me} entry={e} name={name} onPay={() => setPaying(e)} onChange={onChange} />
        ))}
      </ul>
    </>
  );
}

function EntryRow({
  pool,
  me,
  entry: e,
  name,
  onPay,
  onChange,
}: Props & { entry: LedgerEntry; name: (id: string) => string; onPay: () => void }) {
  const { busy, run } = useAction();
  const isHolder = pool.holderId === me.id;
  const promise = pool.promises.find((p) => p.id === e.promiseId);
  const canVoid =
    e.kind === "penalty"
      ? (isHolder || promise?.checkerId === me.id) && (e.status === "unpaid" || e.status === "reported")
      : isHolder && e.status !== "void";

  return (
    <li className={`card ${e.status === "void" ? "voided" : ""}`}>
      <div className="row">
        <span>
          {e.kind === "penalty" ? `${name(e.userId)} → プール` : "プールから支出"}
          <b className="amount">{e.kind === "expense" ? `−${yen(e.amount)}` : yen(e.amount)}</b>
        </span>
        <span className={`chip ${e.status}`}>{e.kind === "expense" && e.status === "confirmed" ? "支出" : STATUS_LABEL[e.status]}</span>
      </div>
      <div className="muted small">
        {e.memo} ・ {formatDue(e.createdAt)}
      </div>
      <div className="row actions">
        {e.kind === "penalty" && e.userId === me.id && e.status === "unpaid" && (
          <button className="primary" onClick={onPay}>
            支払う
          </button>
        )}
        {isHolder && e.kind === "penalty" && (e.status === "reported" || e.status === "unpaid") && (
          <button
            className={e.status === "reported" ? "primary" : ""}
            disabled={busy}
            onClick={() => run(() => api.confirm(e.id)).then(onChange)}
          >
            {e.status === "reported" ? "受け取った" : "受け取った（現金など）"}
          </button>
        )}
        {canVoid && (
          <button
            className="link small"
            disabled={busy}
            onClick={() => confirm("この記録を取り消しますか？") && run(() => api.voidEntry(e.id)).then(onChange)}
          >
            取り消す
          </button>
        )}
      </div>
    </li>
  );
}

// 罰金を払う導線：金額と送り先をコピー → PayPay を開く → 戻って「支払った」
function PaySheet({ pool, entry, onClose }: { pool: PoolDetail; entry: LedgerEntry; onClose: () => void }) {
  const holder = pool.members.find((m) => m.id === pool.holderId);
  const { busy, run } = useAction();

  return (
    <div className="card pay">
      <h2>罰金を払う</h2>
      <p className="big">{yen(entry.amount)}</p>
      <p className="muted small">{entry.memo}</p>
      <p>
        送り先：<b>{holder?.displayName}</b>（幹事）
      </p>
      {holder?.paypayId ? (
        <ol className="steps">
          <li>
            PayPay ID <code>{holder.paypayId}</code>{" "}
            <button className="link" onClick={() => copyText(holder.paypayId!)}>
              コピー
            </button>
          </li>
          <li>
            <button className="primary" onClick={openPayPay}>
              PayPay を開く
            </button>
            <div className="hint">「送る」→ ID で検索して {yen(entry.amount)} を送ってください</div>
          </li>
          <li>送ったら下の「支払った」を押す</li>
        </ol>
      ) : (
        <p className="banner">
          幹事が PayPay ID を登録していません。LINE で送金リンクを送るか、飲み会で現金で払ってください。
        </p>
      )}
      <div className="row">
        <button onClick={onClose}>ツケにする（あとで払う）</button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            if (await run(() => api.report(entry.id))) onClose();
          }}
        >
          支払った
        </button>
      </div>
    </div>
  );
}

function ExpenseForm({ poolId, onDone }: { poolId: string; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const { busy, run } = useAction();
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api.addExpense(poolId, Number(amount), memo))) onDone();
      }}
    >
      <label>
        金額（円）
        <input type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label>
        メモ
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例：10月の飲み会" maxLength={500} />
      </label>
      <div className="row">
        <button type="button" onClick={onDone}>
          やめる
        </button>
        <button className="primary" disabled={busy || !amount}>
          記録
        </button>
      </div>
    </form>
  );
}
