import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PasswordChangeCard } from "@/components/profile/password-change-card";

export const metadata = { title: "Trocar senha | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function TrocarSenhaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Defesa em profundidade: se o usuário já não precisa trocar a senha (token
  // revalidado pelo callback jwt), não fica preso nesta tela.
  if (!user.mustChangePassword) redirect("/dashboard");
  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={KeyRound}
        title="Trocar senha"
        subtitle="Defina uma nova senha para continuar"
      />
      <PasswordChangeCard redirectOnSuccess="/dashboard" />
    </PageShell>
  );
}
