// mcp/tools/fiscal/faturamento-nao-autorizado.ts
// Tool MCP: fiscal_faturamento_nao_autorizado (decomposto por situacao)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoNaoAutorizado } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
});

const situacao = z.object({
  situacaoNfe: z.string().nullable(),
  totalNotas: z.number().int(),
  valor: z.number(),
});

const dados = z.object({
  totalNotas: z.number().int(),
  valor: z.number(),
  porSituacao: z.array(situacao),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  // Contrato de lista (Fase B): porSituacao ja vem por valor desc.
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

export const fiscalFaturamentoNaoAutorizado: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_nao_autorizado",
  dominio: "fiscal",
  descricao: "Notas de saida nao autorizadas nem canceladas (denegada, rejeitada, em processamento, sem situacao), decompostas por situacao. Aceita empresa.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await faturamentoNaoAutorizado(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
      });
      return {
        totalNotas: r.totalNotas,
        valor: r.valor,
        porSituacao: r.porSituacao,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso: `Período: ${per.label}. ${escopo.escopo.aviso}`,
        ordenadoPor: "valor desc",
      };
    });
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_nao_autorizado", {
      destaque: { totalNotas: envelope.dados.totalNotas, valor: envelope.dados.valor },
      agregado: { soma: envelope.dados.valor, contagem: envelope.dados.totalNotas },
    });
  },
};
