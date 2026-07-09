import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/nav/require-menu-access";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { UsersTabs } from "@/components/users/users-tabs";

export const metadata = { title: "Usuários | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Guard da feature "Acesso aos menus": bloqueia URL direta se o menu Usuários
  // foi restringido acima do perfil (o sidebar já esconde).
  await requireMenuAccess("usuarios");
  // Visualizador não gerencia usuários; gerente/admin/super_admin acessam.
  if (user.platformRole === "viewer") {
    redirect("/dashboard");
  }
  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Users}
        title="Usuários"
        subtitle="Gerencie os usuários da plataforma e acompanhe a auditoria"
      />
      <UsersTabs currentUser={user} />
    </PageShell>
  );
}
