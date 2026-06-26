# SPEC v3 , Personalização adaptativa do Agente Nex por usuário

> **Versão:** v3 (endurecida por 2 reviews adversariais , técnica + produto/risco , em
> 2026-06-19, conforme `CLAUDE.md §6`). Os achados bloqueantes e os gaps materiais foram
> resolvidos; o changelog está no Apêndice B.
>
> **Substitui** o rascunho `...-SPEC-v1-DRAFT.md` (partia de entendimento ERRADO , usuário
> "escolhendo definições/renomeando"). O entendimento correto, dado pelo usuário no
> brainstorm, está no §0.

---

## 0. Entendimento correto (o que a feature É e o que NÃO É)

**É , adaptação.** O Nex aprende, por usuário, **como aquela pessoa gosta de ser atendida** e
passa a entregar sozinho, sem ela repetir:

- **Assuntos/domínios preferidos** (estoque, faturamento, financeiro, vendas, prospecção).
- **Preferências de apresentação** demonstradas no uso: se o usuário sempre quer faturamento
  **por empresa**, o Nex já oferece por empresa; se ele costuma olhar só **pedidos aprovados**,
  já assume isso como padrão; o nível de detalhe que ele costuma pedir.
- **Perguntas recorrentes** (repete quase a mesma quase todo dia) , o Nex antecipa/sugere.
- **Acordos pontuais** alcançados em conversa (caso Mariane: ela pediu, o agente conversou e os
  dois convergiram num recorte) , vira aprendizado **dela**.

Aparece em três lugares: (a) um **incremento de prompt individual** injetado só para aquele
usuário; (b) as **sugestões iniciais** (welcome chips); (c) as **3 sugestões por resposta**
(bolhas roxas), que no caminho quente vêm da Pass 2 (`enhanceWithChips`).

**NÃO é , reconfiguração estrutural (PROIBIDO).** O usuário **nunca** renomeia conceitos, não
escolhe nomes, não redefine métricas/regras, não muda CFOP/regime/definição de "faturamento".
A personalização é **preferência de atendimento**, jamais alteração do ecossistema, do dado ou
das regras de correção.

**Como aprende , offline, em DUAS camadas (esta é a correção mais importante dos reviews):**

> A rotina de juiz/qualidade que já existe é **local-only** (`isLocalRuntime()`, gated por
> `NODE_ENV !== "production"` em `src/instrumentation.ts`; o container não enxerga o CLI
> `claude`) **e opera sobre uma fila GLOBAL de avaliações pendentes, não por usuário**. Logo
> ela **não** serve, sozinha, como motor de aprendizado "ao vivo em produção". A spec separa:

1. **Camada DETERMINÍSTICA (roda em PRODUÇÃO, ao vivo, sozinha):** um **job BullMQ novo no
   worker** (`JOB_PROFILE_AGGREGATE`, agendado por `upsertJobScheduler({every})`, igual ao
   `JOB_SNAPSHOT_ESTOQUE`). SQL puro, **sem `claude`/sem OpenAI**. Roda no container do worker
   em prod, em cadência curta. Deriva e grava: assuntos/domínios preferidos, perguntas
   recorrentes (normalizadas, §6.5), e as preferências de apresentação **detectáveis por SQL**
   (ex.: o usuário sempre passa `breakdown=empresa`/`somente aprovados` nas tool calls). É o
   **"ao vivo" honesto**: grava → vale no próximo turno, sem deploy.
2. **Camada DESTILADA por LLM (host-side, na manutenção):** a nuance que SQL não pega
   (`interactionPrompt` + preferências sutis + acordos tipo Mariane) é destilada **no
   cloud/Claude**, **nunca via OpenAI em runtime**. Roda **host-side** (como a rotina de
   qualidade), disparada por mim (Claude) na manutenção (tipicamente semanal), **escrevendo
   direto no banco de prod** , portanto vale na hora, mas **não roda sozinha no container**.
   A spec é honesta: a Onda 2 depende de execução host-side, não é um cron de prod.

