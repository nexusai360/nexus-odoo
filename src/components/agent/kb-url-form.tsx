"use client";

/**
 * Aba "URL" do KbUploadDialog.
 *
 * Layout reflete o da aba "Arquivo":
 *   - estado vazio: card grande convidando a adicionar.
 *   - botão "Adicionar URL" no rodapé esquerdo.
 *   - clicar abre um sub-dialog (Add URL) com Nome + URL + Cancelar/Adicionar.
 *
 * Lista de até MAX_FILES_PER_UPLOAD URLs. Pipeline por item:
 *   processing → idle → uploading → success | error.
 *
 * Pré-processamento real via Server Action precountKbUrlCharsAction
 * (fetch + strip HTML). Upload via uploadKbUrlAction grava com texto
 * extraído da página.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  precountKbUrlCharsAction,
  uploadKbUrlAction,
} from "@/lib/actions/kb";
import { MAX_FILES_PER_UPLOAD } from "@/lib/agent/rag/kb-kinds";
import { MAX_KB_TOTAL_CHARS } from "@/lib/agent/prompt/compose";

const MAX_NAME = 200;
const MAX_URL = 2048;
const ERROR_TIMEOUT_MS = 5_000;

type UrlStatus = "processing" | "idle" | "uploading" | "success" | "error";
interface UrlItem {
  id: string;
  name: string;
  url: string;
  status: UrlStatus;
  realChars: number;
  errorMessage?: string;
}

interface KbUrlFormProps {
  onSuccess: () => void;
  isDisabled?: boolean;
  onContentChange?: (hasContent: boolean) => void;
  resetSignal?: number;
  existingKbNames?: string[];
  existingKbUrls?: string[];
  currentKbChars?: number;
}

let urlItemSeq = 0;
function makeUrlItem(name: string, url: string): UrlItem {
  urlItemSeq += 1;
  return {
    id: `u-${Date.now()}-${urlItemSeq}`,
    name,
    url,
    status: "processing",
    realChars: -1,
  };
}

function validateClientSide(name: string, url: string): string | null {
  const tn = name.trim();
  if (!tn) return "Informe um nome para a URL.";
  if (tn.length > MAX_NAME) return `Nome muito longo (máx. ${MAX_NAME}).`;
  const tu = url.trim();
  if (!tu) return "Informe a URL.";
  if (tu.length > MAX_URL) return `URL muito longa (máx. ${MAX_URL}).`;
  let parsed: URL;
  try {
    parsed = new URL(tu);
  } catch {
    return "URL inválida. Use HTTPS.";
  }
  if (parsed.protocol !== "https:") return "URL inválida. Use HTTPS.";
  return null;
}

export function KbUrlForm({
  onSuccess,
  isDisabled = false,
  onContentChange,
  resetSignal = 0,
  existingKbNames = [],
  existingKbUrls = [],
  currentKbChars = 0,
}: KbUrlFormProps) {
  const router = useRouter();
  const [items, setItems] = useState<UrlItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const lastItemRef = useRef<HTMLLIElement | null>(null);

  const existingNamesSet = useMemo(
    () => new Set(existingKbNames.map((n) => n.toLowerCase())),
    [existingKbNames],
  );
  const existingUrlsSet = useMemo(
    () => new Set(existingKbUrls.map((u) => u.toLowerCase())),
    [existingKbUrls],
  );

  const disabled = isDisabled || isPending;

  useEffect(() => {
    if (resetSignal > 0) {
      setItems([]);
      setDraftName("");
      setDraftUrl("");
      setDraftError(null);
      setError(null);
      setInfo(null);
      setAddOpen(false);
    }
  }, [resetSignal]);

  useEffect(() => {
    if (!onContentChange) return;
    onContentChange(items.length > 0 || addOpen);
  }, [items.length, addOpen, onContentChange]);

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

  // Pré-processamento de cada item recém-adicionado.
  useEffect(() => {
    const target = items.find((it) => it.status === "processing");
    if (!target) return;
    let cancelled = false;
    (async () => {
      const result = await precountKbUrlCharsAction(target.url);
      if (cancelled) return;
      if (!result.ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === target.id
              ? { ...it, status: "error", errorMessage: result.error }
              : it,
          ),
        );
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.id === target.id
              ? { ...it, status: "idle", realChars: result.data.charCount }
              : it,
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const remainingSlots = Math.max(0, MAX_FILES_PER_UPLOAD - items.length);

  function openAdd() {
    if (remainingSlots <= 0) {
      setError(
        `Você já atingiu o limite de ${MAX_FILES_PER_UPLOAD} URLs por upload.`,
      );
      return;
    }
    setDraftName("");
    setDraftUrl("");
    setDraftError(null);
    setAddOpen(true);
  }

  function commitAdd() {
    const v = validateClientSide(draftName, draftUrl);
    if (v) {
      setDraftError(v);
      return;
    }
    const tn = draftName.trim();
    const tu = draftUrl.trim();

    if (existingNamesSet.has(tn.toLowerCase())) {
      setDraftError(`${tn} já está na base.`);
      return;
    }
    if (existingUrlsSet.has(tu.toLowerCase())) {
      setDraftError(`${tu} já está na base.`);
      return;
    }
    if (items.some((it) => it.url.toLowerCase() === tu.toLowerCase())) {
      setDraftError(`${tu} já está nesta seleção.`);
      return;
    }
    if (items.some((it) => it.name.toLowerCase() === tn.toLowerCase())) {
      setDraftError(`O nome "${tn}" já está em uso nesta seleção.`);
      return;
    }

    setItems((prev) => [...prev, makeUrlItem(tn, tu)]);
    setDraftName("");
    setDraftUrl("");
    setDraftError(null);
    setAddOpen(false);
  }

  function handleRemoveItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setError(null);
  }

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
    return {
      remaining,
      selectedChars,
      total: currentKbChars + selectedChars,
      overflowIds,
      hasOverflow: overflowIds.size > 0,
      isAnyProcessing: items.some((it) => it.status === "processing"),
    };
  }, [items, currentKbChars]);

  const pendingItems = items.filter((it) => it.status !== "success");
  const hasErrors = items.some((it) => it.status === "error");
  const canSave =
    pendingItems.length > 0 &&
    !budget.hasOverflow &&
    !budget.isAnyProcessing &&
    !hasErrors &&
    !isPending;

  async function handleSubmit() {
    if (pendingItems.length === 0) {
      setError("Adicione pelo menos uma URL.");
      return;
    }
    if (budget.isAnyProcessing) {
      setError("Aguarde o processamento das URLs terminar.");
      return;
    }
    if (budget.hasOverflow) {
      setError(
        "URLs em vermelho excedem o limite restante da base. Remova antes de salvar.",
      );
      return;
    }

    startTransition(async () => {
      const updated: UrlItem[] = [...items];
      let okCount = 0;
      for (let i = 0; i < updated.length; i++) {
        const it = updated[i];
        if (it.status === "success") continue;
        updated[i] = { ...it, status: "uploading", errorMessage: undefined };
        setItems([...updated]);
        const result = await uploadKbUrlAction(it.name, it.url);
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
            ? "URL adicionada à base de conhecimento"
            : `${okCount} URLs adicionadas à base de conhecimento`,
        );
        router.refresh();
      }
      const failed = updated.filter((it) => it.status === "error");
      if (failed.length > 0) {
        toast.error(`Falha em ${failed.length} URL(s). Remova-as e tente de novo.`);
        return;
      }
      onSuccess();
    });
  }

  const budgetPct = Math.min(
    100,
    Math.round((budget.total / MAX_KB_TOTAL_CHARS) * 100),
  );
  const budgetTone = budget.hasOverflow
    ? "text-destructive"
    : budgetPct >= 85
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";

  const draftInvalid = draftName.trim().length === 0 || draftUrl.trim().length === 0;

  return (
    <div className="space-y-3">
      {/* Estado vazio: convite a adicionar (parelha visual do dropzone de arquivo). */}
      {items.length === 0 ? (
        <button
          type="button"
          onClick={openAdd}
          disabled={disabled || remainingSlots === 0}
          className={cn(
            "group flex min-h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors",
            "hover:border-violet-400/60 hover:bg-violet-500/5",
            "focus-visible:border-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30",
            (disabled || remainingSlots === 0) && "pointer-events-none opacity-60",
          )}
        >
          <Globe
            className="h-7 w-7 text-muted-foreground group-hover:text-violet-500"
            aria-hidden
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Clique para adicionar uma URL
            </p>
            <p className="text-xs text-muted-foreground">
              Páginas HTTPS públicas. Até {MAX_FILES_PER_UPLOAD} por upload.
            </p>
          </div>
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-card/40 p-2">
          <ul
            ref={listRef}
            className="max-h-[480px] space-y-2 overflow-y-auto pr-1"
          >
            {items.map((it, i) => {
              const isLast = i === items.length - 1;
              const overflow = budget.overflowIds.has(it.id);
              const isProcessing = it.status === "processing";
              const isUploading = it.status === "uploading";
              const isSuccess = it.status === "success";
              const isError = it.status === "error";
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
                      <Globe className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p
                      className="line-clamp-1 break-all text-sm font-medium text-foreground"
                      title={it.name}
                    >
                      {it.name}
                    </p>
                    <p
                      className="line-clamp-1 break-all text-[11px] text-muted-foreground"
                      title={it.url}
                    >
                      {it.url}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {isProcessing
                        ? "Processando…"
                        : it.realChars >= 0
                          ? `${it.realChars.toLocaleString("pt-BR")} chars`
                          : ""}
                    </p>
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
                    aria-label={`Remover ${it.name}`}
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

      {/* Orçamento da KB sempre visível. */}
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
          onClick={openAdd}
          disabled={disabled || remainingSlots === 0}
          className="h-9 cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {items.length === 0 ? "Adicionar URL" : "Adicionar mais"}
          <span className="ml-1 text-[10px] text-muted-foreground">
            ({items.length}/{MAX_FILES_PER_UPLOAD})
          </span>
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSave}
          className="h-9 cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Adicionando…
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" aria-hidden />
              {pendingItems.length > 1
                ? `Salvar (${pendingItems.length})`
                : "Salvar"}
            </>
          )}
        </Button>
      </div>

      {/* Sub-dialog para adicionar uma URL individual. */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false);
            setDraftError(null);
          }
        }}
      >
        <DialogContent className="w-[min(520px,calc(100%-2rem))] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Adicionar URL</DialogTitle>
            <DialogDescription>
              Página HTTPS pública. O texto da página será extraído e
              adicionado à base.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label
                htmlFor="kb-url-add-name"
                className="text-[11px] uppercase tracking-wide text-muted-foreground"
              >
                Nome
              </Label>
              <Input
                id="kb-url-add-name"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Ex.: Política de entrega"
                maxLength={MAX_NAME}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !draftInvalid) {
                    e.preventDefault();
                    commitAdd();
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="kb-url-add-url"
                className="text-[11px] uppercase tracking-wide text-muted-foreground"
              >
                URL
              </Label>
              <Input
                id="kb-url-add-url"
                type="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://exemplo.com/pagina"
                maxLength={MAX_URL}
                inputMode="url"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !draftInvalid) {
                    e.preventDefault();
                    commitAdd();
                  }
                }}
              />
            </div>
            {draftError && (
              <p
                role="alert"
                aria-live="polite"
                className="truncate rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
                title={draftError}
              >
                {draftError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setDraftError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={commitAdd}
              disabled={draftInvalid}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
