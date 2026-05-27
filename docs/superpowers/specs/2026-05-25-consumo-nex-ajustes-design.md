# Ajustes da tela `/agente/consumo`

> Data: 2026-05-25
> Tipo: spec (workflow modo autônomo, etapa [1])
> Escopo: ajustes pontuais na UI da tela de consumo do Agente Nex.
> Origem: feedback do usuário em conversa.

## 1. Contexto

A tela `src/components/agent/consumo/consumo-content.tsx` foi clonada
do `nexus-insights` e ligada ao back-end V2 (`UsageSummaryV2`). Hoje ela
tem inconsistências entre KPIs, gráfico "Custo por dia/hora", tag de
período do histórico e bloco de drill-down. Esta spec corrige sete
defeitos e adiciona dois campos novos no drill-down (raciocínio e tool
calls). Não toca a query/server, exceto para expor dois campos que já
estão no banco mas não saem na API.

## 2. Defeitos / mudanças

### D1. KPIs não acompanham a navegação do gráfico

Hoje os cinco `KpiCard` (Conversas, Chamadas, Tokens entrada, Tokens
saída, Custo total) leem de `stats` (período inteiro da pill). O
gráfico "Custo por dia/hora", o donut de provedor, o bar chart de modelo
e o histórico de chamadas leem de `activeChartStats` (que é
`chartStats ?? stats` e segue a navegação por dia/semana/mês via
`PeriodNavigator`).

**Decisão.** Os KPIs passam a usar `activeChartStats` (não `stats`),
mesma fonte do donut e do bar chart. O subtítulo "no período" continua
correto porque o "período" passa a ser o intervalo efetivo do gráfico
quando há navegação ativa.

Sem flag de configuração: comportamento único, consistente. Quando o
usuário "limpa" a navegação (botão "Limpar" da tag), `activeChartStats`
volta a ser `stats` (período da pill), e os KPIs voltam ao período
inteiro automaticamente.

### D2. Tag "Período: 18/05 - 25/05" mostra dia errado (off-by-one)

Em `consumo-content.tsx:374-388`, `drillLabel` formata
`effectiveChartRange.end`. Esse `end` é **end-exclusive** (vem de
`getCanonicalPeriod`, que devolve próximo 00:00 BRT). Resultado: semana
18→24 vira label "18/05 - 25/05".

**Decisão.** Para exibição, subtrair 1 ms (ou 1 dia em dias inteiros)
antes de formatar `end`. O filtro continua usando o `end` exclusivo
correto. Aplica-se também:

- Pill "hoje" + navegação para dia X: label deve ser apenas "X/MM"
  (start === endInclusive).
- Pill "mes_atual" + navegação: label deve ser "01/MM - últimoDia/MM".
- Pill "custom": idem, mostrar o último dia inclusivo.

### D3. Dia de hoje "não aparece" no gráfico semanal/mensal

