"use client";

/**
 * Aba "URL" do KbUploadDialog.
 *
 * Lista de até MAX_FILES_PER_UPLOAD URLs. Cada item passa pelo
 * pré-processamento real (fetch + extração de texto) via Server Action
 * precountKbUrlCharsAction; ao salvar, uploadKbUrlAction grava com o
 * texto extraído. Travas:
 *   - duplicidade na KB (mesma URL ou mesmo nome já gravado).
 *   - duplicidade na lista (mesma URL).
 *   - cap de 5 URLs por upload.
 *   - estouro do orçamento total de chars da KB.
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
  /** Sinaliza ao pai se a aba tem conteúdo (lista ou form aberto preenchido). */
  onContentChange?: (hasContent: boolean) => void;
  /** Pai bumpa para limpar a aba. */
  resetSignal?: number;
  /** Nomes e URLs já gravadas na KB, para detectar duplicidade pré-save. */
  existingKbNames?: string[];
  existingKbUrls?: string[];
  /** Total de caracteres já injetados na KB. */
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
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showScrollHint, setShowScrollHint] = useState(false);
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

  // Reset signal
  useEffect(() => {
    if (resetSignal > 0) {
      setItems([]);
      setName("");
      setUrl("");
      setError(null);
      setInfo(null);
    }
  }, [resetSignal]);

  // Sinaliza dirty state para o pai.
  useEffect(() => {
    if (!onContentChange) return;
    const dirty =
      items.length > 0 || name.trim().length > 0 || url.trim().length > 0;
    onContentChange(dirty);
  }, [items.length, name, url, onContentChange]);

  // Timers
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

  // Scroll hint
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

  function handleAddCurrent() {
    if (remainingSlots <= 0) {
      setError(
        `Você já atingiu o limite de ${MAX_FILES_PER_UPLOAD} URLs por upload.`,
      );
      return;
    }
    const v = validateClientSide(name, url);
    if (v) {
      setError(v);
      return;
    }
    const tn = name.trim();
    const tu = url.trim();

    if (existingNamesSet.has(tn.toLowerCase())) {
      setInfo(`${tn} já está na base.`);
      return;
    }
    if (existingUrlsSet.has(tu.toLowerCase())) {
      setInfo(`${tu} já está na base.`);
      return;
    }
    if (items.some((it) => it.url.toLowerCase() === tu.toLowerCase())) {
      setInfo(`${tu} já está nesta seleção.`);
      return;
    }
    if (items.some((it) => it.name.toLowerCase() === tn.toLowerCase())) {
      setInfo(`Nome ${tn} já está nesta seleção.`);
      return;
    }

    setItems((prev) => [...prev, makeUrlItem(tn, tu)]);
    setName("");
    setUrl("");
    setError(null);
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

  return (
    <div className="space-y-3">
      {/* Form de entrada (nome + url + adicionar). Adiciona à lista. */}
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="kb-url-name" className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Nome
          </Label>
          <Input
            id="kb-url-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Política de entrega"
            maxLength={MAX_NAME}
            disabled={disabled || remainingSlots === 0}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kb-url-input" className="text-[11px] uppercase tracking-wide text-muted-foreground">
            URL
          </Label>
          <Input
            id="kb-url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://exemplo.com/pagina"
            maxLength={MAX_URL}
            disabled={disabled || remainingSlots === 0}
            inputMode="url"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCurrent();
              }
            }}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleAddCurrent}
            disabled={disabled || remainingSlots === 0}
            className="h-9 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Lista de URLs adicionadas. */}
      {items.length > 0 && (
        <div className="rounded-xl border border-border bg-card/40 p-2">
          <ul
            ref={listRef}
            className="max-h-[300px] space-y-2 overflow-y-auto pr-1"
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

      {items.length > 0 && (
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
      )}

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
        <span className="text-[11px] text-muted-foreground">
          {items.length}/{MAX_FILES_PER_UPLOAD} URLs nesta seleção
        </span>
        <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
}
