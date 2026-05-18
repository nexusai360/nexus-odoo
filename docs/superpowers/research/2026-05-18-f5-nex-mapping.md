# F5 — Mapeamento completo do Agente "Nex" do nexus-insights

> Pesquisa técnica para alimentar a SPEC da F5 (Integração WhatsApp + Agente de IA).
> Projeto-fonte: `nexus-insights` v0.49.0 — irmão do `nexus-odoo`, mesmo stack.
> Data: 2026-05-18. Acesso read-only ao código-fonte; nada foi modificado.

Todos os caminhos abaixo são relativos à raiz do `nexus-insights`
(`.../Projetos Internos/nexus-insights`).

---

## 0. Visão geral em uma frase

O "Nex" é um agente analítico in-app: uma **bubble de chat flutuante** que
responde perguntas sobre os dados do Chatwoot. Por baixo há uma **camada
multi-LLM própria** (4 provedores via `fetch` puro, sem SDKs), um **loop de
tool calling** com 10 tools que viram SQL parametrizado, um **system prompt
componível** persistido em banco, **transcrição de áudio (Whisper)**, um
**Playground** lateral e uma **tela de Consumo** que rastreia tokens/custo em
USD e BRL. Nenhuma dependência de `@anthropic-ai/sdk`, `openai` ou MCP — tudo é
HTTP cru sobre tipos canônicos internos.

Diferença estrutural relevante para o port: no `nexus-insights` o Nex consulta
o **Postgres do Chatwoot ao vivo** (read-only). No `nexus-odoo`, a decisão
canônica #2/#3 diz que o agente NÃO toca dado ao vivo e NÃO faz text-to-SQL
livre — consulta o cache via **MCP semântico** (F4). Logo, a camada de tools do
Nex (`executor.ts`) **não se porta como está**: vira chamada ao servidor MCP.

---

## 1. Arquitetura do agente — onde vive o código

O Nex está espalhado por 5 áreas. Estrutura organizada por responsabilidade:

### 1.1 Backend / orquestração — `src/lib/llm/`
| Arquivo | Papel |
|---|---|
| `agent/run-nex.ts` (266 ln) | **Orquestrador**. Loop de tool calling (máx. 5 iterações), composição do system prompt, logging de uso, extração de sugestões. |
| `agent/usage-logger.ts` (68 ln) | Persiste cada chamada em `llm_usage` (engole erros). |
| `agent/active-company-context.ts` (59 ln) | Monta bloco de contexto da empresa ativa anexado ao system prompt. |
| `types.ts` (74 ln) | Tipos canônicos: `ChatMessage`, `ToolCall`, `ChatResult`, `ProviderClient`, `LlmProvider`. |
| `get-client.ts` (31 ln) | Factory `buildLlmClient` + `getActiveLlmClient`. |
| `get-active-config.ts` (105 ln) | Lê a config LLM ativa do banco, descriptografa a chave. |
| `catalog.ts` (288 ln) | Catálogo rico de ~160 modelos (4 providers) com tier de custo, notas, URLs. |
| `pricing.ts` (219 ln) | Tabela de preços USD/1M tokens + `calculateCost()`. |
| `credentials.ts` (224 ln) | CRUD de credenciais (chaves de API) cifradas. |
| `exchange-rate.ts` (186 ln) | Cotação USD→BRL (AwesomeAPI, cache 4h, spread fixo 1.10). |
| `ensure-tables.ts` (228 ln) | Cria as tabelas `llm_*` via `CREATE TABLE IF NOT EXISTS`. |
| `providers/{openai,anthropic,gemini,openrouter}.ts` | Adapters HTTP por provedor. |
| `providers/test-connection.ts` (695 ln) | Teste de conexão + detecção de modelos reasoning. |
| `tools/definitions.ts` (189 ln) | JSON Schema das 10 tools. |
| `tools/executor.ts` (988 ln) | Executor: traduz tool call → SQL no Postgres do Chatwoot. |
| `queries/usage-stats.ts` (507 ln) | Agregações para a tela de Consumo. |
| `backfill-usage-costs.ts` (86 ln) | Backfill de `cost_usd` em rows antigas. |
| `get-nex-bubble-enabled.ts` | Resolve se a bubble aparece para o usuário (RBAC visibility). |

