// mcp/tools/estoque/top-movimentados.ts
// Tool MCP: estoque_top_movimentados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryTopMovimentados } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";

const TOP_TOOL = 20;

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  sentido: z.enum(["entrada", "saida"]).optional(),
});

const dados = z.object({
  kpis: z.object({ totalProdutos: z.number().int(), totalUnidades: z.number() }),
  top: z.array(z.object({ rotulo: z.string(), valor: z.number() })),
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

function shape(d: Awaited<ReturnType<typeof queryTopMovimentados>>) {
  return {
    kpis: d.kpis,
    top: d.linhas.slice(0, TOP_TOOL),
  };
}

export const estoqueTopMovimentados: ToolEntry<Input, Output> = {
  id: "estoque_top_movimentados",
  dominio: "estoque",
  descricao: "Top 20 produtos mais movimentados em estoque.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_estoque_movimento"], async () =>
      shape(await queryTopMovimentados(ctx.prisma, input)),
    ),
};
