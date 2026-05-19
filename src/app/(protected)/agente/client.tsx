"use client";

/**
 * AgentPageClient — parte interativa da página /agente.
 *
 * Layout 2 colunas (≥768px): lista fixa à esquerda + ChatPanel full-width à direita.
 * Mobile: apenas o painel de chat (lista acessível via botão "Conversas").
 *
 * Fluxo:
 * - Selecionar conversa da lista → carrega o chat com esse conversationId.
 * - "Nova conversa" → limpa o conversationId; o ChatPanel criará uma nova no primeiro envio.
 * - Quando ChatPanel cria uma conversa nova, atualiza a lista local.
 */

import * as React from "react";
import { ConversationList } from "@/components/agent/conversation-list";
import { ChatPanel } from "@/components/agent/chat-panel";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface AgentPageClientProps {
  initialConversations: ConversationSummary[];
  audioInputEnabled: boolean;
  userId: string;
}

export function AgentPageClient({
  initialConversations,
  audioInputEnabled,
}: AgentPageClientProps) {
  const [conversations, setConversations] =
    React.useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Mobile: mostra lista ou chat
  const [mobilePanelOpen, setMobilePanelOpen] = React.useState(false);

  function handleSelect(id: string) {
    setActiveId(id);
    setMobilePanelOpen(true);
  }

  function handleNew() {
    setActiveId(null);
    setMobilePanelOpen(true);
  }

  function handleConversationCreated(id: string) {
    // Quando o ChatPanel cria uma nova conversa, adiciona na lista.
    setActiveId(id);
    setConversations((prev) => {
      if (prev.some((c) => c.id === id)) return prev;
      return [
        { id, title: "Nova conversa", updatedAt: new Date().toISOString() },
        ...prev,
      ];
    });
  }

  return (
    <div className="flex h-[calc(100vh-0px)] w-full overflow-hidden">
      {/* ---------------------------------------------------------------- */}
      {/* Lista de conversas — visível em md+ ou quando chat está fechado  */}
      {/* ---------------------------------------------------------------- */}
      <div
        className={cn(
          // Mobile: mostra só lista quando painel fechado
          "flex-shrink-0",
          mobilePanelOpen ? "hidden md:flex" : "flex",
          "h-full",
        )}
      >
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Painel de chat em tela cheia                                      */}
      {/* ---------------------------------------------------------------- */}
      <div
        className={cn(
          "flex flex-1 flex-col h-full overflow-hidden",
          !mobilePanelOpen && "hidden md:flex",
        )}
      >
        {/* Botão voltar para lista — mobile only */}
        {mobilePanelOpen && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobilePanelOpen(false)}
              aria-label="Voltar para lista de conversas"
              className={cn(
                "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-foreground">Agente</span>
          </div>
        )}

        {/* ChatPanel embutido (sem frame flutuante) */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <EmbeddedChat
            conversationId={activeId}
            audioInputEnabled={audioInputEnabled}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EmbeddedChat — wrapper para ChatPanel em modo tela-cheia                    */
/* -------------------------------------------------------------------------- */

/**
 * O ChatPanel foi projetado para o modo bubble (floating, com open/onClose).
 * Em modo embedded, mantemos open=true e onClose vazia — o layout da página
 * controla a visibilidade.
 */
function EmbeddedChat({
  conversationId,
  audioInputEnabled,
  onConversationCreated,
}: {
  conversationId: string | null;
  audioInputEnabled: boolean;
  onConversationCreated: (id: string) => void;
}) {
  return (
    <ChatPanel
      open={true}
      onClose={() => {}}
      audioInputEnabled={audioInputEnabled}
      conversationId={conversationId ?? undefined}
      onConversationCreated={onConversationCreated}
      embedded={true}
    />
  );
}
