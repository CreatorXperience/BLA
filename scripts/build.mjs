#!/usr/bin/env node
/**
 * Production build. Bundles the API server and the worker process with
 * esbuild, leaving node_modules external (resolved at runtime by Node).
 * Path aliases from tsconfig are resolved during bundling.
 */
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

rmSync(path.join(root, "dist"), { recursive: true, force: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
  tsconfig: path.join(root, "tsconfig.json"),
};

await Promise.all([
  build({ ...common, entryPoints: [path.join(root, "src/server.ts")], outfile: path.join(root, "dist/server.js") }),
  build({ ...common, entryPoints: [path.join(root, "src/workers/worker.ts")], outfile: path.join(root, "dist/workers/worker.js") }),
]);
