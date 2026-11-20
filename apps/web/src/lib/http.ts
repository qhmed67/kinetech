// Client fetch boundary — step 13.6.4. Generates one request id per call,
// sends it as x-request-id, and logs start/end with status and duration.
// Never logs the body, headers, auth token or a URL's query string.

import { log, newCorrelationId, withCorrelation } from "./logger";

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const id = newCorrelationId();
  const route = input.split("?")[0];
  const method = init.method ?? "GET";
  const started = Date.now();
  let response: Response | null = null;
  let thrown: unknown = null;

  await withCorrelation(id, () => {
    log("info", "ui.request.start", `${method} ${route}`, {
      module: "ui.http",
      ctx: { route, method },
    });
  });

  try {
    response = await withCorrelation(id, () => {
      const headers = new Headers(init.headers);
      headers.set("x-request-id", id);
      return fetch(input, { ...init, headers });
    });
    return response;
  } catch (error) {
    thrown = error;
    throw error;
  } finally {
    const status = response?.status ?? 0;
    const duration = Date.now() - started;
    const failed = thrown !== null || status >= 500;
    const level = failed ? "error" : status >= 400 ? "warn" : "info";
    const message = thrown instanceof Error ? thrown.message.slice(0, 500) : status === 0 ? "network error" : `HTTP ${status}`;
    await withCorrelation(id, () => {
      log(level, "ui.request.end", `${method} ${route}: ${message}`, {
        module: "ui.http",
        ctx: { route, method, status, duration_ms: duration, ok: response?.ok ?? false },
        error: failed
          ? {
              code: "SYS_001",
              type: thrown instanceof Error ? thrown.name : "FetchError",
              message,
            }
          : undefined,
      });
    });
  }
}
