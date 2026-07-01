import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    plugins: { import: importPlugin },
    languageOptions: { parser: tsParser },
    rules: {
      "import/extensions": ["error", "ignorePackages", { ts: "never", js: "always" }],
    },
  },
];
