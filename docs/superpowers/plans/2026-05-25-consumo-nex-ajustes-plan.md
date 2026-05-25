# Plano: ajustes da tela `/agente/consumo`

> Spec: `docs/superpowers/specs/2026-05-25-consumo-nex-ajustes-design.md`
> Branch: `feat/f4-leitura-expansao` (atual)
> Workflow: modo autônomo, etapa [5]→[8].

## Estratégia

Ordem de execução otimizada para isolar erros e validar
incrementalmente, sem dependência cruzada entre tarefas. Cada task
toca um arquivo só (ou um par mínimo) com verificação isolada.

Não há mudança de schema, então não há rebuild de container
obrigatório nesta entrega (só `app` se quiser ver no Next dev). Vou
manter o ciclo de validação ao fim de cada bloco.

## Bloco A — Correções triviais de UI

### A1. Trocar `,` por `-` no PeriodNavigator semanal
**Arquivo:** `src/components/dashboard/period-navigator.tsx`
**Linha:** 84
**Mudança:** template literal `${a} , ${b}` → `${a} - ${b}`.
**Verificação:** `npx tsc --noEmit`; carregar a tela `/agente/consumo`
e mudar a pill para "Semana atual" — label do navigator deve mostrar
`dd/MM - dd/MM`.

### A2. Tradução `chars` → `caracteres` no drill-down
**Arquivo:** `src/components/agent/consumo/usage-detail-inline.tsx`
**Linhas:** 77, 85
**Mudança:** ` chars` → ` caracteres` (duas substituições).
**Verificação:** clicar em uma linha do histórico, ver rodapé.

## Bloco B — Tag de período inclusiva (drillLabel)

### B1. Corrigir `drillLabel` para usar `end - 1ms`
**Arquivo:** `src/components/agent/consumo/consumo-content.tsx`
**Função:** `drillLabel` (linhas 374-388)
**Mudança:** antes de formatar `effectiveChartRange.end`, criar
`endInclusive = new Date(effectiveChartRange.end.getTime() - 1)`.
Formatar a partir desse valor.
**Verificação:**
- pill "Semana atual" → tag "18/05 - 24/05" (assumindo semana
  navegada 18-24).
- Navegar para "dia 24" → tag "24/05" sozinho (start === end).
- pill "Mês atual" navegando para Abril → tag "01/04 - 30/04".

## Bloco C — KPIs sincronizam com navegação

### C1. KPIs leem de `activeChartStats`
**Arquivo:** `src/components/agent/consumo/consumo-content.tsx`
**Linhas:** array `kpiCards` (697-736), `totalCostBrlFormatted`
(664-668), `custoSubtitle` (674-680).
**Mudança:**
- Trocar todas as 5 referências a `stats` por `activeChartStats`
  no array `kpiCards`.
- `totalCostBrlFormatted` → calcular a partir de `activeChartStats`
  (igual ao `chartTotalCostBrlFormatted`).
- `custoSubtitle` → calcular a partir de `activeChartStats`.
- Manter `stats` apenas onde ainda for usado (se sobrar).
**Verificação:**
- Carregar pill "Semana atual", anotar valores dos 5 KPIs.
- Clicar `‹` no PeriodNavigator (volta uma semana). Os 5 KPIs
  precisam mudar.
- Clicar "Limpar" na tag de período. Os 5 KPIs voltam aos valores
  iniciais.

## Bloco D — Ponto visível no gráfico mesmo em valor 0

### D1. Ligar `dot` permanente no Area
**Arquivo:** `src/components/charts/interactive/area-chart.tsx`
**Linhas:** ~265-289 (props do `<Area>`)
**Mudança:** adicionar prop `dot={{ r: 2.5, fill: color, stroke: color, strokeWidth: 0 }}`.
Manter `activeDot` como está.
**Verificação:**
- Tela `/agente/consumo` na pill "Semana atual" num dia em que o dia
  atual ainda não teve chamadas → ponto do dia atual aparece no
  baseline.
- Abrir relatórios que usam area chart (`/relatorios/...`),
  confirmar que não ficou poluído. Se ficou, ver Bloco D2.

### D2. (Condicional) Parametrizar via prop `showDots`
**Só executar se D1 poluir telas de relatório.**
**Arquivo:** `src/components/charts/interactive/area-chart.tsx`
**Mudança:** prop opcional `showDots?: boolean` (default `true`).
Quando `false`, `dot={false}`.
**Caller:** ajustar telas de relatório afetadas para passar
`showDots={false}`.

## Bloco E — Expor e exibir `reasoningTokens`

### E1. Estender `UsageDetailRow` e a query
**Arquivo:** `src/lib/agent/llm/usage-stats.ts`
**Mudanças:**
- Linha 71-93 (`UsageDetailRow`): adicionar
  `reasoningTokens: number | null;`.
