# Personalização adaptativa por usuário , Onda 1 , Plano de Implementação (v3)

> **For agentic workers:** execução **INLINE** nesta sessão (norma do projeto: subagente perde
> contexto , `CLAUDE.md §6`). TDD por task, commit atômico por task. UI **inline** + `ui-ux-pro-max`.
> Steps com checkbox `- [ ]`. SPEC: `docs/superpowers/specs/2026-06-19-agente-personalizacao-por-usuario-design.md`.
> **v3:** endurecido por 2 reviews adversariais do plano + spike contra o dado real (changelog no fim).

**Goal:** Entregar a camada DETERMINÍSTICA da personalização por usuário, rodando em produção
ao vivo: um job no worker destila o perfil (assuntos/domínios preferidos, perguntas recorrentes
NORMALIZADAS para vocabulário fechado, e afinidade de breakdown por família de métrica) e o
runtime injeta isso no prompt + sugestões (welcome + por resposta), cache-safe, auditável, sem
nunca ocultar dado nem mexer em correção/RBAC.

**Architecture:** Worker BullMQ (`JOB_PROFILE_AGGREGATE`, SQL puro, sem `claude`/OpenAI) grava
`user_agent_profiles`; runtime lê (query+Redis), injeta bloco `[Preferências deste usuário]` via
`montarConversa` (item `role:"user"` após o system → cache-safe) e passa um hint ao
`enhanceWithChips` (Pass 2) e ao welcome. Preferências são SÓ de breakdown/visão (apresentação),
nunca filtros; a intenção explícita do turno sempre vence.

**Tech Stack:** Next.js 16/TS, Prisma v7 (`@prisma/adapter-pg`), Postgres, Redis/BullMQ, Jest.

## Global Constraints

- **Idioma pt-BR; PROIBIDO travessão (`—`)** em qualquer texto (UI/código/comentário/commit).
- **Modelo SEMPRE Opus.** UI nunca delegada; sempre inline + `ui-ux-pro-max`.
- **Migration MANUAL (DDL escrito à mão, espelhando `20260619103000_add_fato_estoque_saldo_snapshot`) + `migrate deploy`.** NUNCA `migrate dev`. Validar com `npx prisma validate` (NÃO usar `migrate diff`/`$SHADOW_DB` , não está setado).
- **Onda 1 é 100% determinística (SQL), sem LLM, sem OpenAI runtime.**
- **NUNCA ocultar dado.** `presentationPrefs` = só breakdown/visão (apresentação). PROIBIDO armazenar filtro de recorte de dado (ex.: "só aprovados", empresa específica). A intenção do turno sobrepõe a preferência.
- **Privacidade:** perfil guarda só DERIVADOS. `recurringQuestions.label` = **termo de vocabulário FECHADO** (nome de tema), nunca derivado do texto do usuário → zero verbatim por construção.
- **Cache-safe:** o bloco do perfil entra via `montarConversa` como item `role:"user"`, NUNCA no `systemPromptBase` (preserva `promptCacheKey = sha1(systemPromptBase)`, `run-agent.ts:507`).
- **Rebuild de container após mudança** (`CLAUDE.md §2.1`): worker via `docker compose build app` + recreate.
- **userId** sempre presente no runtime in-app (`runAgent` só de `api/agent/stream` + `playground/stream`).

## Sinais REAIS confirmados no dado (spike 2026-06-19, prod)

- **NÃO existe arg `porEmpresa`/`breakdown`.** O breakdown de faturamento é a ESCOLHA DA TOOL:
  `fiscal_faturamento_periodo` (base) vs `_por_empresa` / `_por_cfop` / `_por_operacao` /
  `_por_cliente` (e `_por_marca`/`_por_uf`/`_por_vendedor`). Famílias análogas:
  `comercial_pedidos_por_{etapa,vendedor}`, `estoque_*`. Há o arg `agruparPor` em `_por_cfop`.
