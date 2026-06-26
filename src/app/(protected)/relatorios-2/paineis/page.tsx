/**
 * /relatorios-2/paineis , Painéis (catálogo de relatórios pré-definidos) dentro
 * da área Relatórios 2.0. Mesma grade do menu Relatórios atual, filtrada por
 * papel + domínios visíveis.
 */
import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getMyDomains } from "@/lib/actions/domain-access";
import { reportsForUser } from "@/lib/reports/catalog";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { RelatoriosGrid } from "../../relatorios/relatorios-grid";

export const metadata = { title: "Painéis | Relatórios 2.0" };
export const dynamic = "force-dynamic";

export default async function PaineisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const domains = await getMyDomains();
  const reports = reportsForUser(user.platformRole, domains);
  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutGrid}
        title="Painéis"
        subtitle="Relatórios pré-definidos com dados do cache sincronizado."
      />
      <RelatoriosGrid reports={reports} />
    </PageShell>
  );
}
