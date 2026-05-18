// mcp/catalog/index.ts
// Agregador do catálogo de tools do MCP.
//
// CONTRATO: cada domínio expõe seu array em `mcp/tools/<dominio>/index.ts`
// e o importa aqui. À medida que as ondas 4c/4d/4e forem criando os módulos de
// domínio, descomentar o import correspondente e somar ao array `catalogo`.
//
// NOTA DE FECHAMENTO (achado N6): o catálogo completo (14 tools) é validado
// em 4f-4 — se um import for esquecido aqui, tsc passa mas a tool não aparece
// em tools/list. O teste de 4f-4 é a rede de proteção.
import type { ToolEntry } from "./types.js";

// import { estoqueTools } from "../tools/estoque/index.js";   // descomenta em 4c.3
// import { financeiroTools } from "../tools/financeiro/index.js"; // descomenta em 4d.0
// import { caminho3Tools } from "../tools/caminho3/index.js"; // descomenta em 4e

export const catalogo: ToolEntry[] = [
  // ...estoqueTools,
  // ...financeiroTools,
  // ...caminho3Tools,
];
