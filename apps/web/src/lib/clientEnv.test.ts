// The Drive browser key must never be part of the client build.
//
// It used to be asserted by the hidden `#/player-test` page (removed in
// Task 4 cleanup). The guarantee is kept here instead, on two levels:
//
//   1. SOURCE  — only the three public Supabase variables are ever read from
//      `import.meta.env`; no other VITE_ variable is referenced anywhere, so
//      no key can be inlined into the bundle.
//   2. SERVER  — the Direct Drive tier reads its key from the SERVER
//      environment (`DRIVE_BROWSER_KEY`) and returns it per request inside
//      the /api/play response. The server file never touches import.meta.env.
//
// The artifact-level counterpart is the build-time guard
// `apps/web/scripts/check-bundle-secrets.cjs` (npm `postbuild`): it fails
// the build if a key-shaped string reaches dist/.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const WEB_ROOT = resolve(import.meta.dirname, "../..");
const SRC = join(WEB_ROOT, "src");
const API_PLAY = join(WEB_ROOT, "api", "play.ts");

/** Every .ts/.tsx file under a directory, except the test files (they never
 *  ship, and they may hold key-shaped fixtures of their own). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const PUBLIC_VITE_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

describe("client bundle never carries a Drive key", () => {
  it("reads import.meta.env in exactly one module", () => {
    const readers = sourceFiles(SRC).filter((f) =>
      readFileSync(f, "utf8").includes("import.meta.env"),
    );
    expect(readers.map((f) => f.replace(`${WEB_ROOT}/`, ""))).toEqual(["src/lib/db/env.ts"]);
  });

  it("exposes only the three public Supabase variables to the browser", () => {
    const envModule = readFileSync(join(SRC, "lib", "db", "env.ts"), "utf8");
    const names = [...envModule.matchAll(/(VITE_[A-Z0-9_]+)/g)].map((m) => m[1]);
    expect([...new Set(names)].sort()).toEqual([...PUBLIC_VITE_VARS].sort());
  });

  it("never mentions a browser key variable anywhere in the source", () => {
    const offenders = sourceFiles(SRC).filter((f) => {
      const text = readFileSync(f, "utf8");
      return (
        text.includes("VITE_DRIVE_BROWSER_KEY") ||
        /AIza[0-9A-Za-z_-]{20,}/.test(text) ||
        /sb_secret_[0-9A-Za-z_-]{20,}/.test(text)
      );
    });
    expect(offenders.map((f) => f.replace(`${WEB_ROOT}/`, ""))).toEqual([]);
  });

  it("serves the Direct tier key from the server environment", () => {
    const source = readFileSync(API_PLAY, "utf8");
    // The key is read from the SERVER env and returned in the grant.
    expect(source).toContain('getEnvVar("DRIVE_BROWSER_KEY")');
    expect(source).toMatch(/key,/);
    // ...and the server file never reads the client bundle environment.
    expect(source).not.toContain("import.meta.env");
    expect(source).not.toContain("process.env.VITE_");
  });
});
