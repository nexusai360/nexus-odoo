"use client";

/**
 * ConversationList — lista lateral de conversas do agente (canal in_app).
 *
 * Design (ui-ux-pro-max):
 * - Layout 2 colunas: lista fixa à esquerda (w-72) + painel de chat ocupa o restante.
 * - Estado ativo: bg-violet-500/10 + borda esquerda violet 2px — nav-state-active.
 * - Estado vazio: ícone + texto orientador — empty-states.
 * - Botão "Nova conversa": CTA único por tela — primary-action.
 * - Timestamps relativos (hoje, ontem, data) — visual-hierarchy.
 * - Truncation com ellipsis no título — truncation-strategy.
 * - Touch targets ≥44px — touch-target-size.
 * - Keyboard focus-visible — focus-states.
 */

import { MessageSquare, Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: Date | string;
}

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading?: boolean;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  loading = false,
}: ConversationListProps) {
  return (
    <aside
      aria-label="Conversas"
      className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-background"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
        <button
          type="button"
          onClick={onNew}
          aria-label="Nova conversa"
          className={cn(
            "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors",
            "hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Lista */}
      <nav
        aria-label="Lista de conversas"
        className="flex-1 overflow-y-auto py-2"
      >
        {loading ? (
          <div className="space-y-1 px-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-muted"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <MessageSquare
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              Nenhuma conversa ainda.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Clique em{" "}
              <span className="font-semibold text-violet-600 dark:text-violet-400">
                +
              </span>{" "}
              para começar.
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5 px-2">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const title = conv.title ?? "Nova conversa";
              const ts = formatRelativeDate(new Date(conv.updatedAt));
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "border-l-2 border-violet-500 bg-violet-500/10 pl-[10px] text-violet-700 dark:text-violet-300"
                        : "border-l-2 border-transparent text-foreground hover:bg-muted/50",
                      "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
                      "min-h-[44px]",
                    )}
                  >
                    <span className="truncate text-sm font-medium leading-snug">
                      {title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {ts}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (days === 1) return "Ontem";
  if (days < 7) {
    return date.toLocaleDateString("pt-BR", { weekday: "long" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
