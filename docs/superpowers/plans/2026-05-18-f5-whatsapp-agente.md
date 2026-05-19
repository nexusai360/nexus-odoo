# F5 — Integração WhatsApp + Agente de IA — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> para executar tarefa-a-tarefa. Steps usam checkbox (`- [ ]`).
>
> **Versão:** v3 (2026-05-18) — **versão final, vai para a execução.**
> Ciclo: v1 → review #1 → v2 → review #2 → **v3**.
>
> **Mudanças v2→v3** (review `reviews/2026-05-18-f5-plan-review-2.md`):
> decompostos 4 épicos — Task 1.7 → 1.7a/b/c/d; Task 3.0 → 3.0a/b/c; Task 3.3 →
> 3.3a/b/c; Task 5.2 → 5.2a/b/c. Integração: G5 — `types.ts` (Task 1.3) garante
> o tipo `ToolDefinition`; G6 — Task 1.13 normaliza o resultado MCP→string antes
> do guard; G7 — Task 1.13 carrega o `PlatformRole`. Testabilidade: G8 — Task
> 3.2 descreve o método de teste de SSE; G9 — adicionado
> `scripts/verify-f5-onda4.ts`.
>
> _Histórico abaixo._
>
> **Mudanças v1→v2** (review `reviews/2026-05-18-f5-plan-review-1.md`):
> **Base:** SPEC v3 `specs/2026-05-18-f5-whatsapp-agente-spec.md` +
> research `research/2026-05-18-f5-nex-mapping.md`.
>
> **Mudanças v1→v2** (review `reviews/2026-05-18-f5-plan-review-1.md`): P1 — task
> de `transcribe.ts` adicionada (Task 1.15); P2 — UI de config de LLM
> (credenciais+modelo+prompt) movida para a onda 3 (Task 3.0), só a KB fica na
> onda 7; P3 — streaming reordenado (Task 3.1 = adapter Anthropic, 3.2 =
> endpoint SSE); P4 — Task 1.1 Step 0 garante `DATABASE_URL` no env; P5 —
> credencial de embedding via `AppSetting embedding_credential_id`; P6 — áudio
> de WhatsApp cabeado no processor (Task 4.3); P7 — Task 6.5 exibe o token MCP
> read-only (sem "rotação pela UI"); P8 — scripts rodam com
> `tsx --env-file=.env.local` (confirmado: `tsx` está nas devDependencies); P9 —
> task de design no início da onda 3 (Task 3.0d); P10 — worker entrypoint é
> `src/worker/index.ts`, filas em `src/worker/jobs.ts`.

**Goal:** Entregar um agente de IA que responde perguntas de negócio por WhatsApp
(via n8n) e por chat in-app, consultando o MCP da F4, com menu Integrações,
multi-LLM, persistência de conversas e RAG.

**Architecture:** Núcleo de agente compartilhado (`src/lib/agent/`) consumido por
dois transportes — request SSE do Next (in-app) e job BullMQ no worker (WhatsApp).
O agente é cliente do MCP da F4 (Streamable HTTP, service token + userId). A
plataforma é stateful (conversas em Postgres + pgvector); o MCP continua
stateless. Menu Integrações superadmin gerencia Canais/MCP/Webhooks/API/BI.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, base-ui, Prisma v7,
Postgres+pgvector, Redis+BullMQ, `@modelcontextprotocol/sdk` (cliente), provedores
LLM via `fetch` puro (port do Nex). Testes: jest. UI: `ui-ux-pro-max` obrigatório.

**Convenções de execução:**
- TDD onde há lógica testável (`superpowers:test-driven-development`).
- Commits atômicos por task. Branch: `feat/integracao-whatsapp` (já criada).
- Verificação por onda: `npx tsc --noEmit`, `npx eslint src/`, `npx jest`,
  `npx next build` + **e2e contra dado real** (`CLAUDE.md §6 [9]`).
- "Porte de X" = copiar de `nexus-insights` o arquivo citado e aplicar **cada**
  adaptação listada. O caminho-fonte é sempre relativo a
  `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`.

---

## Mapa de arquivos (decomposição)

```
src/lib/agent/
  llm/types.ts                 — tipos canônicos (port)
  llm/providers/{anthropic,openai,gemini,openrouter}.ts — adapters (port)
  llm/providers/test-connection.ts — teste de conexão (port)
  llm/get-client.ts            — factory de cliente (port)
  llm/get-active-config.ts     — lê config LLM ativa do banco (port adaptado)
  llm/catalog.ts               — catálogo+pricing UNIFICADO (port corrigido)
  llm/credentials.ts           — CRUD de credenciais cifradas (port adaptado)
  llm/exchange-rate.ts         — cotação USD→BRL (port corrigido)
  llm/usage-logger.ts          — grava LlmUsage (port corrigido)
  prompt/compose.ts            — composeSystemPrompt (port)
  prompt/identity-base.ts      — IDENTITY_BASE reescrito p/ domínio Odoo (novo)
  mcp-client.ts                — cliente MCP + mcpToolsToProviderTools (novo)
  bi-schema-reference.ts       — DDL resumido das fact tables p/ Caminho 3c (novo)
  run-agent.ts                 — orquestrador (port adaptado: tools via MCP)
  conversation.ts              — getOrCreateConversation, load/persist Message (novo)
  transcribe.ts                — transcrição de áudio (port)
  rag/embed.ts, rag/search.ts  — embeddings + busca pgvector (novo, onda 7)
src/lib/whatsapp/
  cloud-client.ts              — cliente Graph API + downloadMedia (novo)
  resolve.ts                   — resolveWhatsappUser (novo)
  hmac.ts                      — assinatura/verificação HMAC (novo)
  inbound-payload.ts           — Zod schema do payload inbound (novo)
src/app/api/agent/stream/route.ts        — SSE do chat in-app (novo)
src/app/api/integrations/whatsapp/inbound/route.ts — endpoint receptor (novo)
src/app/(protected)/agente/**            — chat, consumo, playground, config
src/app/(protected)/integracoes/**       — menu Integrações (superadmin)
src/components/agent/**                  — bubble, painel, mensagens, áudio
src/components/integracoes/**            — cartões e telas
src/worker/agent/                        — job BullMQ da fila `agent`
prisma/schema.prisma + migrations        — modelos §9 da SPEC
docs/runbooks/n8n-whatsapp.md            — orientação de config do n8n
```

---

# ONDA 1 — Fundação de dados + núcleo do agente (F5b)

> Resultado: migrations aplicadas; camada multi-LLM, orquestrador, cliente MCP e
> prompt funcionando; teste e2e: o agente responde uma pergunta de estoque real
> via MCP num script de verificação.

## Task 1.1 — Migration: modelos de conversa e agente

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev --name f5_agent_core`

- [ ] **Step 0 (P4):** Garantir que `DATABASE_URL` está no ambiente antes de
  migrar — rodar os comandos Prisma com `--env-file=.env.local` ou exportar a
  var (`prisma.config.ts` lê `process.env.DATABASE_URL`). Sem isso o
  `migrate dev` falha.
- [ ] **Step 1:** Adicionar ao `schema.prisma` os enums `AgentChannel`
  (`whatsapp in_app playground`), `MessageRole` (`user assistant tool`),
  `KbKind` (`PDF TXT URL`), `WhatsappResponseMode` (`direct n8n_webhook`),
  `WebhookDirection` (`inbound outbound`). Copiar a forma final da SPEC §9.
- [ ] **Step 2:** Adicionar os models `Conversation`, `Message`, `LlmCredential`,
  `LlmConfig`, `LlmUsage`, `AgentSettings` exatamente como na SPEC §9 (campos,
  `@map`, índices). `Conversation.userId` referencia `User` com relação nomeada;
  adicionar o lado inverso em `User` (`conversations Conversation[]`).
- [ ] **Step 3:** Adicionar ao enum `AuditAction` os valores novos da SPEC §9:
  `user_whatsapp_added`, `user_whatsapp_removed`, `whatsapp_inbound_rejected`,
  `agent_settings_updated`, `llm_credential_created`, `llm_credential_deleted`,
  `api_key_created`, `api_key_revoked`, `whatsapp_channel_updated`.
- [ ] **Step 4:** Rodar `npx prisma migrate dev --name f5_agent_core`.
  Expected: migration criada e aplicada, `prisma generate` OK.
- [ ] **Step 5:** Rodar `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 6:** Commit — `feat(f5): migration do núcleo do agente (conversa, LLM, settings)`.

