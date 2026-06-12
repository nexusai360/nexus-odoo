# Diagnóstico do pipeline atual do agente Nex (2026-06-12)

Auditoria de código + dados reais do banco dev (`nexus_odoo_l1`, janela de 14 dias de `llm_usage` e `agent_router_decision`). Nenhum arquivo foi alterado. Referências em `arquivo:linha` apontam para o estado da branch `feat/nex-reconstrucao` nesta data.

Configuração viva no banco (tabela `agent_settings`, id `global`): `router_enabled=true`, `router_tool_retrieval=active`, `router_top_k=3`, `router_threshold=0.30`, `auto_validator_mode=active`, `context_window_checkpoint=PRODUCTION`, `context_window_size=12`, `context_window_include_system=true`, `reasoning_checkpoint=PRODUCTION`, `router_reform_checkpoint=PRODUCTION`. Modelo ativo (`llm_configs.is_active=true`): **openai `gpt-5.4-mini`** (tier "low", $0,25/$2,00 por MTok, `src/lib/agent/llm/catalog.ts:123`).

---

## 1. Fluxo de um turno (`src/lib/agent/run-agent.ts`, 1667 linhas)

Sequência real do `runAgent` (entrada na linha 337):

1. **Setup por turno** (tudo serial antes do primeiro token):
   - `createMcpSession(userId)` (l.338): a sessão MCP é **recriada a cada turno** (`src/lib/agent/mcp-client.ts:112-126`, `StreamableHTTPClientTransport` + `client.connect`). Observação prévia da equipe: timeout de 60s no transport e recriação per-turn já identificados como fonte de latência.
   - `openExternalMcpSessions()` (l.344), `getActiveLlmConfig()` (l.366), `assertConversationOwned` (l.382), platformRole + `userAllowedDomains` (l.390-419), `loadAgentSettings()` (l.422).
   - `searchKb(userMessage, 5)` (l.440): RAG da KB (top 5 snippets) entra no system prompt.
   - `composeSystemPrompt` (l.463) e data atual como item de input separado para preservar prompt caching (l.470-484; chave `promptCacheKey` sha1 do system, l.482).
   - `session.listTools()` com retry de 1,5s se vier vazio (l.494-498). Catálogo vivo hoje: **121 tools** (confirmado via `GET :3100/catalog-schema`).
2. **Router (3 camadas de embedding + reformulação)**, ver §3: `pickDomains` (l.518), reformulação opcional via nano (l.534-558), retrieval de tool (`embedQuestion` + `pickTools`, l.576-601), decisão "fora do catálogo" em shadow (l.603-627), `createDecision` (l.633).
3. **Fast-path de recusa RBAC sem LLM** (l.655-677): domínio fora do acesso responde template com custo zero.
4. **`filterCatalog`** (l.682-691) corta o catálogo em 3 camadas (router, RBAC, retrieval). Média real oferecida ao LLM: **54 tools por turno** (ver §3).
5. **Histórico**: `resolveContextWindow` (l.716) + `loadHistory(conversationId, 12)` (l.724) + `sanitizeHistoryPairs` (l.727). Detalhe crítico no §2.
6. **Loop de tool calling**: `MAX_ITERATIONS = 3` (l.87), e o prompt ainda impõe "máximo 2 chamadas de ferramenta" (`src/lib/agent/prompt/compose.ts:216`). Cada iteração = 1 chamada `client.chat` com streaming (l.812-820). Tool calls executadas via MCP com:
   - gate RBAC por tool (l.1377-1401),
   - cache intra-sessão TTL 60s por (tool, args) (l.1424, `session-cache.ts`),
   - retry de rate limit com backoff 200/800/2000ms (l.1437-1462),
   - guard de 24.576 bytes por tool result (`MAX_TOOL_RESULT_BYTES`, l.90; `guardToolResult` l.141-189 encurta listas para 30 e depois 10 itens preservando `_RESPOSTA`/`_agregado`),
   - telemetria `[nex:tool]` com ms + cacheHit (l.1472).
