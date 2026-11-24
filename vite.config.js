import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import { resolveBuildSha } from "./scripts/resolve-build-sha.js";

const root = dirname(fileURLToPath(import.meta.url));

function appVersion() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

function gitExec(args) {
  return execFileSync(args[0], args.slice(1), { encoding: "utf8" });
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/heads-or-tails/" : "/",
  plugins: [wasm()],
  // Top-level await (used by the Rapier WASM loader) needs Safari 15+ / iOS 15+.
  build: {
    target: ["es2022", "safari15", "chrome89", "firefox89"],
    sourcemap: false,
    chunkSizeWarningLimit: 650,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4180,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_SHA__: JSON.stringify(
      resolveBuildSha({
        env: process.env,
        root,
        exec: gitExec,
        realpath: realpathSync,
      }),
    ),
  },
  worker: { plugins: () => [wasm()] },
  test: {
    // Node can't load the ESM-integrated .wasm; tests use the same Rapier 0.19 core
    // from the compat build (WASM inlined), which needs init().
    alias: { "@dimforge/rapier3d": "@dimforge/rapier3d-compat" },
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
