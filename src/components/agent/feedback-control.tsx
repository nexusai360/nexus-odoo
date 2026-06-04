"use client";

/**
 * B1. Controle de feedback do usuário na resposta da IA (hover-only, desktop).
 *
 * Gatilho `Gauge` no canto inferior direito da bolha (espelha o botão copiar do
 * canto superior direito). Clique abre a paleta (direita->esquerda) com as 4
 * classificações; a escolhida fixa como badge sólido. Parcial/Errado/Alucinou
 * abrem um campo de comentário (sanfona, <=100 chars). O voto é otimista: quem
 * persiste é o chat-panel via `onSubmit`. Design validado em feedback-v4.html.
 */

import * as React from "react";
import { Gauge, Check, X, Contrast, Ghost, Send } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export type FeedbackRating = "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU";

type Opt = {
  rating: FeedbackRating;
  label: string;
  Icon: React.ElementType;
  color: string;
  field: boolean;
  orient?: string;
  ph?: string;
};

// Ordem DOM: Alucinou ... Correto. Correto fica colado no gatilho (à direita).
const OPTS: Opt[] = [
  {
    rating: "ALUCINOU",
    label: "Alucinou",
    Icon: Ghost,
    color: "#8b5cf6",
    field: true,
    orient: "o que aconteceu? Descreva em detalhes.",
    ph: "Ex: citou um modelo que não existe no catálogo.",
  },
  {
    rating: "ERRADO",
    label: "Errado",
    Icon: X,
    color: "#ef4444",
    field: true,
    orient: "o que saiu errado e qual era a resposta certa.",
    ph: "Ex: o saldo certo era 8 unidades, não 12.",
  },
  {
    rating: "PARCIAL",
    label: "Parcial",
    Icon: Contrast,
    color: "#f59e0b",
    field: true,
    orient: "o que acertou, o que errou e qual era a resposta certa.",
    ph: "Ex: acertou o total, mas não listou os negativos.",
  },
  { rating: "CORRETO", label: "Correto", Icon: Check, color: "#10b981", field: false },
];

const byRating = (r: FeedbackRating) => OPTS.find((o) => o.rating === r)!;

export interface FeedbackControlProps {
  current: { rating: FeedbackRating; comment: string | null } | null;
  onSubmit: (rating: FeedbackRating, comment?: string) => Promise<void> | void;
}

export function FeedbackControl({ current, onSubmit }: FeedbackControlProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState<FeedbackRating | null>(current?.rating ?? null);
  const [fieldFor, setFieldFor] = React.useState<FeedbackRating | null>(null);
  const [text, setText] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => setChosen(current?.rating ?? null), [current?.rating]);

  // Click-away: fecha paleta e campo.
  React.useEffect(() => {
    if (!open && !fieldFor) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFieldFor(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, fieldFor]);

  function pick(r: FeedbackRating) {
    setChosen(r);
    setOpen(false);
    void onSubmit(r); // voto otimista, sem comentário
    const opt = byRating(r);
    if (opt.field) {
      setText("");
      setFieldFor(r);
      setTimeout(() => taRef.current?.focus(), 180);
    } else {
      setFieldFor(null);
    }
  }

  function send() {
    if (fieldFor) void onSubmit(fieldFor, text.trim() || undefined);
    setFieldFor(null);
  }

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "30px";
    el.style.height = Math.min(el.scrollHeight, 46) + "px";
  }

  const chosenOpt = chosen ? byRating(chosen) : null;
  const fieldOpt = fieldFor ? byRating(fieldFor) : null;

  return (
    <div ref={rootRef}>
      {/* gatilho (sem voto) ou badge (com voto), canto inferior direito */}
      {!chosenOpt ? (
        <button
          type="button"
          aria-label="Avaliar resposta"
          onClick={() => setOpen((v) => !v)}
          className="absolute -right-2 -bottom-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/msg:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Gauge className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Avaliação: ${chosenOpt.label}. Clique para alterar.`}
          onClick={() => setOpen((v) => !v)}
          style={{ background: chosenOpt.color, borderColor: chosenOpt.color }}
          className="absolute -right-2 -bottom-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border text-white shadow-sm"
        >
          <chosenOpt.Icon className="h-3 w-3" />
        </button>
      )}

      {/* paleta flutuante */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, x: 8, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute -bottom-2.5 right-5 z-10 flex items-center gap-0.5 rounded-[10px] border border-border bg-popover p-1 shadow-xl"
          >
            {OPTS.map((o, i) => (
              <Tooltip key={o.rating}>
                <TooltipTrigger
                  render={
                    <motion.button
                      type="button"
                      aria-label={o.label}
                      onClick={() => pick(o.rating)}
                      initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: (OPTS.length - 1 - i) * 0.04 }}
                      style={{ color: o.color }}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-transparent transition-transform hover:scale-110"
                    />
                  }
                >
                  <o.Icon className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>{o.label}</TooltipContent>
              </Tooltip>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* campo de comentário (sanfona) */}
      <AnimatePresence>
        {fieldOpt && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 overflow-hidden border-t border-border pt-2"
          >
            <div className="mb-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <span
                style={{ background: fieldOpt.color }}
                className="mt-px flex h-4 w-4 items-center justify-center rounded text-white"
              >
                <fieldOpt.Icon className="h-2.5 w-2.5" />
              </span>
              <span className="flex-1">
                <b style={{ color: fieldOpt.color }}>{fieldOpt.label}:</b> {fieldOpt.orient}
              </span>
              <button
                type="button"
                aria-label="Fechar comentário"
                onClick={() => setFieldFor(null)}
                className="rounded p-0.5 hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-end gap-1.5">
              <textarea
                ref={taRef}
                value={text}
                maxLength={100}
                rows={1}
                placeholder={fieldOpt.ph}
                onChange={(e) => {
                  setText(e.target.value);
                  autosize(e.target);
                }}
                className="h-[30px] max-h-[46px] flex-1 resize-none rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-violet-500"
              />
              <button
                type="button"
                aria-label="Enviar"
                onClick={send}
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1 pr-9 text-right text-[9px] tabular-nums text-muted-foreground/70">
              {text.length}/100
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
