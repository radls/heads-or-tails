import { describe, expect, it } from "vitest";
import { bakeMaps } from "../src/normals.js";

describe("bakeMaps", () => {
  it("tilts normals away from a raised bump and frosts the peak", () => {
    const size = 32;
    const height = new Float32Array(size * size);
    const cx = 16;
    const cy = 16;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x - cx, y - cy);
        height[y * size + x] = Math.max(0, 1 - d / 6);
      }
    }
    const maps = bakeMaps(height, size, size, { normalStrength: 4, roughMin: 0.1, roughMax: 0.9 });
    const at = (x, y) => {
      const o = (y * size + x) * 4;
      return maps.normal[o];
    };
    const g = (x, y) => maps.normal[(y * size + x) * 4 + 1];
    expect(at(cx - 3, cy)).toBeLessThan(127);
    expect(at(cx + 3, cy)).toBeGreaterThan(127);
    expect(g(cx, cy - 3)).toBeGreaterThan(127);
    expect(g(cx, cy + 3)).toBeLessThan(127);
    const peak = maps.roughness[(cy * size + cx) * 4];
    const field = maps.roughness[0];
    expect(peak).toBeGreaterThan(field);
  });
});
