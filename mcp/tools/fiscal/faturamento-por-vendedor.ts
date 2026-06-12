// mcp/tools/fiscal/faturamento-por-vendedor.ts
// Tool MCP: fiscal_faturamento_por_vendedor , backlog pos-review (item e).
//
// Faturamento de venda agrupado pelo VENDEDOR do pedido: a NF de saida
// autorizada liga ao pedido via raw_sped_documento.data->pedido_id e o pedido
// carrega o vendedor em raw_pedido_documento.data->vendedor_id (m2o [id, nome]).
// Base de receita identica ao faturamento_por_cliente (vrProdutos + ehReceita
// por CFOP; intragrupo separado). Notas sem pedido vinculado (transferencias,
// remessas, faturamento direto) ficam fora do ranking, somadas a parte.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { carregarItensVendaComGrupo } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional()
    .describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
});

const linhaSchema = z.object({
  vendedor: z.string(),
  notas: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalVendedores: z.number().int(),
  totalComVendedor: z.number(),
  totalSemPedido: z.number(),
  notasSemPedido: z.number().int(),
  totalIntragrupo: z.number(),
  topVendedor: z.string().nullable(),
  periodoLabel: z.string(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// De-para documentoId (NF) -> nome do vendedor do pedido de origem. So existem
// ~2k notas com pedido vinculado; trazer o mapa inteiro e resolver em memoria
// evita IN(...) gigante e mantem a base canonica intacta.
async function carregarVendedorPorNota(prisma: PrismaClient): Promise<Map<number, string>> {
  const rows = await prisma.$queryRawUnsafe<{ doc: number; vendedor: string | null }[]>(
    `SELECT d.odoo_id AS doc, p.data->'vendedor_id'->>1 AS vendedor
     FROM raw_sped_documento d
     JOIN raw_pedido_documento p
       ON p.odoo_id = (CASE WHEN jsonb_typeof(d.data->'pedido_id') = 'array'
                            THEN d.data->'pedido_id'->>0 END)::int
     WHERE jsonb_typeof(d.data->'pedido_id') = 'array'
       AND jsonb_typeof(p.data->'vendedor_id') = 'array'
       AND COALESCE(d.raw_deleted, false) = false
       AND COALESCE(p.raw_deleted, false) = false`,
  );
  const mapa = new Map<number, string>();
  for (const r of rows) {
    if (r.vendedor) mapa.set(Number(r.doc), r.vendedor.trim());
  }
  return mapa;
}

export const fiscalFaturamentoPorVendedor: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_vendedor",
  dominio: "fiscal",
  descricao:
    "Faturamento de venda agrupado por vendedor (NF de saida autorizada ligada ao pedido " +
    "de origem e ao vendedor do pedido), ordenado por valor decrescente. Notas sem pedido " +
    "vinculado (transferencias, remessas) ficam fora do ranking, somadas a parte. Use para " +
    "'faturamento por vendedor', 'quanto cada vendedor vendeu', 'ranking de vendedores', " +
    "'vendas do vendedor X'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const [{ itens }, vendedorPorNota] = await Promise.all([
        carregarItensVendaComGrupo(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
          empresaId: escopo.empresaId,
        }),
        carregarVendedorPorNota(ctx.prisma),
      ]);
      const porVendedor = new Map<string, { valor: number; notas: Set<number> }>();
      const notasSemPedido = new Set<number>();
      let totalSemPedido = 0;
      let totalIntragrupo = 0;
      for (const it of itens) {
        if (!it.ehReceita) continue;
        if (it.intragrupo) {
          totalIntragrupo += it.valorProdutos;
          continue;
        }
        const vendedor = it.documentoId !== null ? vendedorPorNota.get(it.documentoId) : undefined;
        if (!vendedor) {
          totalSemPedido += it.valorProdutos;
          if (it.documentoId !== null) notasSemPedido.add(it.documentoId);
          continue;
        }
        const acc = porVendedor.get(vendedor) ?? { valor: 0, notas: new Set<number>() };
        acc.valor += it.valorProdutos;
        if (it.documentoId !== null) acc.notas.add(it.documentoId);
        porVendedor.set(vendedor, acc);
      }
      const linhas = [...porVendedor.entries()]
        .map(([vendedor, acc]) => ({
          vendedor,
          notas: acc.notas.size,
          valorTotal: Math.round(acc.valor * 100) / 100,
        }))
        .sort((a, b) => b.valorTotal - a.valorTotal);
      return {
        linhas,
        totalVendedores: linhas.length,
        totalComVendedor: Math.round(linhas.reduce((a, l) => a + l.valorTotal, 0) * 100) / 100,
        totalSemPedido: Math.round(totalSemPedido * 100) / 100,
        notasSemPedido: notasSemPedido.size,
        totalIntragrupo: Math.round(totalIntragrupo * 100) / 100,
        topVendedor: linhas[0]?.vendedor ?? null,
        periodoLabel: per.label,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        ordenadoPor: "valor desc",
        aviso:
          "Vendedor vem do pedido de origem da NF (receita externa, base produtos por CFOP). " +
          "Notas sem pedido vinculado (transferencias, remessas, faturamento direto) nao tem " +
          "vendedor identificavel e ficam fora do ranking, somadas em totalSemPedido. " +
          `Período: ${per.label}. ${escopo.escopo.aviso}`,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.linhas[0];
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_vendedor", {
      periodo: per,
      destaque: {
        totalVendedores: d.totalVendedores,
        totalComVendedor: d.totalComVendedor,
        totalSemPedido: d.totalSemPedido,
        notasSemPedido: d.notasSemPedido,
        totalIntragrupo: d.totalIntragrupo,
        topVendedor: top?.vendedor ?? "",
        valorTopVendedor: top?.valorTotal ?? 0,
        notasTopVendedor: top?.notas ?? 0,
        periodoLabel: d.periodoLabel,
      },
      agregado: { contagem: d.totalVendedores, soma: d.totalComVendedor },
    });
  },
};
