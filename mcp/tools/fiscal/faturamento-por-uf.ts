// mcp/tools/fiscal/faturamento-por-uf.ts
// Tool MCP: fiscal_faturamento_por_uf
//
// Resolve "Faturamento por estado / por UF / por região" — agrupando notas
// de saída autorizadas pela UF do cliente (fato_parceiro.uf).
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
  uf: z.string().nullable(),
  quantidadeNotas: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalGeral: z.number(),
  totalNotas: z.number().int(),
  totalUfs: z.number().int(),
  notasSemUf: z.number().int(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
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
  uf: string | null;
  quantidade: bigint;
  valor: string | number;
}

async function queryFaturamentoPorUf(prisma: PrismaClient, input: Input, empresaId?: number) {
  const limite = input.limite ?? 20;
  const periodoDe = input.periodoDe ??
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const periodoAte = input.periodoAte ?? new Date().toISOString().slice(0, 10);
  // Empresa entra como $3 (periodoDe $1, periodoAte $2; LIMIT e interpolado, nao consome $N);
  // alias da nota = nf.
  const emp = buildEmpresaSqlFragment(empresaId, "nf", 3);

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COALESCE(p.uf, '(sem UF)') AS uf,
            COUNT(*)::bigint AS quantidade,
            COALESCE(SUM(nf.vr_nf), 0)::text AS valor
     FROM fato_nota_fiscal nf
     LEFT JOIN fato_parceiro p ON p.odoo_id = nf.participante_id
     WHERE nf.entrada_saida = '1'
       AND nf.situacao_nfe = 'autorizada'
       AND nf.data_emissao >= $1::timestamp
       AND nf.data_emissao <= $2::timestamp
       ${emp.sql}
     GROUP BY p.uf
     ORDER BY SUM(nf.vr_nf) DESC NULLS LAST
     LIMIT ${limite}`,
    `${periodoDe}T00:00:00`,
    `${periodoAte}T23:59:59`,
    ...emp.params,
  );

  const linhas = rows.map((r) => ({
    uf: r.uf === "(sem UF)" ? null : r.uf,
    quantidadeNotas: Number(r.quantidade),
    valorTotal: Number(r.valor),
  }));
  const totalGeral = linhas.reduce((s, l) => s + l.valorTotal, 0);
  const totalNotas = linhas.reduce((s, l) => s + l.quantidadeNotas, 0);
  const notasSemUf = linhas.filter((l) => l.uf === null).reduce((s, l) => s + l.quantidadeNotas, 0);
  const totalUfs = linhas.filter((l) => l.uf !== null).length;
  return { linhas, totalGeral, totalNotas, totalUfs, notasSemUf };
}

export const fiscalFaturamentoPorUf: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_uf",
  dominio: "fiscal",
  descricao:
    "Faturamento agrupado por estado (UF do cliente da nota), ordenado por valor " +
    "descendente. Use para 'faturamento por estado / por UF / por regiao' (regiao " +
    "= conjunto de UFs). Agrega notas de saida autorizadas no periodo (default mes corrente).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal", "fato_parceiro"],
      () => queryFaturamentoPorUf(ctx.prisma, input, escopo.empresaId),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // T-40: top REAL = primeira linha com uf preenchida (pula "(sem UF)")
    const topReal = d.linhas.find((l) => l.uf !== null) ?? d.linhas[0];
    const fmt = (n: number) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        _RESPOSTA: topReal
          ? `Faturamento por UF: ${fmt(d.totalGeral)} em ${d.totalNotas} notas, ${d.totalUfs} UFs com UF identificada${d.notasSemUf > 0 ? ` + ${d.notasSemUf} notas sem UF` : ""}. Top: ${topReal.uf ?? "(sem UF)"} ${fmt(topReal.valorTotal)}.`
          : "Nao ha faturamento no periodo.",
        _DESTAQUE: {
          totalGeral: d.totalGeral,
          totalNotas: d.totalNotas,
          totalUfs: d.totalUfs,
          notasSemUf: d.notasSemUf,
          topUf: topReal?.uf ?? "",
          valorTopUf: topReal?.valorTotal ?? 0,
        },
        _agregado: { contagem: d.totalNotas, soma: d.totalGeral },
      },
    };
  },
};
