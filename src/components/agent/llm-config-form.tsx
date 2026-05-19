"use client";

/**
 * LlmConfigForm — seleção e ativação de configuração LLM do agente.
 *
 * Portado de nexus-insights/src/components/agente-nex/llm-config-form.tsx.
 * Adaptações:
 * - Renomeação nex→agent.
 * - Usa `activateLlmConfig` de agent-config.ts (Task 3.0a).
 * - Usa catálogo unificado de catalog.ts (sem drift).
 * - API base-ui do Select (items + onValueChange).
 *
 * Design: Task 3.0d — docs/superpowers/research/2026-05-18-f5-ui-design.md
 */

import { useState, useTransition, useMemo } from "react";
import { Loader2, CheckCircle2, Cpu, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { activateLlmConfig } from "@/lib/actions/agent-config";
import { PROVIDER_META, MODELS, type ModelEntry } from "@/lib/agent/llm/catalog";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { CredentialSummary } from "@/lib/agent/llm/credentials";
import type { PublicLlmConfig } from "@/lib/agent/llm/get-active-config";
import { cn } from "@/lib/utils";

const CUSTOM_MODEL_VALUE = "__custom__";

const PROVIDERS: { value: LlmProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "openrouter", label: "OpenRouter" },
];

const TIER_COLORS: Record<string, string> = {
  low: "text-emerald-600 dark:text-emerald-400",
  medium: "text-blue-600 dark:text-blue-400",
  high: "text-amber-600 dark:text-amber-400",
  premium: "text-violet-600 dark:text-violet-400",
};

interface LlmConfigItem {
  id: string;
  provider: LlmProvider;
  model: string;
  isActive: boolean;
  credentialId: string | null;
  credentialLabel: string | null;
  last4: string | null;
}

interface LlmConfigFormProps {
  configs: LlmConfigItem[];
  credentials: CredentialSummary[];
  activeConfig: PublicLlmConfig | null;
  onConfigsChange?: () => void;
}

