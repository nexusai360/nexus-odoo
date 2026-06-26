// F6 (P2) , View de um relatorio salvo, agora sob Relatorios 2.0 (acende "Meus
// relatorios" na sidebar). Cabecalho com titulo/criador/data + ReportRenderer.
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { carregarRelatorioDinamico } from "@/lib/reports/builder/carregar-relatorio-dinamico";
import { ReportRenderer } from "@/components/reports/builder/report-renderer";
import { ReportViewHeader } from "@/components/reports/builder/report-view-header";
import { PageShell } from "@/components/layout/page-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ savedId: string }>;
}

export default async function RelatorioDinamicoPage({ params }: PageProps) {
  const { savedId } = await params;
  const me = await getCurrentUser();
  if (!me) notFound();

  const r = await carregarRelatorioDinamico(savedId, {
    userId: me.id,
    role: me.platformRole,
  });

  if (r.tipo === "notfound") notFound();

  // Dados do criador para o cabecalho (foto/nome/email/tag de perfil).
  const criadorRow = await prisma.user
    .findUnique({
      where: { id: r.meta.criadoPor },
      select: { name: true, email: true, avatarUrl: true, platformRole: true },
    })
    .catch(() => null);
  const criador = criadorRow ?? null;

  if (r.tipo === "invalida") {
    return (
      <PageShell>
        <ReportViewHeader
          titulo={r.meta.titulo}
          atualizadoEm={r.meta.atualizadoEm}
          criador={criador}
        />
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Este relatorio precisa de revisao: a definicao salva nao e mais valida
          {r.erros[0] ? ` (${r.erros[0]})` : ""}.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ReportViewHeader
        titulo={r.meta.titulo}
        atualizadoEm={r.meta.atualizadoEm}
        criador={criador}
      />
      <ReportRenderer entry={r.entry} dados={r.dados} />
    </PageShell>
  );
}
