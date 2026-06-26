"use client";

// src/components/configuracao/relatorios2-access-card.tsx
// Onda 4 , Bloco "Relatorios 2.0" na tela de Configuracao: define quem acessa o
// menu e cada submenu (Paineis/Meus/Construtor). Padrao do bloco de
// Disponibilidade do Nex (SegmentedControl + descricao mutavel), porem com o
// seletor a DIREITA e a descricao abaixo dele. Submenus ficam cinza quando o
// menu esta desativado. Travas de coerencia aplicadas no servidor (o Construtor
// puxa Paineis/Meus); a UI reflete o acesso normalizado retornado.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LayoutDashboard, LayoutGrid, FileText, Wrench } from "lucide-react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  channelLevelOptions,
  channelLevelDescription,
} from "@/lib/agent/channel-level-options";
import { salvarAcessoRelatorios2 } from "@/lib/actions/relatorios2-acesso";
import { RELATORIOS2_MENU, RELATORIOS2_SUBMENUS } from "@/lib/constants/relatorios2";
import type { AcessoRelatorios2 } from "@/lib/reports/acesso-relatorios2";
import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const LEVEL_OPTIONS = channelLevelOptions();

export function Relatorios2AccessCard({ initial }: { initial: AcessoRelatorios2 }) {
  const router = useRouter();
  const [acesso, setAcesso] = useState<AcessoRelatorios2>(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const menuOff = acesso.menu === "off";

  function salvar(next: AcessoRelatorios2, campo: string) {
    setPending(campo);
    setAcesso(next);
    startTransition(async () => {
      const r = await salvarAcessoRelatorios2(next);
      setPending(null);
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao salvar o acesso.");
        router.refresh();
        return;
      }
      // Reflete o acesso normalizado (travas do Construtor).
      setAcesso(r.acesso);
      toast.success("Acesso do Relatorios 2.0 atualizado.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <Row
        icon={<LayoutDashboard className="h-4 w-4 text-violet-500" aria-hidden />}
        title={RELATORIOS2_MENU.label}
        helper="Quem ve o menu Relatorios 2.0 no sidebar. Desativado: some para todos, menos voce (dono)."
        value={acesso.menu}
        onChange={(v) => salvar({ ...acesso, menu: v }, "menu")}
        loading={pending === "menu"}
        destaque
      />

      <div
        className={cn(
          "mt-3 space-y-3 border-l-2 border-violet-500/20 pl-3 transition-opacity",
          menuOff && "pointer-events-none opacity-45",
        )}
        aria-disabled={menuOff}
      >
        <Row
          icon={<LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden />}
          title={RELATORIOS2_SUBMENUS[0].label}
          helper="Tela de paineis (dashboards e widgets)."
          value={acesso.paineis}
          onChange={(v) => salvar({ ...acesso, paineis: v }, "paineis")}
          loading={pending === "paineis"}
          disabled={menuOff}
        />
        <Row
          icon={<FileText className="h-4 w-4 text-muted-foreground" aria-hidden />}
          title={RELATORIOS2_SUBMENUS[1].label}
          helper="Relatorios que o usuario montou no construtor."
          value={acesso.meus}
          onChange={(v) => salvar({ ...acesso, meus: v }, "meus")}
          loading={pending === "meus"}
          disabled={menuOff}
        />
        <Row
          icon={<Wrench className="h-4 w-4 text-muted-foreground" aria-hidden />}
          title={RELATORIOS2_SUBMENUS[2].label}
          helper="Construtor de relatorios. Quem constroi precisa ver Paineis e Meus (puxa o nivel)."
          value={acesso.construtor}
          onChange={(v) => salvar({ ...acesso, construtor: v }, "construtor")}
          loading={pending === "construtor"}
          disabled={menuOff}
        />
      </div>
    </div>
  );
}

interface RowProps {
  icon: React.ReactNode;
  title: string;
  helper: string;
  value: ChannelAccessLevel;
  onChange: (v: ChannelAccessLevel) => void;
  loading: boolean;
  disabled?: boolean;
  destaque?: boolean;
}

function Row({ icon, title, helper, value, onChange, loading, disabled, destaque }: RowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        destaque && "rounded-lg border border-border/60 bg-background/40 p-3",
      )}
    >
      {/* Esquerda: icone + titulo + descricao */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {title}
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Salvando" />
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
      </div>

      {/* Direita: seletor + descricao mutavel abaixo */}
      <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
        <div className="overflow-x-auto">
          <SegmentedControl<ChannelAccessLevel>
            value={value}
            onChange={onChange}
            options={LEVEL_OPTIONS}
            disabled={disabled || loading}
            mutedValue="off"
            aria-label={`Nivel de acesso , ${title}`}
          />
        </div>
        <p
          className={cn(
            "text-xs sm:text-right",
            value === "off" ? "text-muted-foreground/70" : "text-muted-foreground",
          )}
        >
          {channelLevelDescription(value)}
        </p>
      </div>
    </div>
  );
}
