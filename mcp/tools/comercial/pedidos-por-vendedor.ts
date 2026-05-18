// mcp/tools/comercial/pedidos-por-vendedor.ts
// Tool MCP: comercial_pedidos_por_vendedor
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosPorVendedor } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

// array "linhas" → ARRAY_KEYS_PRIORITY detecta vazio sem isVazio custom (P-M1)
const linhaSchema = z.object({
  vendedorNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
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

function shape(d: Awaited<ReturnType<typeof queryPedidosPorVendedor>>) {
  return {
    linhas: d.linhas,
    aviso: "Ranking de pedidos por vendedor, ordenado por valor total decrescente. valorTotal usa vrProdutos (valor do pedido, independente de faturamento).",
  };
}

export const comercialPedidosPorVendedor: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_por_vendedor",
  dominio: "comercial",
  descricao: "Ranking de pedidos por vendedor no período, com quantidade e valor total.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_pedido"], async () =>
      shape(await queryPedidosPorVendedor(ctx.prisma, input)),
    ),
};