### 1.2 Backend específico do agente — `src/lib/nex/`
| Arquivo | Papel |
|---|---|
| `prompt.ts` (136 ln) | Leitura/escrita de `nex_settings` (server-only). Re-exporta o núcleo puro. |
| `prompt-compose.ts` (256 ln) | **Núcleo puro/isomórfico**: `IDENTITY_BASE` (texto canônico) + `composeSystemPrompt()`. |
| `kb.ts` (220 ln) | Base de conhecimento — leitura dos docs para o prompt. |
| `kb-url.ts` (190 ln) | Ingestão de KB a partir de URL (scraping com `node-html-parser`). |
| `transcribe.ts` (153 ln) | Transcrição de áudio via OpenAI (`gpt-4o-mini-transcribe` → fallback `whisper-1`). |
| `audio-storage.ts` (121 ln) | Persistência de áudios em IndexedDB no client. |
| `ensure-tables.ts` (170 ln) | Cria `nex_settings`, `nex_kb_documents`, `chatwoot_account_urls`. |

### 1.3 Server Actions — `src/lib/actions/`
- `nex-chat.ts` (139 ln) — `sendNexMessage()` (entrada principal da bubble e do
  Playground) e `testNexPromptAction()` (Playground com prompt do form).
- `nex-prompt.ts` (19 KB) — actions de configuração do prompt (`previewSystemPromptAction`, save, etc.).
- `llm-usage.ts` — actions consumidas pela tela de Consumo.

### 1.4 UI — componentes
- `src/components/nex/` — a bubble: `nex-bubble.tsx` (botão flutuante),
  `nex-chat-panel.tsx` (795 ln — painel de chat), `nex-message.tsx`,
  `suggestions-bar.tsx`, `audio-recorder.tsx`, `audio-player.tsx`.
- `src/components/agente-nex/` — telas de admin: `playground-sheet.tsx` (559 ln),
  `playground-launcher.tsx`, `prompt-config-form.tsx`, `identity-base-editor.tsx`,
  `llm-config-form.tsx`, `kb-section.tsx`, `kb-upload-dialog.tsx`,
  `kb-url-form.tsx`, `resources-toggles.tsx`, `prompt-preview-card.tsx`,
  `usd-rate-ticker.tsx`.
- `src/components/llm/` — tela de Consumo: `consumo-content.tsx` (1059 ln),
  `usage-detail-sheet.tsx`, `usage-table-filters.tsx`, `tier-badge.tsx`.

### 1.5 Páginas e rotas
- `src/app/(protected)/agente-nex/` — layout + `page.tsx`, `configuracao/`,
  `prompt/`, `chaves/`, `consumo/`.
- `src/app/api/nex/transcribe/route.ts` — endpoint REST de transcrição.
- `src/app/api/nex/calibrate/route.ts` — endpoint protegido por HMAC para
  calibração automatizada (testes batch contra dados reais).

**Observação de arquitetura:** o agente é **stateless no servidor**. Não há
persistência de conversa em banco — o histórico vive **só no `localStorage`** do
browser (chave `nex-history-v1`, máx. 40 msgs) e os áudios no IndexedDB. O único
registro persistido é `llm_usage` (uma row por iteração de LLM, sem o conteúdo
da mensagem). Isso é uma lacuna central para a F5 (ver §10).

---

## 2. Integração multi-LLM

### 2.1 Provedores e abstração
Quatro provedores, todos via `ProviderClient` (`types.ts:70-74`):
`provider`, `model`, `chat(request): Promise<ChatResult>`.

- **OpenAI** (`providers/openai.ts`) — `POST .../v1/chat/completions`.
- **Anthropic** (`providers/anthropic.ts`) — `POST api.anthropic.com/v1/messages`,
  header `anthropic-version: 2023-06-01`.
- **Gemini** (`providers/gemini.ts`) — `POST generativelanguage.googleapis.com/.../{model}:generateContent`.
- **OpenRouter** (`providers/openrouter.ts`) — `POST openrouter.ai/api/v1/chat/completions`.

**Não usa SDK algum.** Cada adapter faz `fetch` direto e converte para os tipos
canônicos. Vantagem: zero peso de dependência, controle total. Custo: cada
provedor reimplementa o mapeamento de mensagens/tools/usage (ver §10).

Cada adapter implementa três mapeadores: `mapMessages` (forma canônica →
formato do provedor — tratando o role `tool` que cada API representa
diferente), `mapTools` (JSON Schema → schema do provedor) e a leitura de
`usage`. Detalhes notáveis:
- Anthropic: `system` é campo separado; `tool` vira `tool_result` dentro de um
  `role:user`; multi-system messages são concatenadas.
- OpenAI: modelos reasoning (GPT-5.x, o1/o3) usam `max_completion_tokens` e
  **não aceitam `temperature`** — tratado em `openai.ts:111-125` (bug v0.12.0
  documentado no próprio arquivo).
- Gemini: `tool` vira `functionResponse`; assistant vira role `model`.
- OpenRouter: remove o prefixo interno `openrouter/` do model id antes de enviar.

**Mock keys:** todos os adapters detectam `isMockKey()` (chave vazia ou começa
com `MOCK`) e devolvem resposta simulada — permite dev/testes sem chave real.

