import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database } from "sql.js";
import schema from "../../migrations/0001_init.sql?raw";
import app from "../worker/index";
import { App } from "../client/App";
import { confirmDialog } from "../client/dialog";
import { setDevUser } from "../client/platform";
import { createD1 } from "./d1";
import "../client/styles.css";

// お試し版：サーバー（src/worker）とデータベースをブラウザの中で動かし、
// 画面からの /api への通信をそこへつなぐ。データはこの端末のブラウザにだけ保存する

const STORAGE_KEY = "yakusoku.demo.db";

function load(): Uint8Array | null {
  try {
    const b64 = localStorage.getItem(STORAGE_KEY);
    if (!b64) return null;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function save(db: Database) {
  try {
    const bytes = db.export();
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    localStorage.setItem(STORAGE_KEY, btoa(bin));
  } catch {
    // 保存できない環境でも、開いている間は使える
  }
}

const NAMES: Record<string, string> = { taro: "たろう", hana: "はな", ken: "けん" };

async function main() {
  const SQL = await initSqlJs();
  const saved = load();
  const db = saved ? new SQL.Database(saved) : new SQL.Database();
  const env = { DB: createD1(db), DEV_AUTH: "1", LINE_CHANNEL_ID: "" };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("/api")) return realFetch(input, init);
    const res = await app.fetch(new Request(new URL(url, "https://demo.local"), init), env as never);
    if (init?.method && init.method !== "GET") save(db);
    return res;
  };

  if (!saved) {
    db.exec(schema);
    await seed();
    save(db);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App banner={<DemoBanner onReset={() => reset(db)} />} />
    </StrictMode>,
  );
}

async function reset(db: Database) {
  if (!(await confirmDialog("お試しデータを消して、最初の状態に戻しますか？", { okLabel: "戻す", danger: true }))) return;
  for (const t of ["ledger_entries", "rounds", "promises", "pool_members", "pools", "users"]) db.exec(`DROP TABLE ${t}`);
  db.exec(schema);
  await seed();
  save(db);
  setDevUser("taro");
  location.reload();
}

// サンプル：はなが幹事のプールに、たろうの「宿題」の約束（第1回は未達成で罰金が未払い）と、
// けんの「早起き」の約束（たろうの同意待ち）がある状態
async function seed() {
  const call = async (user: string, method: string, path: string, body?: unknown) => {
    const res = await window.fetch(`/api${path}`, {
      method,
      headers: { "X-Dev-User": user, "X-Dev-Name": encodeURIComponent(NAMES[user]!), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.json() as Promise<any>;
  };

  for (const u of Object.keys(NAMES)) await call(u, "GET", "/me");
  await call("hana", "PUT", "/me", { paypayId: "hana-paypay" });
  const { id: poolId } = await call("hana", "POST", "/pools", { name: "宿題サボり飲み会" });
  const pool = await call("hana", "GET", `/pools/${poolId}`);
  await call("taro", "POST", `/invites/${pool.inviteCode}/join`);
  await call("ken", "POST", `/invites/${pool.inviteCode}/join`);

  // 第1回の期限は直前の日曜 21:00（判定済み）、第2回は次の日曜
  const lastSunday = new Date();
  lastSunday.setDate(lastSunday.getDate() - (lastSunday.getDay() || 7));
  lastSunday.setHours(21, 0, 0, 0);

  const { id: homework } = await call("taro", "POST", `/pools/${poolId}/promises`, {
    title: "数学の宿題を出す",
    detail: "日曜21時までに解いた写真をトークに送る。60点未満は未達成",
    doerId: "taro",
    checkerId: "hana",
    penaltyAmount: 1000,
    cadence: "weekly",
    firstDueAt: lastSunday.toISOString(),
  });
  await call("hana", "POST", `/promises/${homework}/agree`);
  const detail = await call("hana", "GET", `/pools/${poolId}`);
  const round1 = detail.promises.find((p: any) => p.id === homework).rounds[0];
  await call("hana", "POST", `/rounds/${round1.id}/judge`, { result: "fail", score: 45, note: "赤点" });

  const nextMorning = new Date();
  nextMorning.setDate(nextMorning.getDate() + 1);
  nextMorning.setHours(7, 0, 0, 0);
  await call("ken", "POST", `/pools/${poolId}/promises`, {
    title: "毎朝7時に起きる",
    detail: "起きたら7:05までにトークでスタンプを送る",
    doerId: "ken",
    checkerId: "taro",
    penaltyAmount: 500,
    cadence: "weekly",
    firstDueAt: nextMorning.toISOString(),
  });
}

function DemoBanner({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="demo-banner">
      <div className="row">
        <b>やくそく お試し版</b>
        <span className="row demo-banner-actions">
          <button className="link small" onClick={() => setOpen(!open)}>
            {open ? "説明を閉じる" : "説明"}
          </button>
          <button className="link small" onClick={onReset}>
            最初からやり直す
          </button>
        </span>
      </div>
      {open && (
        <ul className="small">
          <li>友達3人（たろう・はな・けん）の役を、下の「表示するユーザー」で切り替えて試せます。</li>
          <li>たろうには宿題の罰金 ¥1,000 が未払いで残っています。帳簿から支払ってみてください。</li>
          <li>はなに切り替えると、幹事として受け取り確認や判定ができます。</li>
          <li>LINE への送信と PayPay の起動はしません。データはこのブラウザにだけ保存されます。</li>
        </ul>
      )}
    </div>
  );
}

main();
