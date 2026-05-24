# Review #1 do plano — Consumo Nex (clone)

> Etapa [6] do workflow. Foco: lacunas, ordem, premissas. Alvo: plan v1.
> Plano: `docs/superpowers/plans/2026-05-22-consumo-nex-clone.md`.

## Achados materiais

1. **Colisão de tipo `PieChartData`** — o `donut-with-center` do insights
   importa `PieChartData` de `@/components/charts/pie-chart`, que no odoo é
   outro componente com tipo diferente. Portar verbatim quebraria o tipo.
   **Resolução**: declarar `PieChartData` localmente no donut portado (Task 4).

2. **`PeriodPills` é acoplado** — a v1 dizia "portar verbatim", mas o componente
   importa `getMinReportDate` (server action multi-conta do insights) e
   `PERIOD_OPTIONS` de libs do insights. **Resolução**: Task 8 lista os
   desacoplamentos (remover `accountId`/`getMinReportDate`, `minDate` vira prop,
   `PERIOD_OPTIONS` inline, `PeriodKey` de `datetime-core`).

3. **Reescrita de import desnecessária** — a v1 mandava trocar `getColorByIndex`
   por `colorAt` em cada chart portado. **Resolução**: Task 1 adiciona o alias
   `getColorByIndex` no `colors.ts` do odoo; charts ficam intactos nesse ponto.

4. **Remoção sem checagem de consumers** — a v1 deletava os 5 componentes
   antigos sem verificar quem mais os importava. **Resolução**: Task 12 adiciona
   o passo de `grep` antes do `git rm`.

## Veredito

4 achados materiais aplicados → gera o plan v2. Decomposição em 15 tasks
adequada; ordem de fases (infra → componentes → verificação) correta.
