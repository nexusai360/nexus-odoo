"use client";

/**
 * AgentAvailabilityCard, secao no topo da configuracao do Agente Nex que
 * controla o ACESSO por canal (bubble in-app e WhatsApp) e por NIVEL de perfil,
 * de forma independente. Cada canal tem um nivel minimo de acesso (com heranca):
 * "Desativado" bloqueia o canal; os demais niveis (Visualizador..Super Admin)
 * liberam quem tem role >= o escolhido.
 *
 * Sumario textual no topo reflete o estado combinado (ambos, so um, nenhum) e
 * o nivel minimo de cada canal. Persistencia via updateAgentAvailability.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Smartphone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "sonner";
import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { updateAgentAvailability } from "@/lib/actions/agent-config";
import {
  channelLevelOptions,
  channelLevelDescription,
} from "@/lib/agent/channel-level-options";
import { summarizeAvailability } from "./agent-availability-summary";
import { cn } from "@/lib/utils";

export { summarizeAvailability };

interface Props {
  initial: {
    bubbleAccessLevel: ChannelAccessLevel;
    whatsappAccessLevel: ChannelAccessLevel;
  };
  /** Quando false (sem conexao LLM ativa), os seletores ficam desabilitados. */
  isConfigured: boolean;
}

const LEVEL_OPTIONS = channelLevelOptions();

export function AgentAvailabilityCard({ initial, isConfigured }: Props) {
  const router = useRouter();
  const [bubble, setBubble] = useState<ChannelAccessLevel>(initial.bubbleAccessLevel);
  const [whatsapp, setWhatsapp] = useState<ChannelAccessLevel>(initial.whatsappAccessLevel);
  const [pending, setPending] = useState<"bubble" | "whatsapp" | null>(null);
  const [, startTransition] = useTransition();

  const summary = summarizeAvailability(bubble, whatsapp);

  function persist(next: {
    bubbleAccessLevel: ChannelAccessLevel;
    whatsappAccessLevel: ChannelAccessLevel;
  }) {
    startTransition(async () => {
      const result = await updateAgentAvailability(next);
      setPending(null);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao atualizar disponibilidade.");
      }
      router.refresh();
    });
  }

  function onBubble(v: ChannelAccessLevel) {
    if (!isConfigured && v !== "off") {
      toast.error("Configure um provedor antes de ativar o Agente Nex.");
      return;
    }
    setPending("bubble");
    setBubble(v);
    persist({ bubbleAccessLevel: v, whatsappAccessLevel: whatsapp });
  }

  function onWhatsapp(v: ChannelAccessLevel) {
    if (!isConfigured && v !== "off") {
      toast.error("Configure um provedor antes de ativar o Agente Nex.");
      return;
    }
    setPending("whatsapp");
    setWhatsapp(v);
    persist({ bubbleAccessLevel: bubble, whatsappAccessLevel: v });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className={cn(
            "inline-flex h-2 w-2 shrink-0 rounded-full",
            summary.tone === "active" &&
              "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]",
            summary.tone === "partial" &&
              "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.55)]",
            summary.tone === "off" && "bg-zinc-400 dark:bg-zinc-600",
          )}
        />
        <span className="font-medium text-foreground">{summary.title}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ChannelRow
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
          title="Bubble no app"
          helper="Quem ve a bolha flutuante nas paginas autenticadas."
          value={bubble}
          onChange={onBubble}
          loading={pending === "bubble"}
          disabled={!isConfigured}
        />
        <ChannelRow
          icon={<Smartphone className="h-4 w-4" aria-hidden />}
          title="WhatsApp"
          helper="Quem pode falar com o agente pelo WhatsApp (via webhook)."
          value={whatsapp}
          onChange={onWhatsapp}
          loading={pending === "whatsapp"}
          disabled={!isConfigured}
        />
      </div>
    </div>
  );
}

interface ChannelRowProps {
  icon: React.ReactNode;
  title: string;
  helper: string;
  value: ChannelAccessLevel;
  onChange: (v: ChannelAccessLevel) => void;
  loading: boolean;
  disabled?: boolean;
}

function ChannelRow({
  icon,
  title,
  helper,
  value,
  onChange,
  loading,
  disabled,
}: ChannelRowProps) {
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
        {loading ? (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
            aria-label="Salvando"
          />
        ) : null}
      </div>
      <div className="mt-3 overflow-x-auto">
        <SegmentedControl<ChannelAccessLevel>
          value={value}
          onChange={onChange}
          options={LEVEL_OPTIONS}
          disabled={disabled || loading}
          aria-label={`Nivel de acesso , ${title}`}
        />
      </div>
      <p
        className={cn(
          "mt-2 text-xs",
          value === "off" ? "text-muted-foreground/70" : "text-muted-foreground",
        )}
      >
        {channelLevelDescription(value)}
      </p>
    </div>
  );
}
