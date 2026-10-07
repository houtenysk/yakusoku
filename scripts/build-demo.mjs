// dist-demo の JS と CSS を 1 枚の HTML（dist-demo/yakusoku-demo.html）にまとめる
import { readFileSync, writeFileSync } from "node:fs";

const js = readFileSync("dist-demo/demo.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync("dist-demo/demo.css", "utf8").replace(/<\/style/gi, "<\\/style");

const html = `<title>やくそく</title>
<style>${css}</style>
<div id="root"><div class="screen center muted">読み込み中…</div></div>
<script type="module">${js}</script>
`;
writeFileSync("dist-demo/yakusoku-demo.html", html);
console.log(`dist-demo/yakusoku-demo.html ${(html.length / 1024).toFixed(0)} KB`);
