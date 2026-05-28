// mcp/tools/comercial/parcelas-a-vencer.ts
// Tool MCP: comercial_parcelas_a_vencer
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryParcelasAVencer } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  ateDias: z.number().int().positive().optional(),
});

// array "linhas" → ARRAY_KEYS_PRIORITY detecta vazio sem isVazio custom (P-M1)
const linhaSchema = z.object({
  pedidoId: z.number().int().nullable(),
  participanteNome: z.string().nullable(),
  numero: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  valor: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalAVencer: z.number(),
  aviso: z.string(),
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

function shape(d: Awaited<ReturnType<typeof queryParcelasAVencer>>) {
  return {
    linhas: d.linhas.map((l) => ({
      ...l,
      dataVencimento: l.dataVencimento ? l.dataVencimento.toISOString() : null,
    })),
    totalAVencer: d.totalAVencer,
    aviso: "Parcelas de pedidos com vencimento a partir de hoje até N dias (padrão 30), não faturadas, ordenadas por data.",
  };
}

export const comercialParcelasAVencer: ToolEntry<Input, Output> = {
  id: "comercial_parcelas_a_vencer",
  dominio: "comercial",
  descricao: "Parcelas de pedidos a vencer nos próximos N dias (padrão 30), com valor total a receber.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido_parcela"], async () =>
      shape(await queryParcelasAVencer(ctx.prisma, input, new Date())),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const todasLinhas = d.linhas;
    const linhasCap = todasLinhas.slice(0, 30);
    return enriquecerEnvelope(
      { ...envelope, dados: { ...d, linhas: linhasCap } },
      "comercial_parcelas_a_vencer",
      {
        destaque: {
          totalParcelas: todasLinhas.length,
          contagem: todasLinhas.length,
          valorTotal: d.totalAVencer,
          linhasExibidas: linhasCap.length,
        },
        agregado: { contagem: todasLinhas.length, soma: d.totalAVencer },
        listaTruncada: todasLinhas.length > linhasCap.length,
      },
    );
  },
};
