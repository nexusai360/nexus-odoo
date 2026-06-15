# Investigação , latência ~60s no primeiro turno do Nex (RESOLVIDO 2026-06-11)

> Sintoma (print do usuário): pergunta "quanto faturamos no mês corrente?" levou **73,2s**
> na bubble. **Causa raiz encontrada e corrigida em 2026-06-11.**

## Causa raiz REAL (confirmada empiricamente)

**O gargalo NÃO era a sessão MCP nem o timeout do SDK.** Era o **embedding sequencial do
catálogo de tools no cold start do router** (`getToolVectors` em
`src/lib/agent/router/embed-tools.ts`).

- `getToolVectors` embedava os **107 tools UM POR UM** (`embedAllTools`: `for` com
  `await embed(t.description)` por tool), cada chamada uma ida à API de embeddings da OpenAI.
- Conta: 107 × ~0,6s ≈ **64s** (e até ~310s quando a rede/rate-limit pesa). Bate com os
  "60s escuros".
- O cache é **em memória, por processo**. Logo:
  - **Primeiro turno de um processo frio** (deploy, restart, cold start do container `app`)
    paga os 107 embeddings → ~60s+. É o print do usuário.
  - Turnos seguintes no mesmo processo: cache quente → instantâneo. Por isso o turno das
    21:47 (mesma conversa, processo já aquecido) deu **13s reais** no banco.
- `embed-domains.ts` tinha o mesmo padrão sequencial (9 domínios, ~1s, menor impacto).

### Como foi confirmado (método)
1. **Probe da sessão MCP isolada** (`scripts/probe-mcp-latencia.ts`): connect 0,57s,
   listTools 0,08s, callTool 0,75s, close 0,01s. **Total ~1,4s , a sessão MCP NÃO é o
   gargalo** (refuta a hipótese do timeout 60s do SDK do doc original).
2. **Mineração do `LlmUsage`**: nenhuma origem com timestamp (`loop_principal` max 34s,
   `router` max 14s) chega a 60s. Os 60s **não são chamada LLM/embedding logada** (o embedding
   de tools não tinha `usageCtx`, por isso nem aparecia no consumo).
3. **Probe do run-agent completo** (`scripts/probe-runagent-latencia.ts`, cronometra cada
   `AgentEvent`): primeiro `thinking` só disparava em **+70s a +310s**; o trabalho real
   (LLM + tool) eram ~12s depois disso. Instrumentando o setup linha a linha, o stall caía
   **exatamente em `getToolVectors`** (após `embedQuestion`, antes de `thinking`).

## Correção aplicada (2026-06-11)

**Batch dos embeddings numa única chamada.** A API text-embedding-3 aceita um array de
inputs por requisição e devolve `data:[{index,embedding}]`.

- Novo `embedMany(texts, options)` em `src/lib/agent/rag/embed.ts`: 1 chamada para N textos
  (fatia defensiva de 256/req), reordena por `index`, valida dimensão de cada vetor, loga
  consumo 1x (soma de tokens). `embed()` virou atalho de 1 texto sobre `embedMany`.
- `embedAllTools` (embed-tools.ts) e `embedAllDomains` (embed-domains.ts) passam a usar
  `embedMany` , 107 chamadas viram **1**.

### Resultado medido (cold start, processo frio, dado real)
- **Antes:** primeiro `thinking` em +70s a +310s; turno completo 73s+.
- **Depois:** primeiro `thinking` em **+5,4s**; turno completo **15,3s**; resposta correta.
- Suíte: 2873 jest verdes (+11 novos); tsc limpo.

## Observações / follow-up opcional (não bloqueia)
- Resta um sequencial offline em `src/lib/agent/intelligence/recommendation-clusterer.ts`
  (job de Aprendizado, fora do hot path por-turno). Pode batchar no futuro.
- Refinamento opcional: **persistir os vetores de tool em disco/DB keyed por hash** para
  que mesmo o ~5s de cold start (após cada deploy) seja eliminado. Hoje o batch já deixa o
  cold start em poucos segundos, aceitável.
- Os probes (`scripts/probe-mcp-latencia.ts`, `scripts/probe-runagent-latencia.ts`) ficam
  como diagnóstico reutilizável (o segundo custa 1 chamada LLM real por execução).

## Arquivos tocados
- `src/lib/agent/rag/embed.ts` (novo `embedMany`; `embed` delega).
- `src/lib/agent/router/embed-tools.ts` / `embed-domains.ts` (usam `embedMany`).
- Testes: `embed.test.ts` (+6), `__tests__/embed-tools.test.ts`, `__tests__/embed-domains.test.ts`,
  `__tests__/pick-domains.test.ts` (mocks atualizados para `embedMany`).
