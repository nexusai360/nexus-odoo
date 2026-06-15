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

const inputSchema = z.object({});

const linhaSchema = z.object({
  vendedorId: z.number().int(),
  vendedorNome: z.string().nullable(),
  totalPedidos: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalVendedores: z.number().int(),
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
    "Lista vendedores distintos que aparecem em pedidos (histórico completo), " +
    "ordenados por quantidade de pedidos. Use para 'vendedores cadastrados', " +
    "'lista de vendedores'. Sem filtro de período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido"],
      async () => {
        const rows = await ctx.prisma.fatoPedido.groupBy({
          by: ["vendedorId", "vendedorNome"],
          _count: { odooId: true },
          where: { vendedorId: { not: null } },
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
        return { linhas, totalVendedores: linhas.length, ordenadoPor: "pedidos desc" };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const top = envelope.dados.linhas[0];
    return enriquecerEnvelope(envelope, "comercial_vendedores_cadastrados", {
      destaque: {
        totalVendedores: envelope.dados.totalVendedores,
        topVendedor: top?.vendedorNome ?? "",
        pedidosTop: top?.totalPedidos ?? 0,
      },
      agregado: {
        contagem: envelope.dados.totalVendedores,
      },
    });
  },
};
