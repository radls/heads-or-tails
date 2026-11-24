import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const URL = process.env.HOT_URL || "http://127.0.0.1:4180/heads-or-tails/";
const COINS = ["penny", "nickel", "dime", "quarter", "half", "dollar", "house"];
const CHROME_ARGS = [
  "--no-sandbox",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function round(n, digits = 4) {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

async function swipe(page, x, y, dx, dy) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

const errors = [];
const failures = [];
const report = {
  pass: false,
  url: URL,
  total: 0,
  heads: 0,
  tails: 0,
  headsShare: 0,
  forced: 0,
  perCoin: {},
  settleMs: {},
  simSeconds: {},
  maxSimSeconds: 0,
  fps: 0,
  consoleErrors: [],
  failures: [],
};

let browser;
try {
  mkdirSync("evidence", { recursive: true });
  browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: CHROME_ARGS,
  });

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await phone.newPage();
  page.setDefaultTimeout(20000);
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    errors.push(String(error));
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__hot && window.__hot.state() === "idle", null, { timeout: 60000 });

  const batch = await page.evaluate(async () => {
    const coins = ["penny", "nickel", "dime", "quarter", "half", "dollar", "house"];
    const counts = { penny: 143, nickel: 143, dime: 143, quarter: 143, half: 143, dollar: 143, house: 142 };
    window.__hot.setFast(true);
    const perCoin = {};
    const settleMs = [];
    const simSeconds = [];
    let forced = 0;
    let heads = 0;
    let tails = 0;
    for (const key of coins) {
      perCoin[key] = { heads: 0, tails: 0 };
      await window.__hot.selectCoin(key);
      for (let i = 0; i < counts[key]; i += 1) {
        const power = 0.22 + ((i * 17 + key.length) % 78) / 100;
        const result = await window.__hot.flip({ power });
        perCoin[key][result.face] += 1;
        if (result.face === "heads") heads += 1;
        else if (result.face === "tails") tails += 1;
        if (result.forced) forced += 1;
        settleMs.push(result.settleMs);
        simSeconds.push(result.simSeconds);
      }
    }
    window.__hot.setFast(false);
    return {
      heads,
      tails,
      forced,
      perCoin,
      settleMs,
      simSeconds,
      stats: window.__hot.stats(),
    };
  });

  const total = batch.heads + batch.tails;
  const share = total ? batch.heads / total : 0;
  const sims = [...batch.simSeconds].sort((a, b) => a - b);
  const walls = [...batch.settleMs].sort((a, b) => a - b);
  report.total = total;
  report.heads = batch.heads;
  report.tails = batch.tails;
  report.headsShare = round(share);
  report.forced = batch.forced;
  report.perCoin = batch.perCoin;
  report.maxSimSeconds = round(sims[sims.length - 1] || 0, 4);
  report.simSeconds = {
    p50: round(percentile(sims, 50), 4),
    p90: round(percentile(sims, 90), 4),
    p99: round(percentile(sims, 99), 4),
    max: report.maxSimSeconds,
  };
  report.settleMs = {
    p50: round(percentile(walls, 50), 1),
    p90: round(percentile(walls, 90), 1),
    p99: round(percentile(walls, 99), 1),
  };

  if (total !== 1000) failures.push(`total ${total}`);
  if (batch.forced !== 0) failures.push(`forced ${batch.forced}`);
  if (!(share >= 0.45 && share <= 0.55)) failures.push(`heads share ${share}`);
  if (!batch.stats || batch.stats.total !== 1000) failures.push(`stats total ${batch.stats && batch.stats.total}`);
  for (const key of COINS) {
    const tally = batch.perCoin[key];
    if (!tally || tally.heads + tally.tails < 140) failures.push(`coin ${key} under-sampled`);
  }

  const box = await page.locator("#view").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  for (const key of COINS) {
    await page.evaluate((coin) => window.__hot.selectCoin(coin), key);
    await page.waitForFunction((coin) => {
      const name = document.getElementById("coin-name");
      return window.__hot.state() === "idle" && name && name.textContent.length > 0 && document.getElementById(`coin-${coin}`)?.classList.contains("is-active");
    }, key);
    await page.screenshot({ path: `evidence/phone-${key}-idle.png` });
  }

  await swipe(page, cx, cy + 80, 0, -240);
  await page.waitForFunction(() => {
    const state = window.__hot.state();
    return state === "flying" || state === "settling";
  });
  await page.waitForTimeout(360);
  await page.screenshot({ path: "evidence/phone-midair.png" });
  await page.waitForFunction(() => window.__hot.state() === "idle", null, { timeout: 15000 });
  await page.waitForFunction(() => /HEADS|TAILS/.test(document.getElementById("result").textContent || ""));
  await page.waitForTimeout(420);
  await page.screenshot({ path: "evidence/phone-result.png" });

  await page.mouse.click(cx, box.y + box.height * 0.82);
  await page.waitForFunction(() => {
    const state = window.__hot.state();
    return state === "flying" || state === "settling";
  });
  await page.waitForFunction(() => window.__hot.state() === "idle", null, { timeout: 15000 });

  await page.mouse.click(cx, cy);
  await page.waitForFunction(() => window.__hot.state() === "inspect");
  await page.waitForTimeout(700);
  await page.screenshot({ path: "evidence/phone-inspect.png" });
  await page.click("#done-btn");
  await page.waitForFunction(() => window.__hot.state() === "idle");

  await page.click("#menu-btn");
  await page.waitForSelector("#version", { state: "visible" });
  const version = (await page.textContent("#version"))?.trim() || "";
  if (!/^v1\.0\.0 · [0-9a-f]{7}$/i.test(version)) failures.push(`version text: ${version}`);
  await page.screenshot({ path: "evidence/phone-menu.png" });
  await page.screenshot({ path: "evidence/phone-coins.png" });
  await page.click('[data-tab="history"]');
  await page.screenshot({ path: "evidence/phone-history.png" });
  await page.click('[data-tab="settings"]');
  await page.screenshot({ path: "evidence/phone-settings.png" });
  await page.click('[data-tab="about"]');
  const about = await page.textContent("#panel-about");
  if (!about?.includes("Coin designs: public-domain U.S. Mint designs; images via Wikimedia Commons (see ASSETS.md)")) {
    failures.push("about credits missing");
  }
  await page.click("#menu-btn");

  report.fps = await page.evaluate(async () => {
    let frames = 0;
    const start = performance.now();
    const count = () => {
      frames += 1;
      if (performance.now() - start < 5000) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    await window.__hot.flip({ power: 0.62 });
    await window.__hot.flip({ power: 0.4 });
    while (performance.now() - start < 5000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return frames / ((performance.now() - start) / 1000);
  });
  report.fps = round(report.fps, 2);

  await phone.close();

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const desk = await desktop.newPage();
  desk.setDefaultTimeout(20000);
  desk.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  desk.on("pageerror", (error) => {
    errors.push(String(error));
  });
  await desk.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await desk.waitForFunction(() => window.__hot && window.__hot.state() === "idle", null, { timeout: 60000 });
  await desk.screenshot({ path: "evidence/desktop-idle.png" });
  await desk.keyboard.press("Space");
  await desk.waitForFunction(() => /HEADS|TAILS/.test(document.getElementById("result").textContent || ""), null, {
    timeout: 15000,
  });
  await desk.waitForTimeout(420);
  await desk.screenshot({ path: "evidence/desktop-result.png" });
  const dbox = await desk.locator("#view").boundingBox();
  await desk.mouse.click(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
  await desk.waitForFunction(() => window.__hot.state() === "inspect");
  await desk.waitForTimeout(500);
  await desk.screenshot({ path: "evidence/desktop-inspect.png" });
  await desk.click("#done-btn");
  await desk.waitForFunction(() => window.__hot.state() === "idle");
  await desk.click("#menu-btn");
  await desk.waitForSelector("#version", { state: "visible" });
  await desk.screenshot({ path: "evidence/desktop-menu.png" });
  await desktop.close();
} catch (error) {
  failures.push(error && error.stack ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
}

if (errors.length) failures.push(...errors.map((item) => `console: ${item}`));
report.consoleErrors = errors;
report.failures = failures;
report.pass = failures.length === 0;
writeFileSync("evidence/flip-1000.json", `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify({ pass: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  pass: true,
  heads: report.heads,
  tails: report.tails,
  headsShare: report.headsShare,
  maxSimSeconds: report.maxSimSeconds,
  fps: report.fps,
}, null, 2));
