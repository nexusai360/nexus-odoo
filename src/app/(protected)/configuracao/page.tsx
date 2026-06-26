import { redirect } from "next/navigation";
import { Settings, LayoutDashboard } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSyncConfig, getSyncState, getFatosState } from "@/lib/actions/sync-config";
import { obterAcessoRelatorios2 } from "@/lib/reports/acesso-relatorios2";
import { RELATORIOS2_MENU } from "@/lib/constants/relatorios2";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { ConfiguracaoContent } from "./configuracao-content";
import { Relatorios2AccessCard } from "@/components/configuracao/relatorios2-access-card";

export const metadata = { title: "Configuração | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ConfiguracaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [config, estado, fatos, acessoRel2] = await Promise.all([
    getSyncConfig(),
    getSyncState(),
    getFatosState(),
    obterAcessoRelatorios2(),
  ]);

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Settings}
        title="Configuração"
        subtitle="Configure os intervalos de sincronização e acompanhe o estado da ingestão"
      />
      <ConfiguracaoContent config={config} estado={estado} fatos={fatos} />

      {/* Acesso ao menu Relatorios 2.0 (menu + submenus) */}
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-violet-500" aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-foreground">{RELATORIOS2_MENU.label}</h2>
            <p className="text-sm text-muted-foreground">
              Quem pode ver o menu e cada submenu (painéis, meus relatórios, construtor).
            </p>
          </div>
        </div>
        <Relatorios2AccessCard initial={acessoRel2} />
      </section>
    </PageShell>
  );
}
