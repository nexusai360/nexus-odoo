// mcp/tools/comercial/pedidos-atrasados.ts
// Tool MCP: comercial_pedidos_atrasados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosAtrasados } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({});

// array "linhas" → ARRAY_KEYS_PRIORITY detecta vazio sem isVazio custom (P-M1)
const linhaSchema = z.object({
  pedidoId: z.number().int().nullable(),
  participanteNome: z.string().nullable(),
  numero: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  valor: z.number(),
  diasAtraso: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalAtrasado: z.number(),
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

function shape(d: Awaited<ReturnType<typeof queryPedidosAtrasados>>) {
  return {
    linhas: d.linhas.map((l) => ({
      ...l,
      dataVencimento: l.dataVencimento ? l.dataVencimento.toISOString() : null,
    })),
    totalAtrasado: d.totalAtrasado,
    aviso:
      "Atraso calculado por parcela de pedido com data de vencimento anterior a hoje e não faturada. " +
      "Atraso por dataPrevista do pedido tem preenchimento parcial e não é usado nesta tool.",
  };
}

export const comercialPedidosAtrasados: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_atrasados",
  dominio: "comercial",
  descricao: "Parcelas de pedidos vencidas e não faturadas, com valor total atrasado e dias de atraso.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido", "fato_pedido_parcela"], async () =>
      shape(await queryPedidosAtrasados(ctx.prisma, new Date())),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const todasLinhas = d.linhas;
    const linhasCap = todasLinhas.slice(0, 30);
    const maxDias = todasLinhas.reduce((m: number, l: { diasAtraso?: number }) => Math.max(m, Number(l.diasAtraso ?? 0)), 0);
    return enriquecerEnvelope(
      { ...envelope, dados: { ...d, linhas: linhasCap } },
      "comercial_pedidos_atrasados",
      {
        destaque: {
          totalAtrasados: todasLinhas.length,
          contagem: todasLinhas.length,
          valorEmRisco: d.totalAtrasado,
          valorTotal: d.totalAtrasado,
          maxDias,
          linhasExibidas: linhasCap.length,
        },
        agregado: { contagem: todasLinhas.length, soma: d.totalAtrasado },
        listaTruncada: todasLinhas.length > linhasCap.length,
      },
    );
  },
};
