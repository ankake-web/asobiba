import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));

// Auto-discover every page so adding a game = drop a folder under games/<slug>/index.html
const input = { main: resolve(root, "index.html") };
const gamesDir = resolve(root, "games");
if (existsSync(gamesDir)) {
  for (const slug of readdirSync(gamesDir, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    const page = resolve(gamesDir, slug.name, "index.html");
    if (existsSync(page)) input[`game-${slug.name}`] = page;
  }
}

export default defineConfig({
  // Relative base so the built site works under any path (custom domain or
  // https://<user>.github.io/<repo>/) without rebuilding.
  base: "./",
  build: {
    // esnext: keep top-level await as-is (uma-race awaits Firebase init at module
    // top level). All target browsers are modern mobile, so no downleveling needed.
    target: "esnext",
    rollupOptions: { input },
  },
});
