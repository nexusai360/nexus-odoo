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
import { FileText, Globe, Loader2, Plus, Upload, X } from "lucide-react";
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
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"file" | "url">(initialTab);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setError(null);
      setIsDragging(false);
      dragCounterRef.current = 0;
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  function validate(f: File): string | null {
    if (!kindFromFilename(f.name)) {
      return `${f.name}: formato inválido. Aceitos: PDF, TXT, Markdown, CSV, XML.`;
    }
    if (f.size === 0) return `${f.name}: arquivo vazio.`;
    if (f.size > MAX_FILE_BYTES) {
      return `${f.name}: excede 15 MB (${formatFileSize(f.size)}).`;
    }
    return null;
  }

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const list = Array.from(incoming);
    if (list.length === 0) return;
    const newErrors: string[] = [];
    const accepted: File[] = [];
    for (const f of list) {
      const v = validate(f);
      if (v) {
        newErrors.push(v);
      } else if (!files.some((existing) => existing.name === f.name && existing.size === f.size)) {
        accepted.push(f);
      }
    }
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted]);
    }
    setError(newErrors.length > 0 ? newErrors.join(" ") : null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    // Permite re-selecionar o mesmo arquivo após removê-lo.
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemoveFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }

  function handleSubmit() {
    if (files.length === 0) {
      setError("Selecione pelo menos um arquivo.");
      return;
    }
    startTransition(async () => {
      let okCount = 0;
      const failures: string[] = [];
      for (const f of files) {
        const formData = new FormData();
        formData.append("file", f);
        const result = await uploadKbFileAction(formData);
        if (result.ok) {
          okCount += 1;
        } else {
          failures.push(`${f.name}: ${result.error ?? "erro desconhecido"}`);
        }
      }
      if (okCount > 0) {
        toast.success(
          okCount === 1
            ? "Documento adicionado à base de conhecimento"
            : `${okCount} documentos adicionados à base de conhecimento`,
        );
      }
      if (failures.length > 0) {
        toast.error(`Falha em ${failures.length} arquivo(s): ${failures[0]}`);
      }
      if (failures.length === 0) {
        onOpenChange(false);
      }
      router.refresh();
    });
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (activeTab !== "file" || isPending) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (activeTab !== "file" || isPending) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (activeTab !== "file" || isPending) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (activeTab !== "file" || isPending) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length > 0) addFiles(dropped);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn(
          "w-[min(720px,calc(100%-2rem))] min-h-[440px] sm:max-w-none",
          isDragging && "ring-2 ring-violet-500/60 ring-offset-2 ring-offset-background",
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-violet-500/10 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-violet-500/70 bg-background/90 px-6 py-4 text-violet-600 dark:text-violet-400">
              <Upload className="h-7 w-7" aria-hidden />
              <p className="text-sm font-medium">Solte para anexar</p>
            </div>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Adicionar conhecimento</DialogTitle>
          <DialogDescription>
            Envie um arquivo (PDF, TXT, Markdown, CSV ou XML, ≤ 15 MB) ou
            adicione uma URL de referência. O conteúdo é incorporado ao contexto
            do Agente Nex. Você pode arrastar arquivos em qualquer ponto da
            janela.
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
            <input
              ref={inputRef}
              id="kb-upload-input"
              type="file"
              accept={ACCEPTED_KB_EXTENSIONS}
              multiple
              className="sr-only"
              onChange={handleFileChange}
              disabled={isPending}
              aria-label="Selecionar arquivos (máx. 15 MB cada)"
            />

            {files.length === 0 ? (
              <label
                htmlFor="kb-upload-input"
                className={cn(
                  "group flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors",
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
                    Clique para selecionar ou arraste para qualquer parte da janela
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, TXT, Markdown, CSV ou XML até 15 MB. Vários arquivos de uma vez.
                  </p>
                </div>
              </label>
            ) : (
              <ul className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}-${i}`}
                    className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p
                        className="truncate text-sm font-medium text-foreground"
                        title={f.name}
                      >
                        {f.name}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatFileSize(f.size)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveFile(i)}
                      disabled={isPending}
                      aria-label={`Remover ${f.name}`}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
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

            {/* Rodapé de ações: adicionar à esquerda; cancelar/salvar à direita. */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={isPending}
                className="h-9 cursor-pointer"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {files.length === 0 ? "Adicionar arquivo" : "Adicionar mais"}
              </Button>
              <div className="flex items-center gap-2">
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
                  disabled={files.length === 0 || isPending}
                  aria-label="Salvar documentos na base de conhecimento"
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
                      {files.length > 1 ? `Salvar (${files.length})` : "Salvar"}
                    </>
                  )}
                </Button>
              </div>
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
