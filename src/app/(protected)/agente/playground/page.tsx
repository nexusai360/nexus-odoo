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
import { getCurrentUser } from "@/lib/auth";
import { getPublicAgentFlags } from "@/lib/actions/agent-config";
import { PlaygroundContent } from "@/components/agent/playground-content";

export const metadata = { title: "Playground do Agente Nex | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const flags = await getPublicAgentFlags();

  return (
    <PlaygroundContent
      audioInputEnabled={flags.audioInPlayground}
      userId={user.id}
    />
  );
}
