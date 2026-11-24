import { BufferAttribute, BufferGeometry } from "three";

const FACE_SEGMENTS = 96;
const EDGE_PER_REED = 4;
const EDGE_ROWS = 6;
const COPPER = "#b87333";
const SILVER_EDGE = "#d5d8df";

function srgbToLinear(u) {
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function hexLinear(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return {
    r: srgbToLinear(((n >> 16) & 255) / 255),
    g: srgbToLinear(((n >> 8) & 255) / 255),
    b: srgbToLinear((n & 255) / 255),
  };
}

function lerpColor(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function faceProfile(thickness) {
  const recess = Math.min(0.22, Math.max(0.09, thickness * 0.11));
  const yField = thickness / 2 - recess;
  const yRim = thickness / 2;
  const yLip = thickness / 2 - recess * 0.55;
  return {
    recess,
    yLip,
    rings: [
      { f: 0, y: yField },
      { f: 0.58, y: yField },
      { f: 0.78, y: yField },
      { f: 0.86, y: yField + recess * 0.35 },
      { f: 0.915, y: yRim },
      { f: 0.97, y: yRim },
      { f: 1, y: yLip },
    ],
  };
}

function buildFace(radius, rings, segments, side) {
  const positions = [];
  const uvs = [];
  const y0 = rings[0].y * side;
  positions.push(0, y0, 0);
  uvs.push(0.5, 0.5);
  for (let r = 1; r < rings.length; r += 1) {
    const rad = radius * rings[r].f;
    const y = rings[r].y * side;
    for (let i = 0; i < segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      // Increasing theta travels +X toward -Z: CCW when viewed from +Y.
      const x = Math.cos(theta) * rad;
      const z = -Math.sin(theta) * rad;
      positions.push(x, y, z);
      const u = 0.5 + (0.5 * x) / radius;
      // Obverse: design top (v = 1) sits on local -Z, the far side from a +Z camera.
      // Reverse: v = 1 sits on local +Z so a 180° X turn brings it to world -Z.
      const v = side > 0 ? 0.5 - (0.5 * z) / radius : 0.5 + (0.5 * z) / radius;
      uvs.push(u, Math.min(1, Math.max(0, v)));
    }
  }
  const indices = [];
  const stride = segments;
  const ring = (r, i) => 1 + (r - 1) * stride + (i % segments);
  for (let i = 0; i < segments; i += 1) {
    const a = 0;
    const b = ring(1, i);
    const c = ring(1, i + 1);
    // CCW from the visible side. The obverse (side > 0) faces +Y.
    if (side > 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }
  for (let r = 1; r < rings.length - 1; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = ring(r, i);
      const b = ring(r, i + 1);
      const c = ring(r + 1, i);
      const d = ring(r + 1, i + 1);
      if (side > 0) indices.push(a, d, b, a, c, d);
      else indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function edgeColorAt(y, coin, base, silver, copper) {
  if (!coin.clad) return base;
  const halfBand = coin.thickness * 0.18;
  const ay = Math.abs(y);
  if (ay >= halfBand) return silver;
  const t = ay / halfBand;
  const k = t * t * (3 - 2 * t);
  return lerpColor(copper, silver, k);
}

function buildEdge(coin, radius, yTop, yBottom) {
  const reeds = coin.reeds | 0;
  const segments = reeds > 0 ? reeds * EDGE_PER_REED : 96;
  const rows = EDGE_ROWS;
  const positions = [];
  const colors = [];
  const base = hexLinear(coin.edgeColor || coin.color);
  const silver = hexLinear(SILVER_EDGE);
  const copper = hexLinear(COPPER);
  for (let j = 0; j <= rows; j += 1) {
    const t = j / rows;
    const y = yTop + (yBottom - yTop) * t;
    const barrel = Math.sin(t * Math.PI) * 0.03;
    for (let i = 0; i < segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      let rad = radius - 0.04 + barrel;
      if (reeds > 0) {
        const groove = 0.5 - 0.5 * Math.cos(reeds * theta);
        // Deep enough that individual reeds read when the edge faces the camera.
        rad = radius + 0.015 + barrel - 0.38 * groove ** 1.05;
      }
      const x = Math.cos(theta) * rad;
      const z = -Math.sin(theta) * rad;
      positions.push(x, y, z);
      const col = edgeColorAt(y, coin, base, silver, copper);
      colors.push(col.r, col.g, col.b);
    }
  }
  const indices = [];
  const vid = (j, i) => j * segments + (i % segments);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = vid(j, i);
      const b = vid(j, i + 1);
      const c = vid(j + 1, i);
      const d = vid(j + 1, i + 1);
      // Outward winding (verified by the geometry test).
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildCoinGeometries(coin) {
  const radius = coin.diameter / 2;
  const profile = faceProfile(coin.thickness);
  const obverse = buildFace(radius, profile.rings, FACE_SEGMENTS, 1);
  const reverse = buildFace(radius, profile.rings, FACE_SEGMENTS, -1);
  const lip = profile.yLip - 0.04;
  const edge = buildEdge(coin, radius, lip, -lip);
  const triangleCount = (obverse.index.count + reverse.index.count + edge.index.count) / 3;
  return { obverse, reverse, edge, triangleCount, radius };
}
