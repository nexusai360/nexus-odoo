// mcp/tools/fiscal/produtos-faturados.ts
// Tool MCP: fiscal_produtos_faturados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryProdutosFaturados } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import { montarEscopoEmpresa, type EscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  produtoNome: z.string().nullable(),
  quantidadeTotal: z.number(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  valorGeral: z.number(),
  quantidadeGeral: z.number(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  // Contrato de lista (Fase B): produtos por valor total desc.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
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

function shape(d: Awaited<ReturnType<typeof queryProdutosFaturados>>, escopo: EscopoEmpresa, periodoLabel: string) {
  return {
    linhas: d.linhas,
    total: d.total,
    valorGeral: d.valorGeral,
    quantidadeGeral: d.quantidadeGeral,
    escopoEmpresa: escopo as unknown as Record<string, unknown>,
    ordenadoPor: "valor desc",
    aviso:
      "Agrupa itens de notas de saída (entradaSaida='1') por produto, ordenado por valor total descendente. " +
      "O valor usa vrProdutos (sem impostos), então é menor que o faturamento autorizado; não cruzar diretamente. " +
      `Período: ${periodoLabel}. ` +
      escopo.aviso,
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
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal_item"], async () =>
      shape(
        await queryProdutosFaturados(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
          empresaId: escopo.empresaId,
          limit,
          offset,
        }),
        escopo.escopo,
        per.label,
      ),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // Alavanca 2b: paginacao em memoria por produto (total = produtos distintos).
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    const top = d.linhas[0];
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: top
          ? `Top produto faturado: ${top.produtoNome ?? "(sem nome)"} (${fmt(top.valorTotal)}). Total: ${d.total} produtos, ${fmt(d.valorGeral)}, ${d.quantidadeGeral} unidades.`
          : "Nao ha produtos faturados no periodo.",
        _DESTAQUE: {
          totalProdutos: d.total,
          totalGeral: d.valorGeral,
          totalQuantidade: d.quantidadeGeral,
          topProduto: top?.produtoNome ?? "",
          valorTopProduto: top?.valorTotal ?? 0,
          linhasExibidas: d.linhas.length,
        },
        _agregado: { contagem: d.total, soma: d.valorGeral },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
