// mcp/tools/fiscal/faturamento-recebido.ts
// Tool MCP: fiscal_faturamento_recebido (por pedido real; eixo nota = gap honesto)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoRecebido } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
  eixo: z.enum(["pedido", "nota"]).optional(),
});

const dados = z.object({
  eixo: z.enum(["pedido", "nota"]),
  disponivelPorPedido: z.boolean(),
  disponivelPorNota: z.boolean(),
  recebido: z.number(),
  aReceber: z.number(),
  pedidosComLancamento: z.number().int(),
  gap: z.string().optional(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

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

export const fiscalFaturamentoRecebido: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_recebido",
  dominio: "fiscal",
  descricao: "Faturamento recebido de fato (pago) vs a receber, por pedido. O eixo por nota individual ainda nao e suportado (gap honesto). Aceita empresa.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const eixo = input.eixo ?? "pedido";
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_financeiro_lancamento_item", "fato_pedido"],
      async () => {
        const r = await faturamentoRecebido(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
          empresaId: escopo.empresaId,
        });
        const base = {
          eixo,
          disponivelPorPedido: r.disponivelPorPedido,
          disponivelPorNota: r.disponivelPorNota,
          recebido: r.recebido,
          aReceber: r.aReceber,
          pedidosComLancamento: r.pedidosComLancamento,
          escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        };
        if (eixo === "nota") {
          return {
            ...base,
            gap: r.gapNota,
            aviso:
              "O recebido por nota individual ainda nao e suportado: " +
              "falta o elo nota->financeiro. Use o eixo por pedido. " +
              `Período: ${per.label}. ` +
              escopo.escopo.aviso,
          };
        }
        return { ...base, aviso: `Recebido (pago) vs a receber, por pedido. Período: ${per.label}. ` + escopo.escopo.aviso };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "fiscal_faturamento_recebido", {
      periodo: per,
      destaque: { recebido: envelope.dados.recebido, aReceber: envelope.dados.aReceber },
      agregado: { soma: envelope.dados.recebido, contagem: envelope.dados.pedidosComLancamento },
    });
  },
};
