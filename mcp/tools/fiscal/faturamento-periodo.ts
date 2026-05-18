// mcp/tools/fiscal/faturamento-periodo.ts
// Tool MCP: fiscal_faturamento_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryFaturamentoPeriodo } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

// dados só tem escalares — sem array; cai no ramo "ok" do withFreshness
// (sem isVazio custom — achado P-M1).
const dados = z.object({
  totalNotas: z.number().int(),
  valorFaturado: z.number(),
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
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(await queryFaturamentoPeriodo(ctx.prisma, input)),
    ),
};
