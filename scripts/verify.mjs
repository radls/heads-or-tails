import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const url = "http://127.0.0.1:4180/heads-or-tails/";
const node = process.execPath;

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: project,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function killPort(port) {
  spawnSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
}

async function waitFor(urlToProbe, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error("preview exited before it was ready");
    try {
      const response = await fetch(urlToProbe);
      if (response.ok) return;
    } catch {
      /* still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${urlToProbe}`);
}

run(join(project, "node_modules/.bin/vitest"), ["run"]);
run(join(project, "node_modules/.bin/vite"), ["build"], { GITHUB_PAGES: "true" });

killPort(4180);
const child = spawn(node, [join(project, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "4180", "--strictPort"], {
  cwd: project,
  env: { ...process.env, GITHUB_PAGES: "true" },
  detached: true,
  stdio: "inherit",
});

function stop() {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already stopped */
    }
  }
}

process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(1);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(1);
});

try {
  await waitFor(url, child);
  run(node, [join(project, "e2e/flip-1000.mjs")], { HOT_URL: url });
} finally {
  stop();
}