### 2.2 Catálogo e pricing
- `catalog.ts` — `PROVIDER_CATALOG`: ~160 modelos com `tier` (low/medium/high/
  premium), `notes`, `released`, `apiKeyUrl`, `topUpUrl`, `allowCustomModel`.
  A UI adiciona em runtime a opção "Outro (digitar manualmente)".
- `pricing.ts` — `MODEL_PRICING`: preço USD por 1M tokens (input/output) e, para
  áudio, `perMinuteUsd` (whisper-1 a $0.006/min). `calculateCost()` retorna 0
  para modelo não mapeado (intencional, mas gera bug — ver §4).

### 2.3 Gestão de chaves de API
- Chaves vivem na tabela `llm_credentials`, **cifradas** (`encrypt()`/`decrypt()`
  AES de `@/lib/encryption`). Guarda-se `last4` em claro para exibição.
- `llm_configs` referencia uma credencial via `credential_id` e marca uma como
  `is_active`. `getActiveLlmConfig()` faz o JOIN, descriptografa e devolve a
  chave em memória; `getPublicActiveLlmConfig()` devolve versão mascarada.
- CRUD em `credentials.ts` com validações (label 1-60 chars, chave ≥10 chars,
  label única por provider, bloqueio de delete se credencial em uso).
- A chave **nunca** é serializada para o client. As tabelas são criadas sob
  demanda por `ensureLlmTables()` (o projeto não roda `prisma migrate` em prod).

---

## 3. Tela de conversa / chat

### 3.1 Componentes
- `nex-bubble.tsx` — botão flutuante (FAB) que abre o painel.
- `nex-chat-panel.tsx` (795 ln) — o painel:
  - Desktop: float bottom-right 420px × 70vh; mobile: full-screen.
  - Animação Framer Motion (entrada spring, saída ~70% mais rápida), respeita
    `prefers-reduced-motion`.
  - A11y: `role="dialog"`, `aria-modal`, Esc fecha, foco no input ao abrir.
  - Suporta texto e **áudio** (gravação → Whisper → injeta transcrição).
  - `SuggestionsBar` — sugestões clicáveis de follow-up (v0.31).
- `nex-message.tsx` — renderiza um balão (roles `user`/`assistant`/`loading`,
  kinds `text`/`audio`).

### 3.2 Streaming
**Não há streaming.** `sendNexMessage()` é uma Server Action que retorna a
resposta inteira de uma vez (`SendNexMessageResult`). A UI mostra um estado
`pending` ("Nex pensando…") e substitui pelo texto completo quando chega. Para a
F5 (chat in-app "melhorado") streaming é uma melhoria óbvia.

### 3.3 Estado e persistência do histórico
- O histórico de chat **não é persistido em banco**. Vive em:
  - `localStorage` chave `nex-history-v1`, máx. 40 mensagens (`nex-chat-panel.tsx:95-96`).
  - Áudios binários: **IndexedDB** via `audio-storage.ts` (re-hidratados no reload).
- A cada envio, a UI monta o array `ChatMessage[]` filtrando só `user`/`assistant`
  do estado local e manda para a action — **o servidor não tem memória**.
- **Modelos Prisma envolvidos: nenhum para o histórico.** Os únicos modelos
  tocados pelo chat são `LlmUsage` (registro de uso) e `LlmConfig`/`LlmCredential`
  (config). Conversas não existem como entidade. **Esta é a maior lacuna a
  resolver no port** — a F5 exige log de conversas em Postgres relacional +
  cruzamento número-WhatsApp → usuário.

---

## 4. Tela de consumo / relatórios de tokens

### 4.1 Como rastreia
- `usage-logger.ts` insere **uma row por iteração de LLM** em `llm_usage`. O
  `run-nex.ts:199` chama `logUsage` dentro do loop — uma chamada de tool calling
  com 3 idas ao modelo gera 3 rows. Cada row guarda: provider, model,
  tokens_input/output, cost_usd, cost_brl, usd_to_brl_rate, prompt_chars,
  response_chars, user_id, duration_ms, error_message, is_playground.
- A transcrição de áudio também loga (`api/nex/transcribe/route.ts:48`), com
  provider `openai` e model `whisper-1` ou `gpt-4o-mini-transcribe`.
- `queries/usage-stats.ts` agrega: `getUsageStats` (totais, byModel, byDay,
  byProvider, byHour), `getUsageDetails` (lista paginada + totals server-side),
  `getDistinctProvidersInRange`, `getDistinctModelsInRange`, `getSystemCreatedAt`.
- UI em `consumo-content.tsx` (1059 ln): KPIs, gráfico de custo por dia/hora,
  donut por provider, barras por modelo, tabela paginada com drill-down,
  filtros de período/provider/modelo/ambiente (Bubble vs Playground).

