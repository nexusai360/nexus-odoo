# F5 , Integração WhatsApp ↔ Agente Nex via n8n/Webhook (SPEC v2)

> **Status:** SPEC v2 (achados das 2 reviews adversariais aplicados sobre a v1).
> Passa por uma 2ª rodada de review → v3 antes do plano (`CLAUDE.md §6`).
> **Branch:** `feat/router-ativacao-r2`.
> **Mudou da v1 → v2:** contrato de entrada calibrado pelo **payload real da Meta**;
> resolução de usuário passa a tratar o **nono dígito** (a Meta manda sem o 9);
> serialização por usuário; entrega idempotente sem re-rodar o agente; payload
> rico computado no turno (não via `LlmUsage`); gate de avaliação no `run-agent`
> por canal; envelope de saída com `deliveryId`+`kind`; heartbeat suprimido no
> WhatsApp; correção do bug `url`/`targetUrl`; contradição de origem resolvida.

---

## 1. Objetivo

Permitir conversa com o Agente Nex **pelo WhatsApp**, com a mesma inteligência do
chat in-app, usando o **n8n** entre a Meta e a plataforma, e refletir a nova
origem no monitoramento. Reusa a infra madura (endpoint inbound, HMAC, fila,
sessão 24h). **Não** é a F5 inteira , agente/chat/monitoramento/cadastro de
número já existem.

Fluxo macro (**assíncrono, 2 webhooks** , decisão travada):

```
Usuário(WhatsApp) → Meta → n8n (extrai campos, transcreve áudio, assina HMAC)
  → [ENTRADA] POST /api/integrations/whatsapp/inbound (HMAC nosso)
       → resolve usuário pelo número (com equivalência do nono dígito)
       → serializa por usuário → sessão (janela 24h) → fila `agent`
  → worker: runAgent (MCP da F4) → persiste resposta + computa payload rico
       → marca idempotência de saída → emite evento `agent.reply`
  → [SAÍDA] POST nos webhooks outbound habilitados p/ `agent.reply` (HMAC nosso)
  → n8n (nó "Webhook" receptor) correlaciona por messageId/deliveryId → entrega
```

## 2. Decisões travadas

1. **Resposta assíncrona, 2 webhooks** (confirma 202 na hora; entrega depois).
2. **Camada de eventos no webhook , implementada agora** (decisão do usuário
   2026-06-17): campo de eventos no `WhatsappWebhook` + seletor na UI; emissor
   roteia por evento. Único evento real: `agent.reply`.
3. **Origem distinta:** `Agente Nex · Bubble` (in-app) e `Agente Nex · WhatsApp`
   no **monitoramento de sessões**; `Backtest`/`Playground` como hoje. **Na tabela
   de avaliações não há linha de WhatsApp** (WhatsApp não gera avaliação , §8).
4. **Sem avaliação automática para WhatsApp** (sem `ConversationQualityEvaluation`).
   A **inteligência** (memória/resumo/tags) continua rodando (ajuda o agente).
5. **Sessão WhatsApp = janela de 24h**; sem encerramento manual.
6. **Áudio chega já transcrito** do n8n (`type:"audio"` + `text`); a plataforma
   não baixa nem transcreve mídia neste fluxo.
7. **Monitoramento: aba "Bubble" → "Chat"** (só o label; a rota `/bubble`
   permanece , o deep-link `?eval=` aponta para a aba Backtest, não muda).
8. **Heartbeat suprimido no WhatsApp** (decisão do usuário): o usuário recebe só
   a resposta final.
9. **Esta entrega inclui o monitoramento** (decisão do usuário), assumindo
   resolução de conflitos no merge com a frente `feat/nex-reconstrucao`.

## 3. Contrato , Webhook de ENTRADA (n8n → plataforma)

Calibrado pelo payload real da Meta (WhatsApp Cloud). O n8n extrai de
`body.entry[0].changes[0].value` e nos envia (corpo JSON, assinado por HMAC):

| Nosso campo | Origem no payload Meta | Obrig. | Uso |
|---|---|---|---|
| `from` | `messages[0].from` (= `contacts[0].wa_id`) | sim | **chave** → usuário |
| `text` | `messages[0].text.body` ou transcrição do áudio | sim | conteúdo |
| `type` | `messages[0].type` | sim | `text`/`audio` (mantém o nome `type`) |
| `messageId` | `messages[0].id` (`wamid...`) | sim | idempotência + correlação |
| `timestamp` | `messages[0].timestamp` (**segundos**) | sim | ordenação (normalizar p/ ms) |
| `contactName` | `contacts[0].profile.name` | opcional | exibição no monitoramento |
| `phoneNumberId` | `metadata.phone_number_id` | opcional | rotear a resposta pelo nº certo |

