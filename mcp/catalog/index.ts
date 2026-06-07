// mcp/catalog/index.ts
// Agregador do catálogo de tools do MCP.
//
// CONTRATO: cada domínio expõe seu array em `mcp/tools/<dominio>/index.ts`
// e o importa aqui. À medida que as ondas 4c/4d/4e forem criando os módulos de
// domínio, descomentar o import correspondente e somar ao array `catalogo`.
//
// NOTA DE FECHAMENTO (achado N6): o catálogo completo é validado
// em integration.test.ts , se um import for esquecido aqui, tsc passa mas a
// tool não aparece em tools/list. O teste de integração é a rede de proteção.
import type { ToolEntry } from "./types.js";

import { estoqueTools } from "../tools/estoque/index.js";   // 4c.3  , 6 tools
import { financeiroTools } from "../tools/financeiro/index.js"; // 4d.0  , 6 tools
import { foraDoCatalogoTools } from "../tools/fora-do-catalogo/index.js"; // Fora do Catalogo , 2 tools (registrar_lacuna + bi_consulta_avancada)
import { comercialTools } from "../tools/comercial/index.js"; // onda B , 5 tools
import { fiscalTools } from "../tools/fiscal/index.js";     // onda C , 6 tools
import { cadastrosTools } from "../tools/cadastros/index.js"; // onda D , 3 tools
import { contabilTools } from "../tools/contabil/index.js";   // onda E , 2 tools
import { dominiosVaziosTools } from "../tools/dominios-vazios/index.js"; // onda F , 3 tools
import { crmTools } from "../tools/crm/index.js"; // Bloco J , crm read + write tools
import { producaoTools } from "../tools/producao/index.js"; // B5 , processos de produção (sempreVisivel)
import { auditoriaTools } from "../tools/auditoria/index.js"; // B7 , regras de auditoria (sempreVisivel)

export const catalogo: ToolEntry[] = [
  ...estoqueTools,
  ...financeiroTools,
  ...foraDoCatalogoTools,
  ...comercialTools,
  ...fiscalTools,
  ...cadastrosTools,
  ...contabilTools,
  ...dominiosVaziosTools,
  ...crmTools,
  ...producaoTools,
  ...auditoriaTools,
];
