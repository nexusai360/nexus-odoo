"use client";

/**
 * LlmConfigForm — seleção e ativação de configuração LLM do agente.
 *
 * Rework F5-UI: usa os selects ricos do design system (CustomSelect para
 * provedor/credencial, SearchableSelect + TierBadge para modelo), em paridade
 * com o `llm-config-form` do nexus-insights. Mantém o modelo de dados do
 * nexus-odoo (lista de configs + ativar) — só a UI mudou.
 */

import { useState, useTransition, useMemo } from "react";
import { Loader2, CheckCircle2, Cpu, ChevronDown, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CustomSelect,
  type SelectOption,
} from "@/components/ui/custom-select";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { TierBadge } from "@/components/ui/tier-badge";
import { activateLlmConfig, createLlmConfig } from "@/lib/actions/agent-config";
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

const PROVIDER_OPTIONS: SelectOption[] = PROVIDERS.map((p) => ({
  value: p.value,
  label: p.label,
}));

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

  const modelOptions = useMemo<SearchableSelectOption[]>(() => {
    const fromCatalog: SearchableSelectOption[] = modelsForProvider.map((m) => ({
      value: m.id,
      label: m.label,
      notes: m.notes,
      endAdornment: <TierBadge tier={m.tier} />,
    }));
    if (PROVIDER_META[newProvider].allowCustomModel) {
      fromCatalog.push({
        value: CUSTOM_MODEL_VALUE,
        label: "Outro (digitar manualmente)",
        notes: "Especifique um ID de modelo customizado",
      });
    }
    return fromCatalog;
  }, [modelsForProvider, newProvider]);

  const credentialsForProvider = useMemo(
    () => credentials.filter((c) => c.provider === newProvider),
    [credentials, newProvider],
  );

  const credentialOptions = useMemo<SelectOption[]>(
    () =>
      credentialsForProvider.map((c) => ({
        value: c.id,
        label: `${c.label} · ••••${c.last4}`,
      })),
    [credentialsForProvider],
  );

  const resolvedModel =
    newModel === CUSTOM_MODEL_VALUE ? newCustomModel : newModel;
  const hasNoCredentials = credentialsForProvider.length === 0;

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

  function handleCreate() {
    if (!resolvedModel.trim() || !newCredentialId) {
      toast.error("Selecione modelo e credencial.");
      return;
    }
    startTransition(async () => {
      const result = await createLlmConfig({
        provider: newProvider,
        model: resolvedModel.trim(),
        credentialId: newCredentialId || null,
      });
      if (result.success) {
        toast.success("Configuração criada. Clique em Ativar para usá-la.");
        setShowNewForm(false);
        setNewModel("");
        setNewCustomModel("");
        setNewCredentialId("");
        onConfigsChange?.();
      } else {
        toast.error(result.error ?? "Erro ao criar configuração.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Banner de status */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs",
          activeConfig
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="leading-snug">
          {activeConfig
            ? `Conexão ativa: ${PROVIDER_META[activeConfig.provider]?.label ?? activeConfig.provider} · ${activeConfig.model}`
            : "Nenhuma conexão ativa — crie e ative uma configuração de modelo."}
        </span>
      </div>

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
          className="cursor-pointer min-h-[44px]"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 mr-1.5 transition-transform duration-200",
              showNewForm && "rotate-180",
            )}
          />
          {showNewForm ? "Fechar" : "Nova configuração"}
        </Button>
      </div>

      {/* Formulário nova config */}
      {showNewForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-provider">Provedor</Label>
              <CustomSelect
                aria-label="Provedor"
                value={newProvider}
                onChange={(v) => {
                  setNewProvider(v as LlmProvider);
                  setNewModel("");
                  setNewCredentialId("");
                }}
                options={PROVIDER_OPTIONS}
                placeholder="Selecionar provedor"
                disabled={isPending}
                triggerClassName="min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-credential" className="gap-2">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                Chave de API
              </Label>
              <CustomSelect
                aria-label="Chave de API"
                value={newCredentialId}
                onChange={(v) => setNewCredentialId(v)}
                options={credentialOptions}
                placeholder={
                  hasNoCredentials
                    ? "Sem chaves cadastradas"
                    : "Selecionar chave"
                }
                disabled={isPending || hasNoCredentials}
                triggerClassName="min-h-[44px]"
              />
              {hasNoCredentials ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Nenhuma chave para {PROVIDER_META[newProvider].label}.
                  Cadastre em &quot;Chaves de API&quot;.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-model">Modelo</Label>
            <SearchableSelect
              value={newModel}
              onChange={(v) => {
                setNewModel(v);
                if (v !== CUSTOM_MODEL_VALUE) setNewCustomModel("");
              }}
              options={modelOptions}
              customMode={{
                sentinel: CUSTOM_MODEL_VALUE,
                customValue: newCustomModel,
                onCustomChange: setNewCustomModel,
                placeholder: "ex: gpt-4-turbo",
                inputAriaLabel: "ID do modelo customizado",
              }}
              placeholder="Selecionar modelo"
              disabled={isPending}
              searchPlaceholder="Buscar modelo..."
              triggerClassName="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              O tier $ / $$ / $$$ / $$$$ indica o custo aproximado por milhão de
              tokens.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowNewForm(false)}
              className="cursor-pointer min-h-[44px]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="cursor-pointer min-h-[44px]"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Criar configuração
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
                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
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
                  className="cursor-pointer shrink-0 min-h-[44px]"
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
