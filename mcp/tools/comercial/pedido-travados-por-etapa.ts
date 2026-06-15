// mcp/tools/comercial/pedido-travados-por-etapa.ts
// Tool MCP: comercial_pedido_travados_por_etapa
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidoTravadosPorEtapa } from "@/lib/reports/queries/pedido-historico.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  diasMin: z.number().int().min(1).max(3650).optional().describe("Mínimo de dias parado (default 30)."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  pedidoId: z.number().int().nullable(),
  etapaNome: z.string().nullable(),
  dataEntrada: z.string().nullable(),
  diasParado: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalTravados: z.number().int(),
  diasMin: z.number().int(),
  aviso: z.string(),
  // Contrato de lista (Fase B): pedidos ordenados por dias parado desc na query.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  _PAGINACAO: z.any().optional(),
});
const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryPedidoTravadosPorEtapa>>) {
  return {
    ...d,
    // Contrato de lista (Fase B): query ordena por diasParado desc (desempate pedidoId).
    ordenadoPor: "dias parado desc",
    aviso:
      "Pedidos parados no FLUXO de etapas (processo): o último evento de etapa " +
      "está há mais de `diasMin` dias sem avançar. É travamento de PROCESSO, NÃO " +
      "inadimplência financeira (para parcela vencida use comercial_pedidos_atrasados).",
  };
}

export const comercialPedidoTravadosPorEtapa: ToolEntry<Input, Output> = {
  id: "comercial_pedido_travados_por_etapa",
  dominio: "comercial",
  descricao:
    "Pedidos travados no fluxo de etapas (parados há > N dias na etapa atual, " +
    "critério de PROCESSO, não financeiro). Use para 'quais pedidos estão " +
    "parados/travados numa etapa', 'pedidos sem avançar há X dias'. Para " +
    "inadimplência (parcela vencida) use comercial_pedidos_atrasados. Aceita " +
    "`diasMin` (default 30).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido_historico"], async () =>
      shape(await queryPedidoTravadosPorEtapa(ctx.prisma, { ...input, limit, offset })),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.totalTravados, offset, limit, d.linhas.length);
    // top = primeiro item da pagina; na pagina 0 (offset=0) e o mais antigo global.
    const top = d.linhas[0];
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          d.totalTravados > 0
            ? `${d.totalTravados} pedidos parados há mais de ${d.diasMin} dias no fluxo de etapas. Mais antigo: pedido ${top?.pedidoId} (${top?.diasParado} dias em ${top?.etapaNome ?? "(sem etapa)"}).`
            : `Nenhum pedido parado há mais de ${d.diasMin} dias no fluxo.`,
        _DESTAQUE: { totalTravados: d.totalTravados, diasMin: d.diasMin, maisAntigoDias: top?.diasParado ?? 0 },
        _agregado: { contagem: d.totalTravados },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
