// Engrenagem central de paginacao das tools de listagem.
//
// Otimizacao de custo (alavanca 2b): tools de lista grande entregam no maximo
// `limit` itens por vez (default 10), e o agente pede "os proximos" passando
// `offset = proximoOffset`. A mecanica (defaults, teto, metadados) vive aqui;
// a ORDENACAO ESTAVEL e o LIMIT/OFFSET no SQL ficam em cada tool/query, porque
// sao semantica especifica e nao podem ser terceirizadas sem virar bug.
//
// MCP e stateless: o offset NAO mora na tool, mora no historico da conversa.
//
// Spec: docs/superpowers/specs/2026-06-03-otimizacao-custo-agente-design.md §6.
import { z } from "zod";

export const PAGINACAO_LIMIT_DEFAULT = 10;
export const PAGINACAO_LIMIT_MAX = 50;

/** Shape Zod para espalhar (`...paginacaoInputShape`) no inputShape das tools. */
export const paginacaoInputShape = {
  limit: z
    .number()
    .int()
    .positive()
    .max(PAGINACAO_LIMIT_MAX)
    .optional()
    .describe("Quantos itens retornar por pagina (default 10, max 50)."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "A partir de qual item listar (0 = inicio). Para ver os proximos, passe o valor de proximoOffset que veio na resposta anterior.",
    ),
};

export interface PaginacaoMeta {
  /** Total de itens no recorte (independente da pagina). */
  total: number;
  /** Texto pronto: "1-10 de 100" (ou "0 de 0"). */
  mostrando: string;
  /** Ha mais itens alem desta pagina? */
  temMais: boolean;
  /** Offset para a proxima pagina, ou null quando nao ha mais. */
  proximoOffset: number | null;
}

/** Normaliza limit/offset com defaults e teto. */
export function resolverPaginacao(i: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(
    PAGINACAO_LIMIT_MAX,
    Math.max(1, i.limit ?? PAGINACAO_LIMIT_DEFAULT),
  );
  const offset = Math.max(0, i.offset ?? 0);
  return { limit, offset };
}

/** Monta os metadados a partir do total, da janela e de quantos itens vieram. */
export function montarPaginacaoMeta(
  total: number,
  offset: number,
  limit: number,
  retornados: number,
): PaginacaoMeta {
  const temMais = offset + retornados < total;
  const inicio = total === 0 || retornados === 0 ? 0 : offset + 1;
  const fim = offset + retornados;
  return {
    total,
    mostrando:
      total === 0 || retornados === 0 ? `0 de ${total}` : `${inicio}-${fim} de ${total}`,
    temMais,
    // offset + retornados (nao offset + limit): aponta para o primeiro item
    // ainda nao visto. Robusto mesmo se a tool filtrar/deduplicar a pagina
    // depois de paginar (retornados < limit no meio do fluxo) , nunca pula item.
    proximoOffset: temMais ? offset + retornados : null,
  };
}
