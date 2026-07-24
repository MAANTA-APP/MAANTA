import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Match Next.js's automatic JSX runtime so component modules (which don't
  // `import React`) can be rendered in tests (e.g. renderToStaticMarkup).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
