# F5 , Integração WhatsApp ↔ Agente Nex via n8n/Webhook (SPEC v3 , final)

> **Status:** SPEC v3 (achados da 2ª review aplicados). Versão que vai para o
> PLAN (`CLAUDE.md §6`).
> **Branch:** `feat/router-ativacao-r2`.
> **Mudou v2 → v3:** caminho de áudio travado (n8n transcreve; worker não baixa);
> `runAgent` usa `isAudio` (não `kind`); semântica concreta do lock por usuário
> (escopo, TTL, não-adquiriu, ordem best-effort); envelope de saída marcado como
> **breaking**; `phoneNumberId` percorre inbound→job→envelope (3 pontos);
> idempotência de saída com ordem de passos definida; **cortada** a renomeação de
> origem na aba de avaliações (WhatsApp nunca aparece lá , sintoma inexistente);
> gate de avaliação por NOME das funções (enqueue de inteligência fica fora);
> cast do backfill da migration; Onda A decomposta.

---

## 1. Objetivo

Conversa com o Agente Nex **pelo WhatsApp**, mesma inteligência do chat in-app,
via **n8n** entre a Meta e a plataforma, refletida no monitoramento. Reusa a
infra madura (endpoint inbound, HMAC, fila, sessão 24h). Não é a F5 inteira.

Fluxo (**assíncrono, 2 webhooks**):

```
Usuário(WhatsApp) → Meta → n8n (extrai campos, transcreve áudio, assina HMAC)
  → [ENTRADA] POST /api/integrations/whatsapp/inbound (HMAC)
       → resolve usuário (equivalência do nono dígito) → fila `agent`
  → worker: lock por usuário → sessão (24h) → runAgent (MCP F4)
       → persiste resposta + grava idempotência de saída + computa payload rico
       → emite `agent.reply` nos webhooks outbound habilitados (HMAC)
  → n8n (nó Webhook receptor) deduplica por deliveryId → entrega ao usuário
```

## 2. Decisões travadas

1. Resposta **assíncrona, 2 webhooks**.
2. **Camada de eventos no webhook implementada agora** (campo + UI + emissor).
   Único evento real: `agent.reply`.
3. Origem distinta **somente no monitoramento de sessões** (aba Chat): cada
   sessão marcada Bubble vs WhatsApp. **A aba de avaliações (Backtest) não muda**
   (WhatsApp não gera avaliação ⇒ nunca aparece lá).
4. **Sem avaliação automática para WhatsApp**. A inteligência (memória/resumo/
   tags) **continua** rodando.
5. **Sessão WhatsApp = janela de 24h**; sem encerramento manual.
6. **Áudio transcrito pelo n8n** (`type:"audio"` + `text`); o worker **não baixa
   nem transcreve** neste fluxo.
7. Monitoramento: aba "Bubble" → **"Chat"** (só o label; rota `/bubble` mantida).
8. **Heartbeat suprimido no WhatsApp** (só a resposta final).
9. **Monitoramento incluído nesta entrega**; conflitos com `feat/nex-reconstrucao`
   resolvidos no merge (commits pequenos e atômicos por arquivo).

## 3. Contrato , Webhook de ENTRADA (n8n → plataforma)

Calibrado pelo payload real da Meta. O n8n extrai de
`body.entry[0].changes[0].value` e envia (JSON, assinado por HMAC):

| Campo | Origem (Meta) | Obrig. | Uso |
|---|---|---|---|
| `from` | `messages[0].from` (= `contacts[0].wa_id`) | sim | chave → usuário |
| `text` | `messages[0].text.body` **ou a transcrição do áudio** | sim | conteúdo |
| `type` | `messages[0].type` | sim | `text`/`audio` (nome mantido) |
| `messageId` | `messages[0].id` (`wamid...`) | sim | idempotência + correlação |
| `timestamp` | `messages[0].timestamp` (segundos) | sim | ordenação |
| `contactName` | `contacts[0].profile.name` | opcional | exibição |
| `phoneNumberId` | `metadata.phone_number_id` | opcional | rotear resposta pelo nº certo |