Um **seletor por usuário** (`profileBuildCandidates`: usuários com mensagens novas desde
`profileBuiltAt`) governa as duas camadas , **não** se reusa a fila global do juiz.

**Sem gate de aprovação, COM circuit-breaker (§7).** Não há aprovação de super_admin nem espera
por deploy. Mas, porque escreve em produção sem gate, há **medição + quarentena automática**: se
um perfil ativo piora o sinal de qualidade do usuário, ele é auto-revertido. O super_admin tem
**visão read-only de auditoria** + botão de **reset**.

---

## 1. Problema

O Nex é **igual para todos**. O system prompt (`composeSystemPrompt`, `src/lib/agent/prompt/
compose.ts`) é **global** , nem recebe `userId` (assinatura `(cfg, kbDocs, _unused, biSchema,
source)`). O único traço por usuário são as **welcome chips** (`personalized-suggestions/`), que
olham só **frequência de tools**. Não há memória cross-conversa de **como o usuário gosta de
ver**, de suas **perguntas recorrentes**, nem dos **acordos** que ele fechou (caso Mariane
`d08c6323`: ensinou o recorte de "demanda em aberta", nada ficou retido). E as **3 sugestões por
resposta** não têm viés por usuário.

## 2. Resultado desejado

Cada usuário tem um **perfil de interação** (1:1, tabela `user_agent_profiles`) que: (1) registra
**derivados** (sem frase original , §6.5) de assuntos, preferências de apresentação, perguntas
recorrentes e acordos; (2) é **lido em runtime** barato (1 query + cache Redis) e injetado só
para ele **sem quebrar o cache de prompt** (via `montarConversa`); (3) **dirige sugestões**
(welcome + por resposta); (4) **aprende** pela camada determinística (worker, ao vivo em prod) +
camada destilada (host-side); (5) é **auditável/resetável** e **auto-quarentenável**.

## 3. O que JÁ existe (reaproveitar) , com as correções dos reviews

| Peça | Onde | Papel / correção |
|---|---|---|
| **`UserAgentProfile`** | `prisma/schema.prisma:3302` | **JÁ EXISTE, vazia** (sem `prisma.userAgentProfile.` em `src/`). 1:1 com User. Campos atuais: `topTopics`/`topKeywords` (Json), `preferredDomains` (String[]), `messageCount`, `lastInteractionAt`, `profileBuiltAt`, `version`. Comentário: *"apenas derivados , nenhuma frase original"* (respeitar , §6.5). **Já criada em prod** pela migration `20260525210000`. Estendida em §5. |
| **Worker agent-intelligence** | `src/worker/agent-intelligence/{topic-tagging,resumo-conversa,queue}.ts` + `src/worker/index.ts` (`upsertJobScheduler`) | **Lar do writer determinístico.** Já roda jobs de inteligência por conversa server-side (topic tags por conversa). O `JOB_PROFILE_AGGREGATE` entra aqui, espelhando `JOB_SNAPSHOT_ESTOQUE`. `topic_tags` já derivados alimentam o roll-up por usuário. |
| **`enhanceWithChips` / `buildEnhancePrompt`** | `src/lib/agent/enhance-chips.ts` (chamado em `run-agent.ts:992`) | **CORREÇÃO DO REVIEW:** as 3 bolhas por resposta no caminho quente (`source` bubble/suggestion) vêm da **Pass 2** (`enhanceWithChips`, 2ª chamada LLM), **não** de `[[suggestions]]`. Módulo PURO , para personalizar, estender a assinatura para receber o perfil (já recebe `userId` no `logCtx`). O canal `[[suggestions]]` + `FALLBACK_SUGGESTIONS` (global/fixo) é só o **caminho frio** (fallback do erro da Pass 2); personalizá-lo é secundário. |
| **`personalized-suggestions/`** | `src/lib/agent/personalized-suggestions/{index,aggregate,pick,templates}.ts` | Welcome chips por frequência de tools (`getPersonalizedWelcomeSuggestions(userId, max, allowedDomains?)`, cache Redis 5min, invalidado por turno; retorna `[]` se `userId` falsy). Enriquecer com `recurringQuestions` + `preferredDomains`. |
| **`montarConversa`** | `src/lib/agent/prompt/montar-conversa.ts` | Injeta blocos voláteis fora do system prefix cacheável. **CORREÇÃO:** estender a interface `MontarConversaArgs` com `perfilUsuarioTexto?`, injetado como **bloco próprio logo após o `system`** (espelhando `resumoItens`, slot estável → cacheável por usuário). Não entra no `systemPromptBase` (preserva `promptCacheKey = sha1(systemPromptBase)`, `run-agent.ts:507`). |
| **Rotina de qualidade / juiz** | `src/lib/agent/quality/{judge-scheduler,claude-judge-runner,flywheel}.ts` | **CORREÇÃO:** é **local-only** e por **fila global**, não por usuário. Reusamos só o *padrão* de destilação offline host-side (Claude headless) para a Onda 2 , com um **seletor por usuário próprio**, não a fila do juiz. |
| **`topic-tagging`** | `src/worker/agent-intelligence/topic-tagging.ts` | Já deriva `topic_tags` por conversa (sem verbatim). Fonte derivada para `topTopics`/`preferredDomains` , privacidade preservada. |

