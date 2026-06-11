// mcp/tools/fiscal/ponte-faturamento.ts
// Tool MCP: fiscal_ponte_faturamento , reconciliacao (waterfall) do faturamento bruto
// ate a receita externa real. Compoe as metricas canonicas (NAO os handlers).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { ponteFaturamento } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
});

const deducao = z.object({ categoria: z.string(), rotulo: z.string(), valor: z.number() });

const dados = z.object({
  brutoProdutos: z.number(),
  deducoesNaoReceita: z.array(deducao),
  totalNaoReceita: z.number(),
  receitaIndividual: z.number(),
  intragrupoEliminavel: z.number(),
  receitaExterna: z.number(),
  percentualEliminado: z.number(),
  reconciliado: z.boolean(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  // Contrato de lista (Fase B): deducoesNaoReceita segue a ordem do waterfall
  // (apresentacional), nao um ranking; declaramos isso ao LLM.
  ordenadoPor: z.string().optional(),
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

export const fiscalPonteFaturamento: ToolEntry<Input, Output> = {
  id: "fiscal_ponte_faturamento",
  dominio: "fiscal",
  descricao:
    "Ponte de reconciliacao do faturamento (waterfall): mostra como o faturamento bruto vira a receita externa real, deduzindo passo a passo a nao-receita (transferencia, devolucao, remessa, sem CFOP...) e o intercompany eliminado (CPC 36). Use para 'reconcilie o faturamento', 'como chegou na receita externa', 'do bruto ao liquido'. Aceita empresa e periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const ehEmpresa = escopo.empresaId !== undefined;
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal", "fato_nota_fiscal_item"], async () => {
      const r = await ponteFaturamento(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
      });
      const concentrador = ehEmpresa && r.percentualEliminado > 0.5;
      const avisoConc = concentrador
        ? " ATENCAO: visao consolidada (CPC 36) , a maior parte do faturamento desta empresa e intragrupo e foi eliminada; para o faturamento individual da empresa, use a receita individual."
        : "";
      return {
        ...r,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        ordenadoPor: "ordem do waterfall (apresentacional)",
        aviso:
          escopo.escopo.aviso +
          ` Periodo: ${per.label}.` +
          (per.assumido ? " (Nenhum periodo foi informado, entao considerei o ano corrente.)" : "") +
          " Bruto = soma dos itens (vrProdutos). A ordem das deducoes e apenas apresentacional." +
          avisoConc,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const deducoesJson = JSON.stringify(d.deducoesNaoReceita.slice(0, 8).map((x) => ({ rotulo: x.rotulo, valor: x.valor })));
    return enriquecerEnvelope(envelope, "fiscal_ponte_faturamento", {
      periodo: per,
      destaque: {
        brutoProdutos: d.brutoProdutos,
        totalNaoReceita: d.totalNaoReceita,
        receitaIndividual: d.receitaIndividual,
        intragrupoEliminavel: d.intragrupoEliminavel,
        receitaExterna: d.receitaExterna,
        percentualEliminado: d.percentualEliminado,
        concentrador: ehEmpresa && d.percentualEliminado > 0.5 ? 1 : 0,
        periodoLabel: per.label,
        deducoesJson,
      },
      agregado: { soma: d.receitaExterna, contagem: d.deducoesNaoReceita.length },
    });
  },
};
