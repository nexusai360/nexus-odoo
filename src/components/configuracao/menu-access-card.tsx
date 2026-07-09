"use client";

// src/components/configuracao/menu-access-card.tsx
// Feature "Acesso aos menus": card na tela Configuracao (super_admin) que define,
// POR PERFIL, quem ve cada menu do sidebar. Padrao visual = SegmentedControl do
// Agente Nex / Relatorios 2.0. Menus agrupados por secao (Comum / Administracao).
// Otimista + toast; a Configuracao e TRAVADA em Super Admin (seletor desabilitado,
// com selo e explicacao , a tela so tem acoes de super_admin).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FileText,
  LayoutGrid,
  Sparkles,
  Users,
  Plug,
  Settings,
  Lock,
} from "lucide-react";
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
import { salvarMenuAccess } from "@/lib/actions/menu-acesso";
import { MENU_CATALOG, type MenuKey, type MenuAccessMap } from "@/lib/nav/menu-catalog";
import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const LEVEL_OPTIONS = channelLevelOptions();

const ICONS: Record<MenuKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  diretoria: Building2,
  relatorios: FileText,
  relatorios2: LayoutGrid,
  agente: Sparkles,
  usuarios: Users,
  integracoes: Plug,
  configuracao: Settings,
};

function iconeClasse(value: ChannelAccessLevel): string {
  return value === "off" ? "text-muted-foreground/50" : "text-violet-500";
}

export function MenuAccessCard({ initial }: { initial: MenuAccessMap }) {
  const router = useRouter();
  const [acesso, setAcesso] = useState<MenuAccessMap>(initial);
  const [, startTransition] = useTransition();

  function salvar(menuKey: MenuKey, level: ChannelAccessLevel) {
    const anterior = acesso;
    setAcesso({ ...acesso, [menuKey]: level });
    startTransition(async () => {
      const r = await salvarMenuAccess(menuKey, level);
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao salvar o acesso.");
        setAcesso(anterior);
        router.refresh();
        return;
      }
      // o backend é a autoridade do nível efetivo (menu travado fica em super_admin)
      const efetivo = r.level ?? level;
      setAcesso((a) => ({ ...a, [menuKey]: efetivo }));
      if (efetivo !== level) {
        toast.info("Configuração é protegida: só o Super Admin acessa.");
      } else {
        toast.success("Acesso atualizado.");
      }
      router.refresh();
    });
  }

  const comuns = MENU_CATALOG.filter((e) => e.secao === "comum");
  const admin = MENU_CATALOG.filter((e) => e.secao === "administracao");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-violet-500" aria-hidden />
          Acesso aos menus
        </CardTitle>
        <CardDescription>
          Defina, por perfil, quem vê cada menu no sidebar. O nível é por herança
          (quanto menor a exigência, mais perfis acessam). Desativado esconde de todos,
          menos do Super Admin.
        </CardDescription>
      </CardHeader>

      <CardContent className="border-t border-border pt-2">
        <Grupo titulo="Comum">
          {comuns.map((e) => (
            <MenuRow
              key={e.key}
              menuKey={e.key}
              label={e.label}
              value={acesso[e.key]}
              onChange={(v) => salvar(e.key, v)}
            />
          ))}
        </Grupo>
        <Grupo titulo="Administração">
          {admin.map((e) => (
            <MenuRow
              key={e.key}
              menuKey={e.key}
              label={e.label}
              value={acesso[e.key]}
              travado={e.travadoSuperAdmin}
              onChange={(v) => salvar(e.key, v)}
            />
          ))}
        </Grupo>
      </CardContent>
    </Card>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="px-0.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function MenuRow({
  menuKey,
  label,
  value,
  travado,
  onChange,
}: {
  menuKey: MenuKey;
  label: string;
  value: ChannelAccessLevel;
  travado?: boolean;
  onChange: (v: ChannelAccessLevel) => void;
}) {
  const Icon = ICONS[menuKey];
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className={cn("h-4 w-4", iconeClasse(value))} aria-hidden />
          {label}
          {travado ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden /> Fixo em Super Admin
            </span>
          ) : null}
        </div>
        {travado ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Esta tela só tem ações de Super Admin, então o acesso a ela não muda. É o que
            garante que você nunca se tranque para fora da configuração.
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
        <div className="overflow-x-auto">
          <SegmentedControl<ChannelAccessLevel>
            value={value}
            onChange={onChange}
            options={LEVEL_OPTIONS}
            disabled={travado}
            mutedValue="off"
            aria-label={`Nível de acesso , ${label}`}
          />
        </div>
        {travado ? null : (
          <p
            className={cn(
              "text-xs sm:text-right",
              value === "off" ? "text-muted-foreground/70" : "text-muted-foreground",
            )}
          >
            {channelLevelDescription(value)}
          </p>
        )}
      </div>
    </div>
  );
}