## Task 1.2 — Migration: modelos de WhatsApp, API keys e idempotência

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** Adicionar os models `WhatsappChannel`, `WhatsappWebhook`,
  `ApiKey`, `ProcessedWhatsappMessage`, `UserWhatsappNumber`, `KbDocument`
  conforme SPEC §9. `KbDocument` ainda **sem** a coluna `embedding` (vem na
  onda 7). `UserWhatsappNumber.userId` referencia `User`; adicionar o lado
  inverso em `User` (`whatsappNumbers UserWhatsappNumber[]`).
- [ ] **Step 2:** Rodar `npx prisma migrate dev --name f5_whatsapp_apikeys`.
- [ ] **Step 3:** `npx tsc --noEmit` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): migration de WhatsApp, API keys e idempotência`.

## Task 1.3 — Tipos canônicos da camada LLM

**Files:**
- Create: `src/lib/agent/llm/types.ts`

- [ ] **Step 1:** Portar `nexus-insights/src/lib/llm/types.ts` para
  `src/lib/agent/llm/types.ts`. Adaptações: nenhuma de lógica; só ajustar
  comentários de branding ("Nex" → "agente"). Manter `ChatMessage`, `ToolCall`,
  `ChatResult`, `ProviderClient`, `LlmProvider`, `ChatRequest`.
  **(G5)** Garantir que o arquivo inclui o tipo da **definição de tool**
  (`ToolDefinition` — `{name, description, parameters: JSONSchema}`); no Nex ele
  vinha de `tools/definitions.ts`. Se o port de `types.ts` não o trouxer,
  defini-lo aqui — `mcpToolsToProviderTools` (Task 1.10) e os `mapTools` dos
  adapters (Task 1.7x) dependem dele.
- [ ] **Step 2:** `npx tsc --noEmit` → PASS.
- [ ] **Step 3:** Commit — `feat(f5): tipos canônicos da camada LLM`.

## Task 1.4 — Catálogo+pricing unificado (corrige BUGs 2, 3)

**Files:**
- Create: `src/lib/agent/llm/catalog.ts`
- Test: `src/lib/agent/llm/catalog.test.ts`

- [ ] **Step 1: Escrever o teste falhando.** Em `catalog.test.ts`: para todo
  modelo do catálogo, `getModel(id)` retorna um registro com `id`, `provider`,
  `tier` e `pricing` (`{inputPerMTok, outputPerMTok}` **ou** `null` explícito);
  `calculateCost(modelId, tokensIn, tokensOut)` retorna `{costUsd, costKnown}` —
  `costKnown=false` quando `pricing` é `null` (BUG 2); nenhum id duplicado e
  nenhum id divergente entre catálogo e pricing (BUG 3).
- [ ] **Step 2:** Rodar `npx jest catalog` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar.** Fundir `nexus-insights/src/lib/llm/catalog.ts` e
  `pricing.ts` numa **fonte única**: um array `MODELS` onde cada entrada tem
  `{id, provider, label, tier, pricing}` (pricing `null` quando desconhecido).
  `getModel(id)`, `listModels(provider)`, `calculateCost()` derivam disso.
  `calculateCost` retorna `{costUsd: number, costKnown: boolean}` — nunca 0
  silencioso. Manter os ~160 modelos do catálogo do Nex; para os ~120 sem preço,
  `pricing: null`.
- [ ] **Step 4:** `npx jest catalog` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): catálogo+pricing unificado de LLM (corrige custo zero silencioso)`.

## Task 1.5 — Cotação cambial (corrige BUGs 5, 6)

**Files:**
- Create: `src/lib/agent/llm/exchange-rate.ts`
- Test: `src/lib/agent/llm/exchange-rate.test.ts`

- [ ] **Step 1: Teste falhando.** `getUsdBrlRate()` retorna `{rate, spread,
  stale}`. Mock do fetch da AwesomeAPI: sucesso → `stale=false`; falha → usa
  último valor em cache e `stale=true` (BUG 5); o `spread` aplicado é retornado
  junto (BUG 6).
- [ ] **Step 2:** `npx jest exchange-rate` → FAIL.
- [ ] **Step 3: Implementar.** Portar `exchange-rate.ts` do Nex com mudanças:
  retornar `{rate, spread, stale}` em vez de só `rate`; em falha de fetch, não
  retornar `null` — devolver o último cache com `stale=true`; `spread` é
  constante versionada exportada (`RATE_SPREAD = 1.10`) e devolvida no objeto.
- [ ] **Step 4:** `npx jest exchange-rate` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): cotação cambial com spread versionado e flag stale`.

## Task 1.6 — Credenciais LLM cifradas

**Files:**
- Create: `src/lib/agent/llm/credentials.ts`
- Test: `src/lib/agent/llm/credentials.test.ts`

- [ ] **Step 1: Teste falhando.** `createCredential`, `listCredentials` (mascara
  a chave, expõe `last4`), `deleteCredential` (bloqueia se em uso por
  `LlmConfig`), `getDecryptedKey(id)`. Validações: label 1-60 chars, chave ≥10,
  label única por provider.
- [ ] **Step 2:** `npx jest credentials` → FAIL.
- [ ] **Step 3: Implementar.** Portar `credentials.ts` do Nex. Adaptações:
  usar `src/lib/encryption.ts` (não `@/lib/encryption` do Nex — verificar a
  assinatura `encrypt`/`decrypt` local); usar `src/lib/prisma.ts` e o model
  `LlmCredential` da Task 1.1; gravar `AuditLog` (`llm_credential_created`/
  `_deleted`).
- [ ] **Step 4:** `npx jest credentials` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): CRUD de credenciais LLM cifradas`.

## Task 1.7a — Adapter Anthropic + factory de cliente

**Files:**
- Create: `src/lib/agent/llm/providers/anthropic.ts`, `src/lib/agent/llm/get-client.ts`
- Test: `src/lib/agent/llm/providers/anthropic.test.ts`

- [ ] **Step 1: Teste falhando.** Com `isMockKey()` (`MOCK...`), `chat()`
  retorna resposta simulada sem fetch; `mapMessages` trata `role:"tool"` →
  `tool_result` em `role:user`; `mapTools` converte `ToolDefinition` → schema
  Anthropic; concatena multi-system. `buildLlmClient('anthropic',...)` devolve
  um `ProviderClient`.
- [ ] **Step 2:** `npx jest anthropic` → FAIL.
- [ ] **Step 3: Implementar.** Portar `providers/anthropic.ts` + `get-client.ts`
  do Nex (ajustar imports). **Não** portar `tools/` do Nex.
- [ ] **Step 4:** `npx jest anthropic` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): adapter LLM Anthropic + factory de cliente`.

## Task 1.7b — Adapter OpenAI

**Files:**
- Create: `src/lib/agent/llm/providers/openai.ts`
- Test: `openai.test.ts`

- [ ] **Step 1: Teste falhando.** Mock key → resposta simulada; `mapMessages`/
  `mapTools`; **caso reasoning** (GPT-5.x/o1/o3): usa `max_completion_tokens` e
  **não** envia `temperature`.
- [ ] **Step 2:** `npx jest openai` → FAIL.
- [ ] **Step 3: Implementar.** Portar `providers/openai.ts` do Nex.
- [ ] **Step 4:** `npx jest openai` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): adapter LLM OpenAI`.

## Task 1.7c — Adapters Gemini e OpenRouter

**Files:**
- Create: `src/lib/agent/llm/providers/gemini.ts`, `openrouter.ts`
- Test: `gemini.test.ts`, `openrouter.test.ts`

- [ ] **Step 1: Teste falhando.** Gemini: `tool` → `functionResponse`,
  assistant → role `model`. OpenRouter: remove o prefixo `openrouter/` do model
  id. Ambos: mock key → simulado.
