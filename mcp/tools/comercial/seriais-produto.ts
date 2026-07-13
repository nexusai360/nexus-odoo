// mcp/tools/comercial/seriais-produto.ts
// Tool MCP: comercial_seriais_produto
//
// Seriais EM ESTOQUE por produto, lidos de fato_serial_saldo: cada serial com saldo
// positivo e o local onde ele esta. A fonte antiga (fato_serial) nao sabia onde o serial
// estava (100% dos "em estoque" tinham local nulo), entao "parado" nao dizia nada sobre
// onde ir buscar o equipamento. Responde "quantos seriais do produto X temos em estoque",
// "onde estao os seriais de X", "quantos estao em demonstracao".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { querySeriaisProduto } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  produto: z.string().optional().describe("Nome ou codigo do produto (busca parcial)"),
  classificacao: z
    .enum(["fisico", "demonstracao", "todos"])
    .default("todos")
    .describe(
      "Escopo dos locais: 'todos' (padrão, todo serial em estoque, com a quebra entre " +
        "próprio e demonstração), 'fisico' (só o estoque próprio) ou 'demonstracao'.",
    ),
  limite: z.number().int().min(1).max(100).optional(),
});

const linhaSchema = z.object({
  produtoNome: z.string().nullable(),
  emEstoque: z.number().int(),
  proprio: z.number().int(),
  demonstracao: z.number().int(),
  locais: z.number().int(),
  saldo: z.number(),
});

const dados = z.object({
  totalProdutos: z.number().int(),
  totalSeriais: z.number().int(),
  linhas: z.array(linhaSchema),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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

export const comercialSeriaisProduto: ToolEntry<Input, Output> = {
  id: "comercial_seriais_produto",
  dominio: "comercial",
  descricao:
    "Numeros de serie EM ESTOQUE por produto: quantos existem hoje, em quantos locais " +
    "estao e quantos deles estao no estoque proprio ou em demonstracao. Use para " +
    "'quantos seriais do produto X temos', 'onde estao os seriais de X', 'quantos " +
    "equipamentos em demonstracao'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_serial_saldo"],
      () => querySeriaisProduto(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;

    const top = d.linhas[0];
    const resposta =
      d.totalProdutos === 0
        ? "Nenhum produto com seriais em estoque para esse filtro."
        : input.produto && top
          ? `${top.produtoNome}: ${top.emEstoque} seriais em estoque, em ${top.locais} local(is) ` +
            `(${top.proprio} no estoque próprio, ${top.demonstracao} em demonstração).`
          : `${d.totalProdutos} produtos com seriais em estoque (${d.totalSeriais} seriais). ` +
            `Mostrando ${d.linhas.length} por volume.`;

    const destaque: Record<string, string | number> = top
      ? {
          produto: top.produtoNome ?? "?",
          emEstoque: top.emEstoque,
          proprio: top.proprio,
          demonstracao: top.demonstracao,
          locais: top.locais,
        }
      : {};

    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _DESTAQUE: destaque,
      },
    };
  },
};
