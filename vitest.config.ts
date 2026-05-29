import { defineConfig } from "vitest/config";

// Dedicated Vitest config so the PWA/React build plugins in vite.config.ts do
// not run during tests. jsdom is enabled because the asset-reference and
// extraction code paths use browser DOM APIs (e.g. DOMParser).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
