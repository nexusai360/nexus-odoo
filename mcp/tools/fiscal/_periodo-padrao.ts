// mcp/tools/fiscal/_periodo-padrao.ts
// Resolve o periodo das tools fiscais. Sem periodo informado, o cache acumula ANOS
// (2013..hoje) e o numero fica enganoso. Decisao do usuario (2026-06-09): assumir o
// ANO CORRENTE como default, e a resposta SEMPRE explicita o periodo coberto.

import { CORTE_DADOS_ISO } from "@/worker/sync/corte.js";

/**
 * Texto honesto padrao quando o periodo pedido e inteiramente anterior ao
 * corte de dados (Limpa 2026+, spec §5). O cache nao guarda pre-2026; dizer
 * "nao ha registros" seria mentira , os dados existem, mas so no Odoo.
 */
export const TEXTO_HONESTO_PRE_CORTE =
  "O cache guarda apenas dados de 2026 em diante. Para esse periodo nao ha " +
  "registros aqui: dados de 2025 e anteriores permanecem no Odoo, mas nao " +
  "sao consultaveis pelo Nex.";

export interface PeriodoResolvido {
  periodoDe: string;
  periodoAte: string;
  /** true quando o periodo foi assumido (ano corrente), nao informado pelo usuario. */
  assumido: boolean;
  /** rotulo legivel para a resposta, ex.: "2026 (ano corrente, ate 2026-06-09)". */
  label: string;
  /** true quando o periodo pedido termina ANTES do corte de dados (cache vazio por regra). */
  preCorte: boolean;
}

/**
 * Usa `de`+`ate` quando o PAR esta completo; senao assume o ano corrente (1o de janeiro
 * ate hoje). `hoje` e injetavel para teste determinístico.
 */
export function resolverPeriodoFiscal(
  de: string | undefined,
  ate: string | undefined,
  hoje: Date = new Date(),
): PeriodoResolvido {
  if (de && ate) {
    return {
      periodoDe: de,
      periodoAte: ate,
      assumido: false,
      label: `${de} a ${ate}`,
      preCorte: ate.slice(0, 10) < CORTE_DADOS_ISO,
    };
  }
  const ano = hoje.getUTCFullYear();
  const hojeStr = hoje.toISOString().slice(0, 10);
  return {
    periodoDe: `${ano}-01-01`,
    periodoAte: hojeStr,
    assumido: true,
    label: `${ano} (ano corrente, ate ${hojeStr})`,
    preCorte: false,
  };
}