**Regras (correções da review):**
- **NÃO renomear `type`** (o `inboundSchema`, `AgentJobData`, `processor.ts` e os
  testes usam `type`). Mantém `type`; `image` permanece no enum mas é rejeitado
  com mensagem amigável neste fluxo (fora de escopo agora).
- **`timestamp` em segundos** (10 dígitos) é normalizado para ms na borda.
- **Validação cruzada:** `type ∈ {text,audio}` exige `text` não-vazio; se vier
  vazio, responder algo amigável (não `throw`, que mataria o job e entraria em
  retry , bug atual em `processor.ts` ao faltar `text`).
- **Áudio:** `type:"audio"` + `text` (já transcrito) ⇒ grava `Message.kind="audio"`
  (campo já existe) e segue com o `text`; **não** baixa/transcreve. Garantir que
  o caminho WhatsApp→`runAgent` passe `kind:"audio"` (hoje o processor chama
  `runAgent` sem `kind`).

Headers de segurança (já prontos): `X-Signature` = HMAC-SHA256 de
`${timestamp}.${body}`, `X-Timestamp`. A assinatura **da Meta**
(`x-hub-signature-256`) é validada **no n8n**; a nossa é entre n8n↔plataforma.

## 4. Resolução do usuário pelo número , com nono dígito (CRÍTICO)

O payload real veio `553491908624` , **sem o nono dígito**. A resolução atual
(`resolveWhatsappUser` → `findUnique({ phoneE164 })`, busca **exata**) falharia
para quem cadastrou com o 9. Correção:

- `resolveWhatsappUser` passa a buscar por **todas as variantes** do número
  (`phoneVariants` de `src/lib/whatsapp/countries.ts`, já implementado): `where:
  { phoneE164: { in: phoneVariants(e164) } }`, mesma equivalência usada no
  cadastro. Assim, número com ou sem o 9 casa com o usuário.
- Mantém o resto (status `ok`/`inactive`/`unknown`, auditoria de rejeição).

## 5. Concorrência e ordem , serialização por usuário (CRÍTICO)

Duas mensagens do mesmo número em sequência hoje viram 2 jobs paralelos
(BullMQ concorrência > 1), podendo (a) criar **duas conversas** para a mesma
janela de 24h (corrida em `getOrCreateWhatsappConversation`, sem unique), e (b)
sobrescrever `reasoningHistory`/`focoAtual` (read-modify-write, last-write-wins),
e (c) responder fora de ordem.

**Decisão:** serializar o processamento **por usuário**:
- Lock leve no Redis por `userId` (chave `agent:lock:{userId}`) que envolve o par
  `getOrCreateWhatsappConversation` + `runAgent` + persistência; jobs do mesmo
  usuário processam em série (na ordem de chegada, por `timestamp`).
- (Alternativa avaliada na review: unique constraint parcial "1 conversa
  whatsapp ativa por usuário" , exige migration; o lock Redis evita schema-change
  e já resolve a corrida. Adotado o lock.)

## 6. Geração vs entrega , idempotência de saída (CRÍTICO)

Hoje o job acopla "gerar resposta" (caro, não-determinístico) com "entregar"
(POST ao n8n). Como `sendViaWebhook` lança em falha/timeout (15s) e o job tem
`attempts:3`, um retry **re-roda o agente inteiro** e **duplica** a resposta.

**Decisão:**
- Ao concluir o turno, **persistir a resposta** (já há `Message` do assistant) e
  gravar idempotência de saída `whatsapp:replied:{messageId}` (Redis, TTL).
- O **disparo de saída é idempotente**: se `replied:{messageId}` já existe, não
  re-gera nem re-roda o agente; no máximo reentrega o payload já persistido.
- Falha de POST ao n8n faz retry **só da entrega** (reusa o payload persistido),
  nunca re-executa `runAgent`.
