# Roteamento Contextual + Janela de Contexto + Migração de Config , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-a-task. Steps usam checkbox (`- [ ]`).
> **PLAN v3 (final, vai para execução).** Spec: `docs/superpowers/specs/2026-05-29-roteamento-contextual-e-janela-de-contexto-design.md` (v3).
> Regras de raiz: pt-br, **sem em dash**; TDD; commits frequentes; toda UI via `ui-ux-pro-max`; Opus sempre; rebuild de containers após tocar `src/lib/agent/**`/schema (CLAUDE.md §2.1).

## Histórico de review do plano

### Review #1 (v1 -> v2)

| # | Achado | Resolução |
|---|---|---|
| P1.1 | **Telemetria invertida:** re-embedding marcado como `router_reformulacao` e chamada LLM de reformulação sem log. | P4 passa a logar o **chat** de reformulação como `router_reformulacao` (via `logUsage`); P6.1 loga o **re-embedding** como `router`. |
| P1.2 | P6.1 usa `resolveReformLlm` antes de defini-lo (P6.2). | P6.2 reordenado para **antes** de P6.1. |
| P1.3 | Cast cego `as CheckpointState` sobre o enum Prisma `FeatureCheckpoint`. | P3.1: usar o valor do enum Prisma direto (mesmas strings OFF/PLAYGROUND/PRODUCTION) e tipar `resolveContextWindow` por união de string literal, sem depender do tipo da UI. |
| P1.4 | Origem do sufixo mascarado das chaves não especificada. | P8.5 (nova): derivar o `maskedSuffix` server-side em `configuracao/page.tsx` (decrypt -> últimos 4) num helper, sem expor a chave. |
| P1.5 | Falta task de Backtest (spec §5.1). | P11.2 (nova): investigação dirigida + verificação de retrocompat do Backtest. |
| P1.6 | `contextWindowSize` clampado só na leitura. | P7.1: clamp 10..50 também na escrita (Zod). |

### Review #2 (v2 -> v3)

| # | Achado | Resolução |
|---|---|---|
| P2.1 | `logUsage` precisa de tokens do chat de reformulação; faltava dizer como obter. | P4: usar o `usage` retornado por `client.chat` (campos `tokensInput/Output/costUsd`) e passar a `logUsage` com `origin:"router_reformulacao"`, `conversationId`, `userId`, `isPlayground`. |
| P2.2 | Mock de `agentSettings` nos testes existentes do run-agent vai quebrar sem os campos novos. | P3.1 Step 6 e P6.1 Step 4: atualizar os fixtures/mocks de `agentSettings` com os defaults novos (`contextWindow*`, `routerReform*`, `routerEmbeddingModel`) numa única factory de teste reutilizada. |
| P2.3 | Editar credencial de embedding no bloco novo precisa escrever na MESMA fonte que `embed()` lê (AppSetting), senão diverge do RAG. | P10.1 Step 3: reusar a server action existente de `actions/router-embedding-credential.ts` (que já grava o AppSetting), não criar caminho novo. Teste de fumaça: trocar credencial no bloco e confirmar que `embed()` resolve a nova. |
| P2.4 | "Acessar painel do router" descrito de forma confusa. | P10.1: é um `Link`/botão secundário simples (ícone `ArrowUpRight`), não relacionado a `ApiKeySelect`. |

Critério de saída: nenhum achado material novo; ordem de tasks, telemetria, tipos e fontes de dado fechados.

**Goal:** Tornar o router de catálogo contextual (3 camadas: embedding -> LLM de reformulação só no fallback -> re-embedding), expor a janela de contexto da resposta como configuração, e migrar a config do router (credencial de embedding + construção da pergunta) para a tela de Configuração, com telemetria completa.

**Architecture:** Backend gated dentro do `runAgent` (um único ponto cobre playground/bubble/WhatsApp). `loadHistory` vira parametrizável. Novo módulo `router/contextualize.ts` espelha o padrão LLM-sobre-pares do `contextual-suggester.ts`. Frontend reusa `ResourceCard`/`FieldBlock`/`CustomSelect`, adiciona slider e segmented novos (consistentes), e um `ApiKeySelect` com sufixo mascarado + "Nova chave de <Provedor>".

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7 (Postgres), Tailwind v4 + base-ui, Jest, OpenAI embeddings (text-embedding-3-large), LLM via `buildLlmClient`.

---

## Estrutura de arquivos (decomposição)

