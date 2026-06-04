# B2 · Aba "Bubble" de monitoramento , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (implementer por task + review de spec + review de qualidade). Steps com checkbox `- [ ]`.
> **UI:** toda task de frontend usa `ui-ux-pro-max` e reusa o design system existente.

**Goal:** Aba "Bubble" no Monitoramento (super_admin), 3 colunas read-only (colaboradores → sessões → conversa fiel à bubble), com tag do juiz clicável pro Backtest, voto do usuário (B1), setinha de sugestões e selo de áudio.

**Architecture:** Fatia 0 (extrair `EvalStatusBadge`) → Fatia 1 (`Message.kind` p/ áudio) → Fatia 2 (actions + colunas 1/2) → Fatia 3 (action de mensagens + coluna 3) → Fatia 4 (deep-link `?eval=`). Sugestões já estão no banco (`ConversationQualityEvaluation.suggestions`).

**Tech Stack:** Next.js 16 App Router, TS, Prisma 7 (@db.Uuid/@map), Postgres, Tailwind v4, lucide-react, Jest.

**Spec:** `docs/superpowers/specs/2026-06-04-b2-monitoramento-bubble-design.md` (v3).

---

## Mapa de arquivos
- **Criar:** `src/components/agent/quality/eval-status-badge.tsx`; `src/app/(protected)/agente/monitoramento/bubble/page.tsx`; `src/components/agent/monitoramento/bubble-monitor.tsx` (3 colunas); `src/components/agent/monitoramento/bubble-monitor-row.tsx` (wrapper); `src/lib/actions/monitoramento-bubble.ts` (3 actions); `src/lib/actions/__tests__/monitoramento-bubble.test.ts`.
- **Modificar:** `prisma/schema.prisma` (+migration); `src/lib/agent/conversation.ts` (param kind); `src/lib/agent/run-agent.ts` (passa isAudio→kind); `src/app/api/agent/stream/route.ts` (lê meta.isAudio); `src/components/agent/chat-panel.tsx` (envia isAudio); `src/components/agent/monitoramento-nav.tsx` (3ª tab); `src/components/agent/monitoramento/evaluations-table.tsx` (usa EvalStatusBadge + prop initialExpandedId); `src/components/agent/monitoramento/monitoramento-content.tsx` (deep-link); `src/lib/agent/quality/queries.ts` (fetchQualityEvaluationRowById).

---

## Task 1 (Fatia 0): Extrair `EvalStatusBadge`

**Files:** Create `src/components/agent/quality/eval-status-badge.tsx`; Modify `src/components/agent/monitoramento/evaluations-table.tsx`.

- [ ] **Step 1:** Criar `eval-status-badge.tsx` exportando `EVAL_STATUS_LABEL`, `EVAL_STATUS_TONE` (movidos de `evaluations-table.tsx:54-75`, valores idênticos) e `EvalStatusBadge({ status, humanStatus }: { status: EvalStatus; humanStatus?: EvalStatus | null })`: `Badge` com `cn(EVAL_STATUS_TONE[humanStatus ?? status])` + label, e `ShieldCheck` (emerald) quando `humanStatus != null`. **Replicar FIELMENTE o bloco `evaluations-table.tsx:300-343`, que usa `title=` nativo + `aria-label` (NÃO o componente `<Tooltip>`)** , senão o Backtest muda. `EvalStatus` de `@/lib/agent/quality/queries`.
- [ ] **Step 2:** Em `evaluations-table.tsx`: remover os `const STATUS_LABEL`/`STATUS_TONE` locais (únicos usos = linhas 322/330/333/338, dentro do bloco do badge) e trocar o bloco inteiro do badge por `<EvalStatusBadge status={row.status} humanStatus={row.humanStatus} />`. **NÃO reimportar** os mapas (sem outro uso → eslint `no-unused-vars` quebraria). Backtest renderiza idêntico.
- [ ] **Step 3:** Verificar: `npx tsc --noEmit` (0 erros) e abrir o Backtest no dev , badges iguais.
- [ ] **Step 4:** Commit `refactor(b2): extrai EvalStatusBadge (reuso Backtest + Bubble)`.

