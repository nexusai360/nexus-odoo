// mcp/tools/fiscal/faturamento-por-regime.ts
// Tool MCP: fiscal_faturamento_por_regime , faturamento (receita de venda autorizada)
// agrupado pelo REGIME TRIBUTARIO da empresa emitente (Lucro Real / Presumido / Simples /
// MEI). Dois numeros por regime: externa (intragrupo eliminado) e individual (inclui intra).
// Regime = enquadramento ATUAL (snapshot de sped.empresa). Default ano corrente.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorRegime } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const empresaLinha = z.object({
  empresaId: z.number().nullable(),
  empresaNome: z.string().nullable(),
  receitaIndividual: z.number(),
});
const regimeLinha = z.object({
  regimeCodigo: z.string(),
  regimeLabel: z.string(),
  receitaIndividual: z.number(),
  receitaExterna: z.number(),
  qtdEmpresas: z.number(),
  qtdNotas: z.number(),
  empresas: z.array(empresaLinha),
});

const dados = z.object({
  regimes: z.array(regimeLinha),
  totalReceitaIndividual: z.number(),
  totalReceitaExterna: z.number(),
  receitaNaoMapeada: z.number(),
  coberturaPercentual: z.number(),
  regimeSnapshotAtual: z.boolean(),
  aviso: z.string(),
  // Contrato de lista (Fase B): regimes por receita externa desc, o regime
  // nao mapeado (quando houver) sempre por ultimo.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

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

export const fiscalFaturamentoPorRegime: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_regime",
  dominio: "fiscal",
  descricao:
    "Faturamento do periodo agrupado pelo REGIME TRIBUTARIO da empresa (Lucro Real, Lucro Presumido, Simples Nacional, MEI). Dois numeros por regime: receita externa (venda que sai do grupo, intragrupo eliminado) e individual (inclui venda intragrupo). O regime e o enquadramento ATUAL da empresa (snapshot); periodos antigos nao refletem mudanca de regime. Nao e apuracao de imposto nem lucro. Aceita periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal", "fato_nota_fiscal_item"],
      async () => {
        const r = await faturamentoPorRegime(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
        });
        const aviso =
          `Periodo: ${per.label}.` +
          (per.assumido ? " (Nenhum periodo foi informado, entao considerei o ano corrente.)" : "") +
          ` Receita EXTERNA elimina venda intragrupo (CPC 36); INDIVIDUAL inclui. Regime = enquadramento` +
          ` ATUAL da empresa (snapshot); periodos passados nao refletem mudanca de regime. Nao e imposto nem lucro.` +
          (r.coberturaPercentual < 1
            ? ` Cobertura: ${(r.coberturaPercentual * 100).toFixed(1)}% da receita tem regime mapeado.`
            : "");
        return { ...r, aviso, ordenadoPor: "receita externa desc" };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.regimes.map((rg) => ({
      rotulo: rg.regimeLabel,
      externa: rg.receitaExterna,
      individual: rg.receitaIndividual,
      empresas: rg.qtdEmpresas,
      notas: rg.qtdNotas,
    }));
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_regime", {
      destaque: {
        totalReceitaExterna: d.totalReceitaExterna,
        totalReceitaIndividual: d.totalReceitaIndividual,
        cobertura: d.coberturaPercentual,
        receitaNaoMapeada: d.receitaNaoMapeada,
        regimeSnapshotAtual: d.regimeSnapshotAtual ? 1 : 0,
        periodoLabel: per.label,
        topLinhasJson: JSON.stringify(top),
      },
      agregado: { soma: d.totalReceitaExterna, contagem: d.regimes.length },
    });
  },
};
