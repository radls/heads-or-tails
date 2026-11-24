import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { COINS } from "../src/coins.js";
import { buildCoinGeometries } from "../src/coin-geometry.js";

function triNormal(geometry, index) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const a = new Vector3().fromBufferAttribute(pos, idx.getX(index));
  const b = new Vector3().fromBufferAttribute(pos, idx.getX(index + 1));
  const c = new Vector3().fromBufferAttribute(pos, idx.getX(index + 2));
  return new Vector3().crossVectors(b.sub(a), c.sub(a.clone ? a : a));
}

function meanNormalY(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  let sum = 0;
  let n = 0;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i));
    b.fromBufferAttribute(pos, idx.getX(i + 1));
    c.fromBufferAttribute(pos, idx.getX(i + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const y = ab.z * ac.x - ab.x * ac.z;
    const area = ab.length() * ac.length();
    if (area < 1e-8) continue;
    sum += y;
    n += 1;
  }
  return sum / n;
}

function uvAt(geometry, uTarget, vTarget) {
  const uv = geometry.attributes.uv;
  const pos = geometry.attributes.position;
  let best = Infinity;
  let found = null;
  for (let i = 0; i < uv.count; i += 1) {
    const du = uv.getX(i) - uTarget;
    const dv = uv.getY(i) - vTarget;
    const d = du * du + dv * dv;
    if (d < best) {
      best = d;
      found = new Vector3().fromBufferAttribute(pos, i);
    }
  }
  return found;
}

describe("coin geometry", () => {
  it("faces the obverse up and the reverse down, with an outward edge", () => {
    const { obverse, reverse, edge } = buildCoinGeometries(COINS.find((coin) => coin.key === "quarter"));
    expect(meanNormalY(obverse)).toBeGreaterThan(0);
    expect(meanNormalY(reverse)).toBeLessThan(0);
    const pos = edge.attributes.position;
    const idx = edge.index;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const ab = new Vector3();
    const ac = new Vector3();
    const normal = new Vector3();
    let outward = 0;
    let samples = 0;
    for (let i = 0; i < idx.count; i += 30) {
      a.fromBufferAttribute(pos, idx.getX(i));
      b.fromBufferAttribute(pos, idx.getX(i + 1));
      c.fromBufferAttribute(pos, idx.getX(i + 2));
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      const centroid = a.add(b).add(c).multiplyScalar(1 / 3);
      if (normal.length() < 1e-8) continue;
      outward += Math.sign(normal.x * centroid.x + normal.z * centroid.z);
      samples += 1;
    }
    expect(outward).toBe(samples);
  });

  it("puts the top of each design on the far side of a front camera", () => {
    const { obverse, reverse } = buildCoinGeometries(COINS.find((coin) => coin.key === "penny"));
    const top = uvAt(obverse, 0.5, 1);
    expect(top.z).toBeLessThan(0);
    const revTop = uvAt(reverse, 0.5, 1);
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
    revTop.applyQuaternion(q);
    expect(revTop.y).toBeGreaterThan(0);
    expect(revTop.z).toBeLessThan(0);
    const right = uvAt(obverse, 1, 0.5);
    expect(right.x).toBeGreaterThan(0);
  });

  it("stays under 20k triangles and shows reed grooves", () => {
    for (const coin of COINS) {
      const built = buildCoinGeometries(coin);
      expect(built.triangleCount).toBeLessThan(20000);
      const pos = built.edge.attributes.position;
      let minR = Infinity;
      let maxR = 0;
      for (let i = 0; i < pos.count; i += 1) {
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
      }
      if (coin.reeds > 0) expect(maxR - minR).toBeGreaterThan(0.1);
      expect(maxR).toBeLessThanOrEqual(coin.diameter / 2 + 0.05);
    }
  });

  it("gives clad coins a copper stripe and plain coins a single edge color", () => {
    const quarter = buildCoinGeometries(COINS.find((coin) => coin.key === "quarter"));
    const penny = buildCoinGeometries(COINS.find((coin) => coin.key === "penny"));
    const q = quarter.edge.attributes.color;
    let minR = 1;
    let maxR = 0;
    for (let i = 0; i < q.count; i += 1) {
      minR = Math.min(minR, q.getX(i));
      maxR = Math.max(maxR, q.getX(i));
    }
    expect(maxR - minR).toBeGreaterThan(0.15);
    const p = penny.edge.attributes.color;
    const r0 = p.getX(0);
    for (let i = 0; i < p.count; i += 4) expect(p.getX(i)).toBeCloseTo(r0, 5);
  });
});
