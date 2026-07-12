// mcp/tools/financeiro/cobranca-bancaria.ts
// B3 , tools de cobrança bancária (remessa/retorno/baixas/carteira/cheque/pix).
// Honestas data-driven: enquanto o fato está vazio, respondem "não operado" e
// auto-ativam quando houver dado. Factory para reduzir boilerplate dos 6.
import { z, type ZodRawShape } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import {
  queryBaixasCobranca, fatoBaixaCount,
  queryRetornosProcessados, fatoRetornoCount,
  queryRemessasGeradas, fatoRemessaCount,
  queryCarteirasCobranca, fatoCarteiraCount,
  queryCheques, fatoChequeCount,
  queryPixRecebidos, fatoPixCount,
} from "@/lib/reports/queries/cobranca-bancaria.js";
import { resolverPeriodoCorte } from "../../lib/periodo-corte.js";
import type { PrismaClient } from "@/generated/prisma/client";

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const dadosSchema = z.object({
  linhas: z.array(z.unknown()),
  total: z.number().int(),
  truncado: z.boolean(),
  // Contrato de lista (Fase B): ordenacao declarada (as queries de cobranca ja
  // tem orderBy estavel da onda de paginacao; aqui apenas declaramos ao LLM).
  ordenadoPor: z.string().optional(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});
const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados: dadosSchema,
    atualizadoEm: z.string(),
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);
type Output = z.infer<typeof outputSchema>;

const periodoShape = {
  periodoDe: z.string().optional().describe("Início, AAAA-MM-DD"),
  periodoAte: z.string().optional().describe("Fim, AAAA-MM-DD"),
  ...paginacaoInputShape,
};

interface QResult { linhas: unknown[]; total: number; truncado: boolean }

function makeTool<I extends Record<string, unknown>>(opts: {
  id: string;
  descricao: string;
  fato: string;
  naoOperado: string;
  inputShape: ZodRawShape;
  count: (p: PrismaClient) => Promise<number>;
  query: (p: PrismaClient, input: I & { limit: number; offset: number }) => Promise<QResult>;
  resumoOk: (total: number) => string;
  /** Contrato de lista: descricao humana da ordenacao da query (obrigatoria). */
  ordenadoPor: string;
  /**
   * true quando o fato e HISTORICO (documento com data: baixa, retorno, remessa, cheque,
   * pix) e portanto respeita a data de inicio das analises. false para CADASTRO/CONFIG
   * (carteira de cobranca), onde nao ha documento datado para grampear.
   */
  historico: boolean;
}): ToolEntry<I, Output> {
  const zObject = z.object(opts.inputShape);
  const inputSchema = zObject as unknown as z.ZodType<I>;
  return ({
    id: opts.id,
    dominio: "financeiro",
    descricao: opts.descricao,
    inputSchemaShape: opts.inputShape,
    inputSchema,
    outputSchema,
    handler: async (input: I, ctx: { prisma: PrismaClient }) => {
      // Alavanca 2b: resolve paginacao (limit/offset) e injeta no input da query.
      const { limit, offset } = resolverPaginacao(input as { limit?: number; offset?: number });
      // O count e proposital SEM filtro: so serve para detectar "modulo nao operado".
      const total = await opts.count(ctx.prisma);
      // Data de inicio das analises: as queries de cobranca (rangeData) so filtram quando
      // recebem data, entao sem periodo elas varriam o cache inteiro. Aqui o periodo e
      // SEMPRE resolvido com o piso do corte e o inicio grampeado.
      const per = opts.historico
        ? resolverPeriodoCorte(
            (input as { periodoDe?: string }).periodoDe,
            (input as { periodoAte?: string }).periodoAte,
          )
        : undefined;
      const envelope = await withFreshness(ctx.prisma, [opts.fato], async () => {
        const r = await opts.query(ctx.prisma, {
          ...input,
          ...(per ? { periodoDe: per.periodoDe, periodoAte: per.periodoAte } : {}),
          limit,
          offset,
        });
        return { linhas: r.linhas, total: r.total, truncado: r.truncado };
      });
      if (envelope.estado === "preparando") return envelope;
      const d = envelope.dados;
      const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
      const sufixoPeriodo = per?.aviso ? ` ${per.aviso}` : "";
      return {
        ...envelope,
        dados: {
          ...d,
          ordenadoPor: opts.ordenadoPor,
          ...(per ? { periodoCoberto: per.label } : {}),
          ...(per?.aviso ? { aviso: per.aviso } : {}),
          _RESPOSTA:
            total === 0
              ? opts.naoOperado
              : (d.total > 0
                  ? `${opts.resumoOk(d.total)}${per ? ` Período coberto: ${per.label}.` : ""}`
                  : `Sem registros nesse recorte.${per ? ` Período coberto: ${per.label}.` : ""}`) +
                sufixoPeriodo,
          _agregado: { contagem: d.total },
          _listaTruncada: paginacao.temMais,
          _PAGINACAO: paginacao,
        },
      };
    },
  }) as unknown as ToolEntry<I, Output>;
}

