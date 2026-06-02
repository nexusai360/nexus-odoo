# Ajustes Monitoramento do Agente Nex (Backtest + Router) , Implementation Plan

> **For agentic workers:** execução INLINE nesta sessão (Opus), conforme CLAUDE.md §8.
> Steps usam checkbox (`- [ ]`).

**Goal:** Corrigir fuso horário (UTC→BRT) em gráficos e no agente; melhorar o gráfico "Correto por dia" (título + carry-forward); adicionar botão localhost-only de avaliação de pendentes no Backtest; renomear tag `Conversa`→`chat`; tornar as linhas do Router clicáveis com drill-down; confirmar ativação do Router.

**Architecture:** Next.js App Router + Prisma + Postgres. Datas resolvidas em `America/Sao_Paulo` via `datetime-core`. Avaliação de pendentes via script LLM-judge (gpt) disparado por server action gated a dev. Drill-down do Router como client component expansível, espelhando o `EvaluationDrilldown` do Backtest.

**Tech Stack:** TypeScript, Prisma v7, date-fns-tz (via datetime-core), recharts (charts-block), OpenAI (judge).

---

## File Structure

- `src/lib/datetime-core.ts` , já tem `formatDateInTz`; usar para bucket por dia BRT.
- `src/lib/agent/quality/queries.ts` , `getDailyCorrectness` (bucket BRT + carry-forward base data) e detalhe.
- `src/lib/agent/router/queries.ts` , `getRouterLatencyTimeseries` bucket BRT.
- `src/components/agent/monitoramento/charts-block.tsx` , título "Correto por dia"; carry-forward na série.
- `src/lib/agent/prompt/compose.ts` , injetar data/hora BRT atual no system prompt.
- `src/components/agent/monitoramento/monitoramento-content.tsx` , botão "Avaliar pendentes" (dev-only) no topo.
- `src/lib/actions/quality-evaluate-pendentes.ts` (NOVO) , server action dev-only que dispara o script.
- `scripts/quality-audit/evaluate-pendentes.ts` (NOVO) , LLM-judge dos turnos PENDENTE.
- `src/lib/env-local.ts` (NOVO) , helper `isLocalRuntime()`.
- `src/components/agent/router/router-decisions-table.tsx` , tag `chat`; linha clicável + drill-down.
- `src/components/agent/router/router-decision-drilldown.tsx` (NOVO) , conteúdo do drill-down.
- `src/lib/agent/router/queries.ts` , `getRouterDecisionDetail(id)` (NOVO) para o drill-down.

---

## Task A , Fuso horário (UTC → America/Sao_Paulo)

**Files:**
- Modify: `src/lib/agent/quality/queries.ts` (getDailyCorrectness)
- Modify: `src/lib/agent/router/queries.ts` (getRouterLatencyTimeseries)
- Modify: `src/lib/agent/prompt/compose.ts` (data atual no prompt)
- Test: `src/lib/agent/quality/__tests__/daily-correctness-tz.test.ts` (NOVO)

- [ ] **A1. Teste falho: bucket por dia em BRT.** Criar teste que monta 2 avaliações `createdAt` = `2026-06-02T00:30:00Z` (= 21:30 BRT de 01/06) e `2026-06-01T12:00:00Z`, e espera que ambas caiam em chaves de dia BRT (`2026-06-01`), não `2026-06-02`. Usar mock do prisma como nos testes existentes de `queries`.
- [ ] **A2. Rodar e ver falhar** (`npx jest daily-correctness-tz`). Esperado: falha (hoje usa UTC).
- [ ] **A3. Implementar bucket BRT em `getDailyCorrectness`.** Trocar `r.createdAt.toISOString().slice(0,10)` por `formatDateInTz(r.createdAt, DEFAULT_TZ, "yyyy-MM-dd")`. Importar `formatDateInTz, DEFAULT_TZ` de `@/lib/datetime-core`. Conferir a assinatura real de `formatDateInTz` (args `date, tz, pattern`) antes de usar; se o pattern for diferente, adaptar para retornar `YYYY-MM-DD`.
- [ ] **A4. Rodar teste , passa.**
- [ ] **A5. Aplicar o mesmo bucket BRT em `getRouterLatencyTimeseries`** (`src/lib/agent/router/queries.ts`, `const day = ...`).
- [ ] **A6. Injetar data/hora BRT atual no system prompt.** Em `composeSystemPrompt` (`compose.ts`), prepender ao prompt um bloco curto: `Data e hora atuais (America/Sao_Paulo): <formatDateTimeInTz(new Date(), DEFAULT_TZ, DEFAULT_LOCALE)>. Use esta data para resolver "hoje", "mês corrente", "essa semana".` Importar `formatDateTimeInTz, DEFAULT_TZ, DEFAULT_LOCALE`. Garantir que NÃO quebre o cache/identidade (é texto dinâmico no topo, aceitável).
- [ ] **A7. `npx tsc --noEmit` + `npx jest src/lib/agent/quality src/lib/agent/router` , verde.**
- [ ] **A8. Commit.** `fix(tz): gráficos e prompt do agente em America/Sao_Paulo (UTC-3)`

