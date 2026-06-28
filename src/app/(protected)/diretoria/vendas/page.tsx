import { TrendingUp } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { requireDiretoriaArea } from "@/lib/diretoria/access";

export const dynamic = "force-dynamic";

export default async function DiretoriaVendasPage() {
  await requireDiretoriaArea("vendas");

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={TrendingUp}
        title="Vendas"
        subtitle="Faturamento, vendas por estado e marca, modalidades e formas de pagamento."
      />
      <p className="text-sm text-muted-foreground">Em construção (Onda 1).</p>
    </PageShell>
  );
}
