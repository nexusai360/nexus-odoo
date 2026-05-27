// mcp/tools/fiscal/faturamento-periodo.ts
// Tool MCP: fiscal_faturamento_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryFaturamentoPeriodo } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

// Onda 1.C: envelope canonico (_RESPOSTA + _DESTAQUE) aplicado.
const dados = z.object({
  totalNotas: z.number().int(),
  valorFaturado: z.number(),
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

function shape(d: Awaited<ReturnType<typeof queryFaturamentoPeriodo>>) {
  return {
    totalNotas: d.totalNotas,
    valorFaturado: d.valorFaturado,
    aviso:
      "Filtra apenas notas de saída autorizadas (entradaSaida='1', situacaoNfe='autorizada'). " +
      "Notas canceladas ou de entrada não são consideradas.",
  };
}

export const fiscalFaturamentoPeriodo: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_periodo",
  dominio: "fiscal",
  descricao: "Total de notas fiscais de saída autorizadas e valor faturado no período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal"],
      async () => shape(await queryFaturamentoPeriodo(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_periodo", {
      destaque: {
        totalNotas: envelope.dados.totalNotas,
        valorFaturado: envelope.dados.valorFaturado,
      },
      agregado: {
        soma: envelope.dados.valorFaturado,
        contagem: envelope.dados.totalNotas,
      },
    });
  },
};
