"use client";

/**
 * ProgressTrail , trilha compacta "o que o agente está fazendo".
 *
 * Mostra os passos de consulta do turno atual em linguagem genérica de
 * operação (ex.: "Consultando faturamento"), sem nunca expor id de tool,
 * tabela ou a sigla "MCP". O passo em andamento gira; os concluídos ganham
 * um check. Com muitos passos, o meio é colapsado para não inundar a tela.
 *
 * Design: alinhado ao restante do Agente Nex (violet accent, tipografia
 * miúda, ícones lucide). Respeita prefers-reduced-motion.
 */

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStep {
  id: string;
  /** Rótulo genérico já traduzido (ex.: "faturamento", "estoque"). */
  label: string;
  state: "running" | "done";
  /**
   * Quando true, o rótulo é renderizado VERBATIM (sem o prefixo
   * "Consultou/Consultando"). Usado pelo Construtor de relatórios (F6), cujas
   * tools misturam leitura e mutação e já vêm como frases de ação. O Agente Nex
   * nunca seta este flag, então o comportamento dele fica inalterado.
   */
  raw?: boolean;
}

/** Acima deste total, os passos do meio são colapsados. */
const MAX_VISIBLE = 5;

type Row = ProgressStep | { collapsed: number };

export function ProgressTrail({ steps }: { steps: ProgressStep[] }) {
  if (steps.length === 0) return null;

  const rows: Row[] =
    steps.length > MAX_VISIBLE
      ? [
          steps[0],
          { collapsed: steps.length - 3 },
          steps[steps.length - 2],
          steps[steps.length - 1],
        ]
      : steps;

  return (
    <ul
      aria-label="Progresso da consulta"
      className="flex w-full flex-col gap-1 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
    >
      {rows.map((row, i) => {
        if ("collapsed" in row) {
          return (
            <li
              key={`collapsed-${i}`}
              className="pl-5 text-xs text-muted-foreground/70"
            >
              e mais {row.collapsed} {row.collapsed === 1 ? "etapa" : "etapas"}
            </li>
          );
        }
        const running = row.state === "running";
        return (
          <li key={row.id} className="flex items-center gap-2 text-xs">
            {running ? (
              <Loader2
                className="h-3 w-3 shrink-0 animate-spin text-violet-500 motion-reduce:animate-none"
                aria-hidden
              />
            ) : (
              <Check
                className="h-3 w-3 shrink-0 text-emerald-500"
                aria-hidden
              />
            )}
            <span
              className={cn(
                running
                  ? "animate-pulse text-foreground motion-reduce:animate-none"
                  : "text-muted-foreground",
              )}
            >
              {row.raw
                ? `${row.label}${running ? "…" : ""}`
                : `${running ? "Consultando" : "Consultou"} ${row.label}${running ? "…" : ""}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
