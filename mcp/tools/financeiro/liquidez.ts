// mcp/tools/financeiro/liquidez.ts
// Tool MCP: financeiro_liquidez
//
// Resolve "Liquidez imediata", "indicador de liquidez", "saúde financeira",
// "consigo pagar tudo agora?". Indicador = (saldo em caixa + contas a receber)
// / contas a pagar.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { corteAtualDate, corteLabel } from "@/lib/corte-dados.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({});

const dados = z.object({
  saldoEmCaixa: z.number(),
  contasAReceber: z.number(),
  contasAPagar: z.number(),
  liquidezImediata: z.number(),
  liquidezCorrente: z.number(),
  status: z.enum(["saudavel", "atencao", "critico"]),
  /** Janela de analise coberta pelos titulos somados (a partir da data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
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

async function queryLiquidez(prisma: PrismaClient) {
  // Data de inicio das analises: os TITULOS sao documentos com data (data_documento), entao
  // entram na conta so a partir dela. Sem esse piso, a liquidez somava a divida velha do
  // Odoo (dezenas de milhoes ja retiradas dos KPIs) e DIVERGIA das tools
  // financeiro_contas_a_receber / _a_pagar, que ja grampeiam , o usuario via dois valores
  // diferentes de "contas a receber" na mesma conversa.
  const corte = corteAtualDate();

  // 1. Saldo em caixa: soma de fato_financeiro_saldo.
  // NAO SE APLICA o corte aqui: saldo de conta bancaria e FOTO do agora, nao documento com
  // data (nao existe data para grampear, e filtrar zeraria o caixa).
  const saldoRows = await prisma.$queryRaw<Array<{ total: string | number }>>`
    SELECT COALESCE(SUM(saldo), 0)::text AS total FROM fato_financeiro_saldo
  `;
  const saldoEmCaixa = Number(saldoRows[0]?.total ?? 0);

  // 2. Contas a receber em aberto: soma de fato_financeiro_titulo a receber
  const receberRows = await prisma.$queryRaw<Array<{ total: string | number }>>`
    SELECT COALESCE(SUM(vr_saldo), 0)::text AS total
    FROM fato_financeiro_titulo
    WHERE tipo = 'a_receber' AND vr_saldo > 0 AND data_documento >= ${corte}
  `;
  const contasAReceber = Number(receberRows[0]?.total ?? 0);

  // 3. Contas a pagar em aberto
  const pagarRows = await prisma.$queryRaw<Array<{ total: string | number }>>`
    SELECT COALESCE(SUM(vr_saldo), 0)::text AS total
    FROM fato_financeiro_titulo
    WHERE tipo = 'a_pagar' AND vr_saldo > 0 AND data_documento >= ${corte}
  `;
  const contasAPagar = Number(pagarRows[0]?.total ?? 0);

  // 4. Calcular indicadores
  // Liquidez imediata = saldo / contas a pagar
  // Liquidez corrente = (saldo + a receber) / contas a pagar
  const liquidezImediata = contasAPagar > 0 ? saldoEmCaixa / contasAPagar : 0;
  const liquidezCorrente = contasAPagar > 0 ? (saldoEmCaixa + contasAReceber) / contasAPagar : 0;

  // Classificacao didatica (referencia brasileira de boas praticas):
  // liquidezImediata > 0.5 e corrente > 1.5 -> saudavel
  // imediata > 0.2 ou corrente > 1.0       -> atencao
  // resto                                  -> critico
  let status: "saudavel" | "atencao" | "critico" = "critico";
  if (liquidezImediata > 0.5 && liquidezCorrente > 1.5) status = "saudavel";
  else if (liquidezImediata > 0.2 || liquidezCorrente > 1.0) status = "atencao";

  return {
    saldoEmCaixa,
    contasAReceber,
    contasAPagar,
    liquidezImediata,
    liquidezCorrente,
    status,
    periodoCoberto: `titulos com documento a partir de ${corteLabel()}`,
    aviso:
      `Contas a receber e a pagar somam titulos emitidos a partir de ${corteLabel()} ` +
      "(data de inicio das analises). O saldo em caixa e a foto atual das contas, sem recorte de data.",
  };
}

export const financeiroLiquidez: ToolEntry<Input, Output> = {
  id: "financeiro_liquidez",
  dominio: "financeiro",
  descricao:
    "Indicadores de liquidez da empresa: saldo em caixa, contas a receber em aberto, " +
    "contas a pagar em aberto, liquidez imediata (saldo/pagar) e liquidez corrente " +
    "((saldo+receber)/pagar). Use para 'liquidez imediata', 'consigo pagar tudo', " +
    "'saude financeira', 'indicador de liquidez'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_financeiro_saldo", "fato_financeiro_titulo"],
      () => queryLiquidez(ctx.prisma),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // _RESPOSTA delegado ao formatador canonico (fmtLiquidez em responder.ts).
    return enriquecerEnvelope(envelope, "financeiro_liquidez", {
      destaque: {
        saldoEmCaixa: d.saldoEmCaixa,
        contasAReceber: d.contasAReceber,
        contasAPagar: d.contasAPagar,
        liquidezImediata: d.liquidezImediata,
        liquidezCorrente: d.liquidezCorrente,
        status: d.status,
        periodoCoberto: d.periodoCoberto ?? "",
      },
      agregado: { soma: d.saldoEmCaixa + d.contasAReceber - d.contasAPagar },
    });
  },
};
