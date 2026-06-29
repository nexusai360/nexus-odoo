"use client";

// Construtor modular (Onda 1) , grid de OITAVOS (8 colunas) arrastável e
// redimensionável (react-grid-layout). Modo view (estático, layout salvo) e modo
// edição (arrastar pela mãozinha, redimensionar, paleta de componentes, salvar
// oficial/pessoal, restaurar). Reusa o catálogo (travas) e os renders BI.

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { GripVertical, X, Plus, Save, RotateCcw, Pencil, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CATALOGO, GRID_COLS, componentePorId, travasDoTipo, type FonteDado,
} from "@/lib/diretoria/builder/catalogo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";
import { renderBlocoEstoque } from "@/components/diretoria/blocos/blocos-estoque";
import type { EstoqueData } from "@/components/diretoria/estoque/estoque-screen";
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";
import { salvarLayoutAction, restaurarLayoutPessoalAction } from "@/lib/actions/diretoria-layout";

const Grid = WidthProvider(GridLayout);
const ROW_H = 64;

const SELO: Record<Exclude<FonteDado, "real">, string> = {
  estimado: "Estimado",
  sem_fonte: "Sem fonte",
};

export function ConstrutorGrid({
  tela,
  data,
  layoutInicial,
  dominios,
  podeEditarPessoal,
  podeEditarGlobal,
}: {
  tela: DiretoriaArea;
  data: EstoqueData;
  layoutInicial: BlocoLayout[];
  /** Domínios cujos componentes aparecem na paleta (ex.: ["A","K"]). */
  dominios: string[];
  podeEditarPessoal: boolean;
  podeEditarGlobal: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [blocos, setBlocos] = useState<BlocoLayout[]>(layoutInicial);
  const [salvando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const layout: Layout[] = useMemo(
    () =>
      blocos.map((b) => {
        const comp = componentePorId(b.componenteId);
        const tr = comp ? travasDoTipo(comp.tipo) : { larguraMin: 2, larguraMax: 8, alturaMin: 2, alturaMax: 8 };
        return {
          i: b.componenteId,
          x: b.x,
          y: b.y,
          w: b.largura,
          h: b.altura,
          minW: tr.larguraMin,
          maxW: tr.larguraMax,
          minH: tr.alturaMin,
          maxH: tr.alturaMax,
          static: !editando,
        };
      }),
    [blocos, editando],
  );

  function onLayoutChange(novo: Layout[]) {
    if (!editando) return;
    setBlocos((prev) =>
      prev.map((b) => {
        const l = novo.find((n) => n.i === b.componenteId);
        return l ? { ...b, x: l.x, y: l.y, largura: l.w, altura: l.h } : b;
      }),
    );
  }

  const presentes = new Set(blocos.map((b) => b.componenteId));
  const paleta = CATALOGO.filter(
    (c) => dominios.includes(c.dominio) && !presentes.has(c.id),
  );

  function adicionar(id: string) {
    const comp = componentePorId(id);
    if (!comp) return;
    const tr = travasDoTipo(comp.tipo);
    const y = blocos.reduce((m, b) => Math.max(m, b.y + b.altura), 0);
    setBlocos((prev) => [
      ...prev,
      { componenteId: id, ordem: prev.length, largura: tr.larguraMin, altura: tr.alturaMin, x: 0, y },
    ]);
  }
  function remover(id: string) {
    setBlocos((prev) => prev.filter((b) => b.componenteId !== id));
  }

  function salvar(escopo: "pessoal" | "oficial") {
    setMsg(null);
    start(async () => {
      const r = await salvarLayoutAction(tela, blocos, escopo);
      if (r.ok) {
        setMsg(escopo === "oficial" ? "Layout oficial salvo." : "Layout pessoal salvo.");
        setEditando(false);
        router.refresh();
      } else {
        setMsg(r.erro ?? "Falha ao salvar.");
      }
    });
  }
  function restaurar() {
    start(async () => {
      await restaurarLayoutPessoalAction(tela);
      setMsg("Layout pessoal removido. Exibindo o oficial.");
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de ações do construtor */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {editando
            ? "Modo de edição: arraste pela alça, redimensione pelas bordas. Encaixa em 8 colunas."
            : "Tela montada por componentes. Ative a edição para reorganizar."}
        </div>
        <div className="flex items-center gap-2">
          {msg ? <span className="text-xs text-emerald-400">{msg}</span> : null}
          {!editando && (podeEditarPessoal || podeEditarGlobal) ? (
            <button
              type="button"
              onClick={() => { setEditando(true); setMsg(null); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/10 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-600/20"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar tela
            </button>
          ) : null}
          {editando ? (
            <>
              {podeEditarGlobal ? (
                <button type="button" disabled={salvando} onClick={() => salvar("oficial")} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">
                  <Save className="h-3.5 w-3.5" /> Salvar oficial
                </button>
              ) : null}
              <button type="button" disabled={salvando} onClick={() => salvar("pessoal")} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/10 px-3 py-1.5 text-sm text-violet-200 disabled:opacity-40">
                <Check className="h-3.5 w-3.5" /> Salvar p/ mim
              </button>
              <button type="button" disabled={salvando} onClick={restaurar} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 disabled:opacity-40">
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar oficial
              </button>
              <button type="button" onClick={() => { setBlocos(layoutInicial); setEditando(false); setMsg(null); }} className="rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/60">
                Cancelar
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Paleta de componentes (modo edição) */}
      {editando && paleta.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
          <span className="text-xs font-medium text-muted-foreground">Adicionar componente:</span>
          {paleta.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => adicionar(c.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground/80 hover:border-violet-500/50 hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> <span className="font-mono text-[10px] text-violet-300">{c.id}</span> {c.nome}
            </button>
          ))}
        </div>
      ) : null}

      {/* Grid */}
      <Grid
        className="diretoria-construtor"
        layout={layout}
        cols={GRID_COLS}
        rowHeight={ROW_H}
        margin={[12, 12]}
        isDraggable={editando}
        isResizable={editando}
        draggableHandle=".bloco-grip"
        compactType="vertical"
        onLayoutChange={onLayoutChange}
      >
        {blocos.map((b) => {
          const comp = componentePorId(b.componenteId);
          if (!comp) return <div key={b.componenteId} />;
          return (
            <div key={b.componenteId} className="overflow-hidden">
              <section className={cn("flex h-full min-h-0 flex-col rounded-2xl border border-border/70 bg-card/50", editando && "ring-1 ring-violet-500/30")}>
                <header className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-violet-600/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">{comp.id}</span>
                    <h2 className="truncate text-sm font-semibold">{comp.nome}</h2>
                    {comp.fonteDado !== "real" ? (
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                        {SELO[comp.fonteDado]}
                      </span>
                    ) : null}
                  </div>
                  {editando ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => remover(b.componenteId)} aria-label="Remover" className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <span className="bloco-grip cursor-move rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Mover">
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </div>
                  ) : null}
                </header>
                <div className="min-h-0 flex-1 overflow-auto p-4">{renderBlocoEstoque(b.componenteId, data)}</div>
              </section>
            </div>
          );
        })}
      </Grid>
    </div>
  );
}
