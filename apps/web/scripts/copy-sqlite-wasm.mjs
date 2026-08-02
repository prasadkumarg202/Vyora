/**
 * Copies sqlite-wasm into public/sqlite/ before a build or dev run.
 *
 * Why the assets are served statically instead of imported:
 * sqlite-wasm's OPFS VFS spawns its own proxy worker as
 * `sqlite3-opfs-async-proxy.js?vfs=opfs`. Webpack rewrites that worker URL and
 * drops the query string, so the proxy boots without its argument and throws
 * "Expecting vfs=opfs|opfs-wl URL argument for this worker". Serving the files
 * untouched keeps sqlite-wasm's own relative resolution intact.
 *
 * Why copied rather than committed:
 * a vendored copy silently drifts from the version in package.json. This runs
 * from node_modules every time, so the served wasm is always the installed one.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Resolve through the package itself so pnpm's layout does not matter.
const pkgJson = require.resolve("@sqlite.org/sqlite-wasm/package.json");
const dist = join(dirname(pkgJson), "dist");
const out = join(process.cwd(), "public", "sqlite");

const FILES = [
  "index.mjs",
  // The OPFS async proxy — sqlite-wasm loads this itself, relative to index.mjs.
  "sqlite3-opfs-async-proxy.js",
  "sqlite3.wasm",
];

mkdirSync(out, { recursive: true });
for (const f of FILES) {
  copyFileSync(join(dist, f), join(out, f));
}

const { version } = require("@sqlite.org/sqlite-wasm/package.json");
console.log(`sqlite-wasm ${version} -> public/sqlite/ (${FILES.length} files)`);
