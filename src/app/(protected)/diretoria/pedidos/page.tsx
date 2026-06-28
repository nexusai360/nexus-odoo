import { Truck } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { requireDiretoriaArea } from "@/lib/diretoria/access";

export const dynamic = "force-dynamic";

export default async function DiretoriaPedidosPage() {
  await requireDiretoriaArea("pedidos");

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Truck}
        title="Pedidos & Entregas"
        subtitle="Demandas a entregar, dívida com clientes e mapa de demandas por estado."
      />
      <p className="text-sm text-muted-foreground">Em construção (Onda 2).</p>
    </PageShell>
  );
}
