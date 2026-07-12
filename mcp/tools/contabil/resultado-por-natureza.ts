// mcp/tools/contabil/resultado-por-natureza.ts
// Tool MCP: contabil_resultado_por_natureza
//
// Resultado do período pelas contas de natureza 04 (Resultado): crédito=receita,
// débito=despesa, excluindo lançamentos de Encerramento (tipo E). NÃO é uma DRE
// estruturada (isso exige granularidade por código de conta e fica para a
// ativação , SPEC §2.2 B1R2-6). Lê de fato_contabil_lancamento_item; enquanto a
// contabilidade não é operada (0 lançamentos), responde honestamente.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import {
  queryResultadoPorNatureza,
  fatoContabilItemCount,
  mensagemContabilGestaoVazia,
} from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { resolverPeriodoCorte } from "../../lib/periodo-corte.js";

const inputSchema = z.object({
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

const linhaSchema = z.object({
  grupo: z.string(),
  receita: z.number(),
  despesa: z.number(),
  resultado: z.number(),
});

const dados = z.object({
  // Contrato de lista (Fase B): ordenacao declarada.
  ordenadoPor: z.string().optional(),
  linhas: z.array(linhaSchema),
  receitaTotal: z.number(),
  despesaTotal: z.number(),
  resultado: z.number(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
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

export const contabilResultadoPorNatureza: ToolEntry<Input, Output> = {
  id: "contabil_resultado_por_natureza",
  dominio: "contabil",
  descricao:
    "Resultado do período pelas contas de natureza Resultado (04): receita (créditos), despesa (débitos) e resultado (receita menos despesa), excluindo lançamentos de encerramento. " +
    "Filtre por período (dataInicio/dataFim, AAAA-MM-DD). Não é uma DRE estruturada por linha. " +
    "NOTA: a contabilidade ainda não é operada no Odoo da Matrix (sem lançamentos); responde automaticamente quando os lançamentos forem lançados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    // Lancamento contabil e HISTORICO (dataLancamento). O helper de periodo da query so monta
    // o range quando recebe data, entao sem periodo a tool varria todo o razao. Aqui o periodo
    // e SEMPRE resolvido, com o inicio grampeado a data de inicio das analises.
    const per = resolverPeriodoCorte(input.dataInicio, input.dataFim);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_contabil_lancamento_item"],
      async () => {
        const r = await queryResultadoPorNatureza(ctx.prisma, {
          ...input,
          dataInicio: per.periodoDe,
          dataFim: per.periodoAte,
        });
        return {
          linhas: r.linhas,
          ordenadoPor: "agregado unico (sem ordenacao)",
          receitaTotal: r.receitaTotal,
          despesaTotal: r.despesaTotal,
          resultado: r.resultado,
          periodoCoberto: per.label,
          ...(per.aviso ? { aviso: per.aviso } : {}),
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const out = enriquecerEnvelope(envelope, "contabil_resultado_por_natureza", {
      periodo: per,
      destaque: {
        receita: envelope.dados.receitaTotal,
        despesa: envelope.dados.despesaTotal,
        resultado: envelope.dados.resultado,
        periodoCoberto: per.label,
      },
    });
    if (out.estado === "vazio") {
      const n = await fatoContabilItemCount(ctx.prisma);
      out.dados._RESPOSTA = mensagemContabilGestaoVazia(n);
    }
    return out;
  },
};
