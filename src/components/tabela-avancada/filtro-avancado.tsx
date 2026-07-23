"use client";

/**
 * FiltroAvancado , construtor de filtro com regras aninhadas E/OU (todas/qualquer)
 * (dossiê §5.3). Genérico: recebe o conjunto de campos (`campos` + `campoBy`),
 * então serve tanto Pedidos quanto Produtos. Operadores adaptativos ao tipo,
 * seletor de campo curado (comuns vs todos), preview de contagem, Buscar/Descartar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, CornerDownRight, Layers, Search, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal, Btn, Select } from "./ui";
import {
  OPERADORES, testaNo, novaRegraId, LABEL_CONECTOR,
  type Regra, type GrupoRegras, type NoRegra, type CampoTipo, type CampoLike,
} from "./motor-filtro";

/** Campo como o construtor precisa (compatível com CampoDef de pedidos e produtos). */
export interface CampoUI {
  key: string;
  label: string;
  tipo: CampoTipo;
  grupo: string;
  comum: boolean;
  opcoes?: { valor: string; label: string }[];
  get: (row: never) => string | number | string[];
}

const SEL =
  "h-9 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function clonaGrupo(g: GrupoRegras): GrupoRegras {
  return { ...g, filhos: g.filhos.map((f) => (f.tipo === "grupo" ? clonaGrupo(f) : { ...f })) };
}
function atualiza(no: NoRegra, id: string, fn: (n: NoRegra) => NoRegra): NoRegra {
  if (no.id === id) return fn(no);
  if (no.tipo === "grupo") return { ...no, filhos: no.filhos.map((f) => atualiza(f, id, fn)) };
  return no;
}
function remove(g: GrupoRegras, id: string): GrupoRegras {
  return { ...g, filhos: g.filhos.filter((f) => f.id !== id).map((f) => (f.tipo === "grupo" ? remove(f, id) : f)) };
}
function opcoesDoCampoUI(campo: CampoUI, base: unknown[]): { valor: string; label: string }[] {
  if (campo.opcoes && campo.opcoes.length) return campo.opcoes;
  const set = new Map<string, string>();
  base.forEach((row) => { const v = String((campo.get as (r: unknown) => unknown)(row)); if (v) set.set(v, v); });
  return [...set.entries()].map(([valor, label]) => ({ valor, label })).sort((a, b) => a.label.localeCompare(b.label));
}

