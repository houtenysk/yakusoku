import { api } from "../api";
import { navigate } from "../router";
import { useAction, useAsync } from "../useAsync";

export function InvitePage({ code }: { code: string }) {
  const { data, error } = useAsync(() => api.invite(code), [code]);
  const { busy, run } = useAction();

  if (error) return <p className="error">{error.message}</p>;
  if (!data) return <p className="muted">読み込み中…</p>;

  return (
    <div className="card">
      <h1>{data.name}</h1>
      <p>
        幹事：{data.holderName}・{data.memberCount}人
      </p>
      {data.joined ? (
        <button className="primary" onClick={() => navigate({ page: "pool", id: data.id }, true)}>
          プールを開く
        </button>
      ) : (
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const { id } = await api.join(code);
              navigate({ page: "pool", id }, true);
            })
          }
        >
          参加する
        </button>
      )}
    </div>
  );
}