- [ ] **Step 2:** `npx jest gemini openrouter` → FAIL.
- [ ] **Step 3: Implementar.** Portar `providers/gemini.ts` e `openrouter.ts`.
- [ ] **Step 4:** `npx jest gemini openrouter` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): adapters LLM Gemini e OpenRouter`.

## Task 1.7d — Leitura da config LLM ativa

**Files:**
- Create: `src/lib/agent/llm/get-active-config.ts`
- Test: `get-active-config.test.ts`

- [ ] **Step 1: Teste falhando.** `getActiveLlmConfig()` faz o JOIN
  `LlmConfig`(isActive)×`LlmCredential`, decifra a chave, devolve
  `{provider, model, apiKey}`; `getPublicActiveLlmConfig()` devolve a versão
  mascarada; sem config ativa → erro claro.
- [ ] **Step 2:** `npx jest get-active-config` → FAIL.
- [ ] **Step 3: Implementar.** Portar `get-active-config.ts` do Nex; ler via
  `src/lib/prisma.ts` os models da Task 1.1; decifrar com `src/lib/encryption.ts`.
- [ ] **Step 4:** `npx jest get-active-config` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): leitura da config LLM ativa`.

## Task 1.8 — IDENTITY_BASE do domínio Odoo + composição de prompt

**Files:**
- Create: `src/lib/agent/prompt/identity-base.ts`, `src/lib/agent/prompt/compose.ts`
- Test: `src/lib/agent/prompt/compose.test.ts`

- [ ] **Step 1: Teste falhando.** `composeSystemPrompt(cfg, kbDocs, biSchema?)`:
  com `advancedOverride` preenchido retorna só ele; senão concatena
  identityBase → personalidade → tom → guardrails → KB (budget 30KB, truncagem)
  → terminologia → instrução de sugestões; o bloco de schema BI só entra quando
  `biSchema` é passado (admin/super_admin).
- [ ] **Step 2:** `npx jest compose` → FAIL.
- [ ] **Step 3: Implementar `compose.ts`.** Portar `prompt-compose.ts` do Nex
  (`composeSystemPrompt`). Adaptação: aceitar um parâmetro opcional `biSchema`
  que, quando presente, é anexado como `## Schema para consulta avançada (BI)`.
- [ ] **Step 4: Escrever `identity-base.ts`.** Constante `IDENTITY_BASE`
  **reescrita do zero** para o domínio Odoo: identidade ("assistente de operação
  da Matrix Fitness Group"); domínios (estoque, financeiro, fiscal, comercial,
  cadastros, contábil); guia de seleção das 33 tools do MCP (consultar
  `mcp/catalog/` para os nomes); semântica de período; formato de resposta
  (incluir o timestamp "atualizado há Xs" que as tools retornam); instrução do
  Caminho 3 (quando `registrar_lacuna`, quando recusar, quando
  `bi_consulta_avancada`).
- [ ] **Step 5:** `npx jest compose` → PASS.
- [ ] **Step 6:** Commit — `feat(f5): prompt do agente — IDENTITY_BASE do domínio Odoo`.

## Task 1.9 — Referência de schema das fact tables (Caminho 3c)

**Files:**
- Create: `src/lib/agent/bi-schema-reference.ts`
- Test: `src/lib/agent/bi-schema-reference.test.ts`

- [ ] **Step 1: Teste falhando (trava de drift — B6).** O teste lê
  `prisma/schema.prisma`, extrai os modelos `Fato*` (nome de tabela `@@map`,
  colunas, tipos) e compara com a constante `BI_SCHEMA_REFERENCE`; falha se
  divergir.
- [ ] **Step 2:** `npx jest bi-schema-reference` → FAIL.
- [ ] **Step 3: Implementar.** `BI_SCHEMA_REFERENCE` — string com o DDL resumido
  das fact tables (`fato_estoque_saldo`, `fato_estoque_movimento`,
  `fato_produto_parado`, `fato_financeiro_saldo`, `fato_financeiro_movimento`,
  `fato_financeiro_titulo`, `fato_pedido`, `fato_pedido_parcela`,
  `fato_nota_fiscal`, `fato_nota_fiscal_item`, `fato_parceiro`,
  `fato_conta_contabil`): nome de tabela + colunas + tipos. Derivar de
  `prisma/schema.prisma` linhas 1143+.
- [ ] **Step 4:** `npx jest bi-schema-reference` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): referência de schema das fact tables para o Caminho 3c`.

## Task 1.10 — Cliente MCP + adaptador de tools

**Files:**
- Create: `src/lib/agent/mcp-client.ts`
- Test: `src/lib/agent/mcp-client.test.ts`

- [ ] **Step 1: Teste falhando.** `mcpToolsToProviderTools(mcpTools)` converte
  o formato MCP (`{name, description, inputSchema}`) para o formato de
  `ToolDefinition` que os adapters consomem. `createMcpSession(userId)` retorna
  um objeto com `listTools()`, `callTool(name,args)` e `close()`.
- [ ] **Step 2:** `npx jest mcp-client` → FAIL.
- [ ] **Step 3: Implementar.** Usar `@modelcontextprotocol/sdk` cliente +
  transporte Streamable HTTP apontando para `process.env.MCP_URL`. Autenticar
  com `process.env.MCP_SERVICE_TOKEN` e passar o `userId` na inicialização da
  sessão (conferir o contrato do `mcp/auth/` da F4 — `mcp/auth/session-store.ts`,
  `user-context.ts`). `mcpToolsToProviderTools` faz a conversão de envelope.
  **Sessão por invocação** (B1): `createMcpSession` abre; o chamador fecha em
  `finally`.
- [ ] **Step 4:** `npx jest mcp-client` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): cliente MCP do agente + adaptador de tools`.

## Task 1.11 — Persistência de conversa

**Files:**
- Create: `src/lib/agent/conversation.ts`
- Test: `src/lib/agent/conversation.test.ts`

- [ ] **Step 1: Teste falhando.** `getOrCreateWhatsappConversation(userId)`:
  reusa conversa `whatsapp` com última msg <24h, senão cria nova.
  `createConversation(userId, channel)`: cria nova. `assertConversationOwned
  (conversationId, userId)`: lança se não pertence. `loadHistory(conversationId,
  budget)`: últimas N mensagens. `persistMessage(conversationId, role, content,
  toolCalls?)`. `deriveTitle(firstUserMessage)`: trunca ~60 chars.
- [ ] **Step 2:** `npx jest conversation` → FAIL.
- [ ] **Step 3: Implementar** conforme SPEC §9.1 (agrupamento por canal — B3).
- [ ] **Step 4:** `npx jest conversation` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): persistência e agrupamento de conversas`.

## Task 1.12 — Logger de uso (corrige BUGs 1, 4, 7, 8)

**Files:**
- Create: `src/lib/agent/llm/usage-logger.ts`
- Test: `src/lib/agent/llm/usage-logger.test.ts`

- [ ] **Step 1: Teste falhando.** `logUsage(entry)` grava uma row em `LlmUsage`
  com: `costKnown` vindo de `calculateCost`; `costUsd` null quando
  `costKnown=false`; `costBrl` calculado com `getUsdBrlRate` — se `stale`,
  `rateStale=true` (nunca null por falha); `rateSpread` gravado; `isPlayground`
  do parâmetro; `tokensInput`/`tokensOutput` do provedor; `promptChars`/
  `responseChars` nullable.
- [ ] **Step 2:** `npx jest usage-logger` → FAIL.
- [ ] **Step 3: Implementar.** Portar `usage-logger.ts` do Nex aplicando as
  correções acima (BUGs 1,4,5,6,7 da SPEC §4.6).
- [ ] **Step 4:** `npx jest usage-logger` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): logger de uso de LLM com custo corrigido`.

## Task 1.13 — Orquestrador `runAgent`

**Files:**
- Create: `src/lib/agent/run-agent.ts`
- Test: `src/lib/agent/run-agent.test.ts`

