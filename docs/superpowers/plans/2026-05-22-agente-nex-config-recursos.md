# Agente Nex: Configuração + Recursos + Modo Raciocínio + Catálogo — Plano

> **For agentic workers:** executar com `superpowers:executing-plans`, inline na
> sessão principal (Opus). Steps usam checkbox. Toda task `[UI]` consulta
> `ui-ux-pro-max` antes de implementar.
> Spec: `docs/superpowers/specs/2026-05-22-agente-nex-config-recursos-design.md`.

**Goal:** Mover a seção Recursos para a tela de Configuração, dar respiro
Chave↔Consumo, criar o card de Modo Raciocínio (3 status + nível + custo) e
tornar o catálogo de modelos atualizável (base no código + overrides no banco +
botão + scripts).

**Architecture:** Catálogo híbrido com cache em memória síncrono (base de
`catalog.ts` + tabela `LlmModelEntry` no banco, merge por id). Modo raciocínio
como `reasoningCheckpoint`+`reasoningEffort` em `AgentSettings`, card novo em
`ResourcesToggles`, wiring `reasoning_effort` no provider OpenAI. Reorganização
de telas movendo `<ResourcesToggles>` entre pages.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind v4, Prisma v7, Jest,
Zod, OpenAI provider.

**Ordem e coordenação:** as fases 1, 2 (parcial), 3 são **exclusivas** — fazer
já. As tasks marcadas `[COMPARTILHADO]` tocam `resources-toggles.tsx`,
`agent-config.ts`, `prisma/schema.prisma` ou `providers/openai.ts` — antes de
cada uma, checar `docs/agents/active/` e `git log` e só prosseguir se o
`claude-agente-nex-melhorias` tiver terminado nesses arquivos; senão, aguardar.

---

## FASE 1 — Catálogo: capacidade de raciocínio

### Task 1: Pesquisa de suporte a raciocínio

**Files:** Create: `docs/superpowers/research/2026-05-22-modelos-raciocinio.md`

- [ ] Pesquisar (WebSearch) a documentação oficial de OpenAI, Anthropic, Google
  Gemini sobre quais modelos suportam modo raciocínio (thinking / reasoning) e
  com quais níveis. Cobrir todos os modelos listados em `catalog.ts`.
- [ ] Escrever o doc de research: tabela `modelId → suporta? → níveis → fonte →
  data`. Critério: OpenAI série GPT-5.x e o-* aceitam `reasoning_effort`
  (`minimal|low|medium|high`); o-* são reasoning-only; modelos GPT-4.x e
  anteriores não. Anthropic 4.x e Gemini 2.5 têm thinking (registrar, mas o
  wiring fica para extensão futura — §5.4 da spec).
- [ ] Commit: `docs(agente-nex): pesquisa de suporte a raciocinio dos modelos`.

### Task 2: Tipo `ReasoningLevel` e campo `reasoning` no catálogo

**Files:** Modify: `src/lib/agent/llm/catalog.ts`; Test: `src/lib/agent/llm/catalog.test.ts` (criar se não existir)

- [ ] Adicionar o tipo e o campo ao `ModelEntry`:
  ```ts
  export type ReasoningLevel = "minimal" | "low" | "medium" | "high";
  // em ModelEntry:
  /** Suporte a modo raciocínio. Ausente = não suporta. levels do menor ao maior. */
  reasoning?: { levels: ReasoningLevel[] };
  ```
- [ ] Preencher `reasoning` em cada `ModelEntry` conforme o doc da Task 1.
- [ ] Adicionar helper `modelSupportsReasoning(id: string): boolean` e
  `reasoningLevelsOf(id: string): ReasoningLevel[]`.
- [ ] Teste: modelo sabidamente de raciocínio retorna `levels` não vazio;
  modelo antigo retorna `[]`/`false`.
- [ ] `npx jest src/lib/agent/llm/catalog.test.ts` PASS; commit
  `feat(agente-nex): catalogo declara suporte a raciocinio por modelo`.

---

## FASE 2 — Catálogo híbrido (base + banco)

### Task 3 [COMPARTILHADO]: Migration `LlmModelEntry`

**Files:** Modify: `prisma/schema.prisma`; Migration nova.

> Checar coordenação antes (ver cabeçalho). Esperar `claude-f4-leitura-expansao`
> e `claude-agente-nex-melhorias` se houver migration em curso.

