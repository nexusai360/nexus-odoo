// mcp/tools/comercial/pedidos-periodo.ts
// Tool MCP: comercial_pedidos_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosPeriodo } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { resolverPeriodoCorte } from "../../lib/periodo-corte.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness por não
// achar array em ARRAY_KEYS_PRIORITY (achado P-M1). Sem isVazio custom.
const dados = z.object({
  totalPedidos: z.number().int(),
  valorTotal: z.number(),
  aviso: z.string(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
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

function shape(
  d: Awaited<ReturnType<typeof queryPedidosPeriodo>>,
  periodoLabel: string,
  avisoPeriodo?: string,
) {
  return {
    totalPedidos: d.totalPedidos,
    valorTotal: d.valorTotal,
    periodoCoberto: periodoLabel,
    aviso:
      "Pedidos de venda/inventário. Não há pedido de compra neste módulo. " +
      "Valor usa vrProdutos (vr_produtos), valor do pedido independente de faturamento, consistente com pedidos_por_etapa e pedidos_por_vendedor. " +
      "Para a contagem-total do catálogo de pedidos use comercial_contar_pedidos. " +
      `Período coberto: ${periodoLabel}.` +
      (avisoPeriodo ? ` ${avisoPeriodo}` : ""),
  };
}

export const comercialPedidosPeriodo: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_periodo",
  dominio: "comercial",
  descricao: "Total de pedidos e valor faturado no período informado.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    // Pedido e documento com data (dataOrcamento): o inicio do periodo e grampeado a data de
    // inicio das analises e, sem periodo, o piso e o corte , a query so recorta com o par
    // completo, entao passar o par resolvido e o que impede a soma do cache inteiro.
    const per = resolverPeriodoCorte(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido"], async () =>
      shape(
        await queryPedidosPeriodo(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
        }),
        per.label,
        per.aviso,
      ),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "comercial_pedidos_periodo", {
      periodo: per,
      destaque: {
        totalPedidos: d.totalPedidos,
        valorTotal: d.valorTotal,
        contagem: d.totalPedidos,
        periodoCoberto: per.label,
      },
      agregado: { contagem: d.totalPedidos, soma: d.valorTotal },
    });
  },
};
