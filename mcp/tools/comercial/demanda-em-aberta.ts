// mcp/tools/comercial/demanda-em-aberta.ts
// Tool MCP: comercial_demanda_em_aberta
// Demanda em aberta = pedidos de venda a cliente externo, aprovados, ainda sem NF
// ao consumidor final (bucket_demanda='ABERTA', materializado pelo builder). Devolve
// total (pedidos + R$), quebra por etapa e a lista das mais paradas (default: por
// tempo parado na etapa atual).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryDemandaEmAberta } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  empresaId: z.number().int().optional(),
  etapa: z
    .string()
    .optional()
    .describe(
      "Filtra a demanda por etapa (substring, sem acento/maiusc.). Ex.: 'FAT JDS x GRUPO', " +
        "'GERA BOLETO'. Use para pegar OS PEDIDOS (com numero) de uma etapa e depois imergir " +
        "num pedido especifico via comercial_pedido_situacao.",
    ),
  limite: z.number().int().min(1).max(100).optional(),
  ordenacao: z.enum(["tempo_parado", "valor", "data_criacao"]).optional(),
  periodoDe: z
    .string()
    .optional()
    .describe(
      "Inicio da janela (AAAA-MM-DD). Ausente = demanda inteira (nao cortada pelo corte de leitura).",
    ),
  periodoAte: z
    .string()
    .optional()
    .describe("Fim da janela (AAAA-MM-DD). Ausente = ate hoje/futuro."),
});

const etapaSchema = z.object({
  etapaNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
  valorCusto: z.number(),
});

const linhaSchema = z.object({
  numero: z.string().nullable(),
  etapaNome: z.string().nullable(),
  empresaNome: z.string().nullable(),
  participanteNome: z.string().nullable(),
  valorProdutos: z.number(),
  valorCusto: z.number(),
  diasParado: z.number().int().nullable(),
});

const dados = z.object({
  totalPedidos: z.number().int(),
  valorTotal: z.number(),
  valorCusto: z.number(),
  porEtapa: z.array(etapaSchema),
  lista: z.array(linhaSchema),
  ordenadoPor: z.string(),
  /** Quando o job de atendimento completou pela ultima vez (null = nunca rodou). */
  atendimento_sincronizado_em: z.string().nullable(),
  /** true = valor provisorio (caiu na quantidade cheia porque o job nao rodou). */
  parcial: z.boolean().optional(),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Renomeia o status do atendimento para o contrato do envelope (snake_case, como o
 * agente le) e mantem o resto do dado como veio do nucleo.
 */
function shape(d: Awaited<ReturnType<typeof queryDemandaEmAberta>>) {
  const { atendimentoSincronizadoEm, parcial, ...resto } = d;
  return {
    ...resto,
    atendimento_sincronizado_em: atendimentoSincronizadoEm,
    ...(parcial ? { parcial: true } : {}),
  };
}

/** Aviso honesto quando o valor ainda e o do pedido inteiro, nao o que falta entregar. */
const AVISO_PARCIAL =
  "Valor provisório: o atendimento ainda não sincronizou hoje, então estes números somam " +
  "o pedido inteiro (inclusive o que já foi entregue).";

export const comercialDemandaEmAberta: ToolEntry<Input, Output> = {
  id: "comercial_demanda_em_aberta",
  dominio: "comercial",
  descricao:
    "Demanda em aberta (pedidos de venda a cliente externo, aprovados, ainda sem " +
    "nota fiscal ao consumidor final). O valor é o que FALTA ENTREGAR (não o pedido " +
    "inteiro), a preço de venda (`valorTotal`) e a preço de custo (`valorCusto`, a " +
    "mesma base do painel da diretoria). Devolve o total em pedidos e em R$, a quebra " +
    "por etapa (etapa: quantidade) e a lista de pedidos (com NUMERO). Use para " +
    "'quanto temos de demanda em aberto', 'pedidos parados', 'carteira a faturar'. " +
    "Para DRILL numa etapa especifica ('os pedidos em FAT JDS x GRUPO'), passe " +
    "'etapa' para receber os pedidos daquela etapa com numero, e em seguida chame " +
    "comercial_pedido_situacao com o numero para a imersao completa. Aceita filtro " +
    "por empresa, etapa e ordenacao (tempo_parado padrao, valor, data_criacao).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido", "fato_pedido_item", "fato_pedido_historico"],
      async () => shape(await queryDemandaEmAberta(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;

    const filtradoPorEtapa = input.etapa != null && input.etapa.trim() !== "";
    const destaque: Record<string, string | number> = {
      totalPedidos: d.totalPedidos,
      valorTotal: d.valorTotal,
      valorCusto: d.valorCusto,
    };
    if (filtradoPorEtapa) {
      destaque.etapa = input.etapa!;
      destaque.pedidos = d.lista.map((l) => l.numero ?? "?").join(", ").slice(0, 200);
    }
    let resposta: string;
    if (d.totalPedidos === 0) {
      resposta = filtradoPorEtapa
        ? `Nenhum pedido em demanda aberta na etapa "${input.etapa}".`
        : "Nao ha demanda em aberto no momento (nenhum pedido de venda externa aprovado sem nota).";
    } else if (filtradoPorEtapa) {
      // Drill por etapa: enumera os pedidos (com numero) para o agente conseguir
      // imergir num especifico via comercial_pedido_situacao.
      const enumerados = d.lista
        .map(
          (l) =>
            `${l.numero ?? "?"} (${brl(l.valorProdutos)}` +
            `${l.participanteNome ? `, ${l.participanteNome}` : ""}` +
            `${l.diasParado != null ? `, parado ha ${l.diasParado}d` : ""})`,
        )
        .join("; ");
      resposta =
        `Etapa "${input.etapa}": ${d.totalPedidos} pedido(s), ${brl(d.valorTotal)} a preço de venda ` +
        `(${brl(d.valorCusto)} a custo), considerando só o que falta entregar. ` +
        `Pedidos: ${enumerados}. Para imergir num deles, use comercial_pedido_situacao com o numero.`;
    } else {
      resposta =
        `${d.totalPedidos} pedidos em demanda aberta. Falta entregar ${brl(d.valorTotal)} a preço ` +
        `de venda (${brl(d.valorCusto)} a custo). Mostrando ${d.lista.length} (ordenado por ${d.ordenadoPor}).`;
    }
    // O aviso vai no fim, colado no numero, para o agente nao apresentar um valor
    // provisorio como se fosse fechado.
    if (d.parcial) resposta = `${resposta} ${AVISO_PARCIAL}`;

    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _listaTruncada: d.lista.length < d.totalPedidos,
        _DESTAQUE: destaque,
        _agregado: { contagem: d.totalPedidos, valor: d.valorTotal },
      },
    };
  },
};
