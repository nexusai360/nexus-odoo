// mcp/tools/fiscal/produtos-faturados.ts
// Tool MCP: fiscal_produtos_faturados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryProdutosFaturados } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  limite: z.number().int().min(1).max(100).optional().default(20),
});

const linhaSchema = z.object({
  produtoNome: z.string().nullable(),
  quantidadeTotal: z.number(),
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

function shape(d: Awaited<ReturnType<typeof queryProdutosFaturados>>) {
  return {
    linhas: d.linhas,
    aviso:
      "Agrupa itens de notas de saída (entradaSaida='1') por produto, " +
      "ordenado por valor total descendente. Notas de entrada não são consideradas.",
  };
}

export const fiscalProdutosFaturados: ToolEntry<Input, Output> = {
  id: "fiscal_produtos_faturados",
  dominio: "fiscal",
  descricao:
    "Produtos mais faturados em notas de saída, agrupados por nome do produto com quantidade total e valor total. Útil para analisar mix de vendas.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_nota_fiscal_item"], async () =>
      shape(await queryProdutosFaturados(ctx.prisma, input)),
    ),
};
