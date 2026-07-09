import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSyncConfig, getSyncState, getFatosState } from "@/lib/actions/sync-config";
import { obterAcessoRelatorios2 } from "@/lib/reports/acesso-relatorios2";
import { obterMenuAccess } from "@/lib/nav/menu-access";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { ConfiguracaoContent } from "./configuracao-content";
import { MenuAccessCard } from "@/components/configuracao/menu-access-card";
import { Relatorios2AccessCard } from "@/components/configuracao/relatorios2-access-card";

export const metadata = { title: "Configuração | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ConfiguracaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [config, estado, fatos, acessoRel2, menuAccess] = await Promise.all([
    getSyncConfig(),
    getSyncState(),
    getFatosState(),
    obterAcessoRelatorios2(),
    obterMenuAccess(),
  ]);

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Settings}
        title="Configuração"
        subtitle="Configure os intervalos de sincronização e acompanhe o estado da ingestão"
      />
      <ConfiguracaoContent config={config} estado={estado} fatos={fatos} />

      {/* Acesso aos menus por perfil (todos os menus do sidebar) */}
      <div className="mt-6">
        <MenuAccessCard initial={menuAccess} />
      </div>

      {/* Acesso fino aos submenus de Relatorios 2.0 (paineis/meus/construtor) */}
      <div className="mt-6">
        <Relatorios2AccessCard initial={acessoRel2} />
      </div>
    </PageShell>
  );
}
