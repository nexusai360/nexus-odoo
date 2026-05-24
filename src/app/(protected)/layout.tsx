import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { AgentBubble } from "@/components/agent/agent-bubble";
import { TourProvider } from "@/components/tour/tour-provider";
import { getPublicAgentFlags } from "@/lib/actions/agent-config";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { getPersonalizedWelcomeSuggestions } from "@/lib/agent/personalized-suggestions";
import { pickWelcomeByRole } from "@/lib/agent/welcome-suggestions";

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

  // A bubble do agente é exclusiva de super_admin e admin, e só aparece
  // quando o toggle "Agente Nex ativo" está ligado (AgentSettings.bubbleEnabled).
  const canUseAgent =
    user.platformRole === "super_admin" || user.platformRole === "admin";

  // Resolve audioInputEnabled: toggle ligado + provider OpenAI ativo.
  const [flags, activeLlm] = await Promise.all([
    getPublicAgentFlags(),
    getPublicActiveLlmConfig(),
  ]);
  const audioInputEnabled =
    flags.audioInputEnabled === true && activeLlm?.provider === "openai";
  // Anexo (clip) na bubble: liberado só com o checkpoint de imagem em PRODUÇÃO.
  const imageInputEnabled = flags.imageInputEnabled === true;

  // Sugestoes na bubble: ancora obrigatoria por role + complemento personalizado.
  // Pedido do usuario em 2026-05-24 19:24: faturamento/produto mais vendido/
  // financeiro devem SEMPRE aparecer mesmo quando ha historico que aponte
  // para outras tools. O historico ENRIQUECE, nao SUBSTITUI as ancoras.
  //
  // Estrategia:
  //   - ancora 0 sempre primeiro (faturamento para gestor)
  //   - personalizadas ocupam ate floor(max/2) slots
  //   - resto da ancora completa ate o teto, dedupado
  let welcomeSet: string[] = [];
  if (canUseAgent) {
    const ancora = pickWelcomeByRole(user.platformRole);
    const max = flags.maxSuggestions ?? 3;
    const personalizadasMax = Math.max(0, Math.floor(max / 2));
    const personalized =
      personalizadasMax > 0
        ? await getPersonalizedWelcomeSuggestions(user.id, personalizadasMax)
        : [];

    const out: string[] = [];
    const seen = new Set<string>();
    const push = (s: string) => {
      const t = s.trim();
      if (t && !seen.has(t) && out.length < max) {
        seen.add(t);
        out.push(t);
      }
    };
    if (ancora.length > 0) push(ancora[0]);
    for (const p of personalized) push(p);
    for (const a of ancora.slice(1)) push(a);
    welcomeSet = out;
  }

  return (
    <TourProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar user={sidebarUser} />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="pt-16 pb-8 sm:pt-8">{children}</div>
        </main>
        {canUseAgent && flags.bubbleEnabled ? (
          <AgentBubble
            audioInputEnabled={audioInputEnabled}
            imageInputEnabled={imageInputEnabled}
            maxSuggestions={flags.maxSuggestions}
            personalizedWelcome={welcomeSet}
          />
        ) : null}
      </div>
    </TourProvider>
  );
}
