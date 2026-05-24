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
  // Variantes do Agente Nex: largura proporcional ao viewport (% via
  // min(NN vw, cap)) com piso minimo confortavel para laptops e teto
  // alto para nao explodir em 60" 4K. Mobile/tablet preservados pelo
  // min-width: o min(...) seleciona o menor entre o vw e o piso.
  // Regra: usa 92% / 94% da viewport; nunca menor que o piso base.
  compact: "w-full max-w-[min(92vw,2400px)]",
  form: "w-full max-w-[min(92vw,2400px)]",
  agent: "w-full max-w-[min(94vw,2600px)]",
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
