/**
 * Copies Monaco's prebuilt AMD bundle into `dist/vs`.
 *
 * Packaging ships only a builtin plugin's `dist/` and `skills/` directories
 * (`apps/server/scripts/copy-builtin-plugins.ts`), so anything the plugin
 * needs on disk at runtime has to be inside `dist/`. The server serves this
 * directory over a `files.createPreview` URL and the frontend loads Monaco
 * from it; without the copy, a released BB has no Monaco to serve.
 *
 * Run after `build-official-plugins.mjs`, which clears `dist/` first.
 */
import { cp, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(pluginRoot, "package.json"));

// `exports` rewrites every subpath to ./esm/vs/*, so resolve the package root
// (whose `require` condition is min/vs/index.js) and take its directory.
const sourceDir = path.dirname(require.resolve("monaco-editor"));
const targetDir = path.join(pluginRoot, "dist", "vs");

const loader = path.join(sourceDir, "loader.js");
try {
  await stat(loader);
} catch {
  throw new Error(
    `monaco-editor's AMD build is missing (${loader}); run npm/pnpm install first`,
  );
}

await mkdir(path.dirname(targetDir), { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
console.log(`monaco: staged ${sourceDir} -> ${targetDir}`);
