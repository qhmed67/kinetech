import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// NOTE: test tooling lives in vitest.config.ts on purpose — vite.config.ts
// must not import dev-only packages, or production installs (devDeps pruned,
// e.g. Vercel) fail before the build even starts.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
