// mcp/tools/comercial/detalhar-pedido.ts
// Tool MCP: comercial_detalhar_pedido
//
// Retorna o detalhe completo de um pedido (numero, tipo, etapa, participante,
// vendedor, empresa, datas e valores) a partir do odooId. Use depois de uma
// listagem de pedidos quando o usuario pedir o detalhe de um pedido especifico.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  odooId: z.number().int().positive(),
});

const dados = z.object({
  encontrado: z.boolean(),
  pedido: z
    .object({
      odooId: z.number().int(),
      numero: z.string().nullable(),
      tipo: z.string().nullable(),
      etapaNome: z.string().nullable(),
      etapaFinaliza: z.boolean(),
      participanteNome: z.string().nullable(),
      vendedorNome: z.string().nullable(),
      empresaNome: z.string().nullable(),
      dataOrcamento: z.string().nullable(),
      dataAprovacao: z.string().nullable(),
      vrProdutos: z.number(),
      vrNf: z.number(),
    })
    .nullable(),
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const comercialDetalharPedido: ToolEntry<Input, Output> = {
  id: "comercial_detalhar_pedido",
  dominio: "comercial",
  descricao: "Detalhe completo de um pedido a partir do odooId.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido"],
      async () => {
        const row = await ctx.prisma.fatoPedido.findFirst({
          where: { odooId: input.odooId },
        });
        if (!row) return { encontrado: false, pedido: null };
        return {
          encontrado: true,
          pedido: {
            odooId: row.odooId,
            numero: row.numero,
            tipo: row.tipo,
            etapaNome: row.etapaNome,
            etapaFinaliza: row.etapaFinaliza,
            participanteNome: row.participanteNome,
            vendedorNome: row.vendedorNome,
            empresaNome: row.empresaNome,
            dataOrcamento: row.dataOrcamento ? row.dataOrcamento.toISOString() : null,
            dataAprovacao: row.dataAprovacao ? row.dataAprovacao.toISOString() : null,
            vrProdutos: Number(row.vrProdutos),
            vrNf: Number(row.vrNf),
          },
        };
      },
      (d) => !d.encontrado,
    );
    if (envelope.estado === "preparando") return envelope;
    const p = envelope.dados.pedido;
    return enriquecerEnvelope(envelope, "comercial_detalhar_pedido", {
      destaque: p
        ? {
            numero: p.numero ?? "",
            tipo: p.tipo ?? "",
            etapa: p.etapaNome ?? "",
            participante: p.participanteNome ?? "",
            vendedor: p.vendedorNome ?? "",
            vrProdutos: p.vrProdutos,
            vrNf: p.vrNf,
          }
        : { encontrado: "nao" },
    });
  },
};
