/** Relief (white = raised) → tangent-space normal, roughness, and AO. */

export function boxBlur(src, width, height, radius) {
  const passes = radius | 0;
  if (passes <= 0) return src;
  let cur = src;
  for (let pass = 0; pass < passes; pass += 1) {
    const dst = new Float32Array(cur.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let n = 0;
        for (let j = -1; j <= 1; j += 1) {
          const yy = Math.min(height - 1, Math.max(0, y + j));
          for (let i = -1; i <= 1; i += 1) {
            const xx = Math.min(width - 1, Math.max(0, x + i));
            sum += cur[yy * width + xx];
            n += 1;
          }
        }
        dst[y * width + x] = sum / n;
      }
    }
    cur = dst;
  }
  return cur;
}

function sample(height, width, heightPx, x, y) {
  const xx = Math.min(width - 1, Math.max(0, x));
  const yy = Math.min(heightPx - 1, Math.max(0, y));
  return height[yy * width + xx];
}

/**
 * Bake maps from a height field in [0, 1], row 0 at the top of the design.
 * Normal G points toward the top of the image (increasing texture v).
 * Raised texels are rougher when frostRaised is true (the default).
 */
export function bakeMaps(height, width, heightPx, coin) {
  const strength = coin.normalStrength ?? 6;
  const frostRaised = coin.frostRaised !== false;
  const roughMin = coin.roughMin ?? 0.15;
  const roughMax = coin.roughMax ?? 0.45;
  const normal = new Uint8ClampedArray(width * heightPx * 4);
  const roughness = new Uint8ClampedArray(width * heightPx * 4);
  const ao = new Uint8ClampedArray(width * heightPx * 4);
  const cx = (width - 1) * 0.5;
  const cy = (heightPx - 1) * 0.5;
  const rad = Math.min(cx, cy);
  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const o = i * 4;
      const dx = sample(height, width, heightPx, x + 1, y) - sample(height, width, heightPx, x - 1, y);
      const dy = sample(height, width, heightPx, x, y + 1) - sample(height, width, heightPx, x, y - 1);
      const dist = Math.hypot(x - cx, y - cy);
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      if (dist > rad * 0.985) {
        nx = 0;
        ny = 0;
        nz = 1;
      }
      const inv = 1 / Math.hypot(nx, ny, nz);
      normal[o] = (nx * inv * 0.5 + 0.5) * 255;
      normal[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      normal[o + 2] = (nz * inv * 0.5 + 0.5) * 255;
      normal[o + 3] = 255;
      const hgt = height[i];
      const rough = frostRaised ? roughMin + (roughMax - roughMin) * hgt : roughMax + (roughMin - roughMax) * hgt;
      const rByte = Math.max(0, Math.min(255, rough * 255));
      roughness[o] = rByte;
      roughness[o + 1] = rByte;
      roughness[o + 2] = rByte;
      roughness[o + 3] = 255;
      const cavity = Math.max(0, Math.min(1, 0.42 + 0.58 * hgt));
      const aByte = cavity * 255;
      ao[o] = aByte;
      ao[o + 1] = aByte;
      ao[o + 2] = aByte;
      ao[o + 3] = 255;
    }
  }
  return { normal, roughness, ao, width, height: heightPx };
}

/** Draw an image into a square height field. Outside the disc is filled so the rim has no cliff. */
export function heightFromImage(image, size, blurRadius) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const height = new Float32Array(size * size);
  const cx = (size - 1) * 0.5;
  const cy = (size - 1) * 0.5;
  const rad = size * 0.5;
  let rimSum = 0;
  let rimN = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      const hgt = data[(y * size + x) * 4] / 255;
      height[y * size + x] = hgt;
      if (d > 0.9 && d < 0.98) {
        rimSum += hgt;
        rimN += 1;
      }
    }
  }
  const rim = rimN ? rimSum / rimN : 0.8;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d > 0.992) height[y * size + x] = rim;
    }
  }
  return boxBlur(height, size, size, blurRadius | 0);
}