### 4.2 Modelos Prisma
`LlmUsage` (schema linhas 212-231), `LlmConfig` (183-195), `LlmCredential`
(197-210). Schema completo no §8.

### 4.3 BUGS e pontos suspeitos identificados

**BUG 1 — `prompt_chars` ≠ tokens de input reais, e a coluna do dashboard
mente.** Em `run-nex.ts:205`, `promptChars` recebe
`JSON.stringify(args.messages).length` **apenas na iteração 0** (zero nas
seguintes). Mas isso é o tamanho do histórico do usuário — **não inclui o system
prompt** (que pode ter 30 KB de KB). Já `tokensInput` vem do provedor e inclui
TUDO (system + KB + tools + histórico). Logo `prompt_chars` e `tokens_input`
medem coisas diferentes; quem olhar a tela achando que "chars ≈ tokens" se
engana. Em chamadas de tool calling, da 2ª iteração em diante `prompt_chars=0`
mesmo havendo input enorme.

**BUG 2 — custo zero silencioso para modelos novos/custom.** `calculateCost()`
(`pricing.ts:146-147`) retorna `0` quando o modelo não está em `MODEL_PRICING`.
O catálogo (`catalog.ts`) tem ~160 modelos; `MODEL_PRICING` tem ~40. Qualquer
modelo do catálogo fora dessa lista (a maioria dos OpenRouter, todos os Qwen/
Grok/DeepSeek/Llama, Claude 4.6/4.7 com ID sem sufixo, etc.) é cobrado **como
zero**. O comentário no topo do arquivo admite isso ("comportamento
intencional"), mas o efeito prático é uma tela de Consumo que **subnotifica
custo** sem alarde. A tela exibe "—" só para BRL nulo, não sinaliza "preço
desconhecido".

**BUG 3 — descasamento de IDs entre catálogo e pricing.** O catálogo lista
`claude-opus-4-7` e `claude-sonnet-4-7`; o `MODEL_PRICING` só tem
`claude-opus-4-7-20250624`, `claude-sonnet-4.7`, `claude-sonnet-4-7-20250624`
(três grafias). Se o usuário selecionar `claude-opus-4-7` do catálogo, o custo
cai no BUG 2 (zero). Mesma incoerência: catálogo usa `claude-haiku-4-5-20251001`,
pricing usa `claude-haiku-4-5`. `PROVIDER_MODELS` em `pricing.ts:165` é uma
terceira lista, divergente das outras duas.

**BUG 4 — `prompt_chars`/`response_chars` são `NOT NULL` na criação da tabela
mas tratados como nullable na query.** `ensure-tables.ts:53-54` cria as colunas
`NOT NULL`; `usage-stats.ts:275-280` e a UI tratam `promptChars`/`responseChars`
como `number | null`. Inconsistente — não quebra, mas indica modelagem incerta.

**BUG 5 — custo BRL pode ficar `NULL` e some das somas.** Se `getUsdBrlRate()`
falhar no momento do INSERT, `cost_brl` e `usd_to_brl_rate` ficam `NULL`
(`usage-logger.ts:38-40`). As agregações usam `COALESCE(SUM(cost_brl),0)`, então
essas rows **contribuem 0 para o total em BRL** enquanto o custo USD existe — o
total BRL fica subnotificado e diverge do USD × cotação. Não há job de backfill
de `cost_brl` (só existe `backfill-usage-costs.ts` para `cost_usd`).

**BUG 6 — spread cambial hardcoded.** `exchange-rate.ts:16` fixa
`FIXED_SPREAD = 1.10`; `setCardSpread()` virou no-op (v0.31). Rows antigas foram
gravadas com spreads diferentes (o comentário cita 1.40+ causando ">R$6/USD").
O histórico de `cost_brl` é, portanto, **inconsistente entre épocas** — somar
tudo mistura spreads. A tela não distingue.

**BUG 7 — `is_playground` retroativo é sempre `false`.** Coluna adicionada em
v0.31 com default `false` (`ensure-tables.ts:106-109`). O filtro "Ambiente" da
tela classifica TODA chamada pré-v0.31 como "Agente Nex" mesmo que tenha sido
Playground — impossível reconstruir. Cosmético, mas o filtro engana em dados
históricos.

**BUG 8 — contagem de "chamadas" não é contagem de conversas.** `totalCalls` =
`COUNT(*)` de `llm_usage`. Como há uma row por iteração, uma única pergunta do
usuário que dispare tool calling conta como 2-5 "chamadas". Um KPI rotulado
"Total de chamadas" que na verdade é "iterações de LLM" induz a leitura errada
de volume de uso. O comentário em `run-nex.ts:192-194` confirma que isso é
intencional ("alinha com a contagem do dashboard do provider"), mas o rótulo da
UI não explica.

Nenhum `TODO`/`FIXME` literal foi encontrado no código do agente — os problemas
acima são deduzidos da lógica, não de marcadores.

---

## 5. Playground

`playground-sheet.tsx` (559 ln) + `playground-launcher.tsx`. É um **Sheet
lateral** (480px) acessível pelos admins na tela de configuração do agente.

O que faz:
- Conversa de teste com o Nex sem afetar a bubble do usuário final.
- Histórico **efêmero** (máx. 20 msgs FIFO, sem `localStorage`, perde no unmount).
- Header expõe provider + modelo ativos, "Limpar histórico" e "Ver prompt usado"
  (Dialog que mostra o system prompt composto via `previewSystemPromptAction`).
- Suporta áudio (Whisper) quando o provider ativo é OpenAI.
- Chama `sendNexMessage(history, { isPlayground: true })` — **mesma action da
  bubble**, marcando `is_playground=true` em `llm_usage` (conta custo, separado
  no filtro de Consumo).
- Decisão de design registrada no comentário (`playground-sheet.tsx:159-169`): a
  v0.28 trocou `testNexPromptAction` (prompt do form, sem contexto) por
  `sendNexMessage` (prompt do DB, com histórico) — o Playground deixou de testar
  "prompt em edição não salvo". A action `testNexPromptAction` ainda existe em
  `nex-chat.ts:84` mas não é mais chamada pelo Sheet.

---

## 6. Gestão de prompt

O system prompt é **componível e persistido em banco** (`nex_settings`, row
singleton `id='global'`).

### 6.1 Composição — `prompt-compose.ts`
`composeSystemPrompt(cfg, kbDocs, accountUrls)` monta o prompt final:
1. **`advancedOverride`** — se preenchido, retorna SOMENTE ele (modo "prompt
   cru", ignora todo o resto).
2. Caso contrário: `identityBase` (override do DB) **ou** a constante
   `IDENTITY_BASE` hardcoded (texto canônico de ~100 linhas com postura,
   identidade, mapeamento de negócio Matrix, guia de seleção de ferramenta,
   semântica de período, formato de resposta).
3. `+ [PERSONALIDADE]` `+ [TOM]` `+ [GUARDRAILS]` (configuráveis).
4. `+ [BASE DE CONHECIMENTO]` — docs da KB, com budget de 30 KB e truncagem.
5. `+ ## URLs públicas das contas` — para deep-links.
6. `+ ## Terminologia` — mapa termo→significado (v0.31).
7. `+ ## Sugestões clicáveis` — instrução do formato `[[suggestions]]:a|b|c`.

O `run-nex.ts:146-153` ainda concatena, em runtime, o
`buildActiveCompanyContext()` (empresa/role do usuário) ao final.

### 6.2 Persistência — `prompt.ts` + `nex_settings`
Campos: `identity_base`, `personality`, `tone`, `guardrails` (JSONB),
`advanced_override`, `audio_input_enabled`, `kb_enabled`, `terminology` (JSONB),
`suggestions_enabled`. Limites: personality/tone 500 chars, guardrail 300 chars
(máx. 20), prompt 50 KB, KB total 30 KB.

`ensure-tables.ts` faz **seeds idempotentes** (flags `seeded_*_at`) com defaults
específicos da Matrix — personalidade, tom, guardrails, terminologia
("estados→inboxes", "colaboradores→agentes"...).

### 6.3 UI de configuração
`identity-base-editor.tsx`, `prompt-config-form.tsx`, `prompt-preview-card.tsx`,
`resources-toggles.tsx` (toggles de KB/áudio/sugestões). O Playground tem o "Ver
prompt usado".

**Para o port:** o `IDENTITY_BASE` é 100% específico do Chatwoot/atendimento —
**reescrever inteiro** para o domínio Odoo (estoque/financeiro/fiscal). A
estrutura de composição (`composeSystemPrompt`) é genérica e se aproveita.

---

## 7. Tool calling

O Nex **faz tool calling** (function calling nativo dos provedores). **Não usa
MCP.**

- `run-nex.ts:180-257` — loop: chama `client.chat({messages, tools: NEX_TOOLS})`;
  se vier `toolCalls`, executa cada uma via `executeTool()`, anexa o resultado
  como `role:"tool"` e repete. Máx. 5 iterações (`MAX_ITERATIONS`); estourou →
  erro "agente em loop".
- `tools/definitions.ts` — 10 tools em JSON Schema: `query_conversations`,
  `query_messages`, `query_users`, `query_contacts`, `aggregate_conversations`,
  `get_top_agents`, `get_dashboard_summary`, `get_active_company`,
  `get_integrations_status`, `get_nex_config_summary`.
- `tools/executor.ts` (988 ln) — cada tool vira **SQL parametrizado** rodado no
  Postgres do Chatwoot (`chatwootQuery`, usuário read-only, connection limit 5).
  Toda query força `account_id` (multi-tenant). Há gating de visibilidade
  (`excludeMatrixIA`) e de role (`platformRole`).
- A resposta final pode trazer o sufixo `[[suggestions]]:a|b|c`, extraído por
  `extractSuggestions()` (`run-nex.ts:54-68`, regex ancorada em início de linha).

**Implicação direta para o port:** este modelo (tool = SQL direto, agente toca o
banco operacional ao vivo) **contraria as decisões canônicas #2 e #3** do
`nexus-odoo`. No nexus-odoo o agente da F5 deve chamar o **servidor MCP** da F4
(tools semânticas validadas), não executar SQL. O loop de tool calling de
`run-nex.ts` se aproveita quase inteiro; o que muda é o `executeTool` — em vez
de SQL, vira chamada ao MCP via `@modelcontextprotocol/sdk` (cliente) ou ao node
Agent do n8n. O catálogo `NEX_TOOLS` é descartado (as tools passam a vir do MCP).

---

## 8. Modelos Prisma relevantes

```prisma
model LlmConfig {
  id              String   @id @default(uuid()) @db.Uuid
  provider        String
  model           String
  encryptedApiKey String?  @map("encrypted_api_key")   // legado; chave migrou p/ LlmCredential
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  createdById     String?  @map("created_by_id") @db.Uuid
  credentialId    String?  @map("credential_id") @db.Uuid
  @@map("llm_configs")
}

model LlmCredential {
  id              String   @id @default(uuid()) @db.Uuid
  provider        String
  label           String
  encryptedApiKey String   @map("encrypted_api_key")   // AES-cifrada
  last4           String
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  createdById     String?  @map("created_by_id") @db.Uuid
  @@unique([provider, label], name: "llm_credentials_provider_label_idx")
  @@index([provider, updatedAt(sort: Desc)], name: "llm_credentials_provider_updated_idx")
  @@map("llm_credentials")
}

model LlmUsage {
  id            String   @id @default(uuid()) @db.Uuid
  provider      String
  model         String
  tokensInput   Int      @map("tokens_input")
  tokensOutput  Int      @map("tokens_output")
  costUsd       Decimal  @map("cost_usd") @db.Decimal(10, 6)
  promptChars   Int      @map("prompt_chars")
  responseChars Int      @map("response_chars")
  userId        String?  @map("user_id") @db.Uuid
  durationMs    Int?     @map("duration_ms")
  errorMessage  String?  @map("error_message")
  costBrl       Decimal? @map("cost_brl") @db.Decimal(12, 6)
  usdToBrlRate  Decimal? @map("usd_to_brl_rate") @db.Decimal(10, 4)
  createdAt     DateTime @default(now()) @map("created_at")
  @@index([createdAt])
  @@index([provider, model, createdAt])
  @@map("llm_usage")
  // NOTA: a coluna is_playground (BOOLEAN, default false) existe na tabela
  // física (ensure-tables.ts v0.31) mas NÃO está declarada neste model Prisma.
}

model NexSettings {           // singleton id="global"
  id                String    @id @default("global")
  personality       String    @default("")
  tone              String    @default("")
  guardrails        Json      @default("[]")
  advancedOverride  String?   @map("advanced_override")
  audioInputEnabled Boolean   @default(false) @map("audio_input_enabled")
  kbEnabled         Boolean   @default(true) @map("kb_enabled")
  seededDefaultsAt  DateTime? @map("seeded_defaults_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  updatedById       String?   @map("updated_by_id") @db.Uuid
  @@map("nex_settings")
  // NOTA: identity_base, terminology, suggestions_enabled, seeded_v2_at,
  // seeded_v3_at existem na tabela física mas NÃO no schema Prisma — drift.
}

enum NexKbKind { PDF  TXT  URL }

model NexKbDocument {
  id            String    @id @default(uuid()) @db.Uuid
  name          String
  kind          NexKbKind @default(PDF)
  sourceUrl     String?   @map("source_url")
  mimeType      String    @map("mime_type")
  fileSize      Int       @map("file_size")
  charCount     Int       @map("char_count")
  extractedText String    @map("extracted_text")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  uploadedById  String?   @map("uploaded_by_id") @db.Uuid
  @@index([createdAt(sort: Desc)])
  @@map("nex_kb_documents")
}
```

**Drift Prisma × tabela física relevante:** o projeto cria/altera tabelas por
`ensure-tables.ts` (`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF
NOT EXISTS`), **não por migrations**. Resultado: o `schema.prisma` está
desatualizado — faltam `llm_usage.is_playground` e
`nex_settings.{identity_base, terminology, suggestions_enabled, seeded_v2_at,
seeded_v3_at}`. Quem ler só o schema Prisma terá o modelo errado. **Não há
modelo de Conversa/Mensagem** — confirmado.

---

## 9. Pacotes npm

O agente **não tem dependências de IA dedicadas**. Tudo é `fetch` nativo. Os
pacotes do `package.json` (v0.49.0) que o agente efetivamente usa:

| Pacote | Uso no agente |
|---|---|
| `@prisma/client` / `prisma` ^7.6 + `@prisma/adapter-pg` ^7.6 | Modelos LLM/Nex (na prática o agente usa mais SQL cru via `pg`). |
| `pg` ^8.20 | Pool de conexão (`pgPool`, `chatwootQuery`) — todas as queries de tools e usage. |
| `zod` ^4.3 | Validação de inputs nas actions. |
| `framer-motion` ^12.38 | Animações da bubble e do Playground. |
| `lucide-react` ^1.7 | Ícones (Sparkles, Mic, Send...). |
| `sonner` ^2.0 | Toasts de erro. |
| `recharts` ^3.8 | Gráficos da tela de Consumo. |
| `node-html-parser` ^7.1 | Scraping de KB a partir de URL (`kb-url.ts`). |
| `pdf-parse` ^2.4 | Extração de texto de PDFs da KB. |
| `date-fns` / `date-fns-tz` | Períodos e fusos na tela de Consumo. |
| `next` 16.2 / `react` 19.2 / `next-auth` ^5 beta | Stack base — Server Actions, auth. |

**Ausências notáveis (de propósito):** sem `@anthropic-ai/sdk`, sem `openai`,
sem `@google/generative-ai`, sem `@modelcontextprotocol/sdk`, sem `ai` (Vercel
AI SDK), sem `pgvector`. Para a F5, `@modelcontextprotocol/sdk` (cliente MCP) e
`pgvector` entram novos.

---

## 10. Qualidade — o que aproveitar, o que refazer

### Bem feito (portar com pouca mudança)
- **Camada de provedores canônica** (`types.ts` + 4 adapters) — desenho limpo,
  multi-LLM real, mock keys para dev. Excelente base; só revisar o mapeamento de
  `tool` por provedor.
- **Loop de tool calling** (`run-nex.ts`) — cap de iterações, acúmulo de usage,
  `debugMode`, `promptOverride`, `isPlayground`. Estrutura sólida.
- **Composição de prompt** (`composeSystemPrompt`) — modular, com override,
  budget de KB, terminologia. Genérica o suficiente.
- **Credenciais cifradas** — `encrypt`/`decrypt`, `last4`, validações, bloqueio
  de delete em uso. Direto ao ponto.
- **UI da bubble e do Playground** — polida, acessível, animada, com áudio. O
  `ui-ux-pro-max` vai querer revisar, mas a base de UX é boa.
- **Tela de Consumo** — rica em filtros, drill-down, agregações server-side.

### Esboço / incompleto / frágil
- **Sem persistência de conversa** — histórico só em `localStorage`. Para a F5
  (log de conversas em Postgres, cruzamento WhatsApp→usuário, RAG com pgvector)
  isso precisa ser **construído do zero**: modelos `Conversation`/`Message`,
  retenção, e o servidor passa a ter memória.
- **Sem streaming** — resposta vem inteira. Chat in-app "melhorado" pede SSE/
  streaming.
- **Tool layer acoplada a SQL Chatwoot** (`executor.ts`) — **descartar**. No
  nexus-odoo o agente chama o MCP da F4, não executa SQL. Viola decisões #2/#3.
- **Drift Prisma × banco** — `ensure-tables.ts` em vez de migrations. No
  nexus-odoo, manter Prisma como fonte única (já é a prática lá).
- **Bugs de custo/token na tela de Consumo** — ver §4 (BUGs 1-8). Ao portar:
  unificar catálogo+pricing numa fonte só, sinalizar "preço desconhecido" em vez
  de 0 silencioso, separar "conversas" de "iterações de LLM", normalizar
  `cost_brl` (recalcular sob cotação versionada), declarar `is_playground` no
  schema.
- **`IDENTITY_BASE` 100% Chatwoot** — reescrever para o domínio Odoo.
- **Sem RBAC de 7 camadas no agente** — o Nex tem gating simples
  (`excludeMatrixIA`, `platformRole`). A F5/F4 exige o RBAC estrutural de 7
  camadas (decisão #6).

### A acrescentar na F5 (não existe no Nex)
- Integração WhatsApp via n8n (Meta→n8n→plataforma; resposta direta ou webhook).
- Cadastro de número(s) de WhatsApp no usuário + cruzamento número→usuário→acesso.
- Menu "Integrações" (superadmin) — Canais/WhatsApp, MCP, Webhooks, API, BI.
- MCP consumível de fora (node Agent do n8n).
- Log de conversas em Postgres relacional + `pgvector` para RAG.
- Cliente MCP (`@modelcontextprotocol/sdk`) substituindo o tool layer SQL.

---

## 11. Recomendações para o port (nexus-odoo F5)

1. **Portar a camada de provedores quase intacta.** `types.ts` + os 4 adapters +
   `get-client.ts` + `catalog.ts` + `credentials.ts` + `get-active-config.ts` —
   é o ativo mais reaproveitável. Trocar só strings de branding.

2. **Portar o orquestrador, trocar a fonte das tools.** Manter o loop de
   `run-nex.ts` (cap de iterações, acúmulo de usage, debug, suggestions). Em vez
   de `NEX_TOOLS` + `executeTool` (SQL Chatwoot), o agente:
   - obtém o catálogo de tools do **servidor MCP da F4** (já filtrado por RBAC);
   - executa tool calls chamando o MCP (cliente `@modelcontextprotocol/sdk` com
     transporte Streamable HTTP) — nunca SQL direto.
   Isso honra as decisões canônicas #2, #3, #5 e #10. **Descartar `tools/`
   inteiro do Nex.**

3. **Construir persistência de conversa do zero.** Modelos Prisma novos
   (`Conversation`, `Message`, índices por usuário/canal/data), retenção, e o
   servidor passa a manter contexto. Necessário para WhatsApp (stateless do MCP,
   stateful da plataforma — ver decisão #10). Adicionar `pgvector` para RAG.

4. **Adicionar streaming** ao chat in-app (SSE / `ReadableStream`) — o `nexus-
   insights` já tem infra SSE (`src/app/api/events/route.ts`).

5. **Corrigir os 8 bugs da tela de Consumo no port** (§4). Prioritários: fonte
   única catálogo+pricing (mata BUGs 2 e 3); sinalização explícita de "preço
   desconhecido"; recálculo/versionamento de `cost_brl` (BUGs 5 e 6); separar
   KPI "conversas" de "iterações" (BUG 8); declarar `is_playground` no Prisma.

6. **Reescrever o `IDENTITY_BASE`** para o domínio Odoo (estoque, financeiro,
   fiscal, comercial), mantendo a estrutura de `composeSystemPrompt` e o esquema
   de `nex_settings`.

7. **Substituir `ensure-tables.ts` por migrations Prisma.** No nexus-odoo o
   Prisma é a fonte única do schema (`prisma/` compartilhado) — não repetir o
   padrão `CREATE TABLE IF NOT EXISTS` que gerou o drift.

8. **Trazer o RBAC de 7 camadas** (decisão #6) — o gating simples do Nex
   (`excludeMatrixIA`/`platformRole`) não basta. A identidade que chega ao MCP é
   sempre o `userId` da plataforma; o número de WhatsApp é resolvido para
   usuário **antes** e nunca chega ao MCP (decisão #10).

9. **Aproveitar a UI da bubble e do Playground** como ponto de partida do chat
   in-app "melhorado", submetendo ao `ui-ux-pro-max` antes de qualquer tela.

10. **Manter a transcrição de áudio opcional** — útil no WhatsApp (notas de voz).
    O `transcribe.ts` (OpenAI Whisper / gpt-4o-mini-transcribe) porta direto;
    revisar o gating "só OpenAi".

---

## Anexo — índice rápido de arquivos-fonte

- Orquestrador: `src/lib/llm/agent/run-nex.ts`
- Tipos canônicos: `src/lib/llm/types.ts`
- Adapters: `src/lib/llm/providers/{openai,anthropic,gemini,openrouter}.ts`
- Tools: `src/lib/llm/tools/{definitions,executor}.ts`
- Prompt: `src/lib/nex/{prompt,prompt-compose}.ts`
- Consumo (queries): `src/lib/llm/queries/usage-stats.ts`
- Consumo (UI): `src/components/llm/consumo-content.tsx`
- Pricing/catálogo: `src/lib/llm/{pricing,catalog}.ts`
- Câmbio: `src/lib/llm/exchange-rate.ts`
- Logger de uso: `src/lib/llm/agent/usage-logger.ts`
- Bubble: `src/components/nex/nex-chat-panel.tsx`
- Playground: `src/components/agente-nex/playground-sheet.tsx`
- Server Action: `src/lib/actions/nex-chat.ts`
- Transcrição: `src/lib/nex/transcribe.ts` + `src/app/api/nex/transcribe/route.ts`
- Schema: `prisma/schema.prisma` (linhas 183-269)
- Tabelas dinâmicas: `src/lib/llm/ensure-tables.ts`, `src/lib/nex/ensure-tables.ts`
