"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, MapPin, Clock, Trash2, CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  criarEvento,
  excluirEvento,
  type EventoResumo,
  type ColaboradorResumo,
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

// Ponto colorido por tipo (para o painel do dia).
const TIPO_DOT: Record<DiretoriaEventoTipo, string> = {
  reuniao: "bg-violet-400",
  entrega: "bg-emerald-400",
  inventario: "bg-amber-400",
  prospeccao: "bg-sky-400",
  carregamento: "bg-orange-400",
  organizacao_estoque: "bg-teal-400",
  assembleia: "bg-rose-400",
  visita: "bg-indigo-400",
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

function horaDe(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function AgendaCalendar({
  eventos,
  mesIso,
  podeGerenciar,
  colaboradores = [],
}: {
  eventos: EventoResumo[];
  mesIso: string; // "YYYY-MM"
  podeGerenciar: boolean;
  colaboradores?: ColaboradorResumo[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);

  const [ano, mes0] = mesIso.split("-").map((s, i) => (i === 1 ? Number(s) - 1 : Number(s)));
  const celulas = gridDoMes(ano, mes0);

  const porDia = useMemo(() => {
    const m = new Map<number, EventoResumo[]>();
    for (const e of eventos) {
      const dia = new Date(e.inicio).getUTCDate();
      if (!m.has(dia)) m.set(dia, []);
      m.get(dia)!.push(e);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return m;
  }, [eventos]);

  // Dia selecionado: primeiro dia com evento; senão 1 (determinístico, sem "now"
  // para não quebrar a hidratação).
  const primeiroComEvento = useMemo(() => {
    const dias = [...porDia.keys()].sort((a, b) => a - b);
    return dias[0] ?? 1;
  }, [porDia]);
  const [diaSel, setDiaSel] = useState<number>(primeiroComEvento);

  const [form, setForm] = useState({
    titulo: "",
    tipo: "reuniao" as DiretoriaEventoTipo,
    hora: "09:00",
    local: "",
  });
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

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

  const eventosDoDia = porDia.get(diaSel) ?? [];
  const dataSelExtenso = new Date(Date.UTC(ano, mes0, diaSel)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });

  function salvar() {
    setErro(null);
    const dataIso = `${mesIso}-${String(diaSel).padStart(2, "0")}`;
    start(async () => {
      const r = await criarEvento({
        titulo: form.titulo,
        tipo: form.tipo,
        inicio: new Date(`${dataIso}T${form.hora}:00Z`).toISOString(),
        local: form.local || null,
        colaboradorIds: selecionados,
      });
      if (r.ok) {
        setAberto(false);
        setForm((f) => ({ ...f, titulo: "", local: "" }));
        setSelecionados([]);
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
      {/* Cabeçalho: navegação de mês + novo evento */}
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

      {/* Form de novo evento (cria no dia selecionado) */}
      {aberto && podeGerenciar ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="w-full text-xs text-muted-foreground">
            Criando evento em <span className="font-medium capitalize text-foreground">{dataSelExtenso}</span> (clique num dia no calendário para mudar).
          </div>
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
          {colaboradores.length ? (
            <div className="flex w-full flex-col gap-1.5 text-xs text-muted-foreground">
              <span>Colaboradores</span>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {colaboradores.map((c) => {
                  const ativo = selecionados.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() =>
                        setSelecionados((s) => (ativo ? s.filter((x) => x !== c.id) : [...s, c.id]))
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        ativo
                          ? "border-violet-500 bg-violet-600/20 text-violet-200"
                          : "border-border/60 hover:bg-muted/60",
                      )}
                    >
                      {c.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
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

      {/* Layout 2 colunas: calendário + painel do dia */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_330px]">
        {/* Grade do mês */}
        <div className="grid grid-cols-7 gap-1">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="pb-1 text-center text-[11px] uppercase text-muted-foreground">{d}</div>
          ))}
          {celulas.map((dia, i) => {
            const eventosCel = dia ? porDia.get(dia) ?? [] : [];
            const sel = dia === diaSel;
            return (
              <div
                key={i}
                onClick={() => dia && setDiaSel(dia)}
                role={dia ? "button" : undefined}
                tabIndex={dia ? 0 : undefined}
                onKeyDown={(e) => {
                  if (dia && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setDiaSel(dia);
                  }
                }}
                className={cn(
                  "min-h-24 rounded-lg border p-1.5 transition-colors",
                  dia ? "cursor-pointer bg-card/40 hover:bg-muted/40" : "border-transparent bg-transparent",
                  sel ? "border-violet-500/70 ring-1 ring-violet-500/40" : "border-border/40",
                )}
              >
                {dia ? (
                  <>
                    <div className={cn("mb-1 text-xs tabular-nums", sel ? "font-semibold text-violet-200" : "text-muted-foreground")}>{dia}</div>
                    <div className="space-y-1">
                      {eventosCel.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          title={`${horaDe(e.inicio)} · ${TIPO_LABEL[e.tipo]}${e.local ? " · " + e.local : ""}`}
                          className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]", TIPO_COR[e.tipo])}
                        >
                          {e.titulo}
                          {e.colaboradores.length ? (
                            <span className="ml-1 inline-flex items-center gap-0.5 align-middle opacity-70">
                              <Users className="h-2.5 w-2.5" />
                              {e.colaboradores.length}
                            </span>
                          ) : null}
                        </span>
                      ))}
                      {eventosCel.length > 3 ? (
                        <span className="block px-1.5 text-[10px] text-muted-foreground">+{eventosCel.length - 3} mais</span>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Painel do dia */}
        <aside className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10">
              <CalendarDays className="h-4 w-4 text-violet-400" aria-hidden />
            </span>
            <div>
              <div className="text-sm font-semibold capitalize">{dataSelExtenso}</div>
              <div className="text-xs text-muted-foreground">
                {eventosDoDia.length === 0
                  ? "Nenhum evento"
                  : `${eventosDoDia.length} ${eventosDoDia.length === 1 ? "evento" : "eventos"}`}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {eventosDoDia.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Sem eventos neste dia.
                {podeGerenciar ? " Use “Novo evento” para adicionar." : ""}
              </p>
            ) : (
              eventosDoDia.map((e) => (
                <div key={e.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TIPO_DOT[e.tipo])} />
                      <span className="truncate text-sm font-medium" title={e.titulo}>{e.titulo}</span>
                    </div>
                    {podeGerenciar ? (
                      <button
                        type="button"
                        onClick={() => remover(e.id)}
                        disabled={pending}
                        aria-label="Excluir evento"
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{horaDe(e.inicio)}</span>
                    <span className={cn("rounded-full px-1.5 py-0.5", TIPO_COR[e.tipo])}>{TIPO_LABEL[e.tipo]}</span>
                    {e.local ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.local}</span> : null}
                  </div>
                  {e.colaboradores.length ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      {e.colaboradores.map((c) => (
                        <span key={c.id} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{c.nome}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {podeGerenciar ? (
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/10 px-3 py-1.5 text-sm text-violet-200 transition-colors hover:bg-violet-600/20"
            >
              <Plus className="h-4 w-4" /> Novo evento neste dia
            </button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