## 4. Arquitetura (abordagem C híbrida , estruturado + texto curto)

```
 PRODUÇÃO (worker BullMQ , SQL puro, sem claude/OpenAI) ......... camada DETERMINÍSTICA (ao vivo)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ JOB_PROFILE_AGGREGATE (every N min):                                       │
 │  seletor por usuário (mensagens novas desde profileBuiltAt, com piso §6.6) │
 │   → roll-up de topic_tags/tool_calls: topTopics, preferredDomains,         │
 │     recurringQuestions (normalizadas), presentationPrefs DETECTÁVEIS       │
 │     (breakdown/filter recorrentes nas tool calls) , com DECAIMENTO §6.4    │
 │   → upsertUserAgentProfile (grava no banco de prod, vale no próximo turno) │
 └──────────────────────────────────────────────────────────────────────────┘
 HOST-SIDE (cloud/Claude, na manutenção; NUNCA OpenAI runtime) .. camada DESTILADA (não-prod-auto)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ profile-distill: conversas+avaliações do usuário → interactionPrompt curto │
 │  + presentationPrefs sutis. Parse Zod + guardrails §6 (rejeita renomeação, │
 │  verbos de ocultação, PII/verbatim, excesso de tamanho). Escreve no prod.  │
 └──────────────────────────────────────────────────────────────────────────┘
            │ lido em runtime (1 query + cache Redis, keyed por userId)
            ▼
 RUNTIME (run-agent.ts , in-app; userId sempre presente)
 ├─► montarConversa: bloco "[Preferências deste usuário]" após o system (cache-safe)
 ├─► personalized-suggestions (welcome): topTopics/domains/recurringQuestions
 ├─► enhanceWithChips (Pass 2, por resposta): recebe presentationPrefs/topTopics
 └─► circuit-breaker §7: mede sinal por usuário; piorou → auto-quarentena
```

### 4.1 Unidades (cada uma testável isolada)

1. **`profile-store`** (`src/lib/agent/user-profile/store.ts`) , `getUserAgentProfile(userId)` /
   `upsertUserAgentProfile(...)` + cache Redis (`nex:user-profile:${userId}:v1`, TTL curto,
   invalidado na escrita). Compartilhado entre `src/` (runtime) e `src/worker/` (job).
2. **`profile-aggregate`** (`src/worker/agent-intelligence/profile-aggregate.ts`) , [A]
   determinístico, SQL puro: roll-up por usuário de `topic_tags`/`tool_calls`/`conversations`
   → `topTopics`/`keywords`/`preferredDomains`/`recurringQuestions` (normalizadas) +
   `presentationPrefs` detectáveis. Aplica **decaimento** (§6.4). Puro/testável.
