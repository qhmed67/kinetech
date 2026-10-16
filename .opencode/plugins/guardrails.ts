// Hard guardrails the model cannot talk its way around. Loaded automatically from .opencode/plugins/.
// A human can lift them for a session with:  GUARDRAILS_UNLOCK=1 opencode
import type { Plugin } from "@opencode-ai/plugin"
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join, relative, resolve } from "node:path"

// Files that ARE the enforcement. The agent may not edit them (otherwise it can "fix" a red build by disabling the check).
const PROTECTED = [
  /^\.githooks\//,
  /^\.opencode\/plugins\//,
  /^scripts\/(verify|guard-tests|arch-grep|check-error-codes|check-logs)\.sh$/,
]
const EDIT_TOOLS = new Set(["edit", "write", "patch", "apply_patch", "multiedit"])

export const Guardrails: Plugin = async ({ directory, worktree }: any) => {
  const root: string = worktree || directory
  const unlocked = process.env.GUARDRAILS_UNLOCK === "1"
  const rel = (p: string) => relative(root, resolve(root, p)).replace(/\\/g, "/")
  const isProtected = (p: string) => PROTECTED.some((re) => re.test(rel(p)))

  return {
    "tool.execute.before": async (input: any, output: any) => {
      if (unlocked) return
      const args = output?.args ?? {}

      if (EDIT_TOOLS.has(input.tool)) {
        const paths: string[] = []
        if (args.filePath || args.path) paths.push(String(args.filePath ?? args.path))
        const patch = String(args.patchText ?? args.patch ?? "")
        for (const m of patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) paths.push(m[1].trim())
        const hit = paths.find(isProtected)
        if (hit) throw new Error(`BLOCKED: ${hit} is part of the enforcement system. Do not edit it. If a check is wrong, stop and tell the user.`)
      }

      if (input.tool === "bash") {
        const raw = String(args.command ?? "")
        const cmd = raw.replace(/\d*>&\d+/g, "").replace(/>\s*\/dev\/null/g, "")
        if (/--no-verify\b/.test(cmd)) throw new Error("BLOCKED: --no-verify bypasses the quality gate. Fix the failure instead.")
        if (/core\.hooksPath/.test(cmd)) throw new Error("BLOCKED: do not change git hooks configuration.")
        if (/ALLOW_TEST_CHANGES|GUARDRAILS_UNLOCK|GUARD_BASE/.test(cmd)) throw new Error("BLOCKED: guard overrides are for the human only.")
        const writes = /\bsed\s+-i|\btee\b|(^|[^<>-])>|\bmv\b|\brm\b|\bcp\b|\bchmod\b|\btruncate\b|\bperl\s+-pi\b|\bgit\s+(checkout|restore)\b/.test(cmd)
        if (writes && PROTECTED.some((re) => cmd.split(/\s+/).some((tok) => re.test(tok.replace(/^['"]|['"]$/g, ""))))) {
          throw new Error("BLOCKED: this command modifies an enforcement file (hooks/plugins/verify/guard scripts).")
        }
      }
    },

    // Keep the important state alive when the long session gets compacted (the usual moment where drift starts).
    "experimental.session.compacting": async (_input: any, output: any) => {
      const lines = [
        "## Project guardrails to keep after compaction",
        "- Follow AGENTS.md: state level (L0-L3), smallest diff, never weaken tests/checks, TWO-STRIKES rule (stop + revert to last green after 2 failed fixes).",
        "- `scripts/verify.sh` is the only definition of done. Re-read files before editing; do not edit from memory.",
      ]
      try {
        const dir = join(root, "docs", "plans")
        if (existsSync(dir)) {
          const plans = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("TEMPLATE"))
            .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)
          if (plans[0]) {
            lines.push(`- Active plan (single source of truth, read it first): docs/plans/${plans[0].f}`)
            const unchecked = readFileSync(join(dir, plans[0].f), "utf8").split("\n").find((l) => /^\s*[-*] \[ \]/.test(l))
            if (unchecked) lines.push(`- Next unchecked slice: ${unchecked.trim()}`)
          }
        }
      } catch {}
      output.context.push(lines.join("\n"))
    },
  }
}
