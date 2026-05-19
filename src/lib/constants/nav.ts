import { BarChart3, Bot, Home, Plug, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PlatformRole } from "@/generated/prisma/client";

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
  { label: "Agente", href: "/agente", icon: Bot },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: Users,
    section: "admin",
    visibleTo: ["super_admin", "admin"],
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
