# F5 WhatsApp ↔ Nex via webhook , PROGRESSO (ponto de retomada)

> Atualizado a cada bloco/commit. Em modo autônomo (CLAUDE.md §6). Branch
> `feat/router-ativacao-r2`. Se você é uma sessão nova, leia: este arquivo, a
> SPEC v4, o PLAN, e `git log` recente.

## Documentos
- **SPEC v4 (final, aprovada pelo usuário):** `docs/superpowers/specs/2026-06-17-f5-whatsapp-nex-webhook-design.md`
- **PLAN:** `docs/superpowers/plans/2026-06-17-f5-whatsapp-nex-webhook.md`

## Estado atual (2026-06-17)
- [x] Brainstorm + SPEC v1 → v2 → v3 → v4 (2 reviews adversariais aplicadas + esclarecimentos do usuário sobre áudio/avaliação/validação/acesso por nível).
- [x] PLAN v1 escrito (subagente Opus).
- [ ] **EM ANDAMENTO:** 2 reviews do PLAN → PLAN v2 → v3.
- [ ] Execução das ondas 0-F (inline, TDD, ui-ux-pro-max na UI, e2e por onda).
- [ ] Code review + UI review finais.

## Próxima ação concreta
Rodar/integrar as 2 reviews do plano → PLAN v3; então executar a **Onda 0**
(schema: `WebhookEvent`+`events`; `ChannelAccessLevel`+`bubble/whatsappAccessLevel`;
migration+backfill). Onda 0 mexe no **schema do banco compartilhado** com
`feat/nex-reconstrucao`: avisar o usuário, `agente schema-changed`, mergear cedo.

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
