// mcp/tools/financeiro/saldo-contas.ts
// Tool MCP: financeiro_saldo_contas
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { querySaldoContas } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  contas: z.array(
    z.object({
      bancoNome: z.string().nullable(),
      tipo: z.string().nullable(),
      saldo: z.number(),
    }),
  ),
  saldoTotal: z.number(),
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

export const financeiroSaldoContas: ToolEntry<Input, Output> = {
  id: "financeiro_saldo_contas",
  dominio: "financeiro",
  descricao: "Saldo atual de cada conta/banco.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_financeiro_saldo"], async () =>
      querySaldoContas(ctx.prisma),
    ),
};
