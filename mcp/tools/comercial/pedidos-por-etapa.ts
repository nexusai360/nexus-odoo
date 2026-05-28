// mcp/tools/comercial/pedidos-por-etapa.ts
// Tool MCP: comercial_pedidos_por_etapa
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosPorEtapa } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({});

// array se chama "linhas" → ARRAY_KEYS_PRIORITY detecta vazio sem isVazio custom (P-M1)
const linhaSchema = z.object({
  etapaNome: z.string().nullable(),
  etapaFinaliza: z.boolean(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  aviso: z.string(),
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

function shape(d: Awaited<ReturnType<typeof queryPedidosPorEtapa>>) {
  return {
    linhas: d.linhas,
    aviso: "Distribuição de pedidos por etapa do fluxo comercial. valorTotal usa vrProdutos (valor do pedido, independente de faturamento). etapaFinaliza=true indica etapa conclusiva.",
  };
}

export const comercialPedidosPorEtapa: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_por_etapa",
  dominio: "comercial",
  descricao: "Distribuição de pedidos por etapa do fluxo comercial, com valor total por etapa.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido"], async () =>
      shape(await queryPedidosPorEtapa(ctx.prisma)),
    );
    if (envelope.estado === "preparando") return envelope;
    // T-31 (Ronda 2): destaque com categorias prontas. Resolve casos onde o
    // LLM via "53 etapas, 1.597 pedidos" e nao entendia qual era o numero
    // de fechados/cancelados. Agora _DESTAQUE traz pedidosConcluidos /
    // pedidosEmAberto / pedidosCancelados / pedidosRascunho separados.
    const linhas = envelope.dados.linhas;
    const totalPedidos = linhas.reduce((s, l) => s + l.quantidade, 0);
    const valorTotal = linhas.reduce((s, l) => s + l.valorTotal, 0);
    let pedidosConcluidos = 0;
    let valorConcluidos = 0;
    let pedidosCancelados = 0;
    let valorCancelados = 0;
    let pedidosRascunho = 0;
    let valorRascunho = 0;
    let pedidosEmAberto = 0;
    let valorEmAberto = 0;
    for (const l of linhas) {
      const nome = (l.etapaNome ?? "").toLowerCase();
      const ehCancelada = /cancel/i.test(nome);
      const ehRascunho = /rascunh|digita|edi[çc][ãa]o|novo|criad/i.test(nome);
      if (ehCancelada) {
        pedidosCancelados += l.quantidade;
        valorCancelados += l.valorTotal;
      } else if (l.etapaFinaliza) {
        pedidosConcluidos += l.quantidade;
        valorConcluidos += l.valorTotal;
      } else if (ehRascunho) {
        pedidosRascunho += l.quantidade;
        valorRascunho += l.valorTotal;
      } else {
        pedidosEmAberto += l.quantidade;
        valorEmAberto += l.valorTotal;
      }
    }
    return enriquecerEnvelope(envelope, "comercial_pedidos_por_etapa", {
      destaque: {
        totalPedidos,
        valorTotal,
        totalEtapas: linhas.length,
        pedidosConcluidos,
        valorConcluidos,
        pedidosCancelados,
        valorCancelados,
        pedidosRascunho,
        valorRascunho,
        pedidosEmAberto,
        valorEmAberto,
      },
      agregado: {
        contagem: totalPedidos,
        soma: valorTotal,
      },
    });
  },
};
