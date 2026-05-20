# F5 — Integração WhatsApp + Agente de IA — SPEC

> **Versão:** v3 (2026-05-18) — **versão final, vai para o PLAN.**
> Ciclo: v1 → review #1 → v2 → review #2 → **v3**.
>
> **Mudanças v2→v3** (review `reviews/2026-05-18-f5-spec-review-2.md`): resolvidos
> B1–B9 e decididos B10–B15. Principais: ciclo de vida da sessão MCP por
> invocação (§4.5); `runAgent` roda no Next (in-app) ou no worker (WhatsApp),
> nunca o in-app pela fila (§3.2); agrupamento de conversa corrigido por canal —
> auto só no WhatsApp, explícito no in-app (§9.1); playground persiste conversa
> (§9.1); dimensão de embedding travada a modelos de 1536 (§4.8); teste de drift
> da referência de schema 3c (§4.5.2); contrato do payload inbound definido
> (§6.1); guard de tamanho de resultado de tool (§4.3); teto diário de mensagens
> por usuário (§6.1.2).
>
> _Histórico v1→v2 abaixo._
>
> **Mudanças v1→v2** (review `reviews/2026-05-18-f5-spec-review-1.md`):
> **Base:** brainstorm travado em `specs/2026-05-18-f5-whatsapp-agente-design.md`
> e pesquisa `research/2026-05-18-f5-nex-mapping.md`.
> **Modo:** autônomo desde o início (`CLAUDE.md §6`). Escopo entregue por
> completo, faseado em F5a–F5f.
>
> **Mudanças v1→v2** (review `reviews/2026-05-18-f5-spec-review-1.md`):
> resolvidos A1–A14 e fechadas Q1–Q7. Principais: adaptador de schema de tool
> MCP→provedor (§4.5.1); fonte do schema para o Caminho 3c (§4.5.2); separação
> API keys × service token do MCP (§7.4.1); `runAgent` carrega histórico (§4.3);
> streaming reespecificado (§8.1); download de mídia de áudio do WhatsApp
> (§6.1.1); RBAC do chat (§8.0); rate limit + anti-replay no inbound (§6.1.2);
> retenção de idempotência (§9.1); dependência do worker (§10.2); imagem
> pgvector fixada (§10.1). Premissas verificadas: `src/lib/encryption.ts` e
> `src/lib/rate-limit.ts` existem; imagem atual é `postgres:16-alpine`; a F4
> **não** expõe tool de schema — o Caminho 3c recebe só `{ sql }`.

---

## 0. Resumo executivo

A F5 dá "rosto" ao MCP semântico da F4. Entrega um **agente de IA** que responde
perguntas de negócio por dois canais — **WhatsApp** (via n8n) e **chat in-app** —
sempre consultando o cache pelo **MCP da F4** (nunca SQL livre, nunca Odoo ao
vivo). Acrescenta a infraestrutura ao redor: persistência de conversas,
multi-LLM, gestão de prompt, tela de consumo de tokens, playground, cadastro de
números de WhatsApp por usuário, e um menu **Integrações** (superadmin) que
expõe Canais, MCP, Webhooks, API keys e BI.

A F5 **não** reabre decisões da F4: o MCP continua stateless, recebe sempre o
`userId` da plataforma, e o número de WhatsApp nunca chega ao MCP. A statefulness
(memória de conversa, cruzamento número→usuário) vive na **plataforma** (`app/`).

---

## 1. Contexto e restrições herdadas

### 1.1 O que a F4 já entregou (consumido pela F5)
- Servidor MCP em `mcp/` — `@modelcontextprotocol/sdk`, transporte **Streamable
  HTTP** na porta 3100, autenticação por **service token** + `userId` por sessão
  (`mcp/auth/`), 33 tools no catálogo (`mcp/catalog/`), RBAC estrutural,
  `McpAuditLog`, Caminho 3 (3a/3b/3c).
- Contrato de identidade: o MCP recebe um service token (servidor↔servidor) e um
  `userId` que identifica o usuário-fim; o catálogo é filtrado por esse `userId`.

### 1.2 Decisões canônicas que a F5 herda (não rediscutir)
- **#2** Sem fallback JSON-RPC. O agente nunca toca o Odoo.
- **#3** O agente consulta via **tools semânticas do MCP**, não text-to-SQL livre.
  O Caminho 3c (`bi_consulta_avancada`) recebe SQL pronto — o **text-to-SQL é
  responsabilidade do agente da F5** (gerar o SQL), o MCP só executa.
- **#6** RBAC estrutural em 7 camadas.
- **#10** MCP stateless; F4 ≠ F5; WhatsApp/conversas/personalização/banco vetorial
  são F5; o número de WhatsApp **nunca** chega ao MCP — é resolvido para `userId`
  antes.

### 1.3 Stack disponível (`package.json` do nexus-odoo)
Next.js 16 (App Router), TypeScript, Tailwind v4, base-ui, NextAuth v5, Prisma v7
(`@prisma/adapter-pg`), Postgres, Redis + BullMQ, `@modelcontextprotocol/sdk`
(hoje só no `mcp/`), `recharts`, `framer-motion`, `zod`, `nanoid`, `sonner`.
**Entram novos na F5:** `pgvector` (extensão Postgres + coluna `vector`).
Provedores de LLM: `fetch` puro, sem SDK (padrão herdado do Nex — ver §4.2).

### 1.4 O agente "Nex" do nexus-insights (fonte do port)
Mapeado em `research/2026-05-18-f5-nex-mapping.md`. Resumo do que se aproveita e
do que se descarta:
- **Aproveitar (port quase intacto):** camada de provedores multi-LLM
  (`types.ts` + 4 adapters OpenAI/Anthropic/Gemini/OpenRouter via `fetch`),
  factory de cliente, catálogo de modelos, credenciais cifradas, loop de tool
  calling do orquestrador, composição de prompt (`composeSystemPrompt`), UI da
  bubble e do playground, tela de consumo.
