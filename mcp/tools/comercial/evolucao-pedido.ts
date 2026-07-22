// mcp/tools/comercial/evolucao-pedido.ts
// Tool MCP: comercial_evolucao_pedido , como os VALORES de um pedido mudaram ao longo do tempo
// (etapa, saldo a atender, margem, desconto, impostos incl. CBS/IBS). Fonte:
// fato_pedido_valor_historico (append-por-mudanca). Freshness no fato-BASE `fato_pedido` (que
// grava FatoBuildState); o *_historico nao grava build state (INV-7).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryEvolucaoPedido } from "@/lib/reports/queries/pedido-valor-historico.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  pedidoId: z.number().int().describe("odoo_id do pedido (pedido.documento)."),
});

const pontoSchema = z.object({
  capturadoEm: z.string(),
  evento: z.string(),
  etapaId: z.number().int().nullable(),
  etapaNome: z.string().nullable(),
  saldoAtenderVenda: z.string().nullable(),
  saldoAtenderCusto: z.string().nullable(),
  alMargem: z.string().nullable(),
  vrDesconto: z.string().nullable(),
  vrOperacaoTributacao: z.string().nullable(),
  vrCbs: z.string().nullable(),
  vrIbs: z.string().nullable(),
});

const dados = z.object({
  pedidoId: z.number().int(),
  pontos: z.array(pontoSchema),
  totalPontos: z.number().int(),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
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

function shape(d: Awaited<ReturnType<typeof queryEvolucaoPedido>>) {
  return {
    ...d,
    ordenadoPor: "pontos: capturadoEm asc",
    aviso:
      "Historico de valores do pedido: uma linha por mudanca do nucleo (etapa, saldo a atender, " +
      "margem, desconto, CBS, IBS); os demais valores vem snapshotados junto. Todos os valores sao " +
      "os do Odoo (nunca recalculados). evento='baixa' marca quando o pedido saiu do escopo. A serie " +
      "comeca quando a historizacao foi ligada (2026-07); antes disso nao ha pontos.",
  };
}

export const comercialEvolucaoPedido: ToolEntry<Input, Output> = {
  id: "comercial_evolucao_pedido",
  dominio: "comercial",
  descricao:
    "Evolucao dos valores de um pedido ao longo do tempo: etapa, saldo a atender, margem, " +
    "desconto e impostos (incl. CBS/IBS) a cada mudanca. Use para 'como o pedido X evoluiu', " +
    "'a margem do pedido X mudou?', 'historico de valores do pedido X'. Requer `pedidoId`.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido"], async () =>
      shape(await queryEvolucaoPedido(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const ini = d.pontos[0];
    const fim = d.pontos.at(-1);
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          d.totalPontos > 0
            ? `Pedido ${d.pedidoId}: ${d.totalPontos} ponto(s) no historico de valores. ` +
              `Etapa atual: ${fim?.etapaNome ?? "(sem etapa)"}; margem ${fim?.alMargem ?? "?"}; ` +
              `saldo a atender (venda) ${fim?.saldoAtenderVenda ?? "?"}.` +
              (ini && ini !== fim && ini.alMargem !== fim?.alMargem ? ` Margem inicial era ${ini.alMargem}.` : "")
            : `Sem historico de valores para o pedido ${d.pedidoId} (a serie comeca em 2026-07).`,
        _DESTAQUE: {
          pedidoId: d.pedidoId,
          totalPontos: d.totalPontos,
          etapaAtual: fim?.etapaNome ?? "",
          margemAtual: fim?.alMargem ?? "",
        },
        _agregado: { contagem: d.totalPontos },
      },
    };
  },
};
