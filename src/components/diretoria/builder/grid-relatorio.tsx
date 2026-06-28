// T6 , Grid de render do construtor (server). Posicionamento por CSS Grid nativo
// (12 colunas, auto-rows de 132px, row dense). Cada bloco ocupa span de colunas
// (largura*3) e linhas (altura) via custom properties; no mobile vira largura cheia.
import type { ReactNode, CSSProperties } from "react";
import type { FonteDado } from "@/lib/diretoria/builder/catalogo";

const SELO: Record<Exclude<FonteDado, "real">, string> = {
  estimado: "Estimado",
  sem_fonte: "Sem fonte",
};

export function BlocoCard({
  titulo,
  fonteDado,
  largura,
  altura,
  children,
}: {
  titulo: string;
  fonteDado: FonteDado;
  largura: number; // quartos
  altura: number; // u
  children: ReactNode;
}) {
  const style = {
    "--c": largura * 3,
    "--r": altura,
  } as CSSProperties;
  return (
    <section className="gb flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5" style={style}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="truncate text-sm font-semibold">{titulo}</h2>
        {fonteDado !== "real" ? (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">
            {SELO[fonteDado]}
          </span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

export function GridRelatorio({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="diretoria-grid">{children}</div>
      <style>{`
        .diretoria-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:132px;gap:1rem;grid-auto-flow:row dense}
        .diretoria-grid>.gb{grid-column:span var(--c);grid-row:span var(--r)}
        @media (max-width:767px){.diretoria-grid>.gb{grid-column:span 12 !important;grid-row:auto !important}}
      `}</style>
    </>
  );
}
