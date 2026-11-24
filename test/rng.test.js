import { afterEach, describe, expect, it, vi } from "vitest";
import { createRng } from "../src/rng.js";

describe("rng", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws from crypto.getRandomValues into [0, 1)", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((buf) => {
      buf[0] = 0x80000000;
      return buf;
    });
    const rng = createRng();
    const value = rng.next();
    expect(spy).toHaveBeenCalled();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(value).toBeCloseTo(0.5, 5);
  });

  it("stays inside the requested range", () => {
    const rng = createRng();
    for (let i = 0; i < 200; i += 1) {
      const value = rng.range(-3, 5);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThan(5);
      const unit = rng.next();
      expect(unit).toBeGreaterThanOrEqual(0);
      expect(unit).toBeLessThan(1);
    }
  });

  it("uses an injected sequence for tests", () => {
    const values = [0, 0.25, 0.999];
    const rng = createRng(() => values.shift());
    expect(rng.range(10, 20)).toBe(10);
    expect(rng.range(0, 8)).toBe(2);
    expect(rng.signed(4)).toBeCloseTo((0.999 * 2 - 1) * 4, 5);
  });
});
