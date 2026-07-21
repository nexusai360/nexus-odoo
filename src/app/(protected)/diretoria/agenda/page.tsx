import { CalendarDays } from "lucide-react";

import { DiretoriaShell, BotaoModoEstendido } from "@/components/diretoria/modo-estendido";
import { PageHeader } from "@/components/page-header";
import { requireDiretoriaArea, canDiretoria } from "@/lib/diretoria/access";
import { listarEventos, listarColaboradoresElegiveis } from "@/lib/actions/diretoria-agenda";
import { AgendaCalendar } from "@/components/diretoria/agenda-calendar";

export const dynamic = "force-dynamic";

export default async function DiretoriaAgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDiretoriaArea("agenda");
  const sp = await searchParams;
  const mesParam = (Array.isArray(sp.mes) ? sp.mes[0] : sp.mes) ?? "";

  const agora = new Date();
  const mesIso = /^\d{4}-\d{2}$/.test(mesParam)
    ? mesParam
    : `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;

  const [ano, m] = mesIso.split("-").map(Number);
  const de = new Date(Date.UTC(ano, m - 1, 1)).toISOString();
  const ate = new Date(Date.UTC(ano, m, 0, 23, 59, 59)).toISOString();

  const [eventos, podeGerenciar, colaboradores] = await Promise.all([
    listarEventos(de, ate),
    canDiretoria(user, "diretoria.agenda.manage"),
    listarColaboradoresElegiveis(),
  ]);

  return (
    <DiretoriaShell>
      <PageHeader
        icon={CalendarDays}
        title="Agenda"
        subtitle="Eventos da operação: reuniões, inventários, prospecções e assembleias."
      />
      <div className="mb-4 flex">
        <BotaoModoEstendido />
      </div>
      <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
        <AgendaCalendar
          eventos={eventos}
          mesIso={mesIso}
          podeGerenciar={podeGerenciar}
          colaboradores={colaboradores}
        />
      </section>
    </DiretoriaShell>
  );
}
