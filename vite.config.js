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
        // hero-tile.webp はハブの <img src> から静的に参照されるので Vite が
        // ハッシュ付きで dist/assets/ にバンドルずみ。ここでコピーすると同じ絵が
        // 2つのURLで二重配信される（実測 13枚 236KB の死に荷物）ので除外する。
        // ⚠ hero.jpg のほうは rules.js が実行時に文字列で組み立てるため Vite からは見えない。こちらは必要。
        const DEAD = new Set(["hero-tile.webp"]);
        if (existsSync(src)) cpSync(src, resolve(root, "dist/games", slug, "assets"), {
          recursive: true,
          filter: (s) => !basename(s).startsWith("_") && !DEAD.has(basename(s)),
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
//   <!-- @shared:online -->   → online.js（Firebase部屋。window.AsobibaOnline）を <script type="module"> で
//                               ※ ゲーム本体も <script type="module"> にしてこのマーカーの後ろに置く
//   <!-- @shared:cards -->    → cards.js（トランプ描画。window.AsobibaCards）を <script> で
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
          .split("<!-- @shared:confirm -->").join(`<script>\n${read("confirm.js")}\n</script>`)
          .split("<!-- @shared:online -->").join(`<script type="module">\n${read("online.js")}\n</script>`)
          .split("<!-- @shared:cards -->").join(`<script>\n${read("cards.js")}\n</script>`);
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
