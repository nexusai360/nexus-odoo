// mcp/tools/fiscal/faturamento-por-marca.ts
// Tool MCP: fiscal_faturamento_por_marca
// Faturamento por MARCA do produto na MESMA base canonica da receita externa
// (Fase 2.5): vrProdutos dos itens, ehReceita por CFOP, intragrupo eliminado. O
// totalGeral bate com fiscal_faturamento_periodo. A versao anterior somava
// `vr_produtos` de TODO item de saida (sem situacao_nfe autorizada, sem
// classificar receita por CFOP e sem eliminar intragrupo), inflando o numero.
// Pericia: conversa ea8aa0a3 (2026-06-15).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorMarcaCanon } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  limite: z.number().int().min(1).max(50).optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
});

const linhaSchema = z.object({
  marca: z.string().nullable(),
  quantidadeItens: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalGeral: z.number(),
  totalItens: z.number().int(),
  totalMarcas: z.number().int(),
  totalIntragrupo: z.number(),
  periodoLabel: z.string(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  // Contrato de lista (Fase B): a query ordena por valor de produtos desc
  // (NULLS LAST) com desempate por nome da marca.
  ordenadoPor: z.string().optional(),
  aviso: z.string().optional(),
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

export const fiscalFaturamentoPorMarca: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_marca",
  dominio: "fiscal",
  descricao:
    "Faturamento de venda (receita externa) agrupado por MARCA do produto (notas de saida " +
    "autorizadas). Mesma base do faturamento do grupo: o total bate com fiscal_faturamento_periodo. " +
    "Vendas entre empresas do grupo nao entram. Retorna top N marcas com itens e valor + totalGeral. " +
    "Use para 'faturamento por marca', 'qual marca vende mais', 'top marcas'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal", "fato_nota_fiscal_item", "fato_produto"],
      async () => {
        const r = await faturamentoPorMarcaCanon(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
          empresaId: escopo.empresaId,
          limit: input.limite ?? 20,
        });
        return {
          linhas: r.linhas,
          totalGeral: r.totalGeral,
          totalItens: r.totalItens,
          totalMarcas: r.totalMarcas,
          totalIntragrupo: r.totalIntragrupo,
          periodoLabel: per.label,
          escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
          ordenadoPor: "valor desc",
          aviso:
            "Faturamento de venda para fora do grupo, por marca do produto (base produtos por CFOP). " +
            "Vendas entre empresas do mesmo grupo nao entram (ficam em totalIntragrupo). " +
            `Período: ${per.label}. ${escopo.escopo.aviso}`,
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const fmt = (n: number) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const top = d.linhas[0];
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: top
          ? `Faturamento por marca: ${fmt(d.totalGeral)} em ${d.totalMarcas} marcas. Marca que mais faturou: ${top.marca ?? "(sem marca)"} ${fmt(top.valorTotal)}. Esse e o faturamento real (vendas para fora do grupo).`
          : "Nao ha faturamento de venda por marca no periodo.",
        _DESTAQUE: {
          totalGeral: d.totalGeral,
          totalMarcas: d.totalMarcas,
          totalItens: d.totalItens,
          totalIntragrupo: d.totalIntragrupo,
          topMarca: top?.marca ?? "",
          valorTopMarca: top?.valorTotal ?? 0,
        },
        _agregado: { contagem: d.totalMarcas, soma: d.totalGeral },
      },
    };
  },
};
