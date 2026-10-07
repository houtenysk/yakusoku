import { useSyncExternalStore } from "react";

// ブラウザ標準の alert / confirm / prompt の代わりに使うアプリ内ダイアログ。
// LINE 内ブラウザでは標準ダイアログに URL が出て見づらく、埋め込み表示では出ないこともあるため

type Dialog = {
  kind: "confirm" | "notice" | "text";
  title?: string;
  message?: string;
  text?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

let queue: Dialog[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function show(d: Omit<Dialog, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...d, resolve }];
    emit();
  });
}

function close(ok: boolean) {
  const [head, ...rest] = queue;
  queue = rest;
  emit();
  head?.resolve(ok);
}

export function confirmDialog(
  message: string,
  opts: { okLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return show({ kind: "confirm", message, ...opts });
}

export async function notify(message: string): Promise<void> {
  await show({ kind: "notice", message });
}

// コピーしてほしい文章などを、選択できる形で見せる
export async function showText(title: string, text: string, message?: string): Promise<void> {
  await show({ kind: "text", title, text, message });
}

export function DialogHost() {
  const d = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => queue[0] ?? null,
  );
  if (!d) return null;

  return (
    <div className="dialog-backdrop" onClick={() => d.kind !== "confirm" && close(false)}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {d.title && <h2>{d.title}</h2>}
        {d.message && <p className="dialog-message">{d.message}</p>}
        {d.text !== undefined && (
          <textarea className="dialog-text" readOnly value={d.text} onFocus={(e) => e.currentTarget.select()} />
        )}
        <div className="row dialog-actions">
          {d.kind === "confirm" && <button onClick={() => close(false)}>{d.cancelLabel ?? "キャンセル"}</button>}
          <button className={d.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
            {d.okLabel ?? (d.kind === "confirm" ? "OK" : "閉じる")}
          </button>
        </div>
      </div>
    </div>
  );
}
