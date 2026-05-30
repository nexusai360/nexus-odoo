// mcp/tools/comercial/pedido-historico-etapas.ts
// Tool MCP: comercial_pedido_historico_etapas
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidoHistoricoEtapas } from "@/lib/reports/queries/pedido-historico.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  pedidoId: z.number().int().describe("odoo_id do pedido (pedido.documento)."),
});

const eventoSchema = z.object({
  etapaId: z.number().int().nullable(),
  etapaNome: z.string().nullable(),
  etapaTipo: z.string().nullable(),
  dataEntrada: z.string().nullable(),
  tempoEtapaDias: z.number().int(),
});
const porEtapaSchema = z.object({
  etapaId: z.number().int().nullable(),
  etapaNome: z.string().nullable(),
  tempoTotalDias: z.number().int(),
  passagens: z.number().int(),
});

const dados = z.object({
  pedidoId: z.number().int(),
  eventos: z.array(eventoSchema),
  porEtapa: z.array(porEtapaSchema),
  totalEventos: z.number().int(),
  tempoTotalDias: z.number().int(),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});
const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryPedidoHistoricoEtapas>>) {
  return {
    ...d,
    aviso:
      "Histórico de transições de etapa de um pedido (1 evento por mudança). " +
      "`porEtapa` soma o tempo total em cada etapa (loops de retrabalho contam " +
      "todas as passagens). `tempoTotalDias` é a soma de todos os eventos.",
  };
}

export const comercialPedidoHistoricoEtapas: ToolEntry<Input, Output> = {
  id: "comercial_pedido_historico_etapas",
  dominio: "comercial",
  descricao:
    "Histórico de etapas de um pedido específico: sequência de transições e " +
    "tempo (em dias) gasto em cada etapa, incluindo retrabalho (passagens " +
    "repetidas). Use para 'quanto tempo o pedido X ficou em cada etapa', " +
    "'histórico de etapas do pedido X'. Requer `pedidoId` (odoo_id do pedido).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido_historico"], async () =>
      shape(await queryPedidoHistoricoEtapas(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.porEtapa[0];
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          d.totalEventos > 0
            ? `Pedido ${d.pedidoId}: ${d.totalEventos} transições, ${d.tempoTotalDias} dias no total. Etapa com mais tempo: ${top?.etapaNome ?? "(sem nome)"} (${top?.tempoTotalDias ?? 0} dias).`
            : `Sem histórico de etapas para o pedido ${d.pedidoId}.`,
        _DESTAQUE: {
          totalEventos: d.totalEventos,
          tempoTotalDias: d.tempoTotalDias,
          etapaMaisLonga: top?.etapaNome ?? "",
          diasEtapaMaisLonga: top?.tempoTotalDias ?? 0,
        },
        _agregado: { contagem: d.totalEventos, soma: d.tempoTotalDias },
      },
    };
  },
};