3. **`JOB_PROFILE_AGGREGATE`** (registro em `src/worker/index.ts` + handler) , agenda e executa
   o `profile-aggregate` sobre os candidatos. Espelha `JOB_SNAPSHOT_ESTOQUE`.
4. **`profile-distill`** (`src/lib/agent/user-profile/distill.ts` + `distill-prompt.ts`) , [B]
   host-side: monta input (conversas+avaliações), parseia saída estruturada com **Zod +
   guardrails §6** (incl. filtro PII/verbatim e verbos de ocultação). Roda offline.
5. **`profile-format`** (`src/lib/agent/user-profile/format.ts`) , perfil → bloco
   `[Preferências deste usuário] ...` (puro/testável), e helpers que entregam
   `presentationPrefs`/`topTopics` ao `enhanceWithChips` e ao welcome.
6. **Integração de runtime** (`run-agent.ts` + `montar-conversa.ts`) , carrega perfil
   (query+cache), passa bloco a `montarConversa` (nova arg `perfilUsuarioTexto?`), passa prefs ao
   `enhanceWithChips` (nova arg) e ao welcome.
7. **Circuit-breaker** (`src/lib/agent/user-profile/guard.ts`) , baseline + comparação de sinal
   por usuário + auto-quarentena (§7).
8. **UI de auditoria** (super_admin, read-only + reset) , **inline, `ui-ux-pro-max`**, espelhando
   o padrão de auditoria existente em `/agente`.

## 5. Modelo de dados (estende a tabela existente; migration MANUAL)

Acrescentar à `UserAgentProfile` (aditivo; a tabela **já existe em prod**):

```prisma
/// Incremento destilado (texto curto ≤ ~900 chars), injetado só p/ este usuário. DERIVADO,
/// SEM frase original (parse filtra PII/verbatim/verbos de ocultação , §6).
interactionPrompt   String?  @map("interaction_prompt")
/// Preferências de APRESENTAÇÃO (qual visão/breakdown o usuário prefere), DEFAULTS, nunca
/// filtros de recorte de dado. Onda 1 detecta SÓ afinidade de breakdown por família de
/// métrica (qual variante `_por_X` o usuário gravita). Ex.:
/// {"faturamento":{"breakdownPreferido":"empresa"},"pedidos":{"breakdownPreferido":"etapa"}}.
/// PROIBIDO armazenar filtro de dado (ex.: "só aprovados", empresa específica) , isso oculta
/// dado e é vetado pela §6.2; o que o usuário filtra num turno não vira preferência.
presentationPrefs   Json     @default("{}") @map("presentation_prefs")
/// [{label, count, lastSeenAt}] , perguntas recorrentes NORMALIZADAS (rótulo derivado, nunca
/// a frase verbatim , §6.5).
recurringQuestions  Json     @default("[]") @map("recurring_questions")
/// Modelo/rotina da última destilação (auditoria). Ex.: "claude-profile-v1".
lastLearnedModel    String?  @map("last_learned_model")
/// Circuit-breaker: sinal de qualidade base ANTES do perfil ativo + estado de quarentena.
qualityBaseline     Json?    @map("quality_baseline")  // {acertoRate, negFeedbackRate, amostra, em}
profileAppliedAt    DateTime? @map("profile_applied_at")
quarantinedAt       DateTime? @map("quarantined_at")
```

Migration **manual** (regra do projeto: nunca `migrate dev`; há drift). SQL idempotente:

```sql
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "interaction_prompt" TEXT;
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "presentation_prefs" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "recurring_questions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "last_learned_model" TEXT;
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "quality_baseline" JSONB;
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "profile_applied_at" TIMESTAMP(3);
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "quarantined_at" TIMESTAMP(3);
```

Colunas novas herdam o GRANT de tabela (a migration original já concedeu a `nexus_mcp`); validar
que o role de runtime lê a tabela. Aplicar via `migrate deploy`.

