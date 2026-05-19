"use client";

/**
 * CredentialsSection — gerenciamento de chaves de API por provedor.
 *
 * Rework F5-UI: credenciais agrupadas em cards por provedor (paridade com o
 * LlmCredentialsManager do nexus-insights); o formulário de nova chave virou
 * um Dialog do design system; selects nativos/base-ui crus → CustomSelect.
 */

import { useMemo, useState, useTransition } from "react";
import {
  KeyRound,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import type { CredentialSummary } from "@/lib/agent/llm/credentials";
import type { LlmProvider } from "@/lib/agent/llm/types";
import {
  createCredentialAction,
  deleteCredentialAction,
  listCredentialsAction,
} from "@/lib/actions/credentials";
import { PROVIDER_META } from "@/lib/agent/llm/catalog";

const PROVIDERS: { value: LlmProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "openrouter", label: "OpenRouter" },
];

interface CredentialsSectionProps {
  initialCredentials: CredentialSummary[];
  onCredentialsChange?: () => void;
}

export function CredentialsSection({
  initialCredentials,
  onCredentialsChange,
}: CredentialsSectionProps) {
  const [credentials, setCredentials] =
    useState<CredentialSummary[]>(initialCredentials);
  const [dialogProvider, setDialogProvider] = useState<LlmProvider | null>(null);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const byProvider = useMemo(() => {
    const map: Record<string, CredentialSummary[]> = {};
    for (const p of PROVIDERS) map[p.value] = [];
    for (const c of credentials) {
      (map[c.provider] ??= []).push(c);
    }
    return map;
  }, [credentials]);

  function openDialog(provider: LlmProvider) {
    setDialogProvider(provider);
    setLabel("");
    setApiKey("");
  }

  function handleAdd() {
    if (!dialogProvider) return;
    if (!label.trim() || !apiKey.trim()) {
      toast.error("Preencha o nome e a chave de API.");
      return;
    }

    startTransition(async () => {
      const result = await createCredentialAction({
        provider: dialogProvider,
        label: label.trim(),
        apiKey: apiKey.trim(),
      });
      if (!result.success) {
        toast.error(result.error ?? "Erro ao adicionar chave.");
        return;
      }
      toast.success("Chave adicionada com sucesso.");
      setDialogProvider(null);
      onCredentialsChange?.();

      const listResult = await listCredentialsAction();
      if (listResult.success && listResult.data) {
        setCredentials(listResult.data);
      }
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteCredentialAction(id);
      setDeletingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao remover chave.");
        return;
      }
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      toast.success("Chave removida.");
      onCredentialsChange?.();
    });
  }

  return (
    <div className="space-y-4">
      {PROVIDERS.map((p) => {
        const creds = byProvider[p.value] ?? [];
        return (
          <div
            key={p.value}
            className="rounded-xl border border-border bg-background"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{p.label}</h3>
                <Badge variant="outline" className="text-[10px]">
                  {creds.length}{" "}
                  {creds.length === 1 ? "chave" : "chaves"}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openDialog(p.value)}
                className="cursor-pointer min-h-[44px]"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nova chave
              </Button>
            </div>

            <div className="p-3">
              {creds.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Nenhuma chave para {p.label}.
                </div>
              ) : (
                <div className="space-y-2">
                  {creds.map((cred) => (
                    <div
                      key={cred.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {cred.label}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          ••••{cred.last4}
                        </span>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              disabled={deletingId === cred.id}
                              aria-label={`Remover chave ${cred.label}`}
                            >
                              {deletingId === cred.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover chave?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A chave &ldquo;{cred.label}&rdquo; será removida
                              permanentemente. Configurações de modelo que a
                              usam precisarão ser atualizadas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="cursor-pointer">
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(cred.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Dialog: nova chave */}
      <Dialog
        open={dialogProvider !== null}
        onOpenChange={(open) => {
          if (!open) setDialogProvider(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Nova chave
              {dialogProvider
                ? ` — ${PROVIDER_META[dialogProvider]?.label ?? dialogProvider}`
                : ""}
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
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: OpenAI produção"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-key">
                Chave de API{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="cred-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogProvider(null)}
              className="cursor-pointer min-h-[44px]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={isPending}
              className="cursor-pointer min-h-[44px]"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Salvar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
