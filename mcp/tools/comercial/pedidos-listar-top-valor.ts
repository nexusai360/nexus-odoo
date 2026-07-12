// mcp/tools/comercial/pedidos-listar-top-valor.ts
// Tool MCP: comercial_pedidos_listar_top_valor
// Resolve "pedido com maior valor em aberto" do audit R12+R13.
// comercial_pedidos_periodo so retorna totais (nao lista); essa tool lista
// os top N pedidos por vrProdutos, opcionalmente filtrando por status
// (aberto = etapa_finaliza=false, cancelado nao incluido a menos que pedido).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import { resolverPeriodoCorte, type PeriodoCorte } from "../../lib/periodo-corte.js";
import { janelaClampada } from "@/lib/corte-dados.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  status: z.enum(["aberto", "fechado", "todos"]).optional().describe("Default: aberto (etapas nao finalizadoras)"),
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  ordenacao: z.enum(["valor_desc", "valor_asc", "data_asc", "data_desc"]).optional()
    .describe("Default: valor_desc (maiores por valor). Use data_asc para 'pedido mais antigo em aberto'."),
  clienteTermo: z.string().min(1).max(120).optional()
    .describe("Filtra pedidos do cliente que casa com o termo (busca em participanteNome)."),
  vendedorTermo: z.string().min(1).max(120).optional()
    .describe("Filtra pedidos do vendedor que casa com o termo (busca em vendedorNome)."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  pedidoId: z.number().int(),
  numero: z.string().nullable(),
  participanteNome: z.string().nullable(),
  etapaNome: z.string().nullable(),
  vendedorNome: z.string().nullable(),
  dataOrcamento: z.string().nullable(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalListados: z.number().int(),
  totalEncontrados: z.number().int().optional(),
  /** Soma do valor SO dos itens listados nesta pagina (varia com a paginacao). */
  valorTotalListados: z.number(),
  /** Soma do valor de TODOS os pedidos do filtro (conjunto inteiro, invariante a
   *  paginacao). E o agregado correto para o agente reportar "total". */
  valorTotalGeral: z.number().optional(),
  // Contrato de lista (Fase B): ordenacao real reflete o parametro `ordenacao`
  // (valor_desc default). orderBy estavel na query, desempate por odooId.
  ordenadoPor: z.string().optional(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  _PAGINACAO: z.any().optional(),

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

async function queryPedidosListarTopValor(prisma: PrismaClient, input: Input, per: PeriodoCorte) {
  const { limit, offset } = resolverPaginacao(input);
  const status = input.status ?? "aberto";
  const ordenacao = input.ordenacao ?? "valor_desc";
  // Base: só pedidos de VENDA (exclui transferência/remessa/anomalia), via a
  // coluna materializada categoria_operacao. Ver perícia 08 (P0.2).
  //
  // Pedido e documento com data: o piso de dataOrcamento e INCONDICIONAL. Antes o filtro so
  // existia quando o agente informava periodo , sem periodo, "o maior pedido em aberto"
  // podia ser um pedido anterior a data de inicio das analises, e o count/aggregate somavam
  // o cache inteiro.
  const j = janelaClampada(per.periodoDe, per.periodoAte);
  const where: Record<string, unknown> = {
    categoriaOperacao: "venda",
    dataOrcamento: { gte: j.gte, lt: j.lt },
  };
  if (status === "aberto") where.etapaFinaliza = false;
  else if (status === "fechado") where.etapaFinaliza = true;
  if (input.clienteTermo) {
    where.participanteNome = { contains: input.clienteTermo, mode: "insensitive" };
  }
  if (input.vendedorTermo) {
    where.vendedorNome = { contains: input.vendedorTermo, mode: "insensitive" };
  }

  // orderBy ESTAVEL: o criterio semantico + desempate por odooId, senao "os
  // proximos" repetem ou pulam pedidos com mesmo valor/data (alavanca 2b).
  const orderBy: Array<Record<string, "asc" | "desc">> =
    ordenacao === "valor_asc"
      ? [{ vrProdutos: "asc" }, { odooId: "asc" }]
      : ordenacao === "data_asc"
        ? [{ dataOrcamento: "asc" }, { odooId: "asc" }]
        : ordenacao === "data_desc"
          ? [{ dataOrcamento: "desc" }, { odooId: "asc" }]
          : [{ vrProdutos: "desc" }, { odooId: "asc" }];

  const [rows, totalEncontrados, agg] = await Promise.all([
    prisma.fatoPedido.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      select: {
        odooId: true,
        numero: true,
        participanteNome: true,
        etapaNome: true,
        vendedorNome: true,
        dataOrcamento: true,
        vrProdutos: true,
      },
    }),
    prisma.fatoPedido.count({ where }),
    // Soma do conjunto inteiro (invariante a paginacao) , agregado honesto.
    prisma.fatoPedido.aggregate({ where, _sum: { vrProdutos: true } }),
  ]);

  const linhas = rows.map((r) => ({
    pedidoId: r.odooId,
    numero: r.numero,
    participanteNome: r.participanteNome,
    etapaNome: r.etapaNome,
    vendedorNome: r.vendedorNome,
    dataOrcamento: r.dataOrcamento ? r.dataOrcamento.toISOString() : null,
    valorTotal: Number(r.vrProdutos),
  }));

  return {
    linhas,
    totalListados: linhas.length,
    totalEncontrados,
    valorTotalListados: linhas.reduce((a, b) => a + b.valorTotal, 0),
    valorTotalGeral: Number(agg._sum.vrProdutos ?? 0),
    periodoCoberto: per.label,
    ...(per.aviso ? { aviso: per.aviso } : {}),
  };
}

export const comercialPedidosListarTopValor: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_listar_top_valor",
  dominio: "comercial",
  descricao:
    "Lista top N pedidos com filtros e ordenacao flexiveis. Use para: " +
    "'pedido com maior valor em aberto' (default), 'pedido mais antigo em aberto' " +
    "(ordenacao=data_asc), 'pedido mais recente' (ordenacao=data_desc), " +
    "'pedido do cliente Smartfit' (clienteTermo=Smartfit). Aceita status " +
    "(aberto/fechado/todos) e periodo (DE/ATE). Paginado: retorna 10 por vez " +
    "(use limit/offset para ver os proximos).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const per = resolverPeriodoCorte(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido"], () =>
      queryPedidosListarTopValor(ctx.prisma, input, per),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const { limit, offset } = resolverPaginacao(input);
    const linhas = d.linhas ?? [];
    const totalEncontrados = d.totalEncontrados ?? linhas.length;
    const paginacao = montarPaginacaoMeta(totalEncontrados, offset, limit, linhas.length);
    const top = linhas[0];
    const ordenacao = input.ordenacao ?? "valor_desc";
    const status = input.status ?? "aberto";
    // Contrato de lista (Fase B): descricao humana da ordenacao real aplicada.
    const ordenadoPor =
      ordenacao === "valor_asc" ? "valor asc"
        : ordenacao === "data_asc" ? "data asc"
          : ordenacao === "data_desc" ? "data desc"
            : "valor desc";
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const fmtData = (s: string | null | undefined) => (s ? s.slice(0, 10) : "(sem data)");
    // T-41: _RESPOSTA gerado no handler com contexto da ordenacao + clienteTermo
    let resposta = "";
    if (linhas.length === 0) {
      resposta = input.clienteTermo
        ? `Nao ha pedidos do cliente '${input.clienteTermo}'.`
        : input.vendedorTermo
          ? `Nao ha pedidos do vendedor '${input.vendedorTermo}'.`
          : "Nao ha pedidos para esse criterio.";
    } else if (ordenacao === "data_asc") {
      resposta = `Pedido mais antigo (status ${status}): ${top!.numero} de ${fmtData(top!.dataOrcamento)}, ${top!.participanteNome ?? "(sem cliente)"}, ${fmt(top!.valorTotal)}.${input.clienteTermo ? ` Filtro cliente='${input.clienteTermo}'.` : ""}`;
    } else if (ordenacao === "data_desc") {
      resposta = `Pedido mais recente (status ${status}): ${top!.numero} de ${fmtData(top!.dataOrcamento)}, ${top!.participanteNome ?? "(sem cliente)"}, ${fmt(top!.valorTotal)}.`;
    } else {
      const prefixo = input.clienteTermo ? `Top ${linhas.length} pedidos do cliente '${input.clienteTermo}'` : `Top ${linhas.length} pedidos por valor (${status})`;
      resposta = `${prefixo}. Maior: ${top!.numero} ${top!.participanteNome ? `(${top!.participanteNome})` : ""} ${fmt(top!.valorTotal)}.`;
    }
    return {
      ...envelope,
      dados: {
        ...d,
        totalListados: linhas.length,
        totalEncontrados,
        valorTotalListados: d.valorTotalListados ?? linhas.reduce((s, l) => s + l.valorTotal, 0),
        valorTotalGeral: d.valorTotalGeral ?? 0,
        ordenadoPor,
        _RESPOSTA: resposta + (per.aviso ? ` ${per.aviso}` : ` Periodo coberto: ${per.label}.`),
        _DESTAQUE: {
          totalPedidos: totalEncontrados,
          periodoCoberto: per.label,
          topPedido: top?.numero ?? "",
          valorTopPedido: top?.valorTotal ?? 0,
          topParticipante: top?.participanteNome ?? "",
          ordenacao,
          status,
          ...(input.clienteTermo ? { clienteTermo: input.clienteTermo } : {}),
          // valor do conjunto inteiro (invariante a paginacao)
          valorTotalGeral: d.valorTotalGeral ?? 0,
          // valor so dos itens nesta pagina (varia com a paginacao)
          valorTotalListados: d.valorTotalListados ?? linhas.reduce((s, l) => s + l.valorTotal, 0),
        },
        // soma do conjunto inteiro (coerente com contagem=totalEncontrados),
        // nao a soma da pagina (corrige inconsistencia achada pelo baseline F4).
        _agregado: { contagem: totalEncontrados, soma: d.valorTotalGeral ?? 0 },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
