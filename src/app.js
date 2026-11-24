import { createAudio } from "./audio.js";
import { coinByKey, defaultCoinKey } from "./coins.js";
import { classifyPointer } from "./gesture.js";
import { createSimulation, FIXED_DT, initPhysics } from "./physics.js";
import { createRng } from "./rng.js";
import { proceduralThumb, reliefThumb, createStage } from "./scene.js";
import { COIN_KEY, loadSettings, saveSettings, surfaceFor } from "./settings.js";
import { emptyStats, loadStats, record, saveStats, summary } from "./stats.js";
import { formatVersion } from "./version.js";

const FAST_STEPS = 480;

function motionReduced(settings) {
  if (typeof settings.reducedMotion === "boolean") return settings.reducedMotion;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clampPower(power) {
  if (!Number.isFinite(power)) return 0.55;
  return Math.min(1, Math.max(0, power));
}

export async function startApp({ canvas, ui }) {
  await initPhysics();
  const audio = createAudio();
  const storage = window.localStorage;
  let settings = loadSettings(storage);
  let reduced = motionReduced(settings);
  let statsState = loadStats(storage);
  let coin = coinByKey(storage.getItem(COIN_KEY)) || coinByKey(defaultCoinKey());
  const rng = createRng();
  const sim = createSimulation(coin, rng);
  const surf = surfaceFor(settings.table);
  sim.setSurface(surf.friction, surf.restitution);

  const stage = createStage(canvas);
  stage.setReduced(reduced);
  stage.setQuality(settings.quality);
  stage.setTable(settings.table);
  stage.resize();

  ui.setVersion(formatVersion(__APP_VERSION__, __APP_SHA__));
  ui.setCoin(coin);
  ui.applySettings(settings, reduced);
  ui.renderStats(summary(statsState));
  ui.setThumb(coin.key, proceduralThumb(coin));

  let fast = false;
  let acc = 0;
  let raf = 0;
  let last = 0;
  let hidden = document.hidden;
  let flipWait = null;
  let committed = true;
  let tail = Promise.resolve();

  function wake() {
    if (raf || hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function noteContact(ev) {
    if (fast || !ev) return;
    if (ev.impact > 70) audio.impact(ev.impact, coin.pitch);
    else if (ev.rattle) audio.rattle(coin.pitch);
  }

  function finishFlip() {
    if (committed || !sim.result) return;
    committed = true;
    const result = sim.result;
    statsState = record(statsState, { face: result.face, coin: coin.key, t: Date.now() });
    saveStats(storage, statsState);
    if (!fast) {
      ui.showResult(result.face, reduced);
      if (settings.vibration && navigator.vibrate) {
        try {
          navigator.vibrate(18);
        } catch {
          /* this device has no vibrator */
        }
      }
    }
    ui.renderStats(summary(statsState));
    stage.syncBody(sim.body);
    stage.update(0, "idle");
    stage.render();
    if (flipWait) {
      const resolve = flipWait;
      flipWait = null;
      resolve();
    }
  }

  function frame(now) {
    raf = 0;
    if (hidden) return;
    const wall = Math.max(0, (now - last) / 1000);
    last = now;
    // Physics stays on the fixed step. The camera uses the real gap so a
    // slow frame still catches the coin instead of leaving it above the view.
    const dt = Math.min(0.05, wall);
    const cameraDt = Math.min(0.3, wall);
    if (!fast && (sim.phase === "flying" || sim.phase === "settling")) {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED_DT && steps < 16) {
        const ev = sim.step();
        acc -= FIXED_DT;
        steps += 1;
        noteContact(ev);
        if (sim.result) break;
      }
      if (sim.result) finishFlip();
    }
    stage.syncBody(sim.body);
    stage.update(cameraDt, sim.phase);
    stage.render();
    if (stage.needsFrame(sim.phase) || sim.phase !== "idle") wake();
  }

  async function yieldTurn() {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    while (document.hidden) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 40);
      });
    }
  }

  async function runOne(power) {
    if (stage.isInspecting()) {
      stage.exitInspect();
      ui.setInspecting(false);
      wake();
      await stage.whenInspectDone();
    }
    if (sim.phase !== "idle") {
      await new Promise((resolve) => {
        flipWait = resolve;
      });
    }
    committed = false;
    acc = 0;
    ui.clearResult();
    sim.launch(clampPower(power), { reduced });
    if (!fast) audio.ting(coin.pitch);
    const started = performance.now();
    wake();
    if (fast) {
      let batches = 0;
      while (!sim.result) {
        for (let i = 0; i < FAST_STEPS && !sim.result; i += 1) sim.step();
        batches += 1;
        stage.syncBody(sim.body);
        if (batches % 2 === 0 || sim.result) {
          stage.update(0, sim.phase);
          stage.render();
        }
        await yieldTurn();
      }
      finishFlip();
    } else {
      await new Promise((resolve) => {
        flipWait = resolve;
      });
    }
    const result = sim.result;
    return {
      face: result.face,
      settleMs: performance.now() - started,
      simSeconds: result.simSeconds,
      forced: Boolean(result.forced),
    };
  }

  function flip(opts = {}) {
    const power = clampPower(opts.power ?? 0.55);
    const job = tail.then(() => runOne(power));
    tail = job.then(
      () => {},
      () => {},
    );
    return job;
  }

  async function leaveInspect() {
    if (!stage.isInspecting()) return;
    stage.exitInspect();
    ui.setInspecting(false);
    wake();
    await stage.whenInspectDone();
    stage.syncBody(sim.body);
    stage.render();
  }

  async function selectCoin(key) {
    const next = coinByKey(key);
    if (!next) return;
    if (sim.phase === "flying" || sim.phase === "settling") return;
    await leaveInspect();
    coin = next;
    storage.setItem(COIN_KEY, next.key);
    sim.swapCoin(next);
    const ground = surfaceFor(settings.table);
    sim.setSurface(ground.friction, ground.restitution);
    ui.setCoin(next);
    ui.closeMenu();
    const pending = stage.setCoin(next);
    wake();
    const record = await pending;
    if (record?.obverseImage) ui.setThumb(next.key, reliefThumb(next, record.obverseImage));
    await stage.whenFaded();
    stage.syncBody(sim.body);
    stage.update(0, "idle");
    stage.render();
  }

  function reset() {
    statsState = emptyStats();
    saveStats(storage, statsState);
    ui.renderStats(summary(statsState));
    ui.clearResult();
    if (sim.phase === "idle" && !stage.isInspecting()) {
      sim.placeHeadsUp();
      stage.syncBody(sim.body);
      stage.render();
    }
  }

  function applySettings(next, { fromUser = false } = {}) {
    settings = {
      sound: typeof next.sound === "boolean" ? next.sound : settings.sound,
      vibration: typeof next.vibration === "boolean" ? next.vibration : settings.vibration,
      reducedMotion: fromUser ? Boolean(next.reducedMotion) : settings.reducedMotion,
      quality: next.quality || settings.quality,
      table: next.table || settings.table,
    };
    reduced = motionReduced(settings);
    saveSettings(storage, settings);
    audio.setMuted(!settings.sound);
    stage.setReduced(reduced);
    stage.setQuality(settings.quality);
    stage.setTable(settings.table);
    const ground = surfaceFor(settings.table);
    sim.setSurface(ground.friction, ground.restitution);
    ui.applySettings(settings, reduced);
    wake();
  }

  ui.onSelect((key) => {
    selectCoin(key);
  });
  ui.onReset(reset);
  ui.onDone(() => {
    leaveInspect();
  });
  ui.onSettings((next) => applySettings(next, { fromUser: true }));

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener?.("change", () => {
    if (typeof settings.reducedMotion === "boolean") return;
    reduced = media.matches;
    stage.setReduced(reduced);
    ui.applySettings(settings, reduced);
  });

  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    if (hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    acc = 0;
    last = performance.now();
    if (sim.phase !== "idle" || stage.needsFrame(sim.phase)) wake();
  });

  window.addEventListener("resize", () => {
    stage.resize();
    stage.render();
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.code !== "Space" && event.code !== "Enter") return;
    const target = event.target;
    if (target && target.closest && target.closest("button, a, input, select, textarea, label")) return;
    if (ui.isMenuOpen()) return;
    if (appState() !== "idle") return;
    event.preventDefault();
    audio.unlock();
    flip({ power: 0.55 });
  });

  let pointer = null;
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    audio.unlock();
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lx: event.clientX,
      ly: event.clientY,
    };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer already ended */
    }
    if (stage.isInspecting()) stage.setDragging(true);
    wake();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (stage.isInspecting()) {
      stage.drag(event.clientX - pointer.lx, event.clientY - pointer.ly);
      pointer.lx = event.clientX;
      pointer.ly = event.clientY;
      wake();
    }
  });
  function endPointer(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const distance = Math.hypot(dx, dy);
    pointer = null;
    stage.setDragging(false);
    const phase = appState();
    if (phase === "flying" || phase === "settling") return;
    const gesture = classifyPointer({
      dx,
      dy,
      distance,
      width: canvas.clientWidth || window.innerWidth,
    });
    if (phase === "inspect") {
      if (gesture.type === "tap" && !stage.hit(event.clientX, event.clientY)) leaveInspect();
      return;
    }
    if (gesture.type === "tap" && stage.hit(event.clientX, event.clientY)) {
      ui.clearResult();
      stage.enterInspect();
      ui.setInspecting(true);
      wake();
      return;
    }
    flip({ power: gesture.type === "swipe" ? gesture.power : 0.55 });
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", (event) => {
    if (pointer && event.pointerId === pointer.id) {
      pointer = null;
      stage.setDragging(false);
    }
  });

  function appState() {
    if (stage.isInspecting()) return "inspect";
    if (sim.phase === "flying") return "flying";
    if (sim.phase === "settling") return "settling";
    return "idle";
  }

  const pending = stage.setCoin(coin);
  wake();
  const first = await pending;
  if (first?.obverseImage) ui.setThumb(coin.key, reliefThumb(coin, first.obverseImage));
  await stage.whenFaded();
  stage.syncBody(sim.body);
  stage.update(0, "idle");
  stage.render();

  const api = {
    flip,
    setFast(value) {
      fast = Boolean(value);
      acc = 0;
    },
    stats() {
      return summary(statsState);
    },
    reset,
    selectCoin,
    state: appState,
  };
  window.__hot = api;

  return api;
}
