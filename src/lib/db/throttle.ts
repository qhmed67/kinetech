/* Client-side abuse throttle: minimum interval between sensitive attempts
   (login/signup/admin). Complements — never replaces — Supabase dashboard
   rate limits + Turnstile/hCaptcha, which must be enabled server-side. */

const lastHit = new Map<string, number>();

/** Returns true when the attempt may proceed; false = within cooldown. */
export function throttle(key: string, minMs: number): boolean {
  const now = Date.now();
  const prev = lastHit.get(key) ?? 0;
  if (now - prev < minMs) return false;
  lastHit.set(key, now);
  return true;
}

export function resetThrottle(key: string): void {
  lastHit.delete(key);
}

/** Network stall guard: fail visibly instead of hanging loaders forever. */
export const NETWORK_TIMEOUT_MS = 15000;

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
