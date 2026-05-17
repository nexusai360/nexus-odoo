import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getMyDomains } from "@/lib/actions/domain-access";
import { reportsForUser } from "@/lib/reports/catalog";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { RelatoriosGrid } from "./relatorios-grid";

export const metadata = { title: "Relatórios | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const domains = await getMyDomains();
  const reports = reportsForUser(user.platformRole, domains);
  return (
    <PageShell variant="wide">
      <PageHeader
        icon={BarChart3}
        title="Relatórios"
        subtitle="Painéis de estoque com dados do cache sincronizado"
      />
      <RelatoriosGrid reports={reports} />
    </PageShell>
  );
}
