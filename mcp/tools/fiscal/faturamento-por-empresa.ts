// mcp/tools/fiscal/faturamento-por-empresa.ts
// Tool MCP: fiscal_faturamento_por_empresa (comparativo de filiais, gated admin/super_admin)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorEmpresa } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const linha = z.object({
  empresaId: z.number().int().nullable(),
  empresaNome: z.string().nullable(),
  totalNotas: z.number().int(),
  valor: z.number(),
});

const dados = z.object({
  linhas: z.array(linha),
  totalGrupo: z.number(),
  empresasComFaturamento: z.number().int(),
  valorSemEmpresa: z.number(),
  totalNotasSemEmpresa: z.number().int(),
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

export const fiscalFaturamentoPorEmpresa: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_empresa",
  dominio: "fiscal",
  gatedRoles: ["admin", "super_admin"],
  descricao: "Faturamento de venda autorizado por empresa do grupo (comparativo de filiais). Lista todas as empresas.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await faturamentoPorEmpresa(ctx.prisma, input);
      return {
        linhas: r.linhas,
        totalGrupo: r.totalGrupo,
        empresasComFaturamento: r.empresasComFaturamento,
        valorSemEmpresa: r.valorSemEmpresa,
        totalNotasSemEmpresa: r.totalNotasSemEmpresa,
        aviso:
          "Faturamento de venda autorizado (exclui canceladas, nao-autorizadas e operacoes nao-venda), " +
          "agrupado por empresa. A linha sem empresa, quando houver, aparece por ultimo.",
      };
    });
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_empresa", {
      destaque: {
        totalGrupo: envelope.dados.totalGrupo,
        empresasComFaturamento: envelope.dados.empresasComFaturamento,
      },
      agregado: { soma: envelope.dados.totalGrupo, contagem: envelope.dados.empresasComFaturamento },
    });
  },
};
