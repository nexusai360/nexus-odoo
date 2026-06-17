# F5 , Integração WhatsApp ↔ Agente Nex via n8n/Webhook (SPEC v1)

> **Status:** SPEC v1 (rascunho da sessão de 2026-06-17). Passa por 2 reviews
> adversariais (→ v2 → v3) antes do plano, conforme `CLAUDE.md §6`.
> **Branch:** `feat/router-ativacao-r2` (decisão do usuário: seguir nela).
> **Escopo:** a fatia da F5 que liga o WhatsApp ao Agente Nex pela ponte n8n,
> reusando a infra já madura (endpoint inbound, HMAC, fila, sessão 24h). NÃO é a
> F5 inteira , agente, chat, monitoramento e cadastro de número já existem.

---

## 1. Objetivo

Permitir que um colaborador converse com o Agente Nex **pelo WhatsApp**, com a
mesma inteligência do chat in-app, usando o **n8n** como intermediário entre a
Meta e a nossa plataforma. E refletir essa nova origem no **monitoramento**
(sessões e avaliações), distinguindo claramente WhatsApp de chat in-app.

Fluxo macro (decisão: **assíncrono, 2 webhooks**):

```
Usuário (WhatsApp) → Meta → n8n (trata, transcreve áudio, assina) 
   → [Webhook ENTRADA] POST /api/integrations/whatsapp/inbound (HMAC)
        → resolve usuário pelo número → sessão (janela 24h) → fila `agent`
   → worker: runAgent (MCP da F4) → monta resposta + payload rico
   → emite evento `agent.reply` → [Webhook SAÍDA] POST no n8n (HMAC)
   → n8n (nó Webhook receptor) correlaciona pelo messageId/número → entrega ao usuário
```

## 2. Decisões travadas (2026-06-17)

1. **Resposta assíncrona, 2 webhooks.** A plataforma confirma o recebimento na
   hora (`202 queued`) e, quando o agente termina, **dispara um webhook de
   saída** com a resposta rica para o n8n. Robusto contra timeout (o agente pode
   levar 30-60s+ com tools); reusa a fila BullMQ que já existe.
2. **Webhook por evento, camada extensível, só `agent.reply` agora.** Adiciona-se
   o conceito de "evento" ao webhook (seleção na UI + persistência), mas só o
   evento "resposta do Agente Nex" é implementado de fato. Catálogo preparado
   para eventos futuros, sem construí-los (YAGNI).
3. **Origem distinta no monitoramento:** `Agente Nex · Bubble`,
   `Agente Nex · WhatsApp`, `Backtest`.
4. **Sem avaliação automática para WhatsApp.** Mensagens via WhatsApp não geram
   `ConversationQualityEvaluation` (o "Judge"). Feedback do usuário (voto) também
   não se aplica (não há UI no WhatsApp).
5. **Sessão WhatsApp = janela de 24h.** Sem encerramento manual (não há botão no
   WhatsApp). 24h sem mensagem ⇒ a próxima mensagem abre nova sessão.
6. **Áudio chega já transcrito** do n8n: a plataforma recebe `text` + um
   indicador de tipo (`text`/`audio`); não baixa nem transcreve mídia do WhatsApp.
7. **Aba de monitoramento "Bubble" → "Chat"** (engloba in-app + WhatsApp).

## 3. O que já existe (reuso, não refazer)

| Peça | Onde | Estado |
|---|---|---|
| Endpoint inbound + HMAC fail-closed + idempotência + rate-limit + teto diário | `src/app/api/integrations/whatsapp/inbound/route.ts` | Pronto |
| Verificação/assinatura HMAC (anti-replay ±5min) | `src/lib/whatsapp/hmac.ts` | Pronto |
| Resolução número→usuário | `src/lib/whatsapp/resolve.ts` (`resolveWhatsappUser`) | Pronto |
| Sessão WhatsApp janela 24h | `src/lib/agent/conversation.ts` (`getOrCreateWhatsappConversation`, `WHATSAPP_REUSE_WINDOW_MS`) | Pronto |
| Fila + worker do agente | `src/worker/agent/processor.ts` | Pronto |
| Disparo de webhook de saída (assinado, retry) | `processor.ts` (`sendViaWebhook`) | Pronto (payload pobre) |
| Modelo de webhook (direção, secret, métodos) | `prisma/schema.prisma` (`WhatsappWebhook`) + UI `webhook-wizard.tsx`/`webhook-edit-dialog.tsx` | Pronto (sem evento) |
| Canal `whatsapp` no enum | `AgentChannel` (`prisma/schema.prisma`) | Pronto |
| Coluna Origem + labels | `evaluations-table.tsx`, `rodada-labels.ts` | Pronto (in_app e whatsapp colapsados) |
| Monitoramento (3 colunas, polling) | `bubble-monitor.tsx`, `monitoramento-bubble.ts` | Pronto (preso a `in_app`) |
| Persistência rica de execução (tools, tempo, tokens) | `LlmUsage` (`toolNames`, `toolCallsCount`, `reasoningTokens`, `durationMs`) | Pronto (não exposto no retorno) |

