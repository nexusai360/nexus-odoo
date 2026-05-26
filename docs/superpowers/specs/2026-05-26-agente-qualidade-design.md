# Sistema /agente/qualidade — Design (SPEC v1)

**Data**: 2026-05-26
**Autor**: Claude Code (Opus 4.7)
**Sub-projeto**: Onda 3a do plano de melhoria do Agente Nex
**Branch**: `feat/agente-nex-inteligencia`

## 1. Objetivo

Substituir a UI `/agente/inteligencia` (layout ruim, KPIs irrelevantes) por `/agente/qualidade`: dashboard interno do super_admin pra acompanhar o desempenho semântico do Agente Nex em produção real, com avaliação on-demand via Claude Code (sem custo externo de API), reaproveitando ao máximo a infraestrutura de `ConversationQualityEvaluation` existente.

## 2. Princípios de design

1. **Não inventar moda**: reaproveitar o que já existe (schema, infra de message/conversation, padrões de UI de `/agente/consumo`).
2. **Avaliação on-demand**: judge = eu (Claude Code Opus 4.7), via script CLI. Zero custo de API externa.
3. **Status discreto**: `CORRETO | PARCIAL | ERRADO | FORA_DO_ESCOPO | PENDENTE | FALHA_TECNICA`. Sem escalas 1-5.
4. **Filtro por modelo**: hoje só `gpt-5.4-nano`, extensível pra qualquer modelo futuro.
5. **Trigger barato**: insert de PENDENTE no momento da resposta, fire-and-forget. Não bloqueia o usuário, não bloqueia bateria de testes.
6. **Snapshot pra histórico**: copiar pergunta e resposta no momento (LGPD: caso a Message seja deletada depois, a avaliação preserva contexto pra auditoria).
7. **Validação humana opcional**: admin pode ajustar status manualmente no drill-down, mas não é workflow obrigatório.

## 3. Escopo

### Dentro
- Migração do schema `ConversationQualityEvaluation` (campos novos, sem perda)
- Trigger fire-and-forget no `run-agent.ts` (cria row PENDENTE após resposta)
- Trigger no catch externo do `runAgent` (cria row FALHA_TECNICA quando lança exceção)
- 2 scripts CLI: `scripts/quality-audit/dump-pending.ts`, `scripts/quality-audit/commit-audit-results.ts`
- Nova rota e UI `/agente/qualidade` (super_admin only)
- Decommission da rota `/agente/inteligencia` (redirect 308 → `/agente/qualidade`)
- Reuso de componentes de UI: `KpiCard`, `PeriodPills`, `PeriodNavigator`, `InteractiveAreaChart`, `InteractiveBarChart`, `DonutWithCenter`, `Table`, `CustomSelect`, padrão de `PageShell` + `PageHeader`

### Fora
- Worker BullMQ pra avaliação automática (não vai existir)
- Judge via API externa (não vai existir)
- Reavaliação retroativa em massa das 4.914 avaliações antigas (essas viram PENDENTE; admin opcionalmente roda audit depois)
- Sistema de few-shot dinâmico (futuro: Onda 3c)
- Clusterização de erros via pgvector (mantido o schema mas sem novo uso)

## 4. Arquitetura

```
┌─────────────────────────┐
│ Usuário → agente Nex    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐  insert (fire-and-forget)  ┌──────────────────────────────┐
│  run-agent.ts           ├───────────────────────────►│ ConversationQualityEvaluation│
│  - try: responde + cria │                            │ status = PENDENTE             │
│    row PENDENTE         │                            │ snapshots completos           │
│  - catch: cria row      │                            └────────┬─────────────────────┘
│    FALHA_TECNICA        │                                     │ lê
└─────────────────────────┘                  ┌──────────────────┴────────────────┐
                                             │                                   │
                                             ▼                                   ▼
                                ┌────────────────────────┐     ┌──────────────────────────┐
                                │ Claude Code (manual)   │     │ UI /agente/qualidade     │
                                │                        │     │                          │
                                │ 1. dump-pending.ts     │     │ - KPIs filtráveis        │
                                │ 2. eu avalio em batch  │     │ - Charts (linha+donut+bar)│
                                │ 3. commit-audit-       │     │ - Tabela paginada        │
                                │    results.ts          │     │ - Drill-down inline      │
                                └────────────────────────┘     │ - super_admin only       │
                                                                └──────────────────────────┘
```

