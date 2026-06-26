/**
 * /relatorios-2/construtor , Construtor de relatórios (F6). Gate admin/super_admin
 * (layout do grupo). Tela cheia: chat (painel lateral) + preview ao vivo (área
 * dominante). Áudio habilitado quando há modelo de transcrição configurado.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BuilderWorkspace } from "@/components/reports/builder/builder-workspace";

export const metadata = { title: "Construtor de relatórios | Relatórios 2.0" };
export const dynamic = "force-dynamic";

export default async function ConstrutorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "admin" && user.platformRole !== "super_admin") {
    redirect("/relatorios-2/paineis");
  }

  // Áudio só quando há modelo de transcrição dedicado configurado (senão a rota
  // /api/agent/transcribe falharia). O card de áudio fica em Agente > Configuração.
  const settings = await prisma.agentSettings
    .findUnique({
      where: { id: "global" },
      select: { audioProvider: true, audioModel: true, audioCheckpoint: true },
    })
    .catch(() => null);
  const audioEnabled = Boolean(
    settings?.audioProvider && settings?.audioModel && settings?.audioCheckpoint !== "OFF",
  );

  return (
    // Altura casada com o padding do layout (pt+pb) para caber sem rolagem e
    // ainda deixar o respiro inferior (a bubble nao cobre o composer).
    <div className="h-[calc(100dvh-10rem)] px-4 sm:px-6 sm:h-[calc(100dvh-8rem)] lg:px-8">
      <BuilderWorkspace audioEnabled={audioEnabled} />
    </div>
  );
}
