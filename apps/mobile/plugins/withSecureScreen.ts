/* Expo config plugin: FLAG_SECURE on Android.
 *
 * FLAG_SECURE blocks screenshots, screen recording and the recent-apps
 * thumbnail for the whole window (2027-architecture.md §2.4). It has to be
 * set natively, so this plugin patches the generated MainActivity during
 * prebuild (CNG) — no native project is committed to the repo.
 *
 * Scope note: the app has ONE activity, so FLAG_SECURE covers the whole app
 * (the marketing WebView included). That is the safe default for a product
 * whose lessons are the asset. Remove the plugin from app.json to turn it
 * off.
 */

import fs from "node:fs";
import path from "node:path";
import { withMainApplication } from "expo/config-plugins";

const FLAG_LINE_KOTLIN = "    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)";
const FLAG_LINE_JAVA = "    getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);";

function findMainActivity(projectRoot: string): { file: string; language: "kt" | "java" } | null {
  const javaRoot = path.join(projectRoot, "app/src/main/java");
  // No native project yet (the plugin can run before prebuild, e.g. when the
  // config is only being read) — nothing to patch, and nothing to fail about.
  if (!fs.existsSync(javaRoot)) return null;
  const stack: string[] = [javaRoot];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.name === "MainActivity.kt") return { file: full, language: "kt" };
      if (entry.name === "MainActivity.java") return { file: full, language: "java" };
    }
  }
  return null;
}

export default function withSecureScreen(config: any): any {
  return withMainApplication(config, (modConfig: any) => {
    const found = findMainActivity(modConfig.modRequest.platformProjectRoot);
    if (!found) {
      // No native project yet (the config is being read before prebuild) —
      // there is nothing to patch and nothing to complain about.
      return modConfig;
    }
    const source = fs.readFileSync(found.file, "utf8");
    if (source.includes("FLAG_SECURE")) return modConfig; // already applied

    const isKotlin = found.language === "kt";
    const flagLine = isKotlin ? FLAG_LINE_KOTLIN : FLAG_LINE_JAVA;
    const importLine = isKotlin
      ? "import android.view.WindowManager"
      : "import android.view.WindowManager;";

    let next = source;
    if (isKotlin) {
      // Kotlin: insert the import after the package line, the call after onCreate.
      if (!next.includes("import android.view.WindowManager")) {
        next = next.replace(
          /^package .*$/m,
          (line) => `${line}\n\n${importLine}`,
        );
      }
      next = next.replace(
        /(override\s+fun\s+onCreate\([^)]*\)\s*\{[\s\S]*?super\.onCreate\([^)]*\)\n)/,
        `$1${flagLine}\n`,
      );
    } else {
      if (!next.includes("import android.view.WindowManager;")) {
        next = next.replace(/^(package .*;)$/m, `$1\n\n${importLine}`);
      }
      next = next.replace(
        /(super\.onCreate\([^)]*\);\n)/,
        `$1${flagLine}\n`,
      );
    }

    if (!next.includes("FLAG_SECURE")) {
      throw new Error(
        `withSecureScreen: could not patch ${found.file} (no onCreate anchor found) — ` +
          "FLAG_SECURE was NOT applied.",
      );
    }
    fs.writeFileSync(found.file, next);
    return modConfig;
  });
}