7. **Pós-processamento da resposta final** (quando não há mais tool calls, l.859):
   - `enhanceWithChips` (l.870): **segunda chamada LLM bloqueante** por turno para extrair chips de sugestão (712 chamadas em 14d, ~845 tokens in / 156 out cada).
   - filtro de sugestões contra perguntas já feitas + gaps (l.904-921), rede de segurança de gap por regex de recusa (l.931-957), strippers de freshness/`[[suggestions]]`/tool-call vazada (l.962-999; a l.979 admite: "o mini as vezes ESCREVE a tool call como texto").
   - **Guardrail factual** (l.1015-1116): `findInventedValues` (l.1600, valores R$ ausentes dos toolResults, threshold >=2 valores E >=50%) + `detectsHallucinatedNonEmpty` (l.1639, tools todas vazias mas resposta afirma dados). Se dispara: **terceira chamada LLM corretiva** (l.1084, temperature 0, maxTokens 1024, sem tools). 17 disparos em 14d.
   - **AutoValidator** (l.1118-1247): roda V1-V5+V9+V8 (ver §4). Em modo `active` (atual): **1 retry corretivo LLM** com timeout 3s (l.1198-1212), temperature 0, maxTokens 1024, sem tools. 149 retries em 14d (~9% dos turnos).
   - Persistência + trigger assíncrono de avaliação de qualidade (l.1272) + tagging de tópico (l.1302) + `updateDecision` do router (l.1321).

**Chamadas LLM por turno (caminho típico com 1 tool):** 2 iterações de loop + 1 enhance = **3 chamadas de chat**, mais 1-2 embeddings (router). Pior caso: 3 loop + 1 reformulação (nano) + 1 guardrail + 1 retry do validator + 1 enhance = **7 chamadas LLM** + 3 embeddings.

---

## 2. Memória e histórico: por que o agente "esquece" (A PERGUNTA MAIS IMPORTANTE)

### Como o histórico entra

`montarConversa` (`src/lib/agent/prompt/montar-conversa.ts:24-38`) é um **replay puro**: `[system, ...historyMessages, dataItem, userMessage]`. Não existe resumo, não existe memória de longo prazo, não existe recuperação semântica sobre a conversa. O que sai da janela simplesmente deixa de existir.

### Quantas mensagens

- `resolveContextWindow` (`src/lib/agent/context-window.ts:37-49`): budget travado em [10, 50], default 20.
- **Valor vivo no banco: `context_window_size = 12`.** Ou seja, `loadHistory` puxa as **últimas 12 linhas** da tabela `messages` (`src/lib/agent/conversation.ts:177-180`, `take: budget`, `orderBy createdAt desc`).
- O orçamento é **contado em MENSAGENS, não em tokens**: 12 linhas, independentemente do tamanho de cada uma.

### O que acontece com tool results de turnos antigos: NUNCA voltam

Este é o mecanismo central do esquecimento, em três fatos encadeados:

1. **Mensagens `role="tool"` nunca são persistidas.** O `run-agent.ts` persiste apenas: a mensagem do usuário (l.735), o assistant com toolCalls (l.1355, `persistAssistantMessageWithTools`) e o assistant final (l.1263). Os tool results vão para a coluna `Message.toolResults` do assistant (l.1523, `updateMessageToolResults`), que o `loadHistory` **não seleciona** (`conversation.ts:181-187` seleciona só `id, role, content, toolCalls`). Confirmação no banco: `SELECT role, count(*) FROM messages` retorna **19.755 assistant + 11.180 user + 0 tool**.
2. **`sanitizeHistoryPairs` descarta o resto.** Como nenhuma linha `tool` existe no banco, todo assistant-com-toolCalls carregado do histórico é um "par incompleto" e é **jogado fora** (`conversation.ts:62-71`: assistant com toolCalls sem `tool` logo após é descartado). Resultado: o histórico efetivo que chega ao LLM é só **texto do usuário + texto final do assistant**.
3. **As linhas descartadas ainda consomem o budget.** O `take: 12` acontece ANTES da sanitização. Um turno típico com tool grava 3 linhas (user, assistant+toolCalls, assistant final); um turno com 2 iterações grava 4. Ou seja, a janela de 12 linhas cobre na prática **~4 turnos de conversa**, e parte delas é peso morto que o sanitizador descarta depois de já ter ocupado vaga.

