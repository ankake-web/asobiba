import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync, cpSync } from "node:fs";

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
        if (existsSync(src)) cpSync(src, resolve(root, "dist/games", slug, "assets"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [copyGameAssets()],
  build: {
    target: "esnext",
    rollupOptions: { input },
  },
});
