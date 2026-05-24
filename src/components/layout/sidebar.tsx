"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor } as const;
const THEME_LABELS = {
  dark: "Modo escuro",
  light: "Modo claro",
  system: "Sistema",
} as const;

const COLLAPSED_KEY = "nexus-sidebar-collapsed";

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const { theme, setTheme } = useTheme();
  // Persistido em localStorage , desktop only.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(COLLAPSED_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  // Drawer mobile: fecha com Esc (acessibilidade , complementa o overlay
  // clicável e os atributos role="dialog"/aria-modal do <aside> móvel).
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

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

  function renderItem(item: NavItem, depth = 0, isCollapsed = false) {
    const active = isActive(item);
    const hasChildren = (item.children?.length ?? 0) > 0;
    const isOpen = openGroups[item.href] ?? false;

    if (hasChildren) {
      // Quando o sidebar está colapsado, clicar no item de grupo expande
      // a sidebar inteira E abre o submenu , regra ditada pelo usuário.
      const handleGroupClick = () => {
        if (isCollapsed) {
          toggleCollapsed();
          setOpenGroups((prev) => ({ ...prev, [item.href]: true }));
        } else {
          toggleGroup(item.href);
        }
      };

      const groupButton = (
        <button
          type="button"
          onClick={handleGroupClick}
          aria-current={active ? "page" : undefined}
          aria-expanded={isOpen}
          aria-label={isCollapsed ? item.label : undefined}
          className={cn(
            "group flex w-full items-center rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
            isCollapsed
              ? "h-10 justify-center"
              : "gap-3 px-3 py-2.5",
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
          {!isCollapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            </>
          )}
        </button>
      );

      return (
        <div key={item.href}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger render={groupButton} />
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            groupButton
          )}
          {!isCollapsed && (
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
                    {item.children!.map((child) =>
                      renderItem(child, depth + 1, false),
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      );
    }

    const isSubmenu = depth > 0;

    const linkEl = (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        aria-label={isCollapsed ? item.label : undefined}
        className={cn(
          "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
          isCollapsed
            ? "h-10 justify-center"
            : "gap-2.5 px-3 py-2",
          active
            ? isSubmenu
              ? "bg-violet-500/5 text-violet-600 dark:text-violet-300"
              : "bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/15"
            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        )}
      >
        {active && isSubmenu && !isCollapsed ? (
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
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger render={linkEl} />
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return linkEl;
  }

  const sidebarContent = (isCollapsed = false) => (
    <div className="flex h-full flex-col bg-background border-r border-border overflow-y-auto">
      <div
        className={cn(
          "flex items-center py-6",
          isCollapsed ? "justify-center px-2" : "gap-3 px-6",
        )}
      >
        <Image
          src="/logo.png"
          alt="Nexus Odoo"
          width={40}
          height={40}
          className="rounded-[22%]"
        />
        {!isCollapsed && (
          <div>
            <h1 className="text-base font-bold text-foreground tracking-tight">
              Nexus Odoo
            </h1>
            <p className="text-[11px] text-muted-foreground leading-none">
              Dados do ERP
            </p>
          </div>
        )}
      </div>

      <nav className={cn("flex-1 py-4 space-y-1", isCollapsed ? "px-2" : "px-3")}>
        {visibleNav.map((item, index) => {
          const showHeader =
            !isCollapsed &&
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
              {renderItem(item, 0, isCollapsed)}
            </motion.div>
          );
        })}
      </nav>

      <div
        className={cn(
          "border-t border-border py-4 space-y-3",
          isCollapsed ? "px-2" : "px-4",
        )}
      >
        {(() => {
          const profileEl = (
            <Link
              href="/perfil"
              onClick={() => setMobileOpen(false)}
              aria-label={isCollapsed ? "Perfil" : undefined}
              className={cn(
                "flex items-center rounded-lg transition-all duration-200 hover:bg-accent/50 cursor-pointer group",
                isCollapsed
                  ? "h-10 w-full justify-center"
                  : "gap-3 px-2 py-2.5 -mx-1",
              )}
            >
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground overflow-hidden shrink-0">
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
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-medium text-foreground truncate">
                    {user.name}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground truncate">
                    {PLATFORM_ROLE_LABELS[user.platformRole]}
                  </p>
                </div>
              )}
            </Link>
          );
          if (isCollapsed) {
            return (
              <Tooltip>
                <TooltipTrigger render={profileEl} />
                <TooltipContent side="right">{user.name}</TooltipContent>
              </Tooltip>
            );
          }
          return profileEl;
        })()}

        {/* Tema , 3 ícones; quando colapsado, mostra só o ícone ativo */}
        {isCollapsed ? (
          (() => {
            const ActiveIcon = THEME_ICONS[theme] ?? Monitor;
            // Cicla light → dark → system → light
            const order: Array<"light" | "dark" | "system"> = [
              "light",
              "dark",
              "system",
            ];
            const cycle = () => {
              const idx = order.indexOf(theme as "light" | "dark" | "system");
              const next = order[(idx + 1) % order.length];
              setTheme(next);
            };
            return (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={cycle}
                      aria-label={`Tema (${THEME_LABELS[theme] ?? ""}) , clique para alternar`}
                      className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    >
                      <ActiveIcon className="h-4 w-4" aria-hidden />
                    </button>
                  }
                />
                <TooltipContent side="right">
                  {THEME_LABELS[theme] ?? "Tema"}
                </TooltipContent>
              </Tooltip>
            );
          })()
        ) : (
          <div
            role="radiogroup"
            aria-label="Tema da plataforma"
            className="inline-flex w-full items-center gap-0.5 rounded-full border border-border bg-background/40 p-0.5"
          >
            {(["light", "dark", "system"] as const).map((t) => {
              const Icon = THEME_ICONS[t];
              const selected = theme === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={THEME_LABELS[t]}
                  title={THEME_LABELS[t]}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "flex h-7 flex-1 cursor-pointer items-center justify-center rounded-full transition-all duration-200",
                    selected
                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </div>
        )}

        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  aria-label="Sair"
                  className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              }
            />
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
            size="sm"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        )}
      </div>

      {!isCollapsed && (
        <footer className="mt-auto border-t border-border/50 px-3 py-2">
          <p className="text-[10px] text-muted-foreground/60 text-center leading-tight">
            Nexus AI © 2026
          </p>
          <p className="text-[10px] text-muted-foreground/60 text-center leading-tight">
            Todos os direitos reservados
          </p>
        </footer>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop , sidebar com largura animada (expandido 240px / colapsado 64px). */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", damping: 28, stiffness: 280 }
        }
        className="relative hidden shrink-0 lg:block"
      >
        {sidebarContent(collapsed)}

        {/* Botão setinha , centro vertical, borda direita do sidebar */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
          aria-expanded={!collapsed}
          className="group absolute top-1/2 right-0 z-10 flex h-7 w-7 -translate-y-1/2 translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-all hover:border-violet-500/40 hover:text-violet-600 dark:hover:text-violet-300"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </motion.aside>

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
              {sidebarContent(false)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
