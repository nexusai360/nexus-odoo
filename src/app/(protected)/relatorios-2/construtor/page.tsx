/**
 * /relatorios-2/construtor , Construtor de relatórios (F6). Gate admin/super_admin
 * (layout do grupo). Tela cheia: chat (painel lateral) + preview ao vivo (área
 * dominante). Áudio habilitado quando há modelo de transcrição configurado.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  obterAcessoRelatorios2,
  podeAcessarSubmenu,
} from "@/lib/reports/acesso-relatorios2";
import { obterBuilderConversaAtiva } from "@/lib/reports/builder/builder-conversation-repo";
import { BuilderWorkspace } from "@/components/reports/builder/builder-workspace";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

export const metadata = { title: "Construtor de relatórios | Relatórios 2.0" };
export const dynamic = "force-dynamic";

export default async function ConstrutorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const acesso = await obterAcessoRelatorios2();
  if (!podeAcessarSubmenu(acesso, "construtor", { platformRole: user.platformRole, isOwner: user.isOwner })) {
    redirect("/relatorios-2/paineis");
  }

  // Áudio só quando há modelo de transcrição dedicado configurado (senão a rota
  // /api/agent/transcribe falharia). O card de áudio fica em Agente > Configuração.
  const settings = await prisma.agentSettings
    .findUnique({
      where: { id: "global" },
      select: {
        audioProvider: true,
        audioModel: true,
        imageProvider: true,
        imageModel: true,
        builderAudioCheckpoint: true,
        builderAnexoCheckpoint: true,
      },
    })
    .catch(() => null);
  // Audio do construtor: toggle do construtor LIGADO + modelo de transcricao
  // (compartilhado com o Nex) configurado.
  const audioEnabled = Boolean(
    settings?.builderAudioCheckpoint === "PRODUCTION" &&
      settings?.audioProvider &&
      settings?.audioModel,
  );
  // Anexo: toggle do construtor LIGADO + modelo de visao (imagem) configurado.
  const anexoEnabled = Boolean(
    settings?.builderAnexoCheckpoint === "PRODUCTION" &&
      settings?.imageProvider &&
      settings?.imageModel,
  );

  // Restaura a conversa ativa do construtor (mensagens persistidas) + a ficha em
  // construcao, para o chat e o preview reaparecerem ao recarregar a pagina.
  const conversaAtiva = await obterBuilderConversaAtiva(user.id).catch(() => null);
  let initialFicha: BuilderReportEntry | null = null;
  let initialSavedId: string | null = null;
  let initialEtag: string | null = null;
  if (conversaAtiva?.savedReportId) {
    const sr = await prisma.savedReport
      .findUnique({
        where: { id: conversaAtiva.savedReportId },
        select: { entry: true, etag: true, criadoPor: true },
      })
      .catch(() => null);
    if (sr && sr.criadoPor === user.id) {
      initialFicha = sr.entry as unknown as BuilderReportEntry;
      initialSavedId = conversaAtiva.savedReportId;
      initialEtag = sr.etag;
    }
  }

  return (
    // Altura casada com o padding do layout (pt+pb) para caber sem rolagem e
    // ainda deixar o respiro inferior (a bubble nao cobre o composer).
    <div className="h-[calc(100dvh-10rem)] px-4 sm:px-6 sm:h-[calc(100dvh-8rem)] lg:px-8">
      <BuilderWorkspace
        audioEnabled={audioEnabled}
        anexoEnabled={anexoEnabled}
        podeExportar
        initialConversationId={conversaAtiva?.id ?? null}
        initialFicha={initialFicha}
        initialSavedId={initialSavedId}
        initialEtag={initialEtag}
      />
    </div>
  );
}
