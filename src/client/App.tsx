import { useEffect, useState, type ReactNode } from "react";
import { DialogHost } from "./dialog";
import { DEMO, DEV_AUTH, DEV_USERS, getDevUser, initPlatform, setDevUser } from "./platform";
import { navigate, useRoute } from "./router";
import { HomePage } from "./pages/Home";
import { InvitePage } from "./pages/Invite";
import { PoolPage } from "./pages/Pool";
import { SettingsPage } from "./pages/Settings";

// banner: お試し版の案内など、画面の一番上に出すもの
export function App({ banner }: { banner?: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  // 開発用ユーザーを切り替えたら画面ごと作り直す
  const [devUser, setDevUserState] = useState(getDevUser);
  const route = useRoute();

  useEffect(() => {
    initPlatform().then(
      () => setReady(true),
      (e: Error) => setInitError(e.message),
    );
  }, []);

  if (initError) return <div className="screen center">起動できませんでした：{initError}</div>;
  if (!ready) return <div className="screen center muted">読み込み中…</div>;

  return (
    <div className="screen" key={devUser}>
      {banner}
      {DEV_AUTH && (
        <div className="devbar">
          <label htmlFor="dev-user">{DEMO ? "表示するユーザー" : "開発用ユーザー"}</label>
          <select
            id="dev-user"
            value={devUser}
            onChange={(e) => {
              setDevUser(e.target.value);
              setDevUserState(e.target.value);
            }}
          >
            {DEV_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <header className="topbar">
        {route.page !== "home" ? (
          <button className="link" onClick={() => navigate({ page: "home" })}>
            ‹ ホーム
          </button>
        ) : (
          <span className="brand">やくそく</span>
        )}
        {route.page !== "settings" && (
          <button className="link" onClick={() => navigate({ page: "settings" })}>
            設定
          </button>
        )}
      </header>
      <main>
        {route.page === "home" && <HomePage />}
        {route.page === "settings" && <SettingsPage />}
        {route.page === "pool" && <PoolPage id={route.id} />}
        {route.page === "invite" && <InvitePage code={route.code} />}
      </main>
      <DialogHost />
    </div>
  );
}
