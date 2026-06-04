// mcp/tools/comercial/pedidos-por-vendedor.ts
// Tool MCP: comercial_pedidos_por_vendedor
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosPorVendedor } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  ...paginacaoInputShape,
});

// array "linhas" → ARRAY_KEYS_PRIORITY detecta vazio sem isVazio custom (P-M1)
const linhaSchema = z.object({
  vendedorNome: z.string().nullable(),
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

function shape(d: Awaited<ReturnType<typeof queryPedidosPorVendedor>>) {
  return {
    linhas: d.linhas,
    aviso: "Ranking de pedidos por vendedor, ordenado por valor total decrescente. valorTotal usa vrProdutos (valor do pedido, independente de faturamento).",
  };
}

export const comercialPedidosPorVendedor: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_por_vendedor",
  dominio: "comercial",
  descricao: "Ranking de pedidos por vendedor no período, com quantidade e valor total.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido"], async () =>
      shape(await queryPedidosPorVendedor(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const todasLinhas = d.linhas;
    // Aggregados sobre TODO o ranking (independem da pagina).
    const totalPedidos = todasLinhas.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
    const valorTotal = todasLinhas.reduce((s, l) => s + Number(l.valorTotal ?? 0), 0);
    const top = todasLinhas[0];
    const ticketMedio = totalPedidos > 0 ? valorTotal / totalPedidos : 0;
    // Alavanca 2b , EXCECAO de paginacao em memoria: o ranking vem agregado em
    // memoria (group by vendedor), ordenado de forma estavel pela query. Aqui
    // so fatiamos [offset, offset+limit). total = numero de vendedores.
    const paginacao = montarPaginacaoMeta(todasLinhas.length, offset, limit, Math.min(limit, Math.max(0, todasLinhas.length - offset)));
    const pagina = todasLinhas.slice(offset, offset + limit);
    return enriquecerEnvelope(
      { ...envelope, dados: { ...d, linhas: pagina } },
      "comercial_pedidos_por_vendedor",
      {
        destaque: {
          totalVendedores: todasLinhas.length,
          totalPedidos,
          valorTotal,
          ticketMedio,
          topVendedor: top?.vendedorNome ?? "",
          valorTopVendedor: top?.valorTotal ?? 0,
        },
        agregado: { contagem: totalPedidos, soma: valorTotal, media: ticketMedio },
        paginacao,
      },
    );
  },
};
