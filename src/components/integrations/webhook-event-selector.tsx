"use client";

/**
 * Seletor de eventos de webhook de saída, em blocos colapsáveis por grupo
 * (estilo "categorias"): contador geral, "Selecionar todos", e por bloco um
 * checkbox de grupo (com estado parcial), ícone colorido, contador X/Y e
 * chevron. Lista só os eventos que a plataforma realmente emite (catálogo em
 * webhook-event-catalog.ts). ui-ux-pro-max: estado por fundo + peso, foco
 * visível, cor nunca como único indicador (há contador e texto), pt-br.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { WebhookEventName } from "@/lib/actions/webhooks";
import {
  WEBHOOK_EVENT_GROUPS,
  ALL_WEBHOOK_EVENT_VALUES,
  TOTAL_WEBHOOK_EVENTS,
} from "@/lib/whatsapp/webhook-event-catalog";

interface Props {
  value: WebhookEventName[];
  onChange: (value: WebhookEventName[]) => void;
  disabled?: boolean;
}

export function WebhookEventSelector({ value, onChange, disabled }: Props) {
  const selected = React.useMemo(() => new Set(value), [value]);
  const [open, setOpen] = React.useState<Set<string>>(
    () => new Set(WEBHOOK_EVENT_GROUPS.map((g) => g.id)),
  );

  function toggleEvent(ev: WebhookEventName) {
    const next = new Set(selected);
    if (next.has(ev)) next.delete(ev);
    else next.add(ev);
    onChange([...next]);
  }

  function toggleGroup(groupId: string) {
    const group = WEBHOOK_EVENT_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const ids = group.events.map((e) => e.value);
    const allOn = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allOn) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    onChange([...next]);
  }

  function toggleOpen(groupId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function selectAll() {
    if (value.length === TOTAL_WEBHOOK_EVENTS) onChange([]);
    else onChange([...ALL_WEBHOOK_EVENT_VALUES]);
  }

  const allSelected = value.length === TOTAL_WEBHOOK_EVENTS && TOTAL_WEBHOOK_EVENTS > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={value.length > 0 ? "default" : "secondary"} className="tabular-nums">
          {value.length}/{TOTAL_WEBHOOK_EVENTS} eventos
        </Badge>
        <button
          type="button"
          onClick={selectAll}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {allSelected ? (
            <>
              <Square className="h-3.5 w-3.5" aria-hidden />
              Desmarcar todos
            </>
          ) : (
            <>
              <CheckSquare className="h-3.5 w-3.5" aria-hidden />
              Selecionar todos
            </>
          )}
        </button>
      </div>

      <div className="space-y-2">
        {WEBHOOK_EVENT_GROUPS.map((group) => {
          const ids = group.events.map((e) => e.value);
          const selectedCount = ids.filter((id) => selected.has(id)).length;
          const total = ids.length;
          const allOn = selectedCount === total && total > 0;
          const partial = selectedCount > 0 && !allOn;
          const isActive = selectedCount > 0;
          const isOpen = open.has(group.id);
          const Icon = group.icon;

          return (
            <div
              key={group.id}
              className={cn(
                "overflow-hidden rounded-lg border transition-colors",
                isActive
                  ? `${group.accent.border} ${group.accent.bg}`
                  : "border-border/60 bg-card/40",
              )}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Checkbox
                  checked={allOn}
                  indeterminate={partial}
                  onCheckedChange={() => toggleGroup(group.id)}
                  disabled={disabled}
                  aria-label={`Selecionar todos de ${group.label}`}
                />
                <button
                  type="button"
                  onClick={() => toggleOpen(group.id)}
                  aria-expanded={isOpen}
                  className="flex flex-1 items-center justify-between gap-2 text-left focus-visible:outline-none"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive ? group.accent.icon : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium text-foreground">{group.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {group.description}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant={selectedCount > 0 ? "default" : "outline"}
                      className="tabular-nums"
                    >
                      {selectedCount}/{total}
                    </Badge>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-muted-foreground"
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </motion.span>
                  </span>
                </button>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1 border-t border-border/40 px-3 py-2">
                      {group.events.map((ev) => (
                        <label
                          key={ev.value}
                          className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
                        >
                          <Checkbox
                            checked={selected.has(ev.value)}
                            onCheckedChange={() => toggleEvent(ev.value)}
                            disabled={disabled}
                            className="mt-0.5"
                            aria-label={ev.label}
                          />
                          <span className="flex flex-col">
                            <span className="text-sm text-foreground">{ev.label}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {ev.code}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