### Consequência concreta

- O agente lembra no máximo dos últimos ~4 turnos, e **do dado em si ele só lembra o que escreveu na prosa final** (média real de 132 caracteres por mensagem assistant no banco). Se o usuário perguntou "contas a receber de maio" há 5 turnos, nem a pergunta nem a resposta existem mais no contexto; se perguntou há 2 turnos, existe a frase final, mas as 30 linhas de títulos que a tool retornou não existem mais (nunca re-entram).
- O corte é um **penhasco, não uma rampa**: não há sumarização do que saiu da janela, não há embedding/RAG sobre a conversa (o RAG de `searchKb` cobre só documentos da KB, `run-agent.ts:440`), não há "memória de entidades" (cliente/período em foco).
- A reformulação contextual do router (`router/contextualize.ts`, usa últimos 5 pares via `getLastNPairs`) serve **apenas para rotear domínio**, nunca para responder: "a resposta do agente continua usando args.userMessage" (`run-agent.ts:529-531`). Pergunta anafórica ("e em maio?") chega crua ao LLM e depende 100% do replay truncado.
- O `reasoningHistory` persistido por conversa (l.757, `loadConversationReasoningHistory`) é contexto opaco de raciocínio do provider, não memória factual; com OpenAI é stateless (comentário l.753-758).

---

## 3. Router e retrieval: como 121 tools viram candidatas

Catálogo vivo: **121 tools** (`mcp/catalog/index.ts` agrega 11 domínios; por prefixo: fiscal 35, comercial 18, financeiro 15, estoque 10, cadastro 10, contabil 8, servico 3, preco 3, producao 2, crm 2, rh/bi/auditoria/registrar_lacuna/referencia 1 cada).

Pipeline por turno (tudo embedding `text-embedding-3-large`, `src/lib/agent/router/constants.ts:39`):

1. **Camada 1, domínios** (`router/pick-domains.ts:93-190`): embedda a pergunta crua (timeout 3s), cosseno contra vetores de domínio, threshold 0,30, top-K 3 domínios, regexes `forceIncludeOn`, stop-list de saudação. Fallback (trivial/score baixo/embed falhou) = catálogo inteiro.
2. **Camada 2, reformulação** (`run-agent.ts:534-558` + `router/contextualize.ts`): SÓ quando a camada 1 caiu em fallback. Chamada LLM `gpt-5.4-nano` com os últimos 5 pares (`router_reform_n_pairs=5`), re-embedda a pergunta reformulada (camada 3). 6 chamadas em 14d (raríssimo).
3. **Retrieval de tool individual** (`run-agent.ts:576-601` + `router/pick-tools.ts:48-77`): embedda a pergunta, cosseno contra vetor de cada tool, e monta o catálogo enxuto = **piso (todas as tools dos domínios escolhidos + transversais + não-mapeadas) + top-K=3 cross-domínio**. O piso domina: domínio fiscal sozinho já traz 35 tools.
4. **`filterCatalog`** (`router/filter-catalog.ts:28-109`): camada A (corte por domínio do router), camada B (RBAC por `userAllowedDomains`), camada C (retrieval picked). 
5. **Quantas entram no prompt, número real**: `agent_router_decision` em 14 dias, modo `active` (1.023 decisões): **média de 54,0 tools oferecidas** de um total médio de 105,7 pós-RBAC. Ou seja, o "retrieval" reduz menos da metade, e **~54 schemas de tool entram em CADA prompt**, o principal motivo do input médio de ~24k tokens.
6. Custo de latência do router: `pick_duration_ms` médio de **694ms** em active (e a tabela registra 1.087 chamadas de embedding em 14d, média 625ms cada).

---

## 4. AutoValidator (`src/lib/agent/validation/auto-validator.ts`, 815 linhas)