---

## Task B , Gráfico "Correto por dia" (título + carry-forward)

**Files:**
- Modify: `src/components/agent/monitoramento/charts-block.tsx`
- Modify: `src/components/agent/monitoramento/monitoramento-content.tsx` (carry-forward na transformação da série, se feito no client)
- Test: `src/components/agent/monitoramento/__tests__/carry-forward.test.ts` (NOVO, função pura)

- [ ] **B1. Título.** Em `charts-block.tsx` linha ~88, trocar `% CORRETO por dia` por `% Correto por dia`. Conferir aria-label linha ~104 (`Percentual de respostas CORRETAS por dia` → `Percentual de respostas corretas por dia`).
- [ ] **B2. Teste falho do carry-forward.** Criar função pura `fillForwardDaily(rows: {date,percent,total}[]): {date,percent,total}[]` (em `charts-block.tsx` ou um util) e testar: entrada `[{date:"2026-06-01",percent:100,total:5},{date:"2026-06-02",percent:null,total:0}]` deve virar `[...,{date:"2026-06-02",percent:100,total:0,carriedForward:true}]` (mantém o último percentual conhecido). Dias sem teste herdam o último percentual; só muda quando há novo total>0.
- [ ] **B3. Rodar , falhar.**
- [ ] **B4. Implementar `fillForwardDaily`.** Itera em ordem; mantém `lastPercent`; para `percent===null||total===0`, usa `lastPercent` (e marca `carriedForward`); senão atualiza `lastPercent`. Aplicar à `dailyData` antes de montar `areaData` em `charts-block.tsx`.
- [ ] **B5. Tooltip/visual.** No tooltip, quando `carriedForward`, indicar discretamente "(sem teste no dia, mantém último)". Linha contínua no mesmo percentual (sem cair a 0).
- [ ] **B6. Rodar testes , passa. `npx tsc` verde.**
- [ ] **B7. Commit.** `fix(charts): "Correto por dia" mantém último percentual em dias sem teste + título`

---

## Task C , Botão "Avaliar pendentes" (localhost-only) no Backtest

**Files:**
- Create: `src/lib/env-local.ts`
- Create: `scripts/quality-audit/evaluate-pendentes.ts`
- Create: `src/lib/actions/quality-evaluate-pendentes.ts`
- Modify: `src/components/agent/monitoramento/monitoramento-content.tsx`
- Test: `src/lib/__tests__/env-local.test.ts`

**Decisão de design (registrar):** a avaliação roda como **script LLM-judge** (gpt-5.4-mini, mesmo modelo da rodada) disparado por **server action gated a runtime local**. Vantagem sobre "precisa do Claude Code aberto": funciona só com o `npm run dev` no ar (localhost), nos bastidores, sem depender do CLI. O botão só aparece quando `isLocalRuntime()` é verdadeiro (NODE_ENV!=production). Em produção (`next start`, NODE_ENV=production) o botão não renderiza e a server action recusa.

