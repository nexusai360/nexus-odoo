// mcp/tools/cadastros/filiais-listar.ts
// Tool MCP: cadastro_filiais_listar
// Lista empresas do grupo Matrix Fitness Group (matriz/filial).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { listarEmpresasDoFato } from "@/lib/metrics/_shared/empresa.js";

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
  // Contrato de lista (Fase B): empresas ordenadas por tipo, depois UF, depois nome.
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

async function query(prisma: PrismaClient, input: Input) {
  // Fonte: o FATO (fato_nota_fiscal), nao a dim_empresa_grupo, cujo odooId esta
  // deslocado do empresaId das notas (RADAR R10). Aqui odooId = empresaId do fato.
  const limite = input.limite ?? 30;
  const tipo = input.tipo ?? "todas";
  const ufFiltro = input.uf ? input.uf.toUpperCase() : undefined;

  const todas = await listarEmpresasDoFato(prisma);
  const filtradas = todas.filter((e) => {
    if (tipo === "matriz" && e.tipo !== "matriz") return false;
    if (tipo === "filial" && e.tipo !== "filial") return false;
    if (ufFiltro && e.uf !== ufFiltro) return false;
    return true;
  });

  const ordenadas = [...filtradas].sort(
    (a, b) =>
      a.tipo.localeCompare(b.tipo) ||
      (a.uf ?? "").localeCompare(b.uf ?? "") ||
      a.nome.localeCompare(b.nome),
  );

  const linhas = ordenadas.slice(0, limite).map((e) => ({
    odooId: e.empresaId,
    nome: e.nome,
    cnpj: e.cnpj,
    tipo: e.tipo,
    uf: e.uf,
    ativo: true,
  }));

  return {
    linhas,
    totalEncontrados: filtradas.length,
    totalMatrizes: filtradas.filter((e) => e.tipo === "matriz").length,
    totalFiliais: filtradas.filter((e) => e.tipo === "filial").length,
    linhasExibidas: linhas.length,
    // Contrato de lista (Fase B): sort por tipo, UF, nome (asc, estavel).
    ordenadoPor: "tipo, UF, nome (asc)",
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
    // Empresas derivadas do FATO (notas), sem freshness gate proprio: a lista
    // reflete os empresaId que aparecem em fato_nota_fiscal.
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
          : `${d.totalMatrizes} matriz(es) + ${d.totalFiliais} filial(is) = ${d.totalEncontrados} empresas do grupo${ufLabel}. Listando ${d.linhasExibidas}. ` +
            `COBERTURA: lista derivada das notas fiscais emitidas no cache; matriz/filial que nunca emitiu nota NAO aparece aqui (pode existir no Odoo).`,
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
