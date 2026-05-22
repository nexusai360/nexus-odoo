# Clone do front-end da tela de Consumo do Agente Nex

> Spec de design. Versão final (v3) após duas reviews críticas (histórico no fim).
> Data: 2026-05-22. Branch: `feat/f4-leitura-expansao`.
> Agente: `claude-agente-nex-consumo` (trabalho paralelo, ver `docs/agents/`).

## 1. Objetivo

A tela `/agente/consumo` do nexus-odoo mostra custo e uso de LLM do Agente Nex.
O front-end dela é funcional mas visualmente inferior ao da tela equivalente do
projeto irmão `nexus-insights` (`/agente-nex/consumo`). Esta entrega **clona a
camada de front-end do nexus-insights** para o nexus-odoo, **preservando o
back-end V2 do nexus-odoo** (que tem correções de dado que o insights não tem).

Não é um clone cego: é portar o esqueleto visual/UX do insights e re-conectá-lo
ao back-end superior do odoo, mantendo as colunas e KPIs extras que o odoo já
produz.

## 2. Requisitos confirmados (entrada do usuário, 2026-05-22)

1. **Visual**: adotar o layout, componentes e UX da tela do nexus-insights.
2. **Dados**: manter os dados que o nexus-odoo já produz (back-end V2).
3. **KPIs**: 5 cartões. Os 4 do insights (Total de chamadas, Tokens de entrada,
   Tokens de saída, Custo total) **+ "Conversas"** (threads distintos — dado que
   só existe no odoo). "Total de chamadas" = `totalIterations` do odoo.
4. **Coluna "Tipo"** da tabela (texto/imagem/áudio/arquivo) — manter.
5. **Badges** "preço desconhecido" (`costKnown=false`) e "cotação desatualizada"
   (`rateStale=true`) — manter.
6. **PeriodNavigator**: incluir as setas de navegação de período no gráfico de
   custo (dia/semana/mês anterior e seguinte), como no insights.
7. Escopo travado ao que está acima. Melhorias adicionais virão depois, em outra
   rodada (decisão do usuário).

## 3. Comparação das duas implementações

### 3.1 Back-end

| Aspecto | nexus-insights | nexus-odoo (atual) | Decisão |
|---|---|---|---|
| Acesso a dado | `pgPool` SQL cru sobre `llm_usage` | Prisma v7 sobre `LlmUsage` | **Manter odoo** |
| Conversas vs chamadas | só `totalCalls` | `totalConversations` + `totalIterations` | **Manter odoo** |
| Custo confiável | soma tudo | só `costKnown=true`; expõe `unknownCount` | **Manter odoo** |
| Filtro Playground | `is_playground` | `isPlayground` | equivalente |
| Tipo de requisição | não tem | `requestKind` | **Manter odoo** |
| Cotação | `usdToBrlRate` + spread informativo | `usdToBrlRate` + `rateSpread` + `rateStale` | **Manter odoo** |
| `conversationId` na linha | não tem | tem | **Manter odoo** |
| RBAC | só `super_admin` | `admin` + `super_admin` na action; tela gateada a `super_admin` no layout | **Manter odoo** |

**Conclusão**: o back-end do nexus-odoo (`src/lib/agent/llm/usage-stats.ts` +
`src/lib/actions/llm-usage.ts`) é estritamente superior e fica **praticamente
intacto**. Ajustes permitidos apenas se o front clonado precisar de um campo
não exposto (ver §6 — nenhum identificado; o back-end já cobre tudo).

### 3.2 Front-end — o que torna a tela do insights melhor

1. **`PeriodPills`** (`components/reports/period-pills.tsx`) — pílulas de período
   de design system com calendário de intervalo embutido, em vez dos botões
   inline ad-hoc do odoo.
2. **`PeriodNavigator`** (`components/dashboard/period-navigator.tsx`) — setas no
   header do gráfico de custo navegando dia/semana/mês.
3. **Charts interativos** (`InteractiveAreaChart`, `InteractiveBarChart`,
   `DonutWithCenter`) — tooltip rico, gradiente, eixo formatado, estados vazios,
   sub-rótulo de provider nas barras de modelo, buckets de futuro (`isFuture`).
4. **`KpiCard`** de design system (`components/reports/kpi-card.tsx`).
5. **`UsageDetailSheet`** — drawer lateral (`Sheet`) com seções
   Identificação/Tokens/Duração/Custo/Erro e ação "Copiar JSON". O odoo usa um
   `Dialog` central, menos elegante.