## 5. Decisões técnicas

### 5.1 Schema (migration aditiva)

Adapta `ConversationQualityEvaluation` existente. Migração **aditiva, não-destrutiva**: 4.914 linhas existentes preservadas, viram status='PENDENTE' por default.

```prisma
model ConversationQualityEvaluation {
  // === Mantidos da versão anterior ===
  id                    String   @id @default(uuid()) @db.Uuid
  conversationId        String   @map("conversation_id") @db.Uuid
  /// Nullable + sem @unique: pra FALHA_TECNICA (turno que nem gerou
  /// assistant message). Em rows normais, segue 1:1 com Message.
  assistantMessageId    String?  @map("assistant_message_id") @db.Uuid
  judgeVersion          String   @map("judge_version")
  razoes                String   @default("")  // mudou: default vazio
  flags                 String[] @default([])
  toolsReexecuted       Json?    @map("tools_reexecuted")
  createdAt             DateTime @default(now()) @map("created_at")

  // === Renomeados (semântica mais clara) ===
  judgeModel            String?  @map("judge_model")  // era NOT NULL, vira NULLABLE (null pra PENDENTE)

  // === Deprecated (mantidos nullable pra histórico, não usados pelo novo sistema) ===
  /// @deprecated escala 1-5 da versão antiga
  aderencia             Int?
  /// @deprecated escala 1-5 da versão antiga
  correcaoFactual       Int?     @map("correcao_factual")
  /// @deprecated escala 1-5 da versão antiga
  escolhaDeTools        Int?     @map("escolha_de_tools")
  /// @deprecated escala 1-5 da versão antiga
  clareza               Int?
  /// @deprecated movido pra novo fluxo
  recomendacaoPrompt    String?  @map("recomendacao_prompt")
  /// @deprecated movido pra novo fluxo
  recomendacaoEmbedding Unsupported("vector(1536)")? @map("recomendacao_embedding")

  // === Renomeados (review humano) ===
  humanStatus           String?  @map("human_status")           // era reviewerDecision
  humanReviewedBy       String?  @map("human_reviewed_by") @db.Uuid  // era reviewedBy
  humanReviewedAt       DateTime? @map("human_reviewed_at")     // era reviewedByHumanAt

  // === NOVOS ===
  status                String   @default("PENDENTE") // CORRETO|PARCIAL|ERRADO|FORA_DO_ESCOPO|PENDENTE|FALHA_TECNICA
  patterns              String[] @default([])         // ex: ["dado_inventado","fluxo_tool_incompleto"]
  model                 String?                       // modelo do AGENTE (ex: "gpt-5.4-nano")
  userMessageId         String?  @map("user_message_id") @db.Uuid  // nullable (legado)
  questionSnapshot      String?  @map("question_snapshot")          // texto da pergunta (cap 4000 chars)
  answerSnapshot        String?  @map("answer_snapshot")            // texto da resposta (cap 4000 chars)
  technicalError        String?  @map("technical_error")             // mensagem de erro pra FALHA_TECNICA

  conversation          Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([status, createdAt])    // novo: query principal da UI
  @@index([model, status])         // novo: KPI por modelo
  @@index([createdAt])             // novo: filtro de período
  @@map("conversation_quality_evaluations")
}
```

**Renomes que quebram código existente** (precisam atualizar):
- `reviewerDecision` → `humanStatus`
- `reviewedBy` → `humanReviewedBy`
- `reviewedByHumanAt` → `humanReviewedAt`

**Localizar call sites antes da migration** (comando exato a rodar no plano):
```bash
grep -rn "reviewerDecision\|reviewedBy\|reviewedByHumanAt" src/ prisma/ scripts/
```
Atualizar cada referência encontrada. `tsc --noEmit` precisa passar após renomes.

**Também precisam ser removidos do schema** os campos cuja função foi substituída pelo novo fluxo (mas mantidos como deprecated/nullable, não DROP — preservar 4.914 rows históricas):
- `aderencia`, `correcaoFactual`, `escolhaDeTools`, `clareza` (escalas 1-5 da versão antiga)
- `recomendacaoPrompt`, `recomendacaoEmbedding` (clusterização antiga)

### 5.2 Status (taxonomia)

