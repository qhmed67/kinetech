#!/usr/bin/env node
// Bundle check: the exact path Expo Go hits when it says
// "Failed to download remote update" (manifest -> bundle).
// Usage: node e2e/bundle-check.mjs [baseUrl] (default http://localhost:8081)
// Exits 1 with FAIL: on any failure. No secrets printed.
const base = process.argv[2] || process.env.EXPO_DEV_URL || "http://localhost:8081";
const platforms = ["android", "ios"];
let failed = false;

async function check(label, url, opts = {}) {
  try {
    console.log(`CHECK ${label} ${url}`);
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) });
    const bytes = Number(res.headers.get("content-length") || 0);
    console.log(`OK ${label} status=${res.status} bytes=${bytes || "<stream>"}`);
    if (label.startsWith("bundle-")) {
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const text = await res.text();
      if (!text.includes("ExpoRoot") && !text.includes("expo-router")) {
        throw new Error("bundle missing router marker");
      }
      console.log(`OK ${label} marker=found length=${text.length}`);
    }
    if (label === "manifest-android") {
      const json = await res.json().catch(() => null);
      if (!json || (!json.launchAsset && !json.data && !json.manifest)) throw new Error("manifest shape unexpected");
      console.log("OK manifest-android shape=ok");
    }
  } catch (e) {
    console.log(`FAIL ${label} ${e?.message || e}`);
    failed = true;
  }
}

const manifestOpts = { headers: { "expo-platform": "android", Accept: "application/expo+json,application/json" } };
await check("manifest-android", `${base}/`, manifestOpts);
for (const p of platforms) {
  await check(`bundle-${p}`, `${base}/node_modules/expo-router/entry.bundle?platform=${p}&dev=true`);
}
console.log(failed ? "RESULT FAIL" : "RESULT PASS");
process.exit(failed ? 1 : 0);
