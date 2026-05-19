"use client";

/**
 * Dialog de adição de documento à Base de Conhecimento (KB).
 *
 * Abas:
 * - Arquivo: PDF ou TXT ≤ 5 MB. Lê o texto client-side e chama ingestKbDocumentAction.
 * - URL: referência de URL pública; chama ingestKbDocumentAction com kind=URL.
 *
 * Adaptado de nexus-insights/src/components/agente-nex/kb-upload-dialog.tsx.
 * Diferença: usa ingestKbDocumentAction de src/lib/actions/kb.ts (sem fileSize).
 * PDF é lido como texto via FileReader; conteúdo binário é truncado/sanitizado.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ingestKbDocumentAction } from "@/lib/actions/kb";
import { cn } from "@/lib/utils";

import { KbUrlForm } from "./kb-url-form";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_MIMES = new Set(["application/pdf", "text/plain"]);
const ACCEPTED_EXTENSIONS = [".pdf", ".txt"];

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

/** Lê um File como texto usando FileReader. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsText(file, "utf-8");
  });
}

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
    const mime = f.type || "";
    const lowerName = f.name.toLowerCase();
    const validExt = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!ACCEPTED_MIMES.has(mime) && !validExt) {
      return "Formato inválido. Apenas PDF ou TXT.";
    }
    if (f.size === 0) return "Arquivo vazio.";
    if (f.size > MAX_FILE_BYTES) {
      return `Arquivo excede 5 MB (${formatFileSize(f.size)}).`;
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
      let text: string;
      try {
        text = await readFileAsText(file);
      } catch {
        setError("Falha ao ler o arquivo. Tente novamente.");
        return;
      }

      if (!text.trim()) {
        setError("O arquivo está vazio ou não contém texto legível.");
        return;
      }

      const kind = file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "TXT";
      const result = await ingestKbDocumentAction(file.name, kind, text);

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar conhecimento</DialogTitle>
          <DialogDescription>
            Envie um arquivo PDF/TXT (≤ 5 MB) ou adicione uma URL de referência.
            O conteúdo será incorporado ao contexto do agente.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "file" | "url")}
          className="w-full"
        >
          <TabsList className="mb-3">
            <TabsTrigger value="file" disabled={isPending}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Arquivo
            </TabsTrigger>
            <TabsTrigger value="url" disabled={isPending}>
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file">
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
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      Clique para selecionar um arquivo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF ou TXT até 5 MB
                    </p>
                  </div>
                  <input
                    ref={inputRef}
                    id="kb-upload-input"
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    className="sr-only"
                    onChange={handleFileChange}
                    disabled={isPending}
                    aria-label="Selecionar arquivo PDF ou TXT (máx. 5 MB)"
                  />
                </label>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
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
                    className="text-muted-foreground hover:text-foreground"
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

              <div className="-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-2xl border-t border-border bg-secondary/50 p-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                  className="border-border text-muted-foreground hover:bg-accent"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!file || isPending}
                  aria-label="Salvar documento na base de conhecimento"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="url">
            <KbUrlForm
              key={open ? "open" : "closed"}
              onSuccess={() => onOpenChange(false)}
              isDisabled={isPending}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
