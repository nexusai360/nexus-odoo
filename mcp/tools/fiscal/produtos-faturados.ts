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
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal_item"], async () =>
      shape(await queryProdutosFaturados(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const todasLinhas = d.linhas;
    const linhasCap = todasLinhas.slice(0, 30);
    const totalGeral = todasLinhas.reduce((s, l) => s + l.valorTotal, 0);
    const totalQtd = todasLinhas.reduce((s, l) => s + Number(l.quantidadeTotal ?? 0), 0);
    const top = todasLinhas[0];
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        linhas: linhasCap,
        _RESPOSTA: top
          ? `Top produto faturado: ${top.produtoNome ?? "(sem nome)"} (${fmt(top.valorTotal)}). Total: ${todasLinhas.length} produtos, ${fmt(totalGeral)}, ${totalQtd} unidades.`
          : "Nao ha produtos faturados no periodo.",
        _DESTAQUE: {
          totalProdutos: todasLinhas.length,
          totalGeral,
          totalQuantidade: totalQtd,
          topProduto: top?.produtoNome ?? "",
          valorTopProduto: top?.valorTotal ?? 0,
          linhasExibidas: linhasCap.length,
        },
        _agregado: { contagem: todasLinhas.length, soma: totalGeral },
        _listaTruncada: todasLinhas.length > linhasCap.length,
      },
    };
  },
};
