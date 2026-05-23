"use client";

/**
 * AgentAvailabilityCard, secao no topo da configuracao do Agente Nex que
 * controla a disponibilidade por canal (bubble in-app e WhatsApp), de forma
 * independente. Substitui o toggle binario antigo "Agente Nex ativo".
 *
 * Combinacoes possiveis e sumario textual:
 *   bubble + whatsapp -> "Ativo no chat in-app e no WhatsApp"
 *   bubble apenas     -> "Ativo apenas no chat in-app"
 *   whatsapp apenas   -> "Ativo apenas no WhatsApp"
 *   nenhum            -> "Desativado em todos os canais"
 *
 * Persistencia via updateAgentAvailability (server action).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, MessageCircle, Smartphone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { updateAgentAvailability } from "@/lib/actions/agent-config";
import { summarizeAvailability } from "./agent-availability-summary";
import { cn } from "@/lib/utils";

export { summarizeAvailability };

interface Props {
  initial: {
    bubbleEnabled: boolean;
    whatsappEnabled: boolean;
  };
  /** Quando false (sem conexao LLM ativa), os dois toggles ficam desabilitados. */
  isConfigured: boolean;
}

export function AgentAvailabilityCard({ initial, isConfigured }: Props) {
  const router = useRouter();
  const [bubble, setBubble] = useState(initial.bubbleEnabled);
  const [whatsapp, setWhatsapp] = useState(initial.whatsappEnabled);
  const [pending, setPending] = useState<"bubble" | "whatsapp" | null>(null);
  const [, startTransition] = useTransition();

  const summary = summarizeAvailability(bubble, whatsapp);

  function persist(next: { bubbleEnabled: boolean; whatsappEnabled: boolean }) {
    startTransition(async () => {
      const result = await updateAgentAvailability(next);
      setPending(null);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao atualizar disponibilidade.");
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function onBubble(v: boolean) {
    if (!isConfigured && v) {
      toast.error("Configure um provedor antes de ativar o Agente Nex.");
      return;
    }
    setPending("bubble");
    setBubble(v);
    persist({ bubbleEnabled: v, whatsappEnabled: whatsapp });
  }

  function onWhatsapp(v: boolean) {
    if (!isConfigured && v) {
      toast.error("Configure um provedor antes de ativar o Agente Nex.");
      return;
    }
    setPending("whatsapp");
    setWhatsapp(v);
    persist({ bubbleEnabled: bubble, whatsappEnabled: v });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
            summary.tone === "active" &&
              "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
            summary.tone === "partial" &&
              "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            summary.tone === "off" && "bg-muted text-muted-foreground",
          )}
        >
          <Bot className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{summary.title}</p>
          <p className="text-xs text-muted-foreground">{summary.helper}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Row
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
          title="Bubble no app"
          helper="Mostra a bolha flutuante do Agente Nex nas paginas autenticadas."
          checked={bubble}
          onChange={onBubble}
          loading={pending === "bubble"}
          disabled={!isConfigured}
        />
        <Row
          icon={<Smartphone className="h-4 w-4" aria-hidden />}
          title="WhatsApp"
          helper="Permite que o agente responda mensagens recebidas pelo webhook de WhatsApp (F5)."
          checked={whatsapp}
          onChange={onWhatsapp}
          loading={pending === "whatsapp"}
          disabled={!isConfigured}
          footnote="Webhook do WhatsApp entra com a F5. A preferencia ja fica salva."
        />
      </div>
    </div>
  );
}

interface RowProps {
  icon: React.ReactNode;
  title: string;
  helper: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  loading: boolean;
  disabled?: boolean;
  footnote?: string;
}

function Row({
  icon,
  title,
  helper,
  checked,
  onChange,
  loading,
  disabled,
  footnote,
}: RowProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            {icon}
            {title}
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={loading || disabled}
          aria-label={title}
        />
      </div>
      {footnote ? (
        <p className="mt-2 text-[11px] text-muted-foreground/80">{footnote}</p>
      ) : null}
    </div>
  );
}
