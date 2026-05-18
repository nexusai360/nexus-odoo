// mcp/tools/financeiro/titulos-vencidos.ts
// Tool MCP: financeiro_titulos_vencidos
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryTitulosVencidos } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const tituloSchema = z.object({
  tipo: z.string(),
  participanteNome: z.string().nullable(),
  numeroDocumento: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  vrSaldo: z.number(),
  diasAtraso: z.number().int(),
});

const dados = z.object({
  titulos: z.array(tituloSchema),
  totalVencido: z.number(),
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

function shape(d: Awaited<ReturnType<typeof queryTitulosVencidos>>) {
  return {
    titulos: d.titulos.map((t) => ({
      tipo: t.tipo,
      participanteNome: t.participanteNome,
      numeroDocumento: t.numeroDocumento,
      dataVencimento: t.dataVencimento ? t.dataVencimento.toISOString() : null,
      vrSaldo: t.vrSaldo,
      diasAtraso: t.diasAtraso,
    })),
    totalVencido: d.totalVencido,
  };
}

export const financeiroTitulosVencidos: ToolEntry<Input, Output> = {
  id: "financeiro_titulos_vencidos",
  dominio: "financeiro",
  descricao: "Todos os títulos vencidos e não pagos (a receber e a pagar), com dias de atraso.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_financeiro_titulo"], async () =>
      shape(await queryTitulosVencidos(ctx.prisma, new Date())),
    ),
};
