import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Dashboard | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Visão geral da operação"
      />
      <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Os relatórios serão adicionados na Fase 3. A fundação (auth, RBAC,
          shell) está pronta.
        </p>
      </div>
    </PageShell>
  );
}