**Backend / dados:**
- `prisma/schema.prisma` , campos novos em `AgentSettings` (migration aditiva).
- `src/lib/agent/conversation.ts` , `loadHistory` ganha filtro de papéis; reuso de `getLastNPairs`.
- `src/lib/agent/router/contextualize.ts` (novo) , `reformulateQuestion`.
- `src/lib/agent/router/log-decision.ts` , campos novos na `createDecision`.
- `src/lib/agent/run-agent.ts` , integração 3 camadas + RBAC na decisão final + janela configurável.
- `src/lib/actions/agent-config.ts` , persistência dos campos novos (server actions).
- `src/lib/agent/router/queries.ts` + tabela de requisições , exibir reformulação.
- `scripts/router/calibrate-rounds.ts` , variante contextual (validação).

**Frontend (Configuração):**
- `src/app/(protected)/agente/configuracao/page.tsx` , carrega/serve os novos campos.
- `src/components/agent/resources-toggles.tsx` , novos blocos + retrofit das chaves.
- `src/components/agent/context-window-card.tsx` (novo) , bloco Janela de contexto.
- `src/components/agent/router-config-card.tsx` (novo) , bloco Configuração de Router.
- `src/components/ui/range-slider.tsx` (novo) , slider 10..50.
- `src/components/ui/segmented-control.tsx` (novo) , segmented 2 opções.
- `src/components/ui/api-key-select.tsx` (novo) , select de chave + "Nova chave de X".
- `src/lib/agent/llm/catalog.ts` , helper `listEmbeddingModels(provider)`.

---

## Fase P0 , Preparação e baseline

### Task P0.1: Garantir baseline verde antes de mexer

**Files:** nenhum (verificação).

- [ ] **Step 1: rodar baseline**

Run: `cd <worktree> && npm run typecheck && npx jest --silent 2>&1 | tail -5`
Expected: tsc sem erros; Jest todos passando (suite atual ~2029 testes).

- [ ] **Step 2: confirmar branch e sync**

Run: `git status --short && git log --oneline -1`
Expected: árvore limpa; HEAD na SPEC v3 commit.

---

## Fase P1 , Schema e settings (migration aditiva)

### Task P1.1: Adicionar campos em AgentSettings

**Files:**
- Modify: `prisma/schema.prisma` (model `AgentSettings`)
- Migration: `prisma/migrations/<ts>_context_window_e_router_reform/`

- [ ] **Step 1: editar schema** , adicionar ao model `AgentSettings` (logo após `maxSuggestions`):

```prisma
  // Janela de contexto da resposta (R2-ctx). Default preserva o comportamento atual.
  contextWindowCheckpoint    FeatureCheckpoint @default(PRODUCTION) @map("context_window_checkpoint")
  contextWindowSize          Int               @default(20)        @map("context_window_size")
  contextWindowIncludeSystem Boolean           @default(true)      @map("context_window_include_system")

  // Construção da pergunta (Camada 2 do router contextual). Nasce OFF.
  routerReformCheckpoint     FeatureCheckpoint @default(OFF)       @map("router_reform_checkpoint")
  routerReformProvider       String?           @map("router_reform_provider")
  routerReformModel          String?           @map("router_reform_model")
  routerReformCredentialId   String?  @db.Uuid @map("router_reform_credential_id")
  routerReformNPairs         Int               @default(5)         @map("router_reform_n_pairs")

  // Escolha de modelo de embedding do router (credencial continua na fonte única do RAG).
  routerEmbeddingModel       String?           @map("router_embedding_model")
```

- [ ] **Step 2: criar migration** , Run: `set -a && . ./.env.local && set +a && npx prisma migrate dev --name context_window_e_router_reform`
Expected: migration criada e aplicada; "Database schema is up to date".

- [ ] **Step 3: avisar schema mudou (protocolo multi-worktree)** , Run: `agente schema-changed`
Expected: sinal registrado.