## 6. Guardrails (a feature aprende sem gate , trava ESTRUTURAL, não só prompt)

1. **Precedência estrutural:** `presentationPrefs` são **defaults de visão**, nunca filtros
   mandatórios. **A intenção explícita do turno SEMPRE sobrepõe a preferência salva** (ex.:
   usuário que costuma ver faturamento por empresa pergunta "total consolidado?" → vem
   consolidado). Regras globais de segurança/correção (RBAC, honestidade, real×bruto, datas)
   vencem o perfil sempre. **Teste de COMPORTAMENTO obrigatório** (não só asserção de texto): um
   turno real onde a pergunta contraria a preferência de breakdown deve vir no recorte da
   pergunta, não no da preferência (§12).
2. **`interactionPrompt` é texto de PREFERÊNCIA, não de comportamento sobre o dado.** O parse
   **rejeita** o item se contiver verbos de ocultação/recorte mandatório ("ignore", "não
   mostre", "esconda", "oculte", "filtre", "só considere", "remova") ou instrução de
   renomear/redefinir conceito/métrica/regra/CFOP/regime. Só passa preferência de
   recorte-de-apresentação, assunto e formato.
3. **Tamanho:** `interactionPrompt` ≤ ~900 chars (truncado/rejeitado). Custo controlado (entra no
   prompt principal **e** na Pass 2 quando guia o `enhanceWithChips` , contabilizado no §8).
4. **Confiança + decaimento:** preferência de apresentação só entra com **repetição** (≥ N
   ocorrências; N calibrado na execução, default 3). `topTopics`/`recurringQuestions` pontuados
   por **frequência × recência com meia-vida** (default 30 dias); abaixo de um piso de score
   saem do perfil , evita preferência velha "grudar".
5. **Privacidade (resolve a contradição apontada):** o perfil guarda **só derivados**.
   `recurringQuestions` armazena **rótulo normalizado** (template/cluster do tema), **nunca a
   frase verbatim**. O `interactionPrompt` passa por **filtro de PII/verbatim no parse**:
   rejeita sequências longas de dígitos (CNPJ/CPF/valores), nomes próprios fora de um allowlist
   de termos de negócio, e trechos com alta similaridade (n-gram) a mensagens originais. Teste
   obrigatório com a conversa real da Mariane provando ausência de literais.
6. **Piso de histórico (usuário novo):** calibrado contra o dado real (prod 2026-06-19: uso
   in-app nascente, o usuário mais ativo tem 2 conversas / 28 mensagens). Contagem de conversas
   é um gate ruim de engajamento; o sinal está nas mensagens. Piso vigente: **≥ 1 conversa E
   ≥ 12 mensagens** (3 usuários reais passam a ter perfil hoje); sobe conforme o uso cresce.
   Perfil vazio ⇒ **comportamento global atual** (degrada com elegância, declarado).
7. **Identidade:** runtime atual é **in-app** (`runAgent` só chamado de `api/agent/stream` e
   `playground/stream`) , `userId` da sessão sempre presente, sem resolução de telefone. WhatsApp
   inbound é F5; regra forward-looking: **número não-resolvido ou ambíguo ⇒ sem perfil (global)**,
   nunca um perfil-chute. Perfil é keyed por `userId`; jamais vaza entre usuários.

## 7. Critério de sucesso + circuit-breaker (porque é "sem gate")

- **Métrica por usuário:** taxa de `acerto` do juiz (status CORRETO / total avaliado) e taxa de
  **feedback negativo** (`MessageFeedback` errado/alucinou) , medidas por janela.
- **Baseline:** ao ativar um perfil, grava `qualityBaseline` (sinal dos últimos K turnos SEM
  perfil) e `profileAppliedAt`.
- **Quarentena automática:** após M turnos com o perfil ativo, comparar sinal com×sem perfil; se
  **piorar além de um limiar**, **auto-reset** (`interactionPrompt=NULL`, `presentationPrefs={}`)
  + `quarantinedAt` + `version` bump, **sem esperar o super_admin**. Registrar no audit.
- **Curadoria humana:** o super_admin vê o read-only e pode resetar; eu (Claude) monitoro na
  manutenção. "Sem gate" = "com circuit-breaker", não "sem rede".

## 8. Custo de token

- Bloco do perfil **curto** (≤ ~900 chars), só no turno daquele usuário (não no global). Vai via
  `montarConversa` (item volátil, bloco próprio após o system) , **não** no system base, logo
  **não quebra** o `promptCacheKey`; cada usuário cacheia o próprio prefixo.
- **Pass 2 (`enhanceWithChips`):** quando o perfil guia as bolhas, ele entra também na 2ª chamada
  , contabilizado e limitado (passamos só `presentationPrefs`/`topTopics` resumidos, não o texto
  inteiro).
- Destilação por LLM roda **offline** (host-side) , custo zero em runtime de prod.

## 9. Sugestões personalizadas (detalhe corrigido)

- **Welcome (iniciais):** `personalized-suggestions` mistura frequência de tools (atual) +
  `recurringQuestions` (antecipa a pergunta diária) + `preferredDomains` (viés de assunto).
- **Por resposta (caminho quente):** via **`enhanceWithChips`** , estender `buildEnhancePrompt`
  e a assinatura de `enhanceWithChips({...})` para receber `presentationPrefs`/`topTopics` e
  orientar os drill-downs no que o usuário usa. Travas anti-vazamento de `[[suggestions]]` e
  anti-repetição permanecem.
- **Fallback frio:** o `FALLBACK_SUGGESTIONS` (hoje global/fixo) passa a derivar do perfil quando
  houver , melhoria secundária (só dispara quando a Pass 2 falha).

## 10. Caso canônico (Mariane `d08c6323`)

O perfil dela passa a registrar a **preferência/acordo** ("o recorte X de demanda em aberta";
"gosta de ver por empresa"). **Fronteira honesta:** *responder* o cálculo de "demanda em aberta"
ainda depende da tool `comercial_demanda_em_aberta` (frente 1, standby aguardando a Mariane).
Esta feature **não** constrói essa tool , retém a preferência e melhora assunto/formato/
recorrência/sugestões mesmo sem ela. As frentes se encontram quando a tool existir.

## 11. Não-objetivos (YAGNI / fronteiras)

- Não permitir renomear/redefinir conceitos ou mexer em estrutura/dado/regra.
- Não aprender via API OpenAI em runtime (só offline: worker determinístico + host-side LLM).
- Não ter gate de aprovação (super_admin audita/reseta; circuit-breaker faz a defesa automática).
- Não entrar em "estilo/personalidade" aberto nesta onda (infra suporta; onda 3).
- Não mexer no cálculo/correção do dado nem nas regras de honestidade.
- Não depender da frente comercial para entregar valor.

## 12. Verificação (regra de raiz: E2E contra dado real)

- **TDD** nas unidades puras: `profile-aggregate` (roll-up + decaimento corretos), `distill`
  (parse Zod **rejeita** renomeação/verbos de ocultação/PII/excesso de tamanho), `format`
  (bloco correto), mistura de sugestões, **precedência turno×preferência** (pergunta contraria a
  preferência salva ⇒ dado completo), circuit-breaker (piora ⇒ quarentena).
- **tsc raiz+mcp + eslint + jest** verdes (suíte ~3147).
- **E2E contra o cache real:** `userId` real com histórico → roda `profile-aggregate` (worker) →
  confere perfil gravado vs conversas → confere bloco injetado no turno seguinte → confere
  sugestões refletindo o perfil → **confere que correção/honestidade/RBAC seguem intactos**
  (perfil não degrada número nem esconde dado). Filtro PII testado com a conversa da Mariane.
  Rebuild de `app`/`mcp`/`worker` conforme `CLAUDE.md §2.1` antes de validar.
- **Rollback:** reset do perfil + `version` bump; `interactionPrompt=NULL` desliga a injeção;
  desagendar `JOB_PROFILE_AGGREGATE` se preciso.

## 13. Plano de ondas (rebalanceado pelos reviews , Onda 1 entrega valor perceptível)

- **Onda 1 (roda em PRODUÇÃO, ao vivo):** schema estendido + `profile-store` + `profile-aggregate`
  determinístico no worker (`JOB_PROFILE_AGGREGATE`) com **decaimento** + **afinidade de breakdown
  por família de métrica** (sinal REAL confirmado no dado: o usuário gravita uma variante `_por_X`,
  ex.: usa `fiscal_faturamento_por_empresa` em vez de `_periodo`; NÃO há arg `porEmpresa` , o
  breakdown é a escolha da tool + o arg `agruparPor` quando existe) + injeção em runtime
  (`montarConversa` + `enhanceWithChips` + welcome) + UI de auditoria/reset. **Entrega
  personalização perceptível** (assuntos + afinidade de breakdown + recorrência + sugestões), não
  só welcome chips reembalados. **Nota de volume:** a base de uso in-app ainda é pequena, então
  preferências são esparsas no começo; o valor imediato vem de assuntos/recorrência/sugestões, e a
  afinidade de breakdown cresce com o uso (limiar calibrado e medido na verificação, §12).
- **Onda 2 (host-side):** `profile-distill` (LLM, cloud/Claude) + `interactionPrompt` +
  `presentationPrefs` sutis + acordos (Mariane) + **circuit-breaker** completo + seletor por
  usuário para destilação. Sobre a base já validada da Onda 1.
- **Onda 3 (futuro, fora desta spec):** estilo/verbosidade aberto; herança por papel/segmento.

---

## Apêndice A , decisões do brainstorm (travadas)

1. Escopo: adaptação (assuntos + apresentação + recorrência + acordos), **não** definições
   escolhidas pelo usuário. 2. Aprendizado ao vivo (determinístico no worker) + host-side (LLM),
   **sem deploy** para a escrita, **sem gate**. 3. Curadoria = Claude + circuit-breaker; super_admin
   audita/reseta. 4. Abordagem **C híbrida**. 5. Personalizar welcome **E** por resposta. 6. Offline
   sempre cloud/Claude; **nunca** OpenAI runtime. 7. Proibido renomear/mexer estrutura/dado/regra.

## Apêndice B , changelog dos reviews adversariais (v1 → v3)

- **B1 (ambos):** "ao vivo" era falso , a rotina de juiz é local-only e por fila global.
  **Resolvido:** camada determinística vira **job BullMQ no worker** (roda em prod, ao vivo);
  camada LLM declarada host-side honesta; **seletor por usuário próprio**, não a fila do juiz.
- **B3/rev1 (mecânica das bolhas):** as 3 por resposta vêm de `enhanceWithChips` (Pass 2), não de
  `[[suggestions]]`. **Resolvido:** §3/§9 corrigidos; injeção via `buildEnhancePrompt`/assinatura.
- **B2/rev2 (precedência só por prompt):** **Resolvido:** `presentationPrefs` viram defaults
  estruturais; intenção do turno sempre sobrepõe; parse rejeita verbos de ocultação (§6.1/6.2).
- **B3/rev2 (sem métrica/circuit-breaker):** **Resolvido:** §7 (métrica + baseline + quarentena
  automática).
- **G privacidade:** `recurringQuestions` normalizadas + filtro PII/verbatim no parse (§6.5).
- **G migration:** SQL exato idempotente (§5). **G montarConversa:** slot + extensão de interface
  (§3/§4.1). **G enhanceWithChips puro:** recebe perfil por parâmetro (§4.1/§9). **G decaimento:**
  meia-vida (§6.4). **G usuário novo:** piso de histórico (§6.6). **G identidade:** in-app userId
  sempre presente; WhatsApp F5, não-resolvido ⇒ sem perfil (§6.7). **G ondas:** Onda 1
  rebalanceada para entregar valor perceptível (§13).
