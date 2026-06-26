import {
  Activity,
  BarChart3,
  BookOpen,
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
import { USUARIOS_SUPER_ADMIN_ONLY } from "@/lib/constants/temp-rules";
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

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  {
    // Relatórios 2.0 , área nova (F6): painéis + meus relatórios + construtor.
    // Label e rotas vêm de RELATORIOS2_* (fonte única). Grupo expansível (padrão
    // Agente Nex). A visibilidade fina por nível entra na Onda 4 (RBAC dinâmico);
    // por ora admin e super_admin.
    label: RELATORIOS2_MENU.label,
    href: RELATORIOS2_MENU.href,
    icon: LayoutDashboard,
    visibleTo: ["super_admin", "admin"],
    children: [
      {
        label: RELATORIOS2_SUBMENUS[0].label,
        href: RELATORIOS2_SUBMENUS[0].href,
        icon: LayoutGrid,
        visibleTo: ["super_admin", "admin"],
      },
      {
        label: RELATORIOS2_SUBMENUS[1].label,
        href: RELATORIOS2_SUBMENUS[1].href,
        icon: FileText,
        visibleTo: ["super_admin", "admin"],
      },
      {
        label: RELATORIOS2_SUBMENUS[2].label,
        href: RELATORIOS2_SUBMENUS[2].href,
        icon: Wrench,
        visibleTo: ["super_admin", "admin"],
      },
    ],
  },
  {
    // href é o prefixo do grupo , usado como chave de openGroups e por
    // isGroupActive (o item de grupo é um <button>, não navega).
    label: "Agente Nex",
    href: "/agente",
    icon: Sparkles,
    section: "admin",
    superAdminOnly: true,
    children: [
      {
        label: "Monitoramento",
        href: "/agente/monitoramento",
        icon: Activity,
        superAdminOnly: true,
      },
      {
        label: "Configuração",
        href: "/agente/configuracao",
        icon: SlidersHorizontal,
        superAdminOnly: true,
      },
      {
        label: "Chaves de API",
        href: "/agente/chaves",
        icon: KeyRound,
        superAdminOnly: true,
      },
      {
        label: "Prompt",
        href: "/agente/prompt",
        icon: BookOpen,
        superAdminOnly: true,
      },
      {
        label: "Consumo",
        href: "/agente/consumo",
        icon: TrendingUp,
        superAdminOnly: true,
      },
      {
        label: "Playground",
        href: "/agente/playground",
        icon: FlaskConical,
        superAdminOnly: true,
      },
      {
        label: "Plugar MCPs",
        href: "/agente/plugar-mcps",
        icon: Cable,
        superAdminOnly: true,
      },
    ],
  },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: Users,
    section: "admin",
    // Regra temporária (ver temp-rules.ts): quando ligada, só super_admin vê.
    visibleTo: USUARIOS_SUPER_ADMIN_ONLY
      ? ["super_admin"]
      : ["super_admin", "admin"],
  },
  {
    label: "Integrações",
    href: "/integracoes",
    icon: Plug,
    section: "admin",
    visibleTo: ["super_admin"],
  },
  {
    label: "Configuração",
    href: "/configuracao",
    icon: Settings,
    section: "admin",
    visibleTo: ["super_admin"],
  },
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
