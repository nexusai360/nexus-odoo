// Engrenagem central de paginacao das tools de listagem.
//
// Otimizacao de custo (alavanca 2b): tools de lista grande entregam no maximo
// `limit` itens por vez (default 50, F4 Apresentacao), e o agente pede "os
// proximos" passando `offset = proximoOffset`. A mecanica (defaults, teto,
// metadados) vive aqui; a ORDENACAO ESTAVEL e o LIMIT/OFFSET no SQL ficam em
// cada tool/query, porque sao semantica especifica e nao podem ser
// terceirizadas sem virar bug.
//
// MCP e stateless: o offset NAO mora na tool, mora no historico da conversa.
//
// F4 Apresentacao (Onda 2): default 10 -> 50 (decisao canonica #1, paginacao
// 50/50). Algumas tools de LINHA RICA cabem em menos que 50 dentro do teto de
// 24KB; essas passam um `tetoTool` proprio (medido por bytes/linha de pior
// caso, ver Task 2.3), e `limiteEfetivo`/`resolverPaginacao` respeitam o menor.
//
// Spec: docs/superpowers/specs/2026-06-03-otimizacao-custo-agente-design.md §6
//   + docs/superpowers/specs/2026-06-07-f4-apresentacao-design.md.
import { z } from "zod";

export const PAGINACAO_LIMIT_DEFAULT = 50;
export const PAGINACAO_LIMIT_MAX = 50;

/** Shape Zod para espalhar (`...paginacaoInputShape`) no inputShape das tools. */
export const paginacaoInputShape = {
  limit: z
    .number()
    .int()
    .positive()
    .max(PAGINACAO_LIMIT_MAX)
    .optional()
    .describe("Quantos itens retornar por pagina (default 50, max 50)."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "A partir de qual item listar (0 = inicio). Para ver os proximos, passe o valor de proximoOffset que veio na resposta anterior.",
    ),
};

/**
 * Limite efetivo de uma pagina: o MENOR entre o que o agente pediu (ou o default
 * 50) e o teto especifico da tool (ou o max 50). Fonte unica do "quantas linhas
 * cabem nesta pagina" para guard e SQL , o teto-por-byte (`tetoTool`) e o
 * mecanismo de tools de linha rica caberem em 24KB (Task 2.3). Sempre >=1 e
 * nunca acima de `PAGINACAO_LIMIT_MAX`.
 */
export function limiteEfetivo(pedido?: number, tetoTool?: number): number {
  const alvo = Math.min(
    pedido ?? PAGINACAO_LIMIT_DEFAULT,
    tetoTool ?? PAGINACAO_LIMIT_MAX,
  );
  return Math.min(PAGINACAO_LIMIT_MAX, Math.max(1, alvo));
}

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

/** Normaliza limit/offset com defaults e teto. `tetoTool` (opcional) reduz o
 *  limite efetivo para tools de linha rica (teto-por-byte, Task 2.3). */
export function resolverPaginacao(
  i: { limit?: number; offset?: number },
  tetoTool?: number,
): {
  limit: number;
  offset: number;
} {
  const limit = limiteEfetivo(i.limit, tetoTool);
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
