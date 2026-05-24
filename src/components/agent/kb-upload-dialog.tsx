"use client";

/**
 * Dialog de adição de documento à Base de Conhecimento (KB) do Agente Nex.
 *
 * Abas (segmented control com indicador):
 * - Arquivo: PDF, TXT, Markdown, CSV ou XML ≤ 15 MB. O arquivo é enviado ao
 *   servidor (FormData) e o texto é extraído lá (PDF via pdf-parse, etc.).
 * - URL: referência de URL pública.
 *
 * Rework F5-UI v2: extração real server-side, 5 tipos de arquivo, limite 15 MB,
 * rodapé de ações unificado (corrige o bug do rodapé sobreposto).
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Globe, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadKbFileAction } from "@/lib/actions/kb";
import { ACCEPTED_KB_EXTENSIONS, kindFromFilename } from "@/lib/agent/rag/kb-kinds";
import { cn } from "@/lib/utils";

import { KbUrlForm } from "./kb-url-form";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

interface KbUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "file" | "url";
}

const TABS: { id: "file" | "url"; label: string; icon: typeof FileText }[] = [
  { id: "file", label: "Arquivo", icon: FileText },
  { id: "url", label: "URL", icon: Globe },
];

export function KbUploadDialog({
  open,
  onOpenChange,
  initialTab = "file",
}: KbUploadDialogProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"file" | "url">(initialTab);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  function validate(f: File): string | null {
    if (!kindFromFilename(f.name)) {
      return "Formato inválido. Aceitos: PDF, TXT, Markdown, CSV, XML.";
    }
    if (f.size === 0) return "Arquivo vazio.";
    if (f.size > MAX_FILE_BYTES) {
      return `Arquivo excede 15 MB (${formatFileSize(f.size)}).`;
    }
    return null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      setError(null);
      return;
    }
    const v = validate(f);
    if (v) {
      setError(v);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }

  function handleClearFile() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleSubmit() {
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadKbFileAction(formData);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao enviar documento");
        return;
      }
      toast.success("Documento adicionado à base de conhecimento");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="w-[min(560px,calc(100%-2rem))] sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Adicionar conhecimento</DialogTitle>
          <DialogDescription>
            Envie um arquivo (PDF, TXT, Markdown, CSV ou XML, ≤ 15 MB) ou
            adicione uma URL de referência. O conteúdo é incorporado ao contexto
            do Agente Nex.
          </DialogDescription>
        </DialogHeader>

        {/* Segmented control Arquivo / URL. */}
        <div
          role="tablist"
          aria-label="Origem do conhecimento"
          className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={selected}
                disabled={isPending}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isPending ? "cursor-not-allowed" : "cursor-pointer",
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "file" ? (
          <div className="space-y-3">
            {!file ? (
              <label
                htmlFor="kb-upload-input"
                className={cn(
                  "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors",
                  "hover:border-violet-400/60 hover:bg-violet-500/5",
                  "focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/30",
                  isPending && "pointer-events-none opacity-60",
                )}
              >
                <Upload
                  className="h-7 w-7 text-muted-foreground group-hover:text-violet-500"
                  aria-hidden
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    Clique para selecionar um arquivo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, TXT, Markdown, CSV ou XML até 15 MB
                  </p>
                </div>
                <input
                  ref={inputRef}
                  id="kb-upload-input"
                  type="file"
                  accept={ACCEPTED_KB_EXTENSIONS}
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={isPending}
                  aria-label="Selecionar arquivo (máx. 15 MB)"
                />
              </label>
            ) : (
              <div className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                  <FileText className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p
                    className="truncate text-sm font-medium text-foreground"
                    title={file.name}
                  >
                    {file.name}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleClearFile}
                  disabled={isPending}
                  aria-label="Remover arquivo selecionado"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {error ? (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}

            {/* Rodapé de ações — no fluxo do card, sem overlay. */}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="h-9 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!file || isPending}
                aria-label="Salvar documento na base de conhecimento"
                className="h-9 cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" aria-hidden />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <KbUrlForm
            key={open ? "open" : "closed"}
            onSuccess={() => onOpenChange(false)}
            isDisabled={isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
