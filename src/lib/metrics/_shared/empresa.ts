import type { PrismaClient } from "../../../generated/prisma/client";
import type { EmpresaResolucao, EmpresaCandidata } from "./types";

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
 * Resolve uma referencia textual (id, CNPJ ou nome) para uma empresa do grupo.
 * Estrategia: id (ate 9 digitos, faixa de Int32 do odooId) > CNPJ (exatamente 14 digitos,
 * comparado so por digitos, imune a mascara) > nome (contains insensitive).
 * Refs de 10-13 digitos e >14 caem no ramo de nome (so resolvem se o nome for textual).
 * Nunca devolve empresa falsa: ambiguo retorna candidatas (top 3); sem match retorna nenhuma.
 */
export async function resolverEmpresa(prisma: PrismaClient, ref: string): Promise<EmpresaResolucao> {
  const r = ref.trim();
  const proj = (c: { odooId: number; nome: string; cnpj: string | null; tipo: string }): EmpresaCandidata => ({
    odooId: c.odooId,
    nome: c.nome,
    cnpj: c.cnpj,
    tipo: c.tipo,
  });

  // Ramo id (ate 9 digitos, dentro do Int32 do odooId)
  if (/^\d{1,9}$/.test(r)) {
    const found = await prisma.dimEmpresaGrupo.findUnique({ where: { odooId: Number(r) } });
    if (found) return { status: "unica", empresa: proj(found) };
    // nao achou por id: cai para o ramo de nome abaixo
  } else if (/^\d{14}$/.test(r)) {
    // Ramo CNPJ: compara so digitos (imune a mascara)
    const todas = await prisma.dimEmpresaGrupo.findMany();
    const match = todas.filter((c) => (c.cnpj ?? "").replace(/\D/g, "") === r);
    if (match.length === 1) return { status: "unica", empresa: proj(match[0]) };
    if (match.length > 1) return { status: "ambigua", candidatas: match.slice(0, 3).map(proj) };
    return { status: "nenhuma" };
  }

  // Ramo nome (contains insensitive)
  const porNome = await prisma.dimEmpresaGrupo.findMany({
    where: { nome: { contains: r, mode: "insensitive" } },
  });
  if (porNome.length === 1) return { status: "unica", empresa: proj(porNome[0]) };
  if (porNome.length > 1) return { status: "ambigua", candidatas: porNome.slice(0, 3).map(proj) };
  return { status: "nenhuma" };
}
