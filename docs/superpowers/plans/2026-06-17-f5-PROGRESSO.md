# F5 WhatsApp ↔ Nex via webhook , PROGRESSO (ponto de retomada)

> Atualizado a cada bloco/commit. Em modo autônomo (CLAUDE.md §6). Branch
> `feat/router-ativacao-r2`. Se você é uma sessão nova, leia: este arquivo, a
> SPEC v4, o PLAN, e `git log` recente.

## Documentos
- **SPEC v4 (final, aprovada pelo usuário):** `docs/superpowers/specs/2026-06-17-f5-whatsapp-nex-webhook-design.md`
- **PLAN:** `docs/superpowers/plans/2026-06-17-f5-whatsapp-nex-webhook.md`

## Estado atual (2026-06-17)
- [x] Brainstorm + SPEC v1 → v2 → v3 → v4 (2 reviews + esclarecimentos do usuário).
- [x] PLAN v1 escrito (subagente Opus).
- [x] 2 reviews adversariais do PLAN aplicadas → **PLAN v2 (pronto para execução)**.
      Achado "phoneVariants não existe" era FALSO (existe em countries.ts:180).
- [x] **Onda A backend (A1-A4)** , A1 `01b8346`, A2 `96e6ec8`/`e55274c`, A3 `ec75e55`, A4 `b2a51e6`/`49679bd`.
- [x] **Onda 0 (migration, banco compartilhado)** `a76eba6` , enums WebhookEvent/ChannelAccessLevel + campos events/bubble&whatsappAccessLevel + backfill. `agente schema-changed` disparado (avisa a outra frente). DRIFT pré-existente de outra frente detectado (FKs/índices/router_threshold) , NÃO é da F5; o executor evitou `migrate reset` (que apagaria o banco) criando a migration via db execute + migrate resolve. Registrar no RADAR.
- [x] **Onda A5 (barreiras)** , A5.1 `e78b9b7` (catálogo BlockReason), A5.2 `d589df0` (roleMeetsChannelLevel+herança), A5.3 `a8f289e` (emitAgentReply envelope §7 HMAC fail-closed), A5.4 `4451a4c` (L1/L2 no inbound, kind:"blocked").
- [x] **Onda B (resposta rica + idempotência)** , B.1/B.2 `c2bef06` (RunAgentResult+toolsCalled/reasoningMs+deniedModule/allowedModules), B.3 `7d7e50d` (build-reply-data), B.4-6 `c822578` (idempotência ANTES do lock; 5 call-sites de sendViaWebhook migrados p/ dispatchReply/Notice; outboundTargets[]; heartbeat suprimido; targetUrl??url). Verif `11bc2e7`/`8240597`.
- **Estado:** tsc 0, eslint 0, jest 124 passed / 7 skipped. BACKEND da F5 COMPLETO.
- [x] **Onda C (acesso por canal/nível, UI inline + ui-ux-pro-max)** , C.1/C.2 DTO+updateAgentAvailability por níveis; C.3 `channelLevelOptions` derivado dos roles; C.4 2x `SegmentedControl<ChannelAccessLevel>` no `agent-availability-card` + `summarizeAvailability` por níveis + page.tsx; C.5 gate `bubbleVisible` por `roleMeetsChannelLevel` em layout.tsx; C.6 **parte de código** (removidos `updateBubbleEnabled` + booleans dos DTOs/Row/map/test). tsc 0, eslint 0 (warnings pré-existentes), jest verde. **DROP de coluna DEFERIDO** (banco compartilhado; `feat-nex-reconstrucao` e `feat-deploy-producao` ainda leem os booleans) , ver RADAR `R-f5-drop-booleans-legados`. L2 WhatsApp já consome `whatsappAccessLevel` desde A5.4.
- [x] **Onda D (webhook por evento)** , D.1 campo `events` no `createSchema`/update + default `["agent_reply"]` em outbound (inbound sempre `[]`); D.3 filtro `events:{has:"agent_reply"}` no `loadOutboundTargets` do inbound (worker reusa esses targets via jobData, ponto único); D.2 UI inline (ui-ux-pro-max): seção "Eventos" no `webhook-wizard` (passo 2, só outbound) e no `webhook-edit-dialog` (só outbound), checkbox/toggle acessível + aviso suave quando vazio; `WebhookListItem.events` exposto pelo `listWebhooks` p/ hidratar a edição. tsc 0, eslint 0, jest 40/40 (webhooks + route).
- [x] **Onda E (monitoramento, commits atômicos por arquivo p/ conflito com feat/nex-reconstrucao)** , E.1 origens distintas `ORIGEM_AGENTE_NEX_BUBBLE`/`_WHATSAPP` em rodada-labels + `channelToOrigem` separa (router `rowOrigem` preserva origem única coalescida, spec §10); E.2 `getDistinctRodadas` separa in_app/whatsapp (ordem [bubble, whatsapp]); E.3 helper `isSessionActive` (whatsapp janela 24h); E.4 `monitoramento-bubble.ts` consulta `channel:{in:[in_app,whatsapp]}` nas 8 queries + `SessionRow.channel` + status via helper + derivação de endedAt só in_app; E.5 UI inline (ui-ux-pro-max): aba "Bubble"→"Chat", `ChannelBadge` por sessão (bubble-monitor), filtro de origem e label da evaluations-table refletem as 2 origens **automaticamente** (via E.1/E.2, sem tocar monitoramento-content.tsx , evita conflito). tsc 0, eslint 0 erros, jest 21/21 do escopo.
- [ ] **PRÓXIMO:** Onda F (runbook n8n + e2e contra dado real). Falta também: rodar suíte completa (em curso), code review + UI review finais, recomendar merge cedo (banco compartilhado).
- [ ] **PENDENTE e2e** (regra de raiz): rebuild docker app+worker, inbound assinado real, payload Meta, conferir resolução com/sem 9, barreiras sem custo IA, Judge gerando avaliação WhatsApp, webhook de saída com envelope rico + idempotência (retry não duplica).
- [ ] Code review + UI review finais.

