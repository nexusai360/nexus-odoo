/**
 * /agente/configuracao — Configuração da conexão LLM do agente.
 *
 * Rework F5-UI: espelha agente-nex/configuracao do nexus-insights. Esta tela
 * é só a conexão com o provedor de IA (provedor, modelo, chave). Identidade,
 * comportamento, recursos e base de conhecimento ficam na tela "Prompt".
 *
 * Gate de role: super_admin (aplicado também no layout do grupo /agente).
 */
import { redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LlmConfigForm } from "@/components/agent/llm-config-form";
import { getCurrentUser } from "@/lib/auth";
import { listCredentials } from "@/lib/agent/llm/credentials";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { prisma } from "@/lib/prisma";
import type { LlmProvider } from "@/lib/agent/llm/types";

export const metadata = {
  title: "Configuração do Agente | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [credentials, activeConfig] = await Promise.all([
    listCredentials().catch(
      () => [] as Awaited<ReturnType<typeof listCredentials>>,
    ),
    getPublicActiveLlmConfig(),
  ]);

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

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={SlidersHorizontal}
        title="Configuração do Agente"
        subtitle="Provedor, modelo e chave de API em uso pelo agente de IA."
      />
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardContent>
          <LlmConfigForm
            configs={configsForForm}
            credentials={credentials}
            activeConfig={activeConfig}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
