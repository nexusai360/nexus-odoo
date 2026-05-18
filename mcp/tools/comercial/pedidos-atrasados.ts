// mcp/tools/comercial/pedidos-atrasados.ts
// Tool MCP: comercial_pedidos_atrasados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosAtrasados } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

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
  aviso: z.string(),
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

function shape(d: Awaited<ReturnType<typeof queryPedidosAtrasados>>) {
  return {
    linhas: d.linhas.map((l) => ({
      ...l,
      dataVencimento: l.dataVencimento ? l.dataVencimento.toISOString() : null,
    })),
    totalAtrasado: d.totalAtrasado,
    aviso:
      "Atraso calculado por parcela de pedido com data de vencimento anterior a hoje e não faturada. " +
      "Atraso por dataPrevista do pedido é parcial (~30/71) e não usado nesta tool.",
  };
}

export const comercialPedidosAtrasados: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_atrasados",
  dominio: "comercial",
  descricao: "Parcelas de pedidos vencidas e não faturadas, com valor total atrasado e dias de atraso.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_pedido", "fato_pedido_parcela"], async () =>
      shape(await queryPedidosAtrasados(ctx.prisma, new Date())),
    ),
};
