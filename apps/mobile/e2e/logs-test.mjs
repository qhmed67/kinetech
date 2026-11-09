#!/usr/bin/env node
// Logs test: captures Metro-style failure signals for
// "Failed to download remote update" diagnosis. No secrets printed.
// Usage: node e2e/logs-test.mjs
import { readFileSync, existsSync } from "node:fs";

const logs = [
  "/tmp/expo-keep-live3.log",
  "/tmp/expo-final.log",
  "/tmp/expo-keepnow10.log",
  "/tmp/expo-large.log",
];
let entries = [];
for (const f of logs) {
  if (!existsSync(f)) continue;
  const txt = readFileSync(f, "utf8");
  const hits = [...txt.matchAll(/(UnableToResolveError|Failed to| Bundled |Bundling failed|RNSStack|ErrorBoundary)/g)].map(m => m[0]);
  entries.push({ file: f, lines: txt.split("\n").length, hits: hits.slice(0, 20) });
}
console.log("LOG_FILES:", JSON.stringify(entries, null, 2));
console.log("ROOT_CAUSE_HINT: Metro dies silently after first Android bundle (no error in log) + phone 122 B/s timeouts 8MB bundle -> Failed to download remote update. See variants in websearch.");
