import liff from "@line/liff";
import { notify, showText } from "./dialog";

// LINE（LIFF）に依存する処理をまとめる。VITE_DEV_AUTH=1 のときは LIFF を使わず、
// 画面上で選んだ開発用ユーザーとしてブラウザだけで動かす

export const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === "1";
// ブラウザだけで動くお試し版（src/demo）。DEV_AUTH と組み合わせて使う
export const DEMO = import.meta.env.VITE_DEMO === "1";
const LIFF_ID: string = import.meta.env.VITE_LIFF_ID ?? "";

export const DEV_USERS = [
  { id: "taro", name: "たろう" },
  { id: "hana", name: "はな" },
  { id: "ken", name: "けん" },
];

const DEV_USER_KEY = "yakusoku.devUser";

export function getDevUser(): string {
  try {
    return localStorage.getItem(DEV_USER_KEY) ?? DEV_USERS[0]!.id;
  } catch {
    return DEV_USERS[0]!.id;
  }
}

export function setDevUser(id: string) {
  try {
    localStorage.setItem(DEV_USER_KEY, id);
  } catch {
    // 保存できなくても今の画面では切り替わる
  }
}

// LIFF を初期化する。LINE の外で開かれてログインしていなければ LINE ログインへ移動する
export async function initPlatform(): Promise<void> {
  if (DEV_AUTH) return;
  if (!LIFF_ID) throw new Error("VITE_LIFF_ID が設定されていません");
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: location.href });
    // ログイン画面へ移動するまで待つ
    await new Promise(() => {});
  }
}

export function authHeaders(): Record<string, string> {
  if (DEV_AUTH) {
    const id = getDevUser();
    const name = DEV_USERS.find((u) => u.id === id)?.name ?? id;
    return { "X-Dev-User": id, "X-Dev-Name": encodeURIComponent(name) };
  }
  const token = liff.getIDToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 招待リンク。LINE ミニアプリとして開けるパーマネントリンクにする
export async function inviteUrl(code: string): Promise<string> {
  const endpoint = `${location.origin}/?invite=${encodeURIComponent(code)}`;
  // お試し版の招待リンクは見本（実際のアプリでは LINE ミニアプリのリンクになる）
  if (DEMO) return `https://miniapp.line.me/（LIFF ID）?invite=${encodeURIComponent(code)}`;
  if (DEV_AUTH) return endpoint;
  try {
    return await liff.permanentLink.createUrlBy(endpoint);
  } catch {
    return `https://liff.line.me/${LIFF_ID}?invite=${encodeURIComponent(code)}`;
  }
}

// LINE のトークへメッセージを送る（送り先は本人が選ぶ）。送れなかったらクリップボードにコピーする。
// 戻り値: "shared" 送信した / "copied" コピーした / "cancelled" 何もしなかった
export async function shareText(text: string): Promise<"shared" | "copied" | "cancelled"> {
  if (DEMO) {
    await showText("LINE に送るメッセージ", text, "お試し版では送信せず、送られる内容だけを表示します。");
    return "cancelled";
  }
  if (!DEV_AUTH && liff.isApiAvailable("shareTargetPicker")) {
    const res = await liff.shareTargetPicker([{ type: "text", text }]);
    return res ? "shared" : "cancelled";
  }
  if (await copyText(text)) {
    await notify("メッセージをコピーしました。LINE のトークに貼り付けて送ってください。");
    return "copied";
  }
  return "cancelled";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    await showText("コピーしてください", text);
    return false;
  }
}

// PayPay アプリを開く。外部アプリへの遷移は LINE 内ブラウザでは openWindow の external で行う。
// paypay:// で送金画面まで開けるかは公式には公開されていないため、実機での確認が必要
export function openPayPay() {
  if (DEMO) {
    void notify("お試し版では PayPay は開きません。実際のアプリでは、ここで PayPay アプリに切り替わります。");
    return;
  }
  const url = "paypay://";
  if (!DEV_AUTH && liff.isInClient()) {
    liff.openWindow({ url, external: true });
  } else {
    location.href = url;
  }
}
