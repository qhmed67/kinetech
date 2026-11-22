/* Minimal Cloudflare Worker ambient types.
 *
 * The repo does not hoist @cloudflare/workers-types to the root node_modules,
 * and this package is deliberately NOT an npm workspace (no lockfile churn).
 * The DOM lib already supplies Request/Response/Headers/fetch/caches/URL/
 * crypto/btoa/atob; only these two Worker-only types are missing.
 */

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandler<Env> {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
}
