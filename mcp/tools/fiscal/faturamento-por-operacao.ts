// mcp/tools/fiscal/faturamento-por-operacao.ts
// Tool MCP: fiscal_faturamento_por_operacao (natureza de operacao + flag ehVenda)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorOperacao } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape } from "../../lib/paginacao.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
  ...paginacaoInputShape,
});

const linha = z.object({
  naturezaOperacaoId: z.number().int().nullable(),
  naturezaOperacaoNome: z.string().nullable(),
  ehVenda: z.boolean(),
  totalNotas: z.number().int(),
  valor: z.number(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  valorGeral: z.number(),
  valorVenda: z.number(),
  valorNaoVenda: z.number(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
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

export const fiscalFaturamentoPorOperacao: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_operacao",
  dominio: "fiscal",
  descricao: "Faturamento de saida autorizado por natureza de operacao fiscal, com flag de venda vs nao-venda. Aceita empresa.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await faturamentoPorOperacao(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
        limit: input.limit,
        offset: input.offset,
      });
      return {
        linhas: r.linhas,
        total: r.total,
        valorGeral: r.valorGeral,
        valorVenda: r.valorVenda,
        valorNaoVenda: r.valorNaoVenda,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso: `Período: ${per.label}. ${escopo.escopo.aviso}`,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_operacao", {
      destaque: { valorGeral: envelope.dados.valorGeral, valorVenda: envelope.dados.valorVenda },
      agregado: { soma: envelope.dados.valorGeral, contagem: envelope.dados.total },
    });
  },
};
