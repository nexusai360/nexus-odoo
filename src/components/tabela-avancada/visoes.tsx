"use client";

/**
 * Views especializadas da tabela avançada (genéricas): Kanban (colunas por um
 * campo agrupador, com busca por coluna) e Calendário (Dia / Semana / Mês, sempre
 * de segunda a domingo, ancorado em hoje). Lentes sobre a MESMA lista filtrada.
 * CSS puro, sem libs.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampoLike } from "./motor-filtro";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
// Semana começa na SEGUNDA (pedido do dono).
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// ===== Kanban (colunas por campo agrupador, com busca por coluna) =====

export function KanbanView<T extends Record<string, unknown>>({
  lista,
  campo,
  campoByKey,
  tituloItem,
  subtituloItem,
  valorItem,
  onAbrir,
}: {
  lista: T[];
  campo: string;
  campoByKey: Record<string, CampoLike>;
  tituloItem?: (row: T) => string;
  subtituloItem?: (row: T) => string;
  valorItem?: (row: T) => string;
  onAbrir?: (row: T) => void;
}) {
  const [buscas, setBuscas] = useState<Record<string, string>>({});

  const chave = (r: T): string => {
    const get = campoByKey[campo]?.get as ((row: T) => string | number | string[]) | undefined;
    const v = get ? get(r) : "";
    return String(Array.isArray(v) ? v.join(", ") : v) || "(vazio)";
  };

  const colunas = useMemo(() => {
    const map = new Map<string, T[]>();
    lista.forEach((r) => { const k = chave(r); if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, campo]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {colunas.map(([nome, itensTodos]) => {
        const q = (buscas[nome] ?? "").trim().toLowerCase();
        const itens = q
          ? itensTodos.filter((r) => `${tituloItem?.(r) ?? ""} ${subtituloItem?.(r) ?? ""} ${valorItem?.(r) ?? ""}`.toLowerCase().includes(q))
          : itensTodos;
        return (
          <div key={nome} className="flex max-h-full w-[19rem] shrink-0 flex-col rounded-xl border border-border bg-card/60">
            <div className="flex items-center justify-between gap-2 px-2.5 pb-1 pt-2">
              <span className="truncate text-sm font-medium text-foreground">{nome}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{q ? `${itens.length}/${itensTodos.length}` : itensTodos.length}</span>
            </div>
            {/* Busca fixa por coluna */}
            <div className="px-2 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={buscas[nome] ?? ""}
                  onChange={(e) => setBuscas((p) => ({ ...p, [nome]: e.target.value }))}
                  placeholder={`Buscar em ${nome}`}
                  aria-label={`Buscar em ${nome}`}
                  className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {itens.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAbrir?.(r)}
                  className={cn("w-full rounded-lg border border-border bg-card p-3 text-left transition-colors", onAbrir && "cursor-pointer hover:bg-accent/40")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{tituloItem ? tituloItem(r) : ""}</span>
                    {valorItem && <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{valorItem(r)}</span>}
                  </div>
                  {subtituloItem && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtituloItem(r)}</p>}
                </button>
              ))}
              {itens.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground/60">{q ? "sem resultado" : "vazio"}</p>}
            </div>
          </div>
        );
      })}
      {colunas.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Sem dados para exibir.</p>}
    </div>
  );
}

// ===== Calendário (Dia / Semana / Mês, segunda a domingo, ancorado em hoje) =====

type ModoCal = "dia" | "semana" | "mes";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
/** Segunda-feira da semana de `d`. */
function inicioSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - dow);
  return x;
}