function SeletorCampo({ value, campos, onChange }: { value: string; campos: CampoUI[]; onChange: (k: string) => void }) {
  const [busca, setBusca] = useState("");
  // Nasce mostrando TODOS os campos (a maioria das colunas é filtrável); o toggle reduz aos comuns.
  const [todos, setTodos] = useState(true);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return campos.filter((c) => (todos || c.comum) && (!b || c.label.toLowerCase().includes(b)));
  }, [busca, todos, campos]);
  const atual = campos.find((c) => c.key === value);

  // O dropdown vai num PORTAL (position: fixed) para NÃO ser cortado pelo scroll do modal
  // (o corpo do Modal tem overflow-y-auto, que recortava a lista de campos). Fecha por clique
  // fora considerando o botão E o popup portado.
  useEffect(() => {
    if (!open) return;
    const el = btnRef.current;
    if (el) { const r = el.getBoundingClientRect(); setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 320) }); }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => { window.clearTimeout(id); document.removeEventListener("mousedown", onDoc); };
  }, [open]);

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)} className={cn(SEL, "flex min-w-[10rem] cursor-pointer items-center justify-between gap-2")}>
        <span className="truncate">{atual?.label ?? "Campo"}</span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }} className="z-[130] rounded-xl border border-border bg-popover p-1.5 shadow-xl">
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campo..." className="mb-1 h-8 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="max-h-80 overflow-y-auto">
            {lista.map((c) => (
              <button key={c.key} type="button" onClick={() => { onChange(c.key); setOpen(false); setBusca(""); }} className={cn("flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent", c.key === value ? "text-foreground" : "text-muted-foreground")}>
                <span className="truncate">{c.label}</span>
                <span className="text-[0.65rem] uppercase text-muted-foreground/60">{c.grupo}</span>
              </button>
            ))}
            {lista.length === 0 && <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">Nenhum campo</p>}
          </div>
          <button type="button" onClick={() => setTodos((v) => !v)} className="mt-1 w-full cursor-pointer rounded-lg border-t border-border px-2.5 py-1.5 text-left text-xs font-medium text-violet-600 hover:bg-accent dark:text-violet-400">
            {todos ? "Mostrar só campos comuns" : "Mostrar todos os campos"}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ValorInput({ campo, regra, onSet }: { campo: CampoUI; regra: Regra; onSet: (patch: Partial<Regra>) => void }) {
  const ops = OPERADORES[campo.tipo];
  const opDef = ops.find((o) => o.op === regra.op) ?? ops[0];
  if (opDef.args === 0) return null;

  if (campo.tipo === "opcao") {
    const opts = campo.opcoes && campo.opcoes.length ? campo.opcoes : [];
    return (
      <div className="w-48">
        <Select value={regra.valor} options={opts.map((o) => ({ value: o.valor, label: o.label }))} placeholder="Selecione..." onChange={(v) => onSet({ valor: v })} ariaLabel="Valor" />
      </div>
    );
  }
  const inputType = campo.tipo === "numero" ? "number" : campo.tipo === "data" ? "date" : "text";
  return (
    <div className="flex items-center gap-1.5">
      <input type={inputType} value={regra.valor} onChange={(e) => onSet({ valor: e.target.value })} placeholder="valor" className={cn(SEL, "min-w-[7rem]")} />
      {opDef.args === 2 && (
        <>
          <span className="text-xs text-muted-foreground">e</span>
          <input type={inputType} value={regra.valor2 ?? ""} onChange={(e) => onSet({ valor2: e.target.value })} placeholder="valor" className={cn(SEL, "min-w-[7rem]")} />
        </>
      )}
    </div>
  );
}

function RegraLinha({ regra, campos, campoBy, onSet, onRemove }: { regra: Regra; campos: CampoUI[]; campoBy: Record<string, CampoUI>; onSet: (patch: Partial<Regra>) => void; onRemove: () => void }) {
  const campo = campoBy[regra.campo] ?? campos[0];
  const ops = OPERADORES[campo.tipo];
  function trocaCampo(k: string) {
    const novoCampo = campoBy[k];
    onSet({ campo: k, op: OPERADORES[novoCampo.tipo][0].op, valor: "", valor2: "" });
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SeletorCampo value={regra.campo} campos={campos} onChange={trocaCampo} />
      <div className="w-40">
        <Select value={regra.op} options={ops.map((o) => ({ value: o.op, label: o.label }))} searchable={false} onChange={(v) => onSet({ op: v })} ariaLabel="Operador" />
      </div>
      <ValorInput campo={campo} regra={regra} onSet={onSet} />
      <button type="button" onClick={onRemove} aria-label="Remover regra" className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="size-4" /></button>
    </div>
  );
}

/** Tag E/OU clicável posicionada ENTRE dois irmãos: um clique alterna o conector
 * daquele par (só aquela fronteira). OU (lógica mais frouxa) fica realçado em violeta;
 * E fica neutro. À direita, uma linha fina que "amarra" os dois irmãos, no espírito da
 * referência , sem copiá-la. */
function ConectorTag({ conector, onToggle }: { conector: "todas" | "qualquer"; onToggle: () => void }) {
  const label = LABEL_CONECTOR[conector];
  const destino = conector === "todas" ? "OU" : "E";
  const ou = conector === "qualquer";
  return (
    <div className="my-1 flex items-center gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Operador ${label} com a regra anterior. Clique para mudar para ${destino}`}
        title="Alternar E / OU"
        className={cn(
          "inline-flex h-6 min-w-[2.5rem] shrink-0 cursor-pointer items-center justify-center rounded-full border px-2.5 text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          ou
            ? "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
            : "border-border bg-card text-foreground hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300",
        )}
      >
        {label}
      </button>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

function GrupoBloco({ grupo, campos, campoBy, campoPadrao, raiz, onChange, onRemove }: { grupo: GrupoRegras; campos: CampoUI[]; campoBy: Record<string, CampoUI>; campoPadrao: string; raiz?: boolean; onChange: (g: GrupoRegras) => void; onRemove?: () => void }) {
  const novaRegra = (): Regra => ({ id: novaRegraId(), tipo: "regra", campo: campoPadrao, op: OPERADORES[campoBy[campoPadrao]?.tipo ?? "texto"][0].op, valor: "" });
  function setNo(id: string, fn: (n: NoRegra) => NoRegra) { onChange(atualiza(grupo, id, fn) as GrupoRegras); }
  // Conector padrão de um novo irmão: herda o do último par existente (para não
  // "quebrar o clima" do grupo), ou o conector do grupo quando ainda não há par.
  function conectorNovo(): "todas" | "qualquer" {
    const ult = grupo.filhos[grupo.filhos.length - 1];
    return ult?.conectorAntes ?? grupo.conector;
  }
  function addRegra() {
    const nova = novaRegra();
    if (grupo.filhos.length > 0) nova.conectorAntes = conectorNovo();
    onChange({ ...grupo, filhos: [...grupo.filhos, nova] });
  }
  function addGrupo() {
    const novo: GrupoRegras = { id: novaRegraId(), tipo: "grupo", conector: "todas", filhos: [novaRegra()] };
    if (grupo.filhos.length > 0) novo.conectorAntes = conectorNovo();
    onChange({ ...grupo, filhos: [...grupo.filhos, novo] });
  }
  function toggleConector(id: string) {
    setNo(id, (n) => ({ ...n, conectorAntes: (n.conectorAntes ?? grupo.conector) === "todas" ? "qualquer" : "todas" }));
  }
  return (
    <div className={cn("rounded-xl border p-3", raiz ? "border-border bg-muted/20" : "border-violet-500/30 bg-violet-500/[0.04]")}>
      {!raiz && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            <Folder className="size-3.5" aria-hidden="true" /> Grupo
          </span>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label="Remover grupo" className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="size-3.5" /></button>
          )}
        </div>
      )}
      <div className={cn(!raiz && "border-l-2 border-violet-500/30 pl-3")}>
        {grupo.filhos.map((f, i) => (
          <div key={f.id}>
            {i > 0 && <ConectorTag conector={f.conectorAntes ?? grupo.conector} onToggle={() => toggleConector(f.id)} />}
            <div className="py-0.5">
              {f.tipo === "regra" ? (
                <RegraLinha regra={f} campos={campos} campoBy={campoBy} onSet={(patch) => setNo(f.id, (n) => ({ ...(n as Regra), ...patch }))} onRemove={() => onChange(remove(grupo, f.id))} />
              ) : (
                <GrupoBloco grupo={f} campos={campos} campoBy={campoBy} campoPadrao={campoPadrao} onChange={(g) => setNo(f.id, () => g)} onRemove={() => onChange(remove(grupo, f.id))} />
              )}
            </div>
          </div>
        ))}
        {grupo.filhos.length === 0 && <p className="py-1 text-sm text-muted-foreground">Sem condições ainda.</p>}
      </div>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={addRegra} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"><Plus className="size-4" /> Nova regra</button>
        <button type="button" onClick={addGrupo} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"><CornerDownRight className="size-4" /> Aninhar grupo</button>
      </div>
    </div>
  );
}