- **Volume in-app baixo** (top tool ~12 chamadas). Logo `MIN_PREF_OCCURRENCES=2` + dominância na
  família (share ≥ 0.6). Prefs serão esparsas no começo , declarado e medido (Task 16).

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `prisma/schema.prisma` (`UserAgentProfile` ~3302) | +7 colunas | Modify |
| `prisma/migrations/20260619HHMMSS_user_agent_profile_personalizacao/migration.sql` | DDL idempotente manual | Create |
| `src/lib/agent/user-profile/types.ts` | tipos do perfil | Create |
| `src/lib/agent/user-profile/scoring.ts` | score freq×recência meia-vida (puro) | Create |
| `src/lib/agent/user-profile/normalizar-pergunta.ts` | classifica pergunta → tema de vocabulário FECHADO (puro, PII-safe) | Create |
| `src/lib/agent/user-profile/build.ts` | `buildProfileFromRows` , transformação pura (incl. afinidade de breakdown) | Create |
| `src/lib/agent/user-profile/candidates.ts` | seletor + piso de histórico (puro) | Create |
| `src/lib/agent/user-profile/store.ts` | get/upsert/reset + cache Redis + invalida welcome | Create |
| `src/lib/agent/user-profile/format.ts` | perfil → bloco de prompt + hint p/ chips (puro) | Create |
| `src/worker/agent-intelligence/profile-aggregate.ts` | SQL roll-up → build → upsert | Create |
| `src/worker/index.ts` (const ~46; handler ~125; **boot `bootstrap()` ~459-465**) | `JOB_PROFILE_AGGREGATE` | Modify |
| `src/lib/agent/prompt/montar-conversa.ts` + `.test.ts` | +arg `perfilUsuarioTexto?` após system | Modify |
| `src/lib/agent/enhance-chips.ts` + `.test.ts` + `__tests__/enhance-chips-usage.test.ts` | +`profileHint?` raiz, repassa p/ buildEnhancePrompt (l.147) | Modify |
| `src/lib/agent/personalized-suggestions/{pick,index}.ts` (+ `pick.test.ts`) + `conversation.ts` | enriquecer + `WELCOME_CACHE_VERSION` | Modify |
| `src/lib/agent/run-agent.ts` (432 load; **843** montarConversa; 992 enhanceWithChips) | carrega + injeta | Modify |
| `src/lib/actions/agent-user-profile.ts` (+ `.test.ts`) | actions read-only + reset (super_admin) | Create |
| `src/app/(protected)/agente/monitoramento/personalizacao/page.tsx` + `MonitoramentoNav` | aba auditoria (inline + ui-ux-pro-max) | Create/Modify |
| `scripts/e2e-user-profile.ts` | E2E contra cache real (incl. comportamento de precedência) | Create |

---

### Task 1: Estender `UserAgentProfile` + migration manual

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260619HHMMSS_user_agent_profile_personalizacao/migration.sql`.
**Interfaces:** Produces colunas `interaction_prompt TEXT`, `presentation_prefs JSONB NOT NULL DEFAULT '{}'`, `recurring_questions JSONB NOT NULL DEFAULT '[]'`, `last_learned_model TEXT`, `quality_baseline JSONB`, `profile_applied_at TIMESTAMP(3)`, `quarantined_at TIMESTAMP(3)`.

- [ ] **Step 1:** Adicionar os 7 campos ao model `UserAgentProfile` (com `@map`), espelhando a §5 da spec.
- [ ] **Step 2:** Criar `migration.sql` com 7× `ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS ...` (DDL à mão, formato da migration do snapshot). NOT NULL só com DEFAULT.
- [ ] **Step 3:** `npx prisma migrate deploy`. Expected: aplicada, sem reset.
- [ ] **Step 4:** `npx prisma generate` + `npx prisma validate`. Expected: client com campos novos, schema válido.
- [ ] **Step 5:** Commit. `git add prisma/ && git commit -m "feat(perfil): estende user_agent_profiles (migration manual idempotente)"`.

---

### Task 2: Tipos do perfil

**Files:** Create `src/lib/agent/user-profile/types.ts`.
**Interfaces:** Produces:
```ts
export interface TopTopic { topic: string; score: number; lastSeenAt: string }
export interface TopKeyword { keyword: string; score: number }
export interface RecurringQuestion { label: string; count: number; lastSeenAt: string } // label = tema de vocabulário FECHADO
export interface PresentationPrefs {
  // SÓ apresentação (qual visão/breakdown). NUNCA filtro de dado.
  [familia: string]: { breakdownPreferido?: string } | undefined; // ex.: { faturamento: { breakdownPreferido: "empresa" } }
}
export interface UserProfileData {
  topTopics: TopTopic[]; topKeywords: TopKeyword[]; preferredDomains: string[];
  recurringQuestions: RecurringQuestion[]; presentationPrefs: PresentationPrefs;
}
```

- [ ] **Step 1:** Criar o arquivo. Sem `any`.
- [ ] **Step 2:** `npx tsc --noEmit`. Expected: 0.
- [ ] **Step 3:** Commit.

---

### Task 3: Scoring com decaimento (puro, TDD)

**Files:** Create `src/lib/agent/user-profile/scoring.ts` + `scoring.test.ts`.
**Interfaces:** `HALF_LIFE_DAYS=30`, `MIN_SCORE=0.15`, `decayedScore(count, lastSeenMs, nowMs): number`, `rankByScore<T extends {score:number}>(items: T[]): T[]`.

- [ ] **Step 1:** Teste: `decayedScore(10,now,now)≈10`; idade 30d → ≈5; item antigo de count baixo cai < MIN_SCORE; `rankByScore` filtra <MIN_SCORE e ordena desc.
- [ ] **Step 2:** `npx jest scoring`. Expected: FAIL.
- [ ] **Step 3:** Implementar (`count * Math.pow(0.5, ageDays/HALF_LIFE_DAYS)`).
- [ ] **Step 4:** `npx jest scoring`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 4: `normalizarPergunta` , classificador de vocabulário FECHADO (puro, TDD, PII-safe)

**Files:** Create `src/lib/agent/user-profile/normalizar-pergunta.ts` + `.test.ts`.
**Interfaces:**
```ts
// Vocabulário FECHADO de temas (derivado dos domínios/tools). label de saída SÓ vem daqui.
export const TEMAS: readonly string[]; // ex.: "faturamento", "estoque", "contas a pagar", "pedidos por etapa", ...
/** classifica o texto do usuário para 1 tema do vocabulário por keyword-match; null se não casar.
 *  O retorno é SEMPRE um elemento de TEMAS (ou null) , nunca trecho do texto original. */
