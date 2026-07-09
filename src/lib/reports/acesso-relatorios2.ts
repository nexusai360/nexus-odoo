// src/lib/reports/acesso-relatorios2.ts
// Acesso aos SUBMENUS de Relatorios 2.0 (paineis, meus, construtor). Niveis
// salvos no AgentSettings (ChannelAccessLevel). Regra: nivel = minimo de perfil
// (heranca); "off" = oculto para todos EXCETO o super_admin dono.
//
// O acesso ao MENU de topo "Relatorios 2.0" NAO mora mais aqui: desde a feature
// "Acesso aos menus" (2026-07-09) ele e governado pela tabela `menu_access`
// (chave `relatorios2`), junto com os outros 7 menus, e aplicado pelo layout
// da rota via `requireMenuAccess`. O campo `menu` deste modulo continua no
// banco por compatibilidade (a migration de seed copiou o valor dele para
// `menu_access`), mas nao e mais consultado por nenhum gate.
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

/**
 * Acesso a um submenu, pelo nivel do proprio submenu.
 *
 * O gate do menu de topo ficou com `menu_access` (layout de /relatorios-2), por
 * isso esta funcao nao olha mais `acesso.menu`: quem chega aqui ja passou pelo
 * menu. Checar de novo faria a Configuracao nunca conseguir LIBERAR o menu para
 * um perfil abaixo do antigo `relatorios2MenuAccess`.
 */
export function podeAcessarSubmenu(
  acesso: AcessoRelatorios2,
  submenu: Relatorios2SubmenuKey,
  user: UsuarioAcesso,
): boolean {
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

// Trava de coerencia: o Construtor "puxa" SOMENTE "Meus relatorios" para no
// minimo o mesmo nivel , quem constroi precisa sempre ver os proprios
// relatorios. "Paineis" NAO entra na trava (tela a parte, pode ficar mais
// restrita que o construtor). "off" do construtor nao puxa nada.
export function normalizarComTravas(acesso: AcessoRelatorios2): AcessoRelatorios2 {
  const out = { ...acesso };
  if (out.construtor !== "off") {
    const alvo = LEVEL_RANK[out.construtor];
    if (out.meus === "off" || LEVEL_RANK[out.meus] > alvo) out.meus = out.construtor;
  }
  return out;
}
