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

  // Sugestoes na bubble: tres camadas em ordem de prioridade.
  // 1) Personalizado: agregado do historico real de tools do proprio usuario.
  // 2) Por role: pacote curado com perguntas de alto impacto para o nivel
  //    de acesso (super_admin/admin/manager priorizam faturamento + comercial).
  // 3) Fallback final: catalogo fixo WELCOME_SUGGESTIONS.
  // O ChatPanel ja faz o slice por maxSuggestions; aqui resolvemos qual lista
  // entregar. Se o personalizado vier vazio, mandamos a do role (nunca vazia).
  let welcomeSet: string[] = [];
  if (canUseAgent) {
    const personalized = await getPersonalizedWelcomeSuggestions(
      user.id,
      flags.maxSuggestions,
    );
    welcomeSet =
      personalized.length > 0
        ? personalized
        : [...pickWelcomeByRole(user.platformRole)];
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
