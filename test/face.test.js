import { describe, expect, it } from "vitest";
import { faceFromQuaternion, faceUpDot, flattenQuaternion, rotateVector } from "../src/face.js";

function axisAngle(x, y, z, radians) {
  const half = radians / 2;
  const s = Math.sin(half);
  const len = Math.hypot(x, y, z) || 1;
  return { x: (x / len) * s, y: (y / len) * s, z: (z / len) * s, w: Math.cos(half) };
}

describe("faceFromQuaternion", () => {
  it("reads identity as heads", () => {
    expect(faceFromQuaternion({ x: 0, y: 0, z: 0, w: 1 })).toBe("heads");
    expect(faceUpDot({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(1, 6);
  });

  it("reads a half turn about X as tails", () => {
    expect(faceFromQuaternion({ x: 1, y: 0, z: 0, w: 0 })).toBe("tails");
    expect(faceFromQuaternion(axisAngle(1, 0, 0, Math.PI))).toBe("tails");
  });

  it("reads a half turn about Z as tails", () => {
    expect(faceFromQuaternion({ x: 0, y: 0, z: 1, w: 0 })).toBe("tails");
    expect(faceFromQuaternion(axisAngle(0, 0, 1, Math.PI))).toBe("tails");
  });

  it("keeps a yaw and a small tilt on the same face", () => {
    expect(faceFromQuaternion(axisAngle(0, 1, 0, Math.PI))).toBe("heads");
    expect(faceFromQuaternion(axisAngle(1, 0, 0, (10 * Math.PI) / 180))).toBe("heads");
    expect(faceFromQuaternion(axisAngle(0, 0, 1, (12 * Math.PI) / 180))).toBe("heads");
    expect(faceFromQuaternion(axisAngle(1, 0, 0, (170 * Math.PI) / 180))).toBe("tails");
    expect(faceFromQuaternion(axisAngle(0, 0, 1, (-15 * Math.PI) / 180))).toBe("heads");
  });

  it("classifies a near-vertical rest as edge", () => {
    expect(faceFromQuaternion(axisAngle(1, 0, 0, Math.PI / 2))).toBe("edge");
    expect(faceFromQuaternion(axisAngle(0, 0, 1, Math.PI / 2))).toBe("edge");
    const justInside = Math.acos(0.19);
    expect(faceFromQuaternion(axisAngle(1, 0, 0, justInside))).toBe("edge");
    const justOutside = Math.acos(0.21);
    expect(faceFromQuaternion(axisAngle(1, 0, 0, justOutside))).toBe("heads");
  });

  it("accepts an array quaternion", () => {
    expect(faceFromQuaternion([0, 0, 0, 1])).toBe("heads");
  });
});

describe("flattenQuaternion", () => {
  it("lays a tilted heads pose flat without changing yaw", () => {
    const tilted = axisAngle(1, 0, 0, (25 * Math.PI) / 180);
    const flat = flattenQuaternion(tilted);
    expect(faceFromQuaternion(flat)).toBe("heads");
    expect(faceUpDot(flat)).toBeCloseTo(1, 5);
    const x = rotateVector(flat, 1, 0, 0);
    expect(x.x).toBeGreaterThan(0.99);
  });

  it("lays a tails pose face down", () => {
    const tilted = axisAngle(1, 0, 0, (150 * Math.PI) / 180);
    const flat = flattenQuaternion(tilted);
    expect(faceFromQuaternion(flat)).toBe("tails");
    expect(faceUpDot(flat)).toBeCloseTo(-1, 5);
  });

  it("returns null on edge", () => {
    expect(flattenQuaternion(axisAngle(1, 0, 0, Math.PI / 2))).toBeNull();
  });
});
