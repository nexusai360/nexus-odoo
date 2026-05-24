"use client";

/**
 * Dialog de adição de documento à Base de Conhecimento (KB) do Agente Nex.
 *
 * Estado por arquivo (idle | uploading | success | error) com feedback visual:
 * verde para sucesso, vermelho para falha. O modal só fecha quando todos os
 * arquivos da fila viram success (ou o usuário cancela). Sucesso some da lista
 * para evitar duplicidade no retry.
 *
 * Pré-validação do total de caracteres: a soma "KB atual + arquivos novos"
 * não pode estourar MAX_KB_TOTAL_CHARS. Se estourar, o botão Salvar bloqueia.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  Globe,
  Loader2,
  Plus,
  Upload,
  X,
  TriangleAlert,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadKbFileAction } from "@/lib/actions/kb";
import {
  ACCEPTED_KB_EXTENSIONS,
  MAX_FILES_PER_UPLOAD,
  kindFromFilename,
} from "@/lib/agent/rag/kb-kinds";
import { MAX_KB_TOTAL_CHARS } from "@/lib/agent/prompt/compose";
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
  /** Total de caracteres já injetados na KB (vindo do server). Usado para
   *  prever se a soma com os novos arquivos vai estourar o limite. */
  currentKbChars?: number;
}

const TABS: { id: "file" | "url"; label: string; icon: typeof FileText }[] = [
  { id: "file", label: "Arquivo", icon: FileText },
  { id: "url", label: "URL", icon: Globe },
];

/** Estado por arquivo na fila. */
type FileStatus = "idle" | "uploading" | "success" | "error";
interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  /** Estimativa de chars do conteúdo. UTF-8 ≈ bytes para texto; para PDF/DOCX/XLSX
   *  usamos uma heurística mais conservadora (0.5x para PDF, 0.3x para binários). */
  estimatedChars: number;
  /** Mensagem específica quando status="error". */
  errorMessage?: string;
}

function estimateChars(f: File): number {
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return Math.round(f.size * 0.5);
  if (ext === "docx" || ext === "doc") return Math.round(f.size * 0.3);
  if (ext === "xlsx" || ext === "xls") return Math.round(f.size * 0.2);
  // Texto cru: bytes ≈ chars para conteúdo ASCII; folga 10%.
  return Math.round(f.size * 1.1);
}

let fileItemSeq = 0;
function makeFileItem(file: File): FileItem {
  fileItemSeq += 1;
  return {
    id: `f-${Date.now()}-${fileItemSeq}`,
    file,
    status: "idle",
    estimatedChars: estimateChars(file),
  };
}

