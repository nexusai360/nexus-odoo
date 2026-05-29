import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = { title: "Dashboard | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const firstName = user.name.split(" ")[0];

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Olá, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bem-vindo ao Nexus Odoo , painel de dados do ERP.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Os relatórios serão adicionados na Fase 3. A fundação , autenticação,
          RBAC e o shell da plataforma , já está pronta.
        </p>
      </div>
    </PageShell>
  );
}
