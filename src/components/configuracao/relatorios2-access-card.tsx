"use client";

// src/components/configuracao/relatorios2-access-card.tsx
// Onda 4 (v3) , Bloco "Relatorios 2.0" na tela de Configuracao, no padrao do
// bloco "Intervalos de sincronizacao". Nivel do MENU no cabecalho (seletor a
// direita + descricao mutavel); submenus no corpo, separados e com respiro.
// Sem spinner (otimista + toast). Icone acende (violeta) quando != off, cinza
// quando off. Trava: Construtor puxa SOMENTE Meus (servidor); toast avisa.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LayoutGrid, FileText, Wrench } from "lucide-react";
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

function iconeClasse(value: ChannelAccessLevel): string {
  return value === "off" ? "text-muted-foreground/50" : "text-violet-500";
}

export function Relatorios2AccessCard({ initial }: { initial: AcessoRelatorios2 }) {
  const router = useRouter();
  const [acesso, setAcesso] = useState<AcessoRelatorios2>(initial);
  const [, startTransition] = useTransition();

  const menuOff = acesso.menu === "off";

  function salvar(next: AcessoRelatorios2, campo: keyof AcessoRelatorios2) {
    setAcesso(next);
    startTransition(async () => {
      const r = await salvarAcessoRelatorios2(next);
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao salvar o acesso.");
        setAcesso(initial);
        router.refresh();
        return;
      }
      setAcesso(r.acesso);
      if (r.acesso[campo] !== next[campo]) {
        toast.info(
          "Meus relatórios acompanha o Construtor: precisa ter no mínimo o mesmo acesso.",
        );
      } else {
        toast.success("Acesso atualizado.");
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <LayoutDashboard className={cn("h-4 w-4", iconeClasse(acesso.menu))} aria-hidden />
            {RELATORIOS2_MENU.label}
          </CardTitle>
          <CardDescription>
            Quem vê o menu no sidebar. Desativado: some para todos, menos você (dono).
          </CardDescription>
        </div>
        <Seletor value={acesso.menu} onChange={(v) => salvar({ ...acesso, menu: v }, "menu")} />
      </CardHeader>

      <CardContent
        className={cn(
          "divide-y divide-border border-t border-border pt-2 transition-opacity",
          menuOff && "pointer-events-none opacity-45",
        )}
        aria-disabled={menuOff}
      >
        <SubmenuRow
          icon={<LayoutGrid className={cn("h-4 w-4", iconeClasse(acesso.paineis))} aria-hidden />}
          title={RELATORIOS2_SUBMENUS[0].label}
          helper="Tela de painéis (dashboards e widgets)."
          value={acesso.paineis}
          onChange={(v) => salvar({ ...acesso, paineis: v }, "paineis")}
          disabled={menuOff}
        />
        <SubmenuRow
          icon={<FileText className={cn("h-4 w-4", iconeClasse(acesso.meus))} aria-hidden />}
          title={RELATORIOS2_SUBMENUS[1].label}
          helper="Relatórios que o usuário montou no construtor. Acompanha o Construtor."
          value={acesso.meus}
          onChange={(v) => salvar({ ...acesso, meus: v }, "meus")}
          disabled={menuOff}
        />
        <SubmenuRow
          icon={<Wrench className={cn("h-4 w-4", iconeClasse(acesso.construtor))} aria-hidden />}
          title={RELATORIOS2_SUBMENUS[2].label}
          helper="Construtor de relatórios. Quem constrói sempre enxerga Meus relatórios."
          value={acesso.construtor}
          onChange={(v) => salvar({ ...acesso, construtor: v }, "construtor")}
          disabled={menuOff}
        />
      </CardContent>
    </Card>
  );
}

function Seletor({
  value,
  onChange,
  disabled,
}: {
  value: ChannelAccessLevel;
  onChange: (v: ChannelAccessLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
      <div className="overflow-x-auto">
        <SegmentedControl<ChannelAccessLevel>
          value={value}
          onChange={onChange}
          options={LEVEL_OPTIONS}
          disabled={disabled}
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
  disabled?: boolean;
}

function SubmenuRow({ icon, title, helper, value, onChange, disabled }: SubmenuRowProps) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {title}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
      </div>
      <Seletor value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}
