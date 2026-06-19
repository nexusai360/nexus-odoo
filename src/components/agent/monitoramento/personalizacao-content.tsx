"use client";

/**
 * Auditoria read-only do perfil de interacao por usuario (super_admin).
 * Mostra SO derivados (assuntos, dominios, breakdown preferido, temas recorrentes) , sem PII.
 * Permite RESETAR um perfil (acao destrutiva reversivel, com confirmacao).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Sparkles, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { resetUserProfileAction, type UserProfileAuditRow } from "@/lib/actions/agent-user-profile";

function formatBrt(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground">,</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <Badge key={it} variant="secondary" className="font-normal">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function ProfileCard({ row }: { row: UserProfileAuditRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmReset() {
    startTransition(async () => {
      await resetUserProfileAction(row.userId);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-sm">{row.userName}</CardTitle>
          <p className="truncate text-xs text-muted-foreground">{row.userEmail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.quarantinedAt && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Em quarentena
            </Badge>
          )}
          <AlertDialog
            open={open}
            onOpenChange={(o) => {
              if (o) setOpen(true);
              else if (!pending) setOpen(false);
            }}
          >
            <AlertDialogTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  disabled={pending}
                  aria-label={`Resetar o perfil de ${row.userName}`}
                  title="Resetar o perfil aprendido deste usuario"
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  )}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resetar o perfil de {row.userName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso apaga o que o agente aprendeu deste usuario (assuntos, breakdown preferido,
                  temas recorrentes) e marca o perfil em quarentena. O perfil volta a ser construido
                  do zero na proxima rodada, a partir das conversas dele. Reversivel: nada de
                  conversa ou avaliacao e perdido.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer" disabled={pending}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  className="cursor-pointer"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmReset();
                  }}
                >
                  Resetar perfil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Campo label="Domínios preferidos">
          <ChipList items={row.preferredDomains} />
        </Campo>
        <Campo label="Assuntos recorrentes">
          <ChipList items={row.topTopics} />
        </Campo>
        <Campo label="Visão preferida">
          {row.breakdownPrefs.length === 0 ? (
            <span className="text-xs text-muted-foreground">, ainda sem padrão de visão</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {row.breakdownPrefs.map((b) => (
                <Badge key={b.familia} variant="secondary" className="font-normal">
                  {b.familia} por {b.breakdown}
                </Badge>
              ))}
            </div>
          )}
        </Campo>
        <Campo label="Perguntas recorrentes">
          <ChipList items={row.recurringLabels} />
        </Campo>
        {row.interactionPrompt && (
          <div className="sm:col-span-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Aprendido da conversa (destilado por IA)
            </p>
            <p className="rounded-md border bg-muted/40 p-2 text-sm leading-relaxed">
              {row.interactionPrompt}
            </p>
          </div>
        )}
        <div className="text-xs text-muted-foreground sm:col-span-2">
          Atualizado em <span className="tabular-nums">{formatBrt(row.profileBuiltAt)}</span>
          {row.lastLearnedModel ? ` · origem: ${row.lastLearnedModel}` : ""}
        </div>
      </CardContent>
    </Card>
  );
}

export function PersonalizacaoContent({ rows }: { rows: UserProfileAuditRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Nenhum perfil construído ainda</p>
          <p className="max-w-md text-xs text-muted-foreground">
            O perfil de cada usuário é montado automaticamente a partir das conversas dele (a
            partir de 3 conversas e 10 mensagens). Conforme as pessoas usam o Nex, os perfis
            aparecem aqui.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? "perfil" : "perfis"} construídos. São preferências de
        atendimento (apresentação e assuntos), nunca regras: a pergunta de cada turno sempre vence.
      </p>
      <div className="grid gap-4">
        {rows.map((r) => (
          <ProfileCard key={r.userId} row={r} />
        ))}
      </div>
    </div>
  );
}