- [ ] **C1. `isLocalRuntime()`.** `src/lib/env-local.ts`: `export function isLocalRuntime(): boolean { return process.env.NODE_ENV !== "production"; }`. Comentar que prod roda `next start` (production) e dev roda `next dev` (development) = localhost.
- [ ] **C2. Teste do gate.** Mockar `process.env.NODE_ENV` e validar true em development/test-as-dev, false em production.
- [ ] **C3. Script LLM-judge `evaluate-pendentes.ts`.** Carrega `./load-env`; busca `conversationQualityEvaluation` com `status: "PENDENTE"` (+ snapshots de pergunta/resposta, toolCalls/toolResults via getEvaluationDetail-like); para cada um chama o LLM (credencial OpenAI configurada, modelo gpt-5.4-mini) com um rubric rígido (CORRETO/PARCIAL/ERRADO/FORA_DO_ESCOPO + razões + patterns), e atualiza a linha (`status`, `razoes`, `judgeModel`, `judgeVersion="judge-pendentes-v1"`). Concorrência limitada (pool ~5). Loga progresso `N/total`. Idempotente (só PENDENTE). Reusar o rubric/estrutura do `r25-score.mjs`/`heuristic-eval-pendentes.ts` como referência, mas LLM-based (não heurístico, que já provou ruim , RADAR/obs).
- [ ] **C4. Server action `evaluatePendentesAction()`.** `"use server"`; `gate()` super_admin **e** `if(!isLocalRuntime()) throw`; conta pendentes; `spawn`/`execFile` `npx tsx scripts/quality-audit/evaluate-pendentes.ts`; retorna `{started:true, pendentes:N}`. Streaming opcional: v1 dispara e retorna; UI faz polling de contagem de pendentes (server action `countPendentes()`).
- [ ] **C5. Botão roxo no topo do Backtest.** Em `monitoramento-content.tsx`, na faixa de filtros do topo (onde está PeriodPills + selects), renderizar `isLocalRuntime &&` um botão roxo (padrão da plataforma: `bg-violet-600 hover:bg-violet-500 text-white`) "Avaliar pendentes (N)" que chama a action, mostra loading e ao terminar dá `reload()`. Passar `isLocalRuntime` como prop boolean da page server (a page é server component; computar lá e passar). Exibir contagem de pendentes (de `kpis.pendentes`).
- [ ] **C6. `tsc` + `jest` verdes; teste manual no localhost** (clicar, ver pendentes sumirem).
- [ ] **C7. Commit.** `feat(backtest): botão localhost-only para avaliar pendentes via LLM-judge`

---

## Task D , Tag `Conversa` → `chat`

**Files:**
- Modify: `src/lib/agent/router/queries.ts` (`NO_TOOL_DOMAIN`)
- Modify: `src/components/agent/router/router-decisions-table.tsx` (display + filtro)

- [ ] **D1. Valor e label.** Trocar `NO_TOOL_DOMAIN = "conversa"` → `"chat"` em `queries.ts` e no espelho da tabela. `DOMAIN_DISPLAY["chat"] = "chat"` (minúsculo, padrão das tools). Tom neutro mantido.
- [ ] **D2. Dados.** Não há valor "conversa" gravado (é só display de toolsDomains vazio + filtro), então não precisa migração de dado. Confirmar que o filtro `tools=["chat"]` mapeia para `toolsActuallyUsed isEmpty`.
- [ ] **D3. `tsc` + `jest router` verdes.**
- [ ] **D4. Commit.** `refactor(router): tag de turno sem tool renomeada para "chat"`

---

## Task E , Linhas do Router clicáveis com drill-down

**Files:**
- Create: `src/lib/agent/router/queries.ts` → `getRouterDecisionDetail(id)`
- Create: `src/components/agent/router/router-decision-drilldown.tsx`
- Modify: `src/components/agent/router/router-decisions-table.tsx`

