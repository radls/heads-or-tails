import { describe, expect, it } from "vitest";
import { COINS, coinByKey } from "../src/coins.js";

const SPEC = {
  penny: { diameter: 19.05, thickness: 1.52, mass: 2.5, edge: "plain", reeds: 0 },
  nickel: { diameter: 21.21, thickness: 1.95, mass: 5.0, edge: "plain", reeds: 0 },
  dime: { diameter: 17.91, thickness: 1.35, mass: 2.268, edge: "reeded", reeds: 118 },
  quarter: { diameter: 24.26, thickness: 1.75, mass: 5.67, edge: "reeded", reeds: 119 },
  half: { diameter: 30.61, thickness: 2.15, mass: 11.34, edge: "reeded", reeds: 150 },
  dollar: { diameter: 26.49, thickness: 2.0, mass: 8.1, edge: "plain", reeds: 0 },
  house: { diameter: 26.5, thickness: 2.0, mass: 7.0, edge: "reeded", reeds: 120 },
};

describe("coins", () => {
  it("lists the seven coins in catalog order", () => {
    expect(COINS.map((coin) => coin.key)).toEqual([
      "penny",
      "nickel",
      "dime",
      "quarter",
      "half",
      "dollar",
      "house",
    ]);
  });

  it("matches real diameters, thickness, mass, and reeding", () => {
    for (const coin of COINS) {
      const spec = SPEC[coin.key];
      expect(coin.diameter).toBe(spec.diameter);
      expect(coin.thickness).toBe(spec.thickness);
      expect(coin.mass).toBe(spec.mass);
      expect(coin.edge).toBe(spec.edge);
      expect(coin.reeds).toBe(spec.reeds);
      expect(coin.clad).toBe(coin.key === "dime" || coin.key === "quarter" || coin.key === "half");
    }
  });

  it("looks up a coin by key", () => {
    expect(coinByKey("half").name).toBe("Kennedy half dollar");
    expect(coinByKey("nope")).toBeNull();
  });
});