- [ ] **Step 1: Teste falhando.** Com cliente LLM mock e sessão MCP mock:
  `runAgent({conversationId, userId, userMessage, channel, isPlayground,
  onEvent})` carrega histórico, monta prompt, roda o loop de tool calling
  (executa tool calls via MCP), aplica o guard de tamanho de resultado
  (`MAX_TOOL_RESULT_BYTES=24576` — trunca + aviso), respeita `MAX_ITERATIONS=5`,
  loga uso por iteração, persiste `Message` do user e do assistant, extrai
  `[[suggestions]]`, e emite eventos via `onEvent`. Fecha a sessão MCP no
  `finally`.
- [ ] **Step 2:** `npx jest run-agent` → FAIL.
- [ ] **Step 3: Implementar.** Portar o loop de `run-nex.ts` do Nex. Adaptações:
  - tools vêm de `createMcpSession(userId).listTools()` convertidas por
    `mcpToolsToProviderTools`; `executeTool` vira `session.callTool`;
  - **(G6)** o resultado de `session.callTool` (formato MCP `content[]`) é
    **normalizado para string** e então passa pelo guard de tamanho
    (`MAX_TOOL_RESULT_BYTES`, SPEC §4.3) antes de virar a `ChatMessage` de
    `role:"tool"`;
  - **(G7)** carregar o `PlatformRole` do `User` (`prisma.user.findUnique`)
    para decidir a injeção de `BI_SCHEMA_REFERENCE` (só admin/super_admin);
  - carregar histórico via `conversation.ts`; persistir mensagens;
  - fechar a sessão MCP em `finally`; `onEvent` opcional para progresso.
- [ ] **Step 4:** `npx jest run-agent` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): orquestrador runAgent (loop de tool calling via MCP)`.

## Task 1.15 — Transcrição de áudio (P1)

**Files:**
- Create: `src/lib/agent/transcribe.ts`
- Test: `src/lib/agent/transcribe.test.ts`

- [ ] **Step 1: Teste falhando.** `transcribe(audioBytes, mimeType)` chama a
  API de transcrição (mock do fetch) e retorna o texto; sem credencial OpenAI
  → lança `TranscriptionUnavailable`.
- [ ] **Step 2:** `npx jest transcribe` → FAIL.
- [ ] **Step 3: Implementar.** Portar `nexus-insights/src/lib/nex/transcribe.ts`
  (`gpt-4o-mini-transcribe` → fallback `whisper-1`). Adaptação: ler a credencial
  OpenAI via `src/lib/agent/llm/credentials.ts`; revisar o gating "só OpenAI".
- [ ] **Step 4:** `npx jest transcribe` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): transcrição de áudio`.

## Task 1.14 — `.env.example` e verificação e2e da onda 1

**Files:**
- Modify: `.env.example`
- Create: `scripts/verify-f5-onda1.ts`

- [ ] **Step 1:** Adicionar ao `.env.example`: `MCP_URL`, `MCP_SERVICE_TOKEN`,
  `WHATSAPP_INBOUND_SECRET`, com comentários. Confirmar `ENCRYPTION_KEY` já
  presente (F1); se não, adicionar.
- [ ] **Step 2: Script e2e.** `scripts/verify-f5-onda1.ts`: sobe uma sessão,
  cria uma credencial LLM real (ou MOCK), uma `LlmConfig` ativa, e chama
  `runAgent` com uma pergunta de estoque ("qual o saldo total de estoque?").
  Pré-requisito: MCP da F4 rodando (`npm run mcp` ou container) e fatos
  populados. Imprime a resposta e o uso registrado.
- [ ] **Step 3:** Rodar `npx tsc --noEmit`, `npx eslint src/`, `npx jest` →
  todos PASS.
- [ ] **Step 4:** Subir o MCP + rodar
  `npx tsx --env-file=.env.local scripts/verify-f5-onda1.ts` → o agente responde
  com número coerente com o cache. (`tsx` está nas devDependencies; mesmo padrão
  dos scripts `worker`/`mcp` do `package.json`.) **Evidência obrigatória.**
- [ ] **Step 5:** Commit — `chore(f5): verificação e2e da onda 1 + envs`.

---

# ONDA 2 — Cadastro de WhatsApp no usuário (F5a)

> Resultado: usuário tem N números de WhatsApp; `resolveWhatsappUser` cruza
> número→usuário→acesso. UI no form de usuário.

## Task 2.1 — `resolveWhatsappUser` + normalização E.164

**Files:**
- Create: `src/lib/whatsapp/resolve.ts`
- Test: `src/lib/whatsapp/resolve.test.ts`

- [ ] **Step 1: Teste falhando.** `normalizeE164(raw)`: normaliza variações
  (`+55 11 9...`, `5511...`) para E.164 ou lança. `resolveWhatsappUser(raw)`:
  número desconhecido → `{status:'unknown'}`; número de usuário inativo →
  `{status:'inactive'}`; número de usuário ativo → `{status:'ok', user}`.
- [ ] **Step 2:** `npx jest resolve` → FAIL.
- [ ] **Step 3: Implementar.** Normalização E.164 (assumir BR como default de
  país quando sem `+`); query `UserWhatsappNumber` + `User`.
- [ ] **Step 4:** `npx jest resolve` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): resolução número WhatsApp → usuário → acesso`.

## Task 2.2 — Server Actions de números de WhatsApp

**Files:**
- Create: `src/lib/actions/user-whatsapp.ts`
- Test: `src/lib/actions/user-whatsapp.test.ts`

- [ ] **Step 1: Teste falhando.** `addWhatsappNumber(userId, raw)`: valida
  E.164, rejeita número já em uso por outro usuário, grava
  `UserWhatsappNumber`, audita `user_whatsapp_added`.
  `removeWhatsappNumber(id)`: remove, audita `user_whatsapp_removed`. Gate:
  só `super_admin`/`admin` (mesma regra do form de usuário existente).
- [ ] **Step 2:** `npx jest user-whatsapp` → FAIL.
- [ ] **Step 3: Implementar.** Seguir o padrão das Server Actions de usuário
  existentes (`src/lib/actions/` — checar o padrão de auth/audit já usado).
- [ ] **Step 4:** `npx jest user-whatsapp` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): server actions de números de WhatsApp`.

## Task 2.3 — UI: seção "Números de WhatsApp" no form de usuário

**Files:**
- Modify: `src/components/users/user-form-dialog.tsx`
- Create: `src/components/users/whatsapp-numbers-field.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` para o padrão de campo de lista
  editável (chips + input + validação inline). **Obrigatório antes de codar.**
- [ ] **Step 2:** Criar `whatsapp-numbers-field.tsx`: lista de números com
  adicionar/remover, validação de formato inline, feedback "número já em uso".
- [ ] **Step 3:** Integrar a seção no `user-form-dialog.tsx`.
- [ ] **Step 4:** Rodar `npx tsc --noEmit`, `npx eslint src/`,
  `npx next build` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): UI de números de WhatsApp no cadastro de usuário`.

## Task 2.4 — Verificação e2e da onda 2

- [ ] **Step 1:** Subir `npm run dev`, criar um usuário com 2 números, conferir
  no banco (`UserWhatsappNumber`), remover um.
- [ ] **Step 2:** Rodar `resolveWhatsappUser` num script com um número
  cadastrado (→ ok), um desconhecido (→ unknown), um de usuário inativo
  (→ inactive). **Evidência obrigatória.**
- [ ] **Step 3:** Commit — `chore(f5): verificação e2e da onda 2`.

---

# ONDA 3 — Chat in-app (F5c parte 1)

> Resultado: UI de config do agente (credenciais LLM + modelo + prompt) +
> bubble + página `/agente`, streaming SSE, conversas persistidas.

## Task 3.0d — Passe de design (P9)

- [ ] **Step 1:** Consultar `ui-ux-pro-max` para definir o sistema visual do
  chat do agente (bubble, painel, página em tela cheia, bolhas de mensagem,
  estados de loading/streaming, lista de conversas) **e** do menu Integrações
  (grid de cartões). Registrar as decisões num doc curto em
  `docs/superpowers/research/2026-05-18-f5-ui-design.md` que as tasks de UI
  das ondas 3, 5 e 6 consultam.
- [ ] **Step 2:** Commit — `docs(f5): passe de design do agente e Integrações`.

## Task 3.0a — Server Actions de configuração do agente (P2, G3)

**Files:**
- Create: `src/lib/actions/agent-config.ts`
- Test: `src/lib/actions/agent-config.test.ts`

- [ ] **Step 1: Teste falhando.** `getAgentSettings()`/`updateAgentSettings()`
  (identidade/personalidade/tom/guardrails/terminologia/toggles; audita
  `agent_settings_updated`); `activateLlmConfig(id)` — transacional (desativa
  todas + ativa a escolhida, SPEC §9.2). Gate `super_admin`/`admin`.
- [ ] **Step 2:** `npx jest agent-config` → FAIL.
- [ ] **Step 3: Implementar.** Usar `src/lib/prisma.ts`, `src/lib/audit.ts`,
  `src/lib/permissions.ts` no padrão das actions existentes.
- [ ] **Step 4:** `npx jest agent-config` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): server actions de configuração do agente`.

