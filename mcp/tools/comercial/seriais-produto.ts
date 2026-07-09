// mcp/tools/comercial/seriais-produto.ts
// Tool MCP: comercial_seriais_produto
// Seriais por produto: parados (em estoque, sem saida) vs saidos (ja apareceram em
// nota de saida autorizada). Responde "quantos seriais parados do produto X",
// "seriais em estoque vs vendidos".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { querySeriaisProduto } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  produto: z.string().optional().describe("Nome ou codigo do produto (busca parcial)"),
  limite: z.number().int().min(1).max(100).optional(),
});

const linhaSchema = z.object({
  produtoNome: z.string().nullable(),
  total: z.number().int(),
  parados: z.number().int(),
  sairam: z.number().int(),
});

const dados = z.object({
  totalProdutos: z.number().int(),
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
    "Numeros de serie por produto: quantos estao parados em estoque (sem saida) e " +
    "quantos ja sairam (apareceram em nota de saida autorizada). Use para 'seriais " +
    "parados do produto X', 'quantos numeros de serie em estoque vs vendidos'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_serial", "fato_nota_fiscal_item", "fato_nota_fiscal"],
      () => querySeriaisProduto(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;

    const top = d.linhas[0];
    const resposta =
      d.totalProdutos === 0
        ? "Nenhum produto com seriais encontrado para esse filtro."
        : input.produto && top
          ? `${top.produtoNome}: ${top.total} seriais , ${top.parados} parados em estoque, ${top.sairam} ja sairam.`
          : `${d.totalProdutos} produtos com seriais. Mostrando ${d.linhas.length} por volume.`;

    const destaque: Record<string, string | number> = top
      ? { produto: top.produtoNome ?? "?", parados: top.parados, sairam: top.sairam }
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
