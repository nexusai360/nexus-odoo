import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings, Scale, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSyncConfig, getSyncState, getFatosState } from "@/lib/actions/sync-config";
import { getDiretoriaConfig } from "@/lib/actions/diretoria-config";
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

  const [config, diretoria, estado, fatos, acessoRel2, menuAccess] = await Promise.all([
    getSyncConfig(),
    getDiretoriaConfig(),
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
      <ConfiguracaoContent config={config} diretoria={diretoria} estado={estado} fatos={fatos} />

      {/* Acesso aos menus por perfil (todos os menus do sidebar) */}
      <div className="mt-6">
        <MenuAccessCard initial={menuAccess} />
      </div>

      {/* Acesso fino aos submenus de Relatorios 2.0 (paineis/meus/construtor) */}
      <div className="mt-6">
        <Relatorios2AccessCard initial={acessoRel2} />
      </div>

      {/* Modo sombra da classificacao de receita: a regra nova roda em paralelo e so observa.
          A tela mostra o placar entre as duas regras, para decidir a virada com prova. */}
      <div className="mt-6">
        <Link
          href="/configuracao/classificacao-fiscal"
          className="group flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-3">
            <Scale className="size-5 text-white/50" aria-hidden />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-white/90">Classificação fiscal</span>
              <span className="text-xs text-white/50">
                Placar da regra nova de receita, que roda em paralelo à que vale hoje
              </span>
            </span>
          </span>
          <ArrowRight
            className="size-4 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60"
            aria-hidden
          />
        </Link>
      </div>
    </PageShell>
  );
}
