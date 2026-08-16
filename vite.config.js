import { defineConfig } from "vite";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync, cpSync, readFileSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));

// Discover game slugs (each games/<slug>/index.html is a page)
const gamesDir = resolve(root, "games");
const slugs = existsSync(gamesDir)
  ? readdirSync(gamesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(resolve(gamesDir, d.name, "index.html")))
      .map((d) => d.name)
  : [];

const input = { main: resolve(root, "index.html") };
for (const slug of slugs) input[`game-${slug}`] = resolve(gamesDir, slug, "index.html");

// Vite only bundles assets it can statically see. Our games reference images via
// dynamic strings (background-image / src built at runtime), so copy each
// games/<slug>/assets folder into dist verbatim after the build.
function copyGameAssets() {
  return {
    name: "copy-game-assets",
    apply: "build",
    closeBundle() {
      for (const slug of slugs) {
        const src = resolve(gamesDir, slug, "assets");
        // "_" で始まるものは作業用（_art-brief の元データ、_retired-realistic の旧素材など）。
        // 公開物に混ぜると dist が数MB単位で膨らむので除外する。
        if (existsSync(src)) cpSync(src, resolve(root, "dist/games", slug, "assets"), {
          recursive: true,
          filter: (s) => !basename(s).startsWith("_"),
        });
      }
    },
  };
}

// 共通部品（src/shared/）を、各ページ内のマーカーコメントの位置へインライン展開する。
// dev サーバでもビルドでも同じように効く。ゲームHTMLは配布時も1ファイル自己完結のまま。
//   <!-- @shared:base-css --> → base-mobile.css を <style> で
//   <!-- @shared:icons -->    → icons.svg（SVGスプライト）をそのまま
//   <!-- @shared:confirm -->  → confirm.js（確認シート/トースト）を <script> で
function injectShared() {
  const read = (f) => readFileSync(resolve(root, "src/shared", f), "utf8");
  return {
    name: "inject-shared",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        // split/join は1パス置換なので、展開内容にマーカー文字列が含まれても再帰しない
        return html
          .split("<!-- @shared:base-css -->").join(`<style>\n${read("base-mobile.css")}\n</style>`)
          .split("<!-- @shared:icons -->").join(read("icons.svg"))
          .split("<!-- @shared:confirm -->").join(`<script>\n${read("confirm.js")}\n</script>`);
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [injectShared(), copyGameAssets()],
  build: {
    target: "esnext",
    rollupOptions: { input },
  },
});
