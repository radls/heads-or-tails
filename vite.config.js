import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
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
  build: {
    target: ["es2020", "safari14"],
    sourcemap: false,
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
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
