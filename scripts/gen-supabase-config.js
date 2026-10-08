// Build-time generator: materializes public/supabase-config.js from environment.
// Runs as `prebuild` so Vercel injects VITE_* vars at build time. When vars are
// absent (local static preview without .env), emits empty placeholders and the
// auth pages fail closed with a visible error instead of throwing.
const fs = require("node:fs");
const path = require("node:path");

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const out =
  `window.__SUPABASE_URL__ = ${JSON.stringify(url)};\n` +
  `window.__SUPABASE_ANON_KEY__ = ${JSON.stringify(key)};\n`;

fs.writeFileSync(path.join(__dirname, "..", "public", "supabase-config.js"), out);
if (!url || !key) {
  console.warn("[gen-supabase-config] VITE_SUPABASE_URL/ANON_KEY missing — wrote empty placeholders.");
} else {
  console.log("[gen-supabase-config] wrote public/supabase-config.js");
}
