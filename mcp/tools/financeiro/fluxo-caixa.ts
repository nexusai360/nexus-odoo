// mcp/tools/financeiro/fluxo-caixa.ts
// Tool MCP: financeiro_fluxo_caixa
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryFluxoCaixa } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const dados = z.object({
  serie: z.array(
    z.object({
      periodo: z.string(),
      realizado: z.number(),
      previsto: z.number(),
    }),
  ),
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

export const financeiroFluxoCaixa: ToolEntry<Input, Output> = {
  id: "financeiro_fluxo_caixa",
  dominio: "financeiro",
  descricao: "Série mensal de fluxo de caixa: realizado vs. previsto.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_financeiro_movimento"], async () =>
      queryFluxoCaixa(ctx.prisma, input),
    ),
};
