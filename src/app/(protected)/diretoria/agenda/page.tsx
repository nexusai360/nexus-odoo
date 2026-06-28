import { CalendarDays } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { requireDiretoriaArea } from "@/lib/diretoria/access";

export const dynamic = "force-dynamic";

export default async function DiretoriaAgendaPage() {
  await requireDiretoriaArea("agenda");

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={CalendarDays}
        title="Agenda"
        subtitle="Eventos da operação: reuniões, inventários, prospecções e assembleias."
      />
      <p className="text-sm text-muted-foreground">Em construção (Onda 5).</p>
    </PageShell>
  );
}
