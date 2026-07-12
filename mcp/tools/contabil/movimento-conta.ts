// mcp/tools/contabil/movimento-conta.ts
// Tool MCP: contabil_movimento_conta
//
// Razão de uma conta: lista as partidas (itens) de uma conta no período,
// ordenadas por data. Lê de fato_contabil_lancamento_item. Enquanto a
// contabilidade não é operada no Odoo (0 lançamentos), responde honestamente
// "não operado" via _RESPOSTA (auto-ativa quando os lançamentos chegarem).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import {
  queryMovimentoConta,
  fatoContabilItemCount,
  mensagemContabilGestaoVazia,
} from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { resolverPeriodoCorte } from "../../lib/periodo-corte.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputObject = z.object({
  contaId: z.number().int().positive().optional(),
  contaCodigo: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  ...paginacaoInputShape,
});
const inputSchema = inputObject.refine(
  (v) => v.contaId != null || (v.contaCodigo != null && v.contaCodigo !== ""),
  { message: "Informe contaId ou contaCodigo para consultar o razão de uma conta." },
);

const linhaSchema = z.object({
  odooId: z.number().int(),
  lancamentoId: z.number().int().nullable(),
  dataLancamento: z.string().nullable(),
  contaCodigo: z.string().nullable(),
  contaNome: z.string().nullable(),
  centroCustoNome: z.string().nullable(),
  historico: z.string().nullable(),
  debito: z.number(),
  credito: z.number(),
});

const dados = z.object({
  // Contrato de lista (Fase B): ordenacao declarada.
  ordenadoPor: z.string().optional(),
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  truncado: z.boolean(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
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

export const contabilMovimentoConta: ToolEntry<Input, Output> = {
  id: "contabil_movimento_conta",
  dominio: "contabil",
  descricao:
    "Razão de uma conta contábil: lista as partidas (itens de lançamento) de uma conta no período, com data, histórico, débito e crédito. " +
    "Informe contaId ou contaCodigo; filtre por período (dataInicio/dataFim, AAAA-MM-DD). " +
    "NOTA: a contabilidade ainda não é operada no Odoo da Matrix (sem lançamentos); responde automaticamente quando os lançamentos forem lançados.",
  inputSchemaShape: inputObject.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    // Lancamento contabil e HISTORICO (dataLancamento). O helper de periodo da query so monta
    // o range quando recebe data, entao sem periodo a tool varria todo o razao. Aqui o periodo
    // e SEMPRE resolvido, com o inicio grampeado a data de inicio das analises.
    const per = resolverPeriodoCorte(input.dataInicio, input.dataFim);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_contabil_lancamento_item"],
      async () => {
        const result = await queryMovimentoConta(ctx.prisma, {
          ...input,
          dataInicio: per.periodoDe,
          dataFim: per.periodoAte,
          limit,
          offset,
        });
        return {
          ordenadoPor: "data do lancamento asc",
          linhas: result.linhas.map((l) => ({
            ...l,
            dataLancamento: l.dataLancamento ? l.dataLancamento.toISOString() : null,
          })),
          total: result.total,
          truncado: result.truncado,
          periodoCoberto: per.label,
          ...(per.aviso ? { aviso: per.aviso } : {}),
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const paginacao = montarPaginacaoMeta(
      envelope.dados.total,
      offset,
      limit,
      envelope.dados.linhas.length,
    );
    const out = enriquecerEnvelope(envelope, "contabil_movimento_conta", {
      destaque: { contagem: envelope.dados.total },
      paginacao,
    });
    if (out.estado === "vazio") {
      const n = await fatoContabilItemCount(ctx.prisma);
      out.dados._RESPOSTA = mensagemContabilGestaoVazia(n);
    }
    return out;
  },
};
