"use client";

/**
 * LlmConfigForm — configuração da conexão LLM do Agente Nex (super_admin only).
 *
 * Rework F5-UI v2: clone visual do `llm-config-form` do nexus-insights.
 * - Região "Agente Nex ativo" (dot + Switch) controla a bolha flutuante.
 * - Seção "Conexão LLM": Provedor | Modelo na mesma linha; Chave de API abaixo;
 *   banner de status; botões "Testar conexão" / "Salvar configuração".
 * - Salvar é um upsert do singleton de produção (cria + ativa a config).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Plug,
  KeyRound,
  AlertCircle,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CustomSelect,
  type SelectOption,
} from "@/components/ui/custom-select";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { TierBadge } from "@/components/ui/tier-badge";
import {
  PROVIDER_META,
  listModels,
  modelDescription,
} from "@/lib/agent/llm/catalog";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { CredentialSummary } from "@/lib/agent/llm/credentials";
import type { PublicLlmConfig } from "@/lib/agent/llm/get-active-config";
import {
  createLlmConfig,
  activateLlmConfig,
  updateBubbleEnabled,
} from "@/lib/actions/agent-config";
import { testCredentialConnectionAction } from "@/lib/actions/credentials";
import { cn } from "@/lib/utils";

const CUSTOM_MODEL_VALUE = "__custom__";
const NEW_CREDENTIAL_VALUE = "__new__";

const PROVIDERS: LlmProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
];

const PROVIDER_OPTIONS: SelectOption[] = PROVIDERS.map((p) => ({
  value: p,
  label: PROVIDER_META[p].label,
}));

interface LlmConfigItem {
  id: string;
  provider: LlmProvider;
  model: string;
}

interface LlmConfigFormProps {
  /** Config LLM ativa (singleton de produção), ou null. */
  activeConfig: PublicLlmConfig | null;
  /** Configs já cadastradas — reusa o id em vez de duplicar ao salvar. */
  configs: LlmConfigItem[];
  credentials: CredentialSummary[];
  /** Estado atual do toggle "Agente Nex ativo". */
  bubbleEnabled: boolean;
}

interface TestState {
  status: "idle" | "ok" | "fail";
  message?: string;
}

