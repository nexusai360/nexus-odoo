// mcp/lib/classificacao.ts
//
// Escopo da arvore de locais, igual em TODAS as tools de estoque.
//
// A arvore do Odoo tem tres raizes e a plataforma somava as tres: so "Próprio" e
// estoque da casa (R$ 29,85 mi), "Virtual" (R$ 10,2 mi) e "Terceiros" (R$ 6,1 mi)
// ficam de fora, e "Terceiros / Demonstração" (R$ 1,56 mi) e um bucket a parte. A
// diretoria ja fala esse numero; o agente Nex tem que falar o mesmo, senao a mesma
// pergunta passa a ter dois numeros oficiais.
//
// Por isso o padrao e "fisico": quem pergunta "quanto vale nosso estoque?" quer o
// estoque da casa. "todos" existe para quem quiser explicitamente a arvore inteira.
import { z } from "zod";

export const DESCRICAO_CLASSIFICACAO =
  "Escopo dos locais: 'fisico' (padrão, só o estoque próprio da casa, o mesmo número " +
  "do painel da diretoria), 'demonstracao' (equipamentos em demonstração, na árvore " +
  "Terceiros/Demonstração) ou 'todos' (a árvore inteira, incluindo locais virtuais e " +
  "em poder de terceiros).";

/** Fragmento de input compartilhado. Espalhe com `...classificacaoInputShape`. */
export const classificacaoInputShape = {
  classificacao: z
    .enum(["fisico", "demonstracao", "todos"])
    .default("fisico")
    .describe(DESCRICAO_CLASSIFICACAO),
};

/** Rotulo curto para o texto de resposta e para o destaque do envelope. */
export function rotuloClassificacao(
  classificacao: "fisico" | "demonstracao" | "todos",
): string {
  return {
    fisico: "estoque próprio",
    demonstracao: "estoque em demonstração",
    todos: "todos os locais",
  }[classificacao];
}