export const financeiroBaixasCobranca = makeTool({
  id: "financeiro_baixas_cobranca",
  ordenadoPor: "data de pagamento desc",
  descricao:
    "Baixas/pagamentos de cobrança bancária (itens de retorno) no período: situação, nosso " +
    "número, participante e valores (documento, juros, multa, desconto, tarifas, baixado, total). " +
    "Filtre por período (periodoDe/periodoAte, AAAA-MM-DD) e situação.",
  fato: "fato_retorno_item",
  naoOperado: "A cobrança bancária (baixas/retornos) ainda não tem itens processados no Odoo.",
  inputShape: { ...periodoShape, situacao: z.string().optional().describe("Situação da baixa") },
  count: fatoBaixaCount,
  query: (p, i) => queryBaixasCobranca(p, i),
  resumoOk: (n) => `${n} baixas de cobrança no período.`,
  historico: true,
});

export const financeiroRetornosProcessados = makeTool({
  id: "financeiro_retornos_processados",
  ordenadoPor: "data desc",
  descricao:
    "Retornos bancários processados no período (cabeçalho do arquivo de retorno): banco, número, " +
    "totais de entradas/saídas e saldo. Filtre por período (periodoDe/periodoAte, AAAA-MM-DD).",
  fato: "fato_retorno_bancario",
  naoOperado: "Não há retornos bancários processados no Odoo ainda.",
  inputShape: periodoShape,
  count: fatoRetornoCount,
  query: (p, i) => queryRetornosProcessados(p, i),
  resumoOk: (n) => `${n} retornos bancários no período.`,
  historico: true,
});

export const financeiroRemessasGeradas = makeTool({
  id: "financeiro_remessas_geradas",
  ordenadoPor: "data desc",
  descricao:
    "Remessas bancárias geradas no período (arquivos enviados ao banco): tipo, banco, número, " +
    "data e se foi confirmada. Filtre por período (periodoDe/periodoAte, AAAA-MM-DD).",
  fato: "fato_remessa_bancaria",
  naoOperado: "Não há remessas bancárias geradas no Odoo ainda.",
  inputShape: periodoShape,
  count: fatoRemessaCount,
  query: (p, i) => queryRemessasGeradas(p, i),
  resumoOk: (n) => `${n} remessas bancárias no período.`,
  historico: true,
});

export const financeiroCarteirasCobranca = makeTool({
  id: "financeiro_carteiras_cobranca",
  ordenadoPor: "nome asc",
  descricao:
    "Carteiras de cobrança cadastradas (configuração de boleto por banco): nome, banco, carteira, " +
    "tipo, beneficiário e convênio. Não expõe credenciais de banco. Sem filtro de período.",
  fato: "fato_carteira_cobranca",
  naoOperado: "Não há carteiras de cobrança cadastradas no Odoo ainda.",
  inputShape: { ...paginacaoInputShape },
  count: fatoCarteiraCount,
  query: (p, i) => queryCarteirasCobranca(p, i),
  resumoOk: (n) => `${n} carteiras de cobrança cadastradas.`,
  // CADASTRO/CONFIG (nao e documento com data): a data de inicio das analises nao se aplica.
  historico: false,
});

export const financeiroCheques = makeTool({
  id: "financeiro_cheques",
  ordenadoPor: "data desc",
  descricao:
    "Cheques no período: número, banco, titular, data e valor. Filtre por período (periodoDe/" +
    "periodoAte, AAAA-MM-DD). Enquanto cheques não forem operados no Odoo, responde que não há.",
  fato: "fato_cheque",
  naoOperado: "O controle de cheques ainda não é operado no Odoo da Matrix (sem cheques).",
  inputShape: periodoShape,
  count: fatoChequeCount,
  query: (p, i) => queryCheques(p, i),
  resumoOk: (n) => `${n} cheques no período.`,
  historico: true,
});

export const financeiroPixRecebidos = makeTool({
  id: "financeiro_pix_recebidos",
  ordenadoPor: "data desc",
  descricao:
    "PIX no período: txid, método, status, data e tarifas. Filtre por período (periodoDe/" +
    "periodoAte, AAAA-MM-DD). Enquanto o PIX não for operado no Odoo, responde que não há.",
  fato: "fato_pix",
  naoOperado: "O PIX ainda não é operado no Odoo da Matrix (sem registros de PIX).",
  inputShape: periodoShape,
  count: fatoPixCount,
  query: (p, i) => queryPixRecebidos(p, i),
  resumoOk: (n) => `${n} registros de PIX no período.`,
  historico: true,
});
