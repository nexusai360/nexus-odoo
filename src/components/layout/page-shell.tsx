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
  // Cap reduzido para 25% do bump original (commit 8e7b7ef), com
  // K=0.0125 (25% do crescimento original). Aplicado uniformemente
  // a todas as variants:
  // - narrow: 1280 + (1480-1280)*0.25 = 1330
  // - wide:   1600 + (1840-1600)*0.25 = 1660
  // - compact/form/agent: 1280 + (1536-1280)*0.25 = 1344
  compact: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.0125),1344px)]",
  form: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.0125),1344px)]",
  agent: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.0125),1344px)]",
  narrow: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.0125),1330px)]",
  wide: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.0125),1660px)]",
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
