import { LayoutDashboard } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { requireDiretoriaArea } from "@/lib/diretoria/access";

export const dynamic = "force-dynamic";

export default async function DiretoriaVisaoGeralPage() {
  await requireDiretoriaArea("visao_geral");

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutDashboard}
        title="Visão geral"
        subtitle="Painel executivo da diretoria: indicadores, mapa do Brasil e atalhos."
      />
      <p className="text-sm text-muted-foreground">
        Em construção (Onda 4).
      </p>
    </PageShell>
  );
}
