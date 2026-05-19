/**
 * /agente — Página dedicada do agente com lista de conversas e chat em tela cheia.
 *
 * Layout 2 colunas: lista de conversas (w-72) + painel de chat (flex-1).
 * Server Component: busca conversas e agentSettings no servidor.
 * Interatividade delegada ao AgentPageClient.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §7
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentSettings } from "@/lib/actions/agent-config";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { AgentPageClient } from "./client";

export const metadata = { title: "Agente | Nexus Odoo" };

export default async function AgentePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [conversations, settingsResult, activeLlm] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId: user.id, channel: "in_app" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, updatedAt: true },
    }),
    getAgentSettings(),
    getPublicActiveLlmConfig(),
  ]);

  const audioInputEnabled =
    settingsResult.success &&
    settingsResult.data?.audioInputEnabled === true &&
    activeLlm?.provider === "openai";

  return (
    <AgentPageClient
      initialConversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      }))}
      audioInputEnabled={audioInputEnabled}
      userId={user.id}
    />
  );
}