## 4. Contrato , Webhook de ENTRADA (n8n → plataforma)

Refinar contra o exemplo real do payload da Meta (o usuário enviará). Campos que
o n8n deve nos mandar (corpo JSON, assinado por HMAC):

| Campo | Tipo | Obrigatório | Uso |
|---|---|---|---|
| `messageId` | string | sim | Idempotência (`ProcessedWhatsappMessage`); correlação na resposta |
| `from` | string E.164 | sim | **Chave**: resolve o usuário pelo número |
| `timestamp` | number (epoch ms) | sim | Ordenação / anti-replay |
| `messageType` | `"text" \| "audio"` | sim | Indica se a origem foi áudio (marca `Message.kind`) |
| `text` | string | sim | Conteúdo (áudio já vem transcrito) |
| `contactName` | string | opcional | Exibição no monitoramento (título de sessão amigável) |

Mudança vs hoje: o endpoint deixa de esperar `audioMediaId`/`imageMediaId` para
o WhatsApp via n8n (o n8n já transcreve). Mantém-se compatibilidade: se vier
`messageType:"audio"`, grava `Message.kind = "audio"` e segue só com o `text`.

Headers de segurança (já implementados): `X-Signature` (HMAC-SHA256 de
`${timestamp}.${body}`), `X-Timestamp`.

## 5. Contrato , Webhook de SAÍDA (plataforma → n8n), evento `agent.reply`

Envelope por evento (novo formato, assinado por HMAC):

```jsonc
{
  "event": "agent.reply",
  "data": {
    "messageId": "<id da mensagem de entrada, p/ correlação>",
    "to": "<número E.164 do usuário>",
    "sessionId": "<conversationId>",
    "reply": "<texto da resposta do agente>",
    "suggestions": ["...", "..."],        // N conforme config (maxSuggestions)
    "tools": ["faturamento_periodo", "..."], // nomes das tools chamadas
    "reasoningMs": 4200,                    // tempo de raciocínio agregado
    "usage": { "tokensInput": 0, "tokensOutput": 0, "costUsd": 0 },
    "messageType": "text"                   // ecoa o tipo recebido
  },
  "timestamp": 1718630000000
}
```

Requer: estender `RunAgentResult` para expor `toolsCalled`, `reasoningMs`,
`suggestionsCount` (hoje só `message`/`suggestions`/`usage`/`messageId`);
agregar a latência (hoje só por iteração em `durationMs`); enriquecer
`sendViaWebhook` para emitir o envelope por evento.

## 6. Camada de eventos do webhook

- **Modelo:** adicionar `events String[]` (ou enum `WebhookEvent`) ao
  `WhatsappWebhook`. Catálogo inicial: `agent.reply` (único implementado).
- **UI:** no `webhook-wizard.tsx` (passo 2) e no `webhook-edit-dialog.tsx`,
  seletor de eventos (checkbox/lista) para webhooks de **saída**.
- **Emissor/roteador:** ao terminar a resposta, a plataforma seleciona os
  webhooks de saída habilitados **que incluem o evento `agent.reply`** e dispara
  o envelope (§5). Substitui o disparo hard-coded atual (que pega o primeiro
  outbound). Mantém retry da fila.
- **Migration de schema:** muda `prisma/schema.prisma` ⇒ **aviso obrigatório ao
  usuário + `agente schema-changed`** (banco compartilhado com a outra frente).

## 7. Origem (Bubble vs WhatsApp)

- Hoje `channelToOrigem` (`rodada-labels.ts`) colapsa `in_app` e `whatsapp` em
  "Agente Nex". Separar em duas origens virtuais: `agente-nex-bubble` e
  `agente-nex-whatsapp`, com labels "Agente Nex · Bubble" / "Agente Nex · WhatsApp".
