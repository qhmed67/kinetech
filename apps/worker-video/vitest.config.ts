import { defineConfig } from "vitest/config";

// Standalone package (not an npm workspace): binaries resolve from the repo
// root node_modules, so this config only scopes the test discovery.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
