import { useEffect, useState } from "react";
import { DEMO } from "./platform";

export type Route =
  | { page: "home" }
  | { page: "settings" }
  | { page: "pool"; id: string }
  | { page: "invite"; code: string };

function parse(search: string): Route {
  const q = new URLSearchParams(search);
  const invite = q.get("invite");
  if (invite) return { page: "invite", code: invite };
  const pool = q.get("pool");
  if (pool) return { page: "pool", id: pool };
  if (q.get("page") === "settings") return { page: "settings" };
  return { page: "home" };
}

function toSearch(route: Route): string {
  switch (route.page) {
    case "home":
      return "/";
    case "settings":
      return "/?page=settings";
    case "pool":
      return `/?pool=${encodeURIComponent(route.id)}`;
    case "invite":
      return `/?invite=${encodeURIComponent(route.code)}`;
  }
}

const listeners = new Set<() => void>();
// お試し版は埋め込み表示で URL を書き換えられないので、画面の中だけで覚えておく
let memorySearch = "";
const currentSearch = () => (DEMO ? memorySearch : location.search);

export function navigate(route: Route, replace = false) {
  if (DEMO) memorySearch = toSearch(route).slice(1);
  else history[replace ? "replaceState" : "pushState"](null, "", toSearch(route));
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(currentSearch()));
  useEffect(() => {
    const update = () => setRoute(parse(currentSearch()));
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return route;
}
