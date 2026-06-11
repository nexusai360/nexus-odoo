// mcp/tools/financeiro/titulos-vencidos.ts
// Tool MCP: financeiro_titulos_vencidos
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryTitulosVencidos } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

// Onda 1.B/Spec A10: parametro `tipo` aceitavel (a_receber|a_pagar|todos).
// Fase 1 (Onda 1.B): default "todos" + aviso quando ausente sugerindo o tipo
// inferido da pergunta. Sera obrigatorio em Onda 1.6 apos prompt v2 rolar.
const inputSchema = z.object({
  tipo: z.enum(["a_receber", "a_pagar", "todos"]).optional(),
  /** Onda 1.7 (2026-05-27): filtro de vencimento exato.
   *  - "hoje": titulos que vencem hoje (data_vencimento = hoje)
   *  - "ate_hoje" (default): titulos ja vencidos (data_vencimento <= hoje)
   *  Resolve o caso "titulos vencidos hoje" que vinha incluindo atrasados.
   */
  janela: z.enum(["hoje", "ate_hoje"]).optional(),
});

// vrSaldo: valor correto a receber/pagar em aberto na fonte finan.lancamento.
//   Bug R1 corrigido em 2026-05-18 , fonte trocada de finan.pagamento.divida para finan.lancamento.
const tituloSchema = z.object({
  tipo: z.string(),
  participanteNome: z.string().nullable(),
  numeroDocumento: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  vrSaldo: z.number(),
  vrTotal: z.number(),
  diasAtraso: z.number().int(),
  situacaoSimples: z.string().nullable(),
});

// Onda 1.B: envelope canonico aplicado.
const dados = z.object({
  titulos: z.array(tituloSchema),
  totalVencido: z.number(),
  // Quebra honesta do vencido em aberto: confirmado vs provisorio.
  quebra: z.object({ confirmado: z.number(), provisorio: z.number() }),
  // Contrato de lista (Fase B): a lista vem ordenada e a ordenacao e declarada.
  ordenadoPor: z.string().optional(),
  topMaiores: z
    .array(
      z.object({
        nome: z.string(),
        valor: z.number(),
        documento: z.string(),
        diasAtraso: z.number().int(),
        tipo: z.string(),
      }),
    )
    .optional(),
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

function shape(d: Awaited<ReturnType<typeof queryTitulosVencidos>>) {
  return {
    titulos: d.titulos.map((t) => ({
      tipo: t.tipo,
      participanteNome: t.participanteNome,
      numeroDocumento: t.numeroDocumento,
      dataVencimento: t.dataVencimento ? t.dataVencimento.toISOString() : null,
      vrSaldo: t.vrSaldo,
      vrTotal: t.vrTotal,
      diasAtraso: t.diasAtraso,
      situacaoSimples: t.situacaoSimples,
    })),
    totalVencido: d.totalVencido,
    quebra: d.quebra,
  };
}

/** Quebra confirmado/provisório a partir das linhas (recomputada após o filtro
 *  por tipo/janela do handler). */
function quebraDe(
  titulos: { situacaoSimples: string | null; vrSaldo: number }[],
): { confirmado: number; provisorio: number } {
  let confirmado = 0;
  let provisorio = 0;
  for (const t of titulos) {
    if (t.situacaoSimples === "provisorio") provisorio += t.vrSaldo;
    else confirmado += t.vrSaldo;
  }
  return { confirmado, provisorio };
}

export const financeiroTitulosVencidos: ToolEntry<Input, Output> = {
  id: "financeiro_titulos_vencidos",
  dominio: "financeiro",
  descricao:
    "Titulos vencidos e nao pagos. Aceita filtro tipo=a_receber|a_pagar|todos (default todos).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_financeiro_titulo"],
      async () => shape(await queryTitulosVencidos(ctx.prisma, new Date())),
    );
    if (envelope.estado === "preparando") return envelope;

    // Filtro por tipo (a_receber|a_pagar) aplicado pos-query.
    // queryTitulosVencidos retorna mistos; filtragem aqui mantem retrocompat.
    let titulos = envelope.dados.titulos;
    if (input.tipo && input.tipo !== "todos") {
      titulos = titulos.filter((t) => t.tipo === input.tipo);
    }
    // Janela "hoje" = data_vencimento exatamente hoje (nao acumulado).
    if (input.janela === "hoje") {
      const todayIso = new Date().toISOString().slice(0, 10);
      titulos = titulos.filter(
        (t) => (t.dataVencimento ?? "").slice(0, 10) === todayIso,
      );
    }
    const totalVencidoFiltrado = titulos.reduce((s, t) => s + t.vrSaldo, 0);
    const quebraFiltrada = quebraDe(titulos);
    // Contrato de lista (Fase B): a query ja ordena por vrSaldo desc; o sort
    // local re-garante apos os filtros e o topMaiores e a visao pronta para
    // "N maiores vencidos" (caso forense #1: agente rotulava lista arbitraria
    // de "10 maiores").
    const titulosOrdenados = [...titulos].sort((a, b) => b.vrSaldo - a.vrSaldo);
    const topMaiores = titulosOrdenados.slice(0, 10).map((t) => ({
      nome: t.participanteNome ?? "",
      valor: t.vrSaldo,
      documento: t.numeroDocumento ?? "",
      diasAtraso: t.diasAtraso,
      tipo: t.tipo,
    }));
    const dadosFiltrados = {
      ...envelope.dados,
      titulos: titulosOrdenados,
      totalVencido: totalVencidoFiltrado,
      quebra: quebraFiltrada,
      ordenadoPor: "valor desc",
      topMaiores,
    };

    // A10 fase 1: aviso quando tipo nao informado.
    const aviso =
      input.tipo === undefined
        ? "tipoSugerido: passe tipo='a_receber' ou 'a_pagar' para resultado mais preciso."
        : undefined;

    return enriquecerEnvelope(
      { ...envelope, dados: dadosFiltrados },
      "financeiro_titulos_vencidos",
      {
        destaque: {
          totalVencido: totalVencidoFiltrado,
          totalConfirmado: quebraFiltrada.confirmado,
          totalProvisorio: quebraFiltrada.provisorio,
          contagem: titulos.length,
          ...(aviso ? { aviso } : {}),
        },
        titulos,
        agregado: {
          soma: totalVencidoFiltrado,
          contagem: titulos.length,
        },
      },
    );
  },
};
