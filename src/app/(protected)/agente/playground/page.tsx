/**
 * /agente/playground — Playground do agente como página dedicada.
 *
 * Gate: super_admin (aplicado também no layout do grupo /agente).
 * Playground persiste (channel=playground, isPlayground=true).
 * Portado de nexus-insights playground-sheet.tsx, adaptado para full-page.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §8.3
 * Task 5.3 — ONDA 5, F5.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublicAgentFlags } from "@/lib/actions/agent-config";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { PlaygroundContent } from "@/components/agent/playground-content";

export const metadata = { title: "Playground do Agente | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [flags, activeLlm] = await Promise.all([
    getPublicAgentFlags(),
    getPublicActiveLlmConfig(),
  ]);

  const providerKey = activeLlm?.provider ?? "openai";
  const providerLabel = providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
  const modelLabel = activeLlm?.model ?? "—";
  const audioInputEnabled =
    flags.audioInputEnabled === true && providerKey === "openai";

  return (
    <PlaygroundContent
      providerKey={providerKey}
      providerLabel={providerLabel}
      modelLabel={modelLabel}
      audioInputEnabled={audioInputEnabled}
      userId={user.id}
    />
  );
}