| Status | Semântica | Conta no KPI "% OK"? |
|---|---|---|
| `CORRETO` | resposta certa, completa, factualmente verdadeira | ✅ sim (numerador) |
| `PARCIAL` | parte certa parte falta/erra | ✅ sim (denominador, não numerador) |
| `ERRADO` | invenção de dado, tool errada, resposta enganosa | ✅ sim (denominador, não numerador) |
| `FORA_DO_ESCOPO` | usuário perguntou algo fora do domínio, agente recusou corretamente | ✅ sim (denominador, não numerador) |
| `PENDENTE` | turno criado mas ainda não avaliado | ❌ não (excluído de KPI) |
| `FALHA_TECNICA` | agente nem respondeu (timeout, tool crashou, rate limit) | ❌ não (excluído de KPI) |

**Fórmula explícita**: `% CORRETO = COUNT(status=CORRETO) / COUNT(status IN [CORRETO, PARCIAL, ERRADO, FORA_DO_ESCOPO])`.

### 5.3 Patterns (taxonomia de diagnóstico)

Vocabulário fechado, mantém compatibilidade com a auditoria R4/R5:

**Positivos (apenas em CORRETO):**
- `acerto_objetividade`, `acerto_encadeamento`, `acerto_modelo`, `limitacao_real_declarada`

**Negativos:**
- `dado_inventado`, `fluxo_tool_incompleto`, `pergunta_ignorada`, `entendeu_mal_termo`, `resposta_truncada`, `pediu_clarificacao_desnecessaria`, `parametro_incompleto`, `tool_errada`, `formato_quebrado`, `tool_redundante`, `nao_usou_tool`, `loop_clarificacao`, `gramatica_plural`

**Extensível**: novos padrões podem ser adicionados pelo judge livremente. UI lista todos os patterns únicos no filtro.

### 5.4 Trigger no `run-agent.ts`

**Adaptação necessária**: `persistMessage` hoje retorna `void`. Criar variante `persistMessageAndReturnId(...) → Promise<string>` em `conversation.ts` (não-breaking; persistMessage continua existindo).

**Onde inserir**:

```typescript
// Em run-agent.ts, depois do persistMessage(role=assistant) que finaliza o turno:

const assistantMessageId = await persistMessageAndReturnId(
  args.conversationId, "assistant", message,
);

// Captura userMessageId via query (última msg user da conversa antes desta assistant).
// Necessário porque a userMessageId não vem na input do runAgent.
const lastUserMsg = await prisma.message.findFirst({
  where: { conversationId: args.conversationId, role: "user" },
  orderBy: { createdAt: "desc" },
  select: { id: true },
});

// Fire-and-forget: cria eval PENDENTE.
void (async () => {
  try {
    await prisma.conversationQualityEvaluation.create({
      data: {
        conversationId: args.conversationId,
        userMessageId: lastUserMsg?.id ?? null,
        assistantMessageId,
        judgeVersion: "v2-claude-code",
        status: "PENDENTE",
        model: client.model,  // gpt-5.4-nano
        questionSnapshot: args.userMessage.slice(0, 4000),
        answerSnapshot: message.slice(0, 4000),
      },
    });
  } catch (err) {
    console.warn("[runAgent] falha não-bloqueante ao criar eval PENDENTE:", err);
  }
})();
```

**Caso FALHA_TECNICA** (catch externo do runAgent):

```typescript
} catch (err) {
  // ... tratamento atual ...

  // Cria row FALHA_TECNICA. Atenção: não buscar lastUserMsg via query
  // (race condition — se o erro aconteceu ANTES do persistMessage("user")
  // da linha 311, lastUserMsg retornaria o turno ANTERIOR, errado).
  // Usar args.userMessage direto e deixar userMessageId nullable.
  void (async () => {
    try {
      await prisma.conversationQualityEvaluation.create({
        data: {
          conversationId: args.conversationId,
          userMessageId: null,
          assistantMessageId: null,
          judgeVersion: "v2-claude-code",
          status: "FALHA_TECNICA",
          model: resolvedLlm?.model ?? "unknown",
          questionSnapshot: args.userMessage.slice(0, 4000),
          answerSnapshot: null,
          technicalError: (err as Error).message?.slice(0, 1000) ?? "unknown error",
        },
      });
    } catch { /* swallow */ }
  })();
  throw err;
}
```

### 5.5 Scripts CLI

