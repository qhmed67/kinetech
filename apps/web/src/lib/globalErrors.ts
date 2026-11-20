// Global error handlers — step 13.6.4. Last-resort logging for errors that
// escape React's boundary (event handlers, timers, promise chains).
// Logging only: never prevents default, never throws, never logs page URLs.

import { log } from "./logger";

let installed = false;

function report(message: string, type: string): void {
  log("error", "ui.error.global", message, {
    module: "ui.global-errors",
    ctx: { type },
    error: { code: "SYS_001", type: type || "Error", message: message.slice(0, 500) },
  });
}

/** Idempotent — StrictMode mounts twice in dev. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  try {
    window.addEventListener("error", (event) => {
      try {
        report(event.message || "window error", event.error?.name || "Error");
      } catch {
        /* logging must never break the page */
      }
    });
    window.addEventListener("unhandledrejection", (event) => {
      try {
        const reason = event.reason;
        const message = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
        report(message, reason instanceof Error ? reason.name : "UnhandledRejection");
      } catch {
        /* logging must never break the page */
      }
    });
  } catch {
    /* no window APIs — skip */
  }
}
