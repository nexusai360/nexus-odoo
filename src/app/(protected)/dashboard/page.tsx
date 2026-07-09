import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/nav/require-menu-access";
import { PageShell } from "@/components/layout/page-shell";
import {
  AccessDeniedBanner,
  type AccessDeniedKind,
} from "@/components/dashboard/access-denied-banner";

export const metadata = { title: "Dashboard | Nexus Odoo" };
export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // O Dashboard também é um menu configurável: quem não pode vê-lo cai em /perfil
  // (destinoQuandoBloqueado), e não aqui. Sem isso, o item some do sidebar mas a
  // URL direta continua abrindo, e todo redirect de guard desemboca nesta tela.
  await requireMenuAccess("dashboard");

  const sp = await searchParams;
  const denied = sp.denied;
  const error = sp.error;
  const bannerKind: AccessDeniedKind | null = denied
    ? "denied"
    : error === "no_domains"
      ? "no_domains"
      : null;

  const firstName = user.name.split(" ")[0];

  return (
    <PageShell>
      {bannerKind ? <AccessDeniedBanner kind={bannerKind} role={denied} /> : null}
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