#### `scripts/quality-audit/dump-pending.ts`
- Args: `--limit N` (default **40**, tamanho de 1 batch que cabe no contexto do Claude Code), `--include-evaluated` (default false), `--out PATH` (default `/tmp/quality-audit-pending-{ts}.json`)
- Comportamento: lê até N rows PENDENTES (ou inclui já avaliadas se `--include-evaluated`), ordenadas por `createdAt asc` (mais antigas primeiro), gera JSON formato batch (mesmo formato dos batches R4/R5: array de turnos com question/answer/toolCalls/toolResults).
- Output: imprime `{count} turnos em {path}. Cole o path aqui para eu avaliar.`. Se count==0, imprime `Nenhum turno pendente.` e sai com código 0.

#### `scripts/quality-audit/commit-audit-results.ts`
- Args: `--results PATH` (obrigatório), `--force` (sobrescreve avaliações já preenchidas)
- Comportamento: lê JSON de resultado (array `[{turnoId, status, patterns, razoes}]`), atualiza cada row no banco (status, patterns, razoes, judgeModel="claude-opus-4-7-via-cc", judgeVersion="v2-claude-code"). Erro se algum turnoId não existe no banco. Sem `--force`, pula rows que já têm status diferente de PENDENTE.
- Output: `Atualizadas N rows. Quebra: X CORRETO, Y PARCIAL, ...`

**Tamanho do batch**: 40 turnos por execução. Para zerar fila de N pendentes (N > 40), repetir o ciclo `dump → avaliar → commit` várias vezes até `dump` retornar 0.

### 5.6 UI `/agente/qualidade`

**Rota**: `src/app/(protected)/agente/qualidade/page.tsx` (server component, gate super_admin).

**Layout (copia exato de `/agente/consumo`)**:

1. `PageShell variant="form"` + `PageHeader` com ícone (CheckCircle2 ou ShieldCheck), título "Qualidade do Agente Nex", subtítulo "Desempenho semântico das respostas por modelo e período".
2. **Filtros do topo** (mesmo `PeriodPills` + `PeriodNavigator` de consumo): hoje, 7d, 30d, mês, custom. Modelo: select com "Todos" + lista de modelos distintos do banco.
3. **KPI Cards** (mesmo `KpiCard` de consumo) — 6 cards em grid:
   - **% CORRETO** (verde, destaque) — fórmula explicitada no tooltip
   - **Total avaliado** (cinza) — `CORRETO + PARCIAL + ERRADO + FORA_DO_ESCOPO`
   - **Corretos** (verde claro) — count
   - **Parciais** (amarelo) — count
   - **Errados** (vermelho) — count
   - **Fora de escopo** (cinza) — count
   - Badge embaixo dos KPIs: "X pendentes aguardando auditoria · Y falhas técnicas"
4. **Charts** (mesmo padrão consumo, 3 cards lado a lado em desktop, stack em mobile):
   - **Linha** (`InteractiveAreaChart`): % CORRETO ao longo do tempo (1 ponto por dia)
   - **Donut** (`DonutWithCenter`): distribuição de status (CORRETO/PARCIAL/ERRADO/FORA_DO_ESCOPO)
   - **Barra** (`InteractiveBarChart`): top 10 patterns mais frequentes no período
5. **Tabela** (padrão `Table` + paginação `25/50/100` igual consumo):
   - Colunas: Data | Pergunta (truncada 80 chars + tooltip) | Resposta (truncada 80 chars + tooltip) | Status (badge colorido) | Modelo | Padrão dominante (chip) | Ações (👁️ drill-down)
   - **Filtros sticky abaixo do cabeçalho**: search (texto livre pergunta+resposta), status (multi), padrão (multi), modelo (single)
   - Ordenação: data desc por default
6. **Drill-down** (`UsageDetailInline` adaptado — slide-down inline, padrão consumo):
   - Pergunta completa
   - Resposta completa (markdown rendered)
   - Tool calls + tool results (lidos via query adicional em `Message.findFirst({ id: assistantMessageId })` que traz `toolCalls` e `toolResults` JSON)
   - Status do judge: badge grande + diagnóstico em texto livre (`razoes`)
   - Patterns: chips coloridos
   - Bloco "Ajuste manual": select de status, textarea de razão, botão "Salvar ajuste" (escreve `humanStatus`, `humanReviewedBy`, `humanReviewedAt`)

