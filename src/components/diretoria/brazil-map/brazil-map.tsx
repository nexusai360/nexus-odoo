"use client";

import { useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { SEM_UF } from "@/lib/diretoria/uf";
import { BRAZIL_VIEWBOX, UF_PATHS } from "./uf-data";

// Anéis (sub-paths) de um path só com M/L: cada "Z" fecha um anel de coordenadas absolutas.
function aneisDoPath(path: string): [number, number][][] {
  return path
    .split(/Z/i)
    .filter((s) => s.trim())
    .map((sub) => {
      const nums = sub.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const anel: [number, number][] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) anel.push([nums[i], nums[i + 1]]);
      return anel;
    });
}

function pontoNoAnel(px: number, py: number, anel: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

function distSegmento(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t = dx || dy ? ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy) : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

// Polo de inacessibilidade: o ponto MAIS INTERIOR do polígono (o mais distante de qualquer
// borda). É o que as bibliotecas de mapa usam para posicionar rótulo. O centroide simples
// (média dos vértices) era puxado para o litoral, onde os paths têm mais pontos, e a sigla
// caía fora do meio (ex.: PA no topo, AC na ponta fina). O polo cai sempre dentro do estado,
// no maior espaço livre , inclusive nos côncavos. Refino de grade: parte do centro da bbox e
// vai afunilando em torno do melhor ponto.
function poloDeInacessibilidade(
  aneis: [number, number][][],
  bbox: { minx: number; miny: number; maxx: number; maxy: number },
): [number, number] {
  const dentro = (x: number, y: number) => aneis.some((a) => pontoNoAnel(x, y, a));
  const distBorda = (x: number, y: number) => {
    let md = Infinity;
    for (const a of aneis) {
      for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
        const d = distSegmento(x, y, a[j], a[i]);
        if (d < md) md = d;
      }
    }
    return md;
  };
  let cx = (bbox.minx + bbox.maxx) / 2, cy = (bbox.miny + bbox.maxy) / 2;
  let melhor: [number, number] | null = null, melhorD = -Infinity;
  let alcance = Math.max(bbox.maxx - bbox.minx, bbox.maxy - bbox.miny) / 2;
  for (let passe = 0; passe < 6; passe++) {
    const passo = alcance / 6 || 1;
    for (let x = cx - alcance; x <= cx + alcance; x += passo) {
      for (let y = cy - alcance; y <= cy + alcance; y += passo) {
        if (!dentro(x, y)) continue;
        const d = distBorda(x, y);
        if (d > melhorD) { melhorD = d; melhor = [x, y]; }
      }
    }
    if (melhor) { cx = melhor[0]; cy = melhor[1]; }
    alcance /= 3;
  }
  return melhor ?? [cx, cy]; // fallback: centro da bbox (paths degenerados dos testes)
}

// Ajustes por UF, só nos estados pequenos onde a regra geral não serve. Cada campo é opcional:
// `cx`/`cy` reposicionam a sigla; `fonte` sobrepõe o tamanho. Os demais estados seguem o polo
// de inacessibilidade + a fórmula de fonte.
// - DF: é minúsculo; a sigla no polo (dentro do quadradinho) fica ilegível. Vai ACIMA do
//   quadrado (o DF ocupa ~y[325..334], x[402..417]).
// - DF/SE/AL: fonte num meio-termo (9,5) entre o que a fórmula dava (~8) e o teto dos demais
//   estados (11), para ficarem mais legíveis sem destoar.
const AJUSTE_ESPECIAL: Record<string, { cx?: number; cy?: number; fonte?: number }> = {
  DF: { cx: 409.5, cy: 319, fonte: 9.5 },
  SE: { fonte: 9.5 },
  AL: { fonte: 9.5 },
};

