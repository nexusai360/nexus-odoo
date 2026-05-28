// mcp/tools/cadastros/filiais-listar.ts
// Tool MCP: cadastro_filiais_listar
// Lista empresas do grupo Matrix Fitness Group (matriz/filial).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  tipo: z.enum(["matriz", "filial", "todas"]).optional().describe("Default: todas"),
  uf: z.string().min(2).max(2).optional().describe("Sigla 2 letras (SP, DF, etc)"),
  limite: z.number().int().min(1).max(50).optional(),
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  nome: z.string(),
  cnpj: z.string().nullable(),
  tipo: z.string(),
  uf: z.string().nullable(),
  ativo: z.boolean(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalEncontrados: z.number().int(),
  totalMatrizes: z.number().int(),
  totalFiliais: z.number().int(),
  linhasExibidas: z.number().int(),
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

async function query(prisma: PrismaClient, input: Input) {
  const limite = input.limite ?? 30;
  const where: Record<string, unknown> = { ativo: true };
  const tipo = input.tipo ?? "todas";
  if (tipo === "matriz") where.tipo = "matriz";
  if (tipo === "filial") where.tipo = "filial";
  if (input.uf) where.uf = input.uf.toUpperCase();

  const [linhas, total, matrizes, filiais] = await Promise.all([
    prisma.dimEmpresaGrupo.findMany({
      where,
      orderBy: [{ tipo: "asc" }, { uf: "asc" }, { nome: "asc" }],
      take: limite,
    }),
    prisma.dimEmpresaGrupo.count({ where }),
    prisma.dimEmpresaGrupo.count({ where: { ...where, tipo: "matriz" } }),
    prisma.dimEmpresaGrupo.count({ where: { ...where, tipo: "filial" } }),
  ]);

  return {
    linhas,
    totalEncontrados: total,
    totalMatrizes: matrizes,
    totalFiliais: filiais,
    linhasExibidas: linhas.length,
  };
}

export const cadastroFiliaisListar: ToolEntry<Input, Output> = {
  id: "cadastro_filiais_listar",
  dominio: "cadastros",
  descricao:
    "Lista empresas do grupo Matrix Fitness Group: matrizes e filiais com " +
    "CNPJ, tipo e UF. Use para 'quantas filiais temos', 'quais empresas do " +
    "grupo', 'filiais em SP', 'tem matriz no DF?'. Filtra por tipo (matriz/" +
    "filial/todas) e UF.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    // dim_empresa_grupo nao e tabela de fato sincronizada — bypass freshness.
    const d = await query(ctx.prisma, input);
    const now = new Date();
    const envelope = {
      estado: (d.totalEncontrados === 0 ? "vazio" : "ok") as "ok" | "vazio",
      dados: d,
      atualizadoEm: now.toISOString(),
      atualizadoHa: "agora",
      fonteStatus: { status: "estatico", ultimaSyncEm: null },
    };
    const ufLabel = input.uf ? ` em ${input.uf.toUpperCase()}` : "";
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: d.totalEncontrados === 0
          ? `Nao ha empresas do grupo${ufLabel}.`
          : `${d.totalMatrizes} matriz(es) + ${d.totalFiliais} filial(is) = ${d.totalEncontrados} empresas do grupo${ufLabel}. Listando ${d.linhasExibidas}.`,
        _DESTAQUE: {
          totalEncontrados: d.totalEncontrados,
          totalMatrizes: d.totalMatrizes,
          totalFiliais: d.totalFiliais,
          linhasExibidas: d.linhasExibidas,
        },
        _agregado: { contagem: d.totalEncontrados },
      },
    };
  },
};
