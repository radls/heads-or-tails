import { COINS } from "./coins.js";
import { proceduralThumb } from "./scene.js";

function pct(value) {
  return `${Math.round(value)}%`;
}

function clock(t) {
  if (!Number.isFinite(t) || t <= 0) return "";
  try {
    return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function createUi(doc) {
  const menuBtn = doc.getElementById("menu-btn");
  const menu = doc.getElementById("menu");
  const version = doc.getElementById("version");
  const coinName = doc.getElementById("coin-name");
  const result = doc.getElementById("result");
  const done = doc.getElementById("done-btn");
  const coinList = doc.getElementById("coin-list");
  const historyList = doc.getElementById("history-list");
  const perCoin = doc.getElementById("per-coin");
  const resetBtn = doc.getElementById("reset-btn");
  const resetConfirm = doc.getElementById("reset-confirm");
  const tabs = [...doc.querySelectorAll("[data-tab]")];
  const panels = [...doc.querySelectorAll("[data-panel]")];
  let resultGen = 0;
  let onSelect = () => {};
  let onSettings = () => {};
  let onReset = () => {};
  let onDone = () => {};

  for (const coin of COINS) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "coin-btn";
    button.id = `coin-${coin.key}`;
    button.style.setProperty("--thumb", `${Math.round(42 + (coin.diameter / 30.61) * 26)}px`);
    const img = doc.createElement("img");
    img.alt = "";
    img.width = 96;
    img.height = 96;
    img.src = proceduralThumb(coin);
    const name = doc.createElement("span");
    name.className = "coin-short";
    name.textContent = coin.short;
    const value = doc.createElement("span");
    value.className = "coin-value";
    value.textContent = coin.value;
    button.append(img, name, value);
    button.addEventListener("click", () => onSelect(coin.key));
    coinList.append(button);
  }

  function showTab(name) {
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.panel !== name;
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  }

  function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  menuBtn.addEventListener("click", () => setMenu(menu.hidden));
  doc.getElementById("scrim").addEventListener("click", () => setMenu(false));
  done.addEventListener("click", () => onDone());
  resetBtn.addEventListener("click", () => {
    resetConfirm.hidden = false;
  });
  doc.getElementById("reset-no").addEventListener("click", () => {
    resetConfirm.hidden = true;
  });
  doc.getElementById("reset-yes").addEventListener("click", () => {
    resetConfirm.hidden = true;
    onReset();
  });

  const sound = doc.getElementById("set-sound");
  const vibration = doc.getElementById("set-vibration");
  const motion = doc.getElementById("set-motion");
  const quality = doc.getElementById("set-quality");
  const table = doc.getElementById("set-table");
  const emitSettings = () => {
    onSettings({
      sound: sound.checked,
      vibration: vibration.checked,
      reducedMotion: motion.checked,
      quality: quality.value,
      table: table.value,
    });
  };
  for (const node of [sound, vibration, motion]) node.addEventListener("change", emitSettings);
  for (const node of [quality, table]) node.addEventListener("change", emitSettings);

  showTab("coins");

  return {
    setVersion(text) {
      version.textContent = text;
    },
    setCoin(coin) {
      coinName.textContent = coin.name;
      for (const button of coinList.querySelectorAll(".coin-btn")) {
        const on = button.id === `coin-${coin.key}`;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
    },
    setThumb(key, url) {
      const img = doc.querySelector(`#coin-${key} img`);
      if (img) img.src = url;
    },
    showResult(face, reduced) {
      resultGen += 1;
      const gen = resultGen;
      result.textContent = face === "tails" ? "TAILS" : "HEADS";
      result.classList.toggle("reduced", Boolean(reduced));
      result.classList.add("show");
      doc.documentElement.dataset.motion = reduced ? "reduce" : "full";
      window.setTimeout(() => {
        if (gen !== resultGen) return;
        result.classList.remove("show");
        result.textContent = "";
      }, reduced ? 1100 : 1700);
    },
    clearResult() {
      resultGen += 1;
      result.classList.remove("show");
      result.textContent = "";
    },
    renderStats(summary) {
      doc.getElementById("stat-heads").textContent = String(summary.heads);
      doc.getElementById("stat-tails").textContent = String(summary.tails);
      doc.getElementById("stat-total").textContent = String(summary.total);
      doc.getElementById("stat-heads-pct").textContent = pct(summary.headsPct);
      doc.getElementById("stat-tails-pct").textContent = pct(summary.tailsPct);
      const face = summary.current?.face;
      const count = summary.current?.count || 0;
      doc.getElementById("stat-streak").textContent = face && count ? `${count} ${face}` : "—";
      doc.getElementById("stat-longest").textContent = String(summary.longest || 0);
      historyList.replaceChildren();
      const history = [...summary.history].reverse();
      if (!history.length) {
        const empty = doc.createElement("li");
        empty.className = "empty";
        empty.textContent = "No flips yet.";
        historyList.append(empty);
      }
      for (const item of history) {
        const li = doc.createElement("li");
        li.className = `chip ${item.face === "tails" ? "tails" : "heads"}`;
        const mark = doc.createElement("span");
        mark.className = "mark";
        mark.textContent = item.face === "tails" ? "T" : "H";
        const name = doc.createElement("span");
        name.textContent = item.coin;
        const time = doc.createElement("time");
        time.textContent = clock(item.t);
        li.append(mark, name, time);
        historyList.append(li);
      }
      perCoin.replaceChildren();
      for (const coin of COINS) {
        const tally = summary.perCoin[coin.key] || { heads: 0, tails: 0, total: 0, headsPct: 0 };
        const row = doc.createElement("li");
        const label = doc.createElement("span");
        label.textContent = coin.short;
        const nums = doc.createElement("span");
        nums.textContent = tally.total ? `${tally.heads}H ${tally.tails}T · ${pct(tally.headsPct)}` : "—";
        row.append(label, nums);
        perCoin.append(row);
      }
    },
    applySettings(settings, reducedChecked) {
      sound.checked = settings.sound !== false;
      vibration.checked = settings.vibration !== false;
      motion.checked = Boolean(reducedChecked);
      quality.value = settings.quality || "auto";
      table.value = settings.table || "wood";
      doc.documentElement.dataset.motion = reducedChecked ? "reduce" : "full";
    },
    setInspecting(on) {
      done.hidden = !on;
    },
    isMenuOpen() {
      return !menu.hidden;
    },
    closeMenu() {
      setMenu(false);
    },
    onSelect(fn) {
      onSelect = fn;
    },
    onSettings(fn) {
      onSettings = fn;
    },
    onReset(fn) {
      onReset = fn;
    },
    onDone(fn) {
      onDone = fn;
    },
  };
}
