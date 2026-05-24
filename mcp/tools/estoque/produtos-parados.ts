// mcp/tools/estoque/produtos-parados.ts
// Tool MCP: estoque_produtos_parados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryProdutosParados } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  faixaDias: z.number().int().nonnegative().optional(),
  armazemId: z.number().int().positive().optional(),
});

const dados = z.object({
  kpis: z.object({ totalParados: z.number().int(), valorImobilizado: z.number() }),
  linhas: z.array(z.object({
    produtoNome: z.string().nullable(),
    localNome: z.string().nullable(),
    saldo: z.number(),
    dias: z.number().int(),
    vrSaldo: z.number(),
  })),
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

function shape(d: Awaited<ReturnType<typeof queryProdutosParados>>) {
  // `total` é redundante para o agente , omitido (está em kpis.totalParados)
  return { kpis: d.kpis, linhas: d.linhas };
}

export const estoqueProdutosParados: ToolEntry<Input, Output> = {
  id: "estoque_produtos_parados",
  dominio: "estoque",
  descricao: "Produtos parados em estoque (saldo > 0, sem movimento).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_produto_parado"], async () =>
      shape(await queryProdutosParados(ctx.prisma, input)),
    ),
};