- [ ] **Step 4: regenerar client + typecheck** , Run: `npx prisma generate && npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: commit** , `git add prisma/ src/generated && git commit -m "feat(settings): campos de janela de contexto e router reform (migration aditiva)"`

---

## Fase P2 , loadHistory com filtro de papéis (R2.2, §6.1)

### Task P2.1: Teste falhando do filtro de papéis

**Files:**
- Test: `src/lib/agent/conversation.test.ts` (adicionar describe `loadHistory includeSystem`)

- [ ] **Step 1: escrever teste** , cobrir: (a) `includeSystem:true` (default) retorna todos os papéis como hoje; (b) `includeSystem:false` remove `role:"tool"` e remove `toolCalls` de mensagens assistant, descartando assistant sem texto. Mock do `prisma.message.findMany` retornando uma sequência `[user, assistant(toolCalls,sem texto), tool, assistant("resposta")]`.

```ts
test("includeSystem=false remove tool e toolCalls, mantem user+assistant texto", async () => {
  mockFindMany.mockResolvedValueOnce([
    { id: "m4", role: "assistant", content: "resposta final", toolCalls: null, createdAt: new Date(4) },
    { id: "m3", role: "tool", content: "{...}", toolCalls: null, createdAt: new Date(3) },
    { id: "m2", role: "assistant", content: "", toolCalls: [{ id: "c1", name: "x", arguments: {} }], createdAt: new Date(2) },
    { id: "m1", role: "user", content: "quanto faturei?", toolCalls: null, createdAt: new Date(1) },
  ]);
  const out = await loadHistory("conv-1", 10, { includeSystem: false });
  expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(out.every((m) => m.toolCalls == null)).toBe(true);
});
```

- [ ] **Step 2: rodar e ver falhar** , Run: `npx jest src/lib/agent/conversation.test.ts -t "includeSystem" 2>&1 | tail -15`
Expected: FAIL (loadHistory ignora o 3º arg).

- [ ] **Step 3: implementar** , em `conversation.ts`, mudar assinatura para `loadHistory(conversationId, budget = DEFAULT_HISTORY_BUDGET, opts?: { includeSystem?: boolean })`. Após buscar e inverter, se `opts?.includeSystem === false`:

```ts
if (opts?.includeSystem === false) {
  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => ({ ...m, toolCalls: null }))
    .filter((m) => m.role !== "assistant" || (m.content && m.content.trim().length > 0))
    .map((m) => ({ id: m.id, role: m.role as MessageRole, content: m.content, toolCalls: null }));
}
```
(mantém o `return` atual para o caso default).

- [ ] **Step 4: rodar e ver passar** , Run: `npx jest src/lib/agent/conversation.test.ts -t "includeSystem" 2>&1 | tail -8` , Expected: PASS. Rodar também os testes existentes de `loadHistory` (não regredir).

- [ ] **Step 5: commit** , `git add src/lib/agent/conversation.ts src/lib/agent/conversation.test.ts && git commit -m "feat(agent): loadHistory com filtro de papeis (includeSystem)"`

---

## Fase P3 , Resolver da janela de contexto no runAgent (R2.2)

### Task P3.1: helper de resolução (budget + includeSystem por checkpoint)

**Files:**
- Create: `src/lib/agent/context-window.ts`
- Test: `src/lib/agent/context-window.test.ts`

- [ ] **Step 1: teste** , `resolveContextWindow({ checkpoint, size, includeSystem }, { isPlayground })` retorna `{ budget, includeSystem }`. Casos: OFF -> budget 0; PLAYGROUND + isPlayground=false -> budget 0; PLAYGROUND + isPlayground=true -> budget=clamp(size); PRODUCTION -> budget=clamp(size) sempre. Clamp 10..50. size=200 -> 50; size=3 -> 10.

- [ ] **Step 2: ver falhar** , Run: `npx jest src/lib/agent/context-window.test.ts 2>&1 | tail -10` , Expected: FAIL.

- [ ] **Step 3: implementar**

```ts
// Tipo local (mesmas strings do enum Prisma FeatureCheckpoint), sem acoplar à UI.
export type ContextCheckpoint = "OFF" | "PLAYGROUND" | "PRODUCTION";
const MIN = 10, MAX = 50;
export function resolveContextWindow(
  cfg: { checkpoint: ContextCheckpoint; size: number; includeSystem: boolean },
  ctx: { isPlayground: boolean },
): { budget: number; includeSystem: boolean } {
  const clamp = Math.max(MIN, Math.min(MAX, cfg.size || 20));
  const active =
    cfg.checkpoint === "PRODUCTION" ||
    (cfg.checkpoint === "PLAYGROUND" && ctx.isPlayground);
  return { budget: active ? clamp : 0, includeSystem: cfg.includeSystem };
}
```

- [ ] **Step 4: ver passar** , Run: `npx jest src/lib/agent/context-window.test.ts 2>&1 | tail -6` , Expected: PASS.

- [ ] **Step 5: wire no runAgent** , em `run-agent.ts` substituir `const rawHistory = await loadHistory(args.conversationId, 20);` por:

```ts
const cw = resolveContextWindow(
  {
    checkpoint: agentSettings.contextWindowCheckpoint, // FeatureCheckpoint, mesmas strings de ContextCheckpoint
    size: agentSettings.contextWindowSize,
    includeSystem: agentSettings.contextWindowIncludeSystem,
  },
  { isPlayground: Boolean(args.isPlayground) },
);
const rawHistory = await loadHistory(args.conversationId, cw.budget, { includeSystem: cw.includeSystem });
```

- [ ] **Step 6: typecheck + testes do run-agent** , Run: `npm run typecheck && npx jest run-agent 2>&1 | tail -8` , Expected: verdes (ajustar mocks de settings se necessário, adicionando os campos novos com defaults).

- [ ] **Step 7: commit** , `git add -A && git commit -m "feat(agent): janela de contexto configuravel aplicada no runAgent"`

---

## Fase P4 , Módulo de reformulação (Camada 2)

### Task P4.1: contextualize.ts (reformulateQuestion) com teste

**Files:**
- Create: `src/lib/agent/router/contextualize.ts`
- Test: `src/lib/agent/router/contextualize.test.ts`

Espelha `intelligence/contextual-suggester.ts` (monta pares, chama LLM, timeout 2.5s, fallback null).

- [ ] **Step 1: teste** , casos: (a) sem pares -> retorna `{ reformulated: null, used: false }` sem chamar LLM; (b) com pares -> chama client.chat (mockado) e retorna a linha sanitizada como `reformulated`; (c) timeout/erro -> `{ reformulated: null, used: false }`. Mock de `getLastNPairs` e `buildLlmClient`.

- [ ] **Step 2: ver falhar** , Run: `npx jest contextualize 2>&1 | tail -10`

- [ ] **Step 3: implementar** , assinatura:

```ts
export interface ReformulateInput {
  conversationId: string | null;
  currentQuestion: string;
  nPairs: number;
  llm: { provider: string; apiKey: string; model: string };
}
export interface ReformulateResult { reformulated: string | null; used: boolean; }
export async function reformulateQuestion(input: ReformulateInput): Promise<ReformulateResult>;
```
Lógica: se `!conversationId` -> `{null,false}`. `const pairs = await getLastNPairs(conversationId, input.nPairs)`; se vazio -> `{null,false}`. Monta histórico (formato "Par i: Usuario/Agente", cronológico asc, slices 400/600). `const res = await client.chat({ messages, temperature:0, maxTokens:120, reasoningEffort: minimo })` dentro de `Promise.race` com timeout 2500ms. **Telemetria (P1.1/P2.1):** após o chat, logar o consumo com `logUsage({ origin:"router_reformulacao", conversationId, userId: input.userId, isPlayground: input.isPlayground, tokensInput: res.usage.tokensInput, tokensOutput: res.usage.tokensOutput, costUsd: res.usage.costUsd, model: input.llm.model })` (fire-and-forget, não bloqueia). Saída: 1ª linha não vazia de `res.message`, trim, sem aspas/markdown. Em erro/timeout -> `{null,false}`. A assinatura ganha `userId?: string; isPlayground?: boolean` para a telemetria. Conferir os campos exatos de `logUsage` em `src/lib/agent/llm/usage-logger.ts` no Step de implementação e ajustar nomes.

- [ ] **Step 4: ver passar** , Run: `npx jest contextualize 2>&1 | tail -6` , Expected: PASS.

- [ ] **Step 5: commit** , `git commit -am "feat(router): modulo de reformulacao de pergunta (Camada 2)"`

---

## Fase P5 , Campos de telemetria na decisão (§5)

### Task P5.1: AgentRouterDecision ganha campos de origem

**Files:**
- Modify: `prisma/schema.prisma` (model `AgentRouterDecision`)
- Modify: `src/lib/agent/router/log-decision.ts`
- Test: `src/lib/agent/router/log-decision.test.ts` (se existir; senão criar)

- [ ] **Step 1: schema** , adicionar (nullable, retrocompatível):
```prisma
  reformulatedQuestion String?  @map("reformulated_question")
  usedReformulation    Boolean  @default(false) @map("used_reformulation")
  originalFallback     Boolean  @default(false) @map("original_fallback")
