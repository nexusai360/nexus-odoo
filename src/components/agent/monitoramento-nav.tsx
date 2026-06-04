"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Backtest", href: "/agente/monitoramento" },
  { label: "Router", href: "/agente/monitoramento/router" },
  { label: "Bubble", href: "/agente/monitoramento/bubble" },
  { label: "Aprendizado", href: "/agente/monitoramento/aprendizado" },
] as const;

/**
 * Sub-navegação do painel Monitoramento do Agente Nex. Aba ativa derivada
 * do pathname. Padrão visual idêntico ao ServidorMcpNav (Integrações →
 * Servidor MCP), mantendo consistência da plataforma.
 */
export function MonitoramentoNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções do Monitoramento do Agente Nex"
      className="mt-6 inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/agente/monitoramento"
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
