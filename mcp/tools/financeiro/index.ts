// mcp/tools/financeiro/index.ts
// Índice do domínio de financeiro. Exporta o array de tools.
// Preenchido nas tasks 4d.1-t … 4d.7-t (uma tool por arquivo).
import type { ToolEntry } from "../../catalog/types.js";
import { financeiroSaldoContas } from "./saldo-contas.js";
import { financeiroAgingRecebiveis } from "./aging-recebiveis.js";
import { financeiroCaixaPeriodo } from "./caixa-periodo.js";
import { financeiroFluxoCaixa } from "./fluxo-caixa.js";
import { financeiroContasAReceber } from "./contas-a-receber.js";
import { financeiroContasAPagar } from "./contas-a-pagar.js";
import { financeiroTitulosVencidos } from "./titulos-vencidos.js";
import { financeiroLiquidez } from "./liquidez.js";
import { financeiroResultadoPorConta } from "./resultado-por-conta.js";
import {
  financeiroBaixasCobranca,
  financeiroRetornosProcessados,
  financeiroRemessasGeradas,
  financeiroCarteirasCobranca,
  financeiroCheques,
  financeiroPixRecebidos,
} from "./cobranca-bancaria.js";

export const financeiroTools: ToolEntry[] = [
  financeiroSaldoContas as ToolEntry,
  financeiroAgingRecebiveis as ToolEntry,
  financeiroCaixaPeriodo as ToolEntry,
  financeiroFluxoCaixa as ToolEntry,
  financeiroContasAReceber as ToolEntry,
  financeiroContasAPagar as ToolEntry,
  financeiroTitulosVencidos as ToolEntry,
  financeiroLiquidez as ToolEntry,
  financeiroResultadoPorConta as ToolEntry,
  // B3 , cobrança bancária
  financeiroBaixasCobranca as ToolEntry,
  financeiroRetornosProcessados as ToolEntry,
  financeiroRemessasGeradas as ToolEntry,
  financeiroCarteirasCobranca as ToolEntry,
  financeiroCheques as ToolEntry,
  financeiroPixRecebidos as ToolEntry,
];
