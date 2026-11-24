/**
 * Resting camera for a given viewport aspect (width / height).
 * Distances are millimetres. The framing keeps a half dollar large
 * while leaving drift room on a phone.
 */
export function framing(aspect, fovDeg = 30) {
  const safe = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  const targetWidth = safe < 0.8 ? 72 : safe < 1.2 ? 96 : 118;
  const fov = fovDeg;
  const v = (fov * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * safe);
  const distance = targetWidth / 2 / Math.tan(h / 2);
  const elev = (32 * Math.PI) / 180;
  return {
    aspect: safe,
    fov,
    distance,
    targetWidth,
    position: {
      x: 0,
      y: Math.sin(elev) * distance,
      z: Math.cos(elev) * distance,
    },
    lookAt: { x: 0, y: 1.2, z: 0 },
  };
}
