"use client";

/**
 * CredentialsSection — seção de gerenciamento de credenciais LLM.
 *
 * Portado de nexus-insights/src/components/agente-nex/llm-config-form.tsx
 * (seção de credenciais). Adaptações: renomeação nex→agent, usa actions de
 * credentials.ts da F5, API base-ui do Select.
 *
 * Design: Task 3.0d — docs/superpowers/research/2026-05-18-f5-ui-design.md
 */

import { useState, useTransition } from "react";
import { KeyRound, Trash2, Plus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [credentials, setCredentials] = useState<CredentialSummary[]>(initialCredentials);
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState<LlmProvider>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleAdd() {
    if (!label.trim() || !apiKey.trim()) {
      toast.error("Preencha o label e a chave de API.");
      return;
    }

    startTransition(async () => {
      const result = await createCredentialAction({
        provider,
        label: label.trim(),
        apiKey: apiKey.trim(),
      });
      if (!result.success) {
        toast.error(result.error ?? "Erro ao adicionar credencial.");
        return;
      }
      toast.success("Credencial adicionada com sucesso.");
      setLabel("");
      setApiKey("");
      setShowForm(false);
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
        toast.error(result.error ?? "Erro ao remover credencial.");
        return;
      }
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      toast.success("Credencial removida.");
      onCredentialsChange?.();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Chaves de API</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nova chave
        </Button>
      </div>

      {/* Formulário de nova chave */}
      {showForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cred-provider" className="text-xs">Provedor</Label>
              <Select
                items={PROVIDERS}
                value={provider}
                onValueChange={(v) => setProvider((v ?? "openai") as LlmProvider)}
              >
                <SelectTrigger id="cred-provider" className="h-9 text-sm cursor-pointer w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value} className="cursor-pointer">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-label" className="text-xs">
                Label <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="cred-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: OpenAI produção"
                className="h-9 text-sm"
                maxLength={60}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cred-key" className="text-xs">
              Chave de API <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Input
              id="cred-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className="h-9 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Armazenada cifrada (AES-256). Nunca exibida novamente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={isPending}
              className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Salvar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de credenciais */}
      {credentials.length === 0 && !showForm ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Nenhuma credencial cadastrada. Adicione uma chave de API para habilitar o agente.
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {PROVIDER_META[cred.provider as LlmProvider]?.label ?? cred.provider}
                </Badge>
                <span className="text-sm font-medium truncate">{cred.label}</span>
                <span className="text-xs text-muted-foreground font-mono shrink-0">
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
                      className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={deletingId === cred.id}
                      aria-label={`Remover credencial ${cred.label}`}
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
                    <AlertDialogTitle>Remover credencial?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A credencial &ldquo;{cred.label}&rdquo; será removida permanentemente.
                      Configs de LLM que usam esta chave precisarão ser atualizadas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
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
  );
}
