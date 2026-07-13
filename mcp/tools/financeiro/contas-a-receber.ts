// mcp/tools/financeiro/contas-a-receber.ts
// Tool MCP: financeiro_contas_a_receber
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContasAReceber } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  participanteId: z.number().int().positive().optional(),
  // JANELA DE COBRANCA: vencido em aberto + vencendo ate esta data. SEM ela, nao ha teto , a
  // resposta e a carteira INTEIRA em aberto (vencido + a vencer). E o parametro que permite
  // ao agente reproduzir o numero do dashboard, que usa o fim do periodo da tela como teto.
  periodoAte: z
    .string()
    .optional()
    .describe(
      "Fim da janela de cobranca (AAAA-MM-DD): traz o vencido + o que vence ate essa data. " +
        "Sem isso, devolve a carteira inteira em aberto.",
    ),
});

// vrSaldo: valor correto a receber em aberto na fonte finan.lancamento
//   (vrSaldo == vrDocumento == vrTotal quando aberto; vrSaldo=0 quando quitado).
//   Bug R1 corrigido em 2026-05-18 , fonte trocada de finan.pagamento.divida para finan.lancamento.
const tituloSchema = z.object({
  participanteNome: z.string().nullable(),
  numeroDocumento: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  vrSaldo: z.number(),
  vrTotal: z.number(),
  diasAtraso: z.number().int(),
  situacaoSimples: z.string().nullable(),
});

// Onda 1.B: envelope canonico do agente Nex aplicado.
const dados = z.object({
  titulos: z.array(tituloSchema),
  totalAReceber: z.number(),
  /** A janela que este numero cobre. O agente PRECISA dizer isso junto do valor. */
  janelaCobranca: z.string().optional(),
  /** Pedidos ainda SEM nota emitida: receita contratada, nao conta a receber. */
  carteiraAFaturar: z.number(),
  quebra: z.object({ confirmado: z.number(), provisorio: z.number() }),
  // Contrato de lista (Fase B): ordenacao declarada da lista `titulos`.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  topPorParticipante: z
    .array(
      z.object({ nome: z.string(), soma: z.number(), n: z.number().int() }),
    )
    .optional(),
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

/** Frase da janela coberta, para o agente jamais dar o numero sem dizer o que ele cobre. */
export function rotuloJanelaCobranca(periodoAte?: string): string {
  if (!periodoAte) return "carteira inteira em aberto (vencido + a vencer, sem teto)";
  const [a, m, d] = periodoAte.slice(0, 10).split("-");
  return `vencido em aberto + vencendo ate ${d}/${m}/${a}`;
}

function shape(d: Awaited<ReturnType<typeof queryContasAReceber>>, periodoAte?: string) {
  return {
    janelaCobranca: rotuloJanelaCobranca(periodoAte),
    titulos: d.titulos.map((t) => ({
      participanteNome: t.participanteNome,
      numeroDocumento: t.numeroDocumento,
      dataVencimento: t.dataVencimento ? t.dataVencimento.toISOString() : null,
      vrSaldo: t.vrSaldo,
      vrTotal: t.vrTotal,
      diasAtraso: t.diasAtraso,
      situacaoSimples: t.situacaoSimples,
    })),
    totalAReceber: d.totalAReceber,
    // O agente PRECISA saber a diferenca: perguntado sobre "quanto tenho a receber", ele
    // responde o faturado, e pode citar a carteira a parte. Somar os dois era o erro antigo.
    carteiraAFaturar: d.carteiraAFaturar,
    quebra: d.quebra,
    // A query ja devolve ordenado por vrSaldo desc (contrato de lista).
    ordenadoPor: "valor desc",
  };
}

export const financeiroContasAReceber: ToolEntry<Input, Output> = {
  id: "financeiro_contas_a_receber",
  dominio: "financeiro",
  descricao:
    "Títulos a receber em aberto (JÁ FATURADOS), com valor total e dias de atraso. " +
    "Devolve à parte `carteiraAFaturar`: pedidos ainda sem nota emitida, que são receita " +
    "contratada e NÃO entram no total a receber.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_financeiro_titulo"],
      async () =>
        shape(
          await queryContasAReceber(ctx.prisma, input, new Date()),
          input.periodoAte,
        ),
    );
    if (envelope.estado === "preparando") return envelope;
    // T-20 (2026-05-27): expor `topMaiores` lista (top 10 ordenado por
    // vrSaldo desc) - resolve "Top 10 maiores contas a receber".
    const top10List = [...envelope.dados.titulos]
      .sort((a, b) => b.vrSaldo - a.vrSaldo)
      .slice(0, 10)
      .map((t) => ({
        nome: t.participanteNome ?? "",
        valor: t.vrSaldo,
        documento: t.numeroDocumento ?? "",
        diasAtraso: t.diasAtraso,
      }));
    const enriched = enriquecerEnvelope(envelope, "financeiro_contas_a_receber", {
      destaque: {
        totalAReceber: envelope.dados.totalAReceber,
        // Sem isto, o agente da o numero sem dizer o que ele cobre , e a mesma pergunta
        // rende um valor no chat e outro no dashboard, que usa o fim do periodo da tela.
        janelaCobranca: envelope.dados.janelaCobranca ?? "",
        carteiraAFaturar: envelope.dados.carteiraAFaturar,
        totalConfirmado: envelope.dados.quebra.confirmado,
        totalProvisorio: envelope.dados.quebra.provisorio,
        contagem: envelope.dados.titulos.length,
        topMaiorValor: top10List[0]?.valor ?? 0,
        topMaiorParticipante: top10List[0]?.nome ?? "",
      },
      titulos: envelope.dados.titulos,
      agregado: {
        soma: envelope.dados.totalAReceber,
        contagem: envelope.dados.titulos.length,
      },
    });
    if (enriched.estado !== "preparando") {
      (enriched.dados as unknown as Record<string, unknown>)["topMaiores"] = top10List;
    }
    return enriched;
  },
};
