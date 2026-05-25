"use client";

/**
 * Dialog de adição de documento à Base de Conhecimento (KB) do Agente Nex.
 *
 * Pipeline por arquivo:
 *   processing → idle (violeta) → uploading → success (verde) | error (vermelho)
 *
 * Pré-processamento real: texto cru é contado no client; PDF/DOCX/XLSX/JSON
 * vão para a Server Action `precountKbCharsAction` que extrai e conta sem
 * persistir. Heurística por bytes só serve de fallback enquanto a contagem
 * real chega.
 *
 * Travas:
 *   - duplicidade no modal (mesmo arquivo já na fila) → toast/mensagem.
 *   - duplicidade na KB (mesmo nome já gravado) → marca o item em vermelho.
 *   - cap de 5 arquivos por upload (MAX_FILES_PER_UPLOAD).
 *   - cap de 10 MB por arquivo (MAX_FILE_BYTES).
 *   - orçamento total da KB (MAX_KB_TOTAL_CHARS = 1.000.000): item que
 *     estoura o restante fica vermelho; Salvar bloqueia até remover.
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
import {
  precountKbCharsAction,
  uploadKbFileAction,
} from "@/lib/actions/kb";
import {
  ACCEPTED_KB_EXTENSIONS,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_BYTES,
  kindFromFilename,
  type FileKbKind,
} from "@/lib/agent/rag/kb-kinds";
import { MAX_KB_TOTAL_CHARS } from "@/lib/agent/prompt/compose";
import { cn } from "@/lib/utils";

import { KbUrlForm } from "./kb-url-form";

const ERROR_TIMEOUT_MS = 5_000;
const TEXT_KINDS: ReadonlySet<FileKbKind> = new Set([
  "TXT",
  "MARKDOWN",
  "CSV",
  "XML",
  "YAML",
]);

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
  /** Total de caracteres já injetados na KB. */
  currentKbChars?: number;
  /** Nomes de arquivos já presentes na KB, para detectar duplicidade pré-save. */
  existingKbNames?: string[];
  /** URLs já gravadas na KB, para detectar duplicidade na aba URL. */
  existingKbUrls?: string[];
}

const TABS: { id: "file" | "url"; label: string; icon: typeof FileText }[] = [
  { id: "file", label: "Arquivo", icon: FileText },
  { id: "url", label: "URL", icon: Globe },
];

type FileStatus = "processing" | "idle" | "uploading" | "success" | "error";
interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  /** Contagem real de chars após pré-processamento. -1 enquanto não processado. */
  realChars: number;
  /** Já existe um documento com esse nome na KB. */
  alreadyInKb: boolean;
  errorMessage?: string;
}

let fileItemSeq = 0;
function makeFileItem(file: File, alreadyInKb: boolean): FileItem {
  fileItemSeq += 1;
  return {
    id: `f-${Date.now()}-${fileItemSeq}`,
    file,
    status: "processing",
    realChars: -1,
    alreadyInKb,
  };
}

