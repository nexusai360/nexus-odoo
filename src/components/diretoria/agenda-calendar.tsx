"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  criarEvento,
  excluirEvento,
  type EventoResumo,
} from "@/lib/actions/diretoria-agenda";
import type { DiretoriaEventoTipo } from "@/generated/prisma/client";

const TIPO_LABEL: Record<DiretoriaEventoTipo, string> = {
  reuniao: "Reunião",
  entrega: "Entrega",
  inventario: "Inventário",
  prospeccao: "Prospecção",
  carregamento: "Carregamento",
  organizacao_estoque: "Organização de estoque",
  assembleia: "Assembleia",
  visita: "Visita",
};

const TIPO_COR: Record<DiretoriaEventoTipo, string> = {
  reuniao: "bg-violet-600/30 text-violet-200",
  entrega: "bg-emerald-600/30 text-emerald-200",
  inventario: "bg-amber-600/30 text-amber-200",
  prospeccao: "bg-sky-600/30 text-sky-200",
  carregamento: "bg-orange-600/30 text-orange-200",
  organizacao_estoque: "bg-teal-600/30 text-teal-200",
  assembleia: "bg-rose-600/30 text-rose-200",
  visita: "bg-indigo-600/30 text-indigo-200",
};

const DIAS_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function gridDoMes(ano: number, mes0: number): (number | null)[] {
  const primeiro = new Date(Date.UTC(ano, mes0, 1));
  const diaSemanaInicio = (primeiro.getUTCDay() + 6) % 7; // 0 = segunda
  const diasNoMes = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
  const celulas: (number | null)[] = [];
  for (let i = 0; i < diaSemanaInicio; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(d);
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

export function AgendaCalendar({
  eventos,
  mesIso,
  podeGerenciar,
}: {
  eventos: EventoResumo[];
  mesIso: string; // "YYYY-MM"
  podeGerenciar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    tipo: "reuniao" as DiretoriaEventoTipo,
    data: `${mesIso}-01`,
    hora: "09:00",
    local: "",
  });
  const [erro, setErro] = useState<string | null>(null);

  const [ano, mes0] = mesIso.split("-").map((s, i) => (i === 1 ? Number(s) - 1 : Number(s)));
  const celulas = gridDoMes(ano, mes0);

  const porDia = new Map<number, EventoResumo[]>();
  for (const e of eventos) {
    const d = new Date(e.inicio);
    const dia = d.getUTCDate();
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(e);
  }

  const prev = (() => {
    const m = mes0 === 0 ? 12 : mes0;
    const y = mes0 === 0 ? ano - 1 : ano;
    return `${y}-${String(m).padStart(2, "0")}`;
  })();
  const next = (() => {
    const m = mes0 + 2 > 12 ? 1 : mes0 + 2;
    const y = mes0 + 2 > 12 ? ano + 1 : ano;
    return `${y}-${String(m).padStart(2, "0")}`;
  })();
  const rotuloMes = new Date(Date.UTC(ano, mes0, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  function salvar() {
    setErro(null);
    start(async () => {
      const r = await criarEvento({
        titulo: form.titulo,
        tipo: form.tipo,
        inicio: new Date(`${form.data}T${form.hora}:00Z`).toISOString(),
        local: form.local || null,
      });
      if (r.ok) {
        setAberto(false);
        setForm((f) => ({ ...f, titulo: "", local: "" }));
        router.refresh();
      } else {
        setErro(r.erro ?? "Falha ao salvar");
      }
    });
  }

  function remover(id: string) {
    start(async () => {
      await excluirEvento(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <a
            href={`?mes=${prev}`}
            className="rounded-lg border border-border/60 px-2.5 py-1 text-sm hover:bg-muted/60"
            aria-label="Mês anterior"
          >
            ‹
          </a>
          <span className="min-w-40 text-center text-sm font-semibold capitalize">{rotuloMes}</span>
          <a
            href={`?mes=${next}`}
            className="rounded-lg border border-border/60 px-2.5 py-1 text-sm hover:bg-muted/60"
            aria-label="Próximo mês"
          >
            ›
          </a>
        </div>
        {podeGerenciar ? (
          <button
            type="button"
            onClick={() => setAberto((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo evento
          </button>
        ) : null}
      </div>

      {aberto ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/60 p-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Título
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="w-56 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tipo
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as DiretoriaEventoTipo })}
              className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm"
            >
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Data
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
              className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Hora
            <input
              type="time"
              value={form.hora}
              onChange={(e) => setForm({ ...form, hora: e.target.value })}
              className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Local
            <input
              value={form.local}
              onChange={(e) => setForm({ ...form, local: e.target.value })}
              className="w-40 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending || !form.titulo}
            onClick={salvar}
            className="rounded-lg bg-violet-600 px-3.5 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Salvar
          </button>
          {erro ? <span className="text-xs text-rose-400">{erro}</span> : null}
        </div>
      ) : null}

      {/* Grade do mês */}
      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] uppercase text-muted-foreground">{d}</div>
        ))}
        {celulas.map((dia, i) => (
          <div
            key={i}
            className={cn(
              "min-h-24 rounded-lg border border-border/40 p-1.5",
              dia ? "bg-card/40" : "bg-transparent",
            )}
          >
            {dia ? (
              <>
                <div className="mb-1 text-xs text-muted-foreground tabular-nums">{dia}</div>
                <div className="space-y-1">
                  {(porDia.get(dia) ?? []).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      title={`${TIPO_LABEL[e.tipo]}${e.local ? " , " + e.local : ""}`}
                      onClick={() => podeGerenciar && remover(e.id)}
                      className={cn(
                        "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]",
                        TIPO_COR[e.tipo],
                      )}
                    >
                      {e.titulo}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
      {podeGerenciar ? (
        <p className="text-xs text-muted-foreground">Clique num evento para removê-lo.</p>
      ) : null}
    </div>
  );
}