Todos os validadores são **regex/heurística determinística, zero LLM, zero verificação semântica**:

| Validador | Linha | O que detecta | Status |
|---|---|---|---|
| V1 anti-truncamento | 138 | resposta diz "veio truncado" mas a tool já trouxe `_RESPOSTA`/`_agregado` | active |
| V2 anti-invenção | 282 | números citados (R$ e contagens >=5) que não são literais/soma/contagem dos toolResults (tolerância 0,1%) | active |
| V3 anti-recusa | 342 | "não consegui" com agregado em mãos; bypass por lista de termos fora-de-escopo (l.315) | active |
| V4 anti-placeholder | 364 | bullet com "não consegui obter esse dado" | active |
| V5/V5b anti-ignorou-_RESPOSTA | 488 | `_RESPOSTA` curada tem números e a resposta não cita NENHUM; o check de overlap textual foi removido em 2026-06-12 (l.512-517) por causar tom robótico | active |
| V6 total vs soma | 568 | `_agregado.total` não bate com a soma das linhas do próprio envelope | **shadow** (só loga, l.1141-1158 do run-agent) |
| V7 duplicação JOIN | 604 | >=40% de linhas idênticas | **shadow** |
| V8 enquadramento "maiores" | 689 | alegou "top/maiores" sem `topMaiores` nem `ordenadoPor` valor desc | active |
| V9 recusa seca sem fonte | 656 | "não consigo" sem citar sistema/módulo/cadastro | active |

Ordem de execução: V1 -> V3 -> V5 -> V4 -> V9 -> V2 -> V8, primeira falha vence (`validateResponse`, l.760-815). Perguntas de CONTESTAÇÃO ("por que não apareceu X?") pulam V3/V5/V9 (`CONTESTACAO_RE`, l.639). Disparo => 1 retry corretivo (cap 1, timeout 3s, sem tools, maxTokens 1024, `run-agent.ts:1182-1242`); se o retry falha, a resposta original passa. Em paralelo há o guardrail factual inline do run-agent (§1, item 7), com a mesma natureza regex.

Números reais 14d: **149 retries de auto_validator** (input médio 16,4k tokens, 1,6s) e **17 correções de guardrail**.

---

## 5. Custos e latência (instrumentação existente + números reais)

Instrumentação que já existe:
- `llm_usage` por chamada com `duration_ms`, `origin` (loop_principal, enhance, auto_validator, guardrail, router, router_reformulacao), tokens cached (`usage-logger`/`build-usage-args`, gravado em `run-agent.ts:834-857`).
- `[nex:tool]` (ms + cacheHit por tool call, `run-agent.ts:1472`).
- `agent_router_decision.pick_duration_ms` + tamanhos de catálogo.

Números reais (14 dias, banco dev):

| Origem | Chamadas | Tokens in médio | Tokens out médio | Latência média |
|---|---|---|---|---|
| `gpt-5.4-mini` loop_principal | 1.620 | **23.978** | 585 | **6.615ms** |
| `text-embedding-3-large` router | 1.087 | 13 | 0 | 625ms |
| `gpt-5.4-mini` enhance | 712 | 845 | 156 | n/d |
| `gpt-5.4-mini` auto_validator | 149 | 16.418 | 102 | 1.606ms |
| `gpt-5.4` loop_principal | 114 | 22.836 | 417 | **89.784ms** |
| `gpt-5.4-mini` guardrail | 17 | 17.284 | 59 | n/d |

Total 14d: **US$ 12,01**, 59,3 MTok input, dos quais **35,9 MTok cached (60,5%)**, 4.374 chamadas.