- [ ] **E1. `getRouterDecisionDetail(id)`.** Retorna a decisão + `scores` (json {dominio:score}), `pickedDomains`, `toolsActuallyUsed`/`toolsDomains`, `fallbackTriggered`/`fallbackReason`, `topScore`, `discordante` (calc), `usedReformulation`/`reformulatedQuestion`/`originalFallback`, `routerVersion`, `pickDurationMs`, e (se houver `conversationId`) a resposta final do agente daquela conversa (último assistant) + tools chamadas reais. Read-only.
- [ ] **E2. Drill-down component.** Espelhar o visual do `EvaluationDrilldown` (Backtest). Conteúdo RELEVANTE:
  - **Veredito do roteamento:** "Concordante" (verde) ou "Discordância" (âmbar) com explicação: discordante = nenhum domínio realmente usado estava entre os escolhidos pelo router (a IA teria recebido o catálogo sem a tool certa se o router estivesse filtrando).
  - **Scores por domínio** (barras/lista ordenada desc, destacando os escolhidos e o threshold).
  - **Router escolheu** vs **Tool chamada** (com diff destacado).
  - **Fallback** (se houve): motivo (`msg_trivial`/`embed_failed`/`score_baixo`).
  - **Reformulação** (R2-ctx): original vs reformulada, se `usedReformulation`.
  - **Similaridade (topScore)** + `pickDurationMs` + `routerVersion`.
  - Quando **sem tool** (chat): explicar "o agente respondeu sem acionar ferramenta (saudação/esclarecimento)".
- [ ] **E3. Linha clicável + expansão inline.** Em `router-decisions-table.tsx`, `onClick` na `TableRow` faz toggle `expandedId`; quando expandido, renderiza uma `TableRow` extra com `colSpan` total contendo o drill-down (igual ao Backtest). Cursor pointer + aria-expanded.
- [ ] **E4. Ajustar colSpan** de qualquer linha de largura total para o nº atual de colunas (Data, Origem, Pergunta, Router escolhida, Tool chamada, Similaridade = 6).
- [ ] **E5. `tsc` + `jest` verdes; teste manual: clicar abre detalhes.**
- [ ] **E6. Commit.** `feat(router): linhas clicáveis com drill-down de roteamento`

---

## Task F , Confirmar ativação do Router + responder o aviso

**Files:** (sem código; verificação)

- [ ] **F1. Conferir `routerEnabled`.** `SELECT router_enabled, router_threshold, router_top_k FROM agent_settings;` (script tsx read-only). Confirmar `true` (o usuário salvou). Validar que não há inconsistência (threshold/topK coerentes com a calibragem 0,3/3).
- [ ] **F2. Sanidade pós-ON.** Conferir que novas decisões reais entram como `mode=shadow`/`active` (a depender do flag) e que a coluna Origem mostra "Agente Nex" (já confirmado na imagem 5).
- [ ] **F3. Resposta ao usuário sobre o aviso amarelo** da 1ª linha (21:32:18, "E já tem 186 notas?..."): discordância , router escolheu apenas [cobertura, BI avançado] com similaridade baixa (0,31, abaixo do threshold → praticamente fallback), mas o agente acabou usando uma tool **fiscal**; como `fiscal` ficou fora dos escolhidos, marcou discordância. É pergunta de follow-up curta/contextual (depende do histórico), por isso o embedding cru deu score baixo , candidata a `domain-vocabulary`/Construção de pergunta (R2-ctx). Incluir essa explicação também no drill-down (Task E).

---

## Validação final (todas as tasks)

- [ ] `npx tsc --noEmit` limpo.
- [ ] `npx jest` suíte completa verde.
- [ ] Teste manual no localhost:3000 (logado): gráfico "Correto por dia" sem queda a 0 e com data BRT; botão de pendentes aparece e funciona; tag `chat`; linhas do Router clicáveis; Router ativo.
- [ ] PR + merge (decisão do usuário), `git pull` na pasta principal + `dev:fresh`.

## Self-review (cobertura do pedido)
1. Botão pendentes localhost-only , Task C. ✓
2. Fuso BRT (gráficos + agente) , Task A. ✓
3. Título "Correto por dia" , Task B1. ✓
4. Carry-forward do gráfico , Task B2-B5. ✓
5. Tag chat (minúsculo) , Task D. ✓
6. Linhas Router clicáveis com detalhe + explicar aviso , Task E + F3. ✓
7. Confirmar Router ativo , Task F1. ✓
