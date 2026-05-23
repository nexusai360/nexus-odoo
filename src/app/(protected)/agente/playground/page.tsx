/**
 * /agente/playground — Playground do Agente Nex (página dedicada).
 *
 * Gate: super_admin (aplicado também no layout do grupo /agente).
 * Sessões persistem em Postgres (PlaygroundSession); cada sessão escolhe seu
 * próprio provedor/modelo entre as chaves cadastradas, independente da
 * configuração de produção.
 *
 * Bloco 6 — F5 UI rework v2.
 */

import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getPublicAgentFlags } from "@/lib/actions/agent-config";
import { PlaygroundContent } from "@/components/agent/playground-content";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { listCredentials } from "@/lib/agent/llm/credentials";

export const metadata = { title: "Playground do Agente Nex | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [flags, credentials] = await Promise.all([
    getPublicAgentFlags(),
    listCredentials().catch(
      () => [] as Awaited<ReturnType<typeof listCredentials>>,
    ),
  ]);

  const credentialsByProvider: Record<string, { id: string; label: string }[]> = {};
  for (const c of credentials) {
    const list = credentialsByProvider[c.provider] ?? [];
    list.push({ id: c.id, label: c.label });
    credentialsByProvider[c.provider] = list;
  }

  return (
    <PageShell variant="agent">
      <PageHeader
        icon={FlaskConical}
        title="Playground do Agente Nex"
        subtitle="Teste o Agente Nex em sessões isoladas. Escolha provedor, modelo e prompt sem afetar a produção."
      />
      <PlaygroundContent
        audioInputEnabled={flags.audioInPlayground}
        imageInputEnabled={flags.imageInPlayground}
        userId={user.id}
        credentialsByProvider={credentialsByProvider}
      />
    </PageShell>
  );
}