6. **`UsageTableFilters`** — popovers customizados com "Limpar filtros" e sufixo
   de provider nos modelos. O odoo usa `CustomSelect` simples.
7. Linha de **TOTAL no topo** da tabela, cabeçalho de coluna com `title`
   explicativo, paginação em 3 zonas.

## 4. Arquitetura alvo

A tela continua em `src/app/(protected)/agente/consumo/page.tsx` (Server
Component, gate `super_admin`, busca `getFirstUsageDate`) renderizando o Client
Component `ConsumoContent`.

`ConsumoContent` volta a ser **um componente coeso** no padrão do insights, com
sub-componentes focados. A decomposição atual do odoo (7 arquivos) é substituída
pela estrutura do insights, adaptada:

```
src/components/agent/consumo/
  consumo-content.tsx      ← orquestrador (clone do insights, dados V2)
  usage-detail-sheet.tsx   ← drawer de drill-down (clone do insights, campos V2)
  usage-table-filters.tsx  ← filtros cascade em popover (clone do insights)
```

Os arquivos `kpi-row.tsx`, `usage-charts.tsx`, `usage-table.tsx`,
`usage-detail.tsx`, `date-range-popover.tsx` da implementação atual são
**removidos** — sua função é absorvida pelo `consumo-content.tsx` clonado e pela
infra portada. (O `date-range-popover` é substituído pelo calendário embutido do
`PeriodPills`.)

### 4.1 Infraestrutura a portar do nexus-insights

Componentes que o front clonado importa e que **não existem** no nexus-odoo.
Todos portados com adaptação de imports ao layout do odoo:

| Origem (insights) | Destino (odoo) | Observação |
|---|---|---|
| `lib/datetime-core.ts` | `src/lib/datetime-core.ts` | `PeriodKey`, `getPeriodInTz`, `getCanonicalPeriod` |
| `components/ui/sheet.tsx` | `src/components/ui/sheet.tsx` | drawer lateral; checar deps base-ui |
| `components/reports/period-pills.tsx` | `src/components/reports/period-pills.tsx` | pílulas + calendário |
| `components/dashboard/period-navigator.tsx` | `src/components/dashboard/period-navigator.tsx` | cria a pasta `dashboard/` |
| `components/charts/area-chart.tsx` | `src/components/charts/interactive/area-chart.tsx` | `InteractiveAreaChart` |
| `components/charts/bar-chart.tsx` | `src/components/charts/interactive/bar-chart.tsx` | `InteractiveBarChart` |
| `components/charts/donut-with-center.tsx` | `src/components/charts/interactive/donut-with-center.tsx` | `DonutWithCenter` |
| `components/charts/chart-tooltip.tsx` | `src/components/charts/interactive/chart-tooltip.tsx` | dep dos charts |
| `components/charts/empty-chart-state.tsx` | `src/components/charts/interactive/empty-chart-state.tsx` | dep dos charts |
| `lib/llm/format.ts` (`formatBrl4`, `formatUsd4`) | `src/lib/agent/llm/format.ts` | helper de moeda |
| `formatDuration` de `lib/format/date.ts` | `src/lib/agent/llm/format.ts` | adicionar à mesma lib |
| `PROVIDER_LABELS` de `lib/llm/pricing.ts` | inline no consumo (helper `providerLabel`) | evita portar `pricing.ts` inteiro |

> **Subdiretório `charts/interactive/`**: o nexus-odoo já tem
> `src/components/charts/bar-chart.tsx` e `pie-chart.tsx` (da F3.5, usados pelos
> relatórios). Os charts do insights têm o mesmo nome de arquivo e API diferente.
> Para não colidir nem quebrar os relatórios, os charts portados vão para o
> subdiretório `charts/interactive/` com um `index.ts` próprio.

Imports a reescrever nos arquivos portados:
- `@/lib/charts/colors` (insights) → `@/components/charts/colors` (odoo já tem
  `CHART_COLORS` e `colorAt`; o insights usa `getColorByIndex` — mapear para
  `colorAt`).
- `@/components/charts/chart-tooltip` → `./chart-tooltip` (caminho relativo no
  subdiretório).
- `@/lib/utils`, `@/components/ui/*` → já existem no odoo, manter.

### 4.2 Reuso, não duplicação

- **Cores de chart**: usar `src/components/charts/colors.ts` que o odoo já tem.
  Não portar `lib/charts/colors.ts` do insights.
- **`CustomSelect`, `Card`, `Table`, `Popover`, `Button`, `Label`**: já existem
  no odoo — usar os do odoo.
