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
    "src/generated/**",
  ]),
  {
    rules: {
      // Data-fetch no mount e sincronização de formulário ao abrir um dialog
      // são usos legítimos de setState em effect. A regra (React Compiler)
      // gera falso-positivo para esses padrões consolidados de React.
      "react-hooks/set-state-in-effect": "off",
      // Prefixo `_` marca parâmetros/variáveis intencionalmente não usados
      // (ex.: stubs de server actions de fases futuras).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