Gargalos, em ordem de impacto:
1. **~24k tokens de input por iteração do loop**: ~54 schemas de tool (§3) + system prompt (IDENTITY_BASE ~4,2k chars ~1k tokens + comportamento/formatação/sugestões em `compose.ts` + KB snippets) + **BI_SCHEMA_REFERENCE de ~20k chars (~5k tokens) para admin/super_admin** (`bi-schema-reference.ts`, injetado em `run-agent.ts:395`) + replay do histórico. O prompt caching salva 60%, mas cada iteração extra do loop re-paga o resto.
2. **Latência serial pré-LLM**: criação de sessão MCP por turno + listTools + searchKb + 1-2 embeddings (625ms cada) + `createDecision` (write no Postgres) antes do primeiro token. Router pick médio 694ms.
3. **Cadeia pós-resposta bloqueante**: enhance (2ª chamada LLM) + eventual guardrail + eventual retry do validator acontecem ANTES do `done`, depois do usuário já ter visto o streaming (a mensagem final persistida pode diferir do que foi streamado).
4. **Modelo de raciocínio no loop**: quando o `gpt-5.4` (com reasoning PRODUCTION) foi usado, a média foi **89,8s por chamada**, inviável para chat.

---

## 6. Limitações arquiteturais (lista honesta)

1. **Single-shot reativo, sem plano.** O loop tem 3 iterações no máximo (`run-agent.ts:87`) e o prompt trava em 2 tool calls (`compose.ts:216`). Não há decomposição de pergunta, não há planner, não há paralelização de tools. Perguntas que exigem 3+ consultas encadeadas são estruturalmente impossíveis de responder bem.
2. **Memória = replay truncado de 12 linhas, com amnésia de dados.** Sem sumarização, sem memória de longo prazo, sem RAG sobre a conversa. Tool results de turnos passados nunca re-entram (nunca persistidos como `role=tool`; os stubs assistant+toolCalls são carregados, gastam budget e são descartados pelo `sanitizeHistoryPairs`). Janela efetiva: ~4 turnos. É a causa raiz do "esquecer o que foi falado".
3. **Janela medida em mensagens, não em tokens.** 12 linhas podem ser 500 tokens ou 15k; o sistema não sabe nem mede.
4. **Modelo mini carregando um prompt de gente grande.** `gpt-5.4-mini` (tier low) recebe ~24k tokens com 54 tools; o próprio código documenta os sintomas: escreve tool call como texto (l.979), entra em loop de tools (motivo da redução para 3 iterações, l.83-86), ignora `_RESPOSTA` (motivo do V5).
5. **Validação 100% sintática, sem self-check semântico.** V1-V9 são regex pt-BR centradas em R$ e frases de recusa. Não detectam: resposta que responde a pergunta errada, interpretação errada de período, tool errada com dado plausível, erro de unidade. O juiz LLM existe mas é assíncrono e pós-hoc (`/agente/qualidade`), nunca antes do usuário ver a resposta.
6. **Retry corretivo não pode buscar dado.** Tanto o guardrail quanto o retry do validator chamam o LLM com `tools: undefined` e maxTokens 1024: consertam redação, nunca o dado faltante.
7. **Reformulação contextual só roteia, não responde.** A pergunta anafórica vai crua ao LLM; a versão reformulada (que resolveria "e em maio?") é descartada após o roteamento (`run-agent.ts:529-531`). E só roda quando a camada 1 falhou (6 execuções em 14d).
8. **Retrieval de tools com piso dominante.** O "núcleo mínimo" de `pick-tools.ts` inclui domínios inteiros (fiscal = 35 tools), então o corte real é fraco: média de 54 tools oferecidas. O custo do retrieval (2 embeddings + ranking) não se paga em redução de prompt.
9. **Sessão MCP e listTools recriados a cada turno** (`run-agent.ts:338,494`), com retry de 1,5s para janela de boot: latência fixa por turno que uma sessão persistente eliminaria.
10. **Segunda chamada LLM (enhance) por turno para chips de sugestão**, bloqueante no caminho do `done` (712 chamadas em 14d, ~44% dos turnos do loop).
11. **Pós-processamento em camadas de band-aid.** Strippers de freshness, de `[[suggestions]]`, de tool-call vazada, rede de gap por regex, guardrail, validator: 6+ camadas corretivas empilhadas sobre a saída do mini, cada uma tratando um sintoma do item 4.
12. **A resposta persistida pode divergir da streamada**: correção do guardrail/validator substitui `message` depois que os tokens já foram emitidos via `onEvent`.