// Posição e tamanho da sigla de cada estado. Calculado uma vez.
const UF_LABELS = UF_PATHS.map((p) => {
  const aneis = aneisDoPath(p.path);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const a of aneis) {
    for (const [x, y] of a) {
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
  }
  if (!Number.isFinite(minx)) { minx = miny = 0; maxx = maxy = 1; }
  const [cx, cy] = poloDeInacessibilidade(aneis, { minx, miny, maxx, maxy });
  const menor = Math.min(maxx - minx, maxy - miny);
  // Arredonda: o cálculo usa Math.hypot, que pode divergir 1 ULP entre engines (server x
  // client) , sem isto, x/y/fontSize sairiam com um dígito diferente e dariam hydration
  // mismatch, como acontecia no DonutChart. 2 casas sobra num viewBox de 613.
  const arred = (v: number) => Number(v.toFixed(2));
  const especial = AJUSTE_ESPECIAL[p.uf] ?? {};
  // Menor que antes (0,42 -> 0,30; teto 15 -> 11): as siglas estavam pesadas. Piso 6.
  const fonteBase = arred(Math.max(6, Math.min(11, menor * 0.3)));
  return {
    uf: p.uf,
    cx: especial.cx ?? arred(cx),
    cy: especial.cy ?? arred(cy),
    fonte: especial.fonte ?? fonteBase,
  };
});

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
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Cor de estado SEM dado: cinza calibrado por tema (mais presente que o --muted
// padrão). No escuro fica um pouco mais claro (menos apagado), no claro um cinza
// mais presente. Definido em globals.css.
const COR_SEM_DADO = "var(--mapa-sem-dado)";

/**
 * Rampa de calor em ROXO (sem azul/magenta puro). A intensidade puxa o ROXO em
 * direção ao AZUL conforme cresce: valor baixo = lavanda mais quente/rosado e
 * suave; valor alto = roxo mais frio (azulado), mais saturado e mais profundo ,
 * dando o contraste pedido. A lightness varia pouco (65%..52%) para as mesmas
 * cores ficarem legíveis tanto no tema claro quanto no escuro.
 */
export function corPorIntensidade(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const h = 285 - c * 27; // 285 (lavanda rosada) -> 258 (roxo azulado)
  const s = 45 + c * 51;  // 45%..96% , mais saturado no alto
  const l = 65 - c * 13;  // 65%..52% , mais profundo no alto (sem sumir nos 2 temas)
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
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

  // Extremos dos valores COM dado (>0), para a escala logarítmica.
  const { minPos, maxPos } = useMemo(() => {
    let mn = Infinity, mx = 0;
    for (const d of data) {
      if (d.valor > 0) { if (d.valor < mn) mn = d.valor; if (d.valor > mx) mx = d.valor; }
    }
    return { minPos: Number.isFinite(mn) ? mn : 0, maxPos: mx };
  }, [data]);

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
    if (uf === SEM_UF) return "Sem UF";
    return UF_PATHS.find((p) => p.uf === uf)?.nome ?? uf;
  }

  // Datum do pseudo-estado "Sem UF" (clientes sem estado resolvido). Quando
  // presente, vira um quadrado no mapa e uma linha no ranking, somando ao total.
  const semUfDatum = porUf.get(SEM_UF);

  // Escala LOGARÍTMICA: como os valores são bem concentrados (um estado domina),
  // o log espalha os demais pela rampa, deixando cada estado nitidamente
  // diferente em vez de quase todos no mesmo tom apagado.
  function intensidadeDe(v: number) {
    if (v <= 0 || maxPos <= 0) return 0;
    if (maxPos <= minPos) return 1;
    const t = (Math.log(v) - Math.log(minPos)) / (Math.log(maxPos) - Math.log(minPos));
    return Math.max(0, Math.min(1, t));
  }

  // Estado "em foco": o que o usuário está vendo agora , hover tem prioridade,
  // depois o selecionado. SEM interação (nada sob o mouse e nada clicado) o
  // cartão mostra o TOTAL do período , não um estado "líder" travado.
  const selectedUf = selected.length ? selected[selected.length - 1] : null;
  const focoUf = hover ?? selectedUf;
  const focoOrigem: "hover" | "selecionado" = hover ? "hover" : "selecionado";
  const focoDatum = focoUf ? porUf.get(focoUf) : null;
  const focoShare = focoDatum && total > 0 ? (focoDatum.valor / total) * 100 : 0;

  // Estado "levantado" (efeito 3D) , SÓ em interação real (hover ou clique),
  // nunca o líder por padrão. Renderizado por último para ficar SOBRE os vizinhos.
  const liftUf = hover ?? selectedUf;

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
              {(() => {
                // Renderiza o estado levantado por ÚLTIMO (fica sobre os vizinhos),
                // sem duplicar o path , é o PRÓPRIO estado que ganha o efeito 3D.
                const ordem = [...UF_PATHS];
                if (liftUf) {
                  const idx = ordem.findIndex((p) => p.uf === liftUf);
                  if (idx >= 0) ordem.push(ordem.splice(idx, 1)[0]);
                }
                return ordem.map((p) => {
                  const d = porUf.get(p.uf);
                  const base = d ? corPorIntensidade(intensidadeDe(d.valor)) : COR_SEM_DADO;
                  const isSel = selected.includes(p.uf);
                  const isLift = p.uf === liftUf;
                  const algumLevantado = liftUf != null;
                  // Cor mais viva quando em foco.
                  const fill = isLift && d
                    ? corPorIntensidade(Math.max(0.62, intensidadeDe(d.valor) + 0.12))
                    : base;
                  return (
                    <path
                      key={p.uf}
                      d={p.path}
                      fill={fill}
                      stroke={isLift || isSel ? "var(--foreground)" : "var(--border)"}
                      strokeWidth={isLift ? 1.5 : isSel ? 1.1 : 0.5}
                      strokeLinejoin="round"
                      tabIndex={0}
                      role="button"
                      aria-label={`${p.nome}${d ? `, ${metric} ${formatValor(d.valor)}` : ", sem dados"}${isSel ? " (selecionado)" : ""}`}
                      aria-pressed={isSel}
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
                      style={{
                        cursor: "pointer",
                        outline: "none",
                        // Profundidade de campo: ao passar o mouse, o estado em foco fica
                        // NÍTIDO (com brilho/contorno) e os demais recebem um DESFOQUE
                        // (blur) leve + leve fade. O blur é independente de tema , o
                        // efeito fica coerente no claro e no escuro (não depende de
                        // misturar com o fundo, que foi o que lavava a cor no tema claro).
                        filter: isLift
                          ? "drop-shadow(0 0 6px hsl(262 90% 62% / .9))"
                          : algumLevantado
                            ? "blur(1.1px) saturate(0.85)"
                            : "none",
                        opacity: algumLevantado && !isLift ? 0.72 : 1,
                        transition: reduce ? "none" : "filter .18s ease, opacity .18s ease, fill .18s ease",
                      }}
                    />
                  );
                });
              })()}
              {/* Sigla da UF no centro de cada estado. Contorno (paintOrder) para legibilidade
                  sobre qualquer cor do heatmap, nos dois temas. Não intercepta o mouse. */}
              {UF_LABELS.map((l) => (
                <text
                  key={`sigla-${l.uf}`}
                  x={l.cx}
                  y={l.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={l.fonte}
                  className="pointer-events-none select-none font-semibold"
                  style={{
                    fill: "var(--foreground)",
                    stroke: "var(--background)",
                    strokeWidth: l.fonte * 0.16,
                    paintOrder: "stroke",
                    opacity: 0.82,
                  }}
                >
                  {l.uf}
                </text>
              ))}
            </svg>

            {/* Pseudo-estado "Sem UF": clientes sem estado resolvido. Fica um
                quadrado no canto esquerdo (onde sobra espaço ao lado do mapa),
                pintado pelo MESMO heatmap dos estados, hoverável/clicável e
                somando ao total , para o mapa fechar com o KPI de faturamento. */}
            {semUfDatum && semUfDatum.valor > 0 ? (
              (() => {
                const ativo = hover === SEM_UF || selected.includes(SEM_UF);
                const algumLevantado = liftUf != null;
                return (
                  <button
                    type="button"
                    onClick={() => toggle(SEM_UF)}
                    onMouseEnter={() => setHover(SEM_UF)}
                    onMouseMove={trackMouse}
                    onMouseLeave={() => setHover((h) => (h === SEM_UF ? null : h))}
                    aria-label={`Sem UF, ${metric} ${formatValor(semUfDatum.valor)}`}
                    aria-pressed={selected.includes(SEM_UF)}
                    className="absolute left-0 top-[80%] z-10 flex -translate-y-1/2 flex-col items-center gap-1"
                    style={{
                      filter: ativo ? "drop-shadow(0 0 6px hsl(262 90% 62% / .9))" : "none",
                      opacity: algumLevantado && !ativo ? 0.72 : 1,
                      transition: reduce ? "none" : "filter .18s ease, opacity .18s ease",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      className="block h-8 w-[3.15rem] rounded-md"
                      style={{
                        background: corPorIntensidade(intensidadeDe(semUfDatum.valor)),
                        outline: ativo ? "1.5px solid var(--foreground)" : "0.5px solid var(--border)",
                      }}
                      aria-hidden
                    />
                    <span className="text-[11px] font-medium leading-none text-foreground">Sem UF</span>
                    <span className="text-[10px] leading-none tabular-nums text-muted-foreground">
                      {formatValor(semUfDatum.valor)}
                    </span>
                  </button>
                );
              })()
            ) : null}

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
                  <div className="mt-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300 tabular-nums">
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
          {/* Cartão de destaque: estado em foco (hover/clique) OU o TOTAL quando
              não há interação. Altura FIXA: as duas variações (estado e Total)
              têm o mesmo tamanho, então alternar entre elas não reflui a lista
              abaixo , o que causava o flicker ao passar o mouse entre o card e o
              primeiro item da lista. */}
          <div className="min-h-[5.75rem] rounded-xl border border-violet-500/30 bg-violet-600/10 px-3.5 py-3">
            {focoUf ? (
              <>
                <div className="text-[10px] font-medium uppercase tracking-wide text-violet-700/80 dark:text-violet-300/80">
                  {focoOrigem === "hover" ? "Em foco" : "Selecionado"}
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                  {nomeDe(focoUf)}
                  {focoUf !== SEM_UF ? (
                    <span className="text-muted-foreground"> ({focoUf})</span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <span className="text-lg font-bold tabular-nums text-foreground leading-none">
                    {formatValor(focoDatum ? focoDatum.valor : 0)}
                  </span>
                  {focoDatum ? (
                    <span className="text-2xl font-bold tabular-nums text-violet-700 dark:text-violet-300 leading-none">
                      {focoShare.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs font-medium tabular-nums text-muted-foreground leading-none">
                      Sem dados
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-medium uppercase tracking-wide text-violet-700/80 dark:text-violet-300/80">
                  Total
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                  {metric}
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <span className="text-lg font-bold tabular-nums text-foreground leading-none">
                    {formatValor(total)}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground leading-none">
                    {ranking.length} {ranking.length === 1 ? "estado" : "estados"}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Ranking completo (todos os estados com valor) , rolável. O hover só
              é limpo ao sair da LISTA inteira (onMouseLeave do <ol>), não a cada
              item , senão, no vão entre dois itens, o hover virava null por um
              instante e o cartão piscava o "Total" no meio da transição. */}
          <ol
            className="flex max-h-[clamp(260px,46vh,460px)] flex-col gap-1 overflow-y-auto pr-1"
            aria-label={`Ranking de ${metric} por estado`}
            onMouseLeave={() => setHover(null)}
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
                      <span className="font-medium">{r.uf === SEM_UF ? "Sem UF" : r.uf}</span>
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
