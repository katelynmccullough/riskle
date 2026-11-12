import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.next-dev/**",
      "test-results/**",
      "playwright-report/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        chrome: "readonly",
        location: "readonly",
        document: "readonly",
        MutationObserver: "readonly",
        URL: "readonly",
        module: "readonly",
      },
    },
  },
);
