"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Visão Geral", href: "/integracoes/servidor-mcp" },
  { label: "Chaves de Acesso", href: "/integracoes/servidor-mcp/chaves" },
  { label: "Logs", href: "/integracoes/servidor-mcp/logs" },
  { label: "Documentação", href: "/integracoes/servidor-mcp/docs" },
] as const;

/**
 * Sub-navegação do painel Servidor MCP. Aba ativa derivada do pathname,
 * fonte única, sem `<Tabs>` duplicado por rota.
 */
export function ServidorMcpNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções do Servidor MCP"
      data-tour="mcp-nav"
      className="mt-6 inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/integracoes/servidor-mcp"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
