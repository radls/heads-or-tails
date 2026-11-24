/** Classify a pointer gesture on the table. Distance is in CSS pixels. */

export function classifyPointer({ dx = 0, dy = 0, distance = 0, width = 390 }) {
  if (!(distance >= 12)) return { type: "tap" };
  const up = Math.max(0, -dy);
  const span = Math.max(160, width * 0.42);
  let power = up >= 8 ? up / span : 0.34;
  if (!Number.isFinite(power)) power = 0.55;
  power = Math.min(1, Math.max(0.22, power));
  return { type: "swipe", power };
}