## Task 3.0b — UI: credenciais LLM + seleção de modelo (G3)

**Files:**
- Create: `src/components/agent/credentials-section.tsx`, `llm-config-form.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` (doc da Task 3.0d). **Obrigatório.**
- [ ] **Step 2:** Portar de `nexus-insights/src/components/agente-nex/`
  `llm-config-form` e a seção de credenciais (renomeando `nex`→`agent`).
  Credenciais usam as actions de `credentials.ts` (Task 1.6); seleção de modelo
  usa `agent-config.ts` (Task 3.0a) + o catálogo (Task 1.4).
- [ ] **Step 3:** `npx tsc --noEmit`, `npx eslint src/` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): UI de credenciais LLM e seleção de modelo`.

## Task 3.0c — UI: edição de prompt + página de configuração (G3)

**Files:**
- Create: `src/components/agent/{prompt-config-form,identity-base-editor,resources-toggles}.tsx`
- Create: `src/app/(protected)/agente/configuracao/page.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` (doc da Task 3.0d). **Obrigatório.**
- [ ] **Step 2:** Portar `prompt-config-form`, `identity-base-editor`,
  `resources-toggles` de `agente-nex/` (renomeando `nex`→`agent`); usam
  `agent-config.ts` (Task 3.0a). **A gestão de KB NÃO entra aqui — onda 7.**
- [ ] **Step 3:** Criar a página `/agente/configuracao` montando as seções das
  Tasks 3.0b e 3.0c. Gate `super_admin`/`admin`.
- [ ] **Step 4:** `npx next build` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): UI de edição de prompt + página de config do agente`.

## Task 3.1 — Streaming token-a-token no adapter Anthropic (P3)

**Files:**
- Modify: `src/lib/agent/llm/providers/anthropic.ts`
- Test: estende `anthropic.test.ts`

- [ ] **Step 1: Teste falhando.** `chat({stream:true, onToken})` consome o SSE
  da API Anthropic e chama `onToken` por delta; sem `stream` mantém o
  comportamento de bloco.
- [ ] **Step 2:** `npx jest anthropic` → FAIL.
- [ ] **Step 3: Implementar.** Adicionar suporte a `stream:true` no adapter
  Anthropic (endpoint `/v1/messages` com `stream:true`, parse de SSE
  `content_block_delta`). Demais adapters: fallback em bloco (SPEC §8.1).
- [ ] **Step 4:** `npx jest anthropic` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): streaming token-a-token no adapter Anthropic`.

## Task 3.2 — Endpoint SSE `/api/agent/stream`

**Files:**
- Create: `src/app/api/agent/stream/route.ts`
- Test: `src/app/api/agent/stream/route.test.ts`

- [ ] **Step 1: Teste falhando.** `POST` com `{conversationId?, message}`:
  exige sessão NextAuth (401 sem); se `conversationId` ausente cria conversa
  `in_app`; valida posse da conversa; chama `runAgent` (mock) com `onEvent`
  ligando ao stream; responde `text/event-stream`. **Método de teste (G8):** o
  teste lê `response.body` como stream, decodifica os chunks, parseia as linhas
  `data:` e **asserta a sequência** de eventos `status` → `text`/`token` →
  `done` (com `suggestions`). Usar um `runAgent` mockado que chama `onEvent`
  numa ordem conhecida.
- [ ] **Step 2:** `npx jest agent/stream` → FAIL.
- [ ] **Step 3: Implementar.** `ReadableStream` SSE. `onEvent` do `runAgent`
  empurra eventos de progresso; o turno final é entregue token-a-token (adapter
  Anthropic da Task 3.1) ou em bloco (demais provedores). Ver SPEC §8.1.
- [ ] **Step 4:** `npx jest agent/stream` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): endpoint SSE do chat do agente`.

## Task 3.3a — Componentes de mensagem e sugestões (G2)

**Files:**
- Create: `src/components/agent/agent-message.tsx`, `suggestions-bar.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` (doc da Task 3.0d). **Obrigatório.**
- [ ] **Step 2:** Portar `nex-message` e `suggestions-bar` de
  `nexus-insights/src/components/nex/` (renomear `nex-*`→`agent-*`). Roles
  `user`/`assistant`/`loading`, kinds `text`/`audio`; aplicar o polimento do
  `ui-ux-pro-max`.
- [ ] **Step 3:** `npx tsc --noEmit`, `npx eslint src/` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): componentes de mensagem e sugestões do agente`.

## Task 3.3b — Painel de chat (consome o SSE) (G2)

**Files:**
- Create: `src/components/agent/chat-panel.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` (doc da Task 3.0d). **Obrigatório.**
- [ ] **Step 2:** Portar `nex-chat-panel` (renomear → `chat-panel`).
  Adaptações: **consome o endpoint SSE da Task 3.2** (não a Server Action
  `sendNexMessage`); processa os eventos `status`/`text`/`done`; histórico vem
  do servidor (não `localStorage`); animação/a11y do Nex mantidas; aplicar o
  polimento do `ui-ux-pro-max` (meta: "muito mais polido que o esboço do Nex").
- [ ] **Step 3:** `npx tsc --noEmit`, `npx eslint src/` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): painel de chat do agente (streaming SSE)`.

## Task 3.3c — Endpoint e componentes de áudio (G2)

**Files:**
- Create: `src/app/api/agent/transcribe/route.ts`
- Create: `src/components/agent/audio-recorder.tsx`, `audio-player.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` (doc da Task 3.0d). **Obrigatório.**
- [ ] **Step 2:** Criar `route.ts` — `POST` recebe o áudio, exige sessão
  NextAuth, chama `transcribe()` (Task 1.15), retorna o texto. Portar do
  `nexus-insights/src/app/api/nex/transcribe/route.ts`.
- [ ] **Step 3:** Portar `audio-recorder` e `audio-player` de `nex/`. Gravação
  → POST no endpoint de transcrição → injeção do texto no input do chat.
- [ ] **Step 4:** `npx tsc --noEmit`, `npx eslint src/` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): endpoint e componentes de áudio do chat`.

## Task 3.4 — Bubble onipresente

**Files:**
- Create: `src/components/agent/agent-bubble.tsx`
- Modify: layout de `(protected)` para montar a bubble

- [ ] **Step 1:** Portar `nex-bubble.tsx`. Adaptação: usar `agent-chat-panel`;
  visível a todo usuário autenticado (SPEC §8.0).
- [ ] **Step 2:** Montar a bubble no layout `src/app/(protected)/layout.tsx`.
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): bubble do agente nas telas protegidas`.

## Task 3.5 — Página dedicada `/agente`

**Files:**
- Create: `src/app/(protected)/agente/page.tsx`, `layout.tsx`
- Create: `src/components/agent/conversation-list.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` para a página de chat em tela cheia
  com lista de conversas. **Obrigatório.**
- [ ] **Step 2:** Página `/agente`: lista de conversas (`Conversation` do
  usuário, canal `in_app`), botão "nova conversa", painel de chat em tela cheia.
- [ ] **Step 3:** Adicionar o item "Agente" ao `src/components/layout/sidebar.tsx`
  (visível a todo usuário autenticado).