- [ ] Adicionar model `LlmModelEntry` espelhando `ModelEntry` completo: `id`
  (PK, o id do modelo), `provider`, `label`, `tier`, `pricingInput Float?`,
  `pricingOutput Float?`, `pricingPerMinute Float?`, `use String?`,
  `audio Boolean`, `vision Boolean`, `reasoningLevels Json?`, `released String?`,
  `notes String?`, `source String` (`"sync"` | `"manual"`), `updatedAt`.
- [ ] `npx prisma migrate dev --name llm_model_entry`; `npx prisma generate`.
- [ ] `npx tsc --noEmit` limpo; commit + linha em `HISTORY.md` (migration).

### Task 4: Camada de catálogo efetivo (merge + cache síncrono)

**Files:** Create: `src/lib/agent/llm/effective-catalog.ts`; Test: idem `.test.ts`

- [ ] `effective-catalog.ts`: cache em memória do array `ModelEntry[]` efetivo.
  `ensureCatalogLoaded()` async lê `LlmModelEntry` do banco e faz merge com
  `MODELS` (override por id). `getEffectiveModels()` síncrono devolve o cache,
  ou a base de `catalog.ts` se o cache ainda não carregou. `invalidateCatalog()`
  marca para recarregar. TTL curto (5 min).
- [ ] `catalog.ts`: `getModel`/`listModels`/`calculateCost`/`listAudioModels`/
  `listVisionModels` passam a ler de `getEffectiveModels()` em vez de `MODELS`
  direto. Mantêm assinatura síncrona.
- [ ] Teste: banco vazio → efetivo === base; com 1 override → o do banco vence.
- [ ] `npx jest` PASS; commit `feat(agente-nex): catalogo efetivo com merge base+banco`.

### Task 5: Camada de sincronização (`sync-catalog.ts`)

**Files:** Create: `src/lib/agent/llm/sync-catalog.ts`; Test: idem

- [ ] `syncProvider(provider, apiKey)`: consulta a API de listagem do provedor
  (OpenAI `GET /v1/models`, Anthropic `GET /v1/models`, Gemini `models.list`,
  OpenRouter `GET /api/v1/models` — este traz pricing), compara com o catálogo
  efetivo, retorna `{ novos: ModelEntry[], atualizados: ModelEntry[] }`. Para
  modelos novos sem pricing conhecido (OpenAI/Anthropic/Gemini): `pricing: null`,
  `tier` derivado heuristicamente, `source: "sync"`.
- [ ] `applySync(result)`: upsert em `LlmModelEntry` + `invalidateCatalog()`.
- [ ] Teste com fixture de resposta de API mockada.
- [ ] commit `feat(agente-nex): camada de sincronizacao de catalogo`.

### Task 6: Scripts CLI de sincronização

**Files:** Create: `scripts/sync-models.ts`

- [ ] `scripts/sync-models.ts`: lê `--provider <p>` (ou todos), chama
  `syncProvider` + `applySync`, imprime o diff. Modo `--promote` reescreve o
  bloco do provedor em `catalog.ts` com os overrides estáveis (consolidação).
- [ ] Verificar com `tsx scripts/sync-models.ts --provider openrouter` (dry-run
  primeiro com `--dry`).
- [ ] commit `chore(scripts): sincronizacao de catalogo de modelos por provedor`.

### Task 7: Server Action do botão atualizar

**Files:** Create: `src/lib/actions/sync-models.ts`

- [ ] Server Action `syncProviderModels(provider)`: gate super_admin, rate
  limit curto, chama `syncProvider`/`applySync`, retorna resumo (`{novos, erro}`).
  Degrada com mensagem clara se a chave do provedor falta.
- [ ] `npx tsc --noEmit` limpo; commit `feat(agente-nex): action de sincronizacao de modelos`.

---

## FASE 3 — Reorganização de telas

### Task 8 [UI]: Mover a seção Recursos para Configuração

**Files:** Modify: `src/app/(protected)/agente/prompt/page.tsx`,
`src/app/(protected)/agente/configuracao/page.tsx`

> `[UI]` Consultar `ui-ux-pro-max`: a tela de Configuração passa a ter 2 cards;
> avaliar se mantém `PageShell variant="narrow"` ou passa a `wide` (a seção
> Recursos tem grids de 3 colunas).

- [ ] `prompt/page.tsx`: remover o card "Recursos" (`<ResourcesToggles>`), o
  import, o bloco `initialResources` e a carga de `listCredentials`/
  `credentialsByProvider`. Mantém `getAgentSettings` e `listKbDocumentsAction`.
  Subtítulo do `PageHeader` deixa de citar "recursos".
