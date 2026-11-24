/** Heads/tails/edge from a coin orientation. Local +Y is the heads-face normal. */

export const EDGE_THRESHOLD = 0.2;

function components(q) {
  let x;
  let y;
  let z;
  let w;
  if (Array.isArray(q)) {
    [x, y, z, w] = q;
  } else {
    x = q?.x;
    y = q?.y;
    z = q?.z;
    w = q?.w;
  }
  if (![x, y, z, w].every(Number.isFinite)) return null;
  const len = Math.hypot(x, y, z, w);
  if (len < 1e-12) return null;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

/** World-space dot(local +Y, world up). +1 is flat heads-up. */
export function faceUpDot(q) {
  const c = components(q);
  if (!c) return 0;
  return 1 - 2 * (c.x * c.x + c.z * c.z);
}

/**
 * @param {{x:number,y:number,z:number,w:number} | number[]} q
 * @returns {"heads" | "tails" | "edge"}
 */
export function faceFromQuaternion(q) {
  const dot = faceUpDot(q);
  if (Math.abs(dot) < EDGE_THRESHOLD) return "edge";
  return dot > 0 ? "heads" : "tails";
}

/** Rotate a vector by a quaternion (x, y, z, w). */
export function rotateVector(q, vx, vy, vz) {
  const c = components(q);
  if (!c) return { x: vx, y: vy, z: vz };
  const { x, y, z, w } = c;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return {
    x: (1 - 2 * (yy + zz)) * vx + 2 * (xy - wz) * vy + 2 * (xz + wy) * vz,
    y: 2 * (xy + wz) * vx + (1 - 2 * (xx + zz)) * vy + 2 * (yz - wx) * vz,
    z: 2 * (xz - wy) * vx + 2 * (yz + wx) * vy + (1 - 2 * (xx + yy)) * vz,
  };
}

function quatFromBasis(X, Y, Z) {
  const m00 = X.x;
  const m01 = Y.x;
  const m02 = Z.x;
  const m10 = X.y;
  const m11 = Y.y;
  const m12 = Z.y;
  const m20 = X.z;
  const m21 = Y.z;
  const m22 = Z.z;
  const trace = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

/**
 * Lay the coin exactly flat on the nearer face, preserving yaw.
 * Returns null when the coin is on edge and neither face is nearer.
 */
export function flattenQuaternion(q) {
  const face = faceFromQuaternion(q);
  if (face === "edge") return null;
  const xAxis = rotateVector(q, 1, 0, 0);
  let hx = xAxis.x;
  let hz = xAxis.z;
  if (Math.hypot(hx, hz) < 1e-6) {
    const zAxis = rotateVector(q, 0, 0, 1);
    hx = zAxis.x;
    hz = zAxis.z;
  }
  const inv = 1 / (Math.hypot(hx, hz) || 1);
  hx *= inv;
  hz *= inv;
  const ySign = face === "heads" ? 1 : -1;
  return quatFromBasis(
    { x: hx, y: 0, z: hz },
    { x: 0, y: ySign, z: 0 },
    { x: -hz * ySign, y: 0, z: hx * ySign },
  );
}
