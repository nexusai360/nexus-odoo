"use client";

/**
 * FiltroAvancado , construtor de filtro com regras aninhadas E/OU (todas/qualquer)
 * (dossiê §5.3). Genérico: recebe o conjunto de campos (`campos` + `campoBy`),
 * então serve tanto Pedidos quanto Produtos. Operadores adaptativos ao tipo,
 * seletor de campo curado (comuns vs todos), preview de contagem, Buscar/Descartar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, CornerDownRight, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal, Btn, Select } from "./ui";
import {
  OPERADORES, testaNo, novaRegraId,
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
  const [todos, setTodos] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return campos.filter((c) => (todos || c.comum) && (!b || c.label.toLowerCase().includes(b)));
  }, [busca, todos, campos]);
  const atual = campos.find((c) => c.key === value);

  // Fecha por clique fora (o listener é anexado no próximo tick para não pegar o
  // clique de abertura). NÃO usa onBlur , o autoFocus do input roubava o foco e
  // fechava o dropdown na hora (era o "erro" do filtro personalizado).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => { window.clearTimeout(id); document.removeEventListener("mousedown", onDoc); };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={cn(SEL, "flex min-w-[10rem] cursor-pointer items-center justify-between gap-2")}>
        <span className="truncate">{atual?.label ?? "Campo"}</span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campo..." className="mb-1 h-8 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="max-h-56 overflow-y-auto">
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
        </div>
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

function GrupoBloco({ grupo, campos, campoBy, campoPadrao, raiz, onChange, onRemove }: { grupo: GrupoRegras; campos: CampoUI[]; campoBy: Record<string, CampoUI>; campoPadrao: string; raiz?: boolean; onChange: (g: GrupoRegras) => void; onRemove?: () => void }) {
  const novaRegra = (): Regra => ({ id: novaRegraId(), tipo: "regra", campo: campoPadrao, op: OPERADORES[campoBy[campoPadrao]?.tipo ?? "texto"][0].op, valor: "" });
  function setNo(id: string, fn: (n: NoRegra) => NoRegra) { onChange(atualiza(grupo, id, fn) as GrupoRegras); }
  return (
    <div className={cn("rounded-xl border border-border p-3", raiz ? "bg-muted/20" : "bg-card")}>
      <div className="mb-2.5 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Corresponder a</span>
        <div className="w-32">
          <Select value={grupo.conector} options={[{ value: "todas", label: "E" }, { value: "qualquer", label: "OU" }]} searchable={false} onChange={(v) => onChange({ ...grupo, conector: v as "todas" | "qualquer" })} ariaLabel="Conector do grupo" />
        </div>
        <span className="text-muted-foreground">das condições:</span>
        {!raiz && onRemove && (
          <button type="button" onClick={onRemove} aria-label="Remover grupo" className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="size-3.5" /></button>
        )}
      </div>
      <div className="space-y-2 border-l-2 border-violet-500/30 pl-3">
        {grupo.filhos.map((f) =>
          f.tipo === "regra" ? (
            <RegraLinha key={f.id} regra={f} campos={campos} campoBy={campoBy} onSet={(patch) => setNo(f.id, (n) => ({ ...(n as Regra), ...patch }))} onRemove={() => onChange(remove(grupo, f.id))} />
          ) : (
            <GrupoBloco key={f.id} grupo={f} campos={campos} campoBy={campoBy} campoPadrao={campoPadrao} onChange={(g) => setNo(f.id, () => g)} onRemove={() => onChange(remove(grupo, f.id))} />
          ),
        )}
        {grupo.filhos.length === 0 && <p className="py-1 text-sm text-muted-foreground">Sem condições ainda.</p>}
      </div>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={() => onChange({ ...grupo, filhos: [...grupo.filhos, novaRegra()] })} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"><Plus className="size-4" /> Nova regra</button>
        <button type="button" onClick={() => onChange({ ...grupo, filhos: [...grupo.filhos, { id: novaRegraId(), tipo: "grupo", conector: "qualquer", filhos: [novaRegra()] } as GrupoRegras] })} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"><CornerDownRight className="size-4" /> Aninhar grupo</button>
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
      title="Filtro personalizado"
      subtitle="Combine regras com E (todas) ou OU (qualquer). Aninhe grupos para lógica composta."
      size="lg"
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
      <GrupoBloco grupo={arvore} campos={campos} campoBy={campoBy} campoPadrao={campoPadrao} raiz onChange={setArvore} />
    </Modal>
  );
}
