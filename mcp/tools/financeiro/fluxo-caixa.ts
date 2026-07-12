// mcp/tools/financeiro/fluxo-caixa.ts
// Tool MCP: financeiro_fluxo_caixa
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryFluxoCaixa } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { resolverPeriodoCorte } from "../../lib/periodo-corte.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

// Onda 1.B: envelope canonico aplicado (sem topPorParticipante -- fluxo
// nao tem dimensao participante natural).
const dados = z.object({
  // Contrato de lista (Fase B): ordenacao declarada.
  ordenadoPor: z.string().optional(),
  serie: z.array(
    z.object({
      periodo: z.string(),
      realizado: z.number(),
      previsto: z.number(),
    }),
  ),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
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

export const financeiroFluxoCaixa: ToolEntry<Input, Output> = {
  id: "financeiro_fluxo_caixa",
  dominio: "financeiro",
  descricao: "Série mensal de fluxo de caixa: realizado vs. previsto.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    // Serie mensal de realizado x previsto sobre movimento financeiro: historico puro. Sem
    // periodo, a serie nascia com meses anteriores a data de inicio das analises.
    const per = resolverPeriodoCorte(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_financeiro_movimento"],
      async () => ({
        ...(await queryFluxoCaixa(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
        })),
        periodoCoberto: per.label,
        ...(per.aviso ? { aviso: per.aviso } : {}),
      }),
    );
    if (envelope.estado === "preparando") return envelope;
    const totalRealizado = envelope.dados.serie.reduce(
      (s, p) => s + p.realizado,
      0,
    );
    const totalPrevisto = envelope.dados.serie.reduce(
      (s, p) => s + p.previsto,
      0,
    );
    return enriquecerEnvelope(envelope, "financeiro_fluxo_caixa", {
      periodo: per,
      destaque: {
        realizadoTotal: totalRealizado,
        previstoTotal: totalPrevisto,
        contagemPeriodos: envelope.dados.serie.length,
        periodoCoberto: per.label,
      },
      agregado: {
        soma: totalRealizado + totalPrevisto,
        contagem: envelope.dados.serie.length,
      },
    });
  },
};