- **Heartbeat suprimido** no WhatsApp (decisão #8) , um disparo de saída por
  mensagem (o `agent.reply` final), além de eventuais `notice` de fallback.

## 7. Contrato , Webhook de SAÍDA (plataforma → n8n), evento `agent.reply`

Envelope assinado por HMAC (timestamp atual no disparo). `RunAgentResult` é
**union discriminada** (`ok:true | ok:false`) , o envelope cobre os dois:

```jsonc
{
  "event": "agent.reply",
  "deliveryId": "<uuid único por disparo, idempotência no n8n>",
  "kind": "final",                  // "final" | "notice" (fallback)
  "data": {
    "inboundMessageId": "wamid...",  // correlação/thread (id da Meta)
    "to": "553491908624",            // número do usuário
    "phoneNumberId": "593237780533272", // por qual nº responder (ecoa entrada)
    "sessionId": "<conversationId>",
    "assistantMessageId": "<id da Message do assistant, auditoria>",
    "ok": true,
    "reply": "<texto da resposta>",          // ok:false ⇒ mensagem de erro amigável
    "suggestions": ["...", "..."],            // [] quando ok:false
    "tools": ["faturamento_periodo", "..."],  // nomes das tools do turno
    "reasoningMs": 4200,                       // latência agregada do turno
    "usage": { "tokensInput": 0, "tokensOutput": 0, "costUsd": 0 },
    "messageType": "text"
  },
  "timestamp": 1718630000000
}
```

**Plumbing necessário (Onda B):**
- Estender `RunAgentResult` (ambos os ramos): adicionar `toolsCalled: string[]`
  (de `allTurnToolNames`) e `reasoningMs` (somar os `durationMs` das iterações
  **em memória durante o turno** , `LlmUsage` é por **conversa**, não por turno,
  então não serve para agregação por resposta).
- `assistantMessageId` (Message) ≠ `inboundMessageId` (Meta) , campos distintos.
- **Sem `suggestionsCount`** (deriva de `suggestions.length`).
- **Bug a corrigir:** o disparo lê `outboundWebhook.url`, mas R6 introduziu
  `targetUrl` para saída , possivelmente o outbound está **quebrado hoje**.
  Padronizar no campo canônico (`targetUrl`) e remover a leitura de `url`.
- **Fail-closed:** se o secret de saída não descriptografar, **não disparar**
  (hoje assina com string vazia e envia mesmo assim , vazaria a resposta sem HMAC).

## 8. Sem avaliação para WhatsApp (gate no lugar certo)

A review mostrou que `createPendingEval`/`createTechnicalFailureEval`
(`quality/trigger.ts`) **não** recebem canal, e são compartilhados por outros
caminhos (ex.: replay). **Não** alterar `trigger.ts`. O gate vai no `run-agent`:
- Envolver os dois blocos `void (async ...)` (em `run-agent.ts` ~:1424 e ~:1723)
  com `if (args.channel !== "whatsapp") { ... }` (o `runAgent` já recebe
  `channel`/`source`).
- **Inteligência continua:** `enqueueTopicTagging` / `enqueueResumoConversa`
  (memória/contexto, não avaliação) seguem rodando para WhatsApp.
- **KPIs/denominador:** os agregados de qualidade do monitoramento devem filtrar
  `channel:"in_app"` (excluir WhatsApp do denominador de "% avaliado"), senão a
  métrica de qualidade fica diluída por sessões que nunca avaliam.

## 9. Origem (contradição resolvida)

- **Tabela de avaliações (aba Backtest):** WhatsApp **não aparece** (não gera
  eval). Para in-app, o label da origem "Agente Nex" passa a "Agente Nex · Bubble"
  (separar `in_app` de `whatsapp` em `channelToOrigem`/`ORIGEM_LABELS`,
  ajustando `getDistinctRodadas`). Não afeta a numeração de rodadas (decisão #11
  do CLAUDE.md): origens virtuais entram por fora, não na sequência RX.
- **Monitoramento de sessões (aba Chat):** cada sessão marcada com seu canal
  (Bubble vs WhatsApp). É aqui que a origem WhatsApp aparece de fato.

## 10. Sessão WhatsApp + estado no monitoramento

- Reusa `getOrCreateWhatsappConversation` (janela 24h pronta).
- **Encerramento lazy** (sem cron novo), mas o monitoramento precisa de um
  **helper único de status por canal**: in_app ⇒ "ativa" = `endedAt IS NULL`;
  whatsapp ⇒ "ativa" = `endedAt IS NULL AND updatedAt >= now()-24h` (senão toda
  sessão WhatsApp apareceria eternamente "ativa", pois `endedAt` nunca é setado).

## 11. Webhook por evento (implementar agora , decisão do usuário)

- **Schema:** enum `WebhookEvent { agent_reply }` + campo `events WebhookEvent[]`
  em `WhatsappWebhook` (default `[]`). Serializa para `"agent.reply"` no envelope.
- **Backfill obrigatório na migration:** `UPDATE whatsapp_webhooks SET events =
  ARRAY['agent_reply'] WHERE direction='outbound'` , senão os outbound existentes
  param de receber (regressão silenciosa).
- **UI:** seletor de eventos (checkbox) no `webhook-wizard.tsx` (passo 2) e no
  `webhook-edit-dialog.tsx`, só para direção **saída**.
- **Emissor:** dispara para todos os outbound **habilitados que incluem
  `agent_reply`** (substitui o `findFirst` hard-coded atual).
- **Protocolo de schema (banco compartilhado):** avisar o usuário, rodar `agente
  schema-changed`, e recomendar mergear esta migration cedo (coordenar com
  `feat/nex-reconstrucao`). É a **primeira onda** (Onda 0).

## 12. Monitoramento (aba Chat) , incluído nesta entrega

- Label "Bubble" → "Chat" (`monitoramento-nav.tsx`; textos da page). Rota mantém.
- Queries de `monitoramento-bubble.ts`: `channel:"in_app"` → `channel:{ in:
  ["in_app","whatsapp"] }`.
- Marcador de canal por sessão (Bubble/WhatsApp) em `bubble-monitor-row.tsx`. O
  marcador de **áudio já existe** (`Message.kind="audio"` + `isAudio`, veio no
  #125) , reusar.
- Sessões WhatsApp exibem estado "sem avaliação".
- Status "ativa" por canal (§10).
- **Conflito com `feat/nex-reconstrucao`:** os arquivos
  (`monitoramento-content.tsx`, `kpis-block.tsx`, `bubble-monitor*.tsx`,
  `monitoramento-nav.tsx`) são disputados. Decisão do usuário: fazer agora e
  resolver no merge. Mitigação: esta onda é a **última** da execução e os commits
  ficam pequenos/atômicos por arquivo para facilitar o merge.

## 13. Segurança + runbook do n8n (entregável de doc)

- HMAC pronto dos dois lados. Runbook cobre: assinar com **timestamp atual a cada
  (re)envio** (nunca reusar o timestamp da Meta , o anti-replay é ±5min); os **2
  webhooks** (entrada + receptor da resposta); **validar a HMAC** do `agent.reply`
  no n8n e **deduplicar por `deliveryId`/`messageId`** (idempotência do lado dele);
  e como mapear os campos do payload da Meta (§3).
- `WhatsappChannel` (singleton `id:"global"`) é o que o `route` usa hoje;
  `WhatsappInstance` (R6) coexiste no schema mas **não** é o caminho vivo. Este
  fluxo mantém o singleton; **unificar os dois modelos fica fora de escopo** (só
  documentar a dívida).

## 14. Sub-fases (ondas) e dependências

- **Onda 0 , Schema de eventos:** migration `WebhookEvent`/`events` + backfill.
  PRIMEIRA (banco compartilhado; aviso + `agente schema-changed`).
- **Onda A , Entrada + identidade + concorrência + sem-avaliação:** contrato §3,
  resolução por variantes §4, serialização §5, gate de avaliação §8, áudio
  transcrito. E2E: inbound assinado → usuário resolvido (com e sem 9) → sessão →
  sem pending eval.
- **Onda B , Resposta rica + entrega idempotente:** estender `RunAgentResult`,
  agregar `reasoningMs`/`tools`, persistir + idempotência §6, envelope §7,
  corrigir `url`→`targetUrl` + fail-closed. E2E: inbound → 1 webhook de saída com
  payload rico; retry não duplica nem re-roda o agente.
- **Onda C , Webhook por evento (UI + emissor):** seletor §11, roteamento por
  evento. E2E: outbound marcado com `agent.reply` recebe; sem marcação não recebe.
- **Onda D , Monitoramento (aba Chat):** §9, §10, §12. `ui-ux-pro-max`, inline.
- **Onda E , Runbook n8n + verificação e2e final** contra dado real.

Dependências: 0 → C; A → B; D por último (mitiga conflito). 0 e A podem começar
em paralelo (não se tocam).

## 15. Verificação (regra de raiz)

`tsc`+`eslint`+`jest` por onda **e** e2e contra dado real: subir worker/app,
disparar inbound assinado de teste (inclusive um número **sem o nono dígito** que
exista cadastrado **com** o 9), conferir resolução, ausência de avaliação,
serialização (2 mensagens seguidas), e o webhook de saída com payload rico +
idempotência (forçar retry e checar que não duplica).

## 16. Pendências remanescentes (para a 2ª review e o usuário)

1. Confirmar, no E2E, se o outbound usa `url` ou `targetUrl` hoje (bug §7).
2. Granularidade da "contagem por canal" no monitoramento de colaboradores
   (marcar cada sessão basta, ou separar contagem in-app vs WhatsApp por pessoa?).
3. Fuso do teto diário (`route.ts` usa meia-noite do servidor; conferir BR).
4. `messageType` futuros (imagem/documento) , fora de escopo, enum permite extensão.
