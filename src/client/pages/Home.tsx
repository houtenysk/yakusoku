import { useState } from "react";
import { api } from "../api";
import { yen } from "../format";
import { navigate } from "../router";
import { useAction, useAsync } from "../useAsync";

export function HomePage() {
  const { data: me, error } = useAsync(() => api.me(), []);
  const [name, setName] = useState("");
  const { busy, run } = useAction();

  if (error) return <p className="error">{error.message}</p>;
  if (!me) return <p className="muted">読み込み中…</p>;

  const owed = me.pools.reduce((s, p) => s + p.myOwed, 0);

  return (
    <>
      <h1>{me.user.displayName} さん</h1>
      {owed > 0 && (
        <div className="banner warn">
          未払いの罰金が <b>{yen(owed)}</b> あります。プールを開いて支払ってください。
        </div>
      )}
      {!me.user.paypayId && (
        <div className="banner">
          幹事になる人は <a onClick={() => navigate({ page: "settings" })}>設定</a> で PayPay ID を登録しておくと、罰金を受け取りやすくなります。
        </div>
      )}

      <h2>プール</h2>
      {me.pools.length === 0 && <p className="muted">まだプールがありません。作るか、友達の招待リンクから参加してください。</p>}
      <ul className="list">
        {me.pools.map((p) => (
          <li key={p.id} className="card clickable" onClick={() => navigate({ page: "pool", id: p.id })}>
            <div className="row">
              <b>{p.name}</b>
              <span className="muted">{p.memberCount}人</span>
            </div>
            {p.holderId === me.user.id && <span className="chip">幹事</span>}
            {p.myOwed > 0 && <span className="chip warn">未払い {yen(p.myOwed)}</span>}
          </li>
        ))}
      </ul>

      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          await run(async () => {
            const { id } = await api.createPool(name);
            navigate({ page: "pool", id });
          });
        }}
      >
        <label>
          新しいプールを作る（あなたが幹事になります）
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：宿題サボり飲み会" maxLength={40} />
        </label>
        <button className="primary" disabled={busy || !name.trim()}>
          作成
        </button>
      </form>
    </>
  );
}
