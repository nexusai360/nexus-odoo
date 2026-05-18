// mcp/tools/financeiro/contas-a-pagar.ts
// Tool MCP: financeiro_contas_a_pagar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContasAPagar } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  participanteId: z.number().int().positive().optional(),
});

// vrSaldo: valor correto a pagar em aberto na fonte finan.lancamento
//   (vrSaldo == vrDocumento == vrTotal quando aberto; vrSaldo=0 quando quitado).
//   Bug R1 corrigido em 2026-05-18 — fonte trocada de finan.pagamento.divida para finan.lancamento.
const tituloSchema = z.object({
  participanteNome: z.string().nullable(),
  numeroDocumento: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  vrSaldo: z.number(),
  vrTotal: z.number(),
  diasAtraso: z.number().int(),
});

const dados = z.object({
  titulos: z.array(tituloSchema),
  totalAPagar: z.number(),
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

function shape(d: Awaited<ReturnType<typeof queryContasAPagar>>) {
  return {
    titulos: d.titulos.map((t) => ({
      participanteNome: t.participanteNome,
      numeroDocumento: t.numeroDocumento,
      dataVencimento: t.dataVencimento ? t.dataVencimento.toISOString() : null,
      vrSaldo: t.vrSaldo,
      vrTotal: t.vrTotal,
      diasAtraso: t.diasAtraso,
    })),
    totalAPagar: d.totalAPagar,
  };
}

export const financeiroContasAPagar: ToolEntry<Input, Output> = {
  id: "financeiro_contas_a_pagar",
  dominio: "financeiro",
  descricao: "Títulos a pagar em aberto, com valor total e dias de atraso.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_financeiro_titulo"], async () =>
      shape(await queryContasAPagar(ctx.prisma, input, new Date())),
    ),
};
