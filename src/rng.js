/** Uniform draws from crypto.getRandomValues. Tests may inject a unit PRNG. */

function cryptoUnit() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

/**
 * @param {(() => number) | undefined} nextUnit returns a float in [0, 1)
 */
export function createRng(nextUnit) {
  const next = nextUnit ?? cryptoUnit;
  return {
    next,
    /** Inclusive of min, exclusive of max. */
    range(min, max) {
      return min + (max - min) * next();
    },
    /** Signed value in [-scale, scale). */
    signed(scale = 1) {
      return (next() * 2 - 1) * scale;
    },
  };
}
