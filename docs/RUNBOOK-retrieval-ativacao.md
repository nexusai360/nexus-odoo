# Runbook , Ativacao do retrieval de tools (routerToolRetrieval shadow -> active)

> F6 (Custo/Latencia). Promover o retrieval de tools de `shadow` para `active` corta o
> catalogo enviado ao LLM (so nucleo + top-K cross-dominio), reduzindo tokens de input
> (estimativa: ~-26% de custo por consulta, spec secao 3). E o maior ganho de custo da F6.

## Como funciona (verificado no codigo)

- Flag em `AgentSettings(id="global")`: `routerToolRetrieval` (`shadow` | `active`) +
  `routerEnabled` (bool). Defaults de producao: `routerEnabled=false`, `routerToolRetrieval=shadow`.
- Em `shadow`: o retrieval CALCULA top-K e loga em `AgentRouterDecision`, mas
  `filter-catalog.ts` NAO corta , o catalogo inteiro vai ao LLM.
- Em `active` (+ `routerEnabled=true`): `filter-catalog.ts:91` corta para nucleo/floor + top-K.
- Sao gates independentes: `routerEnabled` = filtro por dominio/RBAC (camadas A-B);
  `routerToolRetrieval` = corte por tool (camada C).

## Pre-condicoes , GATE TRIPLO (obrigatorio antes de promover em prod)

- [ ] **Gate A , recall@K >= 98%** (offline, deterministico, gratis):
      `E2E=1 npx tsx --env-file=.env.local src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`
      Evidencia 2026-06-08: **recall@K=100% (30/30) em K=5..8**. PROVA RIGOROSA de que o
      corte preserva a tool certa (ela esta sempre no top-K oferecido).
- [ ] **Gate B , golden F5 padrao VERDE** (numero-verdade, retrieval-independente):
      `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts`
      Evidencia 2026-06-08: **GOLDEN_VERDE** (numero 4/4, alucinacao 0/9, desamb 3/3).
- [ ] **Gate C , golden sob retrieval active** (ponta-a-ponta via runAgent):
      `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-under-active.e2e.ts`
      Verifica, com o catalogo de fato cortado (via `routerOverride`, sem mutar o banco),
      que a tool esperada e chamada e o numero ouro aparece.
      **ATENCAO (limitacao de ambiente):** este harness chama `runAgent`, que cria sessao
      MCP (streamable-HTTP) em `MCP_URL`. **De dentro desta worktree, via `tsx` no host, a
      sessao MCP autenticada falha (`other side closed`); o agente roda sem tools e o gate
      sai `INCONCLUSIVO` (exit 2), nao reprovado.** Rodar Gate C **no ambiente full-stack**
      onde a sessao MCP funciona (o proprio app/container, onde `MCP_URL` resolve a sessao).
      Gates A + B ja cobrem o criterio de promocao (selecao preservada + numeros corretos);
      Gate C e a confirmacao end-to-end.
- [ ] **Custo: medianaUsd(active) < medianaUsd(shadow)** (gate de regressao de custo):
      `E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts`
      (rodar uma vez por cenario; chaves de cenario distintas geram baselines distintas).
      O scorecard traz `faithful` (false = MCP nao carregou, custo subestimado, NAO usar como
      baseline) , medir no full-stack. Conta de referencia: ~2c/consulta hoje -> ~0,96c com
      caching + retrieval active.

## Promocao (config de banco, SEM migration)

A flag vive em `AgentSettings(id="global")`. Promover via UI de Integracoes/Router
(super_admin) OU script pontual, em JANELA EXCLUSIVA (sem outras sessoes/app concorrendo no
DB compartilhado):

```sql
UPDATE agent_settings SET router_enabled = true, router_tool_retrieval = 'active' WHERE id = 'global';
```

NAO alterar o default do schema (evita migration). Aplicar so apos o gate triplo verde.

## Rollback

```sql
UPDATE agent_settings SET router_tool_retrieval = 'shadow' WHERE id = 'global';
```

Reversivel em segundos; o catalogo volta a ir inteiro ao LLM.

## Coordenacao multi-branch

Banco e infra compartilhados entre worktrees. **Alinhar a ordem de merge com a worktree
`feat/router-ativacao-r2`** (UI do drill-down do Router) antes de promover em prod. A promocao
da flag e o merge para `main` sao decisao do usuario (afetam producao).
