// mcp/tools/comercial/pedido-situacao.ts
// Tool MCP: comercial_pedido_situacao
// Imersao num pedido: por onde passou (trilha de etapas), em que etapa esta, ha
// quanto tempo (dias parado) e os dados-chave. Responde "situacao do pedido PV-xxxx",
// "o que falta no pedido X", "por que o pedido Y esta parado".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidoSituacao } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  numero: z.string().min(1).describe("Numero do pedido, ex.: PV-2037/26"),
});

const pedidoSchema = z
  .object({
    numero: z.string().nullable(),
    etapaNome: z.string().nullable(),
    bucketDemanda: z.string().nullable(),
    categoriaOperacao: z.string().nullable(),
    operacaoNome: z.string().nullable(),
    empresaNome: z.string().nullable(),
    participanteNome: z.string().nullable(),
    vendedorNome: z.string().nullable(),
    valorProdutos: z.number(),
    dataAprovacao: z.string().nullable(),
    dataPrevista: z.string().nullable(),
    diasParado: z.number().int().nullable(),
  })
  .nullable();

const trilhaSchema = z.object({
  etapaNome: z.string().nullable(),
  entrouEm: z.string().nullable(),
  tempoEtapaDias: z.number().int().nullable(),
});

const itemSchema = z.object({
  produtoId: z.number().int().nullable(),
  produtoNome: z.string().nullable(),
  quantidade: z.number(),
  valorProdutos: z.number(),
  saldoEstoque: z.number(),
  faltando: z.number(),
  temEstoque: z.boolean(),
});

const dados = z.object({
  encontrado: z.boolean(),
  pedido: pedidoSchema,
  trilha: z.array(trilhaSchema),
  itens: z.array(itemSchema),
  /** O que falta para avançar, derivado dos gatilhos da etapa atual. */
  pendencia: z.string().nullable(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

export const comercialPedidoSituacao: ToolEntry<Input, Output> = {
  id: "comercial_pedido_situacao",
  dominio: "comercial",
  descricao:
    "Situacao detalhada de um pedido (imersao COMPLETA): por onde passou (trilha de " +
    "etapas), em que etapa esta agora, ha quantos dias esta parado, os dados-chave " +
    "(operacao, empresa, cliente, valor, aprovacao) E os PRODUTOS do pedido com o " +
    "saldo em estoque de cada um (faltando>0 = precisa comprar/repor para avancar). " +
    "Use para 'detalhes do pedido X', 'o que tem no pedido', 'o que falta no pedido', " +
    "'por que o pedido esta parado', 'quais produtos do pedido nao temos em estoque'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido", "fato_pedido_historico"],
      () => queryPedidoSituacao(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;

    if (!d.encontrado || !d.pedido) {
      return {
        ...envelope,
        estado: "ok" as const,
        dados: {
          ...d,
          _RESPOSTA: `Pedido "${input.numero}" nao encontrado no cache.`,
        },
      };
    }

    const p = d.pedido;
    const passos = d.trilha.map((t) => t.etapaNome ?? "?").join(" -> ");
    const situacao =
      p.bucketDemanda === "ABERTA"
        ? "em demanda aberta"
        : p.bucketDemanda === "FECHADA"
          ? "concluido (nota emitida)"
          : "fora da demanda de venda";
    const parado = p.diasParado != null ? `ha ${p.diasParado} dias` : "sem historico de tempo";
    const aprov = ddmm(p.dataAprovacao);

    // Produtos + estoque: o que o pedido tem e o que falta em estoque para avancar.
    const semEstoque = d.itens.filter((it) => it.faltando > 0);
    const nQtd = (v: number) =>
      v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    let bloco: string;
    if (d.itens.length === 0) {
      bloco = " Sem itens de produto detalhados no cache para este pedido.";
    } else if (semEstoque.length === 0) {
      bloco = ` ${d.itens.length} item(ns) de produto; todos com saldo suficiente em estoque.`;
    } else {
      const faltas = semEstoque
        .slice(0, 8)
        .map(
          (it) =>
            `${it.produtoNome ?? "produto ?"} (precisa ${nQtd(it.quantidade)}, ha ${nQtd(it.saldoEstoque)}, faltam ${nQtd(it.faltando)})`,
        )
        .join("; ");
      bloco =
        ` ${d.itens.length} item(ns); ${semEstoque.length} SEM estoque suficiente (precisa comprar/repor para avancar): ${faltas}.`;
    }

    const resposta =
      `${p.numero} (${p.operacaoNome ?? "sem operacao"}, ${brl(p.valorProdutos)}` +
      `${p.participanteNome ? `, cliente ${p.participanteNome}` : ""}). ` +
      `Esta ${parado} na etapa "${p.etapaNome ?? "?"}" (${situacao}).` +
      `${aprov ? ` Aprovado em ${aprov}.` : ""}` +
      `${passos ? ` Passou por: ${passos}.` : ""}` +
      bloco +
      `${d.pendencia ? ` ${d.pendencia}` : ""}`;

    return {
      ...envelope,
      estado: "ok" as const,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _DESTAQUE: {
          numero: p.numero ?? input.numero,
          etapaAtual: p.etapaNome ?? "?",
          diasParado: p.diasParado ?? 0,
          valor: p.valorProdutos,
          itens: d.itens.length,
          itensSemEstoque: semEstoque.length,
        },
      },
    };
  },
};
