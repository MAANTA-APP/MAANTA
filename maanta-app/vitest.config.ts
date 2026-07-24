import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Next.js compiles JSX with the automatic runtime (no `import React`), so
  // match it here — otherwise esbuild's default classic runtime expects a
  // global `React` and rendering a component in a test throws "React is not
  // defined". Lets component tests render via react-dom/server.
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
