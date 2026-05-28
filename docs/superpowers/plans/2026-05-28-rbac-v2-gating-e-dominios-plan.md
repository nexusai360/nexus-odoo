# PLAN v3: RBAC v2 — Gating de telas e domínios do Agente Nex

> Plano de execução em microtarefas para a SPEC v3 (`docs/superpowers/specs/2026-05-28-rbac-v2-gating-e-dominios-design.md`).
> Versão definitiva, pós duas reviews adversariais.

- **Versão:** v3 (PLAN v1 → Review #1 → PLAN v2 → Review #2 → PLAN v3).
- **Branch base:** `feat/router-catalogo-r1`. Após R1 mergear, rebase para `main`.
- **Branch alvo:** `feat/rbac-v2-gating-e-dominios`.

---

## Convenções

- `arquivo`, `o que fazer`, `done quando`. Tarefas de infra omitem `arquivo`.
- Rebuild de container (`CLAUDE.md §2.1`): rebuild `app` ao fim de cada onda que toca `src/**`; rebuild `app+mcp+worker` na Onda C (mexe em `prisma/**`).
- Testes: `npm test -- <glob>` por task; `npm test` ao fim da onda; `npm run typecheck` ao fim de cada onda.
- Padrão de mock de prisma nos testes integração: `jest.mock("@/lib/prisma", () => ({ prisma: { ...mockedMethods } }))`. Seguir o padrão dos testes existentes em `src/lib/agent/__tests__/` (vide `mcp-client.test.ts`).
- Padrão de mock do Router: `jest.mock("@/lib/agent/router/pick-domains", () => ({ pickDomains: jest.fn() }))` no topo do arquivo de teste.
- Commits atômicos. Mensagens pt-br, sem travessão.
- Cada onda termina com linha no `docs/agents/HISTORY.md` no formato `YYYY-MM-DD HH:MM | agent=claude-rbac-v2 | commits=<hashes> | scope=<f1+f2+...> | summary=<resumo curto>`.

---

## Onda A — Helpers de gate

### A1. Criar `src/lib/auth/require.ts` com `requireAuth` e `requireMinRole`
- **arquivo:** `src/lib/auth/require.ts` (novo)
- **o que fazer:** implementar `requireAuth(): Promise<AuthUser>` e `requireMinRole(min: PlatformRole, redirectTo?: string): Promise<AuthUser>`. Usa `getCurrentUser` de `@/lib/auth`, `PLATFORM_ROLE_HIERARCHY` de `@/lib/constants/roles`, `redirect` de `next/navigation`. Falha em `requireMinRole` → `redirect("${redirectTo ?? '/dashboard'}?denied=${min}")`.
- **done quando:** compila; tipo de retorno correto.

### A2. Adicionar `requireVisibleDomainsOrRedirect`
- **arquivo:** `src/lib/auth/require.ts`
- **o que fazer:** `requireVisibleDomainsOrRedirect(redirectTo?: string): Promise<{ user: AuthUser; domains: ReportDomainId[] }>`. Usa `getMyDomains`. Redireciona `?error=no_domains` quando vazio.
- **done quando:** compila.

### A3. Adicionar `requireAgentAccessOrJson`
- **arquivo:** `src/lib/auth/require.ts`
- **o que fazer:** versão para API routes. Sem auth → `NextResponse.json({ error: "Unauthorized" }, { status: 401 })`. Sem domínio → `NextResponse.json({ error: "AgentNotEnabled" }, { status: 403 })`. Sucesso → `{ user: AuthUser; allowedDomains: Set<string> | "all" }`. Short-circuit `seesAll`: admin/super_admin recebem `"all"` sem query.
- **done quando:** compila; assinatura de retorno: `Promise<NextResponse | { user: AuthUser; allowedDomains: Set<string> | "all" }>`.

### A4. Testes unitários dos helpers
- **arquivo:** `src/lib/auth/require.test.ts` (novo)
- **o que fazer:** cobre `requireAuth` (sem auth → redirect login), `requireMinRole` (hierarquia OK/fail + `?denied=`), `requireVisibleDomainsOrRedirect` (`?error=no_domains`), `requireAgentAccessOrJson` (401 / 403 / "all" / Set). Mocks: `jest.mock("@/lib/auth")`, `jest.mock("next/navigation")`, `jest.mock("@/lib/actions/domain-access")`.
- **done quando:** `npm test -- require.test` verde com 10+ cases.

### A5. Commit + rebuild app
- **o que fazer:** commit "feat(auth): helpers requireMinRole/requireVisibleDomains/requireAgentAccessOrJson + testes". `docker compose build app && docker compose up -d app`.
- **done quando:** commit + container reiniciado.

---

## Onda B — Gating server-side de telas e API routes

### B1. Refatorar `/agente/layout.tsx`
- **arquivo:** `src/app/(protected)/agente/layout.tsx`
- **o que fazer:** trocar `getCurrentUser` + `redirect` manual por `await requireMinRole("super_admin")`. Mantém `<>{children}</>`.
- **done quando:** behavior idêntico; admin acessando `/agente` em hard nav recebe `?denied=super_admin` no `/dashboard`.

### B2. Refatorar `/integracoes/layout.tsx`
- **arquivo:** `src/app/(protected)/integracoes/layout.tsx`
- **o que fazer:** mesma refator de B1.
- **done quando:** super_admin passa; admin redireciona com banner.

### B3. Criar gate em `/usuarios`
- **arquivo:** `src/app/(protected)/usuarios/layout.tsx` (novo)
- **o que fazer:** `await requireMinRole("admin")`. Render `<>{children}</>`.
- **done quando:** super_admin+admin passam; manager+viewer redirecionam.

### B4. Criar gate em `/configuracao`
- **arquivo:** `src/app/(protected)/configuracao/layout.tsx` (novo)
- **o que fazer:** `await requireMinRole("super_admin")`. Render filho.
- **done quando:** apenas super_admin passa.

### B5. Criar gate em `/relatorios`
- **arquivo:** `src/app/(protected)/relatorios/layout.tsx` (novo)
- **o que fazer:** `await requireVisibleDomainsOrRedirect()`. Render filho.
- **done quando:** manager/viewer sem domínio redirecionam; super_admin/admin passam.

### B6. Gate `requireAgentAccessOrJson` em `/api/agent/stream`
- **arquivo:** `src/app/api/agent/stream/route.ts`
- **o que fazer:** substituir a chamada existente de `getCurrentUser` pelo `requireAgentAccessOrJson`. Se retornar `NextResponse` (401/403), `return` direto. Caso contrário, extrair `user` (e ignorar `allowedDomains` por enquanto — Onda D pega). Manter check `PLAYGROUND_ROLES` para `isPlayground=true` (admin/super_admin) INTACTO. NÃO passar `allowedDomains` adiante para `runAgent` ainda (vem na Onda D).
- **done quando:** usuário sem domínio recebe 403 JSON `{ error: "AgentNotEnabled" }`; `isPlayground=true` para viewer/manager continua devolvendo 403 (PLAYGROUND_ROLES); fluxo normal de admin/super_admin sem mudança.

### B6b. Teste de regressão `/api/agent/stream`
- **arquivo:** `src/app/api/agent/stream/route.test.ts` (existe; estender)
- **o que fazer:** novo case: viewer sem domínio → 403 `AgentNotEnabled`. Novo case: viewer com domínio + `isPlayground=true` → 403 `Forbidden` (PLAYGROUND_ROLES). Asserir que caminho atual de admin/super_admin não-playground segue funcionando.
- **done quando:** 2+ casos novos verdes; baseline anterior preservada.

### B7. Gate em `/api/agent/suggest-continuation`
- **arquivo:** `src/app/api/agent/suggest-continuation/route.ts`
- **o que fazer:** mesma adição de B6, sem PLAYGROUND check (endpoint não diferencia).
- **done quando:** 403 sem domínio; sucesso com.

### B8. Gate em `/api/agent/transcribe`
- **arquivo:** `src/app/api/agent/transcribe/route.ts`
- **o que fazer:** mesma adição.
- **done quando:** idem.

### B9a. Componente cliente `access-denied-banner.tsx`
- **arquivo:** `src/components/dashboard/access-denied-banner.tsx` (novo, `"use client"`)
- **o que fazer:** props `{ kind: "denied" | "no_domains"; role?: string }`. `useState(visible=true)`. Render `<div role="alert">` com texto SPEC §5.3 + botão X (`aria-label="Fechar"`) que seta `visible=false`. Visual: Tailwind alert amarelo (sem dependência nova).
- **done quando:** componente renderiza com 2 props; dismiss funciona; sem warning de hidratação.

### B9b. Integrar banner em `/dashboard/page.tsx`
- **arquivo:** `src/app/(protected)/dashboard/page.tsx`
- **o que fazer:** server page lê `searchParams.denied` / `searchParams.error`. Se algum bater, renderiza `<AccessDeniedBanner kind="..." role="..." />` no topo. Sem alterar lógica existente da página.
- **done quando:** `/dashboard?denied=admin` → banner; `/dashboard?denied=super_admin` → banner; `/dashboard?error=no_domains` → banner; sem param → nada.

### B10. Teste do banner
- **arquivo:** `src/components/dashboard/access-denied-banner.test.tsx` (novo)
- **o que fazer:** RTL: render com cada combinação de props; asserir texto + role="alert" + botão fechar muda visibility.
- **done quando:** 3+ testes verdes.

### B11. Atualizar `HISTORY.md`
- **arquivo:** `docs/agents/HISTORY.md`
- **o que fazer:** uma linha consolidando a Onda B no formato canônico.

### B12. Commit + rebuild app
- **o que fazer:** commit "feat(rbac): gating server-side em telas admin + API routes do agente + banner /dashboard". Rebuild `app`.

---

## Onda C — Migration e realinhamento dos domínios

### C1. Grep prévio
- **o que fazer:** rodar `grep -rEn "['\"]rh['\"]|['\"]producao['\"]" src/ mcp/ prisma/ --include="*.ts" --include="*.tsx" --include="*.sql"` > `/tmp/rbac-v2-grep.txt`. Mover para `docs/migrations/2026-05-28-rbac-v2-grep.txt`. Adicionar tabela "tratamento" no topo (REMOVER / REFATORAR / MANTÉM-histórico).
- **done quando:** arquivo committed com classificação por linha.

### C2. Refatorar hits classificados
- **arquivo:** vários conforme C1
- **o que fazer:** aplicar refator. Diferenciar:
  - Testes que cobrem REMOÇÃO de domínio (`canRemove('rh')`): podem permanecer com constante de teste `DOMINIOS_REMOVIDOS_LEGADO = ["rh", "producao"]`. Servem para testar idempotência.
  - Testes que cobrem ADIÇÃO de `rh`/`producao` como acesso válido: substituir pelo domínio válido (`estoque`) para preservar a intenção da regra testada.
  - Migrations antigas em `prisma/migrations/*`: NÃO tocar.
  - Hardcodes em código de produção (componentes, actions): remover.
- **done quando:** `npm run typecheck` verde ANTES de C3.

### C3. Editar `prisma/schema.prisma`
- **arquivo:** `prisma/schema.prisma`
- **o que fazer:** (1) remover valores `rh` e `producao` do enum `ReportDomain`; (2) adicionar valor `agent_permission_denied` no enum `AuditAction`; (3) adicionar `outcome String? @db.Text` em `model AgentRouterDecision` (sem `@map` — nome já é snake-safe).
- **done quando:** `npx prisma format` sem erro; visual diff confere as 3 mudanças.

### C4. Criar migration manual
- **arquivo:** `prisma/migrations/<timestamp>_rbac_v2_alinhar_dominios_e_audit_router/migration.sql` (novo)
- **o que fazer:** rodar `npx prisma migrate dev --create-only --name rbac_v2_alinhar_dominios_e_audit_router`. Substituir o SQL gerado pelo da SPEC §8.2 LITERAL: `BEGIN` + `ALTER TABLE agent_router_decision ADD COLUMN IF NOT EXISTS outcome TEXT NULL` + `ALTER TYPE AuditAction ADD VALUE IF NOT EXISTS agent_permission_denied` + bloco DELETE+CTE+INSERT audit + bloco ALTER TYPE ReportDomain (RENAME old → CREATE new → ALTER COLUMN USING text → DROP old) + `COMMIT`.
- **done quando:** SQL bate com SPEC §8.2; arquivo existe e contém os 4 passos.

### C5. Aplicar migration em dev
- **o que fazer:** `npx prisma migrate status` (confirmar zero drift). Rodar `npx prisma migrate deploy`. Em seguida `npx prisma generate`.
- **done quando:** migration em `_prisma_migrations`; `prisma generate` sem erro; `src/generated/prisma/client.ts` tem `outcome` em `AgentRouterDecision`; enum `ReportDomain` reflete os 7 valores.

### C6. Atualizar `REPORT_DOMAINS`
- **arquivo:** `src/lib/reports/domains.ts`
- **o que fazer:** remover entradas `rh` e `producao`. Ordem alfabética por id. **Exportar `seesAll`** (decisão D4 precisa).
- **done quando:** typecheck verde; `REPORT_DOMAINS.length === 7`; `import { seesAll } from '@/lib/reports/domains'` funciona.

### C7. Teste de coerência REPORT_DOMAINS ⊂ Router DOMAINS
- **arquivo:** `src/lib/reports/domains.test.ts` (novo; criar se ainda não existir)
- **o que fazer:** importar `REPORT_DOMAINS` de `@/lib/reports/domains` e `DOMAINS` de `@/lib/agent/router/domain-vocabulary`. Teste: `REPORT_DOMAINS.every(d => DOMAINS.some(x => x.domain === d.id))`. Mensagem clara em caso de falha.
- **done quando:** teste verde.

### C8. Script pré-flight (somente prod)
- **arquivo:** `scripts/2026-05-28-pre-flight-rbac-v2.sh` (novo, executável)
- **o que fazer:** header `#!/usr/bin/env bash` + comentário em pt-br "Rodar EM PRODUÇÃO antes do deploy. NÃO usar em dev." + `psql "$DATABASE_URL" -c "SELECT user_id, domain, granted_by_id FROM user_domain_access WHERE domain IN ('rh','producao');" | tee docs/migrations/2026-05-28-rbac-v2-snapshot.txt`. `chmod +x`.
- **done quando:** script existe + executável; conteúdo bate.

### C9. Migration down (rollback manual via psql)
- **arquivo:** `prisma/migrations/<timestamp>_rbac_v2_alinhar_dominios_e_audit_router/down.sql` (novo)
- **o que fazer:** SQL da SPEC §8.2 "Down". Comentário no topo: "Aplicar manualmente via `psql $DATABASE_URL -f down.sql`. Prisma não roda down auto."
- **done quando:** arquivo presente.

### C10. Atualizar `HISTORY.md`
- **arquivo:** `docs/agents/HISTORY.md`
- **o que fazer:** linha formato canônico, `scope=feat+infra+migration`.

### C11. Commit + rebuild todos
- **o que fazer:** commit "feat(rbac): migration drop rh/producao + outcome em router_decision + AuditAction.agent_permission_denied". `docker compose build app mcp worker && docker compose up -d app mcp worker`.
- **done quando:** 3 containers reiniciados; `/api/health` OK.

---

## Onda D — `filterCatalog` com `userAllowedDomains` + reorganização do run-agent

### D1. Estender tipos do `filter-catalog`
- **arquivo:** `src/lib/agent/router/types.ts`
- **o que fazer:** `FilterCatalogInput` ganha `userAllowedDomains?: Set<string> | "all"`. `FilterCatalogOutput.diagnostic` ganha `permissionFilteredOut: number`.
- **done quando:** tsc verde após D2.

### D2. Implementar camada B em `filter-catalog.ts`
- **arquivo:** `src/lib/agent/router/filter-catalog.ts`
- **o que fazer:** aplicar camada B (SPEC §6.1) APÓS camada A. Tools de `EXCLUDE_FROM_FILTERING` e `UNKNOWN_DOMAIN` passam sempre na camada B. Caso `userAllowedDomains === "all"` ou `undefined`: sem corte (backwards-compat). Contar tools cortadas em `permissionFilteredOut`.
- **done quando:** função compila; comportamento legacy preservado (callers que não passam `userAllowedDomains` recebem comportamento atual idêntico).

### D3. Testes unitários da camada B
- **arquivo:** `src/lib/agent/router/filter-catalog.test.ts`
- **o que fazer:** 5 novos casos: (a) `userAllowedDomains="all"` → idêntico; (b) Set com 1 domínio + router ativo → interseção; (c) Set vazio + router ativo → só `EXCLUDE_FROM_FILTERING`/`UNKNOWN_DOMAIN`; (d) `routerEnabled=false` + Set não vazio → camada B sozinha corta; (e) router fallback + Set não vazio → camada A passa todas, camada B corta.
- **done quando:** 5+ testes verdes.

### D4. Computar `userAllowedDomains` em `run-agent.ts`
- **arquivo:** `src/lib/agent/run-agent.ts`
- **o que fazer:** novo helper local `computeAllowedDomains(user: AuthUser): Promise<Set<string> | "all">`: se `seesAll(user.platformRole)` → retorna `"all"` (sem query); senão → `new Set(await getUserDomains(user.id))`. Chamar logo no início do `runAgent`, ANTES de qualquer chamada ao Router. Importar `getUserDomains` de `@/lib/actions/domain-access` e `seesAll` de `@/lib/reports/domains`.
- **done quando:** `userAllowedDomains` disponível no escopo do método principal.

### D5. Reorganizar ordem: `createDecision` ANTES de `filterCatalog`
- **arquivo:** `src/lib/agent/run-agent.ts`
- **o que fazer:** REORDENAR o trecho atual (~linhas 395-410). Sequência nova: (1) `pickDomains`; (2) `createDecision` (com `catalogSizeOffered: null` por enquanto, `catalogSizeFull: allToolsBeforeRouter.length`); (3) capturar `routerDecisionId`; (4) [Onda E3 plugará fast-path aqui]; (5) `filterCatalog` (passando `userAllowedDomains`); (6) `updateDecision({ decisionId, catalogSizeOffered: filteredCatalog.tools.length })` para corrigir.
- **done quando:** ordem física do código está nessa sequência; tsc verde; teste baseline do router R1 segue verde.

### D6. Estender `log-decision.ts` para `outcome`
- **arquivo:** `src/lib/agent/router/log-decision.ts`
- **o que fazer:** após Onda C, schema tem `outcome`. Atualizar `updateDecision` para receber `outcome?: "ok" | "permission_denied" | "failed"` opcional + `catalogSizeOffered?: number` opcional. Gravar via `prisma.agentRouterDecision.update`.
- **done quando:** tsc verde; teste unit do log-decision atualizado com 2 casos novos.

### D7. Gravar `outcome="ok"` no caminho feliz
- **arquivo:** `src/lib/agent/run-agent.ts`
- **o que fazer:** no fim do `runAgent` bem-sucedido (depois do LLM responder e persistir assistant message), chamar `updateDecision({ decisionId: routerDecisionId, outcome: "ok" })`.
- **done quando:** teste integração mock captura update.

### D8. Teste integração shadow ainda gateia
- **arquivo:** `src/lib/agent/__tests__/run-agent-shadow-still-gates.test.ts` (novo)
- **o que fazer:** mockar `pickDomains` no topo (`jest.mock("@/lib/agent/router/pick-domains", ...)`) retornando `pickedDomains=["financeiro"]`, `fallback.triggered=false`. `agentSettings.routerEnabled=false` (shadow). Viewer com `{estoque}`. Mock `getUserDomains` retornando `["estoque"]`. Asserir: tools no array entregue ao `buildLlmClient` (capturado via spy) NÃO contêm nenhuma com prefixo `financeiro_`.
- **done quando:** teste verde.

### D9. Commit + rebuild app
- **o que fazer:** commit "feat(rbac): filterCatalog camada B + userAllowedDomains + reorganiza ordem do router + outcome".

---

## Onda E — Fast-path de recusa e defesa em profundidade no run-agent

### E1. Criar `permission-denial.ts`
- **arquivo:** `src/lib/agent/permission-denial.ts` (novo)
- **o que fazer:** exportar:
  - `sanitize(text: string, maxLen = 200): string` — trunca + `.replace(/\b\d{11}\b/g, "[doc]")` + `.replace(/\b\d{14}\b/g, "[doc]")`. NÃO mascara formatados (decisão MVP).
  - `formatDomainList(ids: string[]): string` — via `REPORT_DOMAINS` id→label. `[]` → `""`; `["a"]` → `"A"`; `["a","b"]` → `"A e B"`; `["a","b","c"]` → `"A, B e C"`.
  - `respondPermissionDenied({ conversationId, user, deniedDomains, availableDomains, routerDecisionId, userQuestion })` — persiste assistant msg com template + `audit_logs` (com `sanitize(userQuestion)`) + `updateDecision({ outcome: "permission_denied" })`. Retorna `ChatResult` com `usage: { input: 0, output: 0, costKnown: true, costUsd: 0 }`.
- **done quando:** módulo importável; sem `buildLlmClient` no path.

### E2. Testes unitários de `permission-denial`
- **arquivo:** `src/lib/agent/permission-denial.test.ts` (novo)
- **o que fazer:** 7 casos: (a) template `available=[]` mostra mensagem "fale com admin"; (b) `available=["estoque"]` mostra "Estoque"; (c) `available=["estoque","financeiro"]` mostra "Estoque e Financeiro"; (d) `available 3+` mostra "X, Y e Z"; (e) `sanitize("CPF 12345678901 aqui")` → `"CPF [doc] aqui"`; (f) `sanitize("CNPJ 12345678901234 aqui")` → `"CNPJ [doc] aqui"`; (g) `sanitize("CPF 123.456.789-01")` PRESERVA o CPF formatado (decisão MVP); (h) `respondPermissionDenied` faz 3 calls de prisma (message.create, audit_logs.create, agentRouterDecision.update) e ZERO calls de `buildLlmClient` (spy).
- **done quando:** 8+ testes verdes.

### E3. Plugar fast-path em `run-agent.ts`
- **arquivo:** `src/lib/agent/run-agent.ts`
- **o que fazer:** com a reorganização da D5, o lugar correto é entre `createDecision` (já tem `routerDecisionId`) e `filterCatalog`. Inserir bloco da SPEC §6.2:
  ```text
  if (userAllowedDomains !== "all"
      && !routerDecision.fallback.triggered
      && routerDecision.pickedDomains.length > 0) {
    const nonTransversal = routerDecision.pickedDomains
      .filter(d => !EXCLUDE_FROM_FILTERING.has(d));
    const intersected = nonTransversal.filter(d => userAllowedDomains.has(d));
    if (intersected.length === 0 && nonTransversal.length > 0) {
      return await respondPermissionDenied({
        conversationId: args.conversationId,
        user, deniedDomains: nonTransversal,
        availableDomains: [...userAllowedDomains],
        routerDecisionId,
        userQuestion: args.userMessage,
      });
    }
  }
  ```
  Importar `EXCLUDE_FROM_FILTERING` (criar ou exportar de `domain-vocabulary.ts` se ainda não exposto).
- **done quando:** fast-path dispara no caso correto; teste integração E5 verde.

### E4. Defesa §6.3 antes de `session.callTool`
- **arquivo:** `src/lib/agent/run-agent.ts`
- **o que fazer:** dentro do loop `for (const toolCall of message.toolCalls)`, antes de cada `session.callTool`:
  ```text
  const domain = getToolDomain(toolCall.name);
  const isTransversal = EXCLUDE_FROM_FILTERING.has(domain) || domain === UNKNOWN_DOMAIN;
  const allowed = userAllowedDomains === "all" || isTransversal || userAllowedDomains.has(domain);
  if (!allowed) {
    toolResults.push({
      toolCallId: toolCall.id,
      content: `Acesso ao domínio "${domain}" não está liberado para o seu usuário.`,
    });
    continue;
  }
  ```
  `userAllowedDomains` está no escopo via Onda D4.
- **done quando:** teste integração E6 verde.

### E5. Teste integração fast-path
- **arquivo:** `src/lib/agent/__tests__/run-agent-permission-denied.test.ts` (novo)
- **o que fazer:** mock `pickDomains` retornando `pickedDomains=["financeiro"]`, `fallback.triggered=false`. Mock `getUserDomains` retornando `["estoque"]`. Mock prisma com spies em `message.create`, `audit_logs.create`, `agentRouterDecision.update`. Spy em `buildLlmClient`. Chamar `runAgent`. Asserir: `buildLlmClient` chamado 0 vezes; `message.create` chamado para user + assistant (assistant content contém "Vi que sua pergunta toca em Financeiro"); `audit_logs.create` chamado com `action: "agent_permission_denied"`; `agentRouterDecision.update` chamado com `outcome: "permission_denied"`.
- **done quando:** teste verde.

### E6. Teste integração alucinação de tool
- **arquivo:** `src/lib/agent/__tests__/run-agent-hallucinated-tool.test.ts` (novo)
- **o que fazer:** viewer com `{estoque}`. Mock `pickDomains` retornando `pickedDomains=["estoque"]` (passa fast-path). Mock LLM retornando primeira iteração com `toolCalls: [{ name: "financeiro_saldo_bancario", id: "tc1" }]`, segunda iteração com `content: "..."` (texto qualquer). Spy em `session.callTool`. Asserir: `session.callTool("financeiro_saldo_bancario", ...)` NÃO chamado; histórico passado pra segunda iteração tem `tool_result` com `content` contendo `"não está liberado"`.
- **done quando:** teste verde.

### E7. Teste integração permissão concedida
- **arquivo:** `src/lib/agent/__tests__/run-agent-permission-allowed.test.ts` (novo)
- **o que fazer:** viewer com `{financeiro}`. `pickDomains` retorna `["financeiro"]`. LLM chamado normalmente; tools de financeiro presentes no catálogo passado.
- **done quando:** teste verde.

### E8. Atualizar `(protected)/layout.tsx` com short-circuit
- **arquivo:** `src/app/(protected)/layout.tsx`
- **o que fazer:** modificar `canUseAgent`:
  ```text
  const canUseAgent = seesAll(user.platformRole)
    ? true
    : (await getUserDomains(user.id)).length > 0;
  ```
  Importar `seesAll` e `getUserDomains`.
- **done quando:** super_admin/admin sem query extra; manager-com-domínio: bolha aparece; viewer-sem: bolha some.

### E9. Atualizar `HISTORY.md`
- **arquivo:** `docs/agents/HISTORY.md`
- **o que fazer:** linha formato canônico, `scope=feat+test`.

### E10. Commit + rebuild app
- **o que fazer:** commit "feat(rbac): fast-path Nex sem LLM + defesa contra alucinacao de tool + bolha condicionada".

---

## Onda F — Métricas no `/agente/monitoramento`

### F1. Query `getPermissionDenialStats`
- **arquivo:** `src/lib/actions/agent-permission-denials.ts` (novo)
- **o que fazer:** `"use server"`. `getPermissionDenialStats(period: "24h" | "7d" | "30d"): Promise<{ total: number; byDomain: Array<{domain: string; count: number}>; recent: Array<{userId: string; userName: string; questionSnippet: string; deniedDomains: string[]; timestamp: Date}> }>`. Implementação:
  - `prisma.auditLog.findMany({ where: { action: "agent_permission_denied", createdAt: { gte: cutoff } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 })` → `recent`.
  - `total = prisma.auditLog.count({ where: { action, createdAt } })`.
  - `byDomain`: groupBy não funciona direto em campo de jsonb. Solução: pegar todos, agregar in-memory pelas chaves de `details.deniedDomains[]`. Para volumes pequenos (<1000 rows/janela) é aceitável; nota documenta limitação.
- **done quando:** função compila; retorna shape correto em 3 períodos.

### F2. Teste unit da query
- **arquivo:** `src/lib/actions/agent-permission-denials.test.ts` (novo)
- **o que fazer:** mock prisma com 3 fixtures (1h, 1d, 10d). Asserir: período `24h` total=1; `7d` total=2; `30d` total=3. `byDomain` agrupa correto. `recent` ordenado desc por timestamp.
- **done quando:** 3+ testes verdes.

### F3. Componente `permission-denials-card`
- **arquivo:** `src/components/agent/router/permission-denials-card.tsx` (novo)
- **o que fazer:** client component recebe dados via props. Layout: card com KPI grande do `total`; `InteractiveBarChart` (reuso) com `byDomain`; tabela compacta dos `recent` (10 linhas) com tooltip do `questionSnippet`. Empty state: "Nenhuma recusa no período".
- **done quando:** renderiza com dados mock e com array vazio.

### F4. Integrar card em `/agente/monitoramento/page.tsx`
- **arquivo:** `src/app/(protected)/agente/monitoramento/page.tsx`
- **o que fazer:** import do card. No server component, ler `period` de `searchParams` (default "7d"), chamar `getPermissionDenialStats(period)`, passar como prop. Posicionar abaixo do header.
- **done quando:** página renderiza; sem dado, empty state aparece.

### F5. Teste do componente
- **arquivo:** `src/components/agent/router/permission-denials-card.test.tsx` (novo)
- **o que fazer:** 3 cases: zero, 1 recusa, várias. Asserir KPI, presença do chart (mock do `InteractiveBarChart`), tabela com tooltip.
- **done quando:** 3+ testes verdes.

### F6. Atualizar `HISTORY.md`
- **arquivo:** `docs/agents/HISTORY.md`
- **o que fazer:** linha consolidando F.

### F7. Commit + rebuild app
- **o que fazer:** commit "feat(agente): card Recusas por permissao em /agente/monitoramento".

---

## Onda G — Verificação E2E, code/ui review, PR

### G1. Seed script
- **arquivo:** `scripts/seed-rbac-v2-test.ts` (novo)
- **o que fazer:** TS standalone (`tsx scripts/seed-rbac-v2-test.ts`). Importa `prisma` e `bcrypt`. Hash bcrypt cost 10 de `"Teste@2026!"`. Insere 4 usuários via `prisma.user.upsert` (chave email):
  - `super_admin@matrix.local` (super_admin)
  - `admin@matrix.local` (admin)
  - `manager-est@matrix.local` (manager) — após upsert, `prisma.userDomainAccess.upsert({where:{userId_domain:{userId, domain:"estoque"}}, create:{...}, update:{}})`.
  - `viewer-nada@matrix.local` (viewer)
- Todos: `mustChangePassword: true`, `isActive: true`. Idempotente.
- **done quando:** rodar 2x não duplica; `SELECT email FROM users WHERE email LIKE '%@matrix.local'` retorna 4.

### G2. `npm test` global verde
- **dependência:** todas as ondas anteriores.
- **o que fazer:** rodar `npm test`. Baseline atual: 1968 (registrado no HISTORY do R1 hoje). Esperado: ≥ 1968 + novos da feature (estimado +25 com Ondas A-F).
- **done quando:** terminal mostra todos verdes.

### G3. `npm run typecheck` verde
- **o que fazer:** rodar.
- **done quando:** zero erro TS.

### G4. E2E manual (SPEC §11.3, 12 passos)
- **arquivo:** `docs/superpowers/runs/2026-05-28-rbac-v2-e2e.md` (novo)
- **dependência:** G1 rodado.
- **o que fazer:** seguir literalmente os 12 passos da SPEC §11.3. Capturar evidência: prints dos banners (no dashboard); recortes do `SELECT * FROM llm_usage ORDER BY created_at DESC LIMIT 5` antes e depois da recusa (não deve incrementar); queries de validação (`SELECT action, count(*) FROM audit_logs WHERE action='agent_permission_denied' GROUP BY 1`); latência observada do fast-path (com timestamp).
- **done quando:** 12 passos checados; documento contém evidência de cada.

### G5. Grep final
- **o que fazer:** `grep -rEn "['\"]rh['\"]|['\"]producao['\"]" src/ mcp/ --include="*.ts" --include="*.tsx"`. Aceitável: hits em arquivos de teste com `DOMINIOS_REMOVIDOS_LEGADO`; tudo o mais deve ser zero.
- **done quando:** lista anexada ao PR description.

### G6. `/gsd-code-review`
- **dependência:** todas as ondas.
- **o que fazer:** invocar a skill no diff do branch.
- **done quando:** zero severidade alta; média endereçada ou justificada por escrito.

### G7. `/gsd-ui-review`
- **o que fazer:** invocar a skill com foco em: banner `/dashboard`, card `/agente/monitoramento`, microcopy `AccessStep`.
- **done quando:** PASS nos 6 pilares para os componentes tocados.

### G8. `HISTORY.md` final
- **arquivo:** `docs/agents/HISTORY.md`
- **o que fazer:** linha consolidando ondas A-G, commits, latência observada do fast-path, baseline de testes pós-feature.

### G9. Active file deletado
- **arquivo:** `docs/agents/active/claude-revisao-usuarios-permissoes.md`
- **o que fazer:** `git rm`.

### G10. Abrir PR
- **dependência:** G2..G9 verdes.
- **o que fazer:** `git push origin feat/rbac-v2-gating-e-dominios`. `gh pr create --base main --title "feat(rbac): v2 — gating de telas + dominios do Nex"`. Body com 7 seções: (1) escopo curto, (2) ondas A-G executadas, (3) links SPEC v3 / PLAN v3 / RUN E2E, (4) grep prévio + final, (5) latência observada do fast-path, (6) baseline de testes pós-feature, (7) snapshot pré-flight prod (depois de aplicar `scripts/2026-05-28-pre-flight-rbac-v2.sh`).
- **done quando:** PR aberto; URL retornado.

---

## Dependências entre ondas

- A → B (B usa helpers)
- B independe de C
- C → D (D6 depende de `outcome`); C → E (E1 depende de `agent_permission_denied` no enum)
- D → E (E pluga fast-path que precisa de `userAllowedDomains` da D4)
- E → F (F lê audit_logs gerados em E)
- A..F → G; G4 depende de G1 (seed antes do roteiro)

Ordem natural única viável: A → B → C → D → E → F → G. Paralelismo não vale a pena: as ondas se sobrepõem em `run-agent.ts` (D, E) e `layout.tsx` (B, E8).

---

## Plano de rollback

- **Onda C em prod:** aplicar `down.sql` via `psql $DATABASE_URL -f .../down.sql`; restaurar usuários afetados via `docs/migrations/2026-05-28-rbac-v2-snapshot.txt`.
- **Onda E fast-path falso positivo crítico:** sem feature flag adicional (decisão MVP, SPEC v3 §14 rollback). Hotfix de ~20 linhas: comentar bloco em `run-agent.ts`, deploy.
- **Onda F card quebrado:** comentar import em `monitoramento/page.tsx`; additive.

---

## Histórico

- **v1 (2026-05-28):** 7 ondas, ~45 microtarefas.
- **v2 (2026-05-28):** Review #1 (15 achados): B6 não passa allowedDomains adiante na Onda B; JSON 403 `AgentNotEnabled`; computeAllowedDomains com seesAll short-circuit; D6 dependência explícita de C; B9 dividido em B9a (client) + B9b (server); G1 bcrypt; E1 testes sem timing flaky; E3 fast-path APÓS createDecision (com reorganização); C5 migrate status; C8 PROD only; D1 permissionFilteredOut; E4 escopo; F2/F5 testes; rebuild de containers explícito.
- **v3 (2026-05-28):** Review #2 (12 achados materiais):
  1. **Reorganização do run-agent (D5):** mover `createDecision` para ANTES de `filterCatalog`. Sem isso, o fast-path em §6.2 (que precisa de `routerDecisionId`) ficaria depois do `filterCatalog`, anulando o benefício. PLAN v2 mencionava mas não detalhava como.
  2. **B6b teste de regressão** explícito para `/api/agent/stream` no fluxo `isPlayground=true` (gate antigo `PLAYGROUND_ROLES` segue valendo).
  3. **C6 exporta `seesAll`** de `@/lib/reports/domains` (PLAN v2 assumia mas não documentava).
  4. **F1 byDomain in-memory** documentado como limitação (groupBy em jsonb não funciona direto).
  5. **C2 distingue testes de remoção vs adição** de domínio (preserva intenção do teste).
  6. **C5 comando exato:** `npx prisma migrate status` antes do deploy.
  7. **C9 down.sql aplicado via psql manual.**
  8. **E1 import de `EXCLUDE_FROM_FILTERING`** explicitado (criar export se ainda não existe).
  9. **G4 depende de G1** (seed antes do roteiro).
  10. **F1 shape do recent** com join na users via include do Prisma.
  11. **D8/E5/E6/E7 padrão de mock** documentado nas convenções (jest.mock no topo).
  12. **Formato canônico do HISTORY.md** consistente em todas as ondas.

PLAN v3 é a versão definitiva. Pronto para execução.
