import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noTravessao from "./eslint-plugins/no-travessao/index.js";

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
    // Plugin local e migrations ficam fora do parser TS (sao JS/SQL puros).
    "eslint-plugins/**",
    "prisma/migrations/**",
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
  // Regra local: bloqueia travessao (em-dash) e en-dash em literais e
  // templates. Cobre src e mcp. Apos varredura one-shot da Onda A do
  // Renascimento, promovida a "error" para impedir regressao.
  {
    files: ["src/**/*.{ts,tsx,js,jsx}", "mcp/**/*.ts"],
    plugins: { "no-travessao": noTravessao },
    rules: {
      "no-travessao/no-travessao": "error",
    },
  },
]);

export default eslintConfig;