- [ ] `configuracao/page.tsx`: carregar `credentials`+`credentialsByProvider`,
  `getAgentSettings`, montar `initialResources`; renderizar abaixo do
  `<LlmConfigForm>` um segundo `<Card>` "Recursos" com `<ResourcesToggles>`.
  Subtítulo do `PageHeader` passa a citar recursos.
- [ ] `npx tsc --noEmit` limpo; verificação manual das 2 telas.
- [ ] commit `feat(agente-nex): secao Recursos migra de Prompt para Configuracao`.

### Task 9 [UI]: Respiro Chave de API ↔ Consumo

**Files:** Modify: `src/components/agent/llm-config-form.tsx`

> `[UI]` Consultar `ui-ux-pro-max` para o degrau de espaçamento.

- [ ] Ler `llm-config-form.tsx`, localizar o bloco "Consumo desta chave" logo
  após o select "Chave de API". Aumentar o espaçamento vertical em um degrau
  sutil (ex.: `mt-2`→`mt-4` ou via `space-y`). Sem separador novo.
- [ ] Verificação manual; commit `fix(agente-nex): respiro entre Chave de API e Consumo`.

### Task 10 [UI]: Botão "atualizar" no cabeçalho Modelo

**Files:** Modify: `src/components/agent/llm-config-form.tsx`

> `[UI]` Consultar `ui-ux-pro-max` para o botão (ícone de refresh, discreto, ao
> lado do label "Modelo").

- [ ] Ler o trecho do label "Modelo" no `llm-config-form.tsx`. Adicionar um
  botão de atualizar (ícone `RefreshCw`) ao lado, que chama a action
  `syncProviderModels(provider)` (Task 7) em `useTransition`, com estado
  `loading` e toast do resumo. Após sucesso, `router.refresh()`.
- [ ] `npx tsc --noEmit` limpo; verificação manual; commit
  `feat(agente-nex): botao de atualizar modelos no cabecalho Modelo`.

---

## FASE 4 — Modo raciocínio

### Task 11 [COMPARTILHADO]: Schema `reasoningCheckpoint` + `reasoningEffort`

**Files:** Modify: `prisma/schema.prisma`; Migration nova.

> Coordenar (cabeçalho). Se `claude-agente-nex-melhorias` já adicionou
> `reasoningEffort`, adicionar só `reasoningCheckpoint`.

- [ ] Em `AgentSettings`: `reasoningCheckpoint FeatureCheckpoint @default(OFF)
  @map("reasoning_checkpoint")` e (se ainda não existir) `reasoningEffort
  String? @map("reasoning_effort")`.
- [ ] `npx prisma migrate dev --name agent_reasoning`; `npx prisma generate`.
- [ ] `npx tsc --noEmit`; commit + linha em `HISTORY.md`.

### Task 12 [COMPARTILHADO]: Action `updateAgentResources` aceita raciocínio

**Files:** Modify: `src/lib/actions/agent-config.ts`, `agent-config-types.ts`

- [ ] Estender `UpdateResourcesSchema` (Zod) e `UpdateAgentResourcesInput` com
  `reasoningCheckpoint` (enum de checkpoint) e `reasoningEffort` (`string|null`).
- [ ] `updateAgentResources` persiste os 2 campos. `getAgentSettings` /
  `AgentSettingsData` expõem os 2.
- [ ] `npx jest src/lib/actions` PASS; commit `feat(agente-nex): action persiste estado de raciocinio`.

### Task 13 [UI]: Componente `reasoning-card.tsx`

**Files:** Create: `src/components/agent/reasoning-card.tsx`

> `[UI]` Consultar `ui-ux-pro-max`: card no mesmo padrão do `ResourceCard`
> (`resources-toggles.tsx`) — ícone de cérebro, título "Modo raciocínio",
> `FeatureCheckpoint` à direita; quando suporta e status `!= OFF`, área
> expandida com o seletor de nível (`CustomSelect`) e o custo (`$/1M` de saída
> do modelo + `TierBadge`).

- [ ] Criar `ReasoningCard` recebendo props: `checkpoint`, `effort`,
  `activeModelId`, `onCheckpointChange`, `onEffortChange`, `loading`. Usa
  `modelSupportsReasoning`/`reasoningLevelsOf` (Task 2). Quando o modelo não
  suporta: `FeatureCheckpoint` `disabled` travado em `OFF` + nota. Quando
  suporta e `!= OFF`: seletor de nível + custo de saída do modelo ativo.
- [ ] `npx tsc --noEmit` limpo; commit `feat(agente-nex): componente ReasoningCard`.

### Task 14 [COMPARTILHADO][UI]: Inserir o card no `ResourcesToggles`