- [ ] **Step 4:** `npx next build` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): página dedicada do agente com lista de conversas`.

## Task 3.6 — Verificação e2e da onda 3

- [ ] **Step 1:** `npm run dev` + MCP no ar. Abrir a bubble, perguntar algo de
  estoque, ver a resposta com streaming; recarregar a página e confirmar que o
  histórico persiste; abrir `/agente`, criar nova conversa.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint src/`, `npx jest`,
  `npx next build` → PASS. **Evidência obrigatória.**
- [ ] **Step 3:** Commit — `chore(f5): verificação e2e da onda 3`.

---

# ONDA 4 — Webhook receptor + WhatsApp (F5d + F5f)

> Resultado: endpoint `/inbound` recebe do n8n, processa via fila BullMQ,
> responde nos 2 modos; credenciais Meta configuráveis.

## Task 4.1 — HMAC + contrato do payload inbound

**Files:**
- Create: `src/lib/whatsapp/hmac.ts`, `src/lib/whatsapp/inbound-payload.ts`
- Test: `src/lib/whatsapp/hmac.test.ts`

- [ ] **Step 1: Teste falhando.** `signPayload(body, secret, ts)` →
  HMAC-SHA256 hex. `verifySignature(body, secret, signature, ts, now)`: rejeita
  assinatura inválida e timestamp fora de ±5 min (anti-replay). `inboundSchema`
  (Zod) valida o payload da SPEC §6.1.3.
- [ ] **Step 2:** `npx jest hmac` → FAIL.
- [ ] **Step 3: Implementar.** `crypto.createHmac`; `inbound-payload.ts` com o
  Zod schema (`messageId, from, timestamp, type, text?, audioMediaId?`).
- [ ] **Step 4:** `npx jest hmac` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): HMAC e contrato do payload inbound`.

## Task 4.2 — Cliente da Graph API do WhatsApp Cloud

**Files:**
- Create: `src/lib/whatsapp/cloud-client.ts`
- Test: `src/lib/whatsapp/cloud-client.test.ts`

- [ ] **Step 1: Teste falhando.** `sendText(to, text)` → `POST` na Graph API
  (mock do fetch); `downloadMedia(mediaId)` → 2 fetches (URL + binário). Lê as
  credenciais de `WhatsappChannel` (decifradas).
- [ ] **Step 2:** `npx jest cloud-client` → FAIL.
- [ ] **Step 3: Implementar** conforme SPEC §6.1.1 e §6.2 modo 1.
- [ ] **Step 4:** `npx jest cloud-client` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): cliente da Graph API do WhatsApp Cloud`.

## Task 4.3 — Fila BullMQ `agent` no worker

**Files:**
- Create: `src/worker/agent/queue.ts`, `src/worker/agent/processor.ts`
- Modify: `src/worker/index.ts` (entrypoint) e `src/worker/jobs.ts` (filas) —
  registrar a fila `agent` no mesmo padrão das filas existentes (P10)
- Test: `src/worker/agent/processor.test.ts`

- [ ] **Step 1: Teste falhando.** O processor recebe um job
  `{messageId, userId, channel, type, text?, audioMediaId?, replyTo,
  channelConfig}`. Para `type=audio` (P6): baixa a mídia
  (`cloud-client.downloadMedia(audioMediaId)`) e transcreve
  (`transcribe()`) para obter o texto; para `type=text` usa `text`. Depois
  chama `getOrCreateWhatsappConversation(userId)` + `runAgent`, e despacha a
  resposta no modo configurado (`direct` → `cloud-client.sendText(replyTo,...)`;
  `n8n_webhook` → POST assinado no `outboundUrl`).
- [ ] **Step 2:** `npx jest worker/agent` → FAIL.
- [ ] **Step 3: Implementar.** Fila BullMQ `agent` no padrão de `src/worker/
  jobs.ts`; registrar o worker no entrypoint `src/worker/index.ts`. O processor
  importa `src/lib/agent/run-agent.ts`, `transcribe.ts` e
  `src/lib/whatsapp/cloud-client.ts`. Garantir que o build do worker inclui
  `src/lib/agent` (SPEC §10.2).
- [ ] **Step 4:** `npx jest worker/agent` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): fila BullMQ do agente no worker`.

## Task 4.4 — Endpoint receptor `/api/integrations/whatsapp/inbound`

**Files:**
- Create: `src/app/api/integrations/whatsapp/inbound/route.ts`
- Test: `route.test.ts`

- [ ] **Step 1: Teste falhando.** `POST`: HMAC inválido → 401; payload inválido
  → 400; `messageId` já processado → 200 no-op (idempotência); número
  desconhecido → 200 + audit `whatsapp_inbound_rejected` (não enfileira);
  acima do teto diário → resposta de limite; caso ok → grava
  `ProcessedWhatsappMessage`, enfileira job, responde 202.
- [ ] **Step 2:** `npx jest whatsapp/inbound` → FAIL.
- [ ] **Step 3: Implementar** conforme SPEC §6.1, §6.1.2, §6.1.3. Rate limit via
  `src/lib/rate-limit.ts`. Teto diário via `AppSetting`.
- [ ] **Step 4:** `npx jest whatsapp/inbound` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): endpoint receptor de WhatsApp (n8n→plataforma)`.

## Task 4.5 — Modelo e Server Actions do canal WhatsApp (credenciais Meta)

**Files:**
- Create: `src/lib/actions/whatsapp-channel.ts`
- Test: `whatsapp-channel.test.ts`

- [ ] **Step 1: Teste falhando.** `getWhatsappChannel()` (mascarado),
  `updateWhatsappChannel(data)`: cifra `apiToken`, grava `WhatsappChannel`,
  audita `whatsapp_channel_updated`, define `responseMode`. Gate: `super_admin`.
- [ ] **Step 2:** `npx jest whatsapp-channel` → FAIL.
- [ ] **Step 3: Implementar.** Cifra via `src/lib/encryption.ts`.
- [ ] **Step 4:** `npx jest whatsapp-channel` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): server actions do canal WhatsApp (credenciais Meta)`.

## Task 4.6 — Job de limpeza de idempotência

**Files:**
- Create: `src/worker/agent/cleanup.ts`
- Modify: `src/worker/index.ts` / `src/worker/jobs.ts` (cron do worker)

- [ ] **Step 1:** Job que remove `ProcessedWhatsappMessage` com `processedAt`
  > 7 dias. Registrar no cron do worker (diário), no padrão das filas/crons
  existentes em `src/worker/jobs.ts`.
- [ ] **Step 2:** `npx tsc --noEmit` → PASS.
- [ ] **Step 3:** Commit — `feat(f5): limpeza periódica da tabela de idempotência`.

## Task 4.7 — Runbook de configuração do n8n

**Files:**
- Create: `docs/runbooks/n8n-whatsapp.md`

- [ ] **Step 1:** Escrever o runbook (SPEC §6.3): como apontar o n8n para o
  endpoint `/inbound`, como assinar o HMAC (`X-Signature`/`X-Timestamp`),
  formato do payload de entrada e de saída, config do webhook de saída (modo 2).
- [ ] **Step 2:** Commit — `docs(f5): runbook de configuração do n8n para WhatsApp`.

## Task 4.8 — Verificação e2e da onda 4

**Files:**
- Create: `scripts/verify-f5-onda4.ts`

- [ ] **Step 1 (G9):** Escrever `scripts/verify-f5-onda4.ts`: monta um payload
  inbound (SPEC §6.1.3), **assina com HMAC** (`X-Signature`/`X-Timestamp`) e
  dispara `POST` contra `/api/integrations/whatsapp/inbound`. Casos: número
  cadastrado (→ 202 + job), número desconhecido (→ recusa + audit), replay do
  mesmo `messageId` (→ no-op). Roda com
  `npx tsx --env-file=.env.local scripts/verify-f5-onda4.ts`.
- [ ] **Step 2:** Worker + MCP + dev no ar. Rodar o script; conferir que o job
  processa e a resposta sai (modo 2 com webhook mockado / modo 1 se houver
  credenciais Meta). **Evidência obrigatória.**
- [ ] **Step 3:** `npx tsc --noEmit`, `npx eslint src/`, `npx jest`,
  `npx next build` → PASS.
- [ ] **Step 4:** Commit — `chore(f5): verificação e2e da onda 4`.

---

# ONDA 5 — Consumo + playground (F5c parte 2)

> Resultado: tela de consumo (8 bugs corrigidos) + playground como página.

## Task 5.1 — Queries de agregação de uso

**Files:**
- Create: `src/lib/agent/llm/usage-stats.ts`
- Test: `usage-stats.test.ts`

- [ ] **Step 1: Teste falhando.** `getUsageStats(range)`: totais, byModel,
  byProvider, byDay, byHour; **separa `totalConversations` (count de
  `Conversation`) de `totalIterations` (count de `LlmUsage`)** — BUG 8;
  `costUsd` ignora rows `costKnown=false` mas conta `unknownCount`.
  `getUsageDetails(range, filters, page)`.
- [ ] **Step 2:** `npx jest usage-stats` → FAIL.
- [ ] **Step 3: Implementar.** Portar `queries/usage-stats.ts` do Nex com as
  correções dos BUGs 5,7,8 (SPEC §4.6).
- [ ] **Step 4:** `npx jest usage-stats` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): agregações de uso de LLM (bugs de custo corrigidos)`.

