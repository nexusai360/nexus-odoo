// mcp/tools/estoque/saldo-produto.ts
// Tool MCP: estoque_saldo_produto
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { querySaldoProduto } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { humanizeName } from "@/lib/agent/text-normalize.js";

const inputSchema = z.object({
  armazemId: z.number().int().positive().optional(),
  familiaId: z.number().int().positive().optional(),
  /** Filtra por nome do produto (busca parcial) , use para perguntas sobre
   * o saldo de um produto específico. Aceita o nome ou o código do produto. */
  termo: z.string().min(1).max(120).optional(),
});

const linha = z.object({
  produtoNome: z.string(),
  familiaNome: z.string().nullable(),
  marcaNome: z.string().nullable(),
  saldoTotal: z.number(),
  valorTotal: z.number(),
  numLocais: z.number().int(),
  /** true quando produto existe no cadastro mas sem linha de saldo. */
  semEstoqueCadastrado: z.boolean().optional(),
  /** Microcopy de contexto para o agente. */
  mensagemContexto: z.string().optional(),
});

/**
 * Sinal de ambiguidade: presente apenas quando a busca por `termo` retornou
 * mais de um produto. O agente deve usar isso para perguntar ao usuario qual
 * dos candidatos ele quer, em vez de escolher arbitrariamente. Veja regra
 * em identity-base.ts secao [DESAMBIGUACAO].
 */
const ambiguidade = z
  .object({
    totalMatches: z.number().int(),
    layer: z.enum(["exact", "fuzzy", "none"]),
    topCandidates: z
      .array(
        z.object({
          id: z.number().int().optional(),
          nome: z.string(),
          context: z.string().optional(),
        }),
      )
      .max(5),
  })
  .optional();

const dados = z.object({
  kpis: z.object({
    totalProdutos: z.number().int(),
    produtosNegativos: z.number().int(),
    valorTotal: z.number(),
  }),
  linhas: z.array(linha),
  ambiguidade,
});

const fonteStatus = z.object({
  status: z.string(),
  ultimaSyncEm: z.string().nullable(),
});

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados,
    atualizadoEm: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof querySaldoProduto>>) {
  // Onda C v3: normaliza nomes vindos do Odoo (CAIXA ALTA) para Title Case
  // antes de devolver ao agente. Preserva codigos/modelos (ver helper).
  // O agente recebe ja humanizado e cita textualmente; nao precisa instrucao
  // extra no prompt para "deixar bonito".
  const linhas = d.linhas.map((l) => ({
    produtoNome: humanizeName(l.produtoNome),
    familiaNome: l.familiaNome ? humanizeName(l.familiaNome) : l.familiaNome,
    marcaNome: l.marcaNome ? humanizeName(l.marcaNome) : l.marcaNome,
    saldoTotal: l.saldoTotal,
    valorTotal: l.valorTotal,
    numLocais: l.numLocais,
    ...(l.semEstoqueCadastrado ? { semEstoqueCadastrado: true } : {}),
    ...(l.mensagemContexto ? { mensagemContexto: l.mensagemContexto } : {}),
  }));

  // Preenche o sinal de ambiguidade quando a busca por termo casou com mais
  // de um produto. O top de candidatos vem das primeiras 5 linhas (ja
  // ordenadas por valorTotal desc), com contexto compacto (familia, saldo).
  let ambiguidade:
    | {
        totalMatches: number;
        layer: "exact" | "fuzzy" | "none";
        topCandidates: { nome: string; context?: string }[];
      }
    | undefined;
  if (d.buscaMeta && d.buscaMeta.totalMatches > 1) {
    ambiguidade = {
      totalMatches: d.buscaMeta.totalMatches,
      layer: d.buscaMeta.layer,
      topCandidates: linhas.slice(0, 5).map((l) => ({
        nome: l.produtoNome,
        context:
          l.familiaNome != null
            ? `${l.familiaNome} · saldo ${l.saldoTotal}`
            : `saldo ${l.saldoTotal}`,
      })),
    };
  }

  return { kpis: d.kpis, linhas, ambiguidade };
}

export const estoqueSaldoProduto: ToolEntry<Input, Output> = {
  id: "estoque_saldo_produto",
  dominio: "estoque",
  descricao:
    "Saldo de estoque por produto: unidades e valor a custo, com nº de " +
    "localizações. Para o saldo de um produto específico, passe `termo` com " +
    "o nome ou o código do produto.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_estoque_saldo"], async () =>
      shape(await querySaldoProduto(ctx.prisma, input)),
    ),
};