- Linha ~397 (`mappedRows`): no `map((r) => ({ ... }))`, adicionar
  `reasoningTokens: r.reasoningTokens ?? null,`.
- Garantir que o `select` ou `findMany` que produz `rows` inclui
  o campo (verificar; se for `select: { ... }` explícito, adicionar
  `reasoningTokens: true`).
**Verificação:** `npx tsc --noEmit`; ajustar teste a seguir.

### E2. Atualizar testes de `usage-stats`
**Arquivo:** `src/lib/agent/llm/usage-stats.test.ts`
**Mudança:** se os mocks de retorno construírem `UsageDetailRow`
literalmente, adicionar `reasoningTokens: null` (ou um número onde
fizer sentido testar). Adicionar 1 teste leve: linha com
`reasoningTokens: 1234` → mapper devolve `1234`.

### E3. Renderizar badge "Capacidades" + linha de tokens
**Arquivo:** `src/components/agent/consumo/usage-detail-inline.tsx`
**Mudanças:**

1. No bloco `IdentificationBlock`, **abaixo** do `<dl>` dos IDs e
   ainda dentro do mesmo `<div>`, condicional `row.reasoningTokens != null && row.reasoningTokens > 0`:

   ```tsx
   <div className="mt-2 flex flex-wrap gap-1.5">
     <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
       Raciocínio · {numberFmt.format(row.reasoningTokens)} tokens
     </span>
   </div>
   ```

2. No bloco final (linhas 70-104, condicional `promptChars/responseChars`),
   adicionar **acima** das tags `prompt/resposta` uma nova linha de
   tokens (quando faz sentido), separada visualmente:

   ```tsx
   <div className="justify-self-start">
     <span className="mr-4">
       entrada:{" "}
       <span className="font-mono text-foreground">
         {numberFmt.format(row.tokensInput)} tokens
       </span>
     </span>
     <span>
       saída:{" "}
       <span className="font-mono text-foreground">
         {numberFmt.format(row.tokensOutput)} tokens
       </span>
       {row.reasoningTokens != null && row.reasoningTokens > 0 ? (
         <span className="ml-1 text-muted-foreground">
           ({numberFmt.format(row.reasoningTokens)} de raciocínio)
         </span>
       ) : null}
     </span>
   </div>
   ```

   Layout: a linha de tokens vai **acima** da linha de caracteres
   (prompt/resposta), com a mesma estrutura de 3 colunas (botão
   Copiar JSON continua no meio).

   Para evitar duplicar o container das 3 colunas, refatorar a
   estrutura: o `<div className="mt-3 grid grid-cols-3 ...">` vira
   um container vertical que abriga duas sub-linhas (tokens e
   caracteres), com o botão Copiar JSON centralizado entre elas
   ou abaixo. Decisão: **botão fica no rodapé centralizado**,
   sublinhas de info ficam acima alinhadas à esquerda.

3. **Nota de custo:** quando `reasoningTokens > 0`, adicionar abaixo
   do bloco de quebra de custo um `<p>` pequeno em muted:
   "Tokens de raciocínio são cobrados como tokens de saída; o custo
   total já inclui."

4. **Tradução** (já no A2): garantir que `chars` virou `caracteres`.

**Verificação:** abrir o drill-down de uma chamada que tenha
`reasoningTokens > 0` (modelos OpenAI/Gemini com reasoning). Conferir:
badge aparece; linha de tokens aparece com `(N de raciocínio)`; nota
aparece. Em chamadas sem raciocínio, nada do novo é mostrado.

## Bloco F — Verificação cruzada e commit

### F1. Verificação global
- `npx tsc --noEmit` — sem erros.
- `npx eslint src/components/agent/consumo src/components/charts/interactive src/components/dashboard src/lib/agent/llm` — sem warnings novos.
- `npm test -- usage-stats` — passa.
- `npm test -- usage-logger` — passa (não tocamos, mas garante).
- Manual: subir `npm run dev`, navegar `/agente/consumo`, exercitar
  todos os critérios da spec (§5).

### F2. Commit atômico por bloco
- A1+A2 → 1 commit ("UI tweaks: traço no PeriodNavigator + tradução")
- B1 → 1 commit ("drillLabel end-inclusive")
- C1 → 1 commit ("KPIs seguem navegação do gráfico")
- D1 → 1 commit ("AreaChart: dot permanente para visibilidade no baseline")
- E1+E2+E3 → 1 commit ("drill-down: expor e exibir reasoning tokens")

Mensagens em pt-br, formato `fix(consumo): ...` ou `feat(consumo): ...`
seguindo o padrão dos commits recentes (`b372b3d`, `37ab583`).

Não fazer push até validação manual completa.

## Critério de saída

Todos os 9 critérios de aceite da spec §5 cumpridos. tsc/eslint/jest
verdes. Validação manual feita pelo executor.
