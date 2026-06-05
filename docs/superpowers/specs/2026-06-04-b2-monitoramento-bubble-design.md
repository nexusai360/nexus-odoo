# B2 · Aba "Bubble" de monitoramento das conversas

> Spec de design. Sub-projeto **B2** de "Monitoramento Bubble + Aprendizado".
> Data: 2026-06-04. **Status: v3** (reviews #1 e #2 aplicadas; pronta para PLAN).
> Brainstorm: requisitos detalhados pelo usuário (3 colunas read-only).

---

## 1. Contexto e objetivo

Super_admin não tem tela navegável pra ver **o que os usuários conversam com o Agente
Nex**. As conversas existem (`Conversation`/`Message`, canal `in_app`), o juiz avalia
respostas (`ConversationQualityEvaluation`) e o B1 captura o voto do usuário
(`MessageFeedback`). B2 entrega a aba **"Bubble"** (depois de Backtest e Router), 3
colunas read-only: colaboradores → sessões → conversa fiel à bubble (tag do juiz clicável
pro Backtest, voto do usuário, setinha de sugestões, indicador de áudio). Nome provisório
(WhatsApp reusa depois). **Estritamente leitura.**

> **Decisão de raiz: dados que faltavam passam a ser GRAVADOS, não cortados.** Sugestões
> nunca foram persistidas; `Message` não guarda se foi áudio; `SuggestionInteraction` é
> tabela morta (sem writers). B2 inclui **persistir** isso por mensagem, captado a partir
> de agora (histórico antigo degrada graciosamente: `text`/`[]`).

---

## 2. Escopo (fatiado = ordem do plano)

- **Fatia 0 , Refactor base:** extrair `STATUS_LABEL`/`STATUS_TONE` para um componente
  `EvalStatusBadge(status, humanStatus)` (com tooltip + `ShieldCheck` de ajuste humano),
  reusado no Backtest e na coluna 3. Backtest fica idêntico.
- **Fatia 1 , Captura de dados:** apenas `Message.kind String @default("text")` ("audio"
  na msg do usuário quando voz). **As sugestões oferecidas JÁ estão no banco** em
  `ConversationQualityEvaluation.suggestions` (gravadas no `done` por `createPendingEval`,
  `trigger.ts:66`), ligadas ao `assistantMessageId` , sem coluna nova.
- **Fatia 2 , Colunas 1+2:** actions `listBubbleCollaborators` + `listBubbleSessions` + UI.
- **Fatia 3 , Coluna 3:** action `getBubbleSessionMessages` + render via `AgentMessage`
  envelopado + badges (juiz/voto/áudio/sugestões) + separadores de dia.
- **Fatia 4 , Deep-link:** `?eval=<id>` no Backtest.
- **Fora:** B3 (aprendizado), F5 (WhatsApp), qualquer edição.

---

## 3. Decisões fechadas

1. **% de acerto (eixo do usuário, B1):** `totalVotos = CORRETO+PARCIAL+ERRADO+ALUCINOU`.
   `accuracyPct = round(100*(CORRETO + 0.5*PARCIAL)/totalVotos)`. `totalVotos===0` → **não
   exibe %** ("sem avaliações"). Sempre mostrar contadores brutos. A tag clicável da
   coluna 3 usa o **juiz** (eixo separado).
2. **Sugestões:** já no banco em `ConversationQualityEvaluation.suggestions` (lidas no Map
   §3.5, sem coluna nova). "Clicada" é **derivada**:
   no array ordenado por `createdAt asc`, uma sugestão da msg assistant é clicada se o
   `content` (trimado) da **próxima msg de usuário** é igual a ela. Edge cases: marcar a
   **primeira** ocorrência em caso de sugestões repetidas; tolerar falso-positivo de quem
   digitou manualmente o mesmo texto; última msg sem próximo user → nenhuma clicada.
3. **Áudio:** `Message.kind="audio"` (Fatia 1). Na coluna 3 a msg de áudio é renderizada
   como **texto normal (a transcrição) + um badge 🎤 no wrapper externo**. **NÃO** usar o
   `kind="audio"` nativo do `AgentMessage` (ele tenta player + mostra "(áudio expirado)"
   porque `audioBlobUrl` não persiste , `agent-message.tsx:112`).
4. **Deep-link:** injeção de linha sintética via `initialData` + `initialExpandedId`
   (`getEvaluationDetail(id)` carrega por id independente de período). A linha sintética
   **some ao mexer em qualquer filtro** (refetch sobrescreve); aceito , o drilldown se
   auto-carrega por id enquanto a linha existe.
5. **Mensagem→avaliação (e sugestões):** uma query por sessão
   `findMany({ where:{ conversationId, assistantMessageId:{ not:null } }, select:{ id, assistantMessageId, status, humanStatus, suggestions } })`
   → `Map<assistantMessageId,{id,statusEfetivo,suggestions}>`, `statusEfetivo = humanStatus ?? status`.
   3 estados: terminal → badge clicável; `PENDENTE` → "Pendente" (não clicável); sem row →
   **sem badge**.
6. **`AgentMessage` intocado:** wrapper externo `BubbleMonitorRow` renderiza
   `<AgentMessage feedbackEnabled={false} reveal={false} streaming={false} />` (sem
   `onSubmitFeedback` → o `FeedbackControl` não monta, gate em `agent-message.tsx:199`). Os
   badges (juiz, voto, 🎤, sugestões) vão no wrapper.
7. **Steps:** `getBubbleSessionMessages` **replica o range-merge de turno** de
   `getEvaluationDetail` (`queries.ts:404-441`): agrega os `toolCalls` das mensagens
   intermediárias na mensagem final do assistant (que é persistida sem toolCalls,
   `run-agent.ts:1057`). Sem isso o "Raciocínio" some (`agent-message.tsx:142` só mostra o
   trail com `steps` não-vazio).
8. **Separadores de dia estáticos** via `formatDayLabel` (não a tag flutuante do
   chat-panel). Nota: `formatDayLabel` usa TZ local do servidor (`format-datetime-relative.ts:19`),
   pode divergir 1 dia do Backtest (que usa America/Sao_Paulo); é o comportamento já
   vigente da bubble, consistente internamente.
9. **Cap:** `getBubbleSessionMessages` com `take: 1000` + aviso se truncar.

---

## 4. Layout (UI) , 3 colunas

`ui-ux-pro-max` é autoridade; reusar design system do monitoramento e da bubble. Sem
`scroll-area`/`avatar`/`resizable` no projeto → `overflow-y-auto` + avatar inline
(`sidebar.tsx:336`). Grid/flex de 3 colunas, responsivo (telas estreitas: empilhar ou
navegação por etapas , decidir no plano com `ui-ux-pro-max`).

```
[ Backtest ] [ Router ] [ Bubble ]
┌ Colaboradores ┬ Sessões ───────── ┬ Conversa (read-only) ──────────┐
│ ◐ foto nome   │ Sessão 3 (ativa)  │ [Ontem] (separador estático)   │
│   3 sessões ● │ 02/06 10:22→agora │ user (roxa, direita) 🎤        │
│   resumo %    │ 12 msgs · 80% ✓   │ IA (cinza, esquerda)           │
│ ◐ foto nome   │ Sessão 2          │  ▸ Raciocínio · Consultou…     │
│   1 sessão ○  │ 8 msgs · 50% ✓    │  [juiz: Correto]←Link [voto:P] │
│ …             │ …                 │  ▸ Sugestões (clicada escura)  │
└───────────────┴───────────────────┴────────────────────────────────┘
```

- **Coluna 1:** avatar (foto/inicial), nome, nº sessões, ponto verde/cinza (ativa/sem),
  mini-resumo (contadores por rating do usuário + % §3.1). Clicar → coluna 2.
- **Coluna 2:** Sessão N (recência), início→fim (`endedAt` ou "agora"), tag "ativa", "X
  msgs" (total cru), resumo §3.1. Clicar → coluna 3.
- **Coluna 3:** `AgentMessage` read-only envelopado + extras no wrapper: `EvalStatusBadge`
  do juiz clicável (`/agente/monitoramento?eval=<id>`), badge do voto B1 (tooltip do
  comentário), badge 🎤 se `kind="audio"`, setinha "Sugestões" (read-only, a clicada em
  roxo mais escuro). Separadores de dia. Scroll próprio.

---

## 5. Modelo de dados (Fatia 1 , migration aditiva)

Em `Message` (schema.prisma:2559), mesmo protocolo do B1 (aditiva; `agente schema-changed`):
```prisma
  kind        String   @default("text") @map("kind")
```

**Sugestões: SEM coluna nova , já estão no banco.** Persistidas em
`ConversationQualityEvaluation.suggestions` (schema:3206) por `createPendingEval`
(`trigger.ts:66`) no `done` (`run-agent.ts:1059`), ligadas ao `assistantMessageId`. B2 lê
dali junto do Map do juiz (§3.5).

**Persistência de `kind="audio"` (usuário, 5 saltos , especificar todos):**
1. `chat-panel.tsx:888` `handleSendAudio` → `handleSend(text, { isAudio: true })`.
2. `chat-panel.tsx:485` `handleSend` opts ganha `isAudio?: boolean`; inclui no body SSE.
3. body da request SSE ganha `meta.isAudio?: boolean` (campo **novo e dedicado**, NÃO
   reusar `meta.source`, que tem efeito em `run-agent.ts:734`).
4. `stream/route.ts:43` lê `body.meta?.isAudio` e passa `isAudio` a `runAgent`.
5. `run-agent.ts:604` o persist do user (`persistMessage(conversationId,"user",userMessage)`)
   ganha `kind`: criar variante/param opcional `kind?: string` em `persistMessage`
   (`conversation.ts`) gravado no `create` (não mudar a assinatura existente de forma
   destrutiva; default "text").

`getBubbleSessionMessages` expõe `kind` (de `Message`) e `suggestions` (do Map do juiz §3.5).

> **Opção de corte (se o áudio se mostrar caro):** a única coluna nova é `Message.kind`
> (5 saltos). Se o áudio for baixo valor, adia-se `kind`/áudio e B2 sai sem schema novo (as
> sugestões já saem). Decisão atual: **manter o áudio** (pedido explícito do usuário).

---

## 6. Server actions (novas, super_admin)

`src/lib/actions/monitoramento-bubble.ts`. Cada uma chama `requireMinRole("super_admin")`
(`auth/require.ts:19`). Leitura do cache interno.

1. **`listBubbleCollaborators()`** →
   `{ userId, name, avatarUrl, sessionCount, hasActiveSession, ratingCounts, accuracyPct }[]`.
   - `conversation.groupBy({ by:['userId'], where:{ channel:'in_app' }, _count:{ _all:true } })`;
   - ativa: `conversation.findMany({ where:{ channel:'in_app', endedAt:null }, select:{ userId }, distinct:['userId'] })`;
   - `user.findMany({ where:{ id:{ in } }, select:{ id, name, avatarUrl } })`;
   - votos: `messageFeedback.groupBy({ by:['userId','rating'], where:{ conversation:{ channel:'in_app' } } })`
     (`MessageFeedback.conversation` existe). Usuário sem voto → ratingCounts zerados (Map no app).
   - Ordenar por atividade recente (max `Conversation.updatedAt` por user).
2. **`listBubbleSessions(userId)`** →
   `{ conversationId, index, startedAt, endedAt|null, messageCount, ratingCounts, accuracyPct, isActive }[]`.
   `conversation.findMany({ where:{ userId, channel:'in_app' }, orderBy:{ createdAt:'desc' }, select:{ id, createdAt, endedAt, _count:{ select:{ messages:true } } } })`
   + `messageFeedback.groupBy({ by:['conversationId','rating'], where:{ conversation:{ userId, channel:'in_app' } } })`.
   `index` derivado da recência; `isActive = endedAt===null`.
3. **`getBubbleSessionMessages(conversationId)`** → como `getConversationMessages`, mas:
   - **sem trava de dono** (`conversation-messages.ts:68`) e **sem filtro `endedAt:null`**
     (`:74`); `take:1000`.
   - feedback **do DONO**: `messageFeedback.findMany({ where:{ conversationId } })` (todos
     os votos da conversa = do dono pela unicidade por msg); **NÃO** filtrar por
     `currentUser` (divergência obrigatória do DTO B1, senão o super_admin veria voto vazio).
   - DTO acrescenta por mensagem: `kind` (de `Message`); `suggestions` + `evaluation?:{ id, status }`
     (ambos do Map §3.5); `clickedSuggestion?: string` (derivada §3.2); `feedback?` (do dono).
   - steps via range-merge de turno (§3.7), não `stepsFromToolCalls` puro.

`ratingCounts`/`accuracyPct`: fórmula §3.1. `_count` no Prisma 7 é
`_count:{ select:{ messages:true } }` (não shorthand).

---

## 7. Deep-link Backtest (Fatia 4)
- Tag do juiz (coluna 3) = `<Link href={`/agente/monitoramento?eval=${evalId}`}>`.
- `MonitoramentoContent` (`monitoramento-content.tsx`): `useSearchParams().get("eval")`; se
  presente, nova action `fetchQualityEvaluationRowById(id)` (mapeia `getEvaluationDetail`
  → `EvaluationRow` completo) e, via `useMemo`, monta `initialData` = `[rowSintetica,
  ...evaluations.rows]` (dedupe por id), passando `initialExpandedId={id}` à `EvaluationsTable`.
- `EvaluationsTable` (`evaluations-table.tsx:122`): nova prop `initialExpandedId`,
  `expandedId = useState(() => initialExpandedId ?? null)` (inicializa **uma vez**, não
  `useEffect`). O `EvaluationDrilldown` se auto-carrega por id (`:106`). A linha sintética
  é descartada no primeiro refetch de filtro (aceito, §3.4).

---

## 8. Reuso e extrações
- **Reusar:** `AgentMessage` (read-only envelopado), `MarkdownLite`, `Badge`,
  `requireMinRole`, `PageShell`, `PageHeader`, `MonitoramentoNav` (3ª tab), `Card`,
  `Table`, `Tooltip`, `Skeleton`, `formatDayLabel`, `getEvaluationDetail`, enums.
- **Extrair:** `EvalStatusBadge(status, humanStatus)` (Fatia 0, leva o `ShieldCheck`+tooltip).
- **Criar:** `bubble/page.tsx`, componente 3-colunas, `BubbleMonitorRow`, 3 actions +
  `fetchQualityEvaluationRowById`, avatar inline, separadores de dia, setinha de sugestões.

---

## 9. RBAC e segurança
- Rota herda `requireMinRole("super_admin")` (`(protected)/agente/layout.tsx:18`).
- Cada action revalida `super_admin`. Read-only; nenhuma mutação nesta tela. Captura de
  `kind`/`suggestions` é do turno do agente, não desta tela.

---

## 10. Testes (TDD)
- Captura (Fatia 1): `done` grava `suggestions` no assistant; `kind="audio"` com flag de
  voz; default "text"/[] caso contrário. Teste do helper `persistMessageAndReturnId` com
  `suggestions`.
- Actions (Fatia 2/3): `accuracyPct` (`totalVotos=0` → sem %; PARCIAL=0.5); ordenação/
  `index`; inclui arquivadas; recusa não-super_admin; super_admin lê conversa alheia;
  feedback do DONO (não do super_admin); Map mensagem→avaliação (terminal/pending/sem-row);
  "clicada" derivada (incl. repetidas → primeira; última sem próximo).
- Componente (leve/manual): 3 colunas navegam; vazios; tag do juiz clicável; voto exibido;
  selo 🎤; setinha de sugestões com clicada destacada.
- E2E: abrir aba → usuário → sessão → conversa fiel → clicar tag → Backtest expandido.

---

## 11. Migration e coordenação
Outra worktree ativa (router) também toca `Message`/`run-agent`/`chat-panel` → possível
conflito de merge, resolver no merge. Protocolo: avisar, migration aditiva,
`agente schema-changed`, rebuild (regra §2.1; `Message` afeta Prisma client app+mcp+worker;
worker via `build app`).

---

## 12. Decisões canônicas
1. Read-only; super_admin only.
2. Resumos de acerto = voto do usuário (B1); tag clicável = juiz. Eixos separados.
3. `Message.kind` persistido (áudio, captura a partir de agora). Sugestões já no banco
   (`ConversationQualityEvaluation.suggestions`) , sem coluna nova.
4. Sugestão clicada é derivada (próxima msg de user == sugestão; 1ª ocorrência).
5. `AgentMessage` intocado; extras no wrapper `BubbleMonitorRow`; áudio = texto + 🎤 (não
   `kind="audio"` nativo).
6. Deep-link por linha sintética + `initialExpandedId` (some no refetch, aceito).
7. `EvalStatusBadge(status, humanStatus)` extraído; reusado no Backtest e na coluna 3.
8. % = `(CORRETO + 0.5*PARCIAL)/totalVotos`; 0 votos → "sem avaliações".
9. Steps por range-merge de turno; feedback do DONO (filtro por conversationId).
10. Flag de áudio é boolean dedicado `meta.isAudio` (não reusar `source`); persist via param
    `kind` opcional (sem quebrar assinaturas existentes).
