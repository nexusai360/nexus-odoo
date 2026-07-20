"use client";

// Donut SVG interativo (fiel ao HTML): fatias coloridas, hover destaca a fatia +
// mostra tooltip confinado, legenda lateral com cor/rótulo/valor/%, e o total no
// centro. Sem libs (SVG puro). Respeita prefers-reduced-motion.
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DonutDatum {
  label: string;
  valor: number;
}

const PALETA = [
  "#8b5cf6", // violet-500
  "#22d3ee", // cyan-400
  "#f59e0b", // amber-500
  "#34d399", // emerald-400
  "#f472b6", // pink-400
  "#60a5fa", // blue-400
  "#a78bfa", // violet-400
  "#fb7185", // rose-400
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Valor curto para a legenda (R$ 3,7 mi). O valor cheio aparece no hover, como nos KPIs. */
function compacto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl.format(v);
}

/** Uma volta inteira. Abaixo disto a fatia é um arco normal; a partir daqui, é o círculo. */
const VOLTA_COMPLETA = 2 * Math.PI - 1e-6;

function arco(cx: number, cy: number, r: number, a0: number, a1: number): string {
  // Precisao FIXA (3 casas): server (Node) e client (browser) podem divergir 1 ULP no
  // Math.cos/Math.sin (funcoes transcendentais nao sao bit-identicas entre engines), e a
  // string do float mudava no ultimo digito , dava hydration mismatch no React. Arredondar
  // gera a MESMA string dos dois lados (e ainda encurta o path). 3 casas sobra num viewBox 180.
  const p = (a: number): [string, string] => [
    (cx + r * Math.cos(a)).toFixed(3),
    (cy + r * Math.sin(a)).toFixed(3),
  ];

  // FATIA DE 100%: o ponto inicial e o final do arco coincidem, e o SVG entende ponto de
  // partida igual ao de chegada como "não desenhe nada" , o gráfico sumia da tela. É o que
  // deixava a tela de pagamentos vazia quando sobrava uma única forma de pagamento.
  // Um círculo completo não cabe num arco só: precisa de dois arcos de meia volta.
  if (a1 - a0 >= VOLTA_COMPLETA) {
    const [xa, ya] = p(a0);
    const [xb, yb] = p(a0 + Math.PI);
    return `M ${xa} ${ya} A ${r} ${r} 0 1 1 ${xb} ${yb} A ${r} ${r} 0 1 1 ${xa} ${ya} Z`;
  }

  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`;
}

export function DonutChart({
  data,
  formatValor = (v) => brl.format(v),
  maxFatias = 7,
  onSelect,
  selecionado = null,
  vertical = false,
}: {
  data: DonutDatum[];
  formatValor?: (v: number) => string;
  maxFatias?: number;
  /**
   * Quando presente, fatias e itens da legenda viram clicáveis (filtro). A fatia
   * agrupada "Outros" não dispara seleção. Recebe o rótulo original.
   */
  onSelect?: (label: string) => void;
  /** Rótulo atualmente selecionado (realce). */
  selecionado?: string | null;
  /** Layout vertical: rosca GRANDE em cima, legenda embaixo (em 2 colunas). */
  vertical?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clicavel = typeof onSelect === "function";
  const handleSelect = (label: string) => {
    if (!clicavel || label === "Outros") return;
    onSelect?.(label === selecionado ? "" : label);
  };

  if (!data.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>;
  }

  // Agrupa o excedente em "Outros".
  const ordenado = [...data].sort((a, b) => b.valor - a.valor);
  const principais = ordenado.slice(0, maxFatias);
  const resto = ordenado.slice(maxFatias);
  const fatias = resto.length
    ? [...principais, { label: "Outros", valor: resto.reduce((s, d) => s + d.valor, 0) }]
    : principais;

  const total = fatias.reduce((s, d) => s + d.valor, 0) || 1;
  const cx = 90, cy = 90, r = 80, rInner = 50;

  const INICIO = -Math.PI / 2;
  const fracs = fatias.map((d) => d.valor / total);
  const segs = fatias.map((d, i) => {
    const antes = fracs.slice(0, i).reduce((s, f) => s + f, 0);
    const a0 = INICIO + antes * Math.PI * 2;
    const a1 = a0 + fracs[i] * Math.PI * 2;
    return { ...d, i, a0, a1, frac: fracs[i], cor: PALETA[i % PALETA.length] };
  });

  const ativo = hover != null ? segs[hover] : null;

  return (
    <div className={cn(
      "flex h-full flex-col items-center gap-4",
      !vertical && "sm:flex-row sm:items-center",
    )}>
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 180 180"
          className={cn(vertical ? "h-[230px] w-[230px]" : "h-[180px] w-[180px]")}
          onMouseLeave={() => setHover(null)}
        >
          {segs.map((s) => {
            const dim =
              hover != null
                ? hover !== s.i
                : selecionado != null && selecionado !== "" && s.label !== selecionado;
            return (
              <path
                key={s.i}
                d={arco(cx, cy, r, s.a0, s.a1)}
                fill={s.cor}
                opacity={dim ? 0.32 : 1}
                style={{ transition: "opacity .15s", cursor: clicavel && s.label !== "Outros" ? "pointer" : "default" }}
                onMouseEnter={() => setHover(s.i)}
                onClick={() => handleSelect(s.label)}
              />
            );
          })}
          {/* furo central */}
          <circle cx={cx} cy={cy} r={rInner} className="fill-card" />
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-muted-foreground text-[9px]">
            {ativo ? ativo.label.slice(0, 14) : "Total"}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
            {ativo ? `${(ativo.frac * 100).toFixed(1)}%` : formatValor(total)}
          </text>
        </svg>
      </div>
      <div className={cn("flex min-w-0 flex-col gap-1.5 self-stretch", vertical ? "w-full" : "flex-1")}>
      <ul
        className={cn(
          "min-w-0 overflow-auto text-sm",
          vertical ? "grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2" : "flex flex-col gap-1.5",
        )}
        onMouseLeave={() => setHover(null)}
      >
        {segs.map((s) => {
          const sel = selecionado != null && selecionado !== "" && s.label === selecionado;
          const podeClicar = clicavel && s.label !== "Outros";
          return (
            <li
              key={s.i}
              role={podeClicar ? "button" : undefined}
              tabIndex={podeClicar ? 0 : undefined}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors"
              style={{
                background: sel
                  ? "color-mix(in srgb, var(--primary) 18%, transparent)"
                  : hover === s.i
                    ? "color-mix(in srgb, var(--muted) 60%, transparent)"
                    : "transparent",
                cursor: podeClicar ? "pointer" : "default",
              }}
              onMouseEnter={() => setHover(s.i)}
              onClick={() => handleSelect(s.label)}
              onKeyDown={(e) => {
                if (podeClicar && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  handleSelect(s.label);
                }
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.cor }} />
                <span
                  className={cn("truncate", sel && "font-semibold text-foreground")}
                  title={s.label}
                >
                  {s.label}
                </span>
              </span>
              <span
                className="shrink-0 tabular-nums text-muted-foreground"
                title={formatValor(s.valor)}
              >
                {compacto(s.valor)} · {(s.frac * 100).toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
        {clicavel ? (
          <p className="mt-0.5 px-1.5 text-[11px] text-muted-foreground/80">
            {selecionado ? "Clique de novo para limpar o filtro." : "Clique numa fatia para filtrar."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