export function LlmConfigForm({
  configs,
  credentials,
  activeConfig,
  onConfigsChange,
}: LlmConfigFormProps) {
  const [isPending, startTransition] = useTransition();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProvider, setNewProvider] = useState<LlmProvider>("openai");
  const [newModel, setNewModel] = useState<string>("");
  const [newCustomModel, setNewCustomModel] = useState("");
  const [newCredentialId, setNewCredentialId] = useState<string>("");

  const modelsForProvider = useMemo<ModelEntry[]>(
    () => MODELS.filter((m) => m.provider === newProvider),
    [newProvider],
  );

  const modelItems = useMemo(
    () => [
      ...modelsForProvider.map((m) => ({ value: m.id, label: m.label, tier: m.tier })),
      ...(PROVIDER_META[newProvider].allowCustomModel
        ? [{ value: CUSTOM_MODEL_VALUE, label: "Outro (digitar manualmente)", tier: undefined }]
        : []),
    ],
    [modelsForProvider, newProvider],
  );

  const credentialsForProvider = useMemo(
    () => credentials.filter((c) => c.provider === newProvider),
    [credentials, newProvider],
  );

  const credentialItems = useMemo(
    () =>
      credentialsForProvider.map((c) => ({
        value: c.id,
        label: `${c.label} · ••••${c.last4}`,
      })),
    [credentialsForProvider],
  );

  const resolvedModel =
    newModel === CUSTOM_MODEL_VALUE ? newCustomModel : newModel;

  function handleActivate(configId: string) {
    startTransition(async () => {
      const result = await activateLlmConfig(configId);
      if (result.success) {
        toast.success("Configuração ativada com sucesso.");
        onConfigsChange?.();
      } else {
        toast.error(result.error ?? "Erro ao ativar configuração.");
      }
    });
  }

  async function handleCreate() {
    if (!resolvedModel.trim() || !newCredentialId) {
      toast.error("Selecione modelo e credencial.");
      return;
    }
    startTransition(async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        await (prisma.llmConfig as { create: (args: unknown) => Promise<unknown> }).create({
          data: {
            provider: newProvider,
            model: resolvedModel.trim(),
            credentialId: newCredentialId || null,
            isActive: false,
          },
        });
        toast.success("Config criada. Clique em Ativar para usá-la.");
        setShowNewForm(false);
        setNewModel("");
        setNewCustomModel("");
        setNewCredentialId("");
        onConfigsChange?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar configuração.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Modelo de IA</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowNewForm(!showNewForm)}
          className="cursor-pointer"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 mr-1.5 transition-transform duration-200",
              showNewForm && "rotate-180",
            )}
          />
          {showNewForm ? "Fechar" : "Nova config"}
        </Button>
      </div>

      {/* Formulário nova config */}
      {showNewForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-provider" className="text-xs">Provedor</Label>
              <Select
                items={PROVIDERS}
                value={newProvider}
                onValueChange={(v) => {
                  setNewProvider((v ?? "openai") as LlmProvider);
                  setNewModel("");
                  setNewCredentialId("");
                }}
              >
                <SelectTrigger id="cfg-provider" className="h-9 text-sm cursor-pointer w-full">
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
              <Label htmlFor="cfg-credential" className="text-xs">Credencial</Label>
              <Select
                items={credentialItems}
                value={newCredentialId}
                onValueChange={(v) => setNewCredentialId(String(v ?? ""))}
              >
                <SelectTrigger id="cfg-credential" className="h-9 text-sm cursor-pointer w-full">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {credentialsForProvider.length === 0 ? (
                    <div className="py-2 text-center text-xs text-muted-foreground">
                      Nenhuma credencial para {PROVIDER_META[newProvider].label}
                    </div>
                  ) : (
                    credentialsForProvider.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="cursor-pointer">
                        {c.label} · ••••{c.last4}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-model" className="text-xs">Modelo</Label>
            <Select
              items={modelItems}
              value={newModel}
              onValueChange={(v) => setNewModel(String(v ?? ""))}
            >
              <SelectTrigger id="cfg-model" className="h-9 text-sm cursor-pointer w-full">
                <SelectValue placeholder="Selecione o modelo…" />
              </SelectTrigger>
              <SelectContent>
                {modelItems.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="cursor-pointer">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{m.label}</span>
                      {m.tier && (
                        <span className={cn("text-[10px] font-medium", TIER_COLORS[m.tier])}>
                          {m.tier}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {newModel === CUSTOM_MODEL_VALUE && (
              <Input
                value={newCustomModel}
                onChange={(e) => setNewCustomModel(e.target.value)}
                placeholder="ID exato do modelo (ex: gpt-4-turbo)"
                className="h-9 text-sm font-mono mt-1.5"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              disabled={isPending}
              className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Criar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNewForm(false)}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de configs existentes */}
      <div className="space-y-2">
        {configs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma configuração de modelo. Crie uma acima.
          </p>
        )}
        {configs.map((cfg) => {
          const isActive = cfg.id === activeConfig?.id;
          return (
            <div
              key={cfg.id}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
                isActive
                  ? "border-violet-500/40 bg-violet-500/5"
                  : "border-border bg-background",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                {isActive && (
                  <Badge className="shrink-0 text-[10px] bg-violet-600 text-white">
                    Ativo
                  </Badge>
                )}
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {PROVIDER_META[cfg.provider]?.label ?? cfg.provider}
                </Badge>
                <span className="text-sm font-mono truncate">{cfg.model}</span>
                {cfg.credentialLabel && (
                  <span className="text-xs text-muted-foreground truncate">
                    {cfg.credentialLabel} ••••{cfg.last4}
                  </span>
                )}
              </div>
              {!isActive && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleActivate(cfg.id)}
                  disabled={isPending}
                  className="cursor-pointer shrink-0"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Ativar"
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
