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
  Plus,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "@/lib/actions/agent-config";
import { testCredentialConnectionAction } from "@/lib/actions/credentials";
import { syncProviderModels } from "@/lib/actions/sync-models";
import { cn } from "@/lib/utils";

const CUSTOM_MODEL_VALUE = "__custom__";

function SyncModelsButton({ provider }: { provider: LlmProvider }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title="Buscar modelos novos e atualizar precos do provedor"
      aria-label="Atualizar modelos"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const r = await syncProviderModels(provider);
          if (!r.success) {
            toast.error(r.error ?? "Falha ao atualizar.");
            return;
          }
          const novos = r.novos?.length ?? 0;
          const atualizados = r.atualizados?.length ?? 0;
          const revividos = r.revividos?.length ?? 0;
          const depreciados = r.depreciados?.length ?? 0;
          const ignoradosWL = r.ignoradosWhitelist?.length ?? 0;
          const ignoradosSP = r.ignoradosSemPricing?.length ?? 0;
          const partes: string[] = [];
          if (novos) partes.push(`${novos} novo(s)`);
          if (atualizados) partes.push(`${atualizados} atualizado(s)`);
          if (revividos) partes.push(`${revividos} reativado(s)`);
          if (depreciados) partes.push(`${depreciados} desativado(s)`);
          if (ignoradosWL) partes.push(`${ignoradosWL} fora da whitelist`);
          if (ignoradosSP) partes.push(`${ignoradosSP} sem preco`);
          toast.success(
            partes.length
              ? `Catalogo sincronizado: ${partes.join(", ")}.`
              : "Catalogo ja esta atualizado.",
          );
          router.refresh();
        });
      }}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

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
  /**
   * Modelos efetivos por provedor (base do catalog + overrides do banco).
   * Quando ausente, cai em `modelsFor(provider)` (só a base versionada).
   */
  modelsByProvider?: Partial<Record<LlmProvider, import("@/lib/agent/llm/catalog").ModelEntry[]>>;
}

interface TestState {
  status: "idle" | "ok" | "fail";
  message?: string;
}

