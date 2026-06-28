"use client";

// src/components/charts/interactive/heatmap.tsx
// Mapa de calor dia-da-semana x hora. Portado do nexus-insights, generalizado
// (rotulo de valor configuravel, cor do design system). Util para padroes por
// horario (ex.: atividade do agente, pedidos por hora) quando houver esse dado.
const DOW_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export interface HeatmapCell {
  dow: number;
  hour: number;
  total: number;
}

export interface HeatmapProps {
  data: HeatmapCell[];
  /** Sufixo no tooltip de cada celula (ex.: "conversa(s)", "pedido(s)"). */
  valueLabel?: string;
}

/** Intensidade 0..1 normalizada pelo maximo (piso 0.08 quando ha valor). */
export function intensidadeHeatmap(total: number, max: number): number {
  if (total <= 0 || max <= 0) return 0;
  return Math.max(0.08, total / max);
}

export function Heatmap({ data, valueLabel = "registro(s)" }: HeatmapProps) {
  const max = data.reduce((acc, c) => Math.max(acc, c.total), 0);
  const map = new Map<string, number>();
  for (const c of data) map.set(`${c.dow}-${c.hour}`, c.total);

  const rows = [0, 1, 2, 3, 4, 5, 6];
  const cols = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex items-center gap-px pb-1 pl-10">
          {cols.map((h) => (
            <div key={h} className="w-6 text-center text-[10px] text-muted-foreground">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>

        {rows.map((dow) => (
          <div key={dow} className="flex items-center gap-px py-px">
            <div className="w-10 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
              {DOW_LABEL[dow]}
            </div>
            {cols.map((hour) => {
              const total = map.get(`${dow}-${hour}`) ?? 0;
              const opacity = intensidadeHeatmap(total, max);
              return (
                <div
                  key={hour}
                  title={`${DOW_LABEL[dow]} ${String(hour).padStart(2, "0")}h: ${total.toLocaleString("pt-BR")} ${valueLabel}`}
                  className="h-6 w-6 rounded-sm border border-border/40"
                  style={{
                    backgroundColor:
                      total > 0
                        ? `color-mix(in srgb, var(--color-chart-violet, #7c3aed) ${(opacity * 100).toFixed(1)}%, transparent)`
                        : "color-mix(in srgb, var(--color-chart-violet, #7c3aed) 4%, transparent)",
                  }}
                />
              );
            })}
          </div>
        ))}

        <div className="mt-3 flex items-center justify-end gap-2 pr-1 text-[10px] text-muted-foreground">
          <span>menos</span>
          {[0.1, 0.25, 0.5, 0.75, 1].map((o) => (
            <div
              key={o}
              className="h-3 w-3 rounded-sm border border-border/40"
              style={{ backgroundColor: `color-mix(in srgb, var(--color-chart-violet, #7c3aed) ${o * 100}%, transparent)` }}
            />
          ))}
          <span>mais</span>
        </div>
      </div>
    </div>
  );
}
