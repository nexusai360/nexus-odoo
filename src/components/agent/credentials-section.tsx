"use client";

/**
 * CredentialsSection — gerenciamento de chaves de API por provedor.
 *
 * Rework F5-UI v2: clone visual do `LlmCredentialsManager` do nexus-insights.
 * Cada provedor é um card com ícone, link "Criar API key" e botão "Nova chave".
 * Por chave: renomear, trocar, excluir, saldo da conta + "Adicionar crédito".
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  KeyRound,
  ExternalLink,
  CreditCard,
  CheckCircle2,
  Wallet,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { getProviderIcon } from "@/components/icons/providers";
import { MoneyDual } from "@/components/ui/money-dual";
import { PROVIDER_META } from "@/lib/agent/llm/catalog";
import type { CredentialSummary } from "@/lib/agent/llm/credentials";
import type { LlmProvider } from "@/lib/agent/llm/types";
import {
  createCredentialAction,
  deleteCredentialAction,
  updateCredentialAction,
  listCredentialsAction,
} from "@/lib/actions/credentials";
import { cn } from "@/lib/utils";

const PROVIDERS: LlmProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
];

interface CredentialsSectionProps {
  initialCredentials: CredentialSummary[];
  onCredentialsChange?: () => void;
  /** Cotação USD→BRL (PTAX × spread × IOF). Null quando indisponível. */
  usdBrlRate?: number | null;
}

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; provider: LlmProvider }
  // "edit" — tela única: muda o nome e (opcionalmente) troca a chave (B3).
  | { mode: "edit"; cred: CredentialSummary };

