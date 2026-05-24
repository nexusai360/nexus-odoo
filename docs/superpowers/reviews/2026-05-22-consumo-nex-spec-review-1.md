# Review #1 da spec — Consumo Nex (clone)

> Etapa [3] do workflow. Foco: lacunas, ordem, premissas frágeis, requisito
> ambíguo, o que está faltando. Alvo: spec v1.
> Spec: `docs/superpowers/specs/2026-05-22-consumo-nex-clone-design.md`.

## Achados materiais

1. **Colisão de arquivos em `src/components/charts/`** — a v1 mandava portar os
   charts do insights para `src/components/charts/`, mas o odoo já tem
   `bar-chart.tsx` e `pie-chart.tsx` homônimos (F3.5, usados pelos relatórios).
   Sobrescrever quebraria os relatórios. **Resolução**: subdiretório
   `charts/interactive/` com `index.ts` próprio.

2. **Duplicação de paleta de cores** — a v1 dizia portar `lib/charts/colors.ts`
   do insights, duplicando `CHART_COLORS`/`CHART_PALETTE` que o odoo já tem em
   `components/charts/colors.ts`. **Resolução**: reusar o do odoo; mapear
   `getColorByIndex`→`colorAt`.

3. **Destino dos 5 componentes atuais** — a v1 não dizia o que fazer com
   `kpi-row`, `usage-charts`, `usage-table`, `usage-detail`,
   `date-range-popover`. **Resolução**: são removidos; função absorvida pelo
   `consumo-content` clonado + infra portada.

4. **Assinatura das Server Actions** — a v1 assumia as actions do insights
   (`fetchDistinctProvidersInRange`, `fetchUsageStats` sem `isPlayground`). O
   odoo expõe `fetchDistinctProviders`/`fetchDistinctModels` (sem `InRange`) e
   `fetchUsageStats` aceita `isPlayground`. **Resolução**: registrado em §5.1.

5. **Campos de agregação divergentes** — `byDay`/`byProvider`/`byModel` do
   insights expõem `cost`; o odoo expõe `costUsd` + `costBrl`. A v1 não
   alertava. **Resolução**: alerta em §5.1 (plotar `costBrl`).

## Veredito

5 achados materiais aplicados → gera a spec v2. Premissa central (clonar front,
manter back-end V2) confirmada sólida.
