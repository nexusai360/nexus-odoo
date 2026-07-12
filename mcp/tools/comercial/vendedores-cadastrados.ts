// mcp/tools/comercial/vendedores-cadastrados.ts
// Tool MCP: comercial_vendedores_cadastrados (Onda 3)
//
// Lista vendedores distintos da tabela fato_pedido (vendedor_id/nome).
// Resolve R15/R16 "Vendedores cadastrados" onde o agente tentava usar
// comercial_pedidos_por_vendedor com periodo restrito.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { resolverPeriodoCorte } from "../../lib/periodo-corte.js";
import { janelaClampada } from "@/lib/corte-dados.js";

const inputSchema = z.object({
  periodoDe: z.string().optional().describe("Início do período, AAAA-MM-DD."),
  periodoAte: z.string().optional().describe("Fim do período, AAAA-MM-DD."),
});

const linhaSchema = z.object({
  vendedorId: z.number().int(),
  vendedorNome: z.string().nullable(),
  totalPedidos: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalVendedores: z.number().int(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
  // Contrato de lista (Fase B): vendedores ordenados por quantidade de pedidos desc.
  ordenadoPor: z.string().optional(),
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

export const comercialVendedoresCadastrados: ToolEntry<Input, Output> = {
  id: "comercial_vendedores_cadastrados",
  dominio: "comercial",
  descricao:
    "Lista vendedores distintos que aparecem em pedidos, ordenados por quantidade de " +
    "pedidos. Use para 'vendedores cadastrados', 'lista de vendedores'. A contagem cobre " +
    "os pedidos dentro da janela de análise da plataforma (a partir da data de início das " +
    "análises); aceita período para estreitar mais.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    // A contagem por vendedor e um AGREGADO sobre documentos com data (fato_pedido), entao
    // respeita a data de inicio das analises: antes, `totalPedidos` somava pedidos de
    // qualquer epoca e nao batia com nenhuma outra tool/tela.
    const per = resolverPeriodoCorte(input.periodoDe, input.periodoAte);
    const j = janelaClampada(per.periodoDe, per.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido"],
      async () => {
        const rows = await ctx.prisma.fatoPedido.groupBy({
          by: ["vendedorId", "vendedorNome"],
          _count: { odooId: true },
          where: { vendedorId: { not: null }, dataOrcamento: { gte: j.gte, lt: j.lt } },
          // Onda 5: desempate estavel por vendedorId , top deterministico quando
          // dois vendedores tem a mesma contagem de pedidos.
          orderBy: [{ _count: { odooId: "desc" } }, { vendedorId: "asc" }],
        });
        const linhas = rows
          .filter((r): r is typeof r & { vendedorId: number } => r.vendedorId != null)
          .map((r) => ({
            vendedorId: r.vendedorId,
            vendedorNome: r.vendedorNome,
            totalPedidos: r._count.odooId,
          }));
        // Contrato de lista (Fase B): groupBy ordena por _count desc (desempate vendedorId).
        return {
          linhas,
          totalVendedores: linhas.length,
          ordenadoPor: "pedidos desc",
          periodoCoberto: per.label,
          ...(per.aviso ? { aviso: per.aviso } : {}),
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const top = envelope.dados.linhas[0];
    return enriquecerEnvelope(envelope, "comercial_vendedores_cadastrados", {
      periodo: per,
      destaque: {
        totalVendedores: envelope.dados.totalVendedores,
        topVendedor: top?.vendedorNome ?? "",
        pedidosTop: top?.totalPedidos ?? 0,
        periodoCoberto: per.label,
      },
      agregado: {
        contagem: envelope.dados.totalVendedores,
      },
    });
  },
};