export function LlmConfigForm({
  activeConfig,
  configs,
  credentials,
  bubbleEnabled,
}: LlmConfigFormProps) {
  const router = useRouter();

  const [provider, setProvider] = useState<LlmProvider>(
    activeConfig?.provider ?? "openai",
  );

  const initialModel = useMemo(() => {
    if (!activeConfig?.model) {
      return { select: listModels(provider)[0]?.id ?? "", custom: "" };
    }
    const inCatalog = listModels(activeConfig.provider).some(
      (m) => m.id === activeConfig.model,
    );
    return inCatalog
      ? { select: activeConfig.model, custom: "" }
      : { select: CUSTOM_MODEL_VALUE, custom: activeConfig.model };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConfig]);

  const [modelSelect, setModelSelect] = useState(initialModel.select);
  const [customModel, setCustomModel] = useState(initialModel.custom);
  const [credentialId, setCredentialId] = useState<string>(
    activeConfig?.credentialId ?? "",
  );

  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [bubble, setBubble] = useState(bubbleEnabled);
  const [isTogglingBubble, startBubbleToggle] = useTransition();

  const meta = PROVIDER_META[provider];
  const models = useMemo(() => listModels(provider), [provider]);

  const modelOptions = useMemo<SearchableSelectOption[]>(() => {
    const fromCatalog: SearchableSelectOption[] = models.map((m) => ({
      value: m.id,
      label: m.label,
      notes: modelDescription(m),
      endAdornment: <TierBadge tier={m.tier} />,
    }));
    if (meta.allowCustomModel) {
      fromCatalog.push({
        value: CUSTOM_MODEL_VALUE,
        label: "Outro (digitar manualmente)",
        notes: "Especifique um ID de modelo customizado",
      });
    }
    return fromCatalog;
  }, [models, meta]);

  const credentialsForProvider = useMemo(
    () => credentials.filter((c) => c.provider === provider),
    [credentials, provider],
  );

  const credentialOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = credentialsForProvider.map((c) => ({
      value: c.id,
      label: `${c.label} · ••••${c.last4}`,
    }));
    opts.push({
      value: NEW_CREDENTIAL_VALUE,
      label: "+ Nova chave",
      description: "Cadastrar em 'Chaves de API'",
    });
    return opts;
  }, [credentialsForProvider]);

  const usingCustom = modelSelect === CUSTOM_MODEL_VALUE;
  const resolvedModel = (usingCustom ? customModel : modelSelect).trim();
  const hasNoCredentials = credentialsForProvider.length === 0;

  // Credencial efetiva: a escolha do usuário, se ainda existir no provider;
  // senão a primeira disponível; senão vazio.
  const effectiveCredentialId = useMemo(() => {
    if (
      credentialId &&
      credentialsForProvider.some((c) => c.id === credentialId)
    ) {
      return credentialId;
    }
    return credentialsForProvider[0]?.id ?? "";
  }, [credentialId, credentialsForProvider]);

  const isConfigured = Boolean(activeConfig);
  const busy = isSaving || isTesting;
  const actionsDisabled = busy || hasNoCredentials || !effectiveCredentialId;

  function handleProviderChange(next: string) {
    const p = next as LlmProvider;
    setProvider(p);
    setModelSelect(listModels(p)[0]?.id ?? "");
    setCustomModel("");
    setCredentialId("");
    setTest({ status: "idle" });
  }

  function handleModelChange(next: string) {
    setModelSelect(next);
    if (next !== CUSTOM_MODEL_VALUE) setCustomModel("");
    setTest({ status: "idle" });
  }

  function handleCredentialChange(next: string) {
    if (next === NEW_CREDENTIAL_VALUE) {
      router.push("/agente/chaves");
      toast.info("Cadastre a nova chave em 'Chaves de API'.");
      return;
    }
    setCredentialId(next);
    setTest({ status: "idle" });
  }

  function validate(): string | null {
    if (!provider) return "Selecione um provedor";
    if (!resolvedModel || resolvedModel.length < 2) {
      return usingCustom ? "Informe o ID do modelo" : "Selecione um modelo";
    }
    if (!effectiveCredentialId) {
      return "Cadastre uma chave de API antes de continuar";
    }
    return null;
  }

  async function persistConfig(): Promise<boolean> {
    // Reusa uma config existente igual (provider+model+credential) ou cria uma.
    const existing = configs.find(
      (c) => c.provider === provider && c.model === resolvedModel,
    );
    let configId = existing?.id;
    if (!configId) {
      const created = await createLlmConfig({
        provider,
        model: resolvedModel,
        credentialId: effectiveCredentialId,
      });
      if (!created.success) {
        toast.error(created.error ?? "Erro ao salvar configuração");
        return false;
      }
      if (!created.data) {
        toast.error("Erro ao salvar configuração");
        return false;
      }
      configId = created.data.id;
    }
    const activated = await activateLlmConfig(configId);
    if (!activated.success) {
      toast.error(activated.error ?? "Erro ao ativar configuração");
      return false;
    }
    router.refresh();
    return true;
  }

  function handleTest() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    startTest(async () => {
      const result = await testCredentialConnectionAction(
        effectiveCredentialId,
        provider,
        resolvedModel,
      );
      if (!result.success) {
        setTest({ status: "fail", message: result.error });
        toast.error(result.error ?? "Erro ao testar conexão");
        return;
      }
      if (!result.data) {
        setTest({ status: "fail", message: "Resposta inválida do teste" });
        toast.error("Resposta inválida do teste");
        return;
      }
      if (result.data.reachable) {
        setTest({ status: "ok", message: "Conexão verificada com sucesso." });
        toast.success("Conexão OK");
      } else {
        setTest({
          status: "fail",
          message: result.data.message ?? "Falha ao conectar",
        });
        toast.error(result.data.message ?? "Falha ao conectar");
      }
    });
  }

  function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    startSave(async () => {
      const saved = await persistConfig();
      if (saved) {
        setTest({ status: "idle" });
        toast.success("Configuração salva.");
      }
    });
  }

  function handleBubbleToggle(checked: boolean) {
    if (!isConfigured) {
      toast.error("Configure um provedor antes de ativar o Agente Nex.");
      return;
    }
    const previous = bubble;
    setBubble(checked);
    startBubbleToggle(async () => {
      const result = await updateBubbleEnabled(checked);
      if (!result.success) {
        setBubble(previous);
        toast.error(result.error ?? "Erro ao salvar preferência.");
        return;
      }
      toast.success(
        checked
          ? "Agente Nex ativado — bolha visível em todas as páginas."
          : "Agente Nex desativado — bolha oculta.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* Região: Agente Nex ativo */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full transition-[background-color,box-shadow] duration-200",
              bubble
                ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
                : "bg-zinc-400 dark:bg-zinc-600",
            )}
          />
          <div className="min-w-0">
            <Label
              htmlFor="agent-bubble-toggle"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              {bubble ? "Agente Nex ativo" : "Agente Nex desativado"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {!isConfigured
                ? "Configure um provedor abaixo para liberar a bolha flutuante."
                : bubble
                  ? "A bolha flutuante aparece em todas as páginas autenticadas."
                  : "A bolha flutuante está oculta para todos os usuários."}
            </p>
          </div>
        </div>
        <Switch
          id="agent-bubble-toggle"
          checked={bubble}
          onCheckedChange={handleBubbleToggle}
          disabled={isTogglingBubble || !isConfigured}
          aria-label={bubble ? "Desativar Agente Nex" : "Ativar Agente Nex"}
        />
      </div>

      {/* Seção: Conexão LLM */}
      <div className="space-y-6 border-t border-border/50 pt-6">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs",
            isConfigured
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
          role="status"
          aria-live="polite"
        >
          {isConfigured ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="leading-snug">
            {isConfigured
              ? `Conexão ativa: ${PROVIDER_META[activeConfig!.provider]?.label ?? activeConfig!.provider} · ${activeConfig!.model}${
                  activeConfig!.credentialLabel
                    ? ` · ${activeConfig!.credentialLabel}`
                    : ""
                }`
              : "Nenhuma conexão ativa — selecione provedor, modelo e chave abaixo."}
          </span>
        </div>

        {/* Provedor | Modelo na mesma linha */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="llm-provider">Provedor</Label>
            <CustomSelect
              aria-label="Provedor"
              value={provider}
              onChange={handleProviderChange}
              options={PROVIDER_OPTIONS}
              placeholder="Selecionar provedor"
              disabled={busy}
              triggerClassName="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              Plataforma de IA que processará as consultas do Agente Nex.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm-model">Modelo</Label>
            <SearchableSelect
              value={modelSelect}
              onChange={handleModelChange}
              options={modelOptions}
              customMode={{
                sentinel: CUSTOM_MODEL_VALUE,
                customValue: customModel,
                onCustomChange: (next) => {
                  setCustomModel(next);
                  setTest({ status: "idle" });
                },
                placeholder: "ex: gpt-5.5-2026-04-15",
                inputAriaLabel: "ID do modelo customizado",
              }}
              placeholder="Selecionar modelo"
              disabled={busy}
              searchPlaceholder="Buscar modelo..."
              triggerClassName="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              {usingCustom
                ? "Modelo customizado — útil para snapshots datados."
                : "Tier $ / $$ / $$$ / $$$$ indica o custo por milhão de tokens."}
            </p>
          </div>
        </div>

        {/* Chave de API — abaixo, largura total */}
        <div className="space-y-1.5">
          <Label htmlFor="llm-credential" className="gap-2">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            Chave de API
          </Label>
          <CustomSelect
            aria-label="Chave de API"
            value={
              effectiveCredentialId ||
              (hasNoCredentials ? NEW_CREDENTIAL_VALUE : "")
            }
            onChange={handleCredentialChange}
            options={credentialOptions}
            placeholder={
              hasNoCredentials ? "Sem chaves cadastradas" : "Selecionar chave"
            }
            disabled={busy}
            triggerClassName="min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground">
            {hasNoCredentials
              ? `Nenhuma chave cadastrada para ${meta.label}. Use 'Chaves de API' para adicionar.`
              : "As chaves são gerenciadas em 'Chaves de API'."}
          </p>
          {meta.topUpUrl ? (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <a
                href={meta.topUpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                Adicionar crédito
              </a>
            </div>
          ) : null}
        </div>

        {/* Resultado do teste */}
        {test.status !== "idle" && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs",
              test.status === "ok" &&
                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              test.status === "fail" && "bg-destructive/10 text-destructive",
            )}
            role="status"
            aria-live="polite"
          >
            {test.status === "ok" ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <div className="flex-1 leading-snug">
              <p className="font-medium">
                {test.status === "ok"
                  ? "Conexão verificada"
                  : "Falha ao conectar"}
              </p>
              {test.message && (
                <p className="break-words opacity-80">{test.message}</p>
              )}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={actionsDisabled}
            className="cursor-pointer"
          >
            {isTesting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plug className="mr-1.5 h-4 w-4" />
            )}
            Testar conexão
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={actionsDisabled}
            className="cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Salvar configuração
          </Button>
        </div>

        {hasNoCredentials ? (
          <p className="text-xs text-amber-600 dark:text-amber-400" role="note">
            Sem chaves cadastradas para {meta.label} — botões desativados.
            Cadastre uma em &ldquo;Chaves de API&rdquo;.
          </p>
        ) : null}
      </div>
    </div>
  );
}
