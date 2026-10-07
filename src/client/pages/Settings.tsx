import { notify } from "../dialog";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useAction, useAsync } from "../useAsync";

export function SettingsPage() {
  const { data: me, error, reload } = useAsync(() => api.me(), []);
  const [paypayId, setPaypayId] = useState("");
  const { busy, run } = useAction();

  useEffect(() => {
    if (me) setPaypayId(me.user.paypayId ?? "");
  }, [me]);

  if (error) return <p className="error">{error.message}</p>;
  if (!me) return <p className="muted">読み込み中…</p>;

  return (
    <>
      <h1>設定</h1>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.updateMe(paypayId))) {
            reload();
            await notify("保存しました");
          }
        }}
      >
        <label>
          PayPay ID
          <input value={paypayId} onChange={(e) => setPaypayId(e.target.value)} placeholder="未登録" maxLength={50} />
        </label>
        <p className="hint">
          幹事になったとき、罰金を払う人の画面に表示されます。PayPay アプリの「アカウント」から確認できます。
          相手が ID で検索できるよう、PayPay 側で「PayPay IDでの検索を許可」をオンにしておいてください。
        </p>
        <button className="primary" disabled={busy}>
          保存
        </button>
      </form>
    </>
  );
}
