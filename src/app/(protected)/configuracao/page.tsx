import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSyncConfig, getSyncState } from "@/lib/actions/sync-config";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { ConfiguracaoContent } from "./configuracao-content";

export const metadata = { title: "Configuração | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ConfiguracaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [config, estado] = await Promise.all([getSyncConfig(), getSyncState()]);

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Settings}
        title="Configuração"
        subtitle="Configure os intervalos de sincronização e acompanhe o estado da ingestão"
      />
      <ConfiguracaoContent config={config} estado={estado} />
    </PageShell>
  );
}
