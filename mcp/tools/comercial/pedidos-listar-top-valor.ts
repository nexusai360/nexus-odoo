// mcp/tools/comercial/pedidos-listar-top-valor.ts
// Tool MCP: comercial_pedidos_listar_top_valor
// Resolve "pedido com maior valor em aberto" do audit R12+R13.
// comercial_pedidos_periodo so retorna totais (nao lista); essa tool lista
// os top N pedidos por vrProdutos, opcionalmente filtrando por status
// (aberto = etapa_finaliza=false, cancelado nao incluido a menos que pedido).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  status: z.enum(["aberto", "fechado", "todos"]).optional().describe("Default: aberto (etapas nao finalizadoras)"),
  limite: z.number().int().min(1).max(50).optional(),
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  ordenacao: z.enum(["valor_desc", "valor_asc", "data_asc", "data_desc"]).optional()
    .describe("Default: valor_desc (maiores por valor). Use data_asc para 'pedido mais antigo em aberto'."),
  clienteTermo: z.string().min(1).max(120).optional()
    .describe("Filtra pedidos do cliente que casa com o termo (busca em participanteNome)."),
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
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),

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
  const ordenacao = input.ordenacao ?? "valor_desc";
  const where: Record<string, unknown> = {};
  if (status === "aberto") where.etapaFinaliza = false;
  else if (status === "fechado") where.etapaFinaliza = true;
  if (input.periodoDe || input.periodoAte) {
    where.dataOrcamento = {
      ...(input.periodoDe ? { gte: new Date(`${input.periodoDe}T00:00:00`) } : {}),
      ...(input.periodoAte ? { lte: new Date(`${input.periodoAte}T23:59:59`) } : {}),
    };
  }
  if (input.clienteTermo) {
    where.participanteNome = { contains: input.clienteTermo, mode: "insensitive" };
  }

  const orderBy: Record<string, "asc" | "desc"> =
    ordenacao === "valor_asc"
      ? { vrProdutos: "asc" }
      : ordenacao === "data_asc"
        ? { dataOrcamento: "asc" }
        : ordenacao === "data_desc"
          ? { dataOrcamento: "desc" }
          : { vrProdutos: "desc" };

  const rows = await prisma.fatoPedido.findMany({
    where,
    orderBy,
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
    "Lista top N pedidos com filtros e ordenacao flexiveis. Use para: " +
    "'pedido com maior valor em aberto' (default), 'pedido mais antigo em aberto' " +
    "(ordenacao=data_asc), 'pedido mais recente' (ordenacao=data_desc), " +
    "'pedido do cliente Smartfit' (clienteTermo=Smartfit). Aceita status " +
    "(aberto/fechado/todos), periodo (DE/ATE) e limite (default 10).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido"], () =>
      queryPedidosListarTopValor(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados as { linhas: Array<{ valorTotal: number; numero?: string; participanteNome?: string | null }>; valorTotalListados?: number };
    const linhas = d.linhas ?? [];
    const top = linhas[0];
    return enriquecerEnvelope(envelope, "comercial_pedidos_listar_top_valor", {
      destaque: {
        // Nomes esperados pelo fmtPedidosListarTopValor do responder.ts.
        totalPedidos: linhas.length,
        topPedido: top?.numero ?? "",
        valorTopPedido: top?.valorTotal ?? 0,
        topParticipante: top?.participanteNome ?? "",
        valorTotalListados: d.valorTotalListados ?? linhas.reduce((s, l) => s + l.valorTotal, 0),
      },
      agregado: { contagem: linhas.length, soma: d.valorTotalListados ?? 0 },
    });
  },
};
