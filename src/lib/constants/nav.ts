import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  Cable,
  FileText,
  FlaskConical,
  Home,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Plug,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PlatformRole } from "@/generated/prisma/client";
import { RELATORIOS2_MENU, RELATORIOS2_SUBMENUS } from "@/lib/constants/relatorios2";

type NavSection = "admin";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  visibleTo?: PlatformRole[];
  section?: NavSection;
  children?: NavItem[];
};

export const SECTION_LABELS: Record<NavSection, string> = {
  admin: "Administração",
};

/**
 * Itens de topo do sidebar.
 *
 * Quem decide se um perfil vê cada item de topo é o nível salvo em `menu_access`
 * (tela Configuração, catálogo em `src/lib/nav/menu-catalog.ts`), não um gate
 * estático aqui. Por isso os itens governados pelo catálogo não têm
 * `superAdminOnly` nem `visibleTo`: se tivessem, a Configuração conseguiria
 * restringir um menu mas nunca liberá-lo. A trava está em
 * `src/lib/nav/menu-catalog-autoridade.test.ts`.
 *
 * `superAdminOnly` e `visibleTo` continuam válidos para itens que não são menus
 * de topo do catálogo (nenhum hoje).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  {
    // Submenu da Diretoria. href é o prefixo do grupo (não navega); os
    // children são resolvidos por capability no layout server
    // (diretoriaNavFor) e injetados antes de chegar à Sidebar.
    label: "Diretoria",
    href: "/diretoria",
    icon: Building2,
    children: [],
  },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  {
    // Relatórios 2.0 , área nova (F6): painéis + meus relatórios + construtor.
    // Label e rotas vêm de RELATORIOS2_* (fonte única). Grupo expansível (padrão
    // Agente Nex). A visibilidade fina por nível entra na Onda 4 (RBAC dinâmico);
    // por ora admin e super_admin.
    // Sem visibleTo estatico: a visibilidade (menu + submenus) vem do RBAC
    // dinamico (relatorios2Visible computado no layout). Ver Sidebar.
    label: RELATORIOS2_MENU.label,
    href: RELATORIOS2_MENU.href,
    icon: LayoutDashboard,
    children: [
      { label: RELATORIOS2_SUBMENUS[0].label, href: RELATORIOS2_SUBMENUS[0].href, icon: LayoutGrid },
      { label: RELATORIOS2_SUBMENUS[1].label, href: RELATORIOS2_SUBMENUS[1].href, icon: FileText },
      { label: RELATORIOS2_SUBMENUS[2].label, href: RELATORIOS2_SUBMENUS[2].href, icon: Wrench },
    ],
  },
  {
    // href é o prefixo do grupo , usado como chave de openGroups e por
    // isGroupActive (o item de grupo é um <button>, não navega).
    // Quem vê o grupo (e portanto os submenus) é o nível do menu "agente" em
    // menu_access, resolvido no server e aplicado na Sidebar. Padrão: super_admin.
    label: "Agente Nex",
    href: "/agente",
    icon: Sparkles,
    section: "admin",
    children: [
      { label: "Monitoramento", href: "/agente/monitoramento", icon: Activity },
      { label: "Configuração", href: "/agente/configuracao", icon: SlidersHorizontal },
      { label: "Chaves de API", href: "/agente/chaves", icon: KeyRound },
      { label: "Prompt", href: "/agente/prompt", icon: BookOpen },
      { label: "Consumo", href: "/agente/consumo", icon: TrendingUp },
      { label: "Playground", href: "/agente/playground", icon: FlaskConical },
      { label: "Plugar MCPs", href: "/agente/plugar-mcps", icon: Cable },
    ],
  },
  { label: "Usuários", href: "/usuarios", icon: Users, section: "admin" },
  { label: "Integrações", href: "/integracoes", icon: Plug, section: "admin" },
  { label: "Configuração", href: "/configuracao", icon: Settings, section: "admin" },
];

export function filterNav(
  items: NavItem[],
  user: { platformRole: PlatformRole; isOwner?: boolean },
): NavItem[] {
  const result: NavItem[] = [];
  for (const item of items) {
    if (item.superAdminOnly && user.platformRole !== "super_admin") continue;
    if (item.visibleTo && !item.visibleTo.includes(user.platformRole)) continue;
    const children = item.children
      ? filterNav(item.children, user)
      : undefined;
    if (item.children && item.children.length > 0 && (!children || children.length === 0)) {
      continue;
    }
    result.push({ ...item, children });
  }
  return result;
}
