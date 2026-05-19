import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { AgentBubble } from "@/components/agent/agent-bubble";
import { getPublicAgentFlags } from "@/lib/actions/agent-config";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sidebarUser = {
    name: user.name,
    email: user.email,
    platformRole: user.platformRole,
    avatarUrl: user.avatarUrl,
  };

  // A bubble do agente é exclusiva de super_admin e admin.
  const canUseAgent =
    user.platformRole === "super_admin" || user.platformRole === "admin";

  // Resolve audioInputEnabled: toggle ligado + provider OpenAI ativo.
  const [flags, activeLlm] = await Promise.all([
    getPublicAgentFlags(),
    getPublicActiveLlmConfig(),
  ]);
  const audioInputEnabled =
    flags.audioInputEnabled === true && activeLlm?.provider === "openai";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={sidebarUser} />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="pt-16 pb-8 sm:pt-8">{children}</div>
      </main>
      {canUseAgent ? (
        <AgentBubble audioInputEnabled={audioInputEnabled} />
      ) : null}
    </div>
  );
}
