/**
 * /relatorios/construtor , Construtor de relatorios (F6, onda 1).
 *
 * Gate: admin ou super_admin (o construtor consome a API do modelo por cliente;
 * fica restrito a quem administra). O layout do grupo /relatorios ja exige
 * dominios visiveis.
 *
 * Layout: split chat (esquerda) + preview ao vivo (direita), reusando a estetica
 * da bolha do Nex. Estado e orquestracao vivem no BuilderWorkspace (client).
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { BuilderWorkspace } from "@/components/reports/builder/builder-workspace";

export const metadata = { title: "Construtor de relatorios | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ConstrutorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "admin" && user.platformRole !== "super_admin") {
    redirect("/relatorios");
  }

  return (
    <PageShell variant="wide" className="py-6">
      <div className="h-[calc(100dvh-9rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <BuilderWorkspace />
      </div>
    </PageShell>
  );
}
