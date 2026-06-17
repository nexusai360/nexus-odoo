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
- [ ] **EM ANDAMENTO:** Execução das ondas (inline, TDD, ui-ux-pro-max na UI, e2e por onda).
- [ ] Code review + UI review finais.

## Próxima ação concreta
Executar pelo PLAN v2 (docs/superpowers/plans/2026-06-17-f5-whatsapp-nex-webhook.md).
Começar pela **Onda A1** (resolução por variantes do nono dígito em
`src/lib/whatsapp/resolve.ts`: `findUnique`→`findFirst` com `phoneVariants` +
`platformRole` no select), que NÃO depende da migration. A **Onda 0** (schema:
eventos + níveis de acesso por canal) mexe no **banco compartilhado** com
`feat/nex-reconstrucao`: ao chegar nela, avisar o usuário, rodar
`agente schema-changed`, e recomendar mergear cedo.

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