Quando o gráfico tem valores > 0 nos dias anteriores e `0` no dia atual,
o `<Area>` desenha bem mas o ponto (dot) do dia atual fica visualmente
em cima do eixo X (baseline), invisível. Só aparece o `activeDot` no
hover. Foi exatamente o que o usuário relatou ("aparece bolinha só com
o mouse em cima").

**Decisão.** No `InteractiveAreaChart` (`src/components/charts/interactive/area-chart.tsx`),
ligar `dot={{ r: 2.5, ... }}` permanente para a série (em vez de só
`activeDot`). Isso aplica-se a todos os usos do componente; revisão
visual nas outras telas como precaução. Se afetar negativamente algum
relatório (poluição visual em gráficos densos), parametrizar via prop
opcional `showDots` (default `true`) e desabilitar caso a caso.

Critério: ao abrir a tela "semana atual" num dia em que ainda não houve
chamadas, o ponto do dia atual aparece no chart no baseline mesmo com
valor zero, sem precisar passar o mouse em cima.

### D4. Vírgula vs traço no label de período (PeriodNavigator)

`src/components/dashboard/period-navigator.tsx:84` monta o label
semanal com ` , ` (vírgula). Trocar por ` - ` (espaço-hífen-espaço).
`drillLabel` em `consumo-content.tsx` já usa hífen, mas será revisto
no D2 mesmo assim.

Decisão de estilo: separador **hífen com espaços** (` - `) em todos os
labels de intervalo de datas. Sem em dash (proibido pelo CLAUDE.md).
Sem vírgula como separador de datas.

### D5. Histórico de chamadas — tag do período repete o bug do D2

A tag `Período: …` no card "Histórico de chamadas" é o mesmo
`drillLabel`. Corrige junto com D2.

Critério adicional: quando a pill é "hoje" sem navegação, o histórico
filtra hoje 00:00 → próximo dia 00:00 (correto, end-exclusive no filtro)
e o **rótulo** mostra apenas o dia atual.

### D6. Drill-down: mostrar raciocínio (escopo desta entrega)

**Estado do banco** (verificado):
- `LlmUsage.reasoningTokens Int?` — já existe, já é gravado pelo
  usage-logger (commit `3903`). **Não exposto** em `UsageDetailRow`.
- `LlmUsage.toolCallsCount` — **não existe**. Existe `Message.toolCalls Json?`
  noutra tabela, sem FK direta para `LlmUsage`. Linkar via timestamp é
  frágil.

**Decisão (escopo D6 nesta entrega — só raciocínio):**

a. **Tipos / API.** Adicionar em `UsageDetailRow`:
   - `reasoningTokens: number | null`

   A query em `usage-stats.ts` (linha 397) seleciona o campo. Sem
   migration; sem mudança no logger; sem mudança nos adapters.

**Tool calls fica fora desta entrega.** Justificativa: exige (1)
migration de schema (`tool_calls_count Int?` em `llm_usage`), (2)
atualizar 4 adapters da Wave 1 (OpenAI, Anthropic, Gemini, OpenRouter)
para informar a contagem, (3) rebuild de `worker`+`mcp`+`app`, (4)
backfill estratégico (nulo para linhas antigas). Cada uma sozinha é
trivial; juntas viram escopo de PR próprio. Registra como item futuro
e segue.

→ Próximo passo (não aqui): criar PR separado "F4 instrumentação tool
calls em LlmUsage" depois desta entrega.

b. **UI.** Em `usage-detail-inline.tsx`, abaixo do bloco
   "Identificação" (logo após a lista de IDs), adicionar um sub-bloco
   compacto **"Capacidades"** com um badge:
   - Badge **"Raciocínio"** (estilo violeta soft, mesmo padrão dos
     badges de `requestKind`) quando `reasoningTokens != null &&
     reasoningTokens > 0`. Texto do badge: `Raciocínio · N tokens`
     (com `N` formatado em pt-BR). Quando reasoningTokens é `null`
     ou `0`, o bloco "Capacidades" inteiro fica oculto.

c. **Detalhamento de tokens no rodapé.** O rodapé atual mostra
   `prompt: N chars · resposta: N chars`. Substituir por uma linha
   que combina caracteres + tokens, ficando assim quando há
   raciocínio:
   - `entrada: N tokens · saída: N tokens (N de raciocínio)` na
     linha principal de tokens;
   - `prompt: N caracteres · resposta: N caracteres` mantém a linha
     existente (apenas tradução "chars" → "caracteres").

   Quando `reasoningTokens` é null ou 0, a linha de tokens não exibe
   o sufixo "(N de raciocínio)". O cálculo de "saída visível" é
   `tokensOutput - reasoningTokens` (piso em 0); para essa entrega
   mostramos `tokensOutput` cheio e detalhamos quanto foi
   raciocínio no parêntese, em vez de subtrair. Mais didático e
   evita confusão com a coluna "Tokens de saída" da tabela.

d. **Custo de raciocínio.** Não criamos um item separado "custo do
   raciocínio" na quebra de custo. Providers (OpenAI e similares)
   faturam reasoning como output tokens ao mesmo preço; o `costUsd`
   armazenado já contempla isso. Para deixar isso óbvio, adicionar
   uma nota curta no fim do drill-down quando houver raciocínio:
   "Tokens de raciocínio são cobrados como tokens de saída; o custo
   total já inclui."

### D7. Traduções

`chars` → `caracteres`. Aplicar em
`usage-detail-inline.tsx:77 e 85`.

## 3. Não-mudanças explícitas (escopo cortado)

- Tabela do histórico não muda (colunas, ordenação, paginação).
- `formatBrl4`, `formatUsd4` e formatadores não mudam.
- Server action `fetchUsageDetails` só muda para acrescentar
  `reasoningTokens` no retorno do `details`.
- Sem mudança no schema do Prisma (campo `reasoningTokens` já existe).
- Sem mudança nos adapters de LLM (já gravam `reasoningTokens`).
- Tool calls fica fora — ver D6.
- Sem mudança no comportamento da pill "custom" e "todos" além do D2
  (label inclusivo).

## 4. Arquitetura / mapa de arquivos

| Arquivo | Mudança |
|---|---|
| `src/components/agent/consumo/consumo-content.tsx` | KPIs → `activeChartStats`; `drillLabel` com end inclusivo. |
| `src/components/agent/consumo/usage-detail-inline.tsx` | Bloco "Capacidades" (raciocínio) + linha de tokens com `(N de raciocínio)`; tradução "chars" → "caracteres"; nota sobre custo. |
| `src/lib/agent/llm/usage-stats.ts` | `UsageDetailRow` ganha `reasoningTokens`; query seleciona o campo. |
| `src/components/dashboard/period-navigator.tsx` | Separador semanal `,` → `-`. |
| `src/components/charts/interactive/area-chart.tsx` | Habilitar `dot` permanente na série. |
| Testes | `usage-stats.test.ts` cobre `reasoningTokens`; novo teste para `drillLabel` end-inclusive. |

## 5. Critérios de aceite

1. Navegar via `PeriodNavigator` (dia/semana/mês) altera os 5 KPIs.
   Limpar a navegação volta KPIs ao período inteiro da pill.
2. Tag "Período" no histórico mostra dd/MM inclusivo (week 18-24/05
   exibe "18/05 - 24/05", não "18/05 - 25/05"). Navegando para "dia 24",
   tag mostra "24/05" sozinho.
3. Dia de hoje aparece com ponto visível no gráfico mesmo quando o
   valor é zero (não-futuro). Apenas horas/dias futuros ficam null.
4. Separador em todos os labels é `dd/MM - dd/MM` (PeriodNavigator
   semanal + drillLabel), sem vírgula.
5. Drill-down mostra badge "Raciocínio · N tokens" quando há dados de
   raciocínio na chamada.
6. Rodapé do drill-down mostra `entrada: N tokens · saída: N tokens
   (N de raciocínio)` quando há raciocínio; sem o parêntese quando
   não há.
7. Texto "chars" → "caracteres" em todo o drill-down.
8. Quando há raciocínio, nota curta esclarece que o custo total já
   inclui os tokens de raciocínio (faturados como output).
9. `tsc`, `eslint`, `jest` continuam verdes; testes novos passam.

## 6. Riscos / pontos de atenção

- Mudar fonte dos KPIs para `activeChartStats` muda o significado do
  subtítulo "no período" quando há navegação. Aceito — o intervalo
  navegado **é** o período visível.
- Habilitar `dot` permanente no AreaChart afeta outras telas que usam
  `InteractiveAreaChart` (relatórios). Mitigação: rodar o app, abrir
  `/relatorios/*` que usem area chart, conferir se a densidade visual
  está aceitável. Se houver poluição, parametrizar via prop
  `showDots` (default `true` para manter o ganho de visibilidade
  geral; telas afetadas passam `false`).
- KPI "Conversas" e "Chamadas" em janela curta (ex.: 1 dia) podem
  cair a 0; user já entende o filtro porque é o que ele acabou de
  mexer. Sem alerta especial.

## 7. Próximo passo

Etapa [5] do workflow: criar PLAN v1 em
`docs/superpowers/plans/2026-05-25-consumo-nex-ajustes-plan.md`,
quebrado em tasks bite-sized por arquivo/mudança.