```
- [ ] **Step 2: migration** , Run: `set -a && . ./.env.local && set +a && npx prisma migrate dev --name router_decision_reform_fields && agente schema-changed && npx prisma generate`
- [ ] **Step 3: estender `CreateDecisionInput`** , adicionar `reformulatedQuestion?: string | null; usedReformulation?: boolean; originalFallback?: boolean;` e gravar no `prisma.agentRouterDecision.create`. Defaults: `usedReformulation:false`, `originalFallback:false`.
- [ ] **Step 4: teste** , createDecision com os campos novos persiste os valores; sem eles, defaults. Run: `npx jest log-decision 2>&1 | tail -8` , Expected: PASS.
- [ ] **Step 5: commit** , `git commit -am "feat(router): campos de origem (reformulacao/fallback) na decisao"`

---

## Fase P6 , Integração 3 camadas no runAgent (§4.2) + RBAC na decisão final

> **Ordem (P1.2): executar a Task P6.2 (resolver do LLM) ANTES da P6.1**, pois P6.1 chama `resolveReformLlm`.

### Task P6.1: substituir o trecho de roteamento por 3 camadas

**Files:**
- Modify: `src/lib/agent/run-agent.ts:423-453` (bloco pickDomains + createDecision)
- Modify: `src/lib/agent/run-agent.ts:461-483` (fast-path RBAC usa decisão final)
- Test: `src/lib/agent/run-agent.contextual.test.ts` (novo)

- [ ] **Step 1: teste de integração (falhando)** , 3 cenários com mocks: (a) Camada 1 sem fallback -> não chama reformulateQuestion, decisão final = L1; (b) Camada 1 fallback + reform ON + active + pares>0 -> chama reformulateQuestion (mock retorna pergunta enriquecida), re-roda pickDomains, decisão final = L3, `usedReformulation=true`, `originalFallback=true`; (c) reform retorna null -> mantém L1. E um teste de **segurança**: usuário sem acesso ao domínio, L1 fallback, reform leva a domínio proibido -> fast-path de recusa dispara sobre a decisão final.

- [ ] **Step 2: ver falhar** , Run: `npx jest run-agent.contextual 2>&1 | tail -12`

- [ ] **Step 3: implementar** , reescrever o bloco para a sequência da spec §4.2:

```ts
const settings = { threshold: agentSettings.routerThreshold, topK: agentSettings.routerTopK };
const decisaoL1 = await pickDomains(args.userMessage, settings, {
  origin: "router", conversationId: args.conversationId, userId: args.userId, isPlayground: args.isPlayground,
});
let decisaoFinal = decisaoL1;
let reformulated: string | null = null;