## Task 5.2a — Tela de consumo: KPIs + página (G4)

**Files:**
- Create: `src/app/(protected)/agente/consumo/page.tsx`
- Create: `src/components/agent/consumo/kpi-row.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` (doc da Task 3.0d). **Obrigatório.**
- [ ] **Step 2:** Página `/agente/consumo` (gate `super_admin`/`admin`) +
  `kpi-row`: KPIs de **conversas** e **iterações** separados (BUG 8), tokens,
  custo USD/BRL; consome `getUsageStats` (Task 5.1).
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): tela de consumo — KPIs`.

## Task 5.2b — Tela de consumo: gráficos (G4)

**Files:**
- Create: `src/components/agent/consumo/usage-charts.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max`. **Obrigatório.**
- [ ] **Step 2:** Portar os gráficos do `consumo-content.tsx` do Nex (custo por
  dia/hora, donut por provider, barras por modelo) com `recharts`. Montar na
  página da Task 5.2a.
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): tela de consumo — gráficos`.

## Task 5.2c — Tela de consumo: tabela, filtros e drill-down (G4)

**Files:**
- Create: `src/components/agent/consumo/usage-table.tsx`,
  `usage-table-filters.tsx`, `usage-detail.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max`. **Obrigatório.**
- [ ] **Step 2:** Portar a tabela paginada + filtros (período/provider/modelo/
  ambiente) + drill-down do `consumo-content.tsx`. Consome `getUsageDetails`
  (Task 5.1). **Badge "preço desconhecido"** para `costKnown=false` (BUG 2);
  indicador `rateStale` (BUG 5).
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): tela de consumo — tabela e filtros`.

## Task 5.3 — Playground (página)

**Files:**
- Create: `src/app/(protected)/agente/playground/page.tsx`
- Create: `src/components/agent/playground-content.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max`. **Obrigatório.**
- [ ] **Step 2:** Portar `playground-sheet.tsx` do Nex **como página** (não
  Sheet — SPEC §8.3). Conversa de teste (`channel=playground`,
  `isPlayground=true`), "ver prompt usado". Gate `super_admin`/`admin`.
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): playground do agente`.

## Task 5.4 — Verificação e2e da onda 5

- [ ] **Step 1:** Gerar uso real (algumas perguntas), abrir `/agente/consumo`,
  conferir custo, badge de preço desconhecido, separação conversas×iterações;
  usar o playground. **Evidência obrigatória.**
- [ ] **Step 2:** `npx tsc`, `eslint`, `jest`, `next build` → PASS.
- [ ] **Step 3:** Commit — `chore(f5): verificação e2e da onda 5`.

---

# ONDA 6 — Menu Integrações (F5e)

> Resultado: menu superadmin navegável tela-a-tela com 5 categorias.

## Task 6.1 — Server Actions de API keys

**Files:**
- Create: `src/lib/actions/api-keys.ts`
- Test: `api-keys.test.ts`

- [ ] **Step 1: Teste falhando.** `createApiKey(label, scopes)`: gera a key,
  grava só o `keyHash` + `last4`, retorna a key em claro **uma vez**, audita
  `api_key_created`. `listApiKeys()`, `revokeApiKey(id)` (audit
  `api_key_revoked`). Gate `super_admin`.
- [ ] **Step 2:** `npx jest api-keys` → FAIL.
- [ ] **Step 3: Implementar** conforme SPEC §7.4.1 e §9.2 (hash, não cifra).
- [ ] **Step 4:** `npx jest api-keys` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): server actions de API keys`.

## Task 6.2 — Server Actions de webhooks

**Files:**
- Create: `src/lib/actions/webhooks.ts`
- Test: `webhooks.test.ts`

- [ ] **Step 1: Teste falhando.** CRUD de `WhatsappWebhook` (inbound/outbound):
  criar, listar, rotacionar `secret`, habilitar/desabilitar. Secret cifrado.
- [ ] **Step 2:** `npx jest webhooks` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `npx jest webhooks` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): server actions de webhooks`.

## Task 6.3 — Rota e layout do menu Integrações + gate superadmin

**Files:**
- Create: `src/app/(protected)/integracoes/layout.tsx`, `page.tsx`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` para a landing de cartões
  (grid de retângulos por categoria). **Obrigatório.**
- [ ] **Step 2:** `layout.tsx`: gate `super_admin` (redirect se não for).
  `page.tsx`: grid de 5 cartões (Canais, MCP, Webhooks, API, BI) que **navegam**
  para sub-rotas — sem modal, sem drawer (SPEC §7.2).
- [ ] **Step 3:** Adicionar "Integrações" ao `sidebar.tsx` visível só a
  `super_admin`.
- [ ] **Step 4:** `npx next build` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): menu Integrações (landing + gate superadmin)`.

## Task 6.4 — Integrações → Canais → WhatsApp

**Files:**
- Create: `src/app/(protected)/integracoes/canais/page.tsx`,
  `canais/whatsapp/page.tsx`
- Create: `src/components/integracoes/whatsapp-channel-form.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max`. **Obrigatório.**
- [ ] **Step 2:** `/integracoes/canais`: lista de canais (só WhatsApp).
  `/integracoes/canais/whatsapp`: form de credenciais Meta (§6.4 — usa as
  actions da Task 4.5), seletor de `responseMode`, status do canal, e um
  **link** para `/integracoes/webhooks` (G10 — não duplicar a UI de webhooks,
  que é a Task 6.6).
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): Integrações → Canais → WhatsApp`.

## Task 6.5 — Integrações → MCP

**Files:**
- Create: `src/app/(protected)/integracoes/mcp/page.tsx`
- Create: `src/components/integracoes/mcp-panel.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max`. **Obrigatório.**
- [ ] **Step 2:** Tela: exibe o endpoint do MCP e o `MCP_SERVICE_TOKEN`
  **mascarado, em modo leitura** (P7 — o token é variável de ambiente; a UI não
  o rotaciona). Inclui a **instrução de como rotacionar via env/Portainer**,
  status de saúde (ping ao MCP), e a **documentação de como o node Agent do n8n
  se conecta** (SPEC §7.4.1). Não mexer no contrato de auth da F4.
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): Integrações → MCP`.

## Task 6.6 — Integrações → Webhooks

**Files:**
- Create: `src/app/(protected)/integracoes/webhooks/page.tsx`
- Create: `src/components/integracoes/webhooks-content.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max`. **Obrigatório.**
- [ ] **Step 2:** Tela: lista os webhooks (inbound/outbound), permite criar,
  rotacionar secret, habilitar/desabilitar (actions da Task 6.2).
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): Integrações → Webhooks`.

## Task 6.7 — Integrações → API

**Files:**
- Create: `src/app/(protected)/integracoes/api/page.tsx`
- Create: `src/components/integracoes/api-keys-content.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max`. **Obrigatório.**
- [ ] **Step 2:** Tela: lista API keys (`last4`, escopo, status), criar (exibe a
  key uma vez num diálogo de cópia), revogar (actions da Task 6.1).
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): Integrações → API keys`.