## PENDÊNCIA a confirmar (Onda A)
- Validação cruzada "text não-vazio": A2.1 NÃO a aplicou (quebraria o caminho
  Meta-áudio, que chega sem `text` e com `audioMediaId`). Correto seguir o plano.
  A regra certa: exigir `text` quando NÃO há `audioMediaId` (caminho n8n);
  resolver na A5/verificação e2e como mensagem amigável (não throw).

## Próxima ação concreta
**Onda 0 , migration no banco COMPARTILHADO** com `feat/nex-reconstrucao`
(enum `WebhookEvent`+`events`; enum `ChannelAccessLevel`+`bubble/whatsappAccessLevel`;
backfill com cast). Exige: avisar o usuário, `npx prisma migrate dev`,
`agente schema-changed`, e mergear cedo para a outra frente rebasear. É ponto de
COORDENAÇÃO , não rodar a migration sem o OK do usuário. Depois: A5 (L1/L2 +
emit-reply blocked), B (envelope rico + idempotência ANTES do lock), C/D (UI,
inline + ui-ux-pro-max), E (monitoramento, por último), F (runbook + e2e).

## Ordem de execução sugerida (independência)
A1, A2, A3, A4 (backend, sem migration) → Onda 0 (migration, coordenar) →
A5 (barreiras) → B (resposta rica/idempotência) → C (acesso canal/nível, UI) →
D (webhook por evento, UI) → E (monitoramento, UI, por último, conflito) → F (runbook+e2e).

## Decisões canônicas desta feature (não rediscutir)
- Resposta **assíncrona, 2 webhooks** (n8n manda; recebe a resposta num receptor).
- **Áudio: dois caminhos coexistem** , via n8n vem transcrito (texto + flag, não baixa/transcreve); via Meta direto vem mídia e a plataforma transcreve (código atual preservado); microfone da bubble intocado.
- **Judge (avaliação automática) roda para WhatsApp** (já roda hoje p/ todos os canais). Não há voto do usuário pelo WhatsApp. NÃO gatear o Judge.
- **Validação em camadas antes da IA** (L1 número → L2 canal/nível → L3 assunto/módulo via `respondPermissionDenied` já existente), cada bloqueio devolve **mensagem padrão** no webhook (`reason`), sem custo de IA.
- **Acesso por canal/nível:** segmented control (Desativado + níveis super_admin/admin/manager/viewer, herança: nível = mínimo). Bubble some quando off/role<min; WhatsApp passa a respeitar (hoje cosmético).
- **Origem** separa Bubble vs WhatsApp (tabela de avaliações + sessões).
- **Webhook por evento** (campo `events` no WhatsappWebhook + UI + emissor), só `agent.reply`.
- **Identidade pelo número:** buscar com e sem o nono dígito (`phoneVariants`), qualquer match é o usuário.
- **Lock por usuário** (Redis SET NX, padrão de `worker/index.ts:220`) + **idempotência de saída** (`whatsapp:replied:{messageId}`, retry não re-roda o agente).
- **Envelope de saída é breaking** (novo formato com `event/deliveryId/kind/data{...}`).
- **Bug a corrigir:** outbound lê `url`, deve ser `targetUrl` (route.ts:215).

## Commits desta frente (spec/plan)
- SPEC v1 6d90785 · v2 47af6ff · v3 3f31fd2 · v4 0a34677 · PLAN v1 (este bloco).
