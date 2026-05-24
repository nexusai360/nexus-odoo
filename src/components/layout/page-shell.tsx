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
  // Cap reduzido pela metade do ajuste anterior (8e7b7ef), com K=0.025
  // (metade do crescimento anterior). Piso = tamanho original; teto =
  // meio caminho entre o original e o cap anterior.
  compact: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1408px)]",
  form: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1408px)]",
  agent: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1408px)]",
  narrow: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1380px)]",
  wide: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.025),1720px)]",
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
