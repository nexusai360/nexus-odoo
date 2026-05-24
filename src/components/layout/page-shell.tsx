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
  // UNIFICADO: todas as variants compartilham o mesmo piso/cap do wide
  // (Dashboard/Relatorios), aplicando a regra cap 15% (= 1636) com
  // crescimento proporcional ao viewport via clamp.
  // - Piso: 1600 (= max-w do Dashboard)
  // - K: 0.0075 (crescimento sutil e adaptativo)
  // - Cap: 1636 (= 1600 + 15% de bump)
  // Mantemos 'full' sem cap para telas densas de dados (Relatorios detalhe).
  compact: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.0075),1636px)]",
  form: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.0075),1636px)]",
  agent: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.0075),1636px)]",
  narrow: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.0075),1636px)]",
  wide: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.0075),1636px)]",
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
