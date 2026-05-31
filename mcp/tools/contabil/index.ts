// mcp/tools/contabil/index.ts
// Índice do domínio contábil. Exporta o array de tools.
// E.4/E.5 (plano de contas): contabil_plano_de_contas, contabil_estrutura_conta.
// B1 (onda contábil , movimento): saldo, razão, resultado, centro de custo
// (data-driven honestas, auto-ativam quando os lançamentos chegarem) + o
// referencial SPED (dado real hoje).
import type { ToolEntry } from "../../catalog/types.js";
import { contabilPlanoDeContas } from "./plano-de-contas.js";
import { contabilEstruturaConta } from "./estrutura-conta.js";
import { contabilSaldoConta } from "./saldo-conta.js";
import { contabilMovimentoConta } from "./movimento-conta.js";
import { contabilResultadoPorNatureza } from "./resultado-por-natureza.js";
import { contabilCentroCusto } from "./centro-custo.js";
import { contabilContaReferencial } from "./conta-referencial.js";

export const contabilTools: ToolEntry[] = [
  contabilPlanoDeContas as ToolEntry,
  contabilEstruturaConta as ToolEntry,
  contabilSaldoConta as ToolEntry,
  contabilMovimentoConta as ToolEntry,
  contabilResultadoPorNatureza as ToolEntry,
  contabilCentroCusto as ToolEntry,
  contabilContaReferencial as ToolEntry,
];
