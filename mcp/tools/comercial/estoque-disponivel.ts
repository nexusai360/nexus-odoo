// mcp/tools/comercial/estoque-disponivel.ts
// Tool MCP: comercial_estoque_disponivel
// Estoque disponivel = saldo total menos o comprometido em demanda aberta, por
// produto. Pode ser NEGATIVO (precisa comprar). Dominio comercial (a base e a
// demanda). Responde "estoque disponivel de X", "o que precisa comprar",
// "produtos com estoque negativo".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryEstoqueDisponivel } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  produto: z.string().optional().describe("Nome ou codigo do produto (busca parcial)"),
  apenasNegativos: z.boolean().optional().describe("So os que precisam comprar (disponivel < 0)"),
  limite: z.number().int().min(1).max(100).optional(),
});

const linhaSchema = z.object({
  produtoId: z.number().int().nullable(),
  produtoNome: z.string().nullable(),
  saldo: z.number(),
  demanda: z.number(),
  demandaValorVenda: z.number(),
  demandaValorCusto: z.number(),
  disponivel: z.number(),
});

const dados = z.object({
  total: z.number().int(),
  negativos: z.number().int(),
  linhas: z.array(linhaSchema),
  /** Quando o job de atendimento completou pela ultima vez (null = nunca rodou). */
  atendimento_sincronizado_em: z.string().nullable(),
  /** true = demanda provisoria (caiu na quantidade cheia porque o job nao rodou). */
  parcial: z.boolean().optional(),
  _RESPOSTA: z.string().optional(),
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
function shape(d: Awaited<ReturnType<typeof queryEstoqueDisponivel>>) {
  const { atendimentoSincronizadoEm, parcial, ...resto } = d;
  return {
    ...resto,
    atendimento_sincronizado_em: atendimentoSincronizadoEm,
    ...(parcial ? { parcial: true } : {}),
  };
}

const AVISO_PARCIAL =
  "Valor provisório: o atendimento ainda não sincronizou hoje, então a demanda conta o " +
  "pedido inteiro (inclusive o que já foi entregue) e a falta pode estar exagerada.";

export const comercialEstoqueDisponivel: ToolEntry<Input, Output> = {
  id: "comercial_estoque_disponivel",
  dominio: "comercial",
  descricao:
    "Estoque disponivel por produto = saldo do estoque PRÓPRIO menos o que falta " +
    "entregar da demanda aberta (não o pedido inteiro). Fica NEGATIVO quando ha mais " +
    "demanda que saldo (precisa comprar). Traz também o valor dessa demanda a preço de " +
    "venda e a custo. Use para 'estoque disponivel de X', 'o que precisa comprar', " +
    "'produtos com estoque negativo'. Aceita busca por produto e recorte de negativos.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo", "fato_pedido_item", "fato_pedido"],
      async () => shape(await queryEstoqueDisponivel(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;

    const n = (v: number) => Math.round(v).toLocaleString("pt-BR");
    const primeiro = d.linhas[0];
    let resposta =
      d.total === 0
        ? "Nenhum produto encontrado para esse filtro."
        : input.produto && primeiro
          ? `${primeiro.produtoNome}: saldo ${n(primeiro.saldo)}, falta entregar ${n(primeiro.demanda)}, ` +
            `disponivel ${n(primeiro.disponivel)}${primeiro.disponivel < 0 ? " (precisa comprar)" : ""}.`
          : `${d.negativos} produtos com estoque negativo (precisam de compra). ` +
            `Mostrando ${d.linhas.length} com menor disponibilidade.`;
    if (d.parcial) resposta = `${resposta} ${AVISO_PARCIAL}`;

    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _DESTAQUE: { produtosNegativos: d.negativos },
      },
    };
  },
};
