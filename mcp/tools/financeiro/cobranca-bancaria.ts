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
import type { PrismaClient } from "@/generated/prisma/client";

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const dadosSchema = z.object({
  linhas: z.array(z.unknown()),
  total: z.number().int(),
  truncado: z.boolean(),
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
      const total = await opts.count(ctx.prisma);
      const envelope = await withFreshness(ctx.prisma, [opts.fato], async () => {
        const r = await opts.query(ctx.prisma, { ...input, limit, offset });
        return { linhas: r.linhas, total: r.total, truncado: r.truncado };
      });
      if (envelope.estado === "preparando") return envelope;
      const d = envelope.dados;
      const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
      return {
        ...envelope,
        dados: {
          ...d,
          _RESPOSTA:
            total === 0
              ? opts.naoOperado
              : d.total > 0
                ? opts.resumoOk(d.total)
                : "Sem registros nesse recorte.",
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
});

export const financeiroRetornosProcessados = makeTool({
  id: "financeiro_retornos_processados",
  descricao:
    "Retornos bancários processados no período (cabeçalho do arquivo de retorno): banco, número, " +
    "totais de entradas/saídas e saldo. Filtre por período (periodoDe/periodoAte, AAAA-MM-DD).",
  fato: "fato_retorno_bancario",
  naoOperado: "Não há retornos bancários processados no Odoo ainda.",
  inputShape: periodoShape,
  count: fatoRetornoCount,
  query: (p, i) => queryRetornosProcessados(p, i),
  resumoOk: (n) => `${n} retornos bancários no período.`,
});

export const financeiroRemessasGeradas = makeTool({
  id: "financeiro_remessas_geradas",
  descricao:
    "Remessas bancárias geradas no período (arquivos enviados ao banco): tipo, banco, número, " +
    "data e se foi confirmada. Filtre por período (periodoDe/periodoAte, AAAA-MM-DD).",
  fato: "fato_remessa_bancaria",
  naoOperado: "Não há remessas bancárias geradas no Odoo ainda.",
  inputShape: periodoShape,
  count: fatoRemessaCount,
  query: (p, i) => queryRemessasGeradas(p, i),
  resumoOk: (n) => `${n} remessas bancárias no período.`,
});

export const financeiroCarteirasCobranca = makeTool({
  id: "financeiro_carteiras_cobranca",
  descricao:
    "Carteiras de cobrança cadastradas (configuração de boleto por banco): nome, banco, carteira, " +
    "tipo, beneficiário e convênio. Não expõe credenciais de banco. Sem filtro de período.",
  fato: "fato_carteira_cobranca",
  naoOperado: "Não há carteiras de cobrança cadastradas no Odoo ainda.",
  inputShape: { ...paginacaoInputShape },
  count: fatoCarteiraCount,
  query: (p, i) => queryCarteirasCobranca(p, i),
  resumoOk: (n) => `${n} carteiras de cobrança cadastradas.`,
});

export const financeiroCheques = makeTool({
  id: "financeiro_cheques",
  descricao:
    "Cheques no período: número, banco, titular, data e valor. Filtre por período (periodoDe/" +
    "periodoAte, AAAA-MM-DD). Enquanto cheques não forem operados no Odoo, responde que não há.",
  fato: "fato_cheque",
  naoOperado: "O controle de cheques ainda não é operado no Odoo da Matrix (sem cheques).",
  inputShape: periodoShape,
  count: fatoChequeCount,
  query: (p, i) => queryCheques(p, i),
  resumoOk: (n) => `${n} cheques no período.`,
});

export const financeiroPixRecebidos = makeTool({
  id: "financeiro_pix_recebidos",
  descricao:
    "PIX no período: txid, método, status, data e tarifas. Filtre por período (periodoDe/" +
    "periodoAte, AAAA-MM-DD). Enquanto o PIX não for operado no Odoo, responde que não há.",
  fato: "fato_pix",
  naoOperado: "O PIX ainda não é operado no Odoo da Matrix (sem registros de PIX).",
  inputShape: periodoShape,
  count: fatoPixCount,
  query: (p, i) => queryPixRecebidos(p, i),
  resumoOk: (n) => `${n} registros de PIX no período.`,
});
