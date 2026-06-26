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
import { BuilderWorkspace } from "@/components/reports/builder/builder-workspace";

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

  return (
    // Altura casada com o padding do layout (pt+pb) para caber sem rolagem e
    // ainda deixar o respiro inferior (a bubble nao cobre o composer).
    <div className="h-[calc(100dvh-10rem)] px-4 sm:px-6 sm:h-[calc(100dvh-8rem)] lg:px-8">
      <BuilderWorkspace audioEnabled={audioEnabled} anexoEnabled={anexoEnabled} />
    </div>
  );
}
