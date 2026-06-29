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
  /** Máximo de UFs selecionáveis ao mesmo tempo (2 para o comparativo C8/C9). */
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

const COR_SEM_DADO = "hsl(240 8% 16%)";

/** Cor sequencial roxa por intensidade (0..1). Mantém o accent do produto. */
export function corPorIntensidade(t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const light = 26 + clamp * 38; // 26%..64%
  const sat = 58 + clamp * 24; // 58%..82%
  return `hsl(262 ${sat}% ${light}%)`;
}

export function BrazilMap({
  data,
  metric = "Valor",
  onSelect,
  maxSelection = 2,
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
    () => [...data].sort((a, b) => b.valor - a.valor),
    [data],
  );

  const temDados = data.length > 0;

  function toggle(uf: string) {
    setSelected((prev) => {
      let next: string[];
      if (prev.includes(uf)) next = prev.filter((u) => u !== uf);
      else if (prev.length >= maxSelection) next = [...prev.slice(1), uf];
      else next = [...prev, uf];
      onSelect?.(next);
      return next;
    });
  }

  const hoverDatum = hover ? porUf.get(hover) : null;
  const hoverNome = hover
    ? UF_PATHS.find((p) => p.uf === hover)?.nome ?? hover
    : null;

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
              className="mx-auto block h-[clamp(340px,56vh,580px)] w-auto max-w-full"
            >
              {UF_PATHS.map((p, i) => {
                const d = porUf.get(p.uf);
                const intensidade = d && max > 0 ? d.valor / max : 0;
                const cor = d ? corPorIntensidade(intensidade) : COR_SEM_DADO;
                const isSel = selected.includes(p.uf);
                const isHover = hover === p.uf;
                return (
                  <motion.path
                    key={p.uf}
                    d={p.path}
                    fill={cor}
                    stroke={isSel ? "hsl(0 0% 100%)" : "hsl(240 10% 4%)"}
                    strokeWidth={isSel ? 2 : 0.5}
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.nome}${d ? `, ${metric} ${formatValor(d.valor)}` : ", sem dados"}${isSel ? " (selecionado)" : ""}`}
                    aria-pressed={isSel}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={
                      reduce ? { duration: 0 } : { delay: i * 0.018, duration: 0.25, ease: "easeOut" }
                    }
                    style={{
                      cursor: "pointer",
                      filter: isHover ? "brightness(1.25)" : undefined,
                      outline: "none",
                    }}
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
            </svg>

            {/* Tooltip que segue o cursor e some fora do país */}
            {hoverNome && pos ? (
              <div
                role="status"
                className="pointer-events-none absolute z-20 rounded-lg border border-border/60 bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
                style={{
                  left: pos.x + 14,
                  top: pos.y + 14,
                  transform: "translateZ(0)",
                }}
              >
                <div className="font-medium">{hoverNome}</div>
                <div className="text-muted-foreground tabular-nums">
                  {hoverDatum ? formatValor(hoverDatum.valor) : "Sem dados"}
                </div>
                {hoverDatum && total > 0 ? (
                  <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
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
                  background: `linear-gradient(90deg, ${corPorIntensidade(0)}, ${corPorIntensidade(1)})`,
                }}
              />
              <span>Maior</span>
            </div>
          </>
        )}
      </div>

      {/* Ranking lateral (dado acessível, não só cor) */}
      {temDados ? (
        <ol className="w-full shrink-0 space-y-1 lg:w-56" aria-label={`Ranking de ${metric} por estado`}>
          {ranking.slice(0, 10).map((r, i) => {
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
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                    isSel
                      ? "bg-violet-600/20 ring-1 ring-violet-500/50"
                      : isHover
                        ? "bg-violet-600/10 ring-1 ring-violet-500/30"
                        : "hover:bg-muted/60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="font-medium">{r.uf}</span>
                    {r.label ? (
                      <span className="text-muted-foreground">{r.label}</span>
                    ) : null}
                  </span>
                  <span className="flex items-baseline gap-1.5 tabular-nums">
                    <span>{formatValor(r.valor)}</span>
                    <span className="text-[10px] text-muted-foreground">{share.toFixed(1)}%</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
