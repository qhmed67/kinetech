/** Minimal semver compare for native app gate. Returns -1, 0, 1, or null for invalid. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

function parse(v: string): [number, number, number] | null {
  const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isBelowMin(version: string, min: string): boolean {
  const cmp = compareSemver(version, min);
  return cmp !== null && cmp < 0;
}
