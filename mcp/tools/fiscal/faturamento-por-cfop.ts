// mcp/tools/fiscal/faturamento-por-cfop.ts
// Tool MCP: fiscal_faturamento_por_cfop (CFOP no item desnormalizado)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape } from "../../lib/paginacao.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
  ...paginacaoInputShape,
});

const linha = z.object({
  cfopId: z.number().int().nullable(),
  cfopNome: z.string().nullable(),
  totalLinhas: z.number().int(),
  valor: z.number(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  valorGeral: z.number(),
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

export const fiscalFaturamentoPorCfop: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_cfop",
  dominio: "fiscal",
  descricao: "Faturamento de saida autorizado por CFOP (no item da nota). Valor rateado pelo item; fechamento por tolerancia. Aceita empresa.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal", "fato_nota_fiscal_item"], async () => {
      const r = await faturamentoPorCfop(ctx.prisma, {
        periodoDe: input.periodoDe,
        periodoAte: input.periodoAte,
        empresaId: escopo.empresaId,
        limit: input.limit,
        offset: input.offset,
      });
      return {
        linhas: r.linhas,
        total: r.total,
        valorGeral: r.valorGeral,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso:
          escopo.escopo.aviso +
          " Valor por CFOP e rateado pelo item da nota; o fechamento com o total bate por tolerancia, nao exato.",
      };
    });
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_cfop", {
      destaque: { valorGeral: envelope.dados.valorGeral, cfops: envelope.dados.total },
      agregado: { soma: envelope.dados.valorGeral, contagem: envelope.dados.total },
    });
  },
};
