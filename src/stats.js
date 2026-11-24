import { COINS } from "./coins.js";

export const STATS_SCHEMA = 1;
export const HISTORY_LIMIT = 100;
export const STATS_KEY = "heads-or-tails:stats";

export function emptyStats() {
  return {
    schema: STATS_SCHEMA,
    history: [],
    heads: 0,
    tails: 0,
    currentFace: null,
    currentCount: 0,
    longest: 0,
    perCoin: {},
  };
}

function coinTally(perCoin, key) {
  const prev = perCoin[key] || { heads: 0, tails: 0 };
  return { heads: prev.heads | 0, tails: prev.tails | 0 };
}

/** Append one settled flip. History is capped at 100; totals are all-time. */
export function record(state, flip) {
  const face = flip?.face;
  if (face !== "heads" && face !== "tails") {
    throw new Error("record: face must be heads or tails");
  }
  const coin = typeof flip.coin === "string" && flip.coin ? flip.coin : "unknown";
  const t = Number.isFinite(flip.t) ? flip.t : 0;
  const heads = state.heads + (face === "heads" ? 1 : 0);
  const tails = state.tails + (face === "tails" ? 1 : 0);
  let currentFace = state.currentFace;
  let currentCount = state.currentCount;
  if (face === currentFace) currentCount += 1;
  else {
    currentFace = face;
    currentCount = 1;
  }
  const longest = Math.max(state.longest | 0, currentCount);
  const history = state.history.concat({ face, coin, t }).slice(-HISTORY_LIMIT);
  const prev = coinTally(state.perCoin, coin);
  const perCoin = {
    ...state.perCoin,
    [coin]: {
      heads: prev.heads + (face === "heads" ? 1 : 0),
      tails: prev.tails + (face === "tails" ? 1 : 0),
    },
  };
  return {
    schema: STATS_SCHEMA,
    history,
    heads,
    tails,
    currentFace,
    currentCount,
    longest,
    perCoin,
  };
}

export function streaks(state) {
  return {
    current: state.currentCount | 0,
    face: state.currentFace,
    longest: state.longest | 0,
  };
}

export function percentages(state) {
  const total = (state.heads | 0) + (state.tails | 0);
  return {
    total,
    heads: total ? (state.heads / total) * 100 : 0,
    tails: total ? (state.tails / total) * 100 : 0,
  };
}

export function trimHistory(state) {
  if (!state || state.history.length <= HISTORY_LIMIT) return state;
  return { ...state, history: state.history.slice(-HISTORY_LIMIT) };
}

export function serialize(state) {
  return JSON.stringify({
    schema: STATS_SCHEMA,
    history: state.history.slice(-HISTORY_LIMIT),
    heads: state.heads | 0,
    tails: state.tails | 0,
    currentFace: state.currentFace,
    currentCount: state.currentCount | 0,
    longest: state.longest | 0,
    perCoin: state.perCoin,
  });
}

function asCount(value) {
  return Number.isInteger(value) && value >= 0 && value < 1e9 ? value : null;
}

export function deserialize(raw) {
  try {
    if (typeof raw !== "string" || raw.length === 0) return emptyStats();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || data.schema !== STATS_SCHEMA) return emptyStats();
    if (!Array.isArray(data.history)) return emptyStats();
    const history = [];
    for (const item of data.history) {
      if (!item || typeof item !== "object") continue;
      if (item.face !== "heads" && item.face !== "tails") continue;
      if (typeof item.coin !== "string" || !item.coin) continue;
      const t = Number(item.t);
      history.push({ face: item.face, coin: item.coin, t: Number.isFinite(t) ? t : 0 });
    }
    const trimmed = history.slice(-HISTORY_LIMIT);
    const histHeads = trimmed.filter((item) => item.face === "heads").length;
    const histTails = trimmed.length - histHeads;
    const headsIn = asCount(data.heads);
    const tailsIn = asCount(data.tails);
    const heads = headsIn !== null && headsIn >= histHeads ? headsIn : histHeads;
    const tails = tailsIn !== null && tailsIn >= histTails ? tailsIn : histTails;
    const perCoin = {};
    if (data.perCoin && typeof data.perCoin === "object") {
      for (const [key, value] of Object.entries(data.perCoin)) {
        if (!value || typeof value !== "object") continue;
        const h = asCount(value.heads);
        const t = asCount(value.tails);
        if (h === null || t === null) continue;
        perCoin[key] = { heads: h, tails: t };
      }
    }
    let currentFace = data.currentFace === "heads" || data.currentFace === "tails" ? data.currentFace : null;
    let currentCount = asCount(data.currentCount) ?? 0;
    if (trimmed.length) {
      const last = trimmed[trimmed.length - 1].face;
      let run = 0;
      for (let i = trimmed.length - 1; i >= 0; i -= 1) {
        if (trimmed[i].face !== last) break;
        run += 1;
      }
      if (currentFace !== last || currentCount < run) {
        currentFace = last;
        currentCount = Math.max(currentCount, run);
      }
    } else {
      currentFace = null;
      currentCount = 0;
    }
    let longestRun = 0;
    let runFace = null;
    let run = 0;
    for (const item of trimmed) {
      if (item.face === runFace) run += 1;
      else {
        runFace = item.face;
        run = 1;
      }
      if (run > longestRun) longestRun = run;
    }
    const longestIn = asCount(data.longest);
    const longest = Math.max(longestIn ?? 0, longestRun, currentCount);
    return {
      schema: STATS_SCHEMA,
      history: trimmed,
      heads,
      tails,
      currentFace,
      currentCount,
      longest,
      perCoin,
    };
  } catch {
    return emptyStats();
  }
}

export function summary(state) {
  const pct = percentages(state);
  const streak = streaks(state);
  const perCoin = {};
  for (const coin of COINS) {
    const tally = state.perCoin[coin.key] || { heads: 0, tails: 0 };
    const total = tally.heads + tally.tails;
    perCoin[coin.key] = {
      heads: tally.heads,
      tails: tally.tails,
      total,
      headsPct: total ? (tally.heads / total) * 100 : 0,
      tailsPct: total ? (tally.tails / total) * 100 : 0,
    };
  }
  return {
    heads: state.heads,
    tails: state.tails,
    total: pct.total,
    headsPct: pct.heads,
    tailsPct: pct.tails,
    current: { face: streak.face, count: streak.current },
    longest: streak.longest,
    history: state.history.map((item) => ({ ...item })),
    perCoin,
  };
}

export function loadStats(storage) {
  try {
    return deserialize(storage.getItem(STATS_KEY));
  } catch {
    return emptyStats();
  }
}

export function saveStats(storage, state) {
  storage.setItem(STATS_KEY, serialize(state));
}