- **`tier-badge`**: o odoo já tem `ui/tier-badge.tsx`; a tela de consumo não usa
  tier badge — ignorar.

## 5. Componentes — comportamento alvo

### 5.1 `ConsumoContent`

Clone do `consumo-content.tsx` do insights (1058 linhas) com estas adaptações:

- **Estado de dados**: `UsageSummaryV2` (não `UsageSummary`). Campos:
  `totalConversations`, `totalIterations`, `totalCostUsd`, `totalCostBrl`,
  `totalTokensInput`, `totalTokensOutput`, `unknownCount`, `byModel`,
  `byProvider`, `byDay`, `byHour`. Note que `byDay`/`byHour`/`byProvider`/
  `byModel` do odoo expõem `costUsd`+`costBrl` (não `cost`).
- **Actions**: `fetchUsageStats`, `fetchUsageDetails`, `fetchDistinctProviders`,
  `fetchDistinctModels` de `@/lib/actions/llm-usage` (odoo). Note: o odoo expõe
  `fetchDistinctProviders`/`fetchDistinctModels` (sem o sufixo `InRange`) e
  `fetchUsageStats` aceita `isPlayground` — diferença do insights, adaptar as
  chamadas.
- **Filtro de ambiente**: valores `all`/`bubble`/`playground`. O odoo usa
  `agente` no lugar de `bubble`; padronizar para os rótulos "Agente Nex" /
  "Playground" e mapear para `isPlayground: boolean | null`.
- **KPIs — 5 cartões** via `KpiCard` portado, nesta ordem:
  1. Conversas — `MessageSquare` — `totalConversations` — subtítulo "threads".
  2. Total de chamadas — `Activity` — `totalIterations` — subtítulo "no período".
  3. Tokens de entrada — `Hash` — `totalTokensInput`.
  4. Tokens de saída — `Zap` — `totalTokensOutput`.
  5. Custo total — `DollarSign` — `formatBrl4(totalCostBrl)` — subtítulo
     `≈ formatUsd4(totalCostUsd)`; quando `unknownCount > 0`, subtítulo
     acrescenta "· N sem preço". Grid `lg:grid-cols-5`.
- **Gráficos**: layout do insights — área (custo/dia ou /hora) ocupando 2/3 +
  `DonutWithCenter` por provider 1/3; barras por modelo full-width. Usar os
  charts `interactive/` portados. Valor de custo plotado: `costBrl`.
- **PeriodNavigator** no header do gráfico de área, mesma lógica do insights
  (mapeia pill→`dia`/`semana`/`mes`, fetch separado de stats do range navegado).
- **Filtros**: `PeriodPills` + `CustomSelect` de provider global + `CustomSelect`
  de ambiente. Sincronização com URL (`?provider=`, `?env=`) como no insights.
- **Tabela**: `Histórico de chamadas` com `UsageTableFilters` (cascade), linha de
  TOTAL no topo, e estas colunas: Data/hora, Origem, Provider, Modelo,
  **Tipo** (coluna extra do odoo — badge texto/imagem/áudio/arquivo), Tokens
  entrada, Tokens saída, Custo USD, Custo BRL. Custo USD mostra badge "preço
  desconhecido" quando `!costKnown`; Custo BRL mostra "cotação desatualizada"
  quando `rateStale`. Paginação em 3 zonas, `pageSize` 25/50/100.
- Clique na linha abre `UsageDetailSheet`.

### 5.2 `UsageDetailSheet`

Clone do `usage-detail-sheet.tsx` do insights, adaptado a `UsageDetailRow` V2:

- Seções: Identificação, Tokens, Duração, Custo, Erro (condicional).
- **Identificação** ganha campo "Conversa" (`conversationId`) e "Tipo"
  (`requestKind`) — campos do odoo.
- **Custo**: usa `costKnown` (badge "preço desconhecido" quando falso),
  `rateStale` (nota "cotação desatualizada"), `usdToBrlRate`, `rateSpread`
  (% de spread). Não há `currentSpread` global — usar `rateSpread` da própria
  linha.
- Ação "Copiar JSON" e botão "Fechar" — mantidos.

### 5.3 `UsageTableFilters`

Clone do `usage-table-filters.tsx` do insights (popovers customizados,
"Limpar filtros", sufixo de provider nos modelos). Cascade provider→modelo.
Substitui a versão com `CustomSelect` do odoo.

## 6. Back-end

