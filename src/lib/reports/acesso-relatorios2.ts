// src/lib/reports/acesso-relatorios2.ts
// Acesso ao menu Relatorios 2.0 (menu + submenus). Niveis salvos no AgentSettings
// (ChannelAccessLevel). Regra: nivel = minimo de perfil (heranca); "off" = oculto
// para todos EXCETO o super_admin dono. Fonte de verdade para nav + rotas + UI.
import { prisma } from "@/lib/prisma";
import type { ChannelAccessLevel, PlatformRole } from "@/generated/prisma/client";
import type { Relatorios2SubmenuKey } from "@/lib/constants/relatorios2";

export interface AcessoRelatorios2 {
  menu: ChannelAccessLevel;
  paineis: ChannelAccessLevel;
  meus: ChannelAccessLevel;
  construtor: ChannelAccessLevel;
}

const RANK: Record<PlatformRole, number> = {
  viewer: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};

const LEVEL_RANK: Record<Exclude<ChannelAccessLevel, "off">, number> = {
  viewer: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};

export const ACESSO_DEFAULT: AcessoRelatorios2 = {
  menu: "admin",
  paineis: "admin",
  meus: "admin",
  construtor: "admin",
};

export async function obterAcessoRelatorios2(): Promise<AcessoRelatorios2> {
  const s = await prisma.agentSettings
    .findUnique({
      where: { id: "global" },
      select: {
        relatorios2MenuAccess: true,
        relatorios2PaineisAccess: true,
        relatorios2MeusAccess: true,
        relatorios2ConstrutorAccess: true,
      },
    })
    .catch(() => null);
  return {
    menu: s?.relatorios2MenuAccess ?? ACESSO_DEFAULT.menu,
    paineis: s?.relatorios2PaineisAccess ?? ACESSO_DEFAULT.paineis,
    meus: s?.relatorios2MeusAccess ?? ACESSO_DEFAULT.meus,
    construtor: s?.relatorios2ConstrutorAccess ?? ACESSO_DEFAULT.construtor,
  };
}

export interface UsuarioAcesso {
  platformRole: PlatformRole;
  isOwner: boolean;
}

/** Um usuario pode acessar um item com dado nivel? */
export function podeAcessar(level: ChannelAccessLevel, user: UsuarioAcesso): boolean {
  if (level === "off") return user.platformRole === "super_admin" && user.isOwner;
  return RANK[user.platformRole] >= LEVEL_RANK[level];
}

/** Acesso efetivo a um submenu: precisa do menu E do submenu liberados. */
export function podeAcessarSubmenu(
  acesso: AcessoRelatorios2,
  submenu: Relatorios2SubmenuKey,
  user: UsuarioAcesso,
): boolean {
  if (!podeAcessar(acesso.menu, user)) return false;
  const level =
    submenu === "paineis"
      ? acesso.paineis
      : submenu === "meus"
        ? acesso.meus
        : acesso.construtor;
  return podeAcessar(level, user);
}

/**
 * Trava de coerencia: o Construtor "puxa" Paineis e Meus para no minimo o mesmo
 * nivel (quem constroi precisa ver paineis/meus). Aplica sobre um patch e
 * devolve o acesso normalizado. "off" do construtor nao puxa (todos podem ficar
 * mais restritos que "ninguem"); so puxa quando construtor tem nivel real.
 */
/** Grava o acesso (aplicando as travas de coerencia) no singleton AgentSettings. */
export async function definirAcessoRelatorios2(
  acesso: AcessoRelatorios2,
): Promise<AcessoRelatorios2> {
  const norm = normalizarComTravas(acesso);
  const data = {
    relatorios2MenuAccess: norm.menu,
    relatorios2PaineisAccess: norm.paineis,
    relatorios2MeusAccess: norm.meus,
    relatorios2ConstrutorAccess: norm.construtor,
  };
  await prisma.agentSettings.upsert({
    where: { id: "global" },
    update: data,
    create: { id: "global", ...data },
  });
  return norm;
}

export function normalizarComTravas(acesso: AcessoRelatorios2): AcessoRelatorios2 {
  const out = { ...acesso };
  if (out.construtor !== "off") {
    const alvo = LEVEL_RANK[out.construtor];
    if (out.paineis === "off" || LEVEL_RANK[out.paineis] > alvo) out.paineis = out.construtor;
    if (out.meus === "off" || LEVEL_RANK[out.meus] > alvo) out.meus = out.construtor;
    // O submenu nunca pode ser mais restrito que o menu... na verdade o menu
    // controla a entrada; submenu mais permissivo que o menu nao "vaza" porque
    // podeAcessarSubmenu exige o menu. Sem trava extra aqui.
  }
  return out;
}
