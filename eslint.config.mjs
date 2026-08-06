import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local pre-push verification build output (scripts/build-verify.mjs) —
    // not "next"-named, so eslint-config-next's own ignore doesn't cover it.
    ".next-verify/**",
  ]),
]);

export default eslintConfig;
