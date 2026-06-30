"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DIRETORIA_CAPABILITIES } from "@/lib/diretoria/capabilities";

/** Quem pode configurar o acesso à Diretoria de um usuário: super_admin e admin. */
function podeGerenciarAcesso(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

const SIGLAS_UF = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

/**
 * Define o acesso granular à Diretoria de um usuário: capabilities + UFs.
 * Estratégia set-completo (grant-only): substitui o conjunto inteiro numa
 * transação. super_admin não precisa de linhas (vê tudo por bypass), mas a
 * action aceita configurar admin/manager/viewer. Gated por super_admin/admin.
 */
export async function updateUserDiretoriaAccess(
  userId: string,
  capabilities: string[],
  ufs: string[],
): Promise<{ ok: boolean; erro?: string }> {
  const atual = await getCurrentUser();
  if (!atual) return { ok: false, erro: "Não autenticado" };
  if (!podeGerenciarAcesso(atual.platformRole)) {
    return { ok: false, erro: "Sem permissão para configurar acesso" };
  }

  // Sanitiza: só capabilities do catálogo e siglas de UF válidas, sem duplicar.
  const capsValidas = [...new Set(capabilities)].filter((c) =>
    (DIRETORIA_CAPABILITIES as readonly string[]).includes(c),
  );
  const ufsValidas = [...new Set(ufs.map((u) => u.toUpperCase()))].filter((u) =>
    SIGLAS_UF.has(u),
  );

  await prisma.$transaction([
    prisma.userDiretoriaAccess.deleteMany({ where: { userId } }),
    prisma.userDiretoriaAccess.createMany({
      data: capsValidas.map((capability) => ({
        userId,
        capability,
        grantedById: atual.id,
      })),
    }),
    prisma.userDiretoriaUf.deleteMany({ where: { userId } }),
    prisma.userDiretoriaUf.createMany({
      data: ufsValidas.map((uf) => ({ userId, uf })),
    }),
  ]);

  revalidatePath("/usuarios");
  return { ok: true };
}

/** Lê o acesso atual à Diretoria de um usuário (para popular o formulário). */
export async function getUserDiretoriaAccess(
  userId: string,
): Promise<{ capabilities: string[]; ufs: string[] }> {
  const [caps, ufs] = await Promise.all([
    prisma.userDiretoriaAccess.findMany({
      where: { userId },
      select: { capability: true },
    }),
    prisma.userDiretoriaUf.findMany({
      where: { userId },
      select: { uf: true },
    }),
  ]);
  return {
    capabilities: caps.map((c) => c.capability),
    ufs: ufs.map((u) => u.uf),
  };
}
