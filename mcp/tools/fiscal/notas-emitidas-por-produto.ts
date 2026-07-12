// mcp/tools/fiscal/notas-emitidas-por-produto.ts
// Tool MCP: fiscal_notas_emitidas_por_produto
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { resolverPeriodoFiscal, type PeriodoResolvido } from "./_periodo-padrao.js";

const inputSchema = z.object({
  produtoTermo: z.string().min(2).max(120).describe("Nome ou codigo do produto."),
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  numero: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  participanteNome: z.string().nullable(),
  quantidade: z.number(),
  valorProdutos: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalNotas: z.number().int(),
  quantidadeTotal: z.number(),
  valorTotal: z.number(),
  linhasExibidas: z.number().int(),
  // Contrato de lista (Fase B): a query ordena por dataEmissao desc com
  // desempate por odooId; aqui apenas declaramos ao LLM.
  ordenadoPor: z.string().optional(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
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

interface Row {
  numero: string | null;
  data_emissao: Date | null;
  participante_nome: string | null;
  quantidade: string | number;
  valor: string | number;
}

async function query(prisma: PrismaClient, input: Input, per: PeriodoResolvido) {
  const { limit, offset } = resolverPaginacao(input);
  // Nota fiscal e documento com data: o recorte de data e SEMPRE emitido. Antes, sem o par
  // completo de datas o filtro sumia do SQL e a tool agregava o historico inteiro do produto.
  // `per` ja vem do resolverPeriodoFiscal, com o inicio grampeado a data de inicio das
  // analises e, na ausencia de periodo, com o piso no corte.
  const filtroPer = `AND nf.data_emissao BETWEEN $2::timestamp AND $3::timestamp`;
  // Parametros base (produto + periodo), usados pela query de total. A query
  // paginada acrescenta LIMIT/OFFSET ao final em `params`. As datas entram como
  // PARAMETRO (nunca interpoladas), ja clampadas.
  const baseParams: unknown[] = [
    `%${input.produtoTermo}%`,
    `${per.periodoDe}T00:00:00`,
    `${per.periodoAte}T23:59:59`,
  ];
  // Alavanca 2b: LIMIT/OFFSET como parametros (posicoes apos os ja usados).
  const pLimit = baseParams.length + 1;
  const pOffset = baseParams.length + 2;
  const params: unknown[] = [...baseParams, limit, offset];

  // Agrega por nota. ORDER BY estavel com desempate por nf.odoo_id para que
  // "os proximos" nao repitam nem pulem nota entre paginas.
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT nf.numero,
            nf.data_emissao,
            nf.participante_nome,
            COALESCE(SUM(nfi.quantidade), 0)::text AS quantidade,
            COALESCE(SUM(nfi.vr_produtos), 0)::text AS valor
       FROM fato_nota_fiscal nf
       JOIN fato_nota_fiscal_item nfi ON nfi.documento_id = nf.odoo_id
       JOIN fato_produto p ON p.odoo_id = nfi.produto_id
       WHERE nf.entrada_saida = '1'
         AND (LOWER(p.nome) ILIKE LOWER($1) OR p.odoo_id::text = $1)
         ${filtroPer}
       GROUP BY nf.odoo_id, nf.numero, nf.data_emissao, nf.participante_nome
       ORDER BY nf.data_emissao DESC, nf.odoo_id ASC
       LIMIT $${pLimit} OFFSET $${pOffset}`,
    ...params,
  );

  const totRows = await prisma.$queryRawUnsafe<Array<{ total: bigint; qtotal: string; vtotal: string }>>(
    `SELECT COUNT(DISTINCT nf.odoo_id)::bigint AS total,
            COALESCE(SUM(nfi.quantidade), 0)::text AS qtotal,
            COALESCE(SUM(nfi.vr_produtos), 0)::text AS vtotal
       FROM fato_nota_fiscal nf
       JOIN fato_nota_fiscal_item nfi ON nfi.documento_id = nf.odoo_id
       JOIN fato_produto p ON p.odoo_id = nfi.produto_id
       WHERE nf.entrada_saida = '1'
         AND (LOWER(p.nome) ILIKE LOWER($1) OR p.odoo_id::text = $1)
         ${filtroPer}`,
    ...baseParams,
  );
  const t = totRows[0];

  return {
    linhas: rows.map((r) => ({
      numero: r.numero,
      dataEmissao: r.data_emissao ? r.data_emissao.toISOString() : null,
      participanteNome: r.participante_nome,
      quantidade: Number(r.quantidade),
      valorProdutos: Number(r.valor),
    })),
    totalNotas: Number(t?.total ?? 0),
    quantidadeTotal: Number(t?.qtotal ?? 0),
    valorTotal: Number(t?.vtotal ?? 0),
    linhasExibidas: rows.length,
    ordenadoPor: "data desc",
    periodoCoberto: per.label,
  };
}

export const fiscalNotasEmitidasPorProduto: ToolEntry<Input, Output> = {
  id: "fiscal_notas_emitidas_por_produto",
  dominio: "fiscal",
  descricao:
    "Notas fiscais de saida que contem um produto especifico (filtro via " +
    "produtoTermo, busca por nome ou codigo). Agrega quantidade e valor por " +
    "nota. Use para 'quantas notas sairam do produto X esse mes'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal", "fato_nota_fiscal_item", "fato_produto"],
      () => query(ctx.prisma, input, per),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.totalNotas, offset, limit, d.linhasExibidas);
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          (d.totalNotas === 0
            ? `Nao ha notas emitidas com o produto '${input.produtoTermo}' no periodo ${per.label}.`
            : `${d.totalNotas} notas com '${input.produtoTermo}' no periodo ${per.label}, ${d.quantidadeTotal} unidades, ${fmt(d.valorTotal)}. Listando ${d.linhasExibidas}.`) +
          (per.aviso ? ` ${per.aviso}` : ""),
        _DESTAQUE: {
          produtoTermo: input.produtoTermo,
          totalNotas: d.totalNotas,
          quantidadeTotal: d.quantidadeTotal,
          valorTotal: d.valorTotal,
          linhasExibidas: d.linhasExibidas,
          periodoCoberto: per.label,
        },
        _agregado: { contagem: d.totalNotas, soma: d.valorTotal },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
