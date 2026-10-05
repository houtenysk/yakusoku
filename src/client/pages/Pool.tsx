import { useState } from "react";
import type { PoolDetail, User } from "../../shared/types";
import { api } from "../api";
import { LedgerTab } from "../components/LedgerTab";
import { NewPromiseForm } from "../components/NewPromiseForm";
import { PromiseCard } from "../components/PromiseCard";
import { yen } from "../format";
import { inviteMessage } from "../messages";
import { shareText } from "../platform";
import { useAsync } from "../useAsync";

type Tab = "promises" | "ledger" | "members";

export function PoolPage({ id }: { id: string }) {
  const { data, error, reload } = useAsync(() => Promise.all([api.pool(id), api.me()]), [id]);
  const [tab, setTab] = useState<Tab>("promises");
  const [creating, setCreating] = useState(false);

  if (error) return <p className="error">{error.message}</p>;
  if (!data) return <p className="muted">読み込み中…</p>;
  const [pool, me] = data;
  const holder = pool.members.find((m) => m.id === pool.holderId);
  const mine = pool.balance.members.find((m) => m.userId === me.user.id);
  const myUnpaid = (mine?.unpaid ?? 0) + (mine?.reported ?? 0);

  return (
    <>
      <h1>{pool.name}</h1>
      <div className="stats">
        <div>
          <span className="muted">幹事の手元</span>
          <b>{yen(pool.balance.cashOnHand)}</b>
        </div>
        <div>
          <span className="muted">未回収</span>
          <b>{yen(pool.balance.outstanding)}</b>
        </div>
        <div>
          <span className="muted">幹事</span>
          <b>{holder?.displayName ?? "?"}</b>
        </div>
      </div>
      {myUnpaid > 0 && (
        <div className="banner warn clickable" onClick={() => setTab("ledger")}>
          あなたの未払い：<b>{yen(myUnpaid)}</b>（帳簿から支払えます）
        </div>
      )}

      <nav className="tabs">
        {(
          [
            ["promises", "約束"],
            ["ledger", "帳簿"],
            ["members", "メンバー"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "promises" && (
        <>
          {creating ? (
            <NewPromiseForm
              pool={pool}
              me={me.user}
              onDone={() => {
                setCreating(false);
                reload();
              }}
            />
          ) : (
            <button className="primary wide" onClick={() => setCreating(true)} disabled={pool.members.length < 2}>
              ＋ 約束を作る
            </button>
          )}
          {pool.members.length < 2 && <p className="hint">約束を作るには、まず友達をメンバーに招待してください。</p>}
          {pool.promises.length === 0 && !creating && <p className="muted">まだ約束はありません。</p>}
          {pool.promises.map((p) => (
            <PromiseCard key={p.id} pool={pool} promise={p} me={me.user} onChange={reload} />
          ))}
        </>
      )}

      {tab === "ledger" && <LedgerTab pool={pool} me={me.user} onChange={reload} />}

      {tab === "members" && <MembersTab pool={pool} />}
    </>
  );
}

function MembersTab({ pool }: { pool: PoolDetail }) {
  return (
    <>
      <button className="primary wide" onClick={async () => shareText(await inviteMessage(pool))}>
        LINE で友達を招待
      </button>
      <ul className="list">
        {pool.members.map((m: User) => {
          const b = pool.balance.members.find((x) => x.userId === m.id);
          return (
            <li key={m.id} className="card">
              <div className="row">
                <b>{m.displayName}</b>
                {m.id === pool.holderId && <span className="chip">幹事</span>}
              </div>
              <div className="muted small">
                支払い済み {yen(b?.paid ?? 0)}・未払い {yen((b?.unpaid ?? 0) + (b?.reported ?? 0))}
                {m.id === pool.holderId && !m.paypayId && "・PayPay ID 未登録"}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
