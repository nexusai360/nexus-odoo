// mcp/tools/fiscal/receita-consolidada.ts
// Tool MCP: fiscal_receita_consolidada , receita externa real (elimina intercompany, CPC 36)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { receitaConsolidada, receitaConsolidadaPorEmpresa } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
});

const dados = z.object({
  receitaExterna: z.number(),
  receitaIntragrupoEliminavel: z.number(),
  receitaIndividualTotal: z.number(),
  intercompanyBrutoVrProdutos: z.number(),
  notasIntragrupo: z.number().int(),
  notasExternas: z.number().int(),
  percentualEliminado: z.number(),
  // Faturamento real (e o eliminado) JÁ quebrado por empresa, em 1 chamada
  // (só vem no escopo do grupo todo). Evita o agente chamar a tool N vezes.
  porEmpresa: z
    .array(
      z.object({
        empresaId: z.number().nullable(),
        empresaNome: z.string().nullable(),
        receitaExterna: z.number(),
        receitaIntragrupoEliminavel: z.number(),
        receitaIndividualTotal: z.number(),
      }),
    )
    .optional(),
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

export const fiscalReceitaConsolidada: ToolEntry<Input, Output> = {
  id: "fiscal_receita_consolidada",
  dominio: "fiscal",
  descricao:
    "Receita consolidada externa do grupo (o faturamento real): vendas a clientes FORA do grupo, eliminando o intercompany (venda intragrupo, CPC 36). Mostra quanto do faturamento individual e venda entre empresas do grupo e foi eliminado. No escopo do grupo todo (sem empresaRef) JA retorna o campo `porEmpresa` com o faturamento real e o eliminado de CADA empresa numa unica chamada , use para 'faturamento real/verdadeiro por empresa', 'por empresa sem as vendas entre empresas', em vez de chamar a tool varias vezes. Aceita empresa e periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal", "fato_nota_fiscal_item"], async () => {
      const r = await receitaConsolidada(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
      });
      // Quebra por empresa só faz sentido no escopo do grupo todo (sem empresaRef).
      const porEmpresa = escopo.empresaId
        ? undefined
        : await receitaConsolidadaPorEmpresa(ctx.prisma, {
            periodoDe: per.periodoDe,
            periodoAte: per.periodoAte,
            empresaId: escopo.empresaId,
          });
      return {
        ...r,
        ...(porEmpresa ? { porEmpresa, ordenadoPor: "receita externa (real) desc" } : {}),
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso:
          escopo.escopo.aviso +
          ` Periodo: ${per.label}.` +
          (per.assumido ? " (Nenhum periodo foi informado, entao considerei o ano corrente.)" : "") +
          ` Receita consolidada externa elimina o intercompany (CPC 36); ${(r.percentualEliminado * 100).toFixed(1)}% da receita individual e venda intragrupo.`,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "fiscal_receita_consolidada", {
      periodo: per,
      destaque: {
        receitaExterna: d.receitaExterna,
        receitaIntragrupoEliminavel: d.receitaIntragrupoEliminavel,
        receitaIndividualTotal: d.receitaIndividualTotal,
        percentualEliminado: d.percentualEliminado,
      },
      agregado: { soma: d.receitaExterna, contagem: d.notasExternas },
    });
  },
};
