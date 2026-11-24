import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  deserialize,
  emptyStats,
  loadStats,
  percentages,
  record,
  saveStats,
  serialize,
  streaks,
  summary,
  trimHistory,
} from "../src/stats.js";

function memory() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

describe("stats", () => {
  it("records faces, streaks, and percentages", () => {
    let state = emptyStats();
    const seq = ["heads", "heads", "tails", "heads", "heads", "heads"];
    seq.forEach((face, i) => {
      state = record(state, { face, coin: "quarter", t: 1_700_000_000_000 + i });
    });
    expect(state.heads).toBe(5);
    expect(state.tails).toBe(1);
    expect(percentages(state)).toEqual({ total: 6, heads: (5 / 6) * 100, tails: (1 / 6) * 100 });
    expect(streaks(state)).toEqual({ current: 3, face: "heads", longest: 3 });
    expect(summary(state).perCoin.quarter).toMatchObject({ heads: 5, tails: 1, total: 6 });
    expect(state.history).toHaveLength(6);
  });

  it("breaks a streak and remembers the longest", () => {
    let state = emptyStats();
    for (let i = 0; i < 4; i += 1) state = record(state, { face: "tails", coin: "penny", t: i });
    state = record(state, { face: "heads", coin: "penny", t: 4 });
    state = record(state, { face: "heads", coin: "dime", t: 5 });
    expect(streaks(state)).toEqual({ current: 2, face: "heads", longest: 4 });
    expect(summary(state).perCoin.penny.tails).toBe(4);
    expect(summary(state).perCoin.dime.heads).toBe(1);
  });

  it("trims history to 100 without forgetting all-time totals", () => {
    let state = emptyStats();
    for (let i = 0; i < 150; i += 1) {
      state = record(state, { face: i % 2 === 0 ? "heads" : "tails", coin: "nickel", t: i });
    }
    expect(state.history).toHaveLength(HISTORY_LIMIT);
    expect(state.heads + state.tails).toBe(150);
    expect(trimHistory(state).history).toHaveLength(100);
    const round = deserialize(serialize(state));
    expect(round.history).toHaveLength(100);
    expect(round.heads + round.tails).toBe(150);
    expect(round.history[0].t).toBe(50);
    expect(round.history.at(-1).t).toBe(149);
  });

  it("recovers from corrupted storage", () => {
    expect(deserialize(null).heads).toBe(0);
    expect(deserialize("").schema).toBe(1);
    expect(deserialize("{")).toEqual(emptyStats());
    expect(deserialize("[]")).toEqual(emptyStats());
    expect(deserialize(JSON.stringify({ schema: 2, history: [] }))).toEqual(emptyStats());
    expect(deserialize(JSON.stringify({ schema: 1, history: "nope" }))).toEqual(emptyStats());
    const mixed = deserialize(JSON.stringify({
      schema: 1,
      history: [
        { face: "heads", coin: "dime", t: 3 },
        { face: "sideways", coin: "dime", t: 4 },
        { face: "tails" },
        null,
        { face: "tails", coin: "dime", t: 8 },
      ],
      heads: 1,
      tails: 0,
      longest: 9,
    }));
    expect(mixed.history.map((item) => item.face)).toEqual(["heads", "tails"]);
    expect(mixed.heads).toBe(1);
    expect(mixed.tails).toBe(1);
    expect(mixed.longest).toBe(9);
    expect(streaks(mixed)).toMatchObject({ current: 1, face: "tails" });
  });

  it("round-trips through a storage object and ignores a bad payload", () => {
    const storage = memory();
    let state = record(emptyStats(), { face: "heads", coin: "house", t: 12 });
    saveStats(storage, state);
    expect(loadStats(storage).heads).toBe(1);
    storage.setItem("heads-or-tails:stats", "{not-json");
    expect(loadStats(storage)).toEqual(emptyStats());
  });
});
