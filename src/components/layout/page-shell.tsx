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
  // REGRA SUPREMA UNIFICADA: TODAS as telas usam exatamente a mesma
  // largura. Em monitor de 27" o cap de 1310px e atingido (referencia
  // visual do Dashboard). Em telas menores cai proporcionalmente para
  // o piso; em telas maiores trava no cap.
  // - Piso (mobile/laptop): 1280px
  // - Crescimento: 0.025 do excedente acima de 1366px de viewport
  //   (cap atingido em viewport ~2566, que cobre 27" FHD/QHD).
  // - Cap (27" e acima): 1310px
  // 'full' continua sem cap para telas densas de relatorio.
  compact: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.10),1400px)]",
  form: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.10),1400px)]",
  agent: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.10),1400px)]",
  narrow: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.10),1400px)]",
  wide: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.10),1400px)]",
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
