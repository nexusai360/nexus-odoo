"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { BRAZIL_VIEWBOX, UF_PATHS } from "./uf-data";

export interface BrazilMapDatum {
  uf: string;
  valor: number;
  label?: string;
}

export interface BrazilMapProps {
  data: BrazilMapDatum[];
  /** Rótulo da métrica exibida (ex.: "Faturamento"). */
  metric?: string;
  /** Callback ao (de)selecionar UFs. Recebe a lista atual de selecionadas. */
  onSelect?: (ufs: string[]) => void;
  /**
   * Máximo de UFs selecionáveis ao mesmo tempo. Default 1 (seleção única , o
   * clique troca o estado em foco). Mantido configurável para comparativos.
   */
  maxSelection?: number;
  /** Formatação do valor (default: moeda BRL). */
  formatValor?: (v: number) => string;
  className?: string;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const COR_SEM_DADO = "hsl(240 6% 14%)";

/**
 * Cor sequencial roxa por intensidade (0..1) , rampa do produto. Vai de um
 * violeta escuro porém visível a um violeta vivo e saturado, para o mapa de
 * calor diferenciar bem estados de valor baixo, médio e alto.
 */
export function corPorIntensidade(t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const light = 24 + clamp * 48; // 24%..72%
  const sat = 50 + clamp * 42; // 50%..92%
  return `hsl(262 ${sat}% ${light}%)`;
}

export function BrazilMap({
  data,
  metric = "Valor",
  onSelect,
  maxSelection = 1,
  formatValor = (v) => brl.format(v),
  className,
}: BrazilMapProps) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Posição do cursor (relativa ao container) para o tooltip que SEGUE o mouse
  // e some quando sai do país. null = sem tooltip.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  function trackMouse(e: { clientX: number; clientY: number }) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const porUf = useMemo(() => {
    const m = new Map<string, BrazilMapDatum>();
    for (const d of data) m.set(d.uf.toUpperCase(), d);
    return m;
  }, [data]);

  const max = useMemo(
    () => data.reduce((acc, d) => Math.max(acc, d.valor), 0),
    [data],
  );

  const total = useMemo(() => data.reduce((acc, d) => acc + d.valor, 0), [data]);

  const ranking = useMemo(
    () => [...data].filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor),
    [data],
  );

  const temDados = ranking.length > 0;

  function toggle(uf: string) {
    setSelected((prev) => {
      let next: string[];
      if (prev.includes(uf)) next = prev.filter((u) => u !== uf);
      else if (prev.length >= maxSelection) next = [...prev.slice(prev.length - maxSelection + 1), uf];
      else next = [...prev, uf];
      onSelect?.(next);
      return next;
    });
  }

  function nomeDe(uf: string) {
    return UF_PATHS.find((p) => p.uf === uf)?.nome ?? uf;
  }

  // Intensidade realçada (raiz) para diferenciar melhor valores baixos/médios.
  function intensidadeDe(v: number) {
    if (max <= 0) return 0;
    return Math.pow(v / max, 0.6);
  }

  // Estado "em foco": o que o usuário está vendo agora , hover tem prioridade,
  // depois o selecionado, e por fim o líder do ranking (sempre algo no topo).
  const selectedUf = selected.length ? selected[selected.length - 1] : null;
  const focoUf = hover ?? selectedUf ?? (ranking[0]?.uf.toUpperCase() ?? null);
  const focoOrigem: "hover" | "selecionado" | "lider" = hover
    ? "hover"
    : selectedUf
      ? "selecionado"
      : "lider";
  const focoDatum = focoUf ? porUf.get(focoUf) : null;
  const focoPath = focoUf ? UF_PATHS.find((p) => p.uf === focoUf) : null;
  const focoShare = focoDatum && total > 0 ? (focoDatum.valor / total) * 100 : 0;

  const hoverDatum = hover ? porUf.get(hover) : null;
  const hoverNome = hover ? nomeDe(hover) : null;

  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row", className)}>
      {/* Mapa */}
      <div
        ref={wrapRef}
        className="relative flex-1 min-w-0"
        onMouseLeave={() => {
          setHover(null);
          setPos(null);
        }}
      >
        {!temDados ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-border/60 text-sm text-muted-foreground">
            Sem dados no período selecionado.
          </div>
        ) : (
          <>
            <svg
              viewBox={BRAZIL_VIEWBOX}
              role="img"
              aria-label={`Mapa do Brasil: ${metric} por estado. ${ranking
                .slice(0, 3)
                .map((r) => `${r.uf} ${formatValor(r.valor)}`)
                .join(", ")}.`}
              className="mx-auto block h-[clamp(340px,56vh,580px)] w-auto max-w-full overflow-visible"
            >
              {UF_PATHS.map((p, i) => {
                const d = porUf.get(p.uf);
                const cor = d ? corPorIntensidade(intensidadeDe(d.valor)) : COR_SEM_DADO;
                const isSel = selected.includes(p.uf);
                return (
                  <motion.path
                    key={p.uf}
                    d={p.path}
                    fill={cor}
                    stroke={isSel ? "hsl(258 90% 80%)" : "hsl(240 10% 4%)"}
                    strokeWidth={isSel ? 1.2 : 0.4}
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.nome}${d ? `, ${metric} ${formatValor(d.valor)}` : ", sem dados"}${isSel ? " (selecionado)" : ""}`}
                    aria-pressed={isSel}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={
                      reduce ? { duration: 0 } : { delay: i * 0.012, duration: 0.22, ease: "easeOut" }
                    }
                    style={{ cursor: "pointer", outline: "none" }}
                    onMouseEnter={() => setHover(p.uf)}
                    onMouseMove={trackMouse}
                    onMouseLeave={() => setHover((h) => (h === p.uf ? null : h))}
                    onFocus={() => setHover(p.uf)}
                    onBlur={() => setHover((h) => (h === p.uf ? null : h))}
                    onClick={() => toggle(p.uf)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(p.uf);
                      }
                    }}
                  />
                );
              })}

              {/* Overlay do estado em foco: sobe (scale) com contorno claro e
                  sombra , o "destaque pra cima" sincronizado com o tooltip. */}
              {focoPath && focoDatum ? (
                <motion.path
                  key={`foco-${focoUf}`}
                  d={focoPath.path}
                  fill={corPorIntensidade(Math.max(0.5, intensidadeDe(focoDatum.valor)))}
                  stroke="hsl(0 0% 100%)"
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                  pointerEvents="none"
                  initial={false}
                  animate={{ scale: reduce ? 1 : 1.07 }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 20 }}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    filter: "drop-shadow(0 3px 8px hsl(262 80% 50% / 0.5))",
                  }}
                />
              ) : null}
            </svg>

            {/* Tooltip que segue o cursor e some fora do país */}
            {hoverNome && pos ? (
              <div
                role="status"
                className="pointer-events-none absolute z-20 rounded-lg border border-border/60 bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
                style={{ left: pos.x + 14, top: pos.y + 14, transform: "translateZ(0)" }}
              >
                <div className="font-medium">{hoverNome}</div>
                <div className="text-muted-foreground tabular-nums">
                  {hoverDatum ? formatValor(hoverDatum.valor) : "Sem dados"}
                </div>
                {hoverDatum && total > 0 ? (
                  <div className="mt-0.5 text-[11px] font-semibold text-violet-300 tabular-nums">
                    {((hoverDatum.valor / total) * 100).toFixed(1)}% do total
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Legenda de intensidade */}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Menor</span>
              <div
                className="h-2 w-28 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${corPorIntensidade(0)}, ${corPorIntensidade(0.5)}, ${corPorIntensidade(1)})`,
                }}
              />
              <span>Maior</span>
            </div>
          </>
        )}
      </div>

      {/* Painel lateral: destaque do estado em foco + ranking completo */}
      {temDados ? (
        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-72">
          {/* Cartão de destaque , sempre mostra o que o usuário está vendo */}
          {focoDatum ? (
            <div className="rounded-xl border border-violet-500/30 bg-violet-600/10 px-3.5 py-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-violet-300/80">
                {focoOrigem === "hover"
                  ? "Em foco"
                  : focoOrigem === "selecionado"
                    ? "Selecionado"
                    : "Líder"}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                {nomeDe(focoUf!)}{" "}
                <span className="text-muted-foreground">({focoUf})</span>
              </div>
              <div className="mt-1.5 flex items-end justify-between gap-2">
                <span className="text-lg font-bold tabular-nums text-foreground leading-none">
                  {formatValor(focoDatum.valor)}
                </span>
                <span className="text-2xl font-bold tabular-nums text-violet-300 leading-none">
                  {focoShare.toFixed(1)}%
                </span>
              </div>
            </div>
          ) : null}

          {/* Ranking completo (todos os estados com valor) , rolável */}
          <ol
            className="flex max-h-[clamp(260px,46vh,460px)] flex-col gap-1 overflow-y-auto pr-1"
            aria-label={`Ranking de ${metric} por estado`}
          >
            {ranking.map((r, i) => {
              const ufU = r.uf.toUpperCase();
              const isSel = selected.includes(ufU);
              const isHover = hover === ufU;
              const share = total > 0 ? (r.valor / total) * 100 : 0;
              return (
                <li key={r.uf}>
                  <button
                    type="button"
                    onClick={() => toggle(ufU)}
                    onMouseEnter={() => setHover(ufU)}
                    onMouseLeave={() => setHover((h) => (h === ufU ? null : h))}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                      isSel
                        ? "bg-violet-600/25 ring-1 ring-violet-400/60"
                        : isHover
                          ? "bg-violet-600/10 ring-1 ring-violet-500/30"
                          : "hover:bg-muted/60",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ background: corPorIntensidade(intensidadeDe(r.valor)) }}
                        aria-hidden
                      />
                      <span className="font-medium">{r.uf}</span>
                      {r.label ? (
                        <span className="truncate text-muted-foreground">{r.label}</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                      <span className="text-muted-foreground">{formatValor(r.valor)}</span>
                      <span className="w-12 text-right text-sm font-semibold text-foreground">
                        {share.toFixed(1)}%
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