export function LlmConfigForm({
  activeConfig,
  configs,
  credentials,
  modelsByProvider,
}: LlmConfigFormProps) {
  const router = useRouter();
  const modelsFor = (p: LlmProvider) => modelsByProvider?.[p] ?? listModels(p);

  const [provider, setProvider] = useState<LlmProvider>(
    activeConfig?.provider ?? "openai",
  );

  const initialModel = useMemo(() => {
    if (!activeConfig?.model) {
      return { select: modelsFor(provider)[0]?.id ?? "", custom: "" };
    }
    const inCatalog = modelsFor(activeConfig.provider).some(
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
  const meta = PROVIDER_META[provider];
  const models = useMemo(
    () => modelsByProvider?.[provider] ?? listModels(provider),
    [provider, modelsByProvider],
  );

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

  const credentialOptions = useMemo<SelectOption[]>(
    () =>
      credentialsForProvider.map((c) => ({
        value: c.id,
        label: `${c.label} · ••••${c.last4}`,
      })),
    [credentialsForProvider],
  );

  const usingCustom = modelSelect === CUSTOM_MODEL_VALUE;
  const resolvedModel = (usingCustom ? customModel : modelSelect).trim();
  const hasNoCredentials = credentialsForProvider.length === 0;

  // Credencial efetiva: a escolha explícita do usuário, se ainda existir no
  // provider. Sem escolha → vazio (o campo NÃO pré-seleciona nenhuma chave).
  const effectiveCredentialId = useMemo(() => {
    if (
      credentialId &&
      credentialsForProvider.some((c) => c.id === credentialId)
    ) {
      return credentialId;
    }
    return "";
  }, [credentialId, credentialsForProvider]);

  const isConfigured = Boolean(activeConfig);
  const busy = isSaving || isTesting;
  const actionsDisabled = busy || hasNoCredentials || !effectiveCredentialId;

  // "Sujo" — a seleção atual difere da config ativa salva. Sem config ativa,
  // qualquer estado é sujo. Governa se "Testar conexão" fica habilitado e se o
  // resultado do teste é refletido na tarja do topo.
  const isDirty =
    !activeConfig ||
    provider !== activeConfig.provider ||
    resolvedModel !== activeConfig.model ||
    effectiveCredentialId !== (activeConfig.credentialId ?? "");

  // Testar só faz sentido quando há algo novo a verificar. Conexão ativa e
  // inalterada → botão desabilitado (nada a testar).
  const testDisabled = actionsDisabled || (isConfigured && !isDirty);

  // O resultado do teste é exibido na tarja do topo (fonte da verdade do
  // status) — nunca numa segunda tarja embaixo.
  const showTestInTop = test.status !== "idle" && isDirty;

  function handleProviderChange(next: string) {
    const p = next as LlmProvider;
    setProvider(p);
    setModelSelect(modelsFor(p)[0]?.id ?? "");
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
        setTest({ status: "ok" });
        toast.success("Conexão verificada com sucesso");
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

  return (
    <div className="space-y-8 pt-3">
      {/* Disponibilidade do Agente Nex passou para AgentAvailabilityCard
          (separado por canal: bubble + WhatsApp). */}

      {/* Seção: Conexão LLM */}
      <div className="space-y-6 border-t border-border/50 pt-6">
        {(() => {
          // Tarja única do topo — fonte da verdade do status. Reflete o teste
          // apenas quando há algo novo a verificar (isDirty); caso contrário,
          // mostra a conexão ativa salva.
          const tone: "ok" | "fail" | "active" | "idle" = showTestInTop
            ? test.status === "ok"
              ? "ok"
              : "fail"
            : isConfigured
              ? "active"
              : "idle";
          const text =
            tone === "ok"
              ? "Conexão verificada com sucesso."
              : tone === "fail"
                ? test.message ?? "Falha ao conectar."
                : tone === "active"
                  ? `Conexão ativa: ${PROVIDER_META[activeConfig!.provider]?.label ?? activeConfig!.provider} · ${activeConfig!.model}${
                      activeConfig!.credentialLabel
                        ? ` · ${activeConfig!.credentialLabel}`
                        : ""
                    }`
                  : "Nenhuma conexão ativa — selecione provedor, modelo e chave abaixo.";
          const isGood = tone === "ok" || tone === "active";
          const isBad = tone === "fail";
          return (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs",
                isGood &&
                  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                isBad && "bg-destructive/10 text-destructive",
                tone === "idle" &&
                  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
              role="status"
              aria-live="polite"
            >
              {isGood ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : isBad ? (
                <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="break-words leading-snug">{text}</span>
            </div>
          );
        })()}

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
              Plataforma do LLM.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="llm-model">Modelo</Label>
              <SyncModelsButton provider={provider} />
            </div>
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
                ? "Modelo customizado, útil para snapshots datados."
                : "Tier $/$$/$$$/$$$$ indica o custo por milhão de tokens."}
            </p>
            {(() => {
              const selected = models.find((m) => m.id === modelSelect);
              if (!selected?.deprecated) return null;
              return (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                >
                  Este modelo foi descontinuado pelo provedor. Escolha outro
                  modelo para continuar usando o Agente Nex.
                </div>
              );
            })()}
          </div>
        </div>

        {/* Chave de API — abaixo, largura total */}
        <div className="space-y-1.5">
          <Label htmlFor="llm-credential" className="gap-2">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            Chave de API
          </Label>
          {hasNoCredentials ? (
            // Sem chaves: em vez de uma opção de select, um botão de ação
            // claro que leva à tela de Chaves de API.
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Nenhuma chave cadastrada para {meta.label}.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push("/agente/chaves")}
                className="cursor-pointer"
              >
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                Nova chave de {meta.label}
              </Button>
            </div>
          ) : (
            <>
              <CustomSelect
                aria-label="Chave de API"
                value={effectiveCredentialId}
                onChange={handleCredentialChange}
                options={credentialOptions}
                placeholder="Selecionar chave"
                disabled={busy}
                triggerClassName="min-h-[44px]"
                footer={(close) => (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      router.push("/agente/chaves");
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-violet-600 transition-colors hover:bg-accent dark:text-violet-400"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Nova chave de {meta.label}
                  </button>
                )}
              />
              {(() => {
                const sel = credentialsForProvider.find(
                  (c) => c.id === effectiveCredentialId,
                );
                if (!sel) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      As chaves são gerenciadas em &ldquo;Chaves de
                      API&rdquo;.
                    </p>
                  );
                }
                const fmt = (v: number) =>
                  v.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "USD",
                  });
                return (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">
                        {sel.balance?.status === "ok" &&
                        sel.balance.usd != null
                          ? "Saldo da chave"
                          : "Consumo desta chave"}
                      </span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {sel.balance?.status === "ok" &&
                        sel.balance.usd != null
                          ? fmt(sel.balance.usd)
                          : fmt(sel.consumedUsd)}
                      </span>
                    </div>
                    {meta.topUpUrl ? (
                      <a
                        href={meta.topUpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "cursor-pointer gap-1.5",
                        )}
                        title="Abrir o painel de billing do provedor"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Adicionar crédito
                      </a>
                    ) : null}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testDisabled}
            className="cursor-pointer"
            title={
              isConfigured && !isDirty
                ? "Conexão ativa e inalterada — nada a testar"
                : "Verificar a conexão com o provedor"
            }
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
      </div>
    </div>
  );
}
