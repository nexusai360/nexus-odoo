import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { AgentBubble } from "@/components/agent/agent-bubble";
import { TourProvider } from "@/components/tour/tour-provider";
import { getPublicAgentFlags } from "@/lib/actions/agent-config";
import { getPublicActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { getPersonalizedWelcomeSuggestions } from "@/lib/agent/personalized-suggestions";
import { pickWelcomeByDomains } from "@/lib/agent/welcome-suggestions";
import { seesAll, REPORT_DOMAINS, type ReportDomainId } from "@/lib/reports/domains";
import { getUserDomains } from "@/lib/actions/domain-access";
import { getActiveConversationId } from "@/lib/actions/active-conversation";
import { roleMeetsChannelLevel } from "@/lib/agent/channel-access";

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

  // RBAC v2 (SPEC §6.5): a bubble do agente aparece para quem CONSEGUE usar o
  // Nex. super_admin/admin veem tudo (short-circuit seesAll, sem query).
  // manager/viewer/operator so veem a bubble se tiverem ao menos um dominio
  // concedido (UserDomainAccess); sem dominio, perguntar ao Nex so geraria
  // recusa, entao a bubble some. O nivel minimo do canal in-app
  // (bubbleAccessLevel, AgentSettings) refina o gate mais abaixo (F5 C).
  // Resolve os dominios permitidos UMA vez: reusados para o gate da bubble, a
  // ancora de sugestoes por dominio e o filtro das personalizadas (RBAC v2).
  const allowedDomains: ReportDomainId[] = seesAll(user.platformRole)
    ? REPORT_DOMAINS.map((d) => d.id)
    : await getUserDomains(user.id);
  const canUseAgent = seesAll(user.platformRole) || allowedDomains.length > 0;

  // Resolve audioInputEnabled: toggle ligado + provider OpenAI ativo.
  const [flags, activeLlm] = await Promise.all([
    getPublicAgentFlags(),
    getPublicActiveLlmConfig(),
  ]);
  const audioInputEnabled =
    flags.audioInputEnabled === true && activeLlm?.provider === "openai";
  // Anexo (clip) na bubble: liberado só com o checkpoint de imagem em PRODUÇÃO.
  const imageInputEnabled = flags.imageInputEnabled === true;

  // Sugestoes na bubble: ancora por DOMINIO PERMITIDO + complemento personalizado.
  // A ancora agora vem de pickWelcomeByDomains (curada pelos dominios do RBAC v2:
  // quem ve faturamento recebe perguntas de fiscal, quem ve estoque recebe de
  // estoque), e as personalizadas sao filtradas pelo mesmo conjunto de dominios
  // (nada vaza dominio sem acesso). O historico ENRIQUECE, nao SUBSTITUI.
  //
  // Estrategia:
  //   - ancora 0 sempre primeiro
  //   - personalizadas ocupam ate floor(max/2) slots
  //   - resto da ancora completa ate o teto, dedupado
  let welcomeSet: string[] = [];
  if (canUseAgent) {
    const max = flags.maxSuggestions ?? 3;
    const ancora = pickWelcomeByDomains(allowedDomains, user.platformRole, max);
    const personalizadasMax = Math.max(0, Math.floor(max / 2));
    const personalized =
      personalizadasMax > 0
        ? await getPersonalizedWelcomeSuggestions(
            user.id,
            personalizadasMax,
            allowedDomains,
          )
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

  // Persistencia cross-login: resolve a conversa in_app ativa do usuario para a
  // bubble restaurar o historico ao abrir (mesmo apos F5/logout). So consulta
  // quando a bubble vai aparecer.
  // canUseAgent cobre os dominios (RBAC v2); o nivel cobre o canal in-app.
  // bubbleAccessLevel "off" => roleMeetsChannelLevel false => bubble some.
  const bubbleVisible =
    canUseAgent && roleMeetsChannelLevel(user.platformRole, flags.bubbleAccessLevel);
  const active = bubbleVisible ? await getActiveConversationId() : null;
  const initialConversationId =
    active && active.ok ? active.conversationId : null;

  return (
    <TourProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar user={sidebarUser} />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="pt-16 pb-8 sm:pt-8">{children}</div>
        </main>
        {bubbleVisible ? (
          <AgentBubble
            audioInputEnabled={audioInputEnabled}
            imageInputEnabled={imageInputEnabled}
            feedbackEnabled={flags.feedbackInputEnabled}
            maxSuggestions={flags.maxSuggestions}
            personalizedWelcome={welcomeSet}
            isSuperAdmin={user.platformRole === "super_admin"}
            initialConversationId={initialConversationId}
          />
        ) : null}
      </div>
    </TourProvider>
  );
}