export function KbUploadDialog({
  open,
  onOpenChange,
  initialTab = "file",
  currentKbChars = 0,
  existingKbNames = [],
  existingKbUrls = [],
}: KbUploadDialogProps) {
  const router = useRouter();
  const [items, setItems] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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

  const existingNamesSet = useMemo(
    () => new Set(existingKbNames.map((n) => n.toLowerCase())),
    [existingKbNames],
  );

  useEffect(() => {
    if (!open) {
      setItems([]);
      setError(null);
      setInfo(null);
      setIsDragging(false);
      setUrlDirty(false);
      setPendingSwitch(null);
      dragCounterRef.current = 0;
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Mensagens efêmeras (erro e info) somem após 5s.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), ERROR_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), ERROR_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [info]);

  // Indicador "mais arquivos abaixo": IntersectionObserver no último item.
  useEffect(() => {
    if (items.length <= 1) {
      setShowScrollHint(false);
      return;
    }
    const root = listRef.current;
    const last = lastItemRef.current;
    if (!root || !last) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollHint(!entry.isIntersecting),
      { root, threshold: 0.01 },
    );
    observer.observe(last);
    return () => observer.disconnect();
  }, [items]);

  // Pré-processamento de cada item recém-adicionado (status="processing").
  useEffect(() => {
    const target = items.find((it) => it.status === "processing");
    if (!target) return;

    let cancelled = false;
    (async () => {
      try {
        const kind = kindFromFilename(target.file.name);
        let chars = 0;
        if (kind && TEXT_KINDS.has(kind)) {
          const text = await target.file.text();
          chars = text.length;
        } else {
          // PDF / DOCX / XLSX / JSON: extração real via Server Action.
          const fd = new FormData();
          fd.append("file", target.file);
          const result = await precountKbCharsAction(fd);
          if (!result.ok) {
            if (cancelled) return;
            setItems((prev) =>
              prev.map((it) =>
                it.id === target.id
                  ? { ...it, status: "error", errorMessage: result.error }
                  : it,
              ),
            );
            return;
          }
          chars = result.data.charCount;
        }
        if (cancelled) return;
        setItems((prev) =>
          prev.map((it) =>
            it.id === target.id ? { ...it, status: "idle", realChars: chars } : it,
          ),
        );
      } catch (err) {
        if (cancelled) return;
        setItems((prev) =>
          prev.map((it) =>
            it.id === target.id
              ? {
                  ...it,
                  status: "error",
                  errorMessage:
                    err instanceof Error ? err.message : "Falha ao processar arquivo.",
                }
              : it,
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
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

  function validateBasic(f: File): string | null {
    if (!kindFromFilename(f.name)) return `${f.name}: formato inválido.`;
    if (f.size === 0) return `${f.name}: arquivo vazio.`;
    if (f.size > MAX_FILE_BYTES) {
      return `${f.name}: excede ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB.`;
    }
    return null;
  }

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const remainingSlots = MAX_FILES_PER_UPLOAD - items.length;
    if (remainingSlots <= 0) {
      setError(
        `Você já atingiu o limite de ${MAX_FILES_PER_UPLOAD} arquivos por upload.`,
      );
      return;
    }

    const validationErrors: string[] = [];
    const dupInList: string[] = [];
    const dupInKb: string[] = [];
    const accepted: FileItem[] = [];
    let droppedByLimit = 0;

    for (const f of list) {
      // Trava de quantidade: a partir do limite, descarta o restante.
      // O browser não permite limitar a seleção do file picker em si, então
      // aceitamos os primeiros válidos e informamos quantos sobraram de fora.
      if (accepted.length >= remainingSlots) {
        droppedByLimit += 1;
        continue;
      }
      const v = validateBasic(f);
      if (v) {
        validationErrors.push(v);
        continue;
      }
      const dup = items.some(
        (it) => it.file.name === f.name && it.file.size === f.size,
      );
      if (dup) {
        dupInList.push(f.name);
        continue;
      }
      if (existingNamesSet.has(f.name.toLowerCase())) {
        dupInKb.push(f.name);
        continue;
      }
      accepted.push(makeFileItem(f, false));
    }

    if (droppedByLimit > 0) {
      validationErrors.unshift(
        `Limite de ${MAX_FILES_PER_UPLOAD} arquivos por upload. ${droppedByLimit} ignorado(s); ajuste a seleção se quiser enviar os demais.`,
      );
    }

    if (accepted.length > 0) setItems((prev) => [...prev, ...accepted]);
    // Avisos amarelos para duplicatas (KB tem prioridade visual sobre lista).
    if (dupInKb.length > 0) {
      setInfo(
        dupInKb.length === 1
          ? `${dupInKb[0]} já está na base.`
          : `${dupInKb.length} arquivos já estão na base.`,
      );
    } else if (dupInList.length > 0) {
      setInfo(
        dupInList.length === 1
          ? `${dupInList[0]} já está nesta seleção.`
          : `${dupInList.length} arquivos já estão nesta seleção.`,
      );
    }
    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemoveItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setError(null);
  }

  // Orçamento: soma realChars dos items que vão ser enviados (status != success
  // e sem error). Items em processing entram com 0 até a contagem chegar.
  const budget = useMemo(() => {
    const remaining = Math.max(0, MAX_KB_TOTAL_CHARS - currentKbChars);
    let selectedChars = 0;
    const overflowIds = new Set<string>();
    let acc = 0;
    for (const it of items) {
      if (it.status === "success") continue;
      const chars = it.realChars > 0 ? it.realChars : 0;
      selectedChars += chars;
      const next = acc + chars;
      if (next > remaining) overflowIds.add(it.id);
      else acc = next;
    }
    const total = currentKbChars + selectedChars;
    return {
      remaining,
      selectedChars,
      total,
      overflowIds,
      hasOverflow: overflowIds.size > 0,
      isAnyProcessing: items.some((it) => it.status === "processing"),
    };
  }, [items, currentKbChars]);

  const pendingItems = items.filter((it) => it.status !== "success");
  const hasErrors = items.some((it) => it.status === "error" || it.alreadyInKb);
  const remainingSlots = Math.max(0, MAX_FILES_PER_UPLOAD - items.length);

  async function handleSubmit() {
    if (pendingItems.length === 0) {
      setError("Selecione pelo menos um arquivo.");
      return;
    }
    if (budget.isAnyProcessing) {
      setError("Aguarde o processamento terminar antes de salvar.");
      return;
    }
    if (budget.hasOverflow) {
      setError(
        "Arquivos em vermelho excedem o limite restante da base. Remova antes de salvar.",
      );
      return;
    }
    const dupInKb = pendingItems.filter((it) => it.alreadyInKb);
    if (dupInKb.length > 0) {
      setError(
        dupInKb.length === 1
          ? `${dupInKb[0].file.name} já está na base. Remova antes de salvar.`
          : `${dupInKb.length} arquivos já estão na base. Remova antes de salvar.`,
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
          `Falha em ${failed.length} arquivo(s). Remova-os e tente de novo.`,
        );
        return;
      }
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
    !budget.hasOverflow &&
    !budget.isAnyProcessing &&
    !hasErrors &&
    !isPending;

  const budgetPct = Math.min(
    100,
    Math.round((budget.total / MAX_KB_TOTAL_CHARS) * 100),
  );
  const budgetTone = budget.hasOverflow
    ? "text-destructive"
    : budgetPct >= 85
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";

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
            "w-[min(720px,calc(100%-2rem))] gap-3 sm:max-w-none",
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
              Até {MAX_FILES_PER_UPLOAD} arquivos por upload, cada um com no
              máximo 10 MB. Arraste para qualquer parte da janela.
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
                disabled={isPending || remainingSlots === 0}
                aria-label={`Selecionar até ${remainingSlots} arquivo(s)`}
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
                      PDF, DOCX, XLSX, Markdown, TXT, CSV, XML, YAML ou JSON.
                    </p>
                  </div>
                </label>
              ) : (
                <div className="rounded-xl border border-border bg-card/40 p-2">
                  <ul
                    ref={listRef}
                    className="max-h-[380px] space-y-2 overflow-y-auto pr-1"
                  >
                    {items.map((it, i) => {
                      const isLast = i === items.length - 1;
                      const overflow = budget.overflowIds.has(it.id);
                      const isProcessing = it.status === "processing";
                      const isUploading = it.status === "uploading";
                      const isSuccess = it.status === "success";
                      const isError = it.status === "error" || it.alreadyInKb;
                      const isOverflow = overflow && !isError && !isSuccess;
                      const tone = isProcessing
                        ? "border-border bg-muted/40 text-muted-foreground"
                        : isSuccess
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : isError || isOverflow
                            ? "border-destructive/40 bg-destructive/10"
                            : isUploading
                              ? "border-violet-500/40 bg-violet-500/10"
                              : "border-violet-500/30 bg-violet-500/5";
                      return (
                        <li
                          key={it.id}
                          ref={isLast ? lastItemRef : undefined}
                          className={cn(
                            "flex w-full min-w-0 items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
                            tone,
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                              isProcessing
                                ? "bg-muted text-muted-foreground"
                                : isSuccess
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : isError || isOverflow
                                    ? "bg-destructive/15 text-destructive"
                                    : isUploading
                                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                                      : "bg-violet-500/10 text-violet-600 dark:text-violet-400",
                            )}
                          >
                            {isProcessing || isUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : isSuccess ? (
                              <Check className="h-4 w-4" aria-hidden />
                            ) : isError || isOverflow ? (
                              <TriangleAlert className="h-4 w-4" aria-hidden />
                            ) : (
                              <FileText className="h-4 w-4" aria-hidden />
                            )}
                          </span>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <p
                              className="line-clamp-2 break-all text-sm font-medium text-foreground"
                              title={it.file.name}
                            >
                              {it.file.name}
                            </p>
                            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                              {formatFileSize(it.file.size)}
                              {isProcessing ? (
                                <span> · Processando…</span>
                              ) : it.realChars >= 0 ? (
                                <span>
                                  {" · "}
                                  {it.realChars.toLocaleString("pt-BR")} chars
                                </span>
                              ) : null}
                            </p>
                            {it.alreadyInKb && (
                              <p className="mt-0.5 text-[11px] text-destructive">
                                Já existe na base. Remova antes de salvar.
                              </p>
                            )}
                            {it.status === "error" && it.errorMessage && (
                              <p className="mt-0.5 text-[11px] text-destructive">
                                {it.errorMessage}
                              </p>
                            )}
                            {isOverflow && (
                              <p className="mt-0.5 text-[11px] text-destructive">
                                Excede o limite restante.
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveItem(it.id)}
                            disabled={isPending && isUploading}
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
                    <div className="mt-1 flex justify-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        <ChevronDown className="h-3 w-3" aria-hidden />
                        Role para ver mais
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Barra de orçamento sempre visível. */}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-muted-foreground">Uso da base de conhecimento</span>
                  <span className={cn("tabular-nums font-medium", budgetTone)}>
                    {budget.total.toLocaleString("pt-BR")}
                    <span className="mx-1 text-muted-foreground/60">/</span>
                    {MAX_KB_TOTAL_CHARS.toLocaleString("pt-BR")} chars ({budgetPct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full transition-[width] duration-300",
                      budget.hasOverflow
                        ? "bg-destructive"
                        : budgetPct >= 85
                          ? "bg-amber-500"
                          : "bg-violet-500",
                    )}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {currentKbChars.toLocaleString("pt-BR")} já na base
                  {"   "}+{budget.selectedChars.toLocaleString("pt-BR")} desta seleção
                </p>
              </div>

              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="truncate rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
                  title={error}
                >
                  {error}
                </p>
              )}
              {info && !error && (
                <p
                  role="status"
                  aria-live="polite"
                  className="truncate rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300"
                  title={info}
                >
                  {info}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                  disabled={isPending || remainingSlots === 0}
                  className="h-9 cursor-pointer"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {items.length === 0 ? "Adicionar arquivo" : "Adicionar mais"}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({items.length}/{MAX_FILES_PER_UPLOAD})
                  </span>
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
                        Enviando…
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
              existingKbNames={existingKbNames}
              existingKbUrls={existingKbUrls}
              currentKbChars={currentKbChars}
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
