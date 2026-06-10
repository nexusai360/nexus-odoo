// mcp/tools/fiscal/faturamento-mensal-serie.ts
// Tool MCP: fiscal_faturamento_mensal_serie
// Fase 2.5: serie mensal de RECEITA EXTERNA (sem intercompany) via camada canonica,
// substituindo o loop antigo de queryFaturamentoPeriodo (base vrNf, sem eliminacao).
// Resolve casos R11/R12 "comparativo de faturamento por mes esse ano".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoSerieMensal } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  ano: z.number().int().min(2000).max(2100).optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
});

const mesSchema = z.object({
  mes: z.number().int(),
  individual: z.number(),
  externa: z.number(),
  intragrupoEliminavel: z.number(),
  notasExternas: z.number().int(),
});

const dados = z.object({
  ano: z.number().int(),
  serie: z.array(mesSchema),
  totalExternaAno: z.number(),
  totalIndividualAno: z.number(),
  totalNotasExternasAno: z.number().int(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
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

export const fiscalFaturamentoMensalSerie: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_mensal_serie",
  dominio: "fiscal",
  descricao:
    "Serie mes a mes de faturamento do ano informado (default: ano corrente). " +
    "Receita externa real por mes (sem intercompany), com o faturamento individual disponivel. " +
    "Use para perguntas tipo 'comparativo mensal', 'faturamento por mes esse ano'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const hoje = new Date();
    const ano = input.ano ?? hoje.getUTCFullYear();
    const mesLimite = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() + 1 : 12;
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);

    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await faturamentoSerieMensal(ctx.prisma, {
        ano,
        empresaId: escopo.empresaId,
        mesLimite,
      });
      return {
        ano: r.ano,
        serie: r.serie,
        totalExternaAno: r.totalExternaAno,
        totalIndividualAno: r.totalIndividualAno,
        totalNotasExternasAno: r.totalNotasExternasAno,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_mensal_serie", {
      destaque: {
        ano: d.ano,
        totalExternaAno: d.totalExternaAno,
        totalIndividualAno: d.totalIndividualAno,
        totalNotasExternasAno: d.totalNotasExternasAno,
        mesesConsultados: d.serie.length,
      },
      agregado: {
        soma: d.totalExternaAno,
        contagem: d.totalNotasExternasAno,
      },
    });
  },
};
