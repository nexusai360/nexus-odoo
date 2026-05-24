// mcp/tools/comercial/contar-pedidos.ts
// Tool MCP: comercial_contar_pedidos
// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarPedidos } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  total: z.number().int(),
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

export const comercialContarPedidos: ToolEntry<Input, Output> = {
  id: "comercial_contar_pedidos",
  dominio: "comercial",
  descricao:
    "Contagem total de pedidos cadastrados. Use para perguntas de quantidade " +
    "absoluta ('quantos pedidos existem'): devolve só o número, sem amostra.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_pedido"], () =>
      queryContarPedidos(ctx.prisma),
    ),
};
