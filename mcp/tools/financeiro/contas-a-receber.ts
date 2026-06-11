// mcp/tools/financeiro/contas-a-receber.ts
// Tool MCP: financeiro_contas_a_receber
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContasAReceber } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  participanteId: z.number().int().positive().optional(),
});

// vrSaldo: valor correto a receber em aberto na fonte finan.lancamento
//   (vrSaldo == vrDocumento == vrTotal quando aberto; vrSaldo=0 quando quitado).
//   Bug R1 corrigido em 2026-05-18 , fonte trocada de finan.pagamento.divida para finan.lancamento.
const tituloSchema = z.object({
  participanteNome: z.string().nullable(),
  numeroDocumento: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  vrSaldo: z.number(),
  vrTotal: z.number(),
  diasAtraso: z.number().int(),
  situacaoSimples: z.string().nullable(),
});

// Onda 1.B: envelope canonico do agente Nex aplicado.
const dados = z.object({
  titulos: z.array(tituloSchema),
  totalAReceber: z.number(),
  quebra: z.object({ confirmado: z.number(), provisorio: z.number() }),
  // Contrato de lista (Fase B): ordenacao declarada da lista `titulos`.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  topPorParticipante: z
    .array(
      z.object({ nome: z.string(), soma: z.number(), n: z.number().int() }),
    )
    .optional(),
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

function shape(d: Awaited<ReturnType<typeof queryContasAReceber>>) {
  return {
    titulos: d.titulos.map((t) => ({
      participanteNome: t.participanteNome,
      numeroDocumento: t.numeroDocumento,
      dataVencimento: t.dataVencimento ? t.dataVencimento.toISOString() : null,
      vrSaldo: t.vrSaldo,
      vrTotal: t.vrTotal,
      diasAtraso: t.diasAtraso,
      situacaoSimples: t.situacaoSimples,
    })),
    totalAReceber: d.totalAReceber,
    quebra: d.quebra,
    // A query ja devolve ordenado por vrSaldo desc (contrato de lista).
    ordenadoPor: "valor desc",
  };
}

export const financeiroContasAReceber: ToolEntry<Input, Output> = {
  id: "financeiro_contas_a_receber",
  dominio: "financeiro",
  descricao: "Títulos a receber em aberto, com valor total e dias de atraso.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_financeiro_titulo"],
      async () =>
        shape(await queryContasAReceber(ctx.prisma, input, new Date())),
    );
    if (envelope.estado === "preparando") return envelope;
    // T-20 (2026-05-27): expor `topMaiores` lista (top 10 ordenado por
    // vrSaldo desc) - resolve "Top 10 maiores contas a receber".
    const top10List = [...envelope.dados.titulos]
      .sort((a, b) => b.vrSaldo - a.vrSaldo)
      .slice(0, 10)
      .map((t) => ({
        nome: t.participanteNome ?? "",
        valor: t.vrSaldo,
        documento: t.numeroDocumento ?? "",
        diasAtraso: t.diasAtraso,
      }));
    const enriched = enriquecerEnvelope(envelope, "financeiro_contas_a_receber", {
      destaque: {
        totalAReceber: envelope.dados.totalAReceber,
        totalConfirmado: envelope.dados.quebra.confirmado,
        totalProvisorio: envelope.dados.quebra.provisorio,
        contagem: envelope.dados.titulos.length,
        topMaiorValor: top10List[0]?.valor ?? 0,
        topMaiorParticipante: top10List[0]?.nome ?? "",
      },
      titulos: envelope.dados.titulos,
      agregado: {
        soma: envelope.dados.totalAReceber,
        contagem: envelope.dados.titulos.length,
      },
    });
    if (enriched.estado !== "preparando") {
      (enriched.dados as unknown as Record<string, unknown>)["topMaiores"] = top10List;
    }
    return enriched;
  },
};