export function FiltroAvancado({
  open, onClose, base, inicial, onAplicar,
  campos,
  campoBy,
  campoPadrao,
}: {
  open: boolean;
  onClose: () => void;
  base: unknown[];
  inicial?: GrupoRegras | null;
  onAplicar: (arvore: GrupoRegras) => void;
  campos: CampoUI[];
  campoBy: Record<string, CampoUI>;
  campoPadrao: string;
}) {
  const [arvore, setArvore] = useState<GrupoRegras>(
    inicial
      ? clonaGrupo(inicial)
      : { id: novaRegraId(), tipo: "grupo", conector: "todas", filhos: [{ id: novaRegraId(), tipo: "regra", campo: campoPadrao, op: OPERADORES[campoBy[campoPadrao]?.tipo ?? "texto"][0].op, valor: "" }] },
  );

  // Preenche opções de campos "opcao" a partir da base.
  useMemo(() => {
    campos.forEach((c) => { if (c.tipo === "opcao" && (!c.opcoes || c.opcoes.length === 0)) c.opcoes = opcoesDoCampoUI(c, base); });
  }, [base, campos]);

  const campoByLike = campoBy as unknown as Record<string, CampoLike>;
  const contagem = useMemo(() => base.filter((row) => testaNo(row, arvore, campoByLike)).length, [base, arvore, campoByLike]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filtro avançado"
      subtitle="Clique na tag E/OU entre as regras para trocar o operador daquele par. Aninhe grupos para montar lógicas compostas."
      size="2xl"
      footer={
        <>
          <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Layers className="size-4 text-violet-500" />
            <span className="font-medium text-foreground">{contagem}</span> resultado{contagem === 1 ? "" : "s"} correspondente{contagem === 1 ? "" : "s"}
          </span>
          <Btn variant="ghost" onClick={onClose}>Descartar</Btn>
          <Btn variant="primary" onClick={() => { onAplicar(arvore); onClose(); }}><Search className="size-4" /> Aplicar filtro</Btn>
        </>
      }
    >
      {/* min-height: o modal já abre num tamanho confortável para montar o 1º filtro e cresce
          conforme as regras vão sendo adicionadas. */}
      <div className="min-h-[20rem]">
        <GrupoBloco grupo={arvore} campos={campos} campoBy={campoBy} campoPadrao={campoPadrao} raiz onChange={setArvore} />
      </div>
    </Modal>
  );
}