---

## Task 2 (Fatia 1): `Message.kind` , schema + migration

**Files:** Modify `prisma/schema.prisma`; criar migration aditiva.

- [ ] **Step 1:** Em `Message` (schema.prisma:2559+), adicionar `kind String @default("text") @map("kind")`.
- [ ] **Step 2:** `npx prisma format && npx prisma validate`.
- [ ] **Step 3:** Migration **aditiva manual** (há drift no DB compartilhado, NÃO usar `migrate dev` que pede reset): gerar diff com `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, extrair SÓ o `ALTER TABLE "messages" ADD COLUMN "kind" ...` (descartar reverts de router/ffli), escrever em `prisma/migrations/<ts>_b2_message_kind/migration.sql`, aplicar com `npx prisma db execute --file ...`, `npx prisma migrate resolve --applied <ts>_b2_message_kind`, `npx prisma generate`, `agente schema-changed`.
- [ ] **Step 4:** Verificar a coluna no DB (`SELECT kind FROM messages LIMIT 1`).
- [ ] **Step 5:** Commit `feat(b2): Message.kind (text|audio) , schema + migration aditiva`.

---

## Task 3 (Fatia 1): Persistir `kind="audio"` (5 saltos)

**Files:** Modify `conversation.ts`, `run-agent.ts`, `stream/route.ts`, `chat-panel.tsx`.

- [ ] **Step 1 (persist):** `conversation.ts:229` `persistMessage(conversationId, role, content, toolCalls?, kind?: string)`: 5º param `kind?: string` + `...(kind ? { kind } : {})` no `data` do `create` (~236).
- [ ] **Step 2 (run-agent):** `RunAgentInput` (interface ~189) ganha `isAudio?: boolean`; o persist do user na **linha 604** vira `persistMessage(args.conversationId, "user", args.userMessage, undefined, args.isAudio ? "audio" : undefined)`.
- [ ] **Step 3 (route):** `stream/route.ts`: ampliar o tipo inline de `body.meta` p/ `{ source?: ...; isAudio?: boolean }` (não há zod, só cast TS); ler `body.meta?.isAudio` e passar a `runAgent({...})`. NÃO reusar `source`.
- [ ] **Step 4 (client, 3 edições casadas):** `chat-panel.tsx`: (a) **linha 910** `handleSend(text)` → `handleSend(text, { isAudio: true })`; (b) `handleSend` (:485) opts `{ source?: ... }` → `{ source?: ...; isAudio?: boolean }`; (c) montagem do body (:547) `meta: { source: opts?.source ?? "bubble" }` → `meta: { source: opts?.source ?? "bubble", isAudio: opts?.isAudio }`.
- [ ] **Step 5 (teste):** teste do `persistMessage` com `kind="audio"` grava a coluna; sem kind → default "text" (mock prisma, padrão da casa).
- [ ] **Step 6:** `npx tsc --noEmit` + jest. Verificação E2E: mandar um áudio na bubble e conferir `SELECT kind FROM messages WHERE role='user' ORDER BY created_at DESC LIMIT 1` = "audio".
- [ ] **Step 7:** Commit `feat(b2): persiste kind=audio na mensagem de voz (meta.isAudio)`.

---

## Task 4 (Fatia 2): Actions de colaboradores e sessões + testes

**Files:** Create `src/lib/actions/monitoramento-bubble.ts`, `src/lib/actions/__tests__/monitoramento-bubble.test.ts`.

Contratos (TS):
```ts
type RatingCounts = { CORRETO: number; PARCIAL: number; ERRADO: number; ALUCINOU: number };
type Collaborator = { userId: string; name: string; avatarUrl: string | null; sessionCount: number; hasActiveSession: boolean; ratingCounts: RatingCounts; accuracyPct: number | null };
type SessionRow = { conversationId: string; index: number; startedAt: string; endedAt: string | null; messageCount: number; ratingCounts: RatingCounts; accuracyPct: number | null; isActive: boolean };
```
`accuracyPct`: `totalVotos = soma(ratingCounts)`; se 0 → `null` (UI mostra "sem avaliações"); senão `round(100*(CORRETO + 0.5*PARCIAL)/totalVotos)`. Helper puro `computeAccuracy(rc)` (testável isolado).

- [ ] **Step 1 (helper + teste):** escrever `computeAccuracy` + teste (0 votos → null; PARCIAL=0.5; só CORRETO → 100).
- [ ] **Step 2 (listBubbleCollaborators):** `requireMinRole("super_admin")`; `conversation.groupBy({ by:['userId'], where:{ channel:'in_app' }, _count:{ _all:true }, _max:{ updatedAt: true } })`; ativos via `findMany({ where:{ channel:'in_app', endedAt:null }, select:{ userId }, distinct:['userId'] })`; `user.findMany({ where:{ id:{ in } }, select:{ id, name, avatarUrl } })`; votos `messageFeedback.groupBy({ by:['userId','rating'], where:{ conversation:{ channel:'in_app' } } })`. Montar no app (Map; usuário sem voto → counts zerados; accuracy null). Ordenar com `array.sort((a,b)=> +new Date(b.lastActivity) - +new Date(a.lastActivity))` (lastActivity = `_max.updatedAt`).
- [ ] **Step 3 (listBubbleSessions):** `requireMinRole`; `conversation.findMany({ where:{ userId, channel:'in_app' }, orderBy:{ createdAt:'desc' }, select:{ id, createdAt, endedAt, _count:{ select:{ messages:true } } } })`; votos `messageFeedback.groupBy({ by:['conversationId','rating'], where:{ conversation:{ userId, channel:'in_app' } } })`; `index` **cronológico** (1 = mais antiga): com a query `orderBy createdAt desc`, `index = total - posiçãoNoArrayDesc` (array desc tem o mais recente em [0] → recebe index=total); a UI exibe os mais recentes no topo, rotulados "Sessão N". `isActive = endedAt===null`.
- [ ] **Step 4 (testes das actions):** mock prisma + auth (padrão `message-feedback.test.ts`): recusa não-super_admin; counts/accuracy corretos; ordenação; usuário sem voto → accuracy null; inclui sessões arquivadas.
- [ ] **Step 5:** tsc + jest. Commit `feat(b2): actions listBubbleCollaborators/listBubbleSessions + testes`.

---

## Task 5 (Fatia 3): Action `getBubbleSessionMessages` + testes

**Files:** Modify `src/lib/actions/monitoramento-bubble.ts`, test.

Contrato , criar tipo NOVO `BubbleSessionMessageDto extends ConversationMessageDto` em `monitoramento-bubble.ts` (**NÃO** mutar o `ConversationMessageDto` compartilhado): + `kind: string`, `suggestions?: string[]`, `clickedSuggestion?: string`, `evaluation?: { id: string; status: EvalStatus } | null`, `feedback?: {...} | null`.

- [ ] **Step 1:** `getBubbleSessionMessages(conversationId)`: `requireMinRole("super_admin")`. Carrega `conversation.findUnique({ select:{ userId } })` só pra existir (NÃO comparar com currentUser). `message.findMany({ where:{ conversationId }, orderBy:{ createdAt:'asc' }, take:1000, select:{ id, role, content, kind, toolCalls, createdAt } })` (sem filtro `endedAt`).
- [ ] **Step 2 (steps por turno):** replicar o range-merge de `getEvaluationDetail` (`queries.ts:404-441`): agregar `toolCalls` das mensagens entre o último user e a mensagem final do assistant, e anexar os steps (via `stepsFromToolCalls`) na mensagem final.
- [ ] **Step 3 (juiz + sugestões):** `conversationQualityEvaluation.findMany({ where:{ conversationId, assistantMessageId:{ not:null } }, select:{ id, assistantMessageId, status, humanStatus, suggestions } })` → `Map`. Por mensagem assistant: `evaluation = { id, status: humanStatus ?? status }` (ou null se sem row); `suggestions` do Map.
- [ ] **Step 4 (feedback do DONO):** `messageFeedback.findMany({ where:{ conversationId }, select:{ assistantMessageId, rating, comment } })` → Map por `assistantMessageId` (todos = do dono). **NÃO** filtrar por currentUser.
- [ ] **Step 5 (clicada derivada):** no array ordenado, para cada assistant com `suggestions`, achar a **próxima** msg de role user; se `content.trim()` == alguma sugestão (trim), marcar `clickedSuggestion` = a **primeira** sugestão igual. Última msg sem próximo user → sem clicada.
- [ ] **Step 6 (testes):** mock prisma+auth: recusa não-super_admin; super_admin lê conversa de outro; inclui arquivada; Map juiz (terminal/pending/sem-row); feedback do dono presente; clicada derivada (incl. repetidas → 1ª; última sem próximo).
- [ ] **Step 7:** tsc + jest. Commit `feat(b2): getBubbleSessionMessages (read-only, dono, juiz, sugestoes, clicada)`.

---

## Task 6 (Fatia 3): UI , aba, página e 3 colunas

**Files:** Modify `monitoramento-nav.tsx`; Create `bubble/page.tsx`, `bubble-monitor.tsx`, `bubble-monitor-row.tsx`, `src/components/agent/rating-meta.ts`. **`ui-ux-pro-max` obrigatório.**

> **Decomposição (não é 1 commit):** executar como 5 unidades verificáveis: **6a** tab+page; **6b** Coluna 1 (colaboradores); **6c** Coluna 2 (sessões); **6d** `BubbleMonitorRow` (wrapper + badges + sugestões); **6e** integração das 3 colunas + responsivo. Commit por unidade.

- [ ] **Step 1 (tab):** em `monitoramento-nav.tsx`, adicionar ao array `TABS`: `{ label: "Bubble", href: "/agente/monitoramento/bubble" }` (depois de Router). O `startsWith` já cobre.
- [ ] **Step 2 (page):** `bubble/page.tsx` replicando o molde de `monitoramento/page.tsx` (`export const dynamic="force-dynamic"`, `PageShell variant="form"`, `PageHeader icon={Activity}`, `MonitoramentoNav`, `<BubbleMonitor .../>`). Gate herdado do layout `(protected)/agente/layout.tsx` (super_admin).
- [ ] **Step 3 (BubbleMonitor, client):** componente de 3 colunas. Estado: `selectedUserId`, `selectedSessionId`. Col1 lista `listBubbleCollaborators` (avatar inline padrão `sidebar.tsx:336`, nome, nº sessões, ponto verde/cinza, mini-resumo: contadores por rating + accuracy `% ` ou "sem avaliações"). Col2 lista `listBubbleSessions(selectedUserId)` (Sessão N, início→fim, tag ativa, "X msgs", resumo). Col3 monta `getBubbleSessionMessages(selectedSessionId)` em `BubbleMonitorRow`. Layout grid/flex; scroll por coluna (`overflow-y-auto`). Responsivo: empilhar/etapas em telas estreitas. Skeletons em loading; estados vazios ("sem sessão ativa" etc.). **Consultar `ui-ux-pro-max` para layout/espaçamento/responsivo.**
- [ ] **Step 4 (BubbleMonitorRow, wrapper):** por mensagem, renderiza `<AgentMessage role content kind="text" createdAt steps feedbackEnabled={false} reveal={false} streaming={false} />` (AgentMessage INTOCADO) e, no wrapper externo (read-only): separador de dia (via `formatDayLabel`, estático entre grupos), `EvalStatusBadge` do juiz como `<Link href={`/agente/monitoramento?eval=${evaluation.id}`}>` quando terminal (PENDENTE → badge não-clicável; sem eval → nada), badge do voto B1 (extrair `RATING_META` rating→{label,color} de `feedback-control.tsx:59` para `rating-meta.ts` e consumir nos DOIS , refatorar o FeedbackControl pra usar o helper, sem duplicar hex; badge usa a cor + tooltip do comentário), selo 🎤 (`Mic`) quando `kind==="audio"`, e a setinha "Sugestões" (chevron que expande `suggestions` como **chips read-only PRÓPRIOS** , NÃO reusar `SuggestionsBar` (onPick obrigatório + fallback); a `clickedSuggestion` em roxo mais escuro). **Áudio passa `kind="text"` ao AgentMessage** (o selo 🎤 é externo; `kind="audio"` nativo mostraria "(áudio expirado)").
- [ ] **Step 5:** tsc + eslint + rodar no dev (`agente up` já no ar): abrir `/agente/monitoramento/bubble`, navegar user→sessão→conversa. Checklist visual (ui-ux-pro-max): fidelidade à bubble, cores, espaçamento, responsivo.
- [ ] **Step 6:** Commit `feat(b2): aba Bubble + 3 colunas (colaboradores/sessoes/conversa)`.

---

## Task 7 (Fatia 4): Deep-link Backtest

**Files:** Modify `queries.ts`, `monitoramento-content.tsx`, `evaluations-table.tsx`.

- [ ] **Step 1:** `queries.ts`: `fetchQualityEvaluationRowById(id)` , usa `getEvaluationDetail(id)` e mapeia para um `EvaluationRow` completo (todos os campos que a tabela usa: id, conversationId, status, humanStatus, model, questionSnapshot, answerSnapshot, rodada, channel, createdAt, padrão dominante). Conferir os campos reais de `EvaluationRow`.
- [ ] **Step 2:** `monitoramento-content.tsx`: `const evalId = useSearchParams().get("eval")`; fetch da row; `const initialData = useMemo(()=> dedupeById([row, ...evaluations.rows]), [row, evaluations.rows])` (deps fixas, memo estável); passar `initialData`+`initialExpandedId={evalId}` à `EvaluationsTable`. Nota: o `useEffect(:131)` da tabela já faz `setData(initialData)` quando `initialData` muda (a linha sintética some no refetch de filtro , aceito, §3.4).
- [ ] **Step 3:** `evaluations-table.tsx`: nova prop `initialExpandedId?: string | null`; `expandedId = useState(() => initialExpandedId ?? null)` (uma vez). Drilldown se auto-carrega por id.
- [ ] **Step 4:** Verificação E2E: na coluna 3 do Bubble, clicar a tag do juiz → cai em `/agente/monitoramento?eval=<id>` com a linha expandida.
- [ ] **Step 5:** Commit `feat(b2): deep-link ?eval= abre a avaliacao no Backtest`.

---

## Task 8: Verificação final
- [ ] tsc 0, eslint 0, jest verde (todas as novas suites).
- [ ] Rebuild se necessário (schema mudou , `Message.kind`): `docker compose build app` + recreate (regra §2.1) , só se for validar em container; no dev local o `agente up` já usa o client regenerado.
- [ ] E2E completo: aba Bubble → colaborador → sessão → conversa fiel (roxa/cinza, raciocínio, tool, dia, áudio com 🎤, voto, sugestões com clicada destacada) → tag do juiz leva ao Backtest expandido.
- [ ] `superpowers:finishing-a-development-branch`.

---

## Self-review (cobertura da spec v3)
- §2 fatias → Tasks 1-7. §3.1 fórmula → Task 4 (computeAccuracy). §3.2 clicada → Task 5 Step 5. §3.3 áudio (kind + selo externo) → Tasks 2/3 + Task 6 Step 4. §3.5 Map juiz+sugestões → Task 5 Step 3. §3.6 AgentMessage intocado → Task 6 Step 4. §3.7 steps turno → Task 5 Step 2. §4 deep-link → Task 7. §6 actions → Tasks 4/5. §8 EvalStatusBadge → Task 1.
- Sem placeholders nas partes não-óbvias (fórmula, queries, 5-hop, deep-link). UI guiada por ui-ux-pro-max (Task 6).
