import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { User } from "../shared/types";
import { upsertUser } from "./db";

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User };
};

type LineProfile = { sub: string; name: string; picture: string | null; exp: number };

// 同じ isolate 内では検証済みの ID トークンを使い回し、LINE への問い合わせを減らす
const verified = new Map<string, LineProfile>();

async function verifyIdToken(idToken: string, channelId: string): Promise<LineProfile | null> {
  const cached = verified.get(idToken);
  if (cached && cached.exp * 1000 > Date.now()) return cached;

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { sub: string; name?: string; picture?: string; exp: number };
  const profile = { sub: body.sub, name: body.name ?? "名無し", picture: body.picture ?? null, exp: body.exp };
  if (verified.size > 1000) verified.clear();
  verified.set(idToken, profile);
  return profile;
}

// LIFF の ID トークン（Authorization: Bearer）でユーザーを特定する。
// DEV_AUTH=1 のときだけ X-Dev-User / X-Dev-Name ヘッダーでのログインを許可する
export const auth = createMiddleware<AppEnv>(async (c, next) => {
  let profile: { sub: string; name: string; picture: string | null } | null = null;

  const devUser = c.req.header("X-Dev-User");
  if (c.env.DEV_AUTH === "1" && devUser) {
    const name = c.req.header("X-Dev-Name");
    profile = { sub: devUser, name: name ? decodeURIComponent(name) : devUser, picture: null };
  } else {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token && c.env.LINE_CHANNEL_ID) profile = await verifyIdToken(token, c.env.LINE_CHANNEL_ID);
  }

  if (!profile) throw new HTTPException(401, { message: "ログインが必要です" });
  c.set("user", await upsertUser(c.env.DB, profile.sub, profile.name, profile.picture));
  await next();
});