**Regras:**
- **`type` mantido** (não renomear , `inboundSchema`/`AgentJobData`/`processor`/
  testes usam `type`). `image` permanece no enum, mas é **rejeitado com mensagem
  amigável** neste fluxo.
- **Áudio (caminho único):** o n8n transcreve e envia `type:"audio"` + `text`. No
  schema, **`text` torna-se obrigatório quando `type` ∈ {text,audio}** (validação
  cruzada Zod); `audioMediaId`/`imageMediaId` permanecem opcionais (legado) mas
  **não são usados neste fluxo**. O `processor.ts` **curto-circuita o branch de
  download+transcrição** (`processor.ts:108-140`) quando `text` veio pronto, indo
  direto a `userMessage = text`. Passa **`isAudio:true`** ao `runAgent` (o
  parâmetro é `isAudio`, `run-agent.ts:209` , **não** `kind`); o `runAgent` grava
  `Message.kind="audio"` internamente.
- **`text` vazio ⇒ resposta amigável**, nunca `throw` (hoje `processor.ts:142`
  lança e mata o job, gerando retry).
- **`timestamp`**: a Meta manda segundos; a **normalização para ms é no n8n**
  (na borda). **Nenhuma mudança no Zod** (segue `z.number().int().positive()`).
- Headers: `X-Signature` (HMAC-SHA256 de `${timestamp}.${body}`), `X-Timestamp`.
  A assinatura **da Meta** (`x-hub-signature-256`) é validada **no n8n**.

## 4. Resolução do usuário pelo número , nono dígito (já meio caminho andado)

A Meta mandou `553491908624` , **sem o nono dígito**. A busca exata atual
(`resolveWhatsappUser` → `findUnique({phoneE164})`, `resolve.ts:75`) falharia
para quem cadastrou com o 9. Correção (trivial, função já existe):
- `resolve.ts:75`: trocar `findUnique({ phoneE164 })` por
  `findFirst({ where: { phoneE164: { in: phoneVariants(e164) } } })`
  (`phoneVariants` de `countries.ts:180`, mesma equivalência do cadastro).

## 5. Concorrência , lock por usuário (semântica concreta)

**Causa raiz:** `getOrCreateWhatsappConversation` (`conversation.ts:92-113`) faz
`findFirst` + `createConversation` sem transação/unique ⇒ duas mensagens paralelas
do mesmo número criam **duas conversas**; e a escrita de `reasoningHistory`
(read-modify-write) pode sobrescrever.

**Decisão (usando o padrão de lock que já existe):**
- Reusar o padrão **cluster-safe** `connection.set(key,val,"PX",ttl,"NX")` já
  presente em `src/worker/index.ts:220` (Redis/ioredis já conectados; BullMQ OSS
  5.x **não** tem concurrency-por-chave, então o lock é o caminho).
- Chave `agent:lock:wa:{userId}`. O lock envolve **todo o processamento do job**
  (get-or-create + runAgent + persistência + idempotência de saída), garantindo
  **uma conversa por usuário e sem sobrescrita**. TTL = `timeout do turno + margem`
  (ex.: 120s), renovado se necessário.
- **Não adquiriu o lock** (outra mensagem do mesmo usuário em curso): o job
  **lança erro controlado** ⇒ BullMQ re-tenta com backoff (a mensagem espera a
  anterior terminar). 
- **Ordem é best-effort** (o retry re-enfileira; FIFO estrito por chave exigiria
  BullMQ Pro, fora de escopo). O que fica **garantido** é a **consistência**: uma
  conversa por usuário, sem escrita concorrente. Aceitável , mensagens do mesmo
  usuário em < 1s são raras e a consistência importa mais que a ordem exata.

