import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getMyDomains } from "@/lib/actions/domain-access";
import { reportsForUser } from "@/lib/reports/catalog";
import { listarMeus } from "@/lib/reports/builder/saved-report-repo";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { RelatoriosGrid } from "./relatorios-grid";
import { RelatoriosMeus, type RelatorioMeuItem } from "./relatorios-meus";

export const metadata = { title: "Relatórios | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const domains = await getMyDomains();
  const reports = reportsForUser(user.platformRole, domains);
  const podeConstruir =
    user.platformRole === "admin" || user.platformRole === "super_admin";

  const meus = await listarMeus({ userId: user.id, role: user.platformRole }).catch(
    () => [] as Awaited<ReturnType<typeof listarMeus>>,
  );
  const itensMeus: RelatorioMeuItem[] = meus.map((m) => ({
    id: m.id,
    titulo: m.titulo,
    atualizadoEm: m.atualizadoEm.toISOString(),
  }));

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={BarChart3}
        title="Relatórios"
        subtitle="Painéis de estoque com dados do cache sincronizado"
      />
      <RelatoriosGrid reports={reports} />
      {podeConstruir || itensMeus.length > 0 ? (
        <RelatoriosMeus itens={itensMeus} podeConstruir={podeConstruir} />
      ) : null}
    </PageShell>
  );
}
