// mcp/tools/comercial/produtos-por-margem.ts
// Tool MCP: comercial_produtos_por_margem
//
// Resolve "Top N produtos por margem" / "margem de cada produto" /
// "produto com maior/menor margem". Usa preco_venda - preco_custo do
// fato_produto.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  ordenacao: z.enum(["maior", "menor"]).optional().describe("Default: maior margem"),
  limite: z.number().int().min(1).max(50).optional(),
  termo: z.string().min(1).max(120).optional().describe("Filtro por nome do produto (opcional)"),
});

const linhaSchema = z.object({
  produtoNome: z.string(),
  precoCusto: z.number(),
  precoVenda: z.number(),
  margemAbsoluta: z.number(),
  margemPercentual: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalProdutosComMargem: z.number().int(),
  produtosSemPreco: z.number().int(),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

interface Row {
  nome: string | null;
  preco_custo: string | number;
  preco_venda: string | number;
  margem_pct: string | number;
}

async function queryProdutosPorMargem(prisma: PrismaClient, input: Input) {
  const ordenacao = input.ordenacao ?? "maior";
  const limite = input.limite ?? 10;
  const ordem = ordenacao === "maior" ? "DESC" : "ASC";
  const filtroTermo = input.termo
    ? `AND LOWER(nome) LIKE '%' || LOWER($1) || '%'`
    : "";
  const params: unknown[] = input.termo ? [input.termo] : [];
  const sql = `
    SELECT nome,
           preco_custo,
           preco_venda,
           ((preco_venda - preco_custo) / NULLIF(preco_custo, 0)) * 100 AS margem_pct
    FROM fato_produto
    WHERE preco_custo > 0 AND preco_venda > 0
      ${filtroTermo}
    ORDER BY margem_pct ${ordem}
    LIMIT ${limite}
  `;
  const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...params);

  const cntCom = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM fato_produto WHERE preco_custo > 0 AND preco_venda > 0
  `;
  const cntSem = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM fato_produto WHERE preco_custo = 0 OR preco_venda = 0 OR preco_custo IS NULL OR preco_venda IS NULL
  `;

  const linhas = rows.map((r) => {
    const custo = Number(r.preco_custo);
    const venda = Number(r.preco_venda);
    const abs = venda - custo;
    const pct = Number(r.margem_pct);
    return {
      produtoNome: r.nome ?? "(sem nome)",
      precoCusto: custo,
      precoVenda: venda,
      margemAbsoluta: abs,
      margemPercentual: pct,
    };
  });

  return {
    linhas,
    totalProdutosComMargem: Number(cntCom[0]?.n ?? 0),
    produtosSemPreco: Number(cntSem[0]?.n ?? 0),
    aviso:
      "Margem calculada como (preco_venda - preco_custo) / preco_custo * 100. " +
      "Inclui apenas produtos com ambos os precos > 0.",
  };
}

export const comercialProdutosPorMargem: ToolEntry<Input, Output> = {
  id: "comercial_produtos_por_margem",
  dominio: "comercial",
  descricao:
    "Lista top N produtos por margem (preco_venda vs preco_custo do cadastro). " +
    "Use para 'top produtos por margem', 'maior margem', 'menor margem', 'produto " +
    "com mais lucro por unidade'. Aceita ordenacao=maior|menor (default maior), " +
    "limite (default 10) e termo (opcional, filtra por nome).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_produto"], () =>
      queryProdutosPorMargem(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.linhas[0];
    const fmt = (n: number) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const ordLabel = input.ordenacao === "menor" ? "menor" : "maior";
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: top
          ? `Top produto por ${ordLabel} margem: ${top.produtoNome} (custo ${fmt(top.precoCusto)}, venda ${fmt(top.precoVenda)}, margem ${top.margemPercentual.toFixed(1)}%). ${d.totalProdutosComMargem} produtos com preco cadastrado, ${d.produtosSemPreco} sem preco completo.`
          : "Nenhum produto com preco de custo e venda cadastrados.",
        _DESTAQUE: {
          totalProdutosComMargem: d.totalProdutosComMargem,
          produtosSemPreco: d.produtosSemPreco,
          topProduto: top?.produtoNome ?? "",
          topMargemPercentual: top?.margemPercentual ?? 0,
          topMargemAbsoluta: top?.margemAbsoluta ?? 0,
        },
        _agregado: {
          contagem: d.totalProdutosComMargem,
        },
      },
    };
  },
};
