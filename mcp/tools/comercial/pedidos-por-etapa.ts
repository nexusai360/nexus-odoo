// mcp/tools/comercial/pedidos-por-etapa.ts
// Tool MCP: comercial_pedidos_por_etapa
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPedidosPorEtapa } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

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

function shape(d: Awaited<ReturnType<typeof queryPedidosPorEtapa>>) {
  return {
    linhas: d.linhas,
    aviso: "Distribuição de pedidos por etapa do fluxo comercial. etapaFinaliza=true indica etapa conclusiva.",
  };
}

export const comercialPedidosPorEtapa: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_por_etapa",
  dominio: "comercial",
  descricao: "Distribuição de pedidos por etapa do fluxo comercial, com valor total por etapa.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_pedido"], async () =>
      shape(await queryPedidosPorEtapa(ctx.prisma)),
    ),
};
