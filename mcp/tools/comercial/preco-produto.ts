// mcp/tools/comercial/preco-produto.ts
// Tool MCP: preco_produto
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPrecoProduto } from "@/lib/reports/queries/precos.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  // Busca por termo no nome do produto (aceita o nome ou o código que aparece
  // entre colchetes no nome). NÃO existe parâmetro de id interno: o código
  // visível do produto não é o id interno e usá-lo como id retorna vazio.
  termo: z.string().min(1).max(120).optional(),
  limite: z.number().int().min(1).max(500).optional(),
});

const linha = z.object({
  odooId: z.number().int(),
  tabelaNome: z.string().nullable(),
  dimensao: z.string(),
  produtoNome: z.string().nullable(),
  familiaNome: z.string().nullable(),
  participanteNome: z.string().nullable(),
  operacao: z.string().nullable(),
  precoBase: z.string().nullable(),
  valor: z.number().nullable(),
  aliquota: z.number().nullable(),
  quantidadeMinima: z.number(),
  dataInicial: z.string().nullable(),
  dataFinal: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
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

export const comercialPrecoProduto: ToolEntry<Input, Output> = {
  id: "preco_produto",
  dominio: "comercial",
  descricao:
    "Regras de preço de um produto nas tabelas de preço: valor, operação " +
    "(fixo, valor, margem, markup, desconto), preço-base, vigência e " +
    "quantidade mínima. Busca por `termo` no nome do produto (passe o nome " +
    "do produto ou o código que aparece entre colchetes no nome).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_preco"], () =>
      queryPrecoProduto(ctx.prisma, input),
    ),
};