export function normalizarPergunta(texto: string): string | null
```
- **Garantia de privacidade por construção:** a saída é um item de `TEMAS` (dicionário fechado), jamais derivada do texto → impossível vazar CNPJ/valor/nome.

- [ ] **Step 1:** Teste: "qual o faturamento de maio?" → "faturamento"; "quanto tem no estoque do produto X12345?" → "estoque" (e o label NÃO contém "X12345"); texto sem tema conhecido → `null`. **Teste de não-verbatim:** para um conjunto de frases com CNPJ/valor/nome, nenhum trigram da frase aparece no label.
- [ ] **Step 2:** `npx jest normalizar-pergunta`. Expected: FAIL.
- [ ] **Step 3:** Implementar (mapa tema→keywords; match case/acento-insensível; retorna o tema).
- [ ] **Step 4:** `npx jest normalizar-pergunta`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 5: `buildProfileFromRows` , inclui afinidade de breakdown (puro, TDD)

**Files:** Create `src/lib/agent/user-profile/build.ts` + `.test.ts`.
**Interfaces:**
```ts
export const MIN_PREF_OCCURRENCES = 2;
export const MIN_PREF_SHARE = 0.6;
export interface RawTopicRow { topic: string; count: number; lastSeenMs: number }
export interface RawToolCallRow { toolName: string; count: number; lastSeenMs: number } // toolName ex.: "fiscal_faturamento_por_empresa"
export interface RawQuestionRow { label: string; count: number; lastSeenMs: number } // label já normalizado (Task 4)
export function buildProfileFromRows(input: { topics: RawTopicRow[]; toolCalls: RawToolCallRow[]; questions: RawQuestionRow[]; nowMs: number }): UserProfileData
// afinidade de breakdown: parseia toolName no padrao `<dom>_<metrica>_por_<dim>`; agrupa por
// familia=<dom>_<metrica>; se a variante `_por_<dim>` dominante tem count>=MIN_PREF_OCCURRENCES e
// share>=MIN_PREF_SHARE dentro da familia, grava presentationPrefs[<metrica>] = {breakdownPreferido:<dim>}.
// preferredDomains derivado de TOOL_DOMAIN; topTopics/recurring decididos por decayedScore+rankByScore.
```

- [ ] **Step 1:** Teste: toolCalls com 3× `fiscal_faturamento_por_empresa` e 1× `_por_cfop` → `presentationPrefs.faturamento.breakdownPreferido==="empresa"`; sem dominância (2×empresa, 2×cfop) → sem pref; topTopics ranqueados por score decaído; recurringQuestions só labels (Task 4); item antigo cai fora.
- [ ] **Step 2:** `npx jest build -t profile`. Expected: FAIL.
- [ ] **Step 3:** Implementar usando `scoring` + parser de família.
- [ ] **Step 4:** `npx jest build`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 6: Seletor de candidatos + piso (puro, TDD)

**Files:** Create `src/lib/agent/user-profile/candidates.ts` + `.test.ts`.
**Interfaces:** `MIN_CONVERSATIONS=3`, `MIN_MESSAGES=10`, `CandidateStat{userId,conversations,messages,lastMessageMs,profileBuiltMs|null}`, `isEligibleCandidate(s):boolean`, `selectEligible(stats):string[]`.

- [ ] **Step 1:** Teste: 2 conv → inelegível; 3 conv/10 msg sem perfil → elegível; com perfil e sem msg nova → inelegível; com perfil e msg nova → elegível.
- [ ] **Step 2:** `npx jest candidates`. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS. **Step 5:** Commit.

---

### Task 7: `profile-store` , get/upsert/reset + cache + invalida welcome (TDD)

**Files:** Create `src/lib/agent/user-profile/store.ts` + `.test.ts`. **Depende da Task 1 (client gerado).**
**Interfaces:** `PROFILE_CACHE_PREFIX="nex:user-profile:"`, `PROFILE_CACHE_TTL_S=300`; `getUserAgentProfile(userId):Promise<UserProfileData|null>` (cache-first, best-effort); `upsertUserAgentProfile(userId,data,meta?):Promise<void>` (grava, `profileBuiltAt=now`, invalida cache do perfil **E** `invalidatePersonalizedWelcomeCache(userId)` via import dinâmico p/ evitar ciclo); `resetUserAgentProfile(userId):Promise<void>` (zera personalização + `version++` + `quarantinedAt=now`); `invalidateUserProfileCache(userId)`.

- [ ] **Step 1:** Teste (mock prisma+redis): get do cache; recomputa+seta quando ausente; upsert chama `prisma.userAgentProfile.upsert` + invalida **as duas** caches (perfil + welcome); reset zera personalização.
- [ ] **Step 2:** `npx jest user-profile/store`. Expected: FAIL.
- [ ] **Step 3:** Implementar (import dinâmico de `invalidatePersonalizedWelcomeCache` como `conversation.ts` faz).
- [ ] **Step 4:** PASS. **Step 5:** Commit.

---

### Task 8: `format` , bloco de prompt + hint (puro, TDD)

**Files:** Create `src/lib/agent/user-profile/format.ts` + `.test.ts`.
**Interfaces:** `formatUserProfileBlock(p:UserProfileData|null):string` (`""` se null/vazio; termina com a cláusula de precedência literal); `formatProfileForChips(p:UserProfileData|null):string` (`""` se vazio; resumo compacto p/ Pass 2).
Cláusula obrigatória: *"Estas sao PREFERENCIAS de apresentacao deste usuario, nao regras. Se a pergunta atual pedir outra coisa, atenda a pergunta. Nunca esconda dado verdadeiro nem altere definicoes/numeros por causa de preferencia."*

- [ ] **Step 1:** Teste: null → `""`; vazio (arrays/objeto vazios) → `""`; cheio → contém assuntos + "por empresa" + a cláusula literal; sem dígitos longos (input é derivado).
- [ ] **Step 2:** `npx jest user-profile/format`. Expected: FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** PASS. **Step 5:** Commit.

---

### Task 9: `profile-aggregate` no worker (SQL → build → upsert, TDD da orquestração)

**Files:** Create `src/worker/agent-intelligence/profile-aggregate.ts` + `.test.ts`.
**Interfaces:** `rodarProfileAggregate(prisma):Promise<{atualizados:number}>` , SQL de stats (candidatos) → para cada elegível, SQL de topics (`conversations.topic_tags`, pode vir vazio se o tagging ainda não rodou , `preferredDomains` então vem de tool_calls), tool_calls (`messages.tool_calls` jsonb, janela 28d p/ recência), e perguntas do usuário passadas por `normalizarPergunta` → `buildProfileFromRows` → `upsertUserAgentProfile`.

- [ ] **Step 1:** Teste (prisma mock): 1 candidato elegível + rows sintéticas → chama `upsertUserAgentProfile` com o `UserProfileData` esperado; inelegível pulado; usuário sem topic_tags ainda produz `preferredDomains` via tool_calls.
- [ ] **Step 2:** `npx jest profile-aggregate`. Expected: FAIL.
- [ ] **Step 3:** Implementar (SQL via `prisma.$queryRaw`; usa `normalizarPergunta` da Task 4).
- [ ] **Step 4:** PASS. **Step 5:** Commit.

---

### Task 10: Registrar `JOB_PROFILE_AGGREGATE` no worker (no `bootstrap()`)

**Files:** Modify `src/worker/index.ts` (const ~46; handler `maintenanceWorker` ~125-178; **agendar em `bootstrap()` ~459-465**, após o bloco do `JOB_SNAPSHOT_ESTOQUE`).
**Interfaces:** `export const JOB_PROFILE_AGGREGATE="profile-aggregate";` + `PROFILE_AGGREGATE_EVERY_MS=60*60_000`; `maintenanceQueue.upsertJobScheduler(JOB_PROFILE_AGGREGATE,{every:PROFILE_AGGREGATE_EVERY_MS},{name:JOB_PROFILE_AGGREGATE})` no boot; branch no handler chama `rodarProfileAggregate(prisma)`.

- [ ] **Step 1:** Const + import de `rodarProfileAggregate`.
- [ ] **Step 2:** Branch `if (job.name === JOB_PROFILE_AGGREGATE) {...}` no `maintenanceWorker` (try/catch + log `atualizados`, espelhando `JOB_SNAPSHOT_ESTOQUE` ~158-169).
- [ ] **Step 3:** Agendar dentro de `bootstrap()` (junto do snapshot ~459-465). **NÃO** em `aplicarAgendamento` (tem early-return; nunca rodaria).
- [ ] **Step 4:** `npx tsc --noEmit` + `npx jest worker`. Expected: tsc 0, suíte do worker verde.
- [ ] **Step 5:** Commit.

---

### Task 11: Estender `montarConversa` com `perfilUsuarioTexto`

**Files:** Modify `src/lib/agent/prompt/montar-conversa.ts` + **atualizar** `montar-conversa.test.ts` (existe).
**Interfaces:** `MontarConversaArgs.perfilUsuarioTexto?: string`; bloco `role:"user"` com `"[Preferências deste usuário] "+texto`, inserido **logo após o `system`** (antes de `resumoItens`). Só entra se não-vazio.

- [ ] **Step 1:** Teste: com perfil, 2º item = bloco de preferências; sem perfil, ordem antiga; **`item[0]` (systemPromptBase) idêntico nos dois casos** (asserção explícita de igualdade → cache key intacta). Ajustar asserções de ordem existentes no teste.
- [ ] **Step 2:** `npx jest montar-conversa`. Expected: FAIL no caso novo.
- [ ] **Step 3:** Implementar (`perfilItens` entre `system` e `resumoItens`).
- [ ] **Step 4:** PASS. **Step 5:** Commit.

---

### Task 12: Estender `enhanceWithChips` com `profileHint`

**Files:** Modify `src/lib/agent/enhance-chips.ts`; **atualizar** `enhance-chips.test.ts` e `__tests__/enhance-chips-usage.test.ts` (existem).
**Interfaces:** `buildEnhancePrompt({..., profileHint?:string})` adiciona 1 linha de regra quando presente; `enhanceWithChips({..., profileHint?:string})` (campo RAIZ, irmão de `client`/`maxContextual`, **não** dentro de `logCtx`) **repassa `profileHint` na chamada interna a `buildEnhancePrompt` (l.147)**.

- [ ] **Step 1:** Teste: `buildEnhancePrompt({...,profileHint:"faturamento por empresa; estoque"})` contém a linha; sem hint, prompt inalterado; `enhanceWithChips` repassa o hint (verificar via spy/prompt capturado).
- [ ] **Step 2:** `npx jest enhance-chips`. Expected: FAIL no caso novo.
- [ ] **Step 3:** Implementar (raiz + repasse na l.147).
- [ ] **Step 4:** `npx jest enhance-chips`. Expected: PASS (incl. usage test).
- [ ] **Step 5:** Commit.

---

### Task 13: Welcome suggestions com o perfil + `WELCOME_CACHE_VERSION`

**Files:** Modify `src/lib/agent/personalized-suggestions/{pick,index}.ts`; atualizar `pick.test.ts`. **Atenção:** `conversation.ts` chama `invalidatePersonalizedWelcomeCache`.
**Interfaces:** extrair `export const WELCOME_CACHE_VERSION="v4";` usado em **construção (l.24)** e **invalidação (l.83)**; `pickPersonalizedQuestions(allTime,recent,max,allowedDomains?,profileExtras?)` (`profileExtras?:{recurringLabels:string[];preferredDomains:string[]}`); `getPersonalizedWelcomeSuggestions` lê `getUserAgentProfile(userId)` e repassa.

- [ ] **Step 1:** Teste: com `profileExtras.recurringLabels`, 1º chip reflete a recorrente; sem perfil, comportamento atual; cache key usa `WELCOME_CACHE_VERSION`.
- [ ] **Step 2:** `npx jest personalized-suggestions`. Expected: FAIL no caso novo.
- [ ] **Step 3:** Implementar (constante usada nas DUAS linhas 24 e 83 , senão a invalidação por turno quebra).
- [ ] **Step 4:** `npx jest personalized-suggestions welcome-suggestions`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 14a: run-agent , carregar perfil (best-effort, degradação graciosa)

**Files:** Modify `src/lib/agent/run-agent.ts` (~432, junto de `loadAgentSettings()`).
**Interfaces:** `const userProfile = await getUserAgentProfile(args.userId).catch(()=>null);` (idealmente `Promise.all([loadAgentSettings(), getUserAgentProfile(args.userId).catch(()=>null)])`).

- [ ] **Step 1:** Teste de degradação (unit do helper): `formatUserProfileBlock(null)===""`, idem perfil vazio; erro de query → null → `""`. (run-agent em si coberto por E2E.)
- [ ] **Step 2:** `npx jest user-profile/format`. Expected: PASS (já cobre null/vazio).
- [ ] **Step 3:** Implementar a carga best-effort.
- [ ] **Step 4:** `npx tsc --noEmit`. Expected: 0.
- [ ] **Step 5:** Commit.

---

### Task 14b: run-agent , injetar bloco em `montarConversa` (l.843)

**Files:** Modify `src/lib/agent/run-agent.ts:843`.
- [ ] **Step 1:** Passar `perfilUsuarioTexto: formatUserProfileBlock(userProfile)` na chamada de `montarConversa` (l.843).
- [ ] **Step 2:** `npx tsc --noEmit` + `npx jest run-agent montar-conversa`. Expected: verde.
- [ ] **Step 3:** Commit.

---

### Task 14c: run-agent , passar `profileHint` ao `enhanceWithChips` (l.992)

**Files:** Modify `src/lib/agent/run-agent.ts:992`.
- [ ] **Step 1:** Passar `profileHint: formatProfileForChips(userProfile)` como campo raiz na chamada de `enhanceWithChips` (l.992-999).
- [ ] **Step 2:** `npx tsc --noEmit` + suíte agente. Expected: verde (sem regressão).
- [ ] **Step 3:** Commit. `git commit -m "feat(perfil): runtime injeta perfil (prompt + chips + welcome)"`.

---

### Task 15: UI de auditoria (super_admin) , INLINE + ui-ux-pro-max

**Files:** Create `src/lib/actions/agent-user-profile.ts` + `.test.ts`; Create `src/app/(protected)/agente/monitoramento/personalizacao/page.tsx`; Modify `@/components/agent/monitoramento-nav` (nova aba).
**Gate (atenção à camada):** **actions** usam `await requireMinRole("super_admin")` (como `monitoramento-bubble.ts:63`); **page** usa `getCurrentUser()` + `if (user.platformRole!=="super_admin") redirect("/dashboard")` (como `monitoramento/page.tsx:57-59`). A UI renderiza **só campos derivados** (assuntos, breakdownPreferido, recurringQuestions labels, lastBuilt, quarentena). **Nunca** `interactionPrompt` (é Onda 2) e nada de PII.

- [ ] **Step 1:** Teste das actions: não-super_admin → negado; super_admin → retorna shape derivado (sem PII) / reset chama `resetUserAgentProfile`.
- [ ] **Step 2:** `npx jest agent-user-profile`. Expected: FAIL.
- [ ] **Step 3:** Implementar as actions.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** UI **inline** com `ui-ux-pro-max`: lista de usuários com perfil + drill-down read-only + botão Reset (confirmação), seguindo o design system do `/agente` + `<MonitoramentoNav />`. tsc + eslint 0.
- [ ] **Step 6:** Commit.

---

### Task 16: E2E contra cache real + comportamento de precedência + calibração

**Files:** Create `scripts/e2e-user-profile.ts`.

- [ ] **Step 1:** Selecionar candidatos elegíveis reais. **Se 0 candidatos → o E2E FALHA** (não passa vazio); reportar contagem de usuários que cruzam o piso + quantos teriam pref de breakdown (calibração G5). Semear usuário sintético se preciso para exercer o caminho.
- [ ] **Step 2:** Rodar `rodarProfileAggregate(prisma)`; conferir o perfil gravado contra SELECT manual (topTopics/preferredDomains batem; recurringQuestions são labels de `TEMAS`, sem verbatim; afinidade de breakdown bate com a distribuição de tools).
- [ ] **Step 3:** **Não-verbatim com a Mariane (`d08c6323`):** carregar as mensagens reais dela, rodar `normalizarPergunta`, asserir que nenhum trigram da mensagem original aparece nos labels.
- [ ] **Step 4:** Injeção cache-safe: montar turno com `perfilUsuarioTexto` e asserir bloco + cláusula + `item[0]` (system) inalterado.
- [ ] **Step 5:** **COMPORTAMENTO de precedência (LLM real):** usuário com `presentationPrefs.faturamento.breakdownPreferido="empresa"` faz "qual o total consolidado do faturamento?" → asserir que a resposta **não** veio quebrada por empresa (vem o consolidado). Caso simétrico para garantir que a preferência também atua quando a pergunta é genérica.
- [ ] **Step 6:** Suíte: `npx tsc --noEmit` (raiz+mcp) + `npx eslint` + `npx jest`. Expected: verde.
- [ ] **Step 7:** Rebuild (`CLAUDE.md §2.1`): `docker compose build app && docker compose up -d --force-recreate worker app`; validar data da imagem + job agendado.
- [ ] **Step 8:** Commit do E2E.

---

## Self-Review (cobertura + correções dos reviews)

- **Spec §4.1 1-8 → Tasks 2-15** ✔ (circuit-breaker §7 = Onda 2, declarado fora).
- **B1 (precedência por comportamento):** Task 16 Step 5 (LLM real) ✔. **B2 (sem filtro):** prefs só breakdown (Tasks 2/5), `situacao` removida; spec §5/§6.2 corrigida ✔. **B3 (cross-cache):** Task 7 invalida welcome no upsert ✔. **B4 (v3→v4 quebra invalidação):** `WELCOME_CACHE_VERSION` nas 2 linhas (Task 13) ✔.
- **G2 (PII/verbatim):** `normalizarPergunta` vocabulário fechado (Task 4) + teste Mariane (Task 16) ✔. **G4 (args reais):** spike feito → afinidade por tool-family ✔. **G5 (volume):** limiar 2+dominância + contagem na calibração (Task 16) ✔. **G6 (E2E teatro):** Task 16 FALHA se 0 candidatos ✔.
- **Localização:** boot em `bootstrap()` (Task 10) ✔; `montarConversa` l.843 (Task 14b) ✔; `profileHint` raiz + repasse l.147 (Task 12) ✔; `prisma validate`/`migrate deploy` (Task 1) ✔; testes existentes atualizados (Tasks 11/12/13) ✔.
- **C1 (épico):** Task 13(v1) split em 14a/14b/14c ✔. **C2 (dep schema):** Task 7 declara dep Task 1 ✔.
- **Degradação graciosa:** Task 14a + format null/vazio/erro (Task 8/14a) ✔.
- **Placeholder scan / type consistency:** `UserProfileData`/`PresentationPrefs`/`RecurringQuestion` consistentes Tasks 2-15 ✔.
- **Fora de escopo (Onda 2):** `profile-distill`/`interactionPrompt`/circuit-breaker.

## Changelog reviews (v1 → v3)
Rev técnico: BL-1 boot, BL-2 linha 843, BL-3 profileHint raiz+repasse, BL-4 migrate, GAP-1 cache key 2 linhas, GAP-3 testes existentes, GAP-4 topic_tags esparso, GAP-5 UI paths/gate. Rev produto/risco: B1 precedência comportamental, B2 drop filtro (situacao), B3/B4 cross-cache + WELCOME_CACHE_VERSION, G2 vocabulário fechado, G4 spike (args reais), G5 calibração de volume, G6 E2E falha-se-vazio, C1 split run-agent. Spike real: breakdown = escolha de tool `_por_X` (não arg).
