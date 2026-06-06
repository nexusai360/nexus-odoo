// mcp/tools/fiscal/faturamento-mensal-serie.ts
// Tool MCP: fiscal_faturamento_mensal_serie (Onda 3)
//
// Itera mes a mes do ano consultado e devolve a serie. Resolve casos
// R11/R12 "Comparativo de faturamento por mes esse ano" onde o agente
// chamava registrar_lacuna em vez de iterar a tool periodo.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryFaturamentoPeriodo } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { formatadorPorTool } from "../../lib/responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  ano: z.number().int().min(2000).max(2100).optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
});

const mesSchema = z.object({
  mes: z.number().int(),
  totalNotas: z.number().int(),
  valorFaturado: z.number(),
});

// Onda 1.C: envelope canonico (com formatador inline pois e tool nova)
const dados = z.object({
  ano: z.number().int(),
  serie: z.array(mesSchema),
  totalAno: z.number(),
  totalNotasAno: z.number().int(),
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
    "Itera fiscal_faturamento_periodo para cada mes 01..mes_corrente. " +
    "Use para perguntas tipo 'comparativo mensal', 'faturamento por mes esse ano'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const ano = input.ano ?? new Date().getFullYear();
    const hoje = new Date();
    const mesLimit = ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 12;
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);

    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal"],
      async () => {
        const serie: Array<{ mes: number; totalNotas: number; valorFaturado: number }> = [];
        let totalAno = 0;
        let totalNotasAno = 0;
        for (let m = 1; m <= mesLimit; m++) {
          const ultimoDia = new Date(ano, m, 0).getDate();
          const periodoDe = `${ano}-${String(m).padStart(2, "0")}-01`;
          const periodoAte = `${ano}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
          const r = await queryFaturamentoPeriodo(ctx.prisma, { periodoDe, periodoAte, empresaId: escopo.empresaId });
          serie.push({ mes: m, totalNotas: r.totalNotas, valorFaturado: r.valorFaturado });
          totalAno += r.valorFaturado;
          totalNotasAno += r.totalNotas;
        }
        return { ano, serie, totalAno, totalNotasAno, escopoEmpresa: escopo.escopo as unknown as Record<string, unknown> };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    // Como ainda nao ha formatador especifico, usa o mais proximo.
    void formatadorPorTool; // reservado para uso futuro do formatador dedicado
    return enriquecerEnvelope(envelope, "fiscal_faturamento_mensal_serie", {
      destaque: {
        ano: envelope.dados.ano,
        totalAno: envelope.dados.totalAno,
        totalNotasAno: envelope.dados.totalNotasAno,
        mesesConsultados: envelope.dados.serie.length,
      },
      agregado: {
        soma: envelope.dados.totalAno,
        contagem: envelope.dados.totalNotasAno,
      },
    });
  },
};