**Caso especial FALHA_TECNICA**: quando `assistantMessageId` é null, drill-down mostra apenas pergunta + `technicalError` + badge FALHA_TECNICA. Não tenta carregar tool calls (não existem).

**UI/UX Pro Max obrigatório**: invocar `ui-ux-pro-max` skill antes de qualquer trabalho de layout/componente novo.

### 5.7 Decommission `/agente/inteligencia`

- Rota velha `src/app/(protected)/agente/inteligencia/page.tsx`: substituir por `redirect("/agente/qualidade", "replace")` (307 temporário, preserva método HTTP; permite reverter se necessário sem cache problema).
- Componentes `src/components/agent/inteligencia/*`: **manter por enquanto** (não deletar) — só remover quando confirmar que nada mais usa. Plano: tagear como `@deprecated` no header, remover em uma onda futura de limpeza.
- Job `enqueueQualityAudit` em `enqueue.ts`: **manter código** (não chamar), pode ser útil futuramente.

### 5.8 Comando do usuário (rodar audit via Claude Code)

**Frases que disparam o fluxo de audit** (documento como referência pro Claude Code reconhecer):
- "rodar auditoria do agente Nex"
- "rodar audit"
- "avaliar pendentes"
- "auditar qualidade"
- "audit"

Quando o usuário digita uma dessas, eu:

1. Executo `pnpm tsx scripts/quality-audit/dump-pending.ts --limit 200`
2. Leio o arquivo JSON gerado em `/tmp/`
3. Avalio cada turno usando minha capacidade (sigo o briefing das rodadas R4/R5 atualizado)
4. Escrevo resultado em `/tmp/quality-audit-results-{ts}.json`
5. Executo `pnpm tsx scripts/quality-audit/commit-audit-results.ts --results /tmp/quality-audit-results-{ts}.json`
6. Resumo pro usuário: "N turnos avaliados. Status: ..."

Se houver >40 pendentes, eu faço em loops sucessivos (dump → avaliar → commit) até zerar.

## 6. Não-funcionais

### Performance (estimativas, a verificar com `EXPLAIN ANALYZE`)
- Insert PENDENTE no trigger: ~5ms (1 row, fire-and-forget). Não afeta tempo de resposta do agente.
- Query da UI (tabela paginada 25 rows + KPIs do período): ≤200ms com índices `(status, createdAt)` e `(model, status)`. Validar com `EXPLAIN ANALYZE` no plano.
- Tabela pode escalar até 100k+ rows sem degradação (paginação no DB).
- **Search textual** (pergunta/resposta): v1 usa `ILIKE %x%` simples (aceitável até ~50k rows). Migrar pra `pg_trgm` index quando necessário (gatilho: search > 500ms).
- **Query do gráfico "Top patterns"**: usa `unnest(patterns)` + `GROUP BY`. Pode degradar com 100k+ rows. Verificar `EXPLAIN ANALYZE` no plano e considerar materialized view ou índice GIN em `patterns` se o gatilho >500ms for atingido.

### Segurança
- Rota `/agente/qualidade` gated super_admin no layout
- Endpoints de leitura via server actions (`use server`), validação de role
- Endpoint de ajuste manual: validação dupla (server action + check de role)
- Snapshots (questionSnapshot, answerSnapshot) podem conter dados sensíveis: respeitar LGPD; campo de delete automatizado em onda futura se necessário

### Observabilidade
- Logs estruturados nos triggers (`[runAgent] eval criado/falhou`)
- Logs estruturados nos scripts CLI
- KPI no próprio dashboard mostra "X pendentes" (alerta visual se ficar muito alto)
- **Health check do trigger**: query agendada (cron simples, semanal) que conta rows criadas nos últimos 7 dias. Se zero E houve conversas no mesmo período → alertar via log de erro. Detecta caso de trigger silenciosamente quebrado. Implementação: 1 server action chamada em horário ocioso, ou comando manual no Claude Code (`pnpm tsx scripts/quality-audit/trigger-health-check.ts`). Não bloqueante.

### Compatibilidade retroativa
- Migração aditiva: 4.914 linhas existentes preservadas, viram PENDENTE
- Campos antigos mantidos como deprecated (não DROP)
- Renomes (`reviewerDecision` → `humanStatus` etc): atualizar TODOS os call sites como parte da migration

