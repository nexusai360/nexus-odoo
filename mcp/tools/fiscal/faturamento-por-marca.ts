// mcp/tools/fiscal/faturamento-por-marca.ts
// Tool MCP: fiscal_faturamento_por_marca
// Resolve lacuna real do audit R12+R13 ("faturamento por marca esse mes").
// Agrupa itens de notas de saida autorizadas por marca via JOIN entre
// fato_nota_fiscal_item (produto_id, vr_produtos) e fato_produto (marca_nome).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { buildEmpresaSqlFragment } from "@/lib/metrics/_shared/empresa.js";

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
  escopoEmpresa: z.record(z.string(), z.unknown()),
  // Contrato de lista (Fase B): a query ordena por valor de produtos desc
  // (NULLS LAST) com desempate por nome da marca.
  ordenadoPor: z.string().optional(),
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

interface Row { marca: string | null; quantidade: bigint; valor: string | number; }

async function queryFaturamentoPorMarca(prisma: PrismaClient, input: Input, empresaId?: number) {
  const periodoDe = input.periodoDe ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const periodoAte = input.periodoAte ?? new Date().toISOString().slice(0, 10);
  const limite = input.limite ?? 20;
  // Empresa entra como $4 (apos periodoDe $1, periodoAte $2, limite $3); alias do item = fnfi
  // (empresa_id desnormalizado no item pelo Bloco A).
  const emp = buildEmpresaSqlFragment(empresaId, "fnfi", 4);

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT fp.marca_nome AS marca,
            COUNT(*)::bigint AS quantidade,
            COALESCE(SUM(fnfi.vr_produtos), 0)::text AS valor
     FROM fato_nota_fiscal_item fnfi
     JOIN fato_produto fp ON fp.odoo_id = fnfi.produto_id
     WHERE fnfi.entrada_saida = '1'
       AND fnfi.data_emissao >= $1::timestamp
       AND fnfi.data_emissao <= $2::timestamp
       ${emp.sql}
     GROUP BY fp.marca_nome
     ORDER BY SUM(fnfi.vr_produtos) DESC NULLS LAST, fp.marca_nome ASC
     LIMIT $3`,
    new Date(`${periodoDe}T00:00:00`),
    new Date(`${periodoAte}T23:59:59`),
    limite,
    ...emp.params,
  );

  const linhas = rows.map((r) => ({
    marca: r.marca,
    quantidadeItens: Number(r.quantidade),
    valorTotal: Number(r.valor),
  }));

  // KPIs FULL-SET: agregados sobre TODO o recorte (sem LIMIT). A soma de
  // `linhas` cobriria so a pagina e subnotificaria quando ha mais marcas que o
  // limite (classe d987060). COUNT(DISTINCT marca_nome) conta marcas reais.
  const empTot = buildEmpresaSqlFragment(empresaId, "fnfi", 3);
  const totalRows = await prisma.$queryRawUnsafe<
    Array<{ geral: string | number; itens: bigint; marcas: bigint }>
  >(
    `SELECT COALESCE(SUM(fnfi.vr_produtos), 0)::text AS geral,
            COUNT(*)::bigint AS itens,
            COUNT(DISTINCT fp.marca_nome)::bigint AS marcas
     FROM fato_nota_fiscal_item fnfi
     JOIN fato_produto fp ON fp.odoo_id = fnfi.produto_id
     WHERE fnfi.entrada_saida = '1'
       AND fnfi.data_emissao >= $1::timestamp
       AND fnfi.data_emissao <= $2::timestamp
       ${empTot.sql}`,
    new Date(`${periodoDe}T00:00:00`),
    new Date(`${periodoAte}T23:59:59`),
    ...empTot.params,
  );
  const totalGeral = Number(totalRows[0]?.geral ?? 0);
  const totalItens = Number(totalRows[0]?.itens ?? 0);
  const totalMarcas = Number(totalRows[0]?.marcas ?? 0);

  return {
    linhas,
    totalGeral,
    totalItens,
    totalMarcas,
  };
}

export const fiscalFaturamentoPorMarca: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_marca",
  dominio: "fiscal",
  descricao:
    "Faturamento agrupado por MARCA do produto (notas de saida autorizadas). " +
    "Retorna top N marcas com quantidade de itens e valor total + totalGeral. " +
    "Use para 'faturamento por marca', 'qual marca vende mais', 'top marcas'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal_item", "fato_produto"], () =>
      queryFaturamentoPorMarca(ctx.prisma, input, escopo.empresaId),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const top = d.linhas[0];
    return {
      ...envelope,
      dados: {
        ...d,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        ordenadoPor: "valor desc",
        _RESPOSTA: top
          ? `Faturamento por marca: total ${fmt(d.totalGeral)} em ${d.totalMarcas} marcas. Top: ${top.marca ?? "(sem marca)"} ${fmt(top.valorTotal)}.`
          : "Nao ha faturamento por marca no periodo.",
        _DESTAQUE: {
          totalGeral: d.totalGeral,
          totalMarcas: d.totalMarcas,
          totalItens: d.totalItens,
          topMarca: top?.marca ?? "",
          valorTopMarca: top?.valorTotal ?? 0,
        },
        _agregado: { contagem: d.totalMarcas, soma: d.totalGeral },
      },
    };
  },
};
