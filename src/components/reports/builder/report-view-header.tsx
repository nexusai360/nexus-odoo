// src/components/reports/builder/report-view-header.tsx
// F6 (P2) , Cabecalho da view de um relatorio salvo (/relatorios-2/d/<id>):
// titulo + quem criou (avatar/nome/email/tag de perfil) + quando atualizou.
// Presentational puro (sem estado), seguro em server component.
import { FileBarChart } from "lucide-react";
import type { PlatformRole } from "@/generated/prisma/client";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";

export interface ReportViewHeaderProps {
  titulo: string;
  atualizadoEm: Date;
  criador: {
    name: string;
    email: string;
    avatarUrl: string | null;
    platformRole: PlatformRole;
  } | null;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function dataBr(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportViewHeader({ titulo, atualizadoEm, criador }: ReportViewHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
          <FileBarChart className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {titulo}
          </h1>
          <p className="text-xs text-muted-foreground">
            Atualizado em {dataBr(atualizadoEm)}
          </p>
        </div>
      </div>

      {criador ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2">
          {criador.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={criador.avatarUrl}
              alt={criador.name}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-600 dark:text-violet-300">
              {iniciais(criador.name)}
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">
                {criador.name}
              </span>
              <span className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                {PLATFORM_ROLE_LABELS[criador.platformRole]}
              </span>
            </div>
            <span className="block truncate text-xs text-muted-foreground">
              {criador.email}
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
