/* Worker runtime diagnostics logger.
 *
 * Every line is structured JSON on stdout — Cloudflare logs it. NEVER logs
 * secrets, tokens, urls or file ids: the shapes above carry only non-secret
 * labels. Logging never throws.
 */

function jsonSafe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function logWorker(event: string, fields: Record<string, unknown>): void {
  try {
    console.log(jsonSafe({ ts: new Date().toISOString(), event, ...fields })); // allow-print: Worker runtime, structured JSON only
  } catch {
    /* logging must never break anything */
  }
}
