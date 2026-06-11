// mcp/tools/fiscal/vendas-produto-por-empresa.ts
// Tool MCP: fiscal_vendas_produto_por_empresa , B4 Cobertura Cliente.
//
// Cruzamento produto x empresa: vendas (itens de saida autorizada com CFOP de
// RECEITA pela Tabela de Regras) de um produto, agrupadas por empresa do
// grupo, com CMV APROXIMADO opcional (custo de tabela 'Custo%' vigente ,
// spike S1 2026-06-11: cobertura 83,8% dos produtos vendidos; a resposta
// informa a cobertura e a ressalva "custo de tabela, nao contabil").
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { resolverPeriodoFiscal, type PeriodoResolvido } from "./_periodo-padrao.js";
import { extrairCfop } from "@/lib/fiscal/regras/extrair-cfop.js";
import { classificarCfop } from "@/lib/fiscal/regras/classificar.js";

const inputSchema = z.object({
  produtoTermo: z.string().min(2).max(120).describe("Nome ou codigo do produto."),
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const linhaSchema = z.object({
  empresa: z.string().nullable(),
  quantidade: z.number(),
  valorVenda: z.number(),
  nNotas: z.number().int(),
  cmvAproximado: z.number().nullable(),
});

const dados = z.object({
  produtoLabel: z.string(),
  linhas: z.array(linhaSchema),
  quantidadeTotal: z.number(),
  valorVendaTotal: z.number(),
  nNotasTotal: z.number().int(),
  cmvAproximadoTotal: z.number().nullable(),
  coberturaCustoPct: z.number().nullable(),
  custoUnitarioTabela: z.number().nullable(),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
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

interface ItemRow {
  produto_id: number | null;
  produto_nome: string | null;
  cfop_nome: string | null;
  empresa_nome: string | null;
  documento_id: number | null;
  quantidade: string | number | null;
  vr_produtos: string | number;
}

async function queryVendasProdutoPorEmpresa(
  prisma: PrismaClient,
  produtoTermo: string,
  per: PeriodoResolvido,
) {
  // Itens do produto (saida autorizada). Classificacao de RECEITA e feita em
  // TS pela Tabela de Regras (mesma semantica da receita consolidada F2.5) ,
  // o volume de UM produto e pequeno, agregacao em memoria e segura.
  const itens = await prisma.$queryRawUnsafe<ItemRow[]>(
    `SELECT i.produto_id, i.produto_nome, i.cfop_nome, nf.empresa_nome,
            i.documento_id, i.quantidade::text, i.vr_produtos::text
     FROM fato_nota_fiscal_item i
     JOIN fato_nota_fiscal nf ON i.documento_id = nf.odoo_id
     WHERE i.situacao_nfe = 'autorizada'
       AND i.entrada_saida = '1'
       AND i.produto_nome ILIKE $1
       AND i.data_emissao >= $2::timestamp
       AND i.data_emissao <= $3::timestamp`,
    `%${produtoTermo}%`,
    `${per.periodoDe}T00:00:00`,
    `${per.periodoAte}T23:59:59`,
  );

  const porEmpresa = new Map<
    string,
    { quantidade: number; valorVenda: number; notas: Set<number>; qtdComCusto: number }
  >();
  const produtoIds = new Set<number>();
  let produtoLabel = produtoTermo;
  for (const it of itens) {
    const cfop = extrairCfop(it.cfop_nome);
    if (!classificarCfop(cfop).ehReceita) continue; // venda de verdade
    if (it.produto_id) produtoIds.add(it.produto_id);
    if (it.produto_nome) produtoLabel = it.produto_nome;
    const key = it.empresa_nome ?? "(sem empresa)";
    const cur =
      porEmpresa.get(key) ??
      { quantidade: 0, valorVenda: 0, notas: new Set<number>(), qtdComCusto: 0 };
    cur.quantidade += Number(it.quantidade ?? 0);
    cur.valorVenda += Number(it.vr_produtos);
    if (it.documento_id) cur.notas.add(it.documento_id);
    porEmpresa.set(key, cur);
  }

  // CMV aproximado: custo de tabela 'Custo%' vigente do(s) produto(s) casados.
  // Com varios produtos no termo, usa o custo por produto e soma por unidade.
  const custos = produtoIds.size
    ? await prisma.$queryRawUnsafe<{ produto_id: number; valor: string | number }[]>(
        `SELECT DISTINCT ON (produto_id) produto_id, valor::text
         FROM fato_preco
         WHERE produto_id = ANY($1::int[]) AND tabela_nome ILIKE 'Custo%'
           AND (data_inicial IS NULL OR data_inicial <= now())
           AND (data_final IS NULL OR data_final >= now())
         ORDER BY produto_id, data_inicial DESC NULLS LAST`,
        [...produtoIds],
      )
    : [];
  const custoPorProduto = new Map(custos.map((c) => [c.produto_id, Number(c.valor)]));

  // 2a passada para CMV por empresa (precisa do custo por item)
  const cmvPorEmpresa = new Map<string, { cmv: number; qtdComCusto: number; qtdTotal: number }>();
  for (const it of itens) {
    const cfop = extrairCfop(it.cfop_nome);
    if (!classificarCfop(cfop).ehReceita) continue;
    const key = it.empresa_nome ?? "(sem empresa)";
    const cur = cmvPorEmpresa.get(key) ?? { cmv: 0, qtdComCusto: 0, qtdTotal: 0 };
    const qtd = Number(it.quantidade ?? 0);
    cur.qtdTotal += qtd;
    const custo = it.produto_id ? custoPorProduto.get(it.produto_id) : undefined;
    if (custo !== undefined) {
      cur.cmv += qtd * custo;
      cur.qtdComCusto += qtd;
    }
    cmvPorEmpresa.set(key, cur);
  }

  const linhas = [...porEmpresa.entries()]
    .map(([empresa, v]) => {
      const c = cmvPorEmpresa.get(empresa);
      const temCusto = (c?.qtdComCusto ?? 0) > 0;
      return {
        empresa: empresa === "(sem empresa)" ? null : empresa,
        quantidade: v.quantidade,
        valorVenda: v.valorVenda,
        nNotas: v.notas.size,
        cmvAproximado: temCusto ? c!.cmv : null,
      };
    })
    .sort((a, b) => b.valorVenda - a.valorVenda);

  const quantidadeTotal = linhas.reduce((a, l) => a + l.quantidade, 0);
  const valorVendaTotal = linhas.reduce((a, l) => a + l.valorVenda, 0);
  const nNotasTotal = new Set(
    itens.filter((i) => classificarCfop(extrairCfop(i.cfop_nome)).ehReceita && i.documento_id)
      .map((i) => i.documento_id),
  ).size;
  const qtdComCustoTotal = [...cmvPorEmpresa.values()].reduce((a, c) => a + c.qtdComCusto, 0);
  const cmvTotal = [...cmvPorEmpresa.values()].reduce((a, c) => a + c.cmv, 0);
  const coberturaCustoPct =
    quantidadeTotal > 0 ? (qtdComCustoTotal / quantidadeTotal) * 100 : null;
  const unicoProduto = produtoIds.size === 1 ? [...produtoIds][0] : null;
  return {
    produtoLabel,
    linhas,
    quantidadeTotal,
    valorVendaTotal,
    nNotasTotal,
    cmvAproximadoTotal: qtdComCustoTotal > 0 ? cmvTotal : null,
    coberturaCustoPct,
    custoUnitarioTabela: unicoProduto ? custoPorProduto.get(unicoProduto) ?? null : null,
  };
}

export const fiscalVendasProdutoPorEmpresa: ToolEntry<Input, Output> = {
  id: "fiscal_vendas_produto_por_empresa",
  dominio: "fiscal",
  descricao:
    "Vendas de UM produto agrupadas por empresa do grupo (quantidade, valor e nº de " +
    "notas; só saída autorizada com CFOP de venda), com CMV APROXIMADO por empresa " +
    "(custo de tabela 'Custo', não contábil). Use para 'venda do produto X por empresa', " +
    "'quanto vendemos de esteira por empresa e qual o CMV', 'CMV do produto X'. " +
    "Informe `produtoTermo` (nome ou código).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal_item", "fato_preco"],
      async () => ({
        ...(await queryVendasProdutoPorEmpresa(ctx.prisma, input.produtoTermo, per)),
        ordenadoPor: "valorVenda desc",
        aviso:
          "Vendas = itens de saida autorizada com CFOP de venda (Tabela de Regras). " +
          "CMV e APROXIMADO: usa o custo de tabela 'Custo' vigente do cadastro, nao a " +
          `contabilidade (que nao e operada no sistema). Período: ${per.label}.`,
      }),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "fiscal_vendas_produto_por_empresa", {
      periodo: per,
      destaque: {
        produtoLabel: d.produtoLabel,
        quantidadeTotal: d.quantidadeTotal,
        valorVendaTotal: d.valorVendaTotal,
        nNotasTotal: d.nNotasTotal,
        cmvAproximadoTotal: d.cmvAproximadoTotal ?? 0,
        coberturaCustoPct: d.coberturaCustoPct ?? 0,
        empresas: d.linhas.length,
      },
      agregado: { soma: d.valorVendaTotal, contagem: d.nNotasTotal },
    });
  },
};
