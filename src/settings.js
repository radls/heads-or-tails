export const SETTINGS_KEY = "heads-or-tails:settings";
export const COIN_KEY = "heads-or-tails:coin";

const TABLES = new Set(["wood", "felt", "slate"]);
const QUALITIES = new Set(["auto", "high", "low"]);

export function defaultSettings() {
  return {
    sound: true,
    vibration: true,
    reducedMotion: null,
    quality: "auto",
    table: "wood",
  };
}

export function sanitizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== "object") return base;
  return {
    sound: typeof raw.sound === "boolean" ? raw.sound : base.sound,
    vibration: typeof raw.vibration === "boolean" ? raw.vibration : base.vibration,
    reducedMotion: typeof raw.reducedMotion === "boolean" ? raw.reducedMotion : null,
    quality: QUALITIES.has(raw.quality) ? raw.quality : base.quality,
    table: TABLES.has(raw.table) ? raw.table : base.table,
  };
}

export function loadSettings(storage) {
  try {
    return sanitizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) || "null"));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage, settings) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
}

/** Ground friction and restitution stay inside the spec's physical range. */
export function surfaceFor(table) {
  if (table === "felt") return { friction: 0.5, restitution: 0.3 };
  if (table === "slate") return { friction: 0.32, restitution: 0.44 };
  return { friction: 0.46, restitution: 0.36 };
}

export function pixelRatioFor(quality, devicePixelRatio, deviceMemory) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (quality === "low") return Math.min(dpr, 1.5);
  if (quality === "high") return Math.min(dpr, 2);
  const modest = Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4;
  return Math.min(dpr, modest ? 1.5 : 2);
}

export function shadowSizeFor(quality, deviceMemory) {
  if (quality === "low") return 512;
  if (quality === "high") return 1024;
  const modest = Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4;
  return modest ? 512 : 1024;
}
