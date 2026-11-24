/* Build-time guard: fails the build when a secret marker reaches the bundle.
 *
 * The Direct Drive tier is the only place where a Google browser key is
 * handed out — and it is handed out by the SERVER, per request, inside the
 * /api/play response. Nothing may ever be baked into the client bundle.
 *
 * This script runs as `postbuild` (npm runs it after `vite build`), so a
 * leak fails the local build, the CI build and the Vercel deployment.
 *
 * Markers are matched with enough context to avoid false positives:
 *  - "AIza" also appears as a placeholder in some UI and inside the
 *    supabase-js key sniffing, so only a full key shape is flagged.
 *  - "sb_secret_" appears as a literal in supabase-js, so only the real
 *    key shape (prefix + long suffix) is flagged.
 * The anon / publishable key IS public by design and is expected in the
 * bundle — it is not checked here.
 */

const fs = require("node:fs");
const path = require("node:path");

const DIST = path.join(__dirname, "..", "dist");

const MARKERS = [
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: "Supabase service-role key", re: /sb_secret_[0-9A-Za-z_-]{20,}/ },
  { name: "retired VITE_DRIVE_BROWSER_KEY variable", re: /VITE_DRIVE_BROWSER_KEY/ },
  { name: "server-only secret variable", re: /GRANT_SECRET|STREAM_TOKEN_SECRET|SUPABASE_SERVICE_ROLE_KEY|DRIVE_BROWSER_KEY|GOOGLE_API_KEY/ },
];

/** Every file that ships to the browser. */
function shippedFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...shippedFiles(full));
    else if (/\.(js|mjs|css|html|json|map)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error("[check-bundle-secrets] dist/ not found — run the build first.");
    process.exit(1);
  }
  const files = shippedFiles(DIST);
  const findings = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const marker of MARKERS) {
      if (marker.re.test(content)) {
        findings.push(`${path.relative(DIST, file)}: ${marker.name}`);
      }
    }
  }
  if (findings.length > 0) {
    console.error("[check-bundle-secrets] a secret marker reached the bundle:");
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[check-bundle-secrets] ok — ${files.length} shipped files, no secret marker.`);
}

main();
