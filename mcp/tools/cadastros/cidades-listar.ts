// mcp/tools/cadastros/cidades-listar.ts
// Tool MCP: cadastro_cidades_listar
//
// Mapeia DINAMICAMENTE todas as cidades x UFs presentes em fato_parceiro
// com a quantidade de parceiros de cada uma. Resolve "quais cidades temos?",
// "lista de cidades de SP", "tem parceiro em Campinas?".
//
// Estrategia: SQL agrupa por (uf, cidade) e ordena por count. Tudo via
// codigo, zero alucinacao do LLM.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  uf: z.string().min(2).max(40).optional()
    .describe("Filtra cidades de UF (sigla SP / nome 'Sao Paulo'). Default: todas."),
  limite: z.number().int().min(1).max(500).optional().describe("Default: 50"),
});

const linhaSchema = z.object({
  uf: z.string().nullable(),
  cidade: z.string(),
  quantidadeParceiros: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalCidadesDistintas: z.number().int(),
  totalUfs: z.number().int(),
  totalParceiros: z.number().int(),
  // Contrato de lista (Fase B): cidades ordenadas por quantidade de parceiros desc.
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

interface Row { uf: string | null; cidade: string; n: bigint }

// Mapeamento sigla -> nome completo (mesmo de parceiros-por-cidade).
const SIGLA_PARA_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
  BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

function resolverFiltroUf(input: string | undefined): string | null {
  if (!input) return null;
  if (input.length === 2 && SIGLA_PARA_NOME[input.toUpperCase()]) {
    return SIGLA_PARA_NOME[input.toUpperCase()];
  }
  return input;
}

async function queryCidadesListar(prisma: PrismaClient, input: Input) {
  const limite = input.limite ?? 50;
  const filtroUf = resolverFiltroUf(input.uf);
  const where = filtroUf
    ? `WHERE ativo = true AND cidade IS NOT NULL AND uf ILIKE '%' || $1 || '%'`
    : `WHERE ativo = true AND cidade IS NOT NULL`;
  const params: unknown[] = filtroUf ? [filtroUf] : [];

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT uf, cidade, COUNT(*)::bigint AS n
     FROM fato_parceiro ${where}
     GROUP BY uf, cidade
     ORDER BY COUNT(*) DESC, cidade ASC
     LIMIT ${limite}`,
    ...params,
  );

  const linhas = rows.map((r) => ({
    uf: r.uf,
    cidade: r.cidade,
    quantidadeParceiros: Number(r.n),
  }));

  const totRows = await prisma.$queryRawUnsafe<Array<{ cidades: bigint; ufs: bigint; parceiros: bigint }>>(
    `SELECT COUNT(DISTINCT cidade)::bigint AS cidades,
            COUNT(DISTINCT uf)::bigint AS ufs,
            COUNT(*)::bigint AS parceiros
     FROM fato_parceiro ${where}`,
    ...params,
  );
  const t = totRows[0];

  return {
    linhas,
    totalCidadesDistintas: Number(t?.cidades ?? 0),
    totalUfs: Number(t?.ufs ?? 0),
    totalParceiros: Number(t?.parceiros ?? 0),
    // Contrato de lista (Fase B): SQL ordena por COUNT(*) DESC, cidade ASC.
    ordenadoPor: "quantidade de parceiros desc",
  };
}

export const cadastroCidadesListar: ToolEntry<Input, Output> = {
  id: "cadastro_cidades_listar",
  dominio: "cadastros",
  descricao:
    "Lista cidades distintas presentes no cadastro de parceiros, agrupadas " +
    "por UF + cidade com a quantidade de parceiros em cada uma. Use para " +
    "'quais cidades temos', 'cidades de SP', 'temos parceiros em Campinas?'. " +
    "Filtra por UF (sigla ou nome). Mapeamento dinamico: vem do banco, sem " +
    "lista hardcoded.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_parceiro"], () =>
      queryCidadesListar(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.linhas[0];
    const ufLabel = input.uf ? ` em ${input.uf}` : "";
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: top
          ? `${d.totalCidadesDistintas} cidades distintas${ufLabel} (${d.totalParceiros} parceiros). Top: ${top.cidade} (${top.uf ?? "(sem UF)"}) com ${top.quantidadeParceiros} parceiros. Listando ${d.linhas.length}.`
          : `Nao ha cidades cadastradas${ufLabel}.`,
        _DESTAQUE: {
          totalCidadesDistintas: d.totalCidadesDistintas,
          totalUfs: d.totalUfs,
          totalParceiros: d.totalParceiros,
          topCidade: top?.cidade ?? "",
          topUf: top?.uf ?? "",
          quantidadeTopCidade: top?.quantidadeParceiros ?? 0,
        },
        _agregado: { contagem: d.totalCidadesDistintas },
      },
    };
  },
};
