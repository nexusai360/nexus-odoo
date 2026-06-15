// mcp/tools/fiscal/faturamento-periodo.ts
// Tool MCP: fiscal_faturamento_periodo
// Fase 2.5: passa a responder o numero REAL (receita externa sem intercompany como
// headline do grupo; faturamento individual da CNPJ quando filtra empresa), via a
// camada canonica receitaConsolidada. Conserta o +69% inflado da versao antiga.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { receitaConsolidada } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
});

// Headline decidido no HANDLER: grupo -> receita externa (CPC 36); empresa -> individual.
const dados = z.object({
  receitaExterna: z.number(),
  receitaIndividual: z.number(),
  intragrupoEliminavel: z.number(),
  percentualEliminado: z.number(),
  notasExternas: z.number().int(),
  notasIntragrupo: z.number().int(),
  headlineValor: z.number(),
  headlineRotulo: z.string(),
  concentrador: z.boolean(),
  periodoLabel: z.string(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
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

export const fiscalFaturamentoPeriodo: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_periodo",
  dominio: "fiscal",
  descricao: "Total de notas fiscais de saída autorizadas e valor faturado no período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await receitaConsolidada(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
      });
      const ehEmpresa = escopo.empresaId !== undefined;
      const headlineValor = ehEmpresa ? r.receitaIndividualTotal : r.receitaExterna;
      const headlineRotulo = ehEmpresa
        ? "Faturamento da empresa"
        : "Faturamento do grupo";
      const concentrador = r.percentualEliminado > 0.5;
      // Sem jargao (intercompany/intragrupo): linguagem natural na base de fatos.
      const avisoBase = ehEmpresa
        ? "Faturamento total da empresa, incluindo o que ela vendeu para outras empresas do grupo."
        : "Faturamento real do grupo (vendas para fora); vendas entre empresas do mesmo grupo nao entram, para nao contar duas vezes.";
      return {
        receitaExterna: r.receitaExterna,
        receitaIndividual: r.receitaIndividualTotal,
        intragrupoEliminavel: r.receitaIntragrupoEliminavel,
        percentualEliminado: r.percentualEliminado,
        notasExternas: r.notasExternas,
        notasIntragrupo: r.notasIntragrupo,
        headlineValor,
        headlineRotulo,
        concentrador,
        periodoLabel: per.label,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso: `${avisoBase} Período: ${per.label}. ${escopo.escopo.aviso}`,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_periodo", {
      periodo: per,
      destaque: {
        headlineValor: d.headlineValor,
        headlineRotulo: d.headlineRotulo,
        receitaExterna: d.receitaExterna,
        receitaIndividual: d.receitaIndividual,
        intragrupoEliminavel: d.intragrupoEliminavel,
        percentualEliminado: d.percentualEliminado,
        notasExternas: d.notasExternas,
        concentrador: d.concentrador ? 1 : 0,
        periodoLabel: d.periodoLabel,
      },
      agregado: {
        soma: d.headlineValor,
        contagem: d.notasExternas,
      },
    });
  },
};
