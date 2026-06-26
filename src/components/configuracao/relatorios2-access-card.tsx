"use client";

// src/components/configuracao/relatorios2-access-card.tsx
// Onda 4 (v2) , Bloco "Relatorios 2.0" na tela de Configuracao, no MESMO padrao
// visual do bloco "Intervalos de sincronizacao" (Card + CardHeader). O nivel do
// MENU vive no cabecalho (seletor a direita + descricao mutavel); os submenus
// (Paineis/Meus/Construtor) ficam no corpo, separados por divisorias e com bom
// respiro. Sem linha roxa. Submenus ficam cinza quando o menu esta desativado.
// Travas de coerencia aplicadas no servidor (Construtor puxa Paineis/Meus).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LayoutDashboard, LayoutGrid, FileText, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
      setAcesso(r.acesso);
      toast.success("Acesso do Relatorios 2.0 atualizado.");
      router.refresh();
    });
  }

  return (
    <Card>
      {/* Cabecalho = nivel do MENU (igual ao bloco de sincronizacao) */}
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-violet-500" aria-hidden />
            {RELATORIOS2_MENU.label}
          </CardTitle>
          <CardDescription>
            Quem vê o menu no sidebar. Desativado: some para todos, menos você (dono).
          </CardDescription>
        </div>
        <Seletor
          value={acesso.menu}
          onChange={(v) => salvar({ ...acesso, menu: v }, "menu")}
          loading={pending === "menu"}
        />
      </CardHeader>

      {/* Submenus, separados por divisoria e com respiro */}
      <CardContent
        className={cn(
          "divide-y divide-border border-t border-border pt-2 transition-opacity",
          menuOff && "pointer-events-none opacity-45",
        )}
        aria-disabled={menuOff}
      >
        <SubmenuRow
          icon={<LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden />}
          title={RELATORIOS2_SUBMENUS[0].label}
          helper="Tela de painéis (dashboards e widgets)."
          value={acesso.paineis}
          onChange={(v) => salvar({ ...acesso, paineis: v }, "paineis")}
          loading={pending === "paineis"}
          disabled={menuOff}
        />
        <SubmenuRow
          icon={<FileText className="h-4 w-4 text-muted-foreground" aria-hidden />}
          title={RELATORIOS2_SUBMENUS[1].label}
          helper="Relatórios que o usuário montou no construtor."
          value={acesso.meus}
          onChange={(v) => salvar({ ...acesso, meus: v }, "meus")}
          loading={pending === "meus"}
          disabled={menuOff}
        />
        <SubmenuRow
          icon={<Wrench className="h-4 w-4 text-muted-foreground" aria-hidden />}
          title={RELATORIOS2_SUBMENUS[2].label}
          helper="Construtor de relatórios. Quem constrói precisa ver Painéis e Meus (puxa o nível)."
          value={acesso.construtor}
          onChange={(v) => salvar({ ...acesso, construtor: v }, "construtor")}
          loading={pending === "construtor"}
          disabled={menuOff}
        />
      </CardContent>
    </Card>
  );
}

function Seletor({
  value,
  onChange,
  loading,
  disabled,
}: {
  value: ChannelAccessLevel;
  onChange: (v: ChannelAccessLevel) => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
      <div className="flex items-center gap-2 overflow-x-auto">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Salvando" />
        ) : null}
        <SegmentedControl<ChannelAccessLevel>
          value={value}
          onChange={onChange}
          options={LEVEL_OPTIONS}
          disabled={disabled || loading}
          mutedValue="off"
          aria-label="Nível de acesso"
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
  );
}

interface SubmenuRowProps {
  icon: React.ReactNode;
  title: string;
  helper: string;
  value: ChannelAccessLevel;
  onChange: (v: ChannelAccessLevel) => void;
  loading: boolean;
  disabled?: boolean;
}

function SubmenuRow({ icon, title, helper, value, onChange, loading, disabled }: SubmenuRowProps) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {title}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
      </div>
      <Seletor value={value} onChange={onChange} loading={loading} disabled={disabled} />
    </div>
  );
}
