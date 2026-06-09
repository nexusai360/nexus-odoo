import type { PrismaClient } from "../../../generated/prisma/client";
import type { EmpresaResolucao, EmpresaCandidata } from "./types";

/**
 * Empresa derivada do FATO (fonte autoritativa). O `empresaId` aqui e o mesmo
 * gravado em fato_nota_fiscal.empresa_id, entao filtra direto, sem o id-space
 * deslocado da dim_empresa_grupo (RADAR R10).
 */
export interface EmpresaFato {
  empresaId: number;
  nome: string; // nome base, ex.: "Jht DF Comercio"
  nomeCompleto: string; // nome cru da nota, ex.: "Jht DF Comercio - Matriz DF 10.557.556/0001-37"
  cnpj: string | null; // CNPJ com mascara, como vem na nota
  tipo: string; // "matriz" | "filial" | "desconhecido"
  uf: string | null;
}

/** Remove acentos e baixa caixa, para comparacao insensivel a acento e maiuscula. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Faz o parse do empresaNome desnormalizado da nota no padrao
 * "{Nome} - {Matriz|Filial} {UF} {CNPJ}". Quando nao casa, devolve o nome cru
 * como base e tipo "desconhecido" (nunca inventa campo).
 */
export function parseEmpresaNome(empresaId: number, empresaNome: string | null): EmpresaFato {
  const full = (empresaNome ?? "").trim();
  const m = full.match(/^(.*?)\s*-\s*(Matriz|Filial)\s+([A-Za-z]{2})\s+([\d./-]+)\s*$/i);
  if (m) {
    return {
      empresaId,
      nome: m[1].trim(),
      nomeCompleto: full,
      tipo: m[2].toLowerCase() === "matriz" ? "matriz" : "filial",
      uf: m[3].toUpperCase(),
      cnpj: m[4].trim() || null,
    };
  }
  return { empresaId, nome: full, nomeCompleto: full, tipo: "desconhecido", uf: null, cnpj: null };
}

/**
 * Lista as empresas distintas do FATO (uma por empresaId), ja parseadas.
 * Fonte unica de verdade para resolucao e listagem de empresas, no lugar da
 * dim_empresa_grupo (cujo odooId nao casa com fato.empresaId , RADAR R10).
 */
export async function listarEmpresasDoFato(prisma: PrismaClient): Promise<EmpresaFato[]> {
  const rows = await prisma.fatoNotaFiscal.findMany({
    where: { empresaId: { not: null } },
    select: { empresaId: true, empresaNome: true },
    distinct: ["empresaId", "empresaNome"],
    orderBy: [{ empresaId: "asc" }],
  });
  // Uma entrada por empresaId, preferindo a primeira com nome nao vazio.
  const porId = new Map<number, EmpresaFato>();
  for (const r of rows) {
    const id = r.empresaId;
    if (id == null) continue;
    const parsed = parseEmpresaNome(id, r.empresaNome);
    const atual = porId.get(id);
    if (!atual || (atual.nomeCompleto === "" && parsed.nomeCompleto !== "")) {
      porId.set(id, parsed);
    }
  }
  return [...porId.values()].sort((a, b) => a.empresaId - b.empresaId);
}

/**
 * Filtro de empresa em shape plano: {} quando ausente, { empresaId } quando presente.
 * Reusavel no where de fato_nota_fiscal e de fato_nota_fiscal_item (empresaId
 * desnormalizado no item pelo Bloco A).
 */
export function buildEmpresaWhere(empresaId?: number): { empresaId?: number } {
  return empresaId === undefined ? {} : { empresaId };
}

/**
 * Fragmento SQL de empresa para queries em $queryRawUnsafe (alias e indice de parametro
 * parametrizados, porque queries diferentes usam alias e posicao diferentes).
 */
export function buildEmpresaSqlFragment(
  empresaId: number | undefined,
  alias: string,
  paramIndex: number,
): { sql: string; params: number[] } {
  if (empresaId === undefined) return { sql: "", params: [] };
  return { sql: `AND ${alias}.empresa_id = $${paramIndex}`, params: [empresaId] };
}

/**
 * Resolve uma referencia textual (id, CNPJ ou nome) para uma empresa do grupo,
 * derivando do FATO (fato_nota_fiscal), nao da dim_empresa_grupo.
 *
 * O `odooId` devolvido em EmpresaCandidata e, na verdade, o `empresaId` do fato
 * (mesmo id-space das notas), entao os consumidores (escopo.ts, entities) filtram
 * fato.empresaId direto e acertam a empresa. A dim ficou para tras porque seu
 * odooId estava deslocado do empresaId das notas (RADAR R10).
 *
 * Estrategia: id (ate 9 digitos = empresaId) > CNPJ (exatamente 14 digitos,
 * comparado so por digitos, imune a mascara) > nome (contains, insensivel a
 * acento e maiuscula, casado contra o nome completo da nota).
 * Nunca devolve empresa falsa: ambiguo retorna candidatas (top 3); sem match retorna nenhuma.
 */
export async function resolverEmpresa(prisma: PrismaClient, ref: string): Promise<EmpresaResolucao> {
  const r = ref.trim();
  const empresas = await listarEmpresasDoFato(prisma);
  const proj = (e: EmpresaFato): EmpresaCandidata => ({
    odooId: e.empresaId,
    nome: e.nomeCompleto || e.nome,
    cnpj: e.cnpj,
    tipo: e.tipo,
  });

  // Ramo id (ate 9 digitos = empresaId da nota)
  if (/^\d{1,9}$/.test(r)) {
    const found = empresas.find((e) => e.empresaId === Number(r));
    if (found) return { status: "unica", empresa: proj(found) };
    // nao achou por id: cai para o ramo de nome abaixo
  } else if (/^\d{14}$/.test(r)) {
    // Ramo CNPJ: compara so digitos (imune a mascara)
    const match = empresas.filter((e) => (e.cnpj ?? "").replace(/\D/g, "") === r);
    if (match.length === 1) return { status: "unica", empresa: proj(match[0]) };
    if (match.length > 1) return { status: "ambigua", candidatas: match.slice(0, 3).map(proj) };
    return { status: "nenhuma" };
  }

  // Ramo nome (contains, insensivel a acento e maiuscula)
  const needle = normalizar(r);
  const porNome = empresas.filter((e) => normalizar(e.nomeCompleto).includes(needle));
  if (porNome.length === 1) return { status: "unica", empresa: proj(porNome[0]) };
  if (porNome.length > 1) return { status: "ambigua", candidatas: porNome.slice(0, 3).map(proj) };
  return { status: "nenhuma" };
}
