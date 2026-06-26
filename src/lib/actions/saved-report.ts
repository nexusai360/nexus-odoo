"use server";

// src/lib/actions/saved-report.ts
// F6 (P3) , Server actions para gerenciar um relatorio salvo: renomear, definir
// visibilidade de consumo e obter o detalhe (com dados do criador) + a lista de
// usuarios para o seletor de compartilhamento. Gate admin/super_admin + dono.
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  renomear,
  definirVisibilidade,
  obterDetalheGerenciavel,
} from "@/lib/reports/builder/saved-report-repo";
import type { UsuarioCompartilhavel } from "@/lib/reports/builder/compartilhamento";
import type { PlatformRole } from "@/generated/prisma/client";

async function gate(): Promise<
  { ok: true; userId: string; role: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Nao autenticado" };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado" };
  }
  return { ok: true, userId: me.id, role: me.platformRole };
}

export interface DetalheRelatorio {
  id: string;
  titulo: string;
  compartilhado: boolean;
  visibilidadeConsumo: string[];
  atualizadoEm: string;
  criadoPor: string;
  criador: {
    name: string;
    email: string;
    avatarUrl: string | null;
    platformRole: PlatformRole;
  } | null;
}

export async function obterDetalheRelatorio(
  id: string,
): Promise<{ ok: true; detalhe: DetalheRelatorio } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  const r = await obterDetalheGerenciavel(id, { userId: g.userId, role: g.role });
  if (!r) return { ok: false, error: "Relatorio nao encontrado" };
  const criador = await prisma.user
    .findUnique({
      where: { id: r.criadoPor },
      select: { name: true, email: true, avatarUrl: true, platformRole: true },
    })
    .catch(() => null);
  return {
    ok: true,
    detalhe: {
      id: r.id,
      titulo: r.titulo,
      compartilhado: r.status === "publicado",
      visibilidadeConsumo: r.visibilidadeConsumo ?? [],
      atualizadoEm: r.atualizadoEm.toISOString(),
      criadoPor: r.criadoPor,
      criador,
    },
  };
}

export async function renomearRelatorio(
  id: string,
  titulo: string,
): Promise<{ ok: true; titulo: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  if (!titulo.trim()) return { ok: false, error: "Informe um nome para o relatorio." };
  try {
    const r = await renomear(id, { userId: g.userId, role: g.role }, titulo);
    if (!r) return { ok: false, error: "Relatorio nao encontrado ou sem permissao." };
    revalidatePath("/relatorios-2/meus");
    revalidatePath(`/relatorios-2/d/${id}`);
    return { ok: true, titulo: r.titulo };
  } catch {
    return { ok: false, error: "Nao foi possivel renomear agora." };
  }
}

export async function definirVisibilidadeRelatorio(
  id: string,
  opcoes: { compartilhar: boolean; userIds: string[] },
): Promise<{ ok: true; compartilhado: boolean; total: number } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  const r = await definirVisibilidade(id, { userId: g.userId, role: g.role }, opcoes);
  if (!r) return { ok: false, error: "Relatorio nao encontrado ou sem permissao." };
  revalidatePath("/relatorios-2/meus");
  return {
    ok: true,
    compartilhado: r.status === "publicado",
    total: r.visibilidadeConsumo.length,
  };
}

/** Lista usuarios ativos para o seletor de compartilhamento (gated admin+). */
export async function listarUsuariosParaCompartilhar(): Promise<
  { ok: true; usuarios: UsuarioCompartilhavel[] } | { ok: false; error: string }
> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  const rows = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, avatarUrl: true, platformRole: true },
  });
  return { ok: true, usuarios: rows };
}
