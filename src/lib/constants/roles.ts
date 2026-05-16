import { Crown, Shield, ShieldHalf, Eye } from "lucide-react";
import type { PlatformRole } from "@/generated/prisma/client";

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Gerente",
  viewer: "Visualizador",
};

export const PLATFORM_ROLE_HIERARCHY: Record<PlatformRole, number> = {
  super_admin: 4,
  admin: 3,
  manager: 2,
  viewer: 1,
};

export const PLATFORM_ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  super_admin: "Acesso total a toda a plataforma",
  admin: "Gerencia contas e usuários",
  manager: "Gerencia departamentos atribuídos",
  viewer: "Apenas visualização",
};

export const PLATFORM_ROLE_STYLES: Record<
  PlatformRole,
  { className: string; iconClassName: string }
> = {
  super_admin: {
    className:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    iconClassName: "text-purple-500",
  },
  admin: {
    className:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    iconClassName: "text-blue-500",
  },
  manager: {
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    iconClassName: "text-amber-500",
  },
  viewer: {
    className:
      "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700",
    iconClassName: "text-zinc-500",
  },
};

export const PLATFORM_ROLE_ICONS = {
  super_admin: Crown,
  admin: Shield,
  manager: ShieldHalf,
  viewer: Eye,
} as const;

export const PLATFORM_ROLE_OPTIONS: Array<{
  value: PlatformRole;
  label: string;
  description: string;
  icon: typeof Crown;
}> = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Acesso total a toda a plataforma",
    icon: Crown,
  },
  {
    value: "admin",
    label: "Admin",
    description: "Gerencia contas e usuários",
    icon: Shield,
  },
  {
    value: "manager",
    label: "Gerente",
    description: "Gerencia departamentos atribuídos",
    icon: ShieldHalf,
  },
  {
    value: "viewer",
    label: "Visualizador",
    description: "Apenas visualização",
    icon: Eye,
  },
];
