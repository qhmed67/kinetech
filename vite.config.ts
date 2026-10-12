import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

// Build stamp for bug reports: short git HEAD baked into the bundle so the
// admin panel can show exactly which commit is deployed (stale-bundle check).
let buildHash = 'dev'
try {
  buildHash = execSync('git rev-parse --short HEAD').toString().trim() || 'dev'
} catch {
  /* no git (CI tarball) — stays "dev" */
}

// https://vite.dev/config/
// NOTE: test tooling lives in vitest.config.ts on purpose — vite.config.ts
// must not import dev-only packages, or production installs (devDeps pruned,
// e.g. Vercel) fail before the build even starts.
export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
