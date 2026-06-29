import { redirect } from "next/navigation";

import type { PlatformRole } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

import {
  defaultCapabilitiesFor,
  DIRETORIA_AREAS,
  type DiretoriaArea,
} from "./capabilities";

/**
 * Bypass do RBAC da Diretoria. Diferente de `seesAll` dos relatórios (que inclui
 * admin): aqui SÓ o super_admin vê tudo sem configuração. admin é configurável.
 */
export function seesAllDiretoria(role: PlatformRole): boolean {
  return role === "super_admin";
}

/**
 * Capabilities efetivas do usuário: default por papel ∪ grants explícitos.
 * super_admin recebe todas sem tocar o banco.
 */
export async function userCapabilities(user: AuthUser): Promise<Set<string>> {
  const base = new Set(defaultCapabilitiesFor(user.platformRole));
  if (seesAllDiretoria(user.platformRole)) return base;

  const grants = await prisma.userDiretoriaAccess.findMany({
    where: { userId: user.id },
    select: { capability: true },
  });
  for (const g of grants) base.add(g.capability);
  return base;
}

/**
 * UFs às quais o usuário está limitado. Lista vazia = enxerga todas as UFs.
 * super_admin nunca é limitado.
 */
export async function userUfs(user: AuthUser): Promise<string[]> {
  if (seesAllDiretoria(user.platformRole)) return [];
  const rows = await prisma.userDiretoriaUf.findMany({
    where: { userId: user.id },
    select: { uf: true },
  });
  return rows.map((r) => r.uf);
}

export async function canDiretoria(
  user: AuthUser,
  capability: string,
): Promise<boolean> {
  return (await userCapabilities(user)).has(capability);
}

const AREA_HREF: Record<DiretoriaArea, string> = {
  visao_geral: "/diretoria/visao-geral",
  vendas: "/diretoria/vendas",
  pedidos: "/diretoria/pedidos",
  estoque: "/diretoria/estoque",
  agenda: "/diretoria/agenda",
};

const AREA_LABEL: Record<DiretoriaArea, string> = {
  visao_geral: "Visão geral",
  vendas: "Vendas",
  pedidos: "Pedidos & Entregas",
  estoque: "Estoque & Compras",
  agenda: "Agenda",
};

/** Itens de submenu da Diretoria visíveis ao usuário (filtrados por capability). */
export async function diretoriaNavFor(
  user: AuthUser,
): Promise<{ label: string; href: string }[]> {
  const caps = await userCapabilities(user);
  const itens = DIRETORIA_AREAS.filter((a) => caps.has(`diretoria.${a}.view`)).map(
    (a) => ({ label: AREA_LABEL[a], href: AREA_HREF[a] }),
  );
  // Construtor modular (montável): aparece para quem vê Estoque & Compras, logo
  // após a tela BI clássica. É a versão por componentes arrastáveis da mesma área.
  if (caps.has("diretoria.estoque.view")) {
    itens.push({ label: "Estoque montável", href: "/diretoria/relatorios" });
  }
  return itens;
}

/**
 * Guard de página: exige que o usuário tenha acesso à área. Sem acesso,
 * redireciona para a 1ª área permitida (ou /dashboard se nenhuma).
 */
export async function requireDiretoriaArea(
  area: DiretoriaArea,
): Promise<AuthUser> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const caps = await userCapabilities(user);
  if (caps.has(`diretoria.${area}.view`)) return user;

  const nav = await diretoriaNavFor(user);
  redirect(nav[0]?.href ?? "/dashboard");
}
