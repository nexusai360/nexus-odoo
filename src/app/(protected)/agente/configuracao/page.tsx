import { redirect } from "next/navigation";
import { Bot, Brain, Cpu, Key, Mic, Sliders } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { CredentialsSection } from "@/components/agent/credentials-section";
import { LlmConfigForm } from "@/components/agent/llm-config-form";
import { PromptConfigForm } from "@/components/agent/prompt-config-form";
import { IdentityBaseEditor } from "@/components/agent/identity-base-editor";
import { ResourcesToggles } from "@/components/agent/resources-toggles";
import { KbSection } from "@/components/agent/kb-section";
import { getCurrentUser } from "@/lib/auth";
import { getAgentSettings } from "@/lib/actions/agent-config";
import { listCredentials } from "@/lib/agent/llm/credentials";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { listKbDocumentsAction } from "@/lib/actions/kb";
import { prisma } from "@/lib/prisma";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { KbDocSummary } from "@/components/agent/kb-section";

export const metadata = { title: "Configuração do Agente | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin" && user.platformRole !== "admin") {
    redirect("/dashboard");
  }

  const [settingsResult, credentials, activeConfig, kbResult] = await Promise.all([
    getAgentSettings(),
    listCredentials().catch(() => [] as Awaited<ReturnType<typeof listCredentials>>),
    getPublicActiveLlmConfig(),
    listKbDocumentsAction(),
  ]);

  const kbDocs: KbDocSummary[] = kbResult.ok ? kbResult.data : [];

  const settings = settingsResult.success ? settingsResult.data : null;

  // Fetch all LlmConfig rows for the list
  const llmConfigs = await prisma.llmConfig.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      credential: { select: { label: true, last4: true } },
    },
  });

  const configsForForm = llmConfigs.map((c) => ({
    id: c.id,
    provider: c.provider as LlmProvider,
    model: c.model,
    isActive: c.isActive,
    credentialId: c.credentialId,
    credentialLabel: c.credential?.label ?? null,
    last4: c.credential?.last4 ?? null,
  }));

  const initialSettings = {
    personality: settings?.personality ?? "",
    tone: settings?.tone ?? "",
    guardrails: (settings?.guardrails as string[]) ?? [],
    advancedOverride: settings?.advancedOverride ?? null,
    terminology: (settings?.terminology as Record<string, string>) ?? {},
    identityBase: settings?.identityBase ?? null,
    audioInputEnabled: settings?.audioInputEnabled ?? false,
    kbEnabled: settings?.kbEnabled ?? true,
    suggestionsEnabled: settings?.suggestionsEnabled ?? true,
  };

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Bot}
        title="Configuração do Agente"
        subtitle="Provedor, modelo, identidade e comportamento do agente de IA."
      />

      <div className="space-y-6 max-w-3xl">
        {/* Seção: Chaves de API */}
        <section aria-labelledby="section-credentials">
          <div className="flex items-center gap-2 mb-3">
            <Key className="h-4 w-4 text-muted-foreground" />
            <h2 id="section-credentials" className="text-base font-semibold">
              Chaves de API
            </h2>
          </div>
          <Card className="px-5 py-4">
            <CredentialsSection initialCredentials={credentials} />
          </Card>
        </section>

        {/* Seção: Modelo de IA */}
        <section aria-labelledby="section-llm">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <h2 id="section-llm" className="text-base font-semibold">
              Modelo de IA
            </h2>
          </div>
          <Card className="px-5 py-4">
            <LlmConfigForm
              configs={configsForForm}
              credentials={credentials}
              activeConfig={activeConfig}
            />
          </Card>
        </section>

        {/* Seção: Identidade base */}
        <section aria-labelledby="section-identity">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <h2 id="section-identity" className="text-base font-semibold">
              Identidade base
            </h2>
          </div>
          <Card className="px-5 py-4">
            <IdentityBaseEditor initial={initialSettings} />
          </Card>
        </section>

        {/* Seção: Comportamento */}
        <section aria-labelledby="section-prompt">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="h-4 w-4 text-muted-foreground" />
            <h2 id="section-prompt" className="text-base font-semibold">
              Comportamento
            </h2>
          </div>
          <Card className="px-5 py-4">
            <PromptConfigForm initial={initialSettings} />
          </Card>
        </section>

        {/* Seção: Recursos */}
        <section aria-labelledby="section-resources">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="h-4 w-4 text-muted-foreground" />
            <h2 id="section-resources" className="text-base font-semibold">
              Recursos
            </h2>
          </div>
          <Card className="px-5 py-4">
            <ResourcesToggles
              initial={initialSettings}
              activeProvider={activeConfig?.provider ?? null}
            />
          </Card>
        </section>

        {/* Seção: Base de Conhecimento (KB) — admin/super_admin */}
        <section aria-labelledby="section-kb">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <h2 id="section-kb" className="text-base font-semibold">
              Base de Conhecimento
            </h2>
          </div>
          <Card className="px-5 py-4">
            <KbSection initial={kbDocs} />
          </Card>
        </section>
      </div>
    </PageShell>
  );
}