export function CalendarioView<T extends Record<string, unknown>>({
  lista,
  campoData,
  colunaByKey,
  tituloItem,
  valorItem,
  onAbrir,
}: {
  lista: T[];
  campoData: string;
  colunaByKey: Record<string, { valor: (r: T) => string | number }>;
  tituloItem?: (row: T) => string;
  valorItem?: (row: T) => string;
  onAbrir?: (row: T) => void;
}) {
  const isoDe = (r: T): string => {
    const col = colunaByKey[campoData];
    const v = col ? String(col.valor(r)) : "";
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
  };

  const [modo, setModo] = useState<ModoCal>("mes");
  const [ancora, setAncora] = useState<Date>(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); });

  const porDia = useMemo(() => {
    const map = new Map<string, T[]>();
    lista.forEach((r) => { const k = isoDe(r); if (!k) return; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, campoData]);

  const semData = useMemo(() => lista.filter((r) => !isoDe(r)).length, [lista, campoData]); // eslint-disable-line react-hooks/exhaustive-deps

  function navega(delta: number) {
    setAncora((r) => {
      const d = new Date(r);
      if (modo === "dia") d.setDate(d.getDate() + delta);
      else if (modo === "semana") d.setDate(d.getDate() + delta * 7);
      else d.setMonth(d.getMonth() + delta);
      return d;
    });
  }
  const titulo = useMemo(() => {
    if (modo === "dia") return fmtBR(ancora);
    if (modo === "semana") { const ini = inicioSemana(ancora); const fim = new Date(ini); fim.setDate(fim.getDate() + 6); return `${fmtBR(ini)} - ${fmtBR(fim)}`; }
    return `${MESES[ancora.getMonth()]} ${ancora.getFullYear()}`;
  }, [modo, ancora]);

  const hojeIso = ymd(new Date());

  function CardItem({ r }: { r: T }) {
    return (
      <button type="button" onClick={() => onAbrir?.(r)} title={tituloItem ? tituloItem(r) : ""}
        className={cn("block w-full truncate rounded bg-violet-500/12 px-1.5 py-0.5 text-left text-[0.7rem] font-medium text-violet-700 dark:text-violet-300", onAbrir && "cursor-pointer hover:bg-violet-500/20")}>
        {tituloItem ? tituloItem(r) : ""}{valorItem ? ` · ${valorItem(r)}` : ""}
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* Esquerda: vazia (balanceia o centro) */}
        <div aria-hidden />
        {/* Centro: setinha, período, setinha */}
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => navega(-1)} aria-label="Anterior" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronLeft className="size-4" /></button>
          <h3 className="whitespace-nowrap text-center text-sm font-semibold tabular-nums text-foreground">{titulo}</h3>
          <button type="button" onClick={() => navega(1)} aria-label="Próximo" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
        {/* Direita: seletor Dia / Semana / Mês */}
        <div className="flex justify-end">
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
            {(["dia", "semana", "mes"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModo(m)} aria-pressed={modo === m}
                className={cn("cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors", modo === m ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "text-muted-foreground hover:text-foreground")}>
                {m === "mes" ? "Mês" : m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {modo === "mes" && <VistaMes ancora={ancora} porDia={porDia} hojeIso={hojeIso} CardItem={CardItem} />}
        {modo === "semana" && <VistaSemana ancora={ancora} porDia={porDia} hojeIso={hojeIso} CardItem={CardItem} />}
        {modo === "dia" && <VistaDia ancora={ancora} porDia={porDia} CardItem={CardItem} />}
      </div>

      {semData > 0 && <p className="mt-3 shrink-0 text-xs text-muted-foreground">{semData} registro(s) sem data (não aparecem no calendário).</p>}
    </div>
  );
}

function VistaMes<T>({ ancora, porDia, hojeIso, CardItem }: { ancora: Date; porDia: Map<string, T[]>; hojeIso: string; CardItem: (p: { r: T }) => React.ReactNode }) {
  const primeiro = new Date(ancora.getFullYear(), ancora.getMonth(), 1);
  const offset = (primeiro.getDay() + 6) % 7; // vazios antes da 1ª segunda
  const diasNoMes = new Date(ancora.getFullYear(), ancora.getMonth() + 1, 0).getDate();
  const celulas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const iso = (dia: number) => `${ancora.getFullYear()}-${String(ancora.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return (
    <div className="grid grid-cols-7 gap-1">
      {DIAS.map((d) => <div key={d} className="pb-1 text-center text-xs font-medium uppercase text-muted-foreground">{d}</div>)}
      {celulas.map((dia, i) => (
        <div key={i} className={cn("min-h-[6rem] rounded-lg border p-1", dia ? (iso(dia) === hojeIso ? "border-violet-500/50 bg-violet-500/5" : "border-border/60 bg-background/40") : "border-transparent")}>
          {dia && (
            <>
              <div className={cn("mb-1 px-1 text-xs font-medium", iso(dia) === hojeIso ? "text-violet-600 dark:text-violet-300" : "text-muted-foreground")}>{dia}</div>
              <div className="space-y-1">
                {(porDia.get(iso(dia)) ?? []).slice(0, 3).map((r, k) => <CardItem key={k} r={r} />)}
                {(porDia.get(iso(dia))?.length ?? 0) > 3 && <span className="block px-1.5 text-[0.65rem] text-muted-foreground">+{(porDia.get(iso(dia))!.length - 3)} mais</span>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function VistaSemana<T>({ ancora, porDia, hojeIso, CardItem }: { ancora: Date; porDia: Map<string, T[]>; hojeIso: string; CardItem: (p: { r: T }) => React.ReactNode }) {
  const ini = inicioSemana(ancora);
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(d.getDate() + i); return d; });
  return (
    <div className="grid grid-cols-7 gap-1">
      {dias.map((d, i) => (
        <div key={i} className={cn("flex min-h-[16rem] flex-col rounded-lg border p-1.5", ymd(d) === hojeIso ? "border-violet-500/50 bg-violet-500/5" : "border-border/60 bg-background/40")}>
          <div className={cn("mb-1.5 px-0.5 text-xs font-medium", ymd(d) === hojeIso ? "text-violet-600 dark:text-violet-300" : "text-muted-foreground")}>{DIAS[i]} {String(d.getDate()).padStart(2, "0")}/{String(d.getMonth() + 1).padStart(2, "0")}</div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {(porDia.get(ymd(d)) ?? []).map((r, k) => <CardItem key={k} r={r} />)}
            {(porDia.get(ymd(d))?.length ?? 0) === 0 && <span className="mt-1 block px-1 text-center text-[0.65rem] text-muted-foreground/40">Sem registro</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function VistaDia<T>({ ancora, porDia, CardItem }: { ancora: Date; porDia: Map<string, T[]>; CardItem: (p: { r: T }) => React.ReactNode }) {
  const itens = porDia.get(ymd(ancora)) ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted/50"><CalendarOff className="size-6 text-muted-foreground/60" aria-hidden /></div>
          <p className="text-sm font-medium text-foreground">Sem registro nesta data</p>
          <p className="text-xs text-muted-foreground tabular-nums">{fmtBR(ancora)}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {itens.map((r, k) => <CardItem key={k} r={r} />)}
        </div>
      )}
    </div>
  );
}
