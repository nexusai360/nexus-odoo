// mcp/tools/fiscal/faturamento-por-cfop.ts
// Tool MCP: fiscal_faturamento_por_cfop , faturamento por operacao fiscal (CFOP/categoria)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape } from "../../lib/paginacao.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
  agruparPor: z.enum(["cfop", "categoria"]).optional(),
  ...paginacaoInputShape,
});

const linha = z.object({
  chave: z.string(),
  rotulo: z.string(),
  categoria: z.string(),
  ehReceita: z.boolean(),
  totalItens: z.number().int(),
  valorProdutos: z.number(),
});

const dados = z.object({
  agruparPor: z.enum(["cfop", "categoria"]),
  linhas: z.array(linha),
  total: z.number().int(),
  totalProdutos: z.number(),
  totalReceita: z.number(),
  totalNaoReceita: z.number(),
  semCfop: z.object({ totalItens: z.number().int(), valorProdutos: z.number() }),
  // Fase 2.6: transparencia (aditivo).
  semCfopPorFinalidade: z
    .array(z.object({ finalidade: z.string(), totalItens: z.number().int(), valorProdutos: z.number() }))
    .optional(),
  outrasNaoEspecificadas: z
    .object({ totalItens: z.number().int(), valorProdutos: z.number(), valorFinalidadeVenda: z.number() })
    .optional(),
  reconciliacao: z.object({
    somaProdutosItens: z.number(),
    somaProdutosNotas: z.number(),
    diferenca: z.number(),
    observacao: z.string(),
  }),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  // Contrato de lista (Fase B): as linhas ja vem por valor de produtos desc.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

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

export const fiscalFaturamentoPorCfop: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_cfop",
  dominio: "fiscal",
  descricao:
    "Faturamento de saida autorizado por operacao fiscal: agrupa por categoria gerencial (venda, servico, transferencia, devolucao...) ou por CFOP cru. Separa receita (venda/servico/exportacao) de movimentacao que nao e receita. Base: valor dos produtos no item. Aceita empresa e periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal", "fato_nota_fiscal_item"],
      async () => {
        const r = await faturamentoPorCfop(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
          empresaId: escopo.empresaId,
          agruparPor: input.agruparPor,
          limit: input.limit,
          offset: input.offset,
        });
        const gap =
          r.semCfop.valorProdutos > 0
            ? ` Atencao: R$ ${r.semCfop.valorProdutos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${r.semCfop.totalItens} itens sem CFOP (sem classificacao fiscal).`
            : "";
        return {
          agruparPor: r.agruparPor,
          linhas: r.linhas,
          total: r.total,
          totalProdutos: r.totalProdutos,
          totalReceita: r.totalReceita,
          totalNaoReceita: r.totalNaoReceita,
          semCfop: r.semCfop,
          semCfopPorFinalidade: r.semCfopPorFinalidade,
          outrasNaoEspecificadas: r.outrasNaoEspecificadas,
          reconciliacao: r.reconciliacao,
          escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
          ordenadoPor: "valor desc",
          aviso:
            escopo.escopo.aviso +
            ` Periodo: ${per.label}.` +
            (per.assumido ? " (Nenhum periodo foi informado, entao considerei o ano corrente.)" : "") +
            " " + r.reconciliacao.observacao + gap,
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;

    const d = envelope.dados;
    const topLinhas = d.linhas.slice(0, 8).map((l) => ({ rotulo: l.rotulo, valor: l.valorProdutos, ehReceita: l.ehReceita }));
    const porFin = d.semCfopPorFinalidade ?? [];
    const semCfopVendaValor = porFin.filter((f) => f.finalidade === "1").reduce((s, f) => s + f.valorProdutos, 0);
    const semCfopDevolucaoValor = porFin.filter((f) => f.finalidade === "4").reduce((s, f) => s + f.valorProdutos, 0);
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_cfop", {
      destaque: {
        agruparPor: d.agruparPor,
        totalProdutos: d.totalProdutos,
        totalReceita: d.totalReceita,
        totalNaoReceita: d.totalNaoReceita,
        linhasCount: d.total,
        semCfopValor: d.semCfop.valorProdutos,
        semCfopVendaValor,
        semCfopDevolucaoValor,
        outrasValor: d.outrasNaoEspecificadas?.valorProdutos ?? 0,
        outrasFinalidadeVendaValor: d.outrasNaoEspecificadas?.valorFinalidadeVenda ?? 0,
        diferencaReconc: d.reconciliacao.diferenca,
        topLinhasJson: JSON.stringify(topLinhas),
      },
      agregado: { soma: d.totalProdutos, contagem: d.total },
    });
  },
};
