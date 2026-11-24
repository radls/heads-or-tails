/** Menu version line, matching the Solitaire app: `v1.0.0 · abc1234`. */
export function formatVersion(version, sha) {
  return `v${version} · ${sha}`;
}
