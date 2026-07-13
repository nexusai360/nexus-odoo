// mcp/tools/comercial/demanda-por-produto.ts
// Tool MCP: comercial_demanda_por_produto
// Produto com mais demanda por QUANTIDADE, somando os itens dos pedidos em demanda
// aberta (bucket_demanda='ABERTA'). Responde "qual produto tem mais demanda",
// "produtos mais pedidos em aberto".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryDemandaPorProduto } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  limite: z.number().int().min(1).max(100).optional(),
  empresaId: z
    .number()
    .int()
    .optional()
    .describe("Recorte por empresa do grupo (odoo id). Omitido = demanda do grupo inteiro."),
});

const linhaSchema = z.object({
  produtoId: z.number().int().nullable(),
  produtoNome: z.string().nullable(),
  familiaNome: z.string().nullable(),
  quantidade: z.number(),
  valorProdutos: z.number(),
  valorCusto: z.number(),
});

const dados = z.object({
  totalProdutos: z.number().int(),
  linhas: z.array(linhaSchema),
  /** Quando o job de atendimento completou pela ultima vez (null = nunca rodou). */
  atendimento_sincronizado_em: z.string().nullable(),
  /** true = valor provisorio (caiu na quantidade cheia porque o job nao rodou). */
  parcial: z.boolean().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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

/** Renomeia o status do atendimento para o contrato do envelope (snake_case). */
function shape(d: Awaited<ReturnType<typeof queryDemandaPorProduto>>) {
  const { atendimentoSincronizadoEm, parcial, ...resto } = d;
  return {
    ...resto,
    atendimento_sincronizado_em: atendimentoSincronizadoEm,
    ...(parcial ? { parcial: true } : {}),
  };
}

const AVISO_PARCIAL =
  "Valor provisório: o atendimento ainda não sincronizou hoje, então a quantidade é a do " +
  "pedido inteiro (inclusive o que já foi entregue).";

export const comercialDemandaPorProduto: ToolEntry<Input, Output> = {
  id: "comercial_demanda_por_produto",
  dominio: "comercial",
  descricao:
    "Produto com mais demanda, por QUANTIDADE A ENTREGAR (o que falta, não o pedido " +
    "inteiro), somando os itens dos pedidos em demanda aberta (aprovados, sem nota ao " +
    "cliente). Traz o valor dessas unidades a preço de venda e a preço de custo. Use " +
    "para 'qual produto tem mais demanda', 'produtos mais pedidos em aberto', 'ranking " +
    "de demanda por item'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido_item", "fato_pedido"],
      async () => shape(await queryDemandaPorProduto(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;

    const top = d.linhas[0];
    let resposta =
      d.totalProdutos === 0
        ? "Nao ha itens em demanda aberta no momento."
        : `${d.totalProdutos} produtos com unidades a entregar. ` +
          `Maior demanda: ${top?.produtoNome ?? "?"} (${Math.round(top?.quantidade ?? 0)} un a entregar).`;
    if (d.parcial) resposta = `${resposta} ${AVISO_PARCIAL}`;

    const destaque: Record<string, string | number> = top
      ? { produtoTop: top.produtoNome ?? "?", quantidadeTop: Math.round(top.quantidade) }
      : {};

    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _listaTruncada: d.linhas.length < d.totalProdutos,
        _DESTAQUE: destaque,
      },
    };
  },
};
