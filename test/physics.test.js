import { describe, expect, it } from "vitest";
import { COINS } from "../src/coins.js";
import { createRng } from "../src/rng.js";
import { createSimulation, initPhysics } from "../src/physics.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("physics", () => {
  it("matches coin mass and settles flips without forcing", async () => {
    await initPhysics();
    const rng = createRng(mulberry32(7));
    const counts = { heads: 0, tails: 0 };
    for (const coin of COINS) {
      const sim = createSimulation(coin, rng);
      expect(sim.body.mass()).toBeCloseTo(coin.mass, 1);
      for (const power of [0.35, 0.85]) {
        sim.launch(power);
        let guard = 0;
        while (sim.phase !== "idle" && guard < 8000) {
          sim.step();
          guard += 1;
        }
        expect(sim.phase).toBe("idle");
        expect(sim.result.forced).toBe(false);
        expect(sim.result.simSeconds).toBeLessThan(8);
        expect(["heads", "tails"]).toContain(sim.result.face);
        counts[sim.result.face] += 1;
        expect(sim.recoveries).toBe(0);
      }
    }
    expect(counts.heads).toBeGreaterThan(0);
    expect(counts.tails).toBeGreaterThan(0);
  }, 120000);
});