## 6. Geração vs entrega , idempotência de saída (ordem dos passos)

`processAgentJob` é linear; não precisa reestruturar a fila. Sequência exata:
1. **No topo do processor:** se `whatsapp:replied:{messageId}` (Redis) já existe,
   **recupera o payload salvo e vai direto ao POST** (pula `runAgent`).
2. Senão: lock (§5) → sessão → `runAgent` → **persiste a Message do assistant** →
   **grava `whatsapp:replied:{messageId}` com o payload serializado (§7)** →
   **só então** dispara o webhook de saída.
3. Falha de POST ⇒ BullMQ re-tenta; no retry, o passo 1 encontra `replied`,
   **reentrega o payload salvo sem re-rodar o agente** (sem novo custo de LLM, sem
   resposta divergente).
- **Heartbeat suprimido** no WhatsApp (decisão #8): um disparo `agent.reply` por
  mensagem (+ eventuais `notice` de fallback).

## 7. Contrato , Webhook de SAÍDA (plataforma → n8n), evento `agent.reply`

**Breaking change:** o payload de saída atual é `{to,message,messageId,timestamp}`
(`processor.ts:285-290`); muda para o envelope abaixo. O runbook (§13) registra
que o n8n receptor precisa ser reconfigurado.

```jsonc
{
  "event": "agent.reply",
  "deliveryId": "<uuid por disparo, dedupe no n8n>",
  "kind": "final",                       // "final" | "notice"
  "data": {
    "inboundMessageId": "wamid...",       // correlação/thread (id da Meta)
    "to": "553491908624",
    "phoneNumberId": "593237780533272",   // por qual nº responder (ecoa entrada)
    "sessionId": "<conversationId>",
    "assistantMessageId": "<Message do assistant>",
    "ok": true,
    "reply": "<texto>",                    // ok:false ⇒ erro amigável
    "suggestions": ["...", "..."],          // [] quando ok:false
    "tools": ["faturamento_periodo"],       // [] quando ok:false
    "reasoningMs": 4200,                    // 0 quando ok:false
    "usage": { "tokensInput":0, "tokensOutput":0, "costUsd":0 },
    "messageType": "text"
  },
  "timestamp": 1718630000000
}
```

**Plumbing (Onda B):**
- Estender `RunAgentResult` (`run-agent.ts:250-259`) nos **dois ramos**: adicionar
  `toolsCalled: string[]` (de `allTurnToolNames`, `run-agent.ts:756`) e
  `reasoningMs` (acumular `durationMs` por iteração, `:951`, **em memória durante
  o turno** , `LlmUsage` é por **conversa**, não serve). No ramo `ok:false`
  (early-return `:371`, loop `:1710`, catch `:1735`): `toolsCalled:[]`,
  `reasoningMs:0` (ou o parcial acumulado); garantir defaults onde a variável
  ainda não existe.
- `assistantMessageId` (Message) ≠ `inboundMessageId` (Meta).
- **`phoneNumberId` percorre 3 pontos**: `inboundSchema` (§3), `AgentJobData`
  (`processor.ts:38-57`) e o envelope. O singleton `WhatsappChannel` não tem esse
  campo (está no `WhatsappInstance` dormente) ⇒ vem do payload de entrada.
- **Sem `suggestionsCount`** (usa `suggestions.length`).
- **Bug `url`/`targetUrl`:** `route.ts:215` lê `outboundWebhook.url`, mas R6
  introduziu `targetUrl` (`schema.prisma:3131`). Se a UI grava `targetUrl`, `url`
  fica null e o outbound **quebra hoje**. Corrigir para `targetUrl ?? url`.
- **Fail-closed:** se o secret de saída não descriptografar, **não disparar**
  (hoje assina com `""` e envia mesmo assim , `processor.ts:292`).

## 8. Sem avaliação para WhatsApp (gate por nome)

- No `run-agent.ts`, condicionar a **`if (args.channel !== "whatsapp")`** as
  chamadas de **`createPendingEval`** (~:1422) e **`createTechnicalFailureEval`**
  (~:1721). **Não** alterar `quality/trigger.ts` (compartilhado com replay).
- **Fora do gate** (continuam para WhatsApp): **`enqueueTopicTagging`** e
  **`enqueueResumoConversa`** (~:1452) , são inteligência (memória/contexto), não
  avaliação. Citar pelo nome para o executor não gatear o bloco errado.
- **KPIs:** os agregados de qualidade do monitoramento filtram `channel:"in_app"`
  (excluir WhatsApp do denominador de "% avaliado").

## 9. Origem (escopo cortado , só sessões)

- **Aba de avaliações (Backtest): NÃO muda.** Como WhatsApp não gera eval e a
  tabela só lista origens com `count>0`, nenhuma linha WhatsApp aparece lá. **Não
  mexer** em `channelToOrigem`/`ORIGEM_LABELS`/`getDistinctRodadas`/
  `evaluations-table.tsx` nem nos testes `rodada-labels.test.ts` (reduz escopo e
  conflito com a outra frente). "Agente Nex" na tabela já significa in-app na
  prática.
- **Monitoramento de sessões (aba Chat):** a distinção Bubble vs WhatsApp aparece
  como **marcador de canal por sessão** (§12), não via origem de avaliação.

## 10. Sessão WhatsApp + status no monitoramento

- Reusa `getOrCreateWhatsappConversation` (janela 24h).
- **Encerramento lazy** (sem cron). Criar um **helper único de status por canal**
  que **substitui** o cálculo `isActive` inline em `monitoramento-bubble.ts:208`
  e é aplicado também em `listBubbleCollaborators` (`:67`):
  - in_app ⇒ "ativa" = `endedAt IS NULL` (e mais recente, como hoje);
  - whatsapp ⇒ "ativa" = `endedAt IS NULL AND updatedAt >= now()-24h` (senão toda
    sessão WhatsApp ficaria eternamente "ativa", pois `endedAt` nunca é setado).

## 11. Webhook por evento (implementar agora)

- **Schema:** `enum WebhookEvent { agent_reply }` + `events WebhookEvent[]`
  (`@default([])`) em `WhatsappWebhook`. Serializa para `"agent.reply"` no envelope.
- **Backfill na migration (com cast Postgres correto):**
  `UPDATE whatsapp_webhooks SET events = ARRAY['agent_reply']::"WebhookEvent"[] WHERE direction='outbound';`
- **Default na criação:** webhooks de **saída** novos nascem com
  `['agent_reply']` (lógica do `createWebhook`), evitando a janela em que um
  outbound criado entre a migration e a Onda C não receberia nada.
- **UI:** seletor de eventos (checkbox) no `webhook-wizard.tsx` (passo 2) e
  `webhook-edit-dialog.tsx`, só para direção **saída**.
- **Emissor:** dispara para todos os outbound **habilitados com `agent_reply`**
  (substitui o `findFirst` hard-coded, `route.ts:199`).
- **Protocolo de schema (banco compartilhado):** avisar o usuário, `agente
  schema-changed`, mergear cedo, coordenar com `feat/nex-reconstrucao`.

## 12. Monitoramento (aba Chat)

- Label "Bubble" → "Chat" (`monitoramento-nav.tsx`; textos da page). Rota mantida.
- **Enumerar e ampliar as 9 ocorrências** de `channel:"in_app"` em
  `monitoramento-bubble.ts` (linhas ~61,67,83,96,146,160,177,189 + helpers) para
  `channel:{ in:["in_app","whatsapp"] }`.
- Marcador de canal por sessão (Bubble/WhatsApp) em `bubble-monitor-row.tsx`. O
  marcador de **áudio já existe** (`Message.kind="audio"` + `isAudio`, #125) ,
  reusar.
- Sessões WhatsApp exibem "sem avaliação"; status "ativa" pelo helper §10.
- **Conflito com `feat/nex-reconstrucao`** (arquivos `monitoramento-content.tsx`,
  `kpis-block.tsx`, `bubble-monitor*.tsx`, `monitoramento-nav.tsx`): onda **por
  último**, commits pequenos por arquivo, merge resolvido por mim.

## 13. Segurança + runbook do n8n (entregável de doc)

- HMAC pronto. Runbook cobre: assinar com **timestamp atual a cada (re)envio**
  (anti-replay ±5min); os **2 webhooks** (entrada + receptor da resposta);
  **validar a HMAC** do `agent.reply` no n8n e **deduplicar por `deliveryId`**;
  mapear os campos do payload da Meta (§3); e o aviso de que o **contrato de saída
  mudou** (§7 breaking).
- `WhatsappChannel` (singleton `id:"global"`) é o caminho vivo; `WhatsappInstance`
  (R6) dorme. Mantemos o singleton; **unificar fica fora de escopo** (dívida
  documentada). `phoneNumberId` da resposta vem do payload, não do singleton.

## 14. Sub-fases (ondas) e dependências , decomposição para o plano

- **Onda 0 , Schema de eventos:** migration `WebhookEvent`/`events` + backfill
  (cast) + default na criação. PRIMEIRA (banco compartilhado).
- **Onda A , decomposta em unidades testáveis:**
  - A1: resolução por variantes (`resolve.ts`, ~3 linhas) , trivial.
  - A2: contrato de entrada (`inbound-payload.ts` validação cruzada `text`;
    `route.ts` repassa `text`/`phoneNumberId`; `AgentJobData`).
  - A3: áudio , `processor.ts` curto-circuita download/transcrição quando `text`
    veio; passa `isAudio:true`; `text` vazio ⇒ resposta amigável.
  - A4: lock por usuário (`processor.ts`, padrão de `worker/index.ts:220`).
  - A5: gate de avaliação por canal (`run-agent.ts` ~1422/1721).
- **Onda B , Resposta rica + entrega idempotente:** estender `RunAgentResult`
  (2 ramos), agregar `reasoningMs`/`tools`, idempotência §6, envelope §7,
  `url`→`targetUrl`, fail-closed.
- **Onda C , Webhook por evento (UI + emissor):** §11.
- **Onda D , Monitoramento (aba Chat):** §9 (só sessões), §10, §12. `ui-ux-pro-max`.
- **Onda E , Runbook n8n + verificação e2e final.**

Dependências: 0 → C; A1-A5 independentes entre si (podem paralelizar); A → B; D
por último. Cada item de A e cada onda tem teste isolado (§15).

## 15. Verificação (regra de raiz)

`tsc`+`eslint`+`jest` por unidade **e** e2e contra dado real: subir worker/app,
disparar inbound assinado , inclusive um número **sem o 9** cadastrado **com** o
9 (valida A1), um `type:"audio"` com `text` (valida A3), e duas mensagens
seguidas do mesmo usuário (valida o lock A4: uma conversa, sem sobrescrita).
Conferir: ausência de `ConversationQualityEvaluation` para whatsapp; webhook de
saída com envelope rico; e idempotência (forçar falha de POST → retry **não**
re-roda o agente nem duplica).

## 16. Pendências menores (não bloqueiam o plano)

1. Confirmar no E2E se o outbound usa `url` ou `targetUrl` hoje (corrigir , §7).
2. Granularidade da contagem por canal no monitoramento de colaboradores (marcar
   cada sessão basta? ou separar contagem in-app vs WhatsApp por pessoa?).
3. Fuso do teto diário (`route.ts:170` usa meia-noite do servidor; conferir BR).
4. `messageType` futuros (imagem/documento) , fora de escopo; enum extensível.
