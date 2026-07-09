// src/lib/nav/menu-catalog.ts
// Catalogo dos MENUS configuraveis por perfil (feature "Acesso aos menus", tela
// Configuracao). Cada menu tem uma chave estavel (menuKey), o href-raiz que a
// guarda de rota protege, a secao no sidebar, o nivel default (= comportamento
// estatico atual do nav.ts) e se e TRAVADO para o super_admin (anti-lockout).
//
// Fonte unica: a UI, a camada de acesso (menu-access.ts), o seed da migration e o
// filtro do sidebar leem daqui. Adicionar um menu = uma linha aqui.
import type { ChannelAccessLevel, PlatformRole } from "@/generated/prisma/client";

export type MenuKey =
  | "dashboard"
  | "diretoria"
  | "relatorios"
  | "relatorios2"
  | "agente"
  | "usuarios"
  | "integracoes"
  | "configuracao";

export interface MenuCatalogEntry {
  key: MenuKey;
  label: string;
  /** href-raiz do menu (a guarda de rota casa por prefixo). */
  href: string;
  secao: "comum" | "administracao";
  /** Nivel default = o comportamento estatico atual (nav.ts) antes desta feature. */
  padrao: ChannelAccessLevel;
  /**
   * TRAVADO: o nivel deste menu e FIXO em super_admin e o super_admin SEMPRE ve,
   * independentemente do que esteja gravado (evita lockout). Decisao do usuario
   * (2026-07-09): vale para `configuracao`, ninguem pode trancar o super_admin
   * fora da propria tela de configuracao. E a tela so tem acoes de super_admin,
   * entao liberar para admin entregaria uma tela onde nada salva.
   * `podeVerMenu` forca true para super_admin; `definirMenuAccess` forca o nivel
   * gravado em super_admin; a UI mostra o seletor desabilitado.
   */
  travadoSuperAdmin: boolean;
}

export const MENU_CATALOG: readonly MenuCatalogEntry[] = [
  // === Comum ===
  { key: "dashboard", label: "Dashboard", href: "/dashboard", secao: "comum", padrao: "viewer", travadoSuperAdmin: false },
  { key: "diretoria", label: "Diretoria", href: "/diretoria", secao: "comum", padrao: "viewer", travadoSuperAdmin: false },
  { key: "relatorios", label: "Relatórios", href: "/relatorios", secao: "comum", padrao: "viewer", travadoSuperAdmin: false },
  { key: "relatorios2", label: "Relatórios 2.0", href: "/relatorios-2", secao: "comum", padrao: "admin", travadoSuperAdmin: false },
  // === Administração ===
  { key: "agente", label: "Agente Nex", href: "/agente", secao: "administracao", padrao: "super_admin", travadoSuperAdmin: false },
  { key: "usuarios", label: "Usuários", href: "/usuarios", secao: "administracao", padrao: "super_admin", travadoSuperAdmin: false },
  { key: "integracoes", label: "Integrações", href: "/integracoes", secao: "administracao", padrao: "super_admin", travadoSuperAdmin: false },
  { key: "configuracao", label: "Configuração", href: "/configuracao", secao: "administracao", padrao: "super_admin", travadoSuperAdmin: true },
];

const BY_KEY: ReadonlyMap<MenuKey, MenuCatalogEntry> = new Map(
  MENU_CATALOG.map((e) => [e.key, e]),
);

export function menuEntry(key: MenuKey): MenuCatalogEntry | undefined {
  return BY_KEY.get(key);
}

/** menuKey cujo href-raiz casa com o pathname (prefixo), para a guarda de rota. */
export function menuKeyForPath(pathname: string): MenuKey | undefined {
  // ordena por href mais longo primeiro (ex.: /relatorios-2 antes de /relatorios)
  const ordered = [...MENU_CATALOG].sort((a, b) => b.href.length - a.href.length);
  return ordered.find((e) => pathname === e.href || pathname.startsWith(`${e.href}/`))?.key;
}

// ─── Logica de acesso (PURA, sem prisma , testavel isolada) ──────────────────────
export type MenuAccessMap = Record<MenuKey, ChannelAccessLevel>;

const RANK: Record<PlatformRole, number> = { viewer: 1, manager: 2, admin: 3, super_admin: 4 };
const LEVEL_RANK: Record<Exclude<ChannelAccessLevel, "off">, number> = {
  viewer: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};

/** Mapa default = o padrao de cada menu no catalogo (comportamento estatico atual). */
export function defaultMenuAccess(): MenuAccessMap {
  return Object.fromEntries(MENU_CATALOG.map((e) => [e.key, e.padrao])) as MenuAccessMap;
}

/**
 * Um perfil pode VER um menu, dado o nivel configurado? Funcao PURA.
 * - Menu travado (Configuracao) + super_admin => sempre true (anti-lockout).
 * - "off" => so super_admin (para nao sumir a gestao).
 * - demais => rank do perfil >= rank do nivel exigido.
 */
export function podeVerMenu(
  entry: MenuCatalogEntry,
  level: ChannelAccessLevel,
  role: PlatformRole,
): boolean {
  if (entry.travadoSuperAdmin && role === "super_admin") return true;
  if (level === "off") return role === "super_admin";
  return RANK[role] >= LEVEL_RANK[level];
}
