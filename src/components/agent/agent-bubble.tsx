"use client";

/**
 * AgentBubble , FAB flutuante que abre o chat do agente.
 *
 * Portado de nexus-insights/src/components/nex/nex-bubble.tsx.
 * Adaptações:
 * - Renomeação nex→agent; NexBubble→AgentBubble; NexChatPanel→ChatPanel.
 * - aria-label: "Abrir o Agente" (genérico, sem nome próprio Nex).
 *
 * Posição: fixed bottom-6 right-6 (com offset no mobile para não brigar com gesture bar).
 * Tamanho 56px , acima do mínimo 44pt de touch.
 * Animação de "respiração" do glow respeita prefers-reduced-motion.
 *
 * Rework F5-UI: ao abrir o painel, o FAB some (fade/scale); ao fechar, volta.
 * Economiza tela e evita o FAB sobreposto ao painel.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §7
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/agent/chat-panel";

interface AgentBubbleProps {
  /**
   * Quando true, o painel libera o botão de gravação de áudio.
   * Resolvido pelo layout protegido com base no toggle do Prompt config + provider ativo.
   */
  audioInputEnabled?: boolean;
  /**
   * Quando true, o painel libera o anexo (clip). Resolvido pelo layout com base
   * no checkpoint de imagem: só PRODUÇÃO libera na bubble.
   */
  imageInputEnabled?: boolean;
  /**
   * Limite de sugestões clicáveis (welcome + follow-up) configurado pelo
   * super_admin em /agente/comportamento. Default 3, hard cap 5.
   */
  maxSuggestions?: number;
  /**
   * Sugestões iniciais personalizadas para o usuário logado (computadas no
   * server a partir do histórico de uso de tools). Vazio = usuário novo ou
   * erro; o ChatPanel cai no catálogo curado neste caso.
   */
  personalizedWelcome?: string[];
}

export function AgentBubble({
  audioInputEnabled = false,
  imageInputEnabled = false,
  maxSuggestions = 3,
  personalizedWelcome = [],
}: AgentBubbleProps = {}) {
  const [open, setOpen] = React.useState(false);
  // O conversationId vive AQUI (no FAB), e não no ChatPanel: assim ele
  // sobrevive ao unmount do painel quando o usuário fecha a bubble pelo "X" e
  // o histórico é restaurado na próxima abertura. Só zera ao "Encerrar sessão".
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );
  const reduceMotion = useReducedMotion();

  return (
    <>
      {/* FAB , visível só com o painel fechado. Some/volta com animação. */}
      <AnimatePresence>
        {!open ? (
          <motion.div
            key="agent-fab"
            className={cn(
              "fixed right-6 bottom-6 z-50",
              "max-sm:right-4 max-sm:bottom-5",
            )}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.85, y: 8 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.12 } }
                : {
                    opacity: 0,
                    scale: 0.7,
                    transition: { duration: 0.16, ease: "easeIn" },
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 280, damping: 22 }
            }
          >
            <motion.button
              type="button"
              aria-label="Abrir o Agente"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              whileHover={reduceMotion ? undefined : { scale: 1.06 }}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              className={cn(
                "group relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full",
                "bg-gradient-to-br from-violet-600 to-violet-500",
                "text-white shadow-lg shadow-violet-600/40",
                "ring-1 ring-white/15 ring-inset",
                "outline-none transition-shadow duration-200",
                "hover:shadow-xl hover:shadow-violet-600/50",
                "focus-visible:ring-3 focus-visible:ring-violet-400/60",
              )}
            >
              {/* Glow externo pulsante sutil */}
              {!reduceMotion ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full bg-violet-500/40 blur-xl"
                  initial={{ opacity: 0.35, scale: 0.95 }}
                  animate={{
                    opacity: [0.25, 0.55, 0.25],
                    scale: [0.95, 1.1, 0.95],
                  }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ) : null}

              <Sparkles className="relative z-10 h-6 w-6" strokeWidth={2.25} />

              {/* Indicador "online" */}
              <span
                aria-hidden
                className="absolute right-0 bottom-0 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-background"
              />
            </motion.button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <ChatPanel
            open={open}
            onClose={() => setOpen(false)}
            audioInputEnabled={audioInputEnabled}
            imageInputEnabled={imageInputEnabled}
            maxSuggestions={maxSuggestions}
            personalizedWelcome={personalizedWelcome}
            conversationId={conversationId}
            onConversationCreated={setConversationId}
            onEndSession={() => {
              setConversationId(null);
              setOpen(false);
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
