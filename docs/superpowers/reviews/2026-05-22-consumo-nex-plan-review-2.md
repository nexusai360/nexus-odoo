# Review #2 do plano — Consumo Nex (clone)

> Etapa [7] do workflow. Review mais profunda: granularidade, integração,
> testabilidade, consistência de tipos. Alvo: plan v2.

## Achados materiais

1. **`colSpan` da tabela errado** — o insights tem 9 colunas (`colSpan={4}` no
   TOTAL, `{9}` na linha vazia). O clone tem 10 colunas (a coluna **Tipo** a
   mais). **Resolução**: Task 9 fixa TOTAL `colSpan={5}`, vazia `colSpan={10}`.

2. **Spread por linha reforçado** — garantir que a Task 10 não porte o
   `currentSpread` global do insights. **Resolução**: Task 10 explicita usar
   `rateSpread` da linha.

3. **Testes dos componentes removidos** — o plan v2 não previa o destino dos
   testes que cobrem `kpi-row`/`usage-charts`/`usage-table`/`usage-detail`.
   Testes órfãos quebrariam o `jest`. **Resolução**: Task 13 adicionada
   (reescrever contra o novo componente ou remover).

4. **Subpath `@base-ui/react/dialog` não verificado** — risco de o odoo expor o
   `Dialog` em outro subpath. **Resolução**: Task 3 ganha passo de verificação
   com fallback ao subpath usado pelo `dialog.tsx` do odoo.

5. **Dependência entre Tasks 9 e 10/11** — a Task 9 importa
   `./usage-detail-sheet` e `./usage-table-filters`, criados nas Tasks 10/11.
   **Resolução**: o "Expected" da Task 9 registra que o `tsc` só fecha após a
   Task 12; 10 e 11 vêm logo após a 9, antes do commit da Fase 2.

## Achado de granularidade

A Task 9 (reescrever `ConsumoContent`) é a maior do plano. É aceitável manter
como uma task: o componente é coeso por natureza (orquestrador único, padrão do
insights) e os checkboxes internos da Task 9 já a decompõem em unidades
verificáveis (imports, tipos, KPIs, gráficos, navegador, tabela, filtros). Não
quebrar mais — fragmentar um componente React coeso em vários arquivos seria
pior que o problema.

## Acessibilidade (design)

Task 9 ganha o passo explícito de `role="button"` + `tabIndex={0}` + handler de
teclado na linha da tabela (achado do `ui-ux-pro-max`).

## Veredito

5 achados materiais + 1 de acessibilidade aplicados → gera o plan v3. Sem
achado material pendente: pronto para execução.
