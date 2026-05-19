"use client";

/**
 * Seção de gestão da Base de Conhecimento (KB) do agente nexus-odoo.
 *
 * Exibe:
 * - Barra de progresso de uso (chars vs cap de 30.000).
 * - Aviso quando próximo/acima do limite.
 * - Lista de documentos com nome, badge de tipo (TXT/PDF/URL),
 *   contagem de chars, indicador de embedding (ícone Sparkles ou X)
 *   e ação de excluir com confirmação via AlertDialog.
 * - Estado vazio amigável.
 * - Botão "Adicionar conhecimento" → abre KbUploadDialog (abas Arquivo/URL).
 *
 * Gates: admin/super_admin (verificação no server — este componente é client).
 *
 * Adaptado de nexus-insights/src/components/agente-nex/kb-section.tsx.
 * Diferenças:
 * - Sem fileSize (usa charCount apenas).
 * - Sem refreshKbUrlAction (não implementado nesta onda).
 * - Adiciona indicador de embedding (hasEmbedding).
 * - Chama deleteKbDocumentAction de src/lib/actions/kb.ts.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Link as LinkIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteKbDocumentAction } from "@/lib/actions/kb";
import { cn } from "@/lib/utils";

import { KbUploadDialog } from "./kb-upload-dialog";

const KB_TOTAL_CAP = 30_000;
const KB_WARN_THRESHOLD = 25_000;

export interface KbDocSummary {
  id: string;
  name: string;
  kind: "TXT" | "PDF" | "URL";
  sourceUrl: string | null;
  charCount: number;
  createdAt: Date;
  hasEmbedding: boolean;
}

interface KbSectionProps {
  initial: KbDocSummary[];
}

function safeHostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const KIND_BADGE: Record<"TXT" | "PDF" | "URL", string> = {
  TXT: "TXT",
  PDF: "PDF",
  URL: "URL",
};

export function KbSection({ initial }: KbSectionProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<KbDocSummary | null>(null);
  const [, startTransition] = useTransition();

  const totalChars = useMemo(
    () => initial.reduce((sum, d) => sum + d.charCount, 0),
    [initial],
  );
  const cappedTotal = Math.min(totalChars, KB_TOTAL_CAP);
  const overflowChars = Math.max(0, totalChars - KB_TOTAL_CAP);
  const progressPct = Math.min(100, Math.round((cappedTotal / KB_TOTAL_CAP) * 100));
  const isOverLimit = totalChars > KB_TOTAL_CAP;
  const isNearLimit = !isOverLimit && totalChars > KB_WARN_THRESHOLD;

  function handleConfirmDelete() {
    const doc = confirmDelete;
    if (!doc) return;
    setDeletingId(doc.id);
    startTransition(async () => {
      const result = await deleteKbDocumentAction(doc.id);
      setDeletingId(null);
      setConfirmDelete(null);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao excluir documento");
        return;
      }
      toast.success("Documento removido");
      router.refresh();
    });
  }

  const progressBarColor = isOverLimit
    ? "bg-destructive"
    : isNearLimit
      ? "bg-amber-500"
      : "bg-violet-500";

  return (
    <div className="space-y-4">
      {/* Header: uso de chars + barra de progresso */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Total injetado no prompt
          </p>
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            <span
              className={cn(
                "font-semibold",
                isOverLimit
                  ? "text-destructive"
                  : isNearLimit
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground",
              )}
            >
              {cappedTotal.toLocaleString("pt-BR")}
            </span>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span>{KB_TOTAL_CAP.toLocaleString("pt-BR")}</span>
            <span className="ml-1 text-muted-foreground/80">chars</span>
          </p>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uso da base de conhecimento: ${progressPct}% de 30.000 caracteres`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              progressBarColor,
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {isOverLimit ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="leading-snug">
              <span className="font-semibold">
                {overflowChars.toLocaleString("pt-BR")} chars
              </span>{" "}
              excedendo o limite serão truncados na composição do prompt.
            </p>
          </div>
        ) : isNearLimit ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="leading-snug">
              Próximo do limite (30.000 chars). Considere remover documentos antes de adicionar novos.
            </p>
          </div>
        ) : null}
      </div>

      {/* Lista de documentos */}
      {initial.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <FileText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            Nenhum documento adicionado ainda.
          </p>
          <p className="text-xs text-muted-foreground">
            Envie um PDF, TXT ou adicione uma URL para enriquecer o contexto do agente.
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Documentos da base de conhecimento">
          {initial.map((doc) => {
            const isDeleting = deletingId === doc.id;
            const isUrl = doc.kind === "URL";
            const hostname = isUrl ? safeHostname(doc.sourceUrl) : null;
            const Icon = isUrl ? LinkIcon : FileText;

            return (
              <li
                key={doc.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-opacity",
                  isDeleting && "opacity-60",
                )}
              >
                {/* Ícone de tipo */}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>

                {/* Nome + metadata */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className="truncate text-sm font-medium text-foreground"
                      title={doc.name}
                    >
                      {doc.name}
                    </p>
                    <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 font-mono">
                      {KIND_BADGE[doc.kind]}
                    </Badge>
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {isUrl && doc.sourceUrl ? (
                      <>
                        <a
                          href={doc.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={doc.sourceUrl}
                          aria-label={`Abrir ${doc.sourceUrl} em nova aba`}
                          className="inline-block max-w-[180px] truncate align-bottom text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {hostname ?? doc.sourceUrl}
                        </a>
                        <span className="mx-1.5 text-muted-foreground/60">•</span>
                      </>
                    ) : null}
                    <span>{doc.charCount.toLocaleString("pt-BR")} chars</span>
                  </p>
                </div>

                {/* Indicador de embedding */}
                <span
                  title={doc.hasEmbedding ? "Embedding vetorial disponível" : "Sem embedding — busca por similaridade indisponível"}
                  aria-label={doc.hasEmbedding ? "Embedding disponível" : "Sem embedding"}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    doc.hasEmbedding
                      ? "text-violet-500"
                      : "text-muted-foreground/40",
                  )}
                >
                  {doc.hasEmbedding ? (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </span>

                {/* Excluir */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmDelete(doc)}
                  disabled={isDeleting}
                  aria-label={`Excluir documento ${doc.name}`}
                  title="Excluir"
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Adicionar */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setUploadOpen(true)}
          className="border-border cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adicionar conhecimento
        </Button>
      </div>

      <KbUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
              Excluir documento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Excluir{" "}
              <strong className="text-foreground">
                &quot;{confirmDelete?.name ?? ""}&quot;
              </strong>{" "}
              da base de conhecimento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingId !== null}
              className="cursor-pointer"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={handleConfirmDelete}
              disabled={deletingId !== null}
              className="gap-2 bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-all duration-200"
            >
              {deletingId !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
