# Review #2 da spec — Consumo Nex (clone)

> Etapa [4] do workflow. Review mais profunda e adversarial sobre a spec v2:
> caçar problema/inconsistência restante, exagero, conceito quebrado.
> Inclui o design [2] (`ui-ux-pro-max`).

## Achados materiais

1. **Modelo de spread divergente** — o `UsageDetailSheet` do insights usa um
   `currentSpread` global (config da plataforma). O odoo modela `rateSpread`
   por linha de uso. A v2 não dizia qual usar — risco de portar o conceito
   errado. **Resolução**: v3 fixa uso de `rateSpread` da própria linha; sem
   spread global (§5.2).

2. **`requestKind` ausente no Sheet** — a coluna "Tipo" entrou no requisito do
   usuário e na tabela, mas a v2 não a listava entre os campos do drawer de
   detalhe. Inconsistência. **Resolução**: v3 adiciona "Tipo" à seção
   Identificação do Sheet (§5.2).

3. **Gráfico navegado ignora o filtro de ambiente** — o efeito de navegação do
   `PeriodNavigator` no insights refaz `fetchUsageStats` passando só `provider`.
   No odoo, sem `isPlayground`, o gráfico navegado mostraria dados de um
   ambiente diferente do resto da tela. **Resolução**: §6 registra o ajuste
   consciente (passar `isPlaygroundFilter`).

4. **Risco `Sheet` / base-ui não mapeado** — o `Sheet` depende de
   `@base-ui/react/dialog`. A v2 não tinha contingência. **Resolução**: §8.2 com
   plano de fallback.

5. **Plano de verificação incompleto** — a v2 não tinha `next build` nem teste
   manual contra dado real (regra de raiz `CLAUDE.md §9`). **Resolução**:
   adicionados em §9.

## Design — ui-ux-pro-max (etapa [2], aplicada nesta passagem)

A skill validou as escolhas de chart (área/donut/barras), KPI cards, skeleton
de loading e `tabular-nums`. **Achado material**: a linha clicável da tabela do
insights não é acessível por teclado (regra CRITICAL `keyboard-nav`).
**Resolução**: §5.1 e §11 registram `role="button"` + `tabIndex` + handler de
Enter/Espaço na linha.

## Veredito

5 achados materiais + 1 achado de design aplicados → gera a spec v3. A spec v3
não tem mais achado material pendente: pronta para o plano.