Sem mudança estrutural. `getUsageStats`/`getUsageDetails`/`getDistinctProviders`/
`getDistinctModels`/`getFirstUsageDate` já entregam tudo que o front clonado
precisa. As Server Actions em `src/lib/actions/llm-usage.ts` ficam como estão.

Único ajuste possível, a confirmar na execução: o `consumo-content` do insights
chama `fetchUsageStats` no efeito de navegação do gráfico passando só
`provider`; a versão do odoo aceita `isPlayground` também — passar o filtro de
ambiente corrente nessa chamada para consistência (o insights não passava; é uma
correção, não regressão).

## 7. Não-objetivos (YAGNI)

- Não alterar o schema Prisma nem migrations.
- Não mexer no logger de uso (`usage-logger.ts`).
- Não portar `pricing.ts`, `tier-badge`, `radial-bar-chart`, `InteractivePieChart`
  do insights — a tela de consumo não usa.
- Não tocar em outras telas do `/agente/*`.
- Não criar testes novos de back-end (o back-end não muda); testes de
  componente acompanham os componentes portados quando o original os tinha.
- Sem melhorias além do clone (o usuário fará uma rodada de melhorias depois).

## 8. Riscos

1. **Colisão de nomes em `charts/`** — mitigado pelo subdiretório `interactive/`.
2. **`Sheet` depende de primitiva base-ui** que pode não estar instalada — a
   execução verifica e, se faltar, usa a primitiva de `Dialog` já presente como
   base do drawer, ou instala a dependência.
3. **`datetime-core` é grande (311 linhas)** e pode ter dependências próprias —
   portar o arquivo inteiro e resolver imports; ele é auto-contido no insights.
4. **`period-pills` traz um calendário** — verificar se usa lib de data externa;
   se sim, conferir que está no odoo (`date-field.tsx`/`calendar.tsx` existem).
5. **Trabalho paralelo** — o agente `claude-f4-leitura-expansao` está na mesma
   branch. Sem sobreposição de arquivos prevista. Commit seletivo obrigatório.

## 9. Verificação

- `npx tsc --noEmit` limpo.
- `npx eslint src/` sem erros novos.
- `npx jest` verde (testes existentes + portados).
- `npx next build` verde.
- Teste manual (regra de raiz, `CLAUDE.md §9`): subir `npm run dev`, abrir
  `/agente/consumo`, exercer contra o cache real — conferir os 5 KPIs, os 3
  gráficos, navegação de período, filtros, tabela, drill-down sheet, e que os
  números batem com o back-end (que não mudou).

## 10. Histórico de revisão

### Review crítica #1 (spec v1 → v2) — achados materiais

1. **Colisão de arquivos em `src/components/charts/`** não estava tratada na v1
   (o insights e o odoo têm `bar-chart.tsx`/`pie-chart.tsx` homônimos). Resolvido
   com o subdiretório `charts/interactive/` (§4.1).
2. A v1 dizia "portar `lib/charts/colors.ts`" — duplicaria a paleta. Corrigido
   para reusar `src/components/charts/colors.ts` do odoo e mapear
   `getColorByIndex`→`colorAt` (§4.1, §4.2).
3. A v1 não definia o destino dos 5 arquivos de componente atuais do odoo.
   Adicionado: são removidos, função absorvida (§4).
4. Diferença de assinatura das actions (`fetchDistinctProviders` sem `InRange`,
   `fetchUsageStats` com `isPlayground`) não estava registrada. Adicionado §5.1.
5. Campos de agregação divergentes (`cost` no insights vs `costUsd`+`costBrl` no
   odoo em `byDay`/`byProvider`/`byModel`) — adicionado alerta em §5.1.

### Review crítica #2 (spec v2 → v3) — achados materiais

1. O insights tinha `UsageDetailSheet` com `currentSpread` global vindo de
   config; o odoo modela spread por linha (`rateSpread`). A v2 não dizia qual
   usar — v3 fixa: usar `rateSpread` da linha, sem spread global (§5.2).
2. `requestKind` (coluna "Tipo") existia na decisão do usuário mas não estava
   listado como campo a exibir no Sheet — v3 adiciona à seção Identificação
   (§5.2).
3. A v2 não mencionava o efeito de navegação do gráfico passar `isPlayground`.
   v3 registra como ajuste consciente (§6) para o gráfico navegado respeitar o
   filtro de ambiente.
4. Risco do `Sheet`/base-ui não estava na v2 — adicionado §8.2 com plano de
   contingência.
5. `next build` e teste manual contra dado real não estavam no plano de
   verificação da v2 — adicionados (§9), conforme regra de raiz do `CLAUDE.md §9`.