## 7. Plano de testes

### Unitários
- `persistMessageAndReturnId`: persiste + retorna ID
- Trigger PENDENTE: inserção correta, fire-and-forget não bloqueia
- Trigger FALHA_TECNICA: inserção mesmo quando run-agent lança
- KPI calculator: fórmula `% CORRETO` correta (incluindo edge cases: zero avaliações, todos pendentes)
- Filtros UI: combinação status + modelo + padrão + período retorna conjunto correto

### Integração
- Rodar fluxo completo: agente responde → row PENDENTE existe no banco → script dump pega ela → commit atualiza → UI mostra
- **Trigger FALHA_TECNICA**: simular `client.chat` throw (mock) → confirmar row criada com status FALHA_TECNICA e technicalError preenchido
- Decommission: `/agente/inteligencia` redirect funciona, link interno (se houver) ainda funciona
- **Health check**: rodar manualmente, validar que detecta período de 7 dias sem rows

### Manual
- UI vista em desktop e mobile (responsividade)
- Drill-down abre/fecha corretamente
- Ajuste manual persiste e atualiza KPIs em tempo real

## 8. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Migration de renomes quebra prod | Média | Alto | Identificar TODOS os call sites antes; rodar `tsc` + testes; deploy em janela controlada |
| Trigger PENDENTE causa lock no DB sob carga | Baixa | Médio | Fire-and-forget assíncrono; insert é simples (1 row, índices leves); monitorar em produção |
| UI fica pesada com 100k+ rows | Baixa | Médio | Paginação DB, índices corretos; lazy load do drill-down |
| Eu (judge) classifico inconsistente entre sessões | Média | Médio | **judgeVersion versionado** (string no schema). Cada mudança no prompt-briefing do judge bumpa a versão. Permite comparar evals SÓ entre evals da mesma versão. UI mostra a versão dominante no período filtrado. |
| LGPD: snapshots com dados sensíveis | Baixa | Médio | Cap em 4000 chars; deletar com a Message via CASCADE; futura: TTL de 180d |
| Decommission `/agente/inteligencia` quebra bookmark/link externo | Baixa | Baixo | Redirect 308 |

## 9. Sequência de execução

Cada etapa tem teste integrado (não é fase separada). TDD onde aplicável.

1. **Migration aditiva** (schema Prisma + DB):
   - 1.1. Grep call sites dos campos renomeados (`reviewerDecision`, `reviewedBy`, `reviewedByHumanAt`) e listar
   - 1.2. Atualizar Prisma schema (renomes + nullable assistantMessageId + remove @unique + novos campos)
   - 1.3. `prisma migrate dev --name agent-quality-system`
   - 1.4. Atualizar todos os call sites identificados; `tsc --noEmit` deve passar
2. **Helper `persistMessageAndReturnId`** em `conversation.ts` + teste unitário
3. **Trigger PENDENTE** no `run-agent.ts` (final do try) + teste integração: agente responde → row PENDENTE existe
4. **Trigger FALHA_TECNICA** no catch externo do `run-agent.ts` + teste integração: simular erro → row FALHA_TECNICA existe
5. **Scripts CLI**: `dump-pending.ts` e `commit-audit-results.ts` + smoke tests
6. **Health check script**: `trigger-health-check.ts` (uso futuro, deixar pronto)
7. **Server actions / queries** da UI em `src/lib/agent/quality/queries.ts` + testes unitários (cálculos de KPI)
8. **Layout/components UI**: invocar `ui-ux-pro-max` skill antes; reusar `KpiCard`, `PeriodPills`, charts, table de consumo
9. **UI `/agente/qualidade/page.tsx`** + componentes; teste manual em desktop e mobile
10. **Redirect 307** de `/agente/inteligencia` → `/agente/qualidade`
11. **Smoke test E2E manual**: rodar `dump-pending` + eu avaliar + `commit-audit-results` + abrir UI e validar KPIs atualizados
12. **Commit final + push**

## 10. Open questions

- (resolvido) Nome da rota: `/agente/qualidade` ✓
- (resolvido) Permissão: `super_admin` only ✓
- (resolvido) Sem validação humana obrigatória ✓
- (resolvido) Sem reavaliação retroativa em massa ✓
- (resolvido) Judge = Claude Code via script ✓
- Nenhuma open question restante.
