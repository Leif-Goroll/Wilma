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
    // Netlify legt hier den kompletten Build ab (kompilierte Server-
    // Handler, gebündelte Chunks) – ohne diesen Eintrag zerrt jeder
    // `netlify deploy` Tausende falsche Meldungen in `npx eslint`.
    ".netlify/**",
  ]),
]);

export default eslintConfig;