export function KbUploadDialog({
  open,
  onOpenChange,
  initialTab = "file",
  currentKbChars = 0,
}: KbUploadDialogProps) {
  const router = useRouter();
  const [items, setItems] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"file" | "url">(initialTab);
  const [isDragging, setIsDragging] = useState(false);
  const [urlDirty, setUrlDirty] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<"file" | "url" | null>(null);
  const [urlResetSignal, setUrlResetSignal] = useState(0);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const lastItemRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!open) {
      setItems([]);
      setError(null);
      setIsDragging(false);
      setUrlDirty(false);
      setPendingSwitch(null);
      dragCounterRef.current = 0;
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 10_000);
    return () => clearTimeout(t);
  }, [error]);

  // Observer para o indicador "X arquivos abaixo": só aparece quando o último
  // item não está parcialmente visível dentro do scroll container.
  useEffect(() => {
    if (items.length <= 1) {
      setShowScrollHint(false);
      return;
    }
    const root = listRef.current;
    const last = lastItemRef.current;
    if (!root || !last) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowScrollHint(!entry.isIntersecting);
      },
      { root, threshold: 0.01 },
    );
    observer.observe(last);
    return () => observer.disconnect();
  }, [items]);

  function requestTabSwitch(target: "file" | "url") {
    if (target === activeTab || isPending) return;
    const currentHasContent =
      (activeTab === "file" && items.length > 0) ||
      (activeTab === "url" && urlDirty);
    if (currentHasContent) {
      setPendingSwitch(target);
      return;
    }
    setActiveTab(target);
  }

  function confirmSwitch() {
    if (!pendingSwitch) return;
    if (activeTab === "file") {
      setItems([]);
    } else {
      setUrlResetSignal((s) => s + 1);
    }
    setError(null);
    setActiveTab(pendingSwitch);
    setPendingSwitch(null);
  }

  function validate(f: File): string | null {
    if (!kindFromFilename(f.name)) {
      return `${f.name}: formato inválido.`;
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
    const errors: string[] = [];
    const accepted: FileItem[] = [];
    for (const f of list) {
      const v = validate(f);
      if (v) {
        errors.push(v);
        continue;
      }
      const exists = items.some(
        (it) => it.file.name === f.name && it.file.size === f.size,
      );
      if (exists) continue;
      accepted.push(makeFileItem(f));
    }
    // Aplica limite de MAX_FILES_PER_UPLOAD ao todo (existentes + aceitos).
    const totalAfter = items.length + accepted.length;
    if (totalAfter > MAX_FILES_PER_UPLOAD) {
      const overflow = totalAfter - MAX_FILES_PER_UPLOAD;
      accepted.splice(MAX_FILES_PER_UPLOAD - items.length);
      errors.push(
        `Limite de ${MAX_FILES_PER_UPLOAD} arquivos por upload. ${overflow} arquivo(s) descartado(s).`,
      );
    }
    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
    }
    setError(errors.length > 0 ? errors.join(" ") : null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemoveItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setError(null);
  }

  // Pré-validação do total de chars: marca como excedente os últimos arquivos
  // que estouram a soma. O usuário precisa removê-los antes de salvar.
  const charBudgetInfo = useMemo(() => {
    const remaining = Math.max(0, MAX_KB_TOTAL_CHARS - currentKbChars);
    let acc = 0;
    const overflowIds = new Set<string>();
    for (const it of items) {
      if (it.status === "success") continue;
      const next = acc + it.estimatedChars;
      if (next > remaining) {
        overflowIds.add(it.id);
      } else {
        acc = next;
      }
    }
    return {
      remaining,
      projectedChars: acc,
      overflowIds,
      hasOverflow: overflowIds.size > 0,
    };
  }, [items, currentKbChars]);

  const pendingItems = items.filter(
    (it) => it.status !== "success",
  );
  const hasErrors = items.some((it) => it.status === "error");

  async function handleSubmit() {
    if (pendingItems.length === 0) {
      setError("Selecione pelo menos um arquivo.");
      return;
    }
    if (charBudgetInfo.hasOverflow) {
      setError(
        "Alguns arquivos excedem o limite total de caracteres da base de conhecimento. Remova os marcados em vermelho antes de salvar.",
      );
      return;
    }

    startTransition(async () => {
      const updated: FileItem[] = [...items];
      let okCount = 0;
      for (let i = 0; i < updated.length; i++) {
        const it = updated[i];
        if (it.status === "success") continue;
        updated[i] = { ...it, status: "uploading", errorMessage: undefined };
        setItems([...updated]);
        const formData = new FormData();
        formData.append("file", it.file);
        const result = await uploadKbFileAction(formData);
        if (result.ok) {
          updated[i] = { ...updated[i], status: "success" };
          okCount += 1;
        } else {
          updated[i] = {
            ...updated[i],
            status: "error",
            errorMessage: result.error ?? "erro desconhecido",
          };
        }
        setItems([...updated]);
      }

      if (okCount > 0) {
        toast.success(
          okCount === 1
            ? "Documento adicionado à base de conhecimento"
            : `${okCount} documentos adicionados à base de conhecimento`,
        );
        router.refresh();
      }
      const failed = updated.filter((it) => it.status === "error");
      if (failed.length > 0) {
        toast.error(
          `Falha em ${failed.length} arquivo(s). Confira a lista, remova os com problema e tente de novo.`,
        );
        // Mantém modal aberto com sucessos em verde e falhas em vermelho.
        return;
      }
      // Tudo certo: fecha modal.
      onOpenChange(false);
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

  const canSave =
    pendingItems.length > 0 &&
    !charBudgetInfo.hasOverflow &&
    !isPending;

  return (
    <>
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
              Envie até {MAX_FILES_PER_UPLOAD} arquivos (menor ou igual a 15 MB
              cada) ou adicione uma URL de referência. Arraste para qualquer
              parte da janela.
            </DialogDescription>
          </DialogHeader>

          <div
            role="tablist"
            aria-label="Origem do conhecimento"
            className="grid h-9 shrink-0 grid-cols-2 gap-1 self-start rounded-lg border border-border bg-muted/40 p-1"
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
                  onClick={() => requestTabSwitch(tab.id)}
                  className={cn(
                    "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
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
                aria-label={`Selecionar até ${MAX_FILES_PER_UPLOAD} arquivos`}
              />

              {items.length === 0 ? (
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
                      PDF, Word, Excel, Markdown, TXT, CSV, XML, YAML ou JSON. Menor ou igual a 15 MB cada.
                    </p>
                  </div>
                </label>
              ) : (
                <div className="relative">
                  <ul
                    ref={listRef}
                    className="max-h-[260px] space-y-2 overflow-y-auto pr-1"
                  >
                    {items.map((it, i) => {
                      const isLast = i === items.length - 1;
                      const overflow = charBudgetInfo.overflowIds.has(it.id);
                      const tone =
                        it.status === "success"
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : it.status === "error" || overflow
                            ? "border-destructive/40 bg-destructive/10"
                            : it.status === "uploading"
                              ? "border-violet-500/40 bg-violet-500/10"
                              : "border-border bg-muted/30";
                      return (
                        <li
                          key={it.id}
                          ref={isLast ? lastItemRef : undefined}
                          className={cn(
                            "flex w-full min-w-0 items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                            tone,
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              it.status === "success"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : it.status === "error" || overflow
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
                            )}
                          >
                            {it.status === "uploading" ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : it.status === "success" ? (
                              <Check className="h-4 w-4" aria-hidden />
                            ) : it.status === "error" || overflow ? (
                              <TriangleAlert className="h-4 w-4" aria-hidden />
                            ) : (
                              <FileText className="h-4 w-4" aria-hidden />
                            )}
                          </span>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <p
                              className="line-clamp-2 break-words text-sm font-medium text-foreground"
                              title={it.file.name}
                            >
                              {it.file.name}
                            </p>
                            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                              {formatFileSize(it.file.size)} · ~
                              {it.estimatedChars.toLocaleString("pt-BR")} chars estimados
                            </p>
                            {it.status === "error" && it.errorMessage && (
                              <p className="mt-1 text-xs text-destructive">
                                {it.errorMessage}
                              </p>
                            )}
                            {overflow && it.status !== "error" && (
                              <p className="mt-1 text-xs text-destructive">
                                Excede o limite restante da KB. Remova ou troque por arquivos menores.
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveItem(it.id)}
                            disabled={isPending && it.status === "uploading"}
                            aria-label={`Remover ${it.file.name}`}
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>

                  {showScrollHint && (
                    <div className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background/95 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
                      <span className="inline-flex items-center gap-1">
                        <ChevronDown className="h-3 w-3" aria-hidden />
                        Mais arquivos abaixo
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Barra de orçamento da KB. */}
              {items.length > 0 && (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs",
                    charBudgetInfo.hasOverflow
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-border bg-muted/30 text-muted-foreground",
                  )}
                >
                  Orçamento da base: {currentKbChars.toLocaleString("pt-BR")} +
                  {" "}
                  ~{charBudgetInfo.projectedChars.toLocaleString("pt-BR")} novos
                  {" "}/{" "}
                  {MAX_KB_TOTAL_CHARS.toLocaleString("pt-BR")} chars
                  {charBudgetInfo.hasOverflow && (
                    <span className="ml-2 font-medium">
                      Remova os marcados em vermelho.
                    </span>
                  )}
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

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                  disabled={isPending || items.length >= MAX_FILES_PER_UPLOAD}
                  className="h-9 cursor-pointer"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {items.length === 0 ? "Adicionar arquivo" : "Adicionar mais"}
                  {items.length > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({items.length}/{MAX_FILES_PER_UPLOAD})
                    </span>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isPending}
                    className="h-9 cursor-pointer"
                  >
                    {hasErrors ? "Fechar" : "Cancelar"}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSave}
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
                        {pendingItems.length > 1
                          ? `Salvar (${pendingItems.length})`
                          : "Salvar"}
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
              onContentChange={setUrlDirty}
              resetSignal={urlResetSignal}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingSwitch !== null}
        onOpenChange={(o) => {
          if (!o) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar o conteúdo atual?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao trocar entre arquivo e URL, o conteúdo da aba atual é apagado. Você quer continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSwitch(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch}>
              Trocar e descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