const reformActive =
  agentSettings.routerReformCheckpoint === "PRODUCTION" ||
  (agentSettings.routerReformCheckpoint === "PLAYGROUND" && args.isPlayground);
// Em shadow (routerEnabled=false) NAO gasta LLM (so Camada 1 loga). Em active, reformula na cauda de fallback.
if (decisaoL1.fallback.triggered && reformActive && agentSettings.routerEnabled) {
  const reformLlm = await resolveReformLlm(agentSettings); // Task P6.2
  if (reformLlm) {
    const r = await reformulateQuestion({
      conversationId: args.conversationId, currentQuestion: args.userMessage,
      nPairs: agentSettings.routerReformNPairs, llm: reformLlm,
      userId: args.userId, isPlayground: args.isPlayground,
    });
    if (r.reformulated) {
      reformulated = r.reformulated;
      // Re-embedding (Camada 3) loga como "router" (a chamada LLM de reformulacao
      // ja foi logada como "router_reformulacao" dentro de reformulateQuestion).
      decisaoFinal = await pickDomains(reformulated, settings, {
        origin: "router", conversationId: args.conversationId, userId: args.userId, isPlayground: args.isPlayground,
      });
    }
  }
}

const routerMode: "shadow" | "active" = agentSettings.routerEnabled ? "active" : "shadow";
const routerLog = await createDecision({
  decision: decisaoFinal, mode: routerMode, catalogSizeOffered: 0,
  catalogSizeFull: allToolsBeforeRouter.length, userQuestion: args.userMessage,
  conversationId: args.conversationId ?? null, llmModelUsed: null,
  reformulatedQuestion: reformulated, usedReformulation: reformulated !== null,
  originalFallback: decisaoL1.fallback.triggered,
});
const routerDecisionId = routerLog.decisionId;
```
Depois trocar TODAS as referências de `routerDecision` no fast-path (461-483) e no `filterCatalog` (488-493) por `decisaoFinal`. **Importante:** a resposta do agente continua usando `args.userMessage` (não a reformulada), conforme §4.2 nota crítica.

- [ ] **Step 4: ver passar** , Run: `npx jest run-agent 2>&1 | tail -10` , Expected: PASS (todos, inclusive os existentes).

- [ ] **Step 5: commit** , `git commit -am "feat(router): roteamento contextual 3 camadas + RBAC na decisao final"`

### Task P6.2: resolver do LLM de reformulação

**Files:**
- Create: `src/lib/agent/router/get-reform-config.ts`
- Test: `src/lib/agent/router/get-reform-config.test.ts`

- [ ] **Step 1: teste** , `resolveReformLlm(agentSettings)` retorna `{provider, apiKey, model}` quando `routerReformProvider/Model/CredentialId` setados (descriptografa credencial via `decrypt` + prisma `llmCredential`); fallback para `getActiveLlmConfig()` quando não setado; null se nada disponível.
- [ ] **Step 2-4: ver falhar / implementar / ver passar** (espelhar `embed.ts` na resolução de credencial: `prisma.llmCredential.findUnique` + `decrypt`).
- [ ] **Step 5: commit** , `git commit -am "feat(router): resolver de credencial do modelo de reformulacao"`

---

## Fase P7 , Persistência das settings (server actions)

### Task P7.1: estender updateAgentResources + nova action de router config

**Files:**
- Modify: `src/lib/actions/agent-config.ts`
- Test: `src/lib/actions/agent-config.test.ts` (se existir)

- [ ] **Step 1: teste** , `updateAgentResources` aceita e grava `contextWindowCheckpoint/Size/IncludeSystem`, com **clamp 10..50 no `contextWindowSize` na escrita** (P1.6) via Zod (`z.number().int().min(10).max(50)` ou clamp explícito). Nova `updateRouterConfig({ routerReformCheckpoint, routerReformProvider, routerReformModel, routerReformCredentialId, routerReformNPairs, routerEmbeddingModel })` grava e valida (nPairs clamp 1..10). Zod nos inputs.
- [ ] **Step 2-4:** ver falhar / implementar / ver passar. Reusar o padrão de validação/persistência já presente no arquivo.
- [ ] **Step 5: commit** , `git commit -am "feat(config): persistencia de janela de contexto e router config"`

---

## Fase P8 , Componentes de UI base (ui-ux-pro-max)

> Antes de cada task de UI: aplicar `ui-ux-pro-max` (consistência com `ResourceCard`/`FieldBlock`/`CustomSelect`; sem emoji; foco visível; contraste AA; dark mode; copy pt-br sem em dash).

### Task P8.1: RangeSlider (10..50)

**Files:**
- Create: `src/components/ui/range-slider.tsx`
- Test: `src/components/ui/range-slider.test.tsx`

- [ ] **Step 1: teste** , renderiza com value, min, max, step; chama `onChange` com número; badge mostra o valor; respeita disabled; teclado (setas) muda o valor. Usar base-ui Slider se disponível no projeto (checar import existente); senão `<input type="range">` estilizado + badge tabular.
- [ ] **Step 2-4:** ver falhar / implementar / ver passar.
- [ ] **Step 5: commit.**

### Task P8.2: SegmentedControl (2 opções)

**Files:**
- Create: `src/components/ui/segmented-control.tsx`
- Test: `src/components/ui/segmented-control.test.tsx`

- [ ] **Step 1: teste** , 2 segmentos; clique muda valor; estado ativo por fundo/peso (não só cor); `role="group"`, `aria-pressed`. (Reaproveitar o estilo do grupo "Máximo por resposta" de `resources-toggles.tsx` linhas 449-480 como referência visual.)
- [ ] **Step 2-5:** ver falhar / implementar / ver passar / commit.

### Task P8.3: ApiKeySelect (sufixo mascarado + "Nova chave de X")

**Files:**
- Create: `src/components/ui/api-key-select.tsx`
- Test: `src/components/ui/api-key-select.test.tsx`

- [ ] **Step 1: teste** , recebe `provider`, `options: {id,label,maskedSuffix}[]`, `value`, `onChange`; renderiza cada opção como "Label · ••••XXXX"; item-ação no rodapé "Nova chave de <ProvedorLabel>" que navega para `/agente/chaves?provider=<provider>` (Link). Sem texto "cadastrada em...".
- [ ] **Step 2-5:** ver falhar / implementar (compor sobre `CustomSelect` + footer slot, ou base-ui Select) / ver passar / commit.

### Task P8.4: catálogo , listEmbeddingModels(provider)

**Files:**
- Modify: `src/lib/agent/llm/catalog.ts`
- Test: `src/lib/agent/llm/catalog.test.ts`

- [ ] **Step 1: teste** , `listEmbeddingModels("openai")` retorna só modelos de embedding (ex.: text-embedding-3-large/small); outros provedores retornam seus modelos de embedding ou vazio.
- [ ] **Step 2-5:** ver falhar / implementar (filtrar o catálogo por capability "embedding") / ver passar / commit.

### Task P8.5: helper de sufixo mascarado das credenciais (P1.4)

**Files:**
- Modify: `src/app/(protected)/agente/configuracao/page.tsx` (ou um helper server em `src/lib/agent/llm/credentials.ts`)
- Test: `src/lib/agent/llm/credentials.test.ts` (se aplicável)

- [ ] **Step 1: investigar** , conferir se `LlmCredential` já guarda um hint (ex.: `last4`) ou se a chave é só `encryptedKey`. Se houver hint, usar; senão, derivar server-side: `decrypt(encryptedKey)` -> últimos 4 chars -> `maskedSuffix`.
- [ ] **Step 2: helper** , `buildCredentialOptions(credentials): { id, label, maskedSuffix }[]` retornando o sufixo `••••XXXX`. NUNCA enviar a chave inteira ao client.
- [ ] **Step 3: teste** , dado credencial com chave `sk-...DFYA`, `maskedSuffix === "••••DFYA"`.
- [ ] **Step 4:** ver passar; usar esse helper para montar `credentialsByProvider` na page (consumido por `ApiKeySelect` e pelo retrofit de áudio/anexo).
- [ ] **Step 5: commit** , `git commit -am "feat(config): helper de sufixo mascarado das credenciais"`

---

## Fase P9 , Bloco "Janela de contexto"

### Task P9.1: ContextWindowCard + montagem

**Files:**
- Create: `src/components/agent/context-window-card.tsx`
- Modify: `src/components/agent/resources-toggles.tsx` (render abaixo de "Sugestões na Bubble" + estado + persistência)
- Modify: `src/app/(protected)/agente/configuracao/page.tsx` (passar os campos novos para `initial`)

- [ ] **Step 1:** `ContextWindowCard` usa `ResourceCard` (ícone Lucide ex. `History`, título "Janela de contexto", subtitle pt-br explicando que vale em bubble/WhatsApp/playground), checkpoint `contextWindowCheckpoint`. Quando != OFF: `RangeSlider` (10..50, valor = `contextWindowSize`) + `SegmentedControl` ("Usuário + IA" / "Usuário + IA + Sistema (tools)").
- [ ] **Step 2:** wire em `resources-toggles.tsx`: novo estado `contextWindowCp/Size/IncludeSystem`, `persistResources` estendido (ou chamar `updateAgentResources` com os campos novos). `configuracao/page.tsx` lê os campos do `agentSettings` e passa em `initial`.
- [ ] **Step 3:** typecheck + (se houver) teste de render. Run: `npm run typecheck`.
- [ ] **Step 4: rebuild app + smoke visual** , Run: `docker compose up -d --build app` e abrir a tela (ver Fase P12). 
- [ ] **Step 5: commit** , `git commit -am "feat(config): bloco Janela de contexto (slider + segmented)"`

---

## Fase P10 , Bloco "Configuração de Router" + migração da credencial

### Task P10.1: RouterConfigCard (sub-blocos Construção da pergunta + Embeddings) + atalho

**Files:**
- Create: `src/components/agent/router-config-card.tsx`
- Modify: `src/components/agent/resources-toggles.tsx` (render abaixo de Janela de contexto)
- Modify: `src/app/(protected)/agente/configuracao/page.tsx` (carregar credenciais por provedor + credencial de embedding atual)
- Reaproveitar lógica de `src/components/agent/router/router-embedding-credential.tsx` (origem) , a fonte da credencial é a mesma (AppSetting), só muda o lugar da UI.

- [ ] **Step 1:** `RouterConfigCard` usa `ResourceCard` (ícone `Route`/`Network`, título "Configuração de Router", checkpoint = `routerReformCheckpoint`). Conteúdo: dois `FieldBlock`-groups com heading secundário:
  - **Construção da pergunta:** Provedor (`CustomSelect`) / Modelo (`SearchableSelect`, modelos de chat) / Chave (`ApiKeySelect`). Persiste via `updateRouterConfig`.
  - **Embeddings:** Provedor / Modelo (`listEmbeddingModels`) / Chave (`ApiKeySelect`). A credencial edita a MESMA fonte do RAG (action de `actions/router-embedding-credential.ts`); o modelo grava `routerEmbeddingModel`.
  - Rodapé: botão secundário simples "Acessar painel do router" (`Link` com ícone `ArrowUpRight` da Lucide, estilo consistente com os links secundários da tela, ex. o "Nova chave" de `NoCredentialsCta`), apontando para a rota do painel (Step 2).
- [ ] **Step 2: rota do atalho** , inspecionar `src/app/(protected)/agente/monitoramento/router/page.tsx` para a rota/aba exata; usar `Link href="/agente/monitoramento/router"` (ou querystring de aba se aplicável).
- [ ] **Step 3:** typecheck. Confirmar que editar a credencial de embedding aqui reflete no resolver de `embed()` (mesma fonte). 
- [ ] **Step 4: rebuild app + verificação visual.**
- [ ] **Step 5: commit** , `git commit -am "feat(config): bloco Configuracao de Router (construcao da pergunta + embeddings migrados + atalho)"`

### Task P10.2: Retrofit das chaves em Áudio e Anexo para ApiKeySelect

**Files:**
- Modify: `src/components/agent/resources-toggles.tsx` (trocar `CustomSelect` de chave por `ApiKeySelect` em áudio e anexo; remover texto "cadastrada em...")
- `configuracao/page.tsx` , garantir `maskedSuffix` em `credentialsByProvider`.

- [ ] **Step 1:** trocar os dois `CustomSelect` de "Chave de API" (linhas ~322-335 e ~402-415) por `ApiKeySelect` com `provider` e opções com `maskedSuffix`.
- [ ] **Step 2:** typecheck + render.
- [ ] **Step 3: rebuild + visual.**
- [ ] **Step 4: commit** , `git commit -am "refactor(config): ApiKeySelect em audio/anexo (sufixo + nova chave)"`

---

## Fase P11 , Painel do Router exibe reformulação (§5)

### Task P11.1: tabela de requisições mostra original -> reformulada

**Files:**
- Modify: `src/lib/agent/router/queries.ts` (incluir `reformulatedQuestion`, `usedReformulation`, `originalFallback` no select de `getRouterDecisions` + tipo `RouterDecisionRow`)
- Modify: `src/components/agent/router/router-decisions-table.tsx` (badge/coluna "reformulada" + tooltip com a pergunta original->reformulada)
- Test: ajustar tipos.

- [ ] **Step 1:** estender `RouterDecisionRow` e o `select`. 
- [ ] **Step 2:** na tabela, quando `usedReformulation`, mostrar badge "reformulada" e a pergunta reformulada (tooltip/segunda linha com a original).
- [ ] **Step 3:** typecheck + verificação no painel (Fase P12).
- [ ] **Step 4: commit** , `git commit -am "feat(router): painel exibe reformulacao na tabela de requisicoes"`

### Task P11.2: retrocompatibilidade do Backtest (spec §5.1)

**Files:**
- Investigar: componentes/queries do Backtest do router (em `src/components/agent/router/` e `src/lib/agent/router/queries.ts`).

- [ ] **Step 1: investigação dirigida** , localizar onde o Backtest lê decisões/conversas e o que ele computa.
- [ ] **Step 2:** confirmar que os campos novos (nullable) não quebram o Backtest e que ele reflete o **domínio final** (decisão Camada 3 quando houve reformulação). Ajustar select/tipo se necessário.
- [ ] **Step 3:** rodar o Backtest após a migration; conferir sem erro e domínio final correto.
- [ ] **Step 4: commit** (se houve mudança) , `git commit -am "fix(router): backtest retrocompat com campos de reformulacao"`

---

## Fase P12 , Verificação E2E + calibragem contextual (regra de raiz §6.9)

### Task P12.1: rebuild de todos os containers afetados

- [ ] **Step 1:** Run: `docker compose up -d --build app mcp worker` (tocamos `src/lib/agent/**` e schema). Expected: containers reiniciados após o último commit.

### Task P12.2: calibragem contextual (mede ganho sem regressão)

**Files:**
- Modify: `scripts/router/calibrate-rounds.ts` (flag `--contextual`: para perguntas que caem em fallback, aplicar reformulação simulada e re-embedar; comparar fallback antes/depois e Top-K)

- [ ] **Step 1:** implementar variante contextual reusando `reformulateQuestion` (com a credencial de reform) sobre as conversas reais (R20-R23), reconstruindo pares anteriores. Reportar: taxa de fallback antes/depois, Top-K antes/depois.
- [ ] **Step 2:** Run: `npx tsx scripts/router/calibrate-rounds.ts --contextual` , Expected: relatório mostrando **queda de fallback** sem baixar Top-K dos casos hoje acertados.
- [ ] **Step 3: commit** , `git commit -am "feat(router): calibragem contextual (reduz fallback sem regredir Top-K)"`

### Task P12.3: E2E multi-turno contra dado real

- [ ] **Step 1:** com `routerEnabled=true` e `routerReformCheckpoint=PLAYGROUND` (teste), rodar uma conversa de 3 turnos no playground: "produto que mais vendeu nesse mês" -> "e do mês passado?" -> conferir que o 2º turno (que isolado cairia em fallback) é reformulado e roteado para comercial/estoque.
- [ ] **Step 2:** conferir no painel do Router (aba) que aparece original -> reformulada -> domínio final; conferir no menu Consumo que há linha `router_reformulacao` + `router` (re-embedding).
- [ ] **Step 3:** conferir Janela de contexto: mudar nº de mensagens e tipos na UI e validar (via log/inspeção) que o histórico enviado mudou.
- [ ] **Step 4:** documentar evidências em `docs/RADAR.md` se algo ficar pendente; senão registrar no HISTORY.

### Task P12.4: suite completa verde

- [ ] **Step 1:** Run: `npm run typecheck && npm run lint && npx jest --silent 2>&1 | tail -6` , Expected: tudo verde.

---

## Fase P13 , Auditoria final (etapa [10] da metodologia)

### Task P13.1: code review + UI review

- [ ] **Step 1:** `/gsd-code-review` (bugs, segurança, qualidade) sobre os arquivos tocados. Resolver achados.
- [ ] **Step 2:** `/gsd-ui-review` (6 pilares) sobre os blocos novos. Resolver achados.
- [ ] **Step 3:** commit das correções; suite verde.
- [ ] **Step 4:** chamar o humano para validação final (único ponto de parada).

---

## Self-Review do plano (preenchido no review do plano, Fase seguinte)

Cobertura da spec, scan de placeholders e consistência de tipos: ver seção de review (PLAN v2).
