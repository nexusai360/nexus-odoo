// mcp/tools/comercial/pedidos-periodo.ts
// Tool MCP: comercial_pedidos_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosPeriodo } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

// dados só tem escalares — sem array; cai no ramo "ok" do withFreshness por não
// achar array em ARRAY_KEYS_PRIORITY (achado P-M1). Sem isVazio custom.
const dados = z.object({
  totalPedidos: z.number().int(),
  valorTotal: z.number(),
  aviso: z.string(),
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

function shape(d: Awaited<ReturnType<typeof queryPedidosPeriodo>>) {
  return {
    totalPedidos: d.totalPedidos,
    valorTotal: d.valorTotal,
    aviso:
      "Pedidos de venda/inventário. Não há pedido de compra neste módulo. " +
      "Valor usa vrProdutos (vr_produtos), valor do pedido independente de faturamento, consistente com pedidos_por_etapa e pedidos_por_vendedor. " +
      "Para a contagem-total do catálogo de pedidos use comercial_contar_pedidos.",
  };
}

export const comercialPedidosPeriodo: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_periodo",
  dominio: "comercial",
  descricao: "Total de pedidos e valor faturado no período informado.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_pedido"], async () =>
      shape(await queryPedidosPeriodo(ctx.prisma, input)),
    ),
};