- Ajustar o agrupamento do filtro de origem (`queries.ts` `getDistinctRodadas`).
- A origem deriva do `Conversation.channel` (já distingue os dois) , não precisa
  de coluna nova.

## 8. Sessão WhatsApp + sem avaliação

- Sessão: reusar `getOrCreateWhatsappConversation` (janela 24h já pronta).
  Encerramento: avaliar entre **(a) lazy** (não escrever `endedAt`; "encerrada" =
  `updatedAt` fora dos 24h, calculado na query) e **(b) job leve** que escreve
  `endedAt` após 24h. Recomendação v1: **(a) lazy** (zero cron novo; o
  monitoramento calcula o estado). A definir na review.
- Sem avaliação: condicionar `createPendingEval` (`run-agent.ts` ~:1419) e
  `createTechnicalFailureEval` (~:1717) a **pular quando `channel === "whatsapp"`**.
  Passar o `channel`/`source` ao gate de qualidade.

## 9. Monitoramento (aba Chat)

- Renomear label "Bubble" → "Chat" (`monitoramento-nav.tsx`; textos da page).
  Rota `/agente/monitoramento/bubble`: manter o path por ora (renome de rota é
  cosmético e propaga deep-links) , decidir na review.
- Ampliar as queries de `monitoramento-bubble.ts` de `channel:"in_app"` para
  `channel: { in: ["in_app","whatsapp"] }`.
- Marcador visual de canal por sessão (Bubble vs WhatsApp) em
  `bubble-monitor-row.tsx`.
- Sessões WhatsApp exibem estado "sem avaliação" (não há Judge nem voto).
- **ATENÇÃO , conflito com a outra frente:** o agente `feat/nex-reconstrucao`
  mexeu recentemente no monitoramento (#126). Esta onda (UI de monitoramento) é a
  **última** da execução, para minimizar colisão; coordenar com o usuário se a
  outra frente ainda estiver ativa lá.

## 10. Segurança + orientação n8n (entregável de doc)

- HMAC já pronto dos dois lados. Entregável: **runbook de configuração do n8n** ,
  como assinar (`X-Signature`/`X-Timestamp`), os 2 webhooks (entrada e o receptor
  da resposta), e como correlacionar a resposta pelo `messageId`.
- Modo de resposta (`WhatsappChannel.responseMode`) fixado em `n8n_webhook` para
  este fluxo.

## 11. Sub-fases (ondas) e sequência

- **Onda A , Entrada + sessão + sem-avaliação (backend):** ajustar contrato de
  entrada (`messageType`/`text` transcrito), garantir origem por `channel`,
  condicionar avaliação por canal. E2E: simular inbound assinado → vê sessão e
  resposta, sem pending eval.
- **Onda B , Payload de resposta rico:** estender `RunAgentResult` + agregação de
  latência + enriquecer `sendViaWebhook`. E2E: inbound → webhook de saída com
  `tools`/`reasoningMs`/`suggestions`.
- **Onda C , Webhook por evento:** schema (`events`), UI de seleção, emissor por
  evento. E2E: webhook outbound marcado com `agent.reply` recebe o envelope.
- **Onda D , Monitoramento (UI, por último):** aba Chat, sessões WhatsApp, origem
  separada, marcador de canal. `ui-ux-pro-max` obrigatório, inline.
- **Onda E , Doc/runbook do n8n + verificação e2e final.**

## 12. Verificação

`tsc` + `eslint` + `jest` por onda **e** e2e contra dado real (regra de raiz):
subir o worker/app, disparar um inbound assinado de teste, conferir a sessão, a
ausência de avaliação, e o webhook de saída com o payload rico.

## 13. Pendências / decisões abertas (para a review e o usuário)

1. **Payload real da Meta** (o usuário enviará) , confirmar campos do §4.
2. **Encerramento de sessão**: lazy (§8a) vs job (§8b).
3. **Renome de rota** `/bubble` → `/chat` (cosmético, propaga deep-links): fazer
   agora ou só o label?
4. **Múltiplos webhooks de saída** com o mesmo evento: disparar para todos os
   habilitados? (v1: sim, todos os outbound habilitados com `agent.reply`.)
5. **`messageType` futuros** (imagem/documento): fora do escopo agora (só
   text/audio), mas o enum deve permitir extensão.
