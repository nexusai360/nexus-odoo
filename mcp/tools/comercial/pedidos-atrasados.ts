// mcp/tools/comercial/pedidos-atrasados.ts
// Tool MCP: comercial_pedidos_atrasados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosAtrasados } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  ...paginacaoInputShape,
});

// array "linhas" → ARRAY_KEYS_PRIORITY detecta vazio sem isVazio custom (P-M1)
const linhaSchema = z.object({
  pedidoId: z.number().int().nullable(),
  participanteNome: z.string().nullable(),
  numero: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  valor: z.number(),
  diasAtraso: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalAtrasado: z.number(),
  totalEncontrados: z.number().int().optional(),
  maxDiasAtraso: z.number().int().optional(),
  aviso: z.string(),
  // Contrato de lista (Fase B): parcelas por vencimento asc (maior atraso primeiro).
  ordenadoPor: z.string().optional(),
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

function shape(d: Awaited<ReturnType<typeof queryPedidosAtrasados>>) {
  return {
    linhas: d.linhas.map((l) => ({
      ...l,
      dataVencimento: l.dataVencimento ? l.dataVencimento.toISOString() : null,
    })),
    totalAtrasado: d.totalAtrasado,
    totalEncontrados: d.totalEncontrados,
    maxDiasAtraso: d.maxDiasAtraso,
    aviso:
      "Atraso calculado por parcela de pedido com data de vencimento anterior a hoje e não faturada. " +
      "Atraso por dataPrevista do pedido tem preenchimento parcial e não é usado nesta tool.",
    // Contrato de lista (Fase B): query ordena por dataVencimento asc, ou seja, o
    // mais atrasado primeiro (desempate odooId).
    ordenadoPor: "vencimento asc (maior atraso primeiro)",
  };
}

export const comercialPedidosAtrasados: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_atrasados",
  dominio: "comercial",
  descricao: "Parcelas de pedidos vencidas e não faturadas, com valor total atrasado e dias de atraso.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido", "fato_pedido_parcela"], async () =>
      shape(await queryPedidosAtrasados(ctx.prisma, new Date(), { limit, offset })),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const total = d.totalEncontrados ?? d.linhas.length;
    const maxDias = d.maxDiasAtraso ?? 0;
    const paginacao = montarPaginacaoMeta(total, offset, limit, d.linhas.length);
    return enriquecerEnvelope(
      envelope,
      "comercial_pedidos_atrasados",
      {
        destaque: {
          totalAtrasados: total,
          contagem: total,
          valorEmRisco: d.totalAtrasado,
          valorTotal: d.totalAtrasado,
          maxDias,
          linhasExibidas: d.linhas.length,
        },
        agregado: { contagem: total, soma: d.totalAtrasado },
        paginacao,
      },
    );
  },
};
