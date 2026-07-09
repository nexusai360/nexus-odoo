"use client";

import { cn } from "@/lib/utils";

const UFS: string[] = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

/**
 * Seletor de UFs (componente novo; o "UfPicker" do HTML do cliente não existia no
 * nosso código). Grade de siglas como toggles. Lista vazia = todas as UFs.
 */
export function UfPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ufs: string[]) => void;
}) {
  const set = new Set(value.map((u) => u.toUpperCase()));

  function toggle(uf: string) {
    const next = new Set(set);
    if (next.has(uf)) next.delete(uf);
    else next.add(uf);
    onChange([...next]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{set.size === 0 ? "Todas as UFs" : `${set.size} UF(s) selecionada(s)`}</span>
        {set.size > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-violet-400 hover:underline"
          >
            Limpar (todas)
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
        {UFS.map((uf) => {
          const ativo = set.has(uf);
          return (
            <button
              key={uf}
              type="button"
              aria-pressed={ativo}
              onClick={() => toggle(uf)}
              className={cn(
                "rounded-md border px-1.5 py-1 text-xs tabular-nums transition-colors",
                ativo
                  ? "border-violet-500 bg-violet-600/30 text-violet-100"
                  : "border-border/60 text-muted-foreground hover:bg-muted/60",
              )}
            >
              {uf}
            </button>
          );
        })}
      </div>
    </div>
  );
}
