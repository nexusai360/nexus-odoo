// mcp/tools/comercial/preco-tabela.ts
// Tool MCP: preco_tabela
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPrecoTabela } from "@/lib/reports/queries/precos.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  tabelaId: z.number().int().positive(),
  limite: z.number().int().min(1).max(1000).optional(),
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
  tabelaNome: z.string().nullable(),
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

export const comercialPrecoTabela: ToolEntry<Input, Output> = {
  id: "preco_tabela",
  dominio: "comercial",
  descricao:
    "Regras de uma tabela de preço pelo seu id: lista as regras (por produto, " +
    "família ou participante) com valor, operação e vigência.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_preco"], () =>
      queryPrecoTabela(ctx.prisma, input),
    ),
};
