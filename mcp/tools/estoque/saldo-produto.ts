// mcp/tools/estoque/saldo-produto.ts
// Tool MCP: estoque_saldo_produto
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { querySaldoProduto } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  armazemId: z.number().int().positive().optional(),
  familiaId: z.number().int().positive().optional(),
});

const linha = z.object({
  produtoNome: z.string(),
  familiaNome: z.string().nullable(),
  marcaNome: z.string().nullable(),
  saldoTotal: z.number(),
  valorTotal: z.number(),
  numLocais: z.number().int(),
});

const dados = z.object({
  kpis: z.object({
    totalProdutos: z.number().int(),
    produtosNegativos: z.number().int(),
    valorTotal: z.number(),
  }),
  linhas: z.array(linha),
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

function shape(d: Awaited<ReturnType<typeof querySaldoProduto>>) {
  return {
    kpis: d.kpis,
    // achata: o agente não precisa do drill-down detalhePorLocal por linha
    linhas: d.linhas.map((l) => ({
      produtoNome: l.produtoNome,
      familiaNome: l.familiaNome,
      marcaNome: l.marcaNome,
      saldoTotal: l.saldoTotal,
      valorTotal: l.valorTotal,
      numLocais: l.numLocais,
    })),
  };
}

export const estoqueSaldoProduto: ToolEntry<Input, Output> = {
  id: "estoque_saldo_produto",
  dominio: "estoque",
  descricao: "Saldo de estoque por produto: unidades e valor a custo, com nº de localizações.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_estoque_saldo"], async () =>
      shape(await querySaldoProduto(ctx.prisma, input)),
    ),
};
