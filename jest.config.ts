import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/mcp"],
  moduleFileExtensions: ["ts", "tsx", "js", "cjs", "mjs", "json", "node"],
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
  moduleNameMapper: {
    // Resolve imports .js no estilo nodenext para .ts no Jest
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^server-only$": "<rootDir>/src/lib/__mocks__/server-only.ts",
  },
};

export default config;