**Files:** Modify: `src/components/agent/resources-toggles.tsx`

- [ ] Adicionar à interface `ResourcesTogglesProps.initial` os campos
  `reasoningCheckpoint` e `reasoningEffort`, e a prop `activeModelId: string`.
  Estado `reasoningCp`/`reasoningEffort`. Renderizar `<ReasoningCard>` **antes**
  do card de Entrada de áudio. `persistResources` passa a enviar os 2 campos
  novos.
- [ ] `configuracao/page.tsx` (Task 8) passa `activeModelId` (do `LlmConfig`
  ativo) e os 2 campos de `settings` ao `<ResourcesToggles>`.
- [ ] `npx tsc --noEmit` limpo; verificação manual; commit
  `feat(agente-nex): card de Modo Raciocinio na secao Recursos`.

### Task 15 [COMPARTILHADO]: Wiring `reasoning_effort` no provider OpenAI

**Files:** Modify: `src/lib/agent/llm/providers/openai.ts`, `src/lib/agent/run-agent.ts`

- [ ] Ler `openai.ts` e `run-agent.ts`. `run-agent` carrega `reasoningCheckpoint`/
  `reasoningEffort` de `loadAgentSettings`; quando o checkpoint libera o
  ambiente corrente e o modelo suporta, passa o nível efetivo (§5.1 da spec —
  com fallback) ao provider. `openai.ts` inclui `reasoning_effort` no request
  quando recebido.
- [ ] Teste no provider: request inclui `reasoning_effort` quando o modelo é de
  raciocínio e o nível é passado.
- [ ] `npx jest src/lib/agent` PASS; commit `feat(agente-nex): aplica reasoning_effort na requisicao`.

---

## FASE 5 — Verificação

### Task 16: Verificação automatizada

- [ ] `npx tsc --noEmit`, `npx eslint src/`, `npx jest`, `npx next build` —
  todos verdes.

### Task 17: Verificação contra dado real (CLAUDE.md §9)

- [ ] Subir o app; conferir: Recursos na tela de Configuração; respiro
  Chave↔Consumo; card de raciocínio travado (modelo sem suporte) e liberado
  (modelo com suporte) com seletor de nível e custo; botão atualizar no
  cabeçalho Modelo funcionando; catálogo com banco vazio cai na base.
- [ ] Exercer uma requisição com raciocínio ligado e conferir o comportamento.

### Task 18: Code review + UI review

- [ ] `/gsd-code-review` nos arquivos alterados; `/gsd-ui-review` nas telas.
- [ ] Corrigir achados materiais.

### Task 19: Encerramento

- [ ] `STATUS.md` (coordenar) + `HISTORY.md` + deletar
  `docs/agents/active/claude-agente-nex-config-recursos.md`.

---

## Auto-revisão (dupla, conforme metodologia)

### Revisão #1 — cobertura e lacunas

- Cobertura da spec: Frente 1 → T8, T9; Frente 2 → T1, T2, T11-T15; Frente 3 →
  T3-T7, T10. Todas as seções da spec têm task.
- Lacuna corrigida: a Task 8 precisa do `activeModelId` para o card de
  raciocínio — a `configuracao/page.tsx` já carrega o `LlmConfig` ativo
  (`getPublicActiveLlmConfig`), então o id está disponível; registrado na T14.
- Lacuna corrigida: a ordem T13 (componente) antes de T14 (inserção) garante
  que o `ReasoningCard` existe quando o `ResourcesToggles` o importa.

### Revisão #2 — granularidade, integração, riscos

- Risco de integração T4: tornar `getModel`/`calculateCost` dependentes do
  cache não pode quebrar `usage-logger.ts` nem o `mcp/`. A T4 mantém a
  assinatura síncrona e o fallback para a base; mapear os imports de `catalog.ts`
  no início da T4 e confirmar que nenhum quebra.
- Granularidade: T5 (sync) e T15 (wiring) são as maiores; cada uma tem teste
  próprio que as fecha. T8 mexe em 2 pages mas é uma unidade coesa (a mudança
  só faz sentido completa).
- Coordenação: T3, T11, T12, T14, T15 são `[COMPARTILHADO]` — antes de cada
  uma, conferir `docs/agents/active/` e `git log -3` dos arquivos; aguardar o
  `claude-agente-nex-melhorias` se necessário. As fases 1, 3 e a maior parte da
  2 não dependem dele e são feitas já.
- Ordem final de execução: Fase 1 → Fase 3 → Fase 2 (T3 compartilhada por
  último na fase) → Fase 4 (compartilhadas, conforme coordenação) → Fase 5.
