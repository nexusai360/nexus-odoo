import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "wide" | "narrow" | "full" | "compact" | "form" | "agent";

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

/**
 * Container de página.
 * - `compact`: formulario centralizado bem respirado (`max-w-3xl`) — uso na
 *   configuracao do Agente Nex.
 * - `form`: telas de formulario padrao do agente (`max-w-4xl`).
 * - `agent`: telas mistas do agente que precisam de duas colunas
 *   (`max-w-5xl`), ex.: plugar MCPs.
 * - `narrow`: formularios e telas de leitura curta (`max-w-7xl`).
 * - `wide`: dashboards e grades (`max-w-[1600px]`).
 * - `full`: telas densas de dados, sem teto.
 */
const MAX: Record<Variant, string> = {
  // Variantes do Agente Nex: largura base confortavel em laptops e que
  // cresce em saltos quando ha mais viewport (27", ultrawide, TVs),
  // preservando margem visual. Mobile/tablet seguem cap base ate sm/md.
  compact:
    "max-w-6xl 2xl:max-w-[1440px] [@media(min-width:1920px)]:max-w-[1640px] [@media(min-width:2400px)]:max-w-[1880px]",
  form:
    "max-w-6xl 2xl:max-w-[1440px] [@media(min-width:1920px)]:max-w-[1640px] [@media(min-width:2400px)]:max-w-[1880px]",
  agent:
    "max-w-7xl 2xl:max-w-[1520px] [@media(min-width:1920px)]:max-w-[1720px] [@media(min-width:2400px)]:max-w-[1960px]",
  narrow: "max-w-7xl",
  wide: "max-w-[1600px]",
  full: "max-w-none",
};

export function PageShell({ variant = "wide", children, className }: Props) {
  return (
    <div
      className={cn(
        MAX[variant],
        "mx-auto px-4 sm:px-6 lg:px-8 xl:px-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
