/**
 * /agente/configuracao , Configuração do Agente Nex: conexão LLM e recursos.
 *
 * Rework F5-UI: além da conexão com o provedor de IA (provedor, modelo, chave),
 * esta tela passou a abrigar a seção "Recursos" (entrada de áudio/anexo,
 * sugestões clicáveis, modo raciocínio) , recursos são configuração, não
 * prompt. Identidade, comportamento e base de conhecimento ficam em "Prompt".
 *
 * Gate de role: super_admin (aplicado também no layout do grupo /agente).
 */
import { redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LlmConfigForm } from "@/components/agent/llm-config-form";
import { AgentAvailabilityCard } from "@/components/agent/agent-availability-card";
import {
  ResourcesToggles,
  type CredentialOption,
} from "@/components/agent/resources-toggles";
import { getCurrentUser } from "@/lib/auth";
import { listCredentials } from "@/lib/agent/llm/credentials";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { getAgentSettings } from "@/lib/actions/agent-config";
import { getEmbeddingCredentialStatus } from "@/lib/actions/router-embedding-credential";
import { prisma } from "@/lib/prisma";
import { loadEffectiveModelsByProvider } from "@/lib/agent/llm/effective-catalog";
import type { ModelEntry } from "@/lib/agent/llm/catalog";
import type { LlmProvider } from "@/lib/agent/llm/types";
import { getUsdBrlRate } from "@/lib/agent/llm/exchange-rate";

export const metadata = {
  title: "Configuração do Agente | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [credentials, activeConfig, settingsResult, usdBrl] = await Promise.all([
    listCredentials().catch(
      () => [] as Awaited<ReturnType<typeof listCredentials>>,
    ),
    getPublicActiveLlmConfig(),
    getAgentSettings(),
    getUsdBrlRate().catch(() => null),
  ]);
  const usdBrlRate = usdBrl?.rate ?? null;

  const llmConfigs = await prisma.llmConfig.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, provider: true, model: true },
  });

  const configsForForm = llmConfigs.map((c) => ({
    id: c.id,
    provider: c.provider as LlmProvider,
    model: c.model,
  }));

  const settings = settingsResult.success ? settingsResult.data : null;

  // R2-ctx: campos novos lidos direto do prisma (fora do DTO AgentSettingsData)
  // + status da credencial de embedding (fonte única do RAG).
  const [routerRow, embeddingStatus] = await Promise.all([
    prisma.agentSettings.findUnique({
      where: { id: "global" },
      select: {
        contextWindowCheckpoint: true,
        contextWindowSize: true,
        contextWindowIncludeSystem: true,
        routerReformCheckpoint: true,
        routerReformProvider: true,
        routerReformModel: true,
        routerReformCredentialId: true,
        routerReformNPairs: true,
        routerEmbeddingModel: true,
      },
    }),
    getEmbeddingCredentialStatus().catch(() => ({ active: null, options: [], needsBootstrap: false })),
  ]);

  const bubbleEnabled = settings ? settings.bubbleEnabled : true;
  const whatsappEnabled = settings ? settings.whatsappEnabled : true;
  const isConfigured = activeConfig != null;

  const credentialsByProvider: Record<string, CredentialOption[]> = {};
  for (const c of credentials) {
    const list = credentialsByProvider[c.provider] ?? [];
    list.push({
      id: c.id,
      label: c.label,
      maskedSuffix: c.last4 ? `••••${c.last4}` : null,
    });
    credentialsByProvider[c.provider] = list;
  }
  const reformProviders = Object.keys(credentialsByProvider) as LlmProvider[];
  const embeddingOptions = embeddingStatus.options.map((o) => ({
    id: o.id,
    label: o.label,
    maskedSuffix: o.last4 ? `••••${o.last4}` : null,
  }));

  const initialResources = {
    personality: settings?.personality ?? "",
    tone: settings?.tone ?? "",
    guardrails: (settings?.guardrails as string[]) ?? [],
    advancedOverride: settings?.advancedOverride ?? null,
    terminology: (settings?.terminology as Record<string, string>) ?? {},
    suggestionsEnabled: settings?.suggestionsEnabled ?? true,
    suggestionsCheckpoint: settings?.suggestionsCheckpoint ?? "PRODUCTION",
    audioCheckpoint: settings?.audioCheckpoint ?? "OFF",
    imageCheckpoint: settings?.imageCheckpoint ?? "OFF",
    kbCheckpoint: settings?.kbCheckpoint ?? "PRODUCTION",
    audioProvider: settings?.audioProvider ?? null,
    audioModel: settings?.audioModel ?? null,
    audioCredentialId: settings?.audioCredentialId ?? null,
    imageProvider: settings?.imageProvider ?? null,
    imageModel: settings?.imageModel ?? null,
    imageCredentialId: settings?.imageCredentialId ?? null,
    reasoningEffort: settings?.reasoningEffort ?? null,
    reasoningCheckpoint: settings?.reasoningCheckpoint ?? "OFF",
    maxSuggestions: settings?.maxSuggestions ?? 3,
    contextWindowCheckpoint: routerRow?.contextWindowCheckpoint ?? "PRODUCTION",
    contextWindowSize: routerRow?.contextWindowSize ?? 20,
    contextWindowIncludeSystem: routerRow?.contextWindowIncludeSystem ?? true,
  } as const;

  const routerConfig = {
    routerReformCheckpoint: routerRow?.routerReformCheckpoint ?? "OFF",
    routerReformProvider: routerRow?.routerReformProvider ?? null,
    routerReformModel: routerRow?.routerReformModel ?? null,
    routerReformCredentialId: routerRow?.routerReformCredentialId ?? null,
    routerReformNPairs: routerRow?.routerReformNPairs ?? 5,
    routerEmbeddingModel: routerRow?.routerEmbeddingModel ?? null,
  } as const;

  const activeModelId = activeConfig?.model ?? "";

  const PROVIDERS: LlmProvider[] = ["openai", "anthropic", "gemini", "openrouter"];
  const modelEntries = await Promise.all(
    PROVIDERS.map((p) => loadEffectiveModelsByProvider(p)),
  );
  const modelsByProvider: Record<LlmProvider, ModelEntry[]> = {
    openai: modelEntries[0],
    anthropic: modelEntries[1],
    gemini: modelEntries[2],
    openrouter: modelEntries[3],
  };

  return (
    <PageShell variant="form">
      <PageHeader
        icon={SlidersHorizontal}
        title="Configuração do Agente Nex"
        subtitle="Provedor, modelo, chave e recursos do Agente Nex."
      />
      <div className="space-y-8">
        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader className="pt-5 pb-5">
            <CardTitle>Disponibilidade</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <AgentAvailabilityCard
              initial={{ bubbleEnabled, whatsappEnabled }}
              isConfigured={isConfigured}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardContent>
            <LlmConfigForm
              configs={configsForForm}
              credentials={credentials}
              activeConfig={activeConfig}
              modelsByProvider={modelsByProvider}
              usdBrlRate={usdBrlRate}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader className="pt-5 pb-5">
            <CardTitle>Recursos</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <ResourcesToggles
              initial={initialResources}
              credentialsByProvider={credentialsByProvider}
              activeModelId={activeModelId}
              routerConfig={routerConfig}
              reformProviders={reformProviders}
              chatModelsByProvider={modelsByProvider}
              embeddingActiveId={embeddingStatus.active?.id ?? null}
              embeddingOptions={embeddingOptions}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
