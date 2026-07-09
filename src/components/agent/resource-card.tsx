"use client";

/**
 * ResourceCard, container reutilizavel dos blocos da secao Recursos do
 * Agente Nex.
 *
 * - Mostra cabecalho (icone + titulo + subtitulo) + selector de checkpoint
 *   de 3 estados a direita.
 * - Quando `collapsible`, ganha um chevron que esconde/exibe `children`.
 * - Persistencia opcional da preferencia colapsado em `localStorage`, por
 *   `id`. SSR-safe: inicializa com `defaultCollapsed` e sincroniza no
 *   `useEffect`.
 */

import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  FeatureCheckpoint,
  type CheckpointState,
} from "@/components/ui/feature-checkpoint";
import { cn } from "@/lib/utils";

export interface ResourceCardProps {
  /** Identificador estavel do card; usado como chave do localStorage. */
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checkpoint: CheckpointState;
  onCheckpointChange: (cp: CheckpointState) => void;
  loading: boolean;
  ariaLabel: string;
  /** Quando true, mostra chevron e permite recolher o conteudo. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Quando true, esconde o seletor de checkpoint (uso fixo: ex. ReasoningCard que travou em OFF). */
  hideCheckpoint?: boolean;
  /** Restringe os estados do checkpoint (ex.: ["OFF","PRODUCTION"]). Default: todos. */
  checkpointAllowed?: CheckpointState[];
  /** Subtitulo extra (opcional) embaixo do bloco de cabecalho. */
  children?: React.ReactNode;
}

const STORAGE_KEY_PREFIX = "agent-config:resource-card:";

export function ResourceCard({
  id,
  icon,
  title,
  subtitle,
  checkpoint,
  onCheckpointChange,
  loading,
  ariaLabel,
  collapsible = false,
  defaultCollapsed = false,
  hideCheckpoint = false,
  checkpointAllowed,
  children,
}: ResourceCardProps) {
  const panelId = useId();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Hidratacao: le do localStorage so depois do mount para evitar mismatch.
  useEffect(() => {
    if (!collapsible || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
      if (raw === "1") setCollapsed(true);
      else if (raw === "0") setCollapsed(false);
    } catch {
      // ignora storage indisponivel
    }
  }, [collapsible, id]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            `${STORAGE_KEY_PREFIX}${id}`,
            next ? "1" : "0",
          );
        }
      } catch {
        // ignora
      }
      return next;
    });
  }

  const showChildren = children != null && !collapsed;

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {collapsible && children ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls={panelId}
              aria-label={collapsed ? "Expandir secao" : "Recolher secao"}
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  collapsed && "-rotate-90",
                )}
                aria-hidden
              />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {icon}
              {title}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {loading && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
          {hideCheckpoint ? null : (
            <FeatureCheckpoint
              value={checkpoint}
              onChange={onCheckpointChange}
              disabled={loading}
              aria-label={ariaLabel}
              {...(checkpointAllowed ? { allowed: checkpointAllowed } : {})}
            />
          )}
        </span>
      </div>
      {showChildren && (
        <div id={panelId} className="mt-3 border-t border-border/60 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
