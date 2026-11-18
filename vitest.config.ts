import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "tests/**/*.test.ts",
      "apps/web/**/*.test.tsx",
    ],
    globals: true,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