## Task 6.8 — Integrações → BI (placeholder)

**Files:**
- Create: `src/app/(protected)/integracoes/bi/page.tsx`

- [ ] **Step 1:** Tela "em breve" — placeholder para PowerBI e outras (SPEC
  §7.3.5). Consultar `ui-ux-pro-max` para o estado vazio.
- [ ] **Step 2:** `npx next build` → PASS.
- [ ] **Step 3:** Commit — `feat(f5): Integrações → BI (placeholder)`.

## Task 6.9 — Verificação e2e da onda 6

- [ ] **Step 1:** Logar como `super_admin`: navegar por todas as 5 categorias
  (cada uma abre em tela, não modal); criar uma API key; rotacionar um secret.
  Logar como `viewer`/`manager`/`admin`: confirmar que **não veem** Integrações.
  **Evidência obrigatória.**
- [ ] **Step 2:** `npx tsc`, `eslint`, `jest`, `next build` → PASS.
- [ ] **Step 3:** Commit — `chore(f5): verificação e2e da onda 6`.

---

# ONDA 7 — RAG com pgvector (F5b parte 2)

> Resultado: pgvector ativo, KB com embeddings, busca por similaridade no prompt.

## Task 7.1 — Imagem Postgres com pgvector + extensão

**Files:**
- Modify: `docker-compose.yml`
- Create: migration `f5_pgvector`

- [ ] **Step 1:** Trocar `image: postgres:16-alpine` por
  `image: pgvector/pgvector:pg16` no `docker-compose.yml` (SPEC §10.1).
- [ ] **Step 2:** `docker compose up -d db` e confirmar que o container sobe.
- [ ] **Step 3:** Migration `f5_pgvector`: `CREATE EXTENSION IF NOT EXISTS
  vector;` + `ALTER TABLE kb_documents ADD COLUMN embedding vector(1536);`
  (SQL raw na migration — Prisma não tem tipo `vector` nativo).
- [ ] **Step 4:** `npx prisma migrate dev` aplica. `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): pgvector — imagem e extensão`.

## Task 7.2 — Geração de embeddings

**Files:**
- Create: `src/lib/agent/rag/embed.ts`
- Test: `embed.test.ts`

- [ ] **Step 1: Teste falhando.** `embed(text)` resolve a credencial de
  embedding via `AppSetting` chave `embedding_credential_id` (P5 — aponta para
  uma `LlmCredential` de provider `openai`); chama o provedor
  (`text-embedding-3-small`), retorna vetor de **1536**; rejeita modelo de
  dimensão ≠ 1536 (SPEC §4.8 — B5); sem `embedding_credential_id` configurado →
  lança `EmbeddingUnavailable` (sinaliza fallback p/ KB truncada).
- [ ] **Step 2:** `npx jest rag/embed` → FAIL.
- [ ] **Step 3: Implementar** via `fetch` (padrão dos adapters).
- [ ] **Step 4:** `npx jest rag/embed` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): geração de embeddings (1536d)`.

## Task 7.3 — Ingestão de KB + busca por similaridade

**Files:**
- Create: `src/lib/agent/rag/search.ts`, `src/lib/actions/kb.ts`
- Test: `search.test.ts`

- [ ] **Step 1: Teste falhando.** `ingestKbDocument(name, kind, text)`: gera
  embedding, grava `KbDocument` + `embedding`. `searchKb(query, topK)`: embed da
  query + `ORDER BY embedding <=> $1 LIMIT topK` (SQL raw). Sem credencial de
  embedding → `searchKb` cai no modo "texto integral truncado".
- [ ] **Step 2:** `npx jest rag/search` → FAIL.
- [ ] **Step 3: Implementar.** `<=>` é o operador de distância cosseno do
  pgvector. SQL raw via `src/lib/prisma.ts` (`$queryRaw`).
- [ ] **Step 4:** `npx jest rag/search` → PASS.
- [ ] **Step 5:** Commit — `feat(f5): ingestão e busca de KB com pgvector`.

## Task 7.4 — Integrar RAG ao `composeSystemPrompt`

**Files:**
- Modify: `src/lib/agent/prompt/compose.ts`, `src/lib/agent/run-agent.ts`

- [ ] **Step 1:** No `runAgent`, antes de compor o prompt, se a KB estiver
  habilitada e houver credencial de embedding, chamar `searchKb(userMessage,
  topK)` e passar só os trechos relevantes ao `composeSystemPrompt` (em vez do
  texto integral). Sem embedding → comportamento atual (texto truncado).
- [ ] **Step 2:** `npx jest` → PASS (atualizar testes de `compose`/`run-agent`).
- [ ] **Step 3:** Commit — `feat(f5): RAG integrado à composição de prompt`.

## Task 7.5 — UI de gestão da base de conhecimento

> A tela `/agente/configuracao` já existe (Task 3.0). Esta task **acrescenta a
> ela** a seção de KB — não recria a tela nem a config de LLM/prompt.

**Files:**
- Modify: `src/app/(protected)/agente/configuracao/page.tsx`
- Create: `src/components/agent/kb-section.tsx`, `kb-upload-dialog.tsx`,
  `kb-url-form.tsx`

- [ ] **Step 1:** Consultar `ui-ux-pro-max` (doc da Task 3.0d). **Obrigatório.**
- [ ] **Step 2:** Portar de `nexus-insights/src/components/agente-nex/` o
  `kb-section`, `kb-upload-dialog`, `kb-url-form`. Upload de doc e ingestão por
  URL chamam `ingestKbDocument` (Task 7.3). Adicionar a seção de KB à página
  `/agente/configuracao` (que já tem LLM+prompt da Task 3.0). Gate
  `super_admin`/`admin`.
- [ ] **Step 3:** `npx next build` → PASS.
- [ ] **Step 4:** Commit — `feat(f5): UI de gestão da base de conhecimento`.

## Task 7.6 — Verificação e2e da onda 7

- [ ] **Step 1:** Ingerir um doc de KB, fazer uma pergunta que dependa dele,
  confirmar que o trecho relevante entrou no prompt e a resposta usa o
  conhecimento. **Evidência obrigatória.**
- [ ] **Step 2:** `npx tsc`, `eslint`, `jest`, `next build`,
  `docker compose build` → PASS.
- [ ] **Step 3:** Commit — `chore(f5): verificação e2e da onda 7`.

---

# FECHAMENTO

## Task F.1 — Code review + UI review
- [ ] `/gsd-code-review` sobre os arquivos da F5 — corrigir achados materiais.
- [ ] `/gsd-ui-review` sobre as telas novas — corrigir achados.

## Task F.2 — Atualizar STATUS.md e abrir PR
- [ ] Atualizar `STATUS.md` (F5 completa).
- [ ] Abrir PR `feat/integracao-whatsapp` → `main` (decisão de merge é humana).

---

## Self-review (checklist do autor)

**Cobertura da SPEC:** F5a→onda 2; F5b→ondas 1 e 7; F5c→ondas 3 e 5;
F5d→onda 4; F5e→onda 6; F5f→Task 4.5+6.4. Os 8 bugs do consumo: Tasks 1.4
(2,3), 1.5 (5,6), 1.12 (1,4,7), 5.1 (8). Decisões Q1–Q7 e B1–B15 da SPEC v3
mapeadas nas tasks. Caminho 3c: Tasks 1.9 + 1.13. RAG: onda 7.

**Placeholders:** tasks de porte listam arquivo-fonte + adaptações (permitido
pela metodologia). Tasks de código novo têm o comportamento testável definido.

**Consistência de tipos:** `runAgent`, `createMcpSession`,
`mcpToolsToProviderTools`, `composeSystemPrompt`, `calculateCost` ({costUsd,
costKnown}), `getUsdBrlRate` ({rate,spread,stale}) — assinaturas usadas de forma
consistente entre tasks.

**Pendências para as reviews do plano:** granularidade de algumas tasks de
porte (3.3, 5.2, 7.5) pode precisar de decomposição maior — alvo da review #2.
