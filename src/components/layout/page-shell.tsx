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
  // Variantes do Agente Nex: largura base equivalente ao /configuracao
  // (root, narrow = max-w-7xl), com crescimento sutil em monitores
  // grandes (clamp ate +20% em 2400px+). No 16/17" o piso de 1280px
  // mantem o mesmo tamanho que estava antes.
  // - compact/form: piso 1280px (max-w-7xl, igual ao /configuracao),
  //   teto 1536 (+20%) em viewports >= 2400.
  // - agent:        piso 1280px, teto 1536 (+20%).
  compact:
    "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.05),1536px)]",
  form:
    "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.05),1536px)]",
  agent:
    "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.05),1536px)]",
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
