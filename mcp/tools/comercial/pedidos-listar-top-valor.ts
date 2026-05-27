// mcp/tools/comercial/pedidos-listar-top-valor.ts
// Tool MCP: comercial_pedidos_listar_top_valor
// Resolve "pedido com maior valor em aberto" do audit R12+R13.
// comercial_pedidos_periodo so retorna totais (nao lista); essa tool lista
// os top N pedidos por vrProdutos, opcionalmente filtrando por status
// (aberto = etapa_finaliza=false, cancelado nao incluido a menos que pedido).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  status: z.enum(["aberto", "fechado", "todos"]).optional().describe("Default: aberto (etapas nao finalizadoras)"),
  limite: z.number().int().min(1).max(50).optional(),
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const linhaSchema = z.object({
  pedidoId: z.number().int(),
  numero: z.string().nullable(),
  participanteNome: z.string().nullable(),
  etapaNome: z.string().nullable(),
  vendedorNome: z.string().nullable(),
  dataOrcamento: z.string().nullable(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalListados: z.number().int(),
  valorTotalListados: z.number(),
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

async function queryPedidosListarTopValor(prisma: PrismaClient, input: Input) {
  const status = input.status ?? "aberto";
  const limite = input.limite ?? 10;
  const where: Record<string, unknown> = {};
  if (status === "aberto") where.etapaFinaliza = false;
  else if (status === "fechado") where.etapaFinaliza = true;
  if (input.periodoDe || input.periodoAte) {
    where.dataOrcamento = {
      ...(input.periodoDe ? { gte: new Date(`${input.periodoDe}T00:00:00`) } : {}),
      ...(input.periodoAte ? { lte: new Date(`${input.periodoAte}T23:59:59`) } : {}),
    };
  }

  const rows = await prisma.fatoPedido.findMany({
    where,
    orderBy: { vrProdutos: "desc" },
    take: limite,
    select: {
      odooId: true,
      numero: true,
      participanteNome: true,
      etapaNome: true,
      vendedorNome: true,
      dataOrcamento: true,
      vrProdutos: true,
    },
  });

  const linhas = rows.map((r) => ({
    pedidoId: r.odooId,
    numero: r.numero,
    participanteNome: r.participanteNome,
    etapaNome: r.etapaNome,
    vendedorNome: r.vendedorNome,
    dataOrcamento: r.dataOrcamento ? r.dataOrcamento.toISOString() : null,
    valorTotal: Number(r.vrProdutos),
  }));

  return {
    linhas,
    totalListados: linhas.length,
    valorTotalListados: linhas.reduce((a, b) => a + b.valorTotal, 0),
  };
}

export const comercialPedidosListarTopValor: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_listar_top_valor",
  dominio: "comercial",
  descricao:
    "Lista os top N pedidos por VALOR (vrProdutos desc), opcionalmente filtrando " +
    "por status (aberto/fechado/todos) e periodo. Use para 'pedido com maior valor " +
    "em aberto', 'maiores pedidos', 'top 10 pedidos'. Retorna numero, participante, " +
    "etapa, vendedor, data e valor de cada pedido + valorTotalListados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_pedido"], () =>
      queryPedidosListarTopValor(ctx.prisma, input),
    ),
};
