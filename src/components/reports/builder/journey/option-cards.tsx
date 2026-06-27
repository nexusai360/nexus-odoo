"use client";

// src/components/reports/builder/journey/option-cards.tsx
// Cards de OPCAO da jornada: quando a IA chama oferecer_opcoes, o chat renderiza
// estes cards clicaveis (icone do template + rotulo + descricao). A selecao volta
// como um turno. v1 = thumbnails (icone), sem componente real em miniatura.
import { iconeDoTemplate } from "./option-thumbs";
import type { OpcaoCard } from "@/lib/reports/builder/journey/state";

export function OptionCards({
  titulo,
  opcoes,
  onSelecionar,
}: {
  titulo: string;
  opcoes: OpcaoCard[];
  onSelecionar: (id: string, rotulo: string) => void;
}) {
  if (opcoes.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {titulo ? <p className="text-xs font-medium text-muted-foreground">{titulo}</p> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opcoes.map((o) => {
          const Icon = iconeDoTemplate(o.tipoVisual);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelecionar(o.id, o.rotulo)}
              className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-violet-500/50 hover:bg-violet-500/5 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/10">
                <Icon className="h-4 w-4 text-violet-500" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{o.rotulo}</span>
                {o.descricao ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{o.descricao}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
