import { Boxes } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { requireDiretoriaArea } from "@/lib/diretoria/access";

export const dynamic = "force-dynamic";

export default async function DiretoriaEstoquePage() {
  await requireDiretoriaArea("estoque");

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Boxes}
        title="Estoque & Compras"
        subtitle="Estoque por local, seriais, compras ativas e por fornecedor."
      />
      <p className="text-sm text-muted-foreground">Em construção (Onda 3).</p>
    </PageShell>
  );
}
