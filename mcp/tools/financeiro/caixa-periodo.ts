// mcp/tools/financeiro/caixa-periodo.ts
// Tool MCP: financeiro_caixa_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryCaixaPeriodo } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const dados = z.object({
  entrada: z.number(),
  saida: z.number(),
  saldo: z.number(),
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

export const financeiroCaixaPeriodo: ToolEntry<Input, Output> = {
  id: "financeiro_caixa_periodo",
  dominio: "financeiro",
  descricao: "Entradas, saídas e saldo de caixa realizado em um período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_financeiro_movimento"], async () =>
      queryCaixaPeriodo(ctx.prisma, input),
    ),
};