- **Descartar:** todo o `tools/` do Nex (tool = SQL direto no Chatwoot — viola
  #2/#3). No nexus-odoo as tools **vêm do MCP da F4**.
- **Construir do zero:** persistência de conversa (o Nex só guarda em
  `localStorage`), streaming, RAG com `pgvector`, cruzamento WhatsApp→usuário.
- **Corrigir no port:** os 8 bugs da tela de consumo (§4.6), o drift Prisma (usar
  migrations, nunca `ensure-tables.ts`), reescrever o `IDENTITY_BASE` para o
  domínio Odoo.

---

## 2. Objetivos e não-objetivos

### 2.1 Objetivos (o que a F5 entrega)
1. Agente de IA respondendo perguntas de negócio por **WhatsApp** e por **chat
   in-app**, com a mesma lógica de agente nos dois canais.
2. Persistência relacional de **conversas e mensagens** em Postgres.
3. Camada **multi-LLM** com gestão de credenciais cifradas e modelo selecionável.
4. **Gestão de prompt** do agente (identidade, personalidade, tom, guardrails).
5. Agente que **chama o MCP da F4** como cliente (`@modelcontextprotocol/sdk`),
   incluindo o Caminho 3c (agente gera o SQL).
6. Cadastro de **número(s) de WhatsApp** por usuário + cruzamento
   número→usuário→acesso.
7. **Endpoint webhook receptor** (n8n→plataforma) + resposta nos **2 modos**
   (plataforma responde direto à API do WhatsApp Cloud, ou devolve para um
   webhook do n8n).
8. Menu **Integrações** (superadmin only) — área navegável tela-a-tela com
   Canais/WhatsApp, MCP, Webhooks, API keys, BI (placeholder).
9. Credenciais da **Meta** (WhatsApp Cloud) configuráveis na plataforma.
10. **Tela de consumo** de tokens/custo (port corrigido) + **playground**.
11. **RAG com `pgvector`** para a base de conhecimento do agente.

### 2.2 Não-objetivos (fora da F5)
- Construtor in-app de relatórios — é a **F6**.
- Montar fluxos dentro do n8n pelo usuário — a F5 entrega o endpoint e a
  **orientação de configuração**, não o fluxo n8n.
- Novas tools de negócio no MCP — o catálogo da F4 (33 tools) é o que há; lacunas
  viram `registrar_lacuna` (Caminho 3a).
- Suporte a canais além do WhatsApp (Telegram, etc.) — a arquitetura de Canais
  deve ser extensível, mas só o WhatsApp é implementado.

---

## 3. Arquitetura da F5

```
┌──────────┐  webhook   ┌──────────────────────────────────────┐
│  Meta    │──────────▶ │  n8n do usuário (triagem 1ª linha)    │
│ WhatsApp │            └───────────────┬──────────────────────┘
│  Cloud   │ ◀── modo 1 (resposta)      │ replica evento autorizado
└──────────┘            ▲               ▼
                        │   ┌──────────────────────────────────┐
        modo 2 (webhook)│   │  POST /api/integrations/whatsapp │  ← endpoint receptor
        nós→n8n ────────┘   │       /inbound  (HMAC)            │
                            └───────────────┬──────────────────┘
                                            ▼
                            ┌──────────────────────────────────┐
                            │  Núcleo do agente (src/lib/agent) │
                            │  multi-LLM · prompt · loop tools  │
                            │  ↕ persiste Conversation/Message  │
                            └───────┬───────────────┬──────────┘
                  cliente MCP       │               │  chat in-app (SSE)
                  (service token +  ▼               ▼
                   userId)   ┌────────────┐  ┌────────────────┐
                             │ MCP F4     │  │ Bubble / página │
                             │ (porta 3100)│  │  de chat        │
                             └────────────┘  └────────────────┘
```

### 3.1 Onde o código vive (nexus-odoo)
- `src/lib/agent/` — núcleo do agente: orquestrador, providers multi-LLM,
  prompt, cliente MCP, logging de uso.
- `src/lib/whatsapp/` — cliente da API do WhatsApp Cloud, resolução
  número→usuário, verificação de HMAC.
- `src/app/api/integrations/whatsapp/inbound/route.ts` — endpoint receptor.
- `src/app/api/agent/stream/route.ts` — streaming SSE do chat in-app.
- `src/app/(protected)/agente/` — chat in-app, consumo, playground, config do
  agente.
- `src/app/(protected)/integracoes/` — menu Integrações (superadmin).
- `src/components/agent/` — UI da bubble, painel de chat, mensagens, áudio.
- `src/components/integracoes/` — cartões e telas do menu Integrações.
- `prisma/schema.prisma` — modelos novos (§7). **Migrations Prisma, nunca
  `ensure-tables.ts`.**

### 3.2 Dois pontos de entrada, um núcleo
WhatsApp e chat in-app entram em funções diferentes (`handleInboundWhatsapp`,
`handleInAppMessage`) mas convergem para **um mesmo `runAgent(...)`** que: monta
o prompt, roda o loop de tool calling contra o MCP, registra uso, persiste
mensagens. A diferença é só transporte de entrada/saída e canal de origem.

**Onde `runAgent` roda (B2):**
- **Chat in-app** — `runAgent` roda **no request handler do Next**
  (`/api/agent/stream`), de forma síncrona, com `onEvent` escrevendo no stream
  SSE. **O in-app NÃO passa pela fila BullMQ** — passar pela fila perderia o
  streaming.
- **WhatsApp** — `runAgent` roda **no container `worker`**, como job da fila
  BullMQ `agent`; `onEvent` é no-op (não há SSE); a resposta sai pelo modo
  configurado (§6.2).
Ambos importam `src/lib/agent/*` — o código do núcleo é compartilhado.

---

## 4. F5b — Núcleo do agente (detalhado primeiro: tudo depende dele)

### 4.1 Visão
O núcleo é a peça central — F5c (chat), F5d (webhook) e o playground todos o
consomem. Por isso a SPEC o detalha antes das telas.

### 4.2 Camada multi-LLM (port do Nex)
- **Tipos canônicos** (`src/lib/agent/llm/types.ts`): `ChatMessage`, `ToolCall`,
  `ChatResult`, `ProviderClient`, `LlmProvider`. Port direto de
  `nexus-insights/src/lib/llm/types.ts`.
- **Adapters** (`src/lib/agent/llm/providers/{anthropic,openai,gemini,
  openrouter}.ts`): `fetch` puro, sem SDK. Port direto. Mantêm `isMockKey()`
  para dev/teste sem chave real.
- **Provedor/modelo padrão:** **Anthropic Claude** (modelo mais capaz; `CLAUDE.md`).
  Multi-LLM é requisito — os 4 provedores são portados.
- **Catálogo e pricing** (`src/lib/agent/llm/catalog.ts`, `pricing.ts`): port,
  **mas unificados numa fonte só** (corrige BUGs 2 e 3 — §4.6).
- **Credenciais** (`src/lib/agent/llm/credentials.ts`): chaves cifradas
  AES-256 (reusar `src/lib/encryption` da F1), `last4` em claro. Modelo Prisma
  `LlmCredential` (§7).
- **Config ativa** (`LlmConfig`): qual provider+model+credencial está ativo.

### 4.3 Orquestrador (`src/lib/agent/run-agent.ts`)
Port do `run-nex.ts`, com a fonte das tools trocada:
- Assinatura: `runAgent({ conversationId, userId, userMessage, channel,
  isPlayground, onEvent? })`.
- **Carrega histórico (A4):** lê as últimas N mensagens da `Conversation`
  (`conversationId`), respeitando um budget de tokens (ex.: 20 mensagens ou
  ~8k tokens, o que vier primeiro), e as inclui no array `ChatMessage[]` antes
  da mensagem nova. Sem isso o WhatsApp não é conversacional.
- Loop de tool calling, máx. `MAX_ITERATIONS` (5), erro "agente em loop" no
  estouro.
- Monta o system prompt via `composeSystemPrompt` (§4.4).
- **Em vez de `NEX_TOOLS` + SQL:** o orquestrador instancia um **cliente MCP**
  (§4.5), pede o catálogo de tools ao MCP (já filtrado por RBAC para aquele
  `userId`), converte para o formato do provedor (§4.5.1), e executa cada tool
  call chamando o MCP.
- Acumula uso (tokens/custo) e persiste em `LlmUsage` por iteração.
- Extrai sugestões clicáveis (`[[suggestions]]:a|b|c`) — port.
- Persiste a mensagem do usuário e a resposta do agente em `Message` (§9).
- `onEvent` (opcional) emite eventos de progresso para o streaming SSE (§8.1).
- **Guard de tamanho de resultado de tool (B8):** antes de realimentar o
  resultado de uma tool no contexto do LLM, o orquestrador aplica um cap de
  tamanho (`MAX_TOOL_RESULT_BYTES`, ex.: 24 KB). Resultado acima do cap é
  **truncado** e recebe um aviso (`"resultado truncado — refine a pergunta ou
  use um período menor"`) que vai ao LLM. Protege a janela de contexto e o custo
  — relevante para `bi_consulta_avancada` (até 1000 linhas) e listas grandes.

### 4.4 Gestão de prompt
- `composeSystemPrompt(cfg, kbDocs)` — port de `prompt-compose.ts`. Estrutura
  mantida: `identityBase` → personalidade → tom → guardrails → base de
  conhecimento → terminologia → instrução de sugestões.
- **`IDENTITY_BASE` reescrito do zero** para o domínio Odoo: postura do agente,
  identidade ("assistente de operação da Matrix Fitness Group"), mapa de negócio
  (estoque, financeiro, fiscal, comercial, cadastros, contábil), guia de seleção
  de tool (as 33 do MCP), semântica de período, formato de resposta, e instrução
  do Caminho 3 (quando registrar lacuna, quando recusar, quando usar
  `bi_consulta_avancada`).
- Persistido em `AgentSettings` (singleton — §7). Configurável na UI (F5e/config
  do agente).

### 4.5 Cliente MCP (`src/lib/agent/mcp-client.ts`)
- Usa `@modelcontextprotocol/sdk` (cliente) com transporte **Streamable HTTP**
  apontando para `MCP_URL` (env; default `http://mcp:3100` em prod, `http://
  localhost:3100` em dev).
- Autentica com `MCP_SERVICE_TOKEN` (env) e injeta o `userId` da plataforma na
  sessão MCP (contrato de identidade da F4).
- Expõe: `listTools()` e `callTool(name, args)`.
- **Ciclo de vida da sessão (B1):** **uma sessão de cliente MCP por invocação de
  `runAgent`**, escopada ao `userId` daquela chamada, aberta no início e fechada
  num `finally`. **Sem pool global compartilhado entre usuários** — compartilhar
  vazaria identidade entre WhatsApp/in-app concorrentes. A conexão é HTTP barata;
  correção de identidade vale mais que reuso.
- Tratamento de falha: MCP indisponível → resposta honesta ao usuário
  ("consulta temporariamente indisponível"), log do erro. Nunca quebra a
  conversa.

#### 4.5.1 Adaptador de schema MCP → provedor (A1)
O MCP devolve cada tool no formato MCP (`name`, `description`, `inputSchema`
JSON Schema). Os adapters de provedor (`mapTools`) esperam o JSON Schema no
formato de function calling de cada provedor. Função
`mcpToolsToProviderTools(mcpTools): ToolDefinition[]` em
`src/lib/agent/mcp-client.ts` faz essa conversão (o `inputSchema` do MCP já é
JSON Schema padrão — a conversão é majoritariamente de envelope). É essa lista
convertida que o orquestrador passa a `client.chat({ tools })`. **O catálogo
`NEX_TOOLS` do Nex é descartado.**

#### 4.5.2 Caminho 3c — fonte do schema para o text-to-SQL (A2)
A F4 **não expõe** tool de schema — `bi_consulta_avancada` recebe só `{ sql }`.
Logo, para o agente gerar SQL válido, a F5 injeta no system prompt um **resumo
de DDL das fact tables** (`fato_estoque_*`, `fato_financeiro_*`, `fato_pedido*`,
`fato_nota_fiscal*`, `fato_parceiro`, `fato_conta_contabil` — nomes de tabela,
colunas e tipos), gerado a partir de `prisma/schema.prisma`. Esse bloco só é
incluído quando o usuário é `admin`/`super_admin` (únicos com acesso ao 3c) —
para `viewer`/`manager` o bloco é omitido (economia de prompt e princípio do
menor privilégio). O resumo vive em `src/lib/agent/bi-schema-reference.ts`
(constante versionada). **Trava de drift (B6):** um teste jest compara a
referência com as fact tables reais (diff contra os modelos `Fato*` de
`prisma/schema.prisma`) e **falha** se as fact tables mudarem sem a referência
ser atualizada.

### 4.6 Correção dos 8 bugs da tela de consumo (port)
Herdados do Nex (`research §4.3`). A F5 corrige no port:
1. **BUG 1** — separar claramente `tokens_input` (do provedor) de métricas de
   caracteres; não rotular chars como tokens. Logar `tokens_input` real por
   iteração.
2. **BUG 2** — `calculateCost()` para modelo fora do pricing: **não retornar 0
   silencioso**; marcar `costKnown=false` e a UI exibe "preço desconhecido".
3. **BUG 3** — **fonte única** catálogo+pricing: um único registro por modelo,
   com `id`, `tier`, `pricing`. Acaba o descasamento de IDs.
4. **BUG 4** — `promptChars`/`responseChars` nullable consistente entre schema e
   query (declarar nullable no Prisma).
5. **BUG 5** — `cost_brl` nunca fica `NULL` por falha de cotação: se a cotação
   falhar, gravar a row e ter um job de backfill; ou gravar com a última cotação
   conhecida e marcar `rateStale=true`.
6. **BUG 6** — versionar o spread cambial; gravar o spread usado em cada row.
7. **BUG 7** — `isPlayground` declarado no schema Prisma desde a 1ª migration.
8. **BUG 8** — KPI separa **"conversas"** (count de `Conversation`) de
   **"iterações de LLM"** (count de `LlmUsage`); rótulos explícitos.

### 4.7 Transcrição de áudio (opcional)
Port de `transcribe.ts` (OpenAI Whisper / `gpt-4o-mini-transcribe`). Útil para
notas de voz no WhatsApp e no chat in-app. Revisar o gating "só OpenAI". Toggle
em `AgentSettings` (`audioInputEnabled`). O `transcribe.ts` assume os bytes do
áudio em mãos — o download de mídia do WhatsApp é tratado em §6.1.1.

### 4.8 RAG com pgvector
- Extensão `pgvector` habilitada via migration (`CREATE EXTENSION IF NOT EXISTS
  vector`).
- Modelo `KbDocument` (§7) com coluna de embedding `vector`.
- Geração de embedding na ingestão de doc de KB; busca por similaridade no
  `composeSystemPrompt` para selecionar os trechos relevantes (budget de
  contexto). Embedding via provedor configurável (default OpenAI
  `text-embedding-3-small`; se sem chave OpenAI, KB cai no modo "texto integral
  truncado" do Nex).
- **Trava de dimensão (B5):** a coluna é `vector(1536)`. Só são aceitos modelos
  de embedding que produzem **1536 dimensões** (`text-embedding-3-small`, ou
  `text-embedding-3-large` com parâmetro `dimensions=1536`). A ingestão valida
  o tamanho do vetor antes do `INSERT` e rejeita modelo incompatível com erro
  claro.
- **Decisão de escopo:** o RAG é entregue, mas a base de conhecimento inicial
  pode ser pequena — o valor é a infraestrutura pronta.

---

## 5. F5a — Cadastro de usuário com WhatsApp + cruzamento de acesso

### 5.1 Modelo de dados
- Novo modelo `UserWhatsappNumber` (§7): vários números por usuário, número
  normalizado (E.164), `unique` global (um número pertence a no máximo um
  usuário), flag de verificado (futuro), timestamps.
- Relação `User 1—N UserWhatsappNumber`.

### 5.2 UI
- Tela de criação/edição de usuário (`user-form-dialog.tsx`) ganha seção
  "Números de WhatsApp" — lista editável (adicionar/remover), validação de
  formato E.164, feedback de número já em uso por outro usuário.
- `ui-ux-pro-max` obrigatório nessa seção.

### 5.3 Cruzamento número→usuário→acesso
- Função `resolveWhatsappUser(phoneE164)` em `src/lib/whatsapp/resolve.ts`:
  normaliza o número, busca `UserWhatsappNumber`, retorna o `User` (ou `null`).
- **2ª linha de defesa:** mesmo que o n8n já filtre os números autorizados na
  entrada, a plataforma **revalida**: número desconhecido → recusa ("número não
  autorizado"), log de tentativa; número conhecido mas usuário inativo → recusa.
- O `userId` resolvido é o que vai ao MCP. O número de WhatsApp **nunca** é
  passado adiante ao MCP (decisão #10).

### 5.4 Auditoria
Novas `AuditAction`: `user_whatsapp_added`, `user_whatsapp_removed`,
`whatsapp_inbound_rejected`.

---

## 6. F5d — Webhook receptor + resposta nos 2 modos · F5f — credenciais Meta

### 6.1 Endpoint receptor (`POST /api/integrations/whatsapp/inbound`)
- Recebe o evento que o n8n replica (mensagem de WhatsApp já triada).
- **Autenticação:** HMAC-SHA256 — o n8n assina o corpo com um shared secret
  (`WhatsappWebhook.inboundSecret`); o endpoint valida a assinatura no header
  `X-Signature`. Rejeita `401` se inválida. (Recomendação da pendência #2 do
  brainstorm: HMAC, não shared secret em claro.)
- **Idempotência:** dedup por `messageId` do WhatsApp (evita reprocessar
  reentregas do n8n) — tabela/coluna de controle.
- Fluxo: valida HMAC → extrai número + texto/áudio → `resolveWhatsappUser` →
  se autorizado, `runAgent` → resposta entregue no modo configurado.
- **Processamento assíncrono:** o endpoint responde `202` rápido e processa via
  fila **BullMQ** (o worker já existe; F5 adiciona uma fila `agent`). Evita
  timeout do n8n e dá retry. A resposta sai pelo modo configurado quando pronta.

#### 6.1.1 Download de mídia de áudio do WhatsApp (A6)
Uma nota de voz chega como **media ID**, não como binário. O fluxo inbound, ao
detectar mensagem de áudio: (1) chama a Graph API `GET /{media-id}` com o token
da Meta para obter a URL temporária; (2) baixa o binário; (3) passa os bytes ao
`transcribe.ts`. Esse passo vive em `src/lib/whatsapp/cloud-client.ts`
(`downloadMedia(mediaId)`). Requer credenciais Meta configuradas (§6.4). Se as
credenciais não estiverem configuradas, áudio de WhatsApp responde com pedido de
texto; áudio do chat in-app não depende disso.

#### 6.1.2 Rate limit e anti-replay (A8)
- O endpoint `/inbound` tem **rate limit** (referência: `src/lib/rate-limit.ts`
  da plataforma) por IP e por número de origem.
- A assinatura HMAC inclui um **timestamp**; o endpoint rejeita assinaturas com
  timestamp fora de uma janela de tolerância (ex.: ±5 min) — **anti-replay**.
- Combinado com a dedup por `messageId` (idempotência), cobre reentrega legítima
  e replay malicioso.
- **Teto diário por usuário (B12):** o inbound aplica um cap simples de
  mensagens/dia por `userId` resolvido (config em `AppSetting`, default ex.:
  100/dia). Acima do teto → resposta honesta de limite atingido + log. Limita
  custo acumulado, complementando o rate limit (que limita frequência).

#### 6.1.3 Contrato do payload inbound (B7)
O n8n replica o evento já normalizado neste formato (Zod schema concreto que o
endpoint valida). Headers: `X-Signature` (HMAC-SHA256 hex do corpo cru) e
`X-Timestamp` (epoch ms). Corpo JSON:
```jsonc
{
  "messageId": "wamid....",      // id da mensagem no WhatsApp — chave de dedup
  "from": "+5511999999999",       // E.164 — número do remetente
  "timestamp": 1747600000000,     // epoch ms da mensagem
  "type": "text",                 // "text" | "audio"
  "text": "qual o saldo de...",   // presente se type=text
  "audioMediaId": "media-id"       // presente se type=audio (download em §6.1.1)
}
```
O `docs/runbooks/n8n-whatsapp.md` (§6.3) descreve como o n8n monta esse payload
e calcula o HMAC. Tipos de mensagem não suportados (imagem, documento, etc.)
recebem resposta honesta ("só texto e áudio são processados").

### 6.2 Resposta — 2 modos (configurável)
- **Modo 1 — plataforma responde direto:** cliente da API do WhatsApp Cloud
  (`src/lib/whatsapp/cloud-client.ts`) faz `POST` para a Graph API com as
  credenciais da Meta (§6.4).
- **Modo 2 — devolve para o n8n:** `POST` no webhook de saída do n8n
  (`WhatsappWebhook.outboundUrl`) com o payload da resposta, assinado por HMAC.
- O modo é um campo de configuração (`WhatsappChannel.responseMode`).
- **Número do destinatário (B9):** o modo 1 precisa do número de WhatsApp para
  chamar a Graph API. Isso é coerente com a decisão #10: o número fica retido
  pelo **job inbound / camada `whatsapp`** apenas para entregar a resposta —
  **só o `userId` cruza para o MCP**, o número nunca.
- **Janela de 24h da Meta (B10):** a Graph API só permite mensagem livre dentro
  de 24h da última mensagem do usuário. Como o agente sempre **responde** a uma
  mensagem recebida, está sempre na janela. Mensagens proativas / template
  messages estão **fora do escopo da F5**.

### 6.3 Orientação de configuração do n8n
Entregável de doc: `docs/runbooks/n8n-whatsapp.md` — como apontar o n8n para o
endpoint receptor, como assinar o HMAC, formato esperado do payload de entrada e
de saída, e como configurar o webhook de saída (modo 2).

### 6.4 F5f — Credenciais da Meta
- **Decisão Q1:** a tela vive em **Integrações → Canais → WhatsApp**
  (`/integracoes/canais/whatsapp`) — não em Configurações. Razão: Configurações
  não é `super_admin`-only e as credenciais Meta são segredo crítico de
  superadmin; Integrações já é o lugar travado. O brainstorm citava os dois
  locais; consolidamos em Integrações.
- Campos: API token, WhatsApp Business Account ID, Phone Number ID, e o que a
  Graph API exigir.
- Armazenados **cifrados** (AES-256, `src/lib/encryption.ts` — verificado que
  existe). Modelo `WhatsappChannel` (§9).
- `super_admin` only.

---

## 7. F5e — Menu Integrações (superadmin only)

### 7.1 RBAC
- Item de menu **Integrações** visível e acessível **somente** para
  `super_admin`. Gate no `sidebar.tsx`, no layout da rota
  `(protected)/integracoes/`, e em cada Server Action.
- Nenhum outro perfil vê o menu.

### 7.2 Navegação — tela-a-tela, sem modal, sem menu lateral
- A landing `/integracoes` mostra **cartões** por categoria (grid de
  retângulos). Clicar num cartão **navega** para uma sub-rota
  (`/integracoes/canais`, `/integracoes/mcp`, etc.) — página inteira, não modal,
  não drawer lateral.
- Dentro de cada categoria, navegação tela-a-tela (lista → detalhe).
- `ui-ux-pro-max` obrigatório em toda a área.

### 7.3 Categorias
1. **Canais** (`/integracoes/canais`) → WhatsApp: status do canal, credenciais
   Meta (§6.4), modo de resposta, webhooks vinculados. Estrutura extensível para
   canais futuros.
2. **MCP** (`/integracoes/mcp`) → gerir o servidor MCP da F4 como recurso
   externo: endpoint(s), token(s) de serviço, status de saúde, e a
   **documentação de como o node Agent do n8n se conecta**. Permite ter mais de
   um servidor MCP registrado.
3. **Webhooks** (`/integracoes/webhooks`) → gerir o webhook receptor (n8n→nós) e
   o de saída (nós→n8n): URLs, secrets HMAC (rotação), logs de entrega.
4. **API** (`/integracoes/api`) → criar/gerir **API keys** da plataforma (para
   consumo externo): geração, `last4`, escopo, revogação. As keys cifradas.
5. **Plataformas de BI** (`/integracoes/bi`) → **placeholder** (PowerBI e
   outras): tela "em breve", sem funcionalidade nesta fase.

### 7.4 MCP consumível de fora
- O servidor MCP da F4 já fala Streamable HTTP e usa `MCP_SERVICE_TOKEN`. A F5
  acrescenta a **camada de UI** (Integrações → MCP) que gerencia
  endpoints/tokens e a documentação de conexão para o node Agent do n8n.
- **Decisão de escopo:** a F5 **não** reimplementa o MCP nem muda seu protocolo;
  só o torna gerenciável e documentado. Expor o MCP publicamente exige
  rede/proxy — a F5 entrega a config e a doc; a exposição de rede é passo de
  deploy (§10).

#### 7.4.1 API keys da plataforma × service token do MCP (A3)
Eram dois conceitos sobrepostos na v1; a v2 separa:
- **`MCP_SERVICE_TOKEN`** — credencial servidor↔servidor do MCP da F4. O node
  Agent do n8n conecta **direto** no MCP usando esse token. Gerido em
  **Integrações → MCP**: exibir o token (mascarado), permitir rotação, mostrar
  o endpoint e a doc de conexão do n8n. É o mecanismo de "MCP consumível de
  fora".
- **API keys da plataforma** (`ApiKey`, §9) — autenticam chamadas externas a
  **endpoints da própria plataforma**. Nesta fase o único consumidor externo
  previsto (o webhook receptor n8n→nós) usa **HMAC**, não API key. Portanto a
  tela **Integrações → API** entrega o CRUD de API keys (criar, listar, `last4`,
  revogar) como infraestrutura pronta para consumo futuro, **sem** um endpoint
  consumidor obrigatório nesta fase. Decisão registrada: API keys são
  infraestrutura entregue; o webhook receptor não as usa (usa HMAC). Não há
  sobreposição com o `MCP_SERVICE_TOKEN`.

---

## 8. F5c — Chat in-app + consumo + playground

### 8.0 RBAC do chat (A7)
O **chat in-app está disponível a todo usuário autenticado** (qualquer
`PlatformRole`). Não há RBAC próprio no agente: o **MCP** aplica o RBAC por tool
(catálogo filtrado por `userId`), então um `viewer` simplesmente enxerga menos
tools e recebe recusa honesta no que estiver fora do seu acesso. Já **consumo**,
**playground** e **configuração do agente** são `super_admin`/`admin` only. O
menu **Integrações** é `super_admin` only (§7.1).

### 8.1 Chat in-app
- **Decisão Q2:** entregar **os dois** — uma **bubble flutuante** onipresente
  nas telas protegidas (port de `nex-bubble.tsx` + `nex-chat-panel.tsx`) **e**
  uma **página dedicada** `/agente` (conversa em tela cheia, lista de
  conversas). Compartilham os mesmos componentes de mensagem e a mesma API.
- **Streaming (A5) — decisão:** o loop de tool calling roda no servidor; não há
  como streamar tokens durante as iterações de tool. Especificação:
  `/api/agent/stream` é um endpoint **SSE** que emite **eventos de progresso**
  durante o loop (`status: "consultando estoque…"`, um evento por tool call via
  o callback `onEvent` do `runAgent`) e, no **turno final** do assistente,
  streama o texto. Streaming token-a-token do turno final exige `stream:true`
  nos adapters — **incluído no escopo** para o provedor default (Anthropic);
  para os demais provedores, fallback para entrega do turno final em bloco
  (ainda com os eventos de progresso). Não se promete streaming token-a-token
  universal.
- Histórico **persistido** em `Conversation`/`Message` (não `localStorage`).
- Suporte a áudio (gravação → transcrição → injeção).
- `SuggestionsBar` (sugestões clicáveis) — port.
- `ui-ux-pro-max` obrigatório — a meta é "muito mais polido que o esboço do Nex".

### 8.2 Tela de consumo (`/agente/consumo`)
- Port de `consumo-content.tsx` com os **8 bugs corrigidos** (§4.6).
- KPIs (conversas, iterações, tokens, custo USD/BRL), gráficos (custo por
  dia/hora, por provider, por modelo), tabela paginada com drill-down, filtros
  de período/provider/modelo/ambiente.
- `super_admin`/`admin` only (consumo é informação sensível de custo).

### 8.3 Playground (`/agente/playground`)
- **Decisão Q3:** port de `playground-sheet.tsx` **como página**, não Sheet
  lateral — consistência com a diretriz "sem modal/drawer" e com a página de
  chat.
- Conversa de teste sem afetar o chat do usuário final; marca
  `isPlayground=true` em `LlmUsage`; "ver prompt usado".
- `super_admin`/`admin` only.

### 8.4 Config do agente (`/agente/configuracao` ou dentro de Integrações)
- Edição de identidade/personalidade/tom/guardrails/terminologia, toggles
  (KB, áudio, sugestões), seleção de provider+modelo+credencial, gestão de
  credenciais LLM, gestão da base de conhecimento (upload de docs, ingestão por
  URL). Port das telas `agente-nex/` do Nex.
- `super_admin`/`admin` only.

---

## 9. Modelos Prisma novos (F5)

Todos via **migrations Prisma**. Schema indicativo (campos finais na v2/v3):

```prisma
model UserWhatsappNumber {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  phoneE164 String   @unique @map("phone_e164")
  label     String?
  verifiedAt DateTime? @map("verified_at")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId])
  @@map("user_whatsapp_numbers")
}

model Conversation {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  channel   AgentChannel              // whatsapp | in_app | playground
  title     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  messages  Message[]
  @@index([userId, updatedAt])
  @@map("conversations")
}

model Message {
  id             String   @id @default(uuid()) @db.Uuid
  conversationId String   @map("conversation_id") @db.Uuid
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           MessageRole               // user | assistant | tool
  content        String
  toolCalls      Json?     @map("tool_calls")
  createdAt      DateTime  @default(now()) @map("created_at")
  @@index([conversationId, createdAt])
  @@map("messages")
}

model LlmCredential {
  id String @id @default(uuid()) @db.Uuid
  provider String
  label String
  encryptedApiKey String @map("encrypted_api_key")
  last4 String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@unique([provider, label])
  @@map("llm_credentials")
}

model LlmConfig {
  id String @id @default(uuid()) @db.Uuid
  provider String
  model String
  credentialId String? @map("credential_id") @db.Uuid
  isActive Boolean @default(false) @map("is_active")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("llm_configs")
}

model LlmUsage {
  id String @id @default(uuid()) @db.Uuid
  conversationId String? @map("conversation_id") @db.Uuid
  provider String
  model String
  tokensInput Int @map("tokens_input")
  tokensOutput Int @map("tokens_output")
  costUsd Decimal? @map("cost_usd") @db.Decimal(12,6)   // null = preço desconhecido
  costKnown Boolean @default(true) @map("cost_known")
  costBrl Decimal? @map("cost_brl") @db.Decimal(14,6)
  usdToBrlRate Decimal? @map("usd_to_brl_rate") @db.Decimal(10,4)
  rateSpread Decimal? @map("rate_spread") @db.Decimal(6,4)
  rateStale Boolean @default(false) @map("rate_stale")
  promptChars Int? @map("prompt_chars")
  responseChars Int? @map("response_chars")
  durationMs Int? @map("duration_ms")
  errorMessage String? @map("error_message")
  isPlayground Boolean @default(false) @map("is_playground")
  userId String? @map("user_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")
  @@index([createdAt])
  @@index([provider, model, createdAt])
  @@map("llm_usage")
}

model AgentSettings {        // singleton id="global"
  id String @id @default("global")
  identityBase String? @map("identity_base")
  personality String @default("")
  tone String @default("")
  guardrails Json @default("[]")
  terminology Json @default("{}")
  advancedOverride String? @map("advanced_override")
  audioInputEnabled Boolean @default(false) @map("audio_input_enabled")
  kbEnabled Boolean @default(true) @map("kb_enabled")
  suggestionsEnabled Boolean @default(true) @map("suggestions_enabled")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("agent_settings")
}

model KbDocument {
  id String @id @default(uuid()) @db.Uuid
  name String
  kind KbKind @default(TXT)
  sourceUrl String? @map("source_url")
  extractedText String @map("extracted_text")
  charCount Int @map("char_count")
  // embedding vector(1536) — via SQL raw na migration (pgvector)
  createdAt DateTime @default(now()) @map("created_at")
  @@map("kb_documents")
}

model WhatsappChannel {     // singleton — credenciais Meta + modo de resposta
  id String @id @default("global")
  encryptedApiToken String? @map("encrypted_api_token")
  businessAccountId String? @map("business_account_id")
  phoneNumberId String? @map("phone_number_id")
  responseMode WhatsappResponseMode @default(direct)  // direct | n8n_webhook
  enabled Boolean @default(false)
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("whatsapp_channel")
}

model WhatsappWebhook {
  id String @id @default(uuid()) @db.Uuid
  direction WebhookDirection            // inbound | outbound
  url String?                            // outbound: URL do n8n
  secret String                          // HMAC secret (cifrado)
  enabled Boolean @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  @@map("whatsapp_webhooks")
}

model ApiKey {
  id String @id @default(uuid()) @db.Uuid
  label String
  keyHash String @unique @map("key_hash")    // hash da key; key só exibida na criação
  last4 String
  scopes Json @default("[]")
  revokedAt DateTime? @map("revoked_at")
  createdById String? @map("created_by_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")
  @@map("api_keys")
}

model ProcessedWhatsappMessage {   // idempotência do webhook receptor
  messageId String @id @map("message_id")
  processedAt DateTime @default(now()) @map("processed_at")
  @@map("processed_whatsapp_messages")
}

enum AgentChannel { whatsapp in_app playground }
enum MessageRole { user assistant tool }
enum KbKind { PDF TXT URL }
enum WhatsappResponseMode { direct n8n_webhook }
enum WebhookDirection { inbound outbound }
```

### 9.1 Retenção e ciclo de vida (A9, A14)
- **`ProcessedWhatsappMessage`** cresce a cada mensagem; um job no worker
  (`agent` queue ou cron existente) remove registros com `processedAt` > 7 dias.
- **Agrupamento de conversa por canal (B3) — corrigido na v3:**
  - **WhatsApp** → `getOrCreateConversation(userId)` automático: reusa a
    `Conversation` de canal `whatsapp` aberta do usuário **se a última mensagem
    dela for < 24h**; senão cria nova. Não há UI no WhatsApp para escolher
    conversa — o agrupamento é regra de servidor.
  - **In-app (bubble e página `/agente`)** → o cliente envia um
    `conversationId` **explícito**. A página tem lista de conversas e botão
    "nova conversa" (cria uma `Conversation` nova). A bubble, por UX, reabre a
    última conversa in-app do usuário, mas isso é escolha do cliente, não regra
    de servidor. O servidor valida que o `conversationId` pertence ao `userId`.
  - **Playground** → ver "persistência do playground" abaixo.
- **Persistência do playground (B4):** o playground **persiste** `Conversation`
  com `channel=playground` (permite histórico e separação no consumo).
  `LlmUsage.isPlayground=true` marca o custo. Cada sessão de playground pode
  começar uma conversa nova (botão "limpar") — não há auto-agrupamento.
- **`title` da `Conversation`:** derivado da 1ª mensagem do usuário, truncado a
  ~60 chars. Sem chamada extra de LLM.

### 9.2 Regras de segredo e integridade (B11, B13)
- **Cifra reversível** (AES-256, `src/lib/encryption.ts`) para segredos
  necessários em claro em runtime: `LlmCredential.encryptedApiKey`,
  `WhatsappChannel.encryptedApiToken`, `WhatsappWebhook.secret` (HMAC).
- **Hash unidirecional** para `ApiKey.keyHash` — a key é exibida **uma única
  vez** na criação; depois só `last4`.
- **`LlmConfig.isActive`** — ativar uma config é **transacional**
  (`$transaction`: desativa todas + ativa a escolhida) para evitar corrida.
- A chave de cifragem (`ENCRYPTION_KEY` da F1) precisa estar no `.env.example`
  e no ambiente do `app` e do `worker`.

Novas `AuditAction`: `user_whatsapp_added`, `user_whatsapp_removed`,
`whatsapp_inbound_rejected`, `agent_settings_updated`, `llm_credential_created`,
`llm_credential_deleted`, `api_key_created`, `api_key_revoked`,
`whatsapp_channel_updated`.

---

## 10. Ordem das sub-fases e dependências

```
F5b (núcleo do agente) ──┬──▶ F5c (chat/consumo/playground)
                         ├──▶ F5d (webhook + resposta)
F5a (WhatsApp no user) ──┘
F5f (credenciais Meta) ──▶ F5d (modo 1 precisa das credenciais)
F5e (menu Integrações) ──▶ depende de F5a/F5d/F5f para ter conteúdo real
```

Ordem de execução proposta (ondas):
1. **Onda 1 — Fundação de dados + núcleo:** migrations (todos os modelos §9),
   camada multi-LLM, orquestrador, cliente MCP, prompt. (F5b)
2. **Onda 2 — Cadastro WhatsApp:** `UserWhatsappNumber`, UI no user form,
   `resolveWhatsappUser`. (F5a)
3. **Onda 3 — Chat in-app:** bubble, página, streaming SSE, persistência. (F5c
   parte 1)
4. **Onda 4 — Webhook + WhatsApp:** endpoint receptor, fila BullMQ, cliente
   Cloud, 2 modos, credenciais Meta. (F5d + F5f)
5. **Onda 5 — Consumo + playground:** telas, 8 bugs corrigidos. (F5c parte 2)
6. **Onda 6 — Integrações:** menu superadmin, 5 categorias, API keys, doc n8n.
   (F5e)
7. **Onda 7 — RAG:** pgvector, embeddings, busca de KB. (F5b parte 2)

Cada onda: verificação e2e contra dado real obrigatória (`CLAUDE.md §6 [9]`).

### 10.1 Deploy — imagem Postgres com pgvector (A12)
- A imagem atual do `docker-compose.yml` é **`postgres:16-alpine`** (verificado)
  — **não tem pgvector**. A F5 troca para **`pgvector/pgvector:pg16`** (mesma
  major 16, compatível com o volume existente). A migration que cria o RAG roda
  `CREATE EXTENSION IF NOT EXISTS vector` — exige role com privilégio (o owner
  `nexus` do compose tem; em produção, confirmar no deploy assistido).
- Documentar a troca de imagem no runbook de deploy.

### 10.2 Envs e dependência do worker (A10, A11)
- **Worker:** a onda 4 roda o agente numa fila BullMQ no container `worker`. O
  `worker` importa `src/lib/agent/*` (orquestrador, providers, cliente MCP) —
  confirmado que `src/worker/` pode importar de `src/lib/`. O build do `worker`
  precisa incluir `src/lib/agent`. As envs `MCP_URL`, `MCP_SERVICE_TOKEN`,
  `WHATSAPP_INBOUND_SECRET` devem existir no `worker` **e** no `app`.
- **Encryption:** `src/lib/encryption.ts` **existe** (F1) — reusar, não portar.
- Novas envs no `.env.example`: `MCP_URL`, `MCP_SERVICE_TOKEN`,
  `WHATSAPP_INBOUND_SECRET`, e (opcional) `OPENAI_API_KEY` só se o embedding do
  RAG usar OpenAI por env em vez de credencial gerida.
- Expor o MCP para o n8n exige rede/proxy (Traefik) — passo de deploy assistido.

---

## 11. Decisões fechadas (eram Q1–Q7 na v1)

- **Q1 — credenciais Meta:** vivem em **Integrações → Canais → WhatsApp** (§6.4).
- **Q2 — chat in-app:** **bubble onipresente + página `/agente`**, os dois (§8.1).
- **Q3 — playground:** **página**, não Sheet (§8.3).
- **Q4 — embedding sem OpenAI:** sim, fallback aceitável — KB cai no modo "texto
  integral truncado" (sem similaridade), como o Nex faz hoje (§4.8). O RAG só
  liga quando há credencial de embedding.
- **Q5 — dimensão do vetor:** fixada em **1536** (`text-embedding-3-small`)
  nesta fase. Coluna `vector(1536)` (§9).
- **Q6 — fila BullMQ:** roda no container **`worker`** existente (§10.2).
- **Q7 — agrupamento de conversa:** janela de **24h** de silêncio inicia nova
  `Conversation` (§9.1).

---

## 12. Critérios de aceitação (verificação e2e por onda)

1. O agente responde uma pergunta de negócio real (ex.: "qual o saldo de
   estoque do produto X?") no chat in-app, consultando o MCP, com número
   coerente com o cache.
2. Uma mensagem de WhatsApp simulada (POST assinado no endpoint receptor) com
   número cadastrado recebe resposta; com número não cadastrado, é recusada e
   logada.
3. Os 2 modos de resposta funcionam (modo 1: chamada à Graph API mockada/real;
   modo 2: POST no webhook de saída).
4. O menu Integrações só aparece para `super_admin`; cada categoria navega
   tela-a-tela.
5. A tela de consumo mostra custo correto, marca "preço desconhecido" para
   modelo sem pricing, e separa conversas de iterações.
6. `tsc` (raiz e mcp), `eslint`, `jest`, `next build`, `docker compose build` —
   verdes.
7. RBAC: `viewer`/`manager` não acessam Integrações, consumo nem playground.
```
