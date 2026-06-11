// mcp/tools/fiscal/margem-aproximada.ts
// Tool MCP: fiscal_margem_aproximada , margem BRUTA aproximada (receita de venda - custo
// estimado do produto). NAO e lucro. Default ano corrente (custo e snapshot atual).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { margemAproximada } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
  agruparPor: z.enum(["total", "familia"]).optional()
    .describe("familia = margem aproximada POR FAMILIA de produto (top 15 por receita)."),
});

const dados = z.object({
  receitaVendaTotal: z.number(),
  receitaComCusto: z.number(),
  custoEstimado: z.number(),
  margemBrutaAproximada: z.number(),
  percentualMargem: z.number(),
  coberturaCusto: z.number(),
  receitaSemCusto: z.number(),
  custoDesatualizadoProvavel: z.boolean(),
  familias: z.array(z.object({ familia: z.string().nullable(), receita: z.number(), custoEstimado: z.number(), margem: z.number(), percentualMargem: z.number() })).optional(),
  ordenadoPor: z.string().optional(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalMargemAproximada: ToolEntry<Input, Output> = {
  id: "fiscal_margem_aproximada",
  dominio: "fiscal",
  descricao:
    "Margem bruta APROXIMADA do periodo: receita de venda menos o custo estimado do produto (preco_custo). NAO e lucro (sem despesas/impostos/rateios) e o custo e o atual do produto (margem de periodos antigos e nao-confiavel). Mostra a cobertura (% da venda com custo disponivel). Aceita empresa e periodo. Use `agruparPor: 'familia'` para a margem POR FAMILIA de produto ('margem por familia', 'qual familia tem mais margem').",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal_item", "fato_produto"], async () => {
      const r = await margemAproximada(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
        porFamilia: input.agruparPor === "familia",
      });
      const ressalvaCusto = r.custoDesatualizadoProvavel
        ? " ATENCAO: parte dos itens tem custo maior que a receita (o preco_custo e o ATUAL do produto, aplicado retroativamente); a margem pode estar distorcida , confie mais em periodos recentes."
        : "";
      return {
        ...r,
        // Contrato de lista: familias vem ordenadas por receita desc na metrica.
        ...(r.familias ? { ordenadoPor: "receita desc" } : {}),
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso:
          escopo.escopo.aviso +
          ` Periodo: ${per.label}.` +
          (per.assumido ? " (Nenhum periodo foi informado, entao considerei o ano corrente.)" : "") +
          ` Margem BRUTA aproximada (receita de venda - custo do produto); NAO e lucro (sem despesas/impostos/rateios).` +
          ` Cobertura: ${(r.coberturaCusto * 100).toFixed(1)}% da venda tem custo disponivel. Inclui vendas intragrupo.` +
          ressalvaCusto,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "fiscal_margem_aproximada", {
      periodo: per,
      destaque: {
        receitaComCusto: d.receitaComCusto,
        custoEstimado: d.custoEstimado,
        margemBrutaAproximada: d.margemBrutaAproximada,
        percentualMargem: d.percentualMargem,
        coberturaCusto: d.coberturaCusto,
        custoDesatualizado: d.custoDesatualizadoProvavel ? 1 : 0,
        periodoLabel: per.label,
        // O formatador so ve o _DESTAQUE (stub): o detalhamento por familia
        // viaja resumido aqui (a lista completa segue em dados.familias).
        ...(d.familias?.length
          ? {
              familiasResumo: d.familias
                .slice(0, 8)
                .map((f) => `${f.familia ?? "(sem família)"}: margem R$ ${f.margem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${(f.percentualMargem * 100).toFixed(1)}%)`)
                .join("; "),
            }
          : {}),
      },
      agregado: { soma: d.margemBrutaAproximada, contagem: 0 },
    });
  },
};
