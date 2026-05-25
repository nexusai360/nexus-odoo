# Review #1 — PLAN v1 do Agente Nex Inteligência

> Adversarial real. Severidades: **B** bloqueante, **M** material, **N** nota.
> Critério da review: granularidade (cada task = 1 unidade), zero ambiguidade,
> dependências explícitas, testabilidade, completude.

---

## Granularidade / ambiguidade

### P1 — [B] T1.7 "Localizar onde Message é persistida" é placeholder

> "Localizar onde `Message` assistant é persistida."

Isto é placeholder. Plano canônico nomeia o arquivo e a linha. Sem isso, executor adivinha.

**Fix v2**: substituir por bloco concreto:
- Editar `src/lib/agent/run-agent.ts` na função `persistAssistantMessage(...)` (ou nome
  real; T1.4 do inspector script ajuda a localizar). Acrescentar:
  ```ts
  await prisma.message.create({
    data: {
      // ... campos existentes ...
      toolResults: result.toolCalls?.length
        ? normalizeToolResults(result.toolCalls)
        : Prisma.JsonNull,
    },
  });
  ```
- T1.7a (descoberta antes da edit): rodar `grep -n "prisma.message.create" src/lib/agent/run-agent.ts`
  para localizar o callsite exato; documentar linha no plan v2.

### P2 — [M] T1.13 sentinel "messageCountAtLastTag" não existe no schema

> "Idempotente: se já chamou na mesma `messageCount` (calculável), pula."

Sem coluna `messageCountAtLastTag`. Como "calcular"? Plan precisa ser explícito.

**Fix v2**: usar `Conversation.topicTagsAt` (timestamp adicionado em T1.2 v3 spec) +
contar `messages.createdAt > topicTagsAt`. Se ≥ 10 → re-tag; senão pula. Pseudo-código no
plan.

### P3 — [M] T1.16 jobId com `:` — confirmar regra

> `jobId = "topic-tag:${conversationId}:${messageCount}"`

A lição de 2026-05-25 15:45 era sobre **nome da fila** (proibido `:`), não sobre `jobId`.
Job IDs aceitam `:` no BullMQ. Plan deveria mencionar isso para evitar confusão futura.

**Fix v2**: nota explícita ("jobId pode ter `:`; só queue name não pode").

### P4 — [B] T2.0 invocação do `ui-ux-pro-max` não detalhada

> "Acionar `ui-ux-pro-max` para produzir wireframes…"

Não diz **como**. Acionar via skill? Subagent? Inline? O fluxo precisa ser executável.

**Fix v2**:
- Invocação inline na sessão principal: usar tool Skill com `skill: "ui-ux-pro-max:ui-ux-pro-max"`,
  passar `args` descrevendo a tela (`Tela admin /agente/inteligencia: KPIs de qualidade do
  agente, padrões de falha, recomendações de prompt`).
- Output da skill vira `docs/superpowers/specs/2026-05-25-inteligencia-ui-mockups.md`.
- Commit do arquivo: scope=ui.

### P5 — [M] T2.5 embeddings-client não existe explicitamente

> "Gera embedding via `text-embedding-3-small`."

Onde mora a função? F5 RAG tem isso?

**Fix v2**:
- Procurar em Onda 1 (task de descoberta): `grep -rn "text-embedding-3-small" src/`.
- Se existir helper em `src/lib/agent/rag/*` ou `src/lib/agent/embeddings/*`, reusar.
- Senão, criar `src/lib/agent/intelligence/embeddings-client.ts` na Onda 2 task T2.4.5 com
  função `embed(text: string): Promise<number[]>` usando OpenAI client.

### P6 — [N] T1.4 / T1.7 não declaram dependência

T1.7 depende do output de T1.4 (precisa saber o formato para gravar `toolResults` certo).
Plan não diz.

**Fix v2**: T1.7 `blocked_by: T1.4, T1.5, T1.6`.

### P7 — [M] T3.5 cron BullMQ sem detalhes

> "Cron BullMQ `agent-profile-build` agendado para `30 4 * * *`."

BullMQ tem `repeat: { cron: "30 4 * * *" }` no `queue.add`. Plan precisa instrução literal.

**Fix v2**: pseudocódigo no T3.5:
```ts
profileBuildQueue.add(
  "scheduled",
  {},
  { repeat: { pattern: "30 4 * * *", tz: "America/Sao_Paulo" } }
);
```
Documenta também: BullMQ persiste no Redis; ao subir o worker, ele lê e re-agenda.

---

## Dependências

### P8 — [M] Grafo de dependências não declarado

Cada task tem `blocked_by` implícito mas não explícito. Plan canônico tem grafo.

**Fix v2**: §"Grafo de dependências" no plan v2 com:
- T1.2 → T1.3 → T1.5/T1.7/T1.8/T1.10/T1.11/T1.13.
- T1.5 → T1.7 (precisa do normalizer para gravar resultados corretamente — mas resultado já
  está em memória; pode dispensar).
- T1.13 → T1.14 → T1.16 (job precisa estar registrado antes de enfileirar).
- T2.0 → T2.9 (mockup antes da UI).
- T2.1, T2.3, T2.5 → T2.6 (script depende dos 3 módulos).
- T3.1 → T3.3 → T3.5 → T3.6 → T3.7.
- T4.1, T4.3, T4.5 → T4.10 → T4.12.

---

## Testabilidade

### P9 — [M] T1.7 sem teste

A instrumentação de `toolResults` precisa de teste integration. Plan menciona "verificação:
enviar 1 mensagem no /agente". Isso é manual.

**Fix v2**: acrescentar T1.7b — `run-agent.persist-tool-results.test.ts` com mock de Prisma,
confere que `toolResults` é gravado corretamente.

