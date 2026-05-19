"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { LogOut, Menu, X, Sun, Moon, Monitor, ChevronDown } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  filterNav,
  NAV_ITEMS,
  SECTION_LABELS,
  type NavItem,
} from "@/lib/constants/nav";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import type { PlatformRole } from "@/generated/prisma/client";
import {
  collectLeafHrefs,
  isGroupActive,
  isLeafActive,
} from "@/lib/utils/sidebar-active-path";
import { cn } from "@/lib/utils";

interface SidebarUser {
  name: string;
  email: string;
  platformRole: PlatformRole;
  avatarUrl: string | null;
}

interface SidebarProps {
  user: SidebarUser;
}

const THEME_CYCLE = ["dark", "light", "system"] as const;
const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor } as const;
const THEME_LABELS = {
  dark: "Modo escuro",
  light: "Modo claro",
  system: "Sistema",
} as const;

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const { theme, setTheme } = useTheme();

  // Drawer mobile: fecha com Esc (acessibilidade — complementa o overlay
  // clicável e os atributos role="dialog"/aria-modal do <aside> móvel).
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  }

  const ThemeIcon = THEME_ICONS[theme] ?? Moon;
  const visibleNav = filterNav(NAV_ITEMS, user);
  const allLeafHrefs = useMemo(() => collectLeafHrefs(visibleNav), [visibleNav]);

  // Abre, na montagem, o grupo cujo prefixo de href bate com o pathname atual,
  // para que o submenu já apareça expandido ao navegar direto numa sub-rota.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of NAV_ITEMS) {
      if ((item.children?.length ?? 0) > 0 && isGroupActive(item.href, pathname)) {
        initial[item.href] = true;
      }
    }
    return initial;
  });

  function toggleGroup(href: string) {
    setOpenGroups((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  function isActive(item: NavItem): boolean {
    if (item.children?.length) return isGroupActive(item.href, pathname);
    return isLeafActive(item.href, pathname, allLeafHrefs);
  }

  function renderItem(item: NavItem, depth = 0) {
    const active = isActive(item);
    const hasChildren = (item.children?.length ?? 0) > 0;
    const isOpen = openGroups[item.href] ?? false;

    if (hasChildren) {
      return (
        <div key={item.href}>
          <button
            type="button"
            onClick={() => toggleGroup(item.href)}
            aria-current={active ? "page" : undefined}
            aria-expanded={isOpen}
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer",
              active
                ? "bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/15"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <item.icon
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                active
                  ? "text-violet-600 dark:text-violet-300"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                key="children"
                initial={
                  reduceMotion
                    ? { height: "auto", opacity: 1 }
                    : { height: 0, opacity: 0 }
                }
                animate={{ height: "auto", opacity: 1 }}
                exit={
                  reduceMotion
                    ? { height: "auto", opacity: 1 }
                    : { height: 0, opacity: 0 }
                }
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-1 ml-3 pl-3 border-l border-border/40 space-y-1">
                  {item.children!.map((child) => renderItem(child, depth + 1))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    const isSubmenu = depth > 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
          active
            ? isSubmenu
              ? "bg-violet-500/5 text-violet-600 dark:text-violet-300"
              : "bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/15"
            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        )}
      >
        {active && isSubmenu ? (
          <span
            aria-hidden="true"
            className="block h-1 w-1 shrink-0 rounded-full bg-violet-500"
          />
        ) : null}
        <item.icon
          className={cn(
            "h-[16px] w-[16px] shrink-0 transition-colors duration-200",
            active
              ? "text-violet-600 dark:text-violet-300"
              : "text-muted-foreground group-hover:text-foreground",
          )}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background border-r border-border overflow-y-auto">
      <div className="flex items-center gap-3 px-6 py-6">
        <Image
          src="/logo.png"
          alt="Nexus Odoo"
          width={40}
          height={40}
          className="rounded-[22%]"
        />
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">
            Nexus Odoo
          </h1>
          <p className="text-[11px] text-muted-foreground leading-none">
            Dados do ERP
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNav.map((item, index) => {
          const showHeader =
            item.section != null &&
            visibleNav.findIndex((n) => n.section === item.section) === index;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
            >
              {showHeader ? (
                <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {SECTION_LABELS[item.section!]}
                </div>
              ) : null}
              {renderItem(item)}
            </motion.div>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-4 space-y-3">
        <Link
          href="/perfil"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-1 transition-all duration-200 hover:bg-accent/50 cursor-pointer group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground overflow-hidden shrink-0">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {PLATFORM_ROLE_LABELS[user.platformRole]}
            </p>
          </div>
        </Link>

        <Button
          variant="ghost"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <ThemeIcon className="h-4 w-4" />
          {THEME_LABELS[theme]}
        </Button>

        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>

      <footer className="mt-auto border-t border-border/50 px-3 py-2">
        <p className="text-[10px] text-muted-foreground/60 text-center leading-tight">
          Nexus AI © 2026
        </p>
        <p className="text-[10px] text-muted-foreground/60 text-center leading-tight">
          Todos os direitos reservados
        </p>
      </footer>
    </div>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block">{sidebarContent}</aside>

      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={mobileOpen}
          className="h-11 w-11 bg-card border border-border text-foreground hover:text-foreground cursor-pointer"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
