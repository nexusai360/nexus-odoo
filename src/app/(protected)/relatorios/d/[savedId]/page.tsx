import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { carregarRelatorioDinamico } from "@/lib/reports/builder/carregar-relatorio-dinamico";
import { ReportRenderer } from "@/components/reports/builder/report-renderer";
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

  if (r.tipo === "invalida") {
    return (
      <PageShell>
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
      <ReportRenderer entry={r.entry} dados={r.dados} />
    </PageShell>
  );
}