### P10 — [N] T2.11 verificação E2E sem evidência persistida

> "Conferir ≥ 100 avaliações…"

Plan deve dizer o comando de evidência: `psql -c "SELECT COUNT(*) FROM conversation_quality_evaluations"`.

**Fix v2**: incluir comando exato.

### P11 — [N] T4.15 "1+ dedup descartado" — comando para verificar

`psql -c "SELECT COUNT(*) FROM suggestion_interactions WHERE action='dedup_dropped'"`.

**Fix v2**: incluir.

---

## Completude

### P12 — [B] Falta task: garantir credencial Gemini para judge

T2.3 default Gemini 2.5 Pro thinking. Se não há `LlmCredential` para Gemini no banco, juiz
não roda. P0.4 (pré-flight) só fala em "ativa", não detalha o que fazer se não existir.

**Fix v2**: T2.2.5 (antes do judge):
- Conferir `prisma.llmCredential.findFirst({ where: { provider: "google" } })`.
- Se null: pular para fallback `--judge-model claude-opus-4-7` (requer credencial Anthropic
  já confirmada em P0.4).
- Documentar no relatório do script.

### P13 — [M] Falta task: backfill de `toolResults` (decisão)

Mensagens antigas não têm `toolResults`. Plano não backfilla. OK pelo spec (juiz lida com
`originalResultMissing`), mas precisa estar **declarado** como decisão consciente, não esquecimento.

**Fix v2**: nota em T1.7: "Backfill de `toolResults` para mensagens antigas NÃO é executado.
Mensagens antigas terão `correcaoFactual = null`. Spec §3.2 documenta esta decisão (era
'pre_instrument' na amostragem)."

### P14 — [M] Onda 4 sem task de "intelligence-cleanup" cron

Spec §9.4 fala em cron `agent-intelligence-cleanup` semanal (TTL 90d em SuggestionInteraction).
Plan v1 esquece.

**Fix v2**: T4.16.5 — `src/worker/jobs/agent-intelligence/intelligence-cleanup.ts`:
- Cron `0 3 * * 0` (domingos 03:00).
- `DELETE FROM suggestion_interactions WHERE created_at < NOW() - INTERVAL '90 days'`.
- Idempotente.

### P15 — [M] Plan não tem rollback plan

Se Onda X quebra produção, como reverter?

**Fix v2**: §"Rollback" no plan v2:
- Onda 1: migration tem `IF NOT EXISTS`; revert manual via SQL `DROP TABLE` + `ALTER … DROP COLUMN`.
  Code revert via git revert do commit da onda.
- Ondas 2-4: feature flags via `intelligenceCheckpoint` (default OFF). Ligar OFF em
  produção desativa visualmente. Code revert via git.

### P16 — [M] Faltam tasks de coordenação multi-agente em pontos de conflito

T2.10 (sidebar), T3.9 (suggestions-bar), T4.12 (chat-panel.tsx) já mencionam "coordenar
antes". Mas a coordenação é genérica. Plan deveria definir o **gesto exato** de coordenação.

**Fix v2**: §"Protocolo de coordenação multi-agente em arquivos compartilhados":
- Antes de editar: `ls docs/agents/active/` + `git log -3 --oneline -- <arquivo>` +
  `tail -10 docs/agents/HISTORY.md`.
- Se commit < 30 min ou outro `active/*.md` declara o arquivo: **pausar 1 h** ou pivotar.
- Append em `HISTORY.md` antes do commit, scope=fix/feat.
- Stage apenas o arquivo modificado (`git add <arquivo>`, nunca `-A`).

### P17 — [N] T5.7 PR target ambíguo

> "Abrir PR da branch para `feat/f4-leitura-expansao` (ou `main` se outras branches já mergearam)."

Decisão depende de estado quando concluir. Plan deve documentar critério.

**Fix v2**: critério explícito:
- PR para `feat/f4-leitura-expansao` se ela ainda existe e não foi mergeada.
- PR direto para `main` se `feat/f4-leitura-expansao` já foi mergeada e fechada.
- Antes de abrir: `git fetch origin && gh pr list --state open` confere.

---

## Robustez de execução

### P18 — [M] Onda 1 task 18 commit único é muito grande

Tudo Onda 1 num único commit dificulta revert e revisão.

**Fix v2**: 4 commits intermediários na Onda 1:
- C1: migration + schema (T1.1-T1.3).
- C2: normalizer + tests (T1.4-T1.6).
- C3: instrumentação + helper + reasoning-policy (T1.7-T1.12).
- C4: job + queue + cabling (T1.13-T1.17).
Cada commit independentemente verificável. Onda 1 ainda fecha como bloco lógico no HISTORY.

### P19 — [M] T2.6 amostragem estratificada sem pseudocódigo

A complexidade está em "particiona em buckets". Sem pseudocódigo, executor reinventa.

**Fix v2**: pseudocódigo no plan v2 (~20 linhas).

### P20 — [N] T4.10 soft cap 500/dia query pode ficar lenta

`COUNT(*) WHERE userId AND createdAt > today` em `suggestion_interactions` cresce sem fim.

**Fix v2**: já tem index `(userId, createdAt)`. Confirmar no plan v2 que a query usa esse
index (`EXPLAIN ANALYZE` na verificação).

---

## Resumo

20 achados:
- **B**: P1, P4, P12 — 3.
- **M**: P2, P3, P5, P7, P8, P9, P13, P14, P15, P16, P18, P19 — 12.
- **N**: P6, P10, P11, P17, P20 — 5.

Próximo passo: aplicar B+M → PLAN v2.