export function CredentialsSection({
  initialCredentials,
  onCredentialsChange,
  usdBrlRate = null,
}: CredentialsSectionProps) {
  const [items, setItems] =
    useState<CredentialSummary[]>(initialCredentials);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({
    mode: "closed",
  });

  useEffect(() => {
    setItems(initialCredentials);
  }, [initialCredentials]);

  const grouped = useMemo(() => {
    const map: Record<LlmProvider, CredentialSummary[]> = {
      openai: [],
      anthropic: [],
      gemini: [],
      openrouter: [],
    };
    for (const c of items) {
      if (PROVIDERS.includes(c.provider)) map[c.provider].push(c);
    }
    for (const p of PROVIDERS) {
      map[p].sort((a, b) => a.label.localeCompare(b.label));
    }
    return map;
  }, [items]);

  async function reloadFromServer() {
    const res = await listCredentialsAction();
    if (res.success && res.data) setItems(res.data);
    onCredentialsChange?.();
  }

  function confirmDelete(c: CredentialSummary) {
    setDeletingId(c.id);
    startTransition(async () => {
      const r = await deleteCredentialAction(c.id);
      setDeletingId(null);
      if (!r.success) {
        toast.error(r.error ?? "Erro ao remover chave.");
        return;
      }
      toast.success("Chave removida.");
      setItems((arr) => arr.filter((x) => x.id !== c.id));
      onCredentialsChange?.();
    });
  }

  return (
    <div className="space-y-4">
      {PROVIDERS.map((p) => {
        const list = grouped[p] ?? [];
        const meta = PROVIDER_META[p];
        const ProviderIcon = getProviderIcon(p);
        return (
          <section
            key={p}
            data-testid={`credentials-section-${p}`}
            className="rounded-xl border border-border bg-background/40 p-4"
          >
            <header className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-500 dark:text-violet-400"
                >
                  {ProviderIcon ? (
                    <ProviderIcon className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">
                      {meta.label.charAt(0)}
                    </span>
                  )}
                </span>
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {meta.label}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={meta.apiKeyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Criar API key no painel do ${meta.label}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Criar API key
                </a>
                {list.length > 0 ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      setDialogState({ mode: "create", provider: p })
                    }
                    disabled={pending}
                    className="cursor-pointer"
                    aria-label={`Nova chave para ${meta.label}`}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Nova chave
                  </Button>
                ) : null}
              </div>
            </header>

            {list.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                <KeyRound
                  aria-hidden
                  className="mx-auto h-7 w-7 text-muted-foreground"
                />
                <p className="mt-2 text-sm font-medium text-foreground">
                  Nenhuma chave cadastrada para {meta.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Crie uma chave no painel do {meta.label} e cadastre-a aqui
                  para usar nos modelos.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={meta.apiKeyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Criar API key no painel do {meta.label}
                  </a>
                  <Button
                    size="sm"
                    onClick={() =>
                      setDialogState({ mode: "create", provider: p })
                    }
                    disabled={pending}
                    className="cursor-pointer"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Nova chave
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {list.map((c) => {
                  const realBalance =
                    c.balance?.status === "ok" && c.balance.usd != null
                      ? c.balance.usd
                      : null;
                  return (
                    <li
                      key={c.id}
                      data-testid={`credential-row-${c.id}`}
                      className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {c.label}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            ••••••{c.last4}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="inline-flex items-baseline gap-1.5 text-xs text-muted-foreground">
                            <Wallet
                              className="h-3.5 w-3.5 self-center"
                              aria-hidden
                            />
                            Consumo:
                            <MoneyDual
                              usd={c.consumedUsd}
                              rate={usdBrlRate}
                              size="sm"
                            />
                          </span>
                          {realBalance != null ? (
                            <span className="inline-flex items-baseline gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                              <Wallet
                                className="h-3.5 w-3.5 self-center"
                                aria-hidden
                              />
                              Saldo:
                              <MoneyDual
                                usd={realBalance}
                                rate={usdBrlRate}
                                size="sm"
                                className="text-emerald-700 dark:text-emerald-300"
                              />
                            </span>
                          ) : null}
                          {PROVIDER_META[c.provider]?.topUpUrl ? (
                            <a
                              href={PROVIDER_META[c.provider].topUpUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                }),
                                "cursor-pointer gap-1.5",
                              )}
                              title="Abrir o painel de billing do provedor"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              Adicionar crédito
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer gap-1.5"
                          disabled={pending}
                          onClick={() =>
                            setDialogState({ mode: "edit", cred: c })
                          }
                          aria-label={`Editar ${c.label}`}
                          title="Editar nome e chave de API"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <AlertDialog
                          open={deletingId === c.id}
                          onOpenChange={(open) => {
                            // Bug corrigido: o handler antigo ignorava
                            // `open === true`, então o diálogo nunca abria.
                            if (open) {
                              setDeletingId(c.id);
                            } else if (!pending) {
                              setDeletingId(null);
                            }
                          }}
                        >
                          <AlertDialogTrigger
                            render={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={pending}
                                aria-label={`Excluir ${c.label}`}
                                title={`Excluir a chave ${c.label}`}
                              >
                                {deletingId === c.id && pending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Excluir chave &ldquo;{c.label}&rdquo;?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Essa ação remove permanentemente a credencial e
                                não pode ser desfeita. Configurações que usavam
                                essa chave precisarão ser refeitas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel
                                className="cursor-pointer"
                                disabled={pending}
                              >
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                                disabled={pending}
                                onClick={(e) => {
                                  e.preventDefault();
                                  confirmDelete(c);
                                }}
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <CredentialDialog
        state={dialogState}
        onClose={() => setDialogState({ mode: "closed" })}
        onSaved={() => {
          setDialogState({ mode: "closed" });
          void reloadFromServer();
        }}
      />
    </div>
  );
}

interface CredentialDialogProps {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}

function CredentialDialog({ state, onClose, onSaved }: CredentialDialogProps) {
  const open = state.mode !== "closed";
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  // A chave digitada fica visível por padrão — é a primeira (e única) vez
  // que o admin a vê para conferir a colagem. O toggle permite ocultá-la.
  const [showKey, setShowKey] = useState(true);

  const dialogKey =
    state.mode === "closed"
      ? "closed"
      : state.mode === "create"
        ? `create:${state.provider}`
        : `${state.mode}:${state.cred.id}`;

  useEffect(() => {
    if (state.mode === "closed") return;
    setLabel(state.mode === "edit" ? state.cred.label : "");
    setApiKey("");
    setShowKey(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogKey]);

  if (!open) return null;

  const provider =
    state.mode === "create"
      ? state.provider
      : (state.cred.provider as LlmProvider);

  function submit() {
    const current = state;
    if (current.mode === "closed") return;
    startTransition(async () => {
      if (current.mode === "create") {
        if (!label.trim() || !apiKey.trim()) {
          toast.error("Preencha o nome e a chave de API.");
          return;
        }
        const r = await createCredentialAction({
          provider: current.provider,
          label: label.trim(),
          apiKey: apiKey.trim(),
        });
        if (!r.success) {
          toast.error(r.error ?? "Erro ao criar chave.");
          return;
        }
        toast.success("Chave criada.");
        onSaved();
        return;
      }
      // edit — muda o nome e, se uma nova chave foi colada, troca a chave.
      const trimmed = label.trim();
      if (!trimmed) {
        toast.error("Informe um nome para a chave.");
        return;
      }
      const trimmedKey = apiKey.trim();
      const r = await updateCredentialAction(current.cred.id, {
        label: trimmed,
        ...(trimmedKey ? { apiKey: trimmedKey } : {}),
      });
      if (!r.success) {
        toast.error(r.error ?? "Erro ao salvar a chave.");
        return;
      }
      toast.success("Chave atualizada.");
      onSaved();
    });
  }

  const title = state.mode === "create" ? "Nova chave" : "Editar chave";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {title} — {PROVIDER_META[provider].label}
          </DialogTitle>
          <DialogDescription>
            A chave é armazenada cifrada (AES-256) e nunca é exibida novamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cred-label">
              Nome{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id="cred-label"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
              placeholder="Ex: Conta principal"
              maxLength={60}
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cred-key">
              Chave de API{" "}
              {state.mode === "create" ? (
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              ) : null}
            </Label>
            <div className="relative">
              <Input
                id="cred-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                placeholder={
                  state.mode === "edit" ? "Nova chave — opcional" : "sk-…"
                }
                className="pr-10 font-mono"
                disabled={pending}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                title={showKey ? "Ocultar chave" : "Mostrar chave"}
                tabIndex={-1}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {state.mode === "edit" ? (
              <p className="text-xs leading-snug text-muted-foreground">
                Deixe em branco para manter a chave atual. Cole uma nova chave
                apenas se quiser trocá-la.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            className="cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending}
            className="cursor-pointer"
          >
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
