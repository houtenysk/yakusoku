import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ブラウザだけで動くお試し版のビルド。1 つの JS と CSS にまとめ、scripts/build-demo.mjs で 1 枚の HTML にする
export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_DEV_AUTH": JSON.stringify("1"),
    "import.meta.env.VITE_DEMO": JSON.stringify("1"),
  },
  build: {
    outDir: "dist-demo",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: "src/demo/main.tsx",
      output: { entryFileNames: "demo.js", assetFileNames: "demo.[ext]", inlineDynamicImports: true },
    },
  },
});
