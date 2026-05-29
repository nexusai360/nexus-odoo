# SPEC v3: RBAC v2 — Gating de telas e domínios do Agente Nex

> Sub-projeto: trava de telas por papel (defesa em profundidade) + realinhamento dos domínios do cadastro de usuário à realidade do Router R1 + amarração do Agente Nex aos `UserDomainAccess` do usuário logado, com fast-path de recusa via embedding (sem chamada ao LLM) quando a pergunta cai em domínio fora de acesso.

- **Branch alvo:** `feat/rbac-v2-gating-e-dominios` (cria a partir de `main` quando o R1 mergear; até lá, base `feat/router-catalogo-r1`).
- **Autor:** claude-revisao-usuarios-permissoes
- **Data:** 2026-05-28
- **Versão:** v3 (após duas reviews adversariais). v1 e v2 vivem no histórico (§18).
- **Skill:** `superpowers:brainstorming` → modo autônomo total (usuário dispensou perguntas em 2026-05-28 13:30).

---

## 1. Por que esta spec existe

Hoje a plataforma tem RBAC (4 papéis `super_admin`/`admin`/`manager`/`viewer` + flag `isOwner`) e cadastro de domínios por usuário (`UserDomainAccess` apontando para `REPORT_DOMAINS`). Três problemas concretos:

1. **Defesa em profundidade falha.** Só `/agente/*` e `/integracoes/*` rejeitam server-side quem não é super_admin. `/usuarios`, `/configuracao` e várias API routes confiam só no filtro da sidebar ou em checks parciais. Quem digitar a URL direto recebe a página.
2. **Cadastro de domínios desatualizado.** `REPORT_DOMAINS` lista 9 domínios (incluindo `rh` e `producao`), mas Router R1 e servidor MCP só implementam 7. O cadastro pode conceder acesso a domínios fantasmas.
3. **Agente Nex ignora `UserDomainAccess`.** `filterCatalog` corta por `pickedDomains` do Router (semântica da pergunta), mas não cruza com permissão do usuário. Pior: a bolha do Nex em `(protected)/layout.tsx` só aparece para `super_admin` e `admin`; `manager` e `viewer` não têm chat algum.

A SPEC corrige os três em um único sub-projeto: redefinir domínios sem amarrar no agente desperdiça fôlego; amarrar o agente sem realinhar deixaria buracos lógicos.

## 2. Decisões canônicas

Decisões em modo autônomo (usuário dispensou perguntas). Sustentadas pela perícia (§3). Congeladas, só mudam se review futura provar erradas.

1. **Hierarquia de papéis NÃO muda.** `super_admin > admin > manager > viewer`, com `isOwner` complementar. Confirmado pelo usuário em 2026-05-28: "essas regras desse jeito tem que funcionar".
2. **Domínios espelham 1:1 o vocabulário do Router R1.** `rh` e `producao` saem. Domínios finais: `cadastros`, `comercial`, `contabil`, `crm`, `estoque`, `financeiro`, `fiscal`.
3. **Defesa em profundidade obrigatória.** Todo gate vive em helper canônico (`requireMinRole`, `requireVisibleDomainsOrRedirect`). Sidebar `filterNav` segue como UX.
4. **Nex disponível para todos os papéis autenticados com ≥1 domínio visível.** Super_admin/admin: catálogo inteiro (via `seesAll`). Manager/viewer: catálogo intersectado com `UserDomainAccess`.
5. **Gate de permissão é camada DIFERENTE do shadow do Router R1.** O shadow do Router (`routerEnabled=false`) significa "observa sem filtrar por similaridade". O gate de permissão **sempre** corta tools de domínio fora do acesso. Em código: `filterCatalog` aplica duas camadas independentes em sequência.
6. **Fast-path de recusa via embedding dispara sempre que o embedding rodou.** Independe de `routerEnabled`. Critério: `pickedDomains` não vazio E interseção com `userAllowedDomains` (ignorando `EXCLUDE_FROM_FILTERING`) é vazia. Custo: 0 tokens LLM. Latência alvo: < 200ms; teto < 500ms.
7. **Resposta padrão é template puro no MVP.** Humanização via LLM fica como follow-up.
8. **Tools transversais** (`caminho3`, `dominios-vazios`) ficam sempre no catálogo do LLM, mas `caminho3` vira parte explícita de `userAllowedDomains` (apenas super_admin/admin), não dependência implícita do `BI_ROLES` em `run-agent.ts`. Defesa única em vez de duas camadas mal coordenadas (correção da Review #2).
9. **Histórico de conversa não é retroativo.** Mensagens passadas continuam visíveis mesmo após perda de acesso (decisão consciente: usuário já viu o conteúdo; mascarar retroativamente exigiria varrer mensagens a cada render).
10. **Auditoria registra cada recusa.** Novo `AuditAction.agent_permission_denied`. `questionSnippet` truncado a 200 chars + CPF/CNPJ nus mascarados via regex.
11. **Migration destrutiva de enum** com backup gerado por pré-flight + idempotência onde possível + rollback definido.
12. **Migration nova de `AgentRouterDecision.outcome`.** Coluna `TEXT NULL`, valores documentados (§10).
13. **Plugar MCPs, Integrações, Configuração permanecem `super_admin` only.** Sem mudança política; só formalização via `requireMinRole`.
14. **Grep prévio obrigatório** de `'rh'`/`'producao'` em todo o repo. Resultado anexado ao PR.
15. **Defesa em profundidade no run-agent: validar `toolName` antes de `session.callTool()`.** Mesmo que o LLM chute nome de tool fora do catálogo, `run-agent.ts` recusa a chamada e devolve `tool_result` de erro. Garantia contra alucinação de tool.
16. **`/api/mcp` externo (clientes via ApiKey) está FORA do escopo.** RBAC dele é por `capability` do `ApiKey`, camada separada. Esta spec só cobre o cliente interno do Nex (run-agent → mcp-client).

## 3. Realidade atual (perícia 2026-05-28)

### 3.1 Domínios cadastrados vs realidade

| Domínio em `REPORT_DOMAINS` | Existe no Router R1? | Tem tools MCP? | Tem relatório? | Veredito |
|---|---|---|---|---|
| estoque | sim | sim | sim (6 relatórios) | mantém |
| financeiro | sim | sim | não (F4 onda 2 pendente) | mantém |
| fiscal | sim | sim | não | mantém |
| comercial | sim | sim | não | mantém |
| cadastros | sim | sim | não | mantém |
| contabil | sim | sim | não | mantém |
| crm | sim | sim | não | mantém |
| rh | **NÃO** | apenas placeholder em `dominios-vazios` | não | **REMOVE** |
| producao | **NÃO** | apenas placeholder em `dominios-vazios` | não | **REMOVE** |

Vocabulário Router R1 inclui também `caminho3` (BI livre) e `dominios-vazios` (responder "ainda não temos"). Não vão pro cadastro porque não são domínios de negócio.

### 3.2 Gate atual por rota

| Rota | Papel mínimo | Gate hoje | Ação |
|---|---|---|---|
| `/dashboard` | autenticado | só auth global | OK + adiciona banner para `?denied=...`/`?error=no_domains` |
| `/perfil`, `/perfil/trocar-senha` | autenticado | só auth global | OK |
| `/relatorios` (listagem) | autenticado + ≥1 domínio | só auth global | **adiciona** layout com `requireVisibleDomainsOrRedirect` |
| `/relatorios/[id]` | autenticado + domínio do relatório | `requireDomainAccess(report.dominio)` em `src/lib/reports/guard.ts` | OK (já existe) |
| `/usuarios` | admin+ | só sidebar | **adiciona** layout com `requireMinRole("admin")` |
| `/configuracao` | super_admin | só sidebar | **adiciona** layout com `requireMinRole("super_admin")` |
| `/integracoes/*` | super_admin | `layout.tsx` inline | refatora para `requireMinRole("super_admin")` |
| `/agente/*` | super_admin | `layout.tsx` inline | refatora para `requireMinRole("super_admin")` |

### 3.3 Gate atual por API route

| Endpoint | Gate hoje | Ação |
|---|---|---|
| `/api/agent/stream` | só auth + `PLAYGROUND_ROLES` quando `isPlayground=true` | **adiciona** `requireAgentAccessOrJson()`: 401 se sem auth, 403 se sem domínio visível |
| `/api/agent/suggest-continuation` | só auth | **adiciona** mesmo gate |
| `/api/agent/transcribe` | só auth | **adiciona** mesmo gate |
| `/api/agent/playground/stream` | só auth + `PLAYGROUND_ROLES` | OK (super_admin/admin) |
| `/api/agent/prompt-preview` | só auth + `ALLOWED_ROLES` (admin+) | OK |
| `/api/admin/router/kill` | role-checked | OK |
| `/api/user/theme` | só auth | OK |
| `/api/integrations/whatsapp/inbound` | webhook externo (assinado) | fora do escopo |
| `/api/mcp` (cliente externo via ApiKey) | capability do ApiKey | **fora do escopo desta spec** |

## 4. Catálogo unificado de domínios

`REPORT_DOMAINS` em `src/lib/reports/domains.ts` é mantido manualmente, espelhando o vocabulário do Router R1 (`DOMAINS` em `src/lib/agent/router/domain-vocabulary.ts`). Como o enum `ReportDomain` é Prisma (estático), a unificação é por convenção + teste de coerência.

Mudanças:
- Enum Prisma `ReportDomain` perde `rh` e `producao`.
- `REPORT_DOMAINS` perde `rh` e `producao`.
- Novo teste em `src/lib/reports/domains.test.ts` (ou adendo no `domain-vocabulary.test.ts`): todo id em `REPORT_DOMAINS` está em `DOMAINS.map(d => d.domain)`. Router pode ter `caminho3`/`dominios-vazios` extras; cadastro NÃO pode ter id estranho.

Labels finais (pt-br humanizado, sem travessão):

| id | label |
|---|---|
| cadastros | Cadastros |
| comercial | Comercial |
| contabil | Contábil |
| crm | CRM |
| estoque | Estoque |
| financeiro | Financeiro |
| fiscal | Fiscal |

Ordem alfabética dos `id`.

## 5. Matriz de gating server-side

### 5.1 Helpers novos em `src/lib/auth/require.ts`

- `requireAuth(): Promise<AuthUser>` — `redirect("/login")` se não autenticado.
- `requireMinRole(min: PlatformRole, redirectTo?: string): Promise<AuthUser>` — `requireAuth`, depois `PLATFORM_ROLE_HIERARCHY[user.platformRole] >= PLATFORM_ROLE_HIERARCHY[min]`. Falha → `redirect("${redirectTo ?? '/dashboard'}?denied=${min}")`.
- `requireVisibleDomainsOrRedirect(redirectTo?: string): Promise<{ user: AuthUser; domains: ReportDomainId[] }>` — `requireAuth`, busca `visibleDomains(role, granted)`. Vazio → `redirect("${redirectTo ?? '/dashboard'}?error=no_domains")`.
- `requireAgentAccessOrJson(): Promise<{ user: AuthUser; allowedDomains: Set<string> | "all" }>` — para API routes (sem `redirect`, responde JSON). Sem auth → `NextResponse.json({error:"Unauthorized"},{status:401})`. Sem domínio visível → `NextResponse.json({error:"AgentNotEnabled"},{status:403})`. Sucesso → objeto.

Removida da v1: `requireExactRole` (YAGNI; sem caso de uso).

Cada helper recebe testes unitários cobrindo hierarquia, fallback, query param, mock de `redirect` (jest spy).

### 5.2 Aplicação dos helpers

| Rota/Endpoint | Arquivo | Helper |
|---|---|---|
| `/usuarios` | novo `src/app/(protected)/usuarios/layout.tsx` | `await requireMinRole("admin")` |
| `/configuracao` | novo `src/app/(protected)/configuracao/layout.tsx` | `await requireMinRole("super_admin")` |
| `/integracoes/*` | `src/app/(protected)/integracoes/layout.tsx` refatora | `await requireMinRole("super_admin")` |
| `/agente/*` | `src/app/(protected)/agente/layout.tsx` refatora | `await requireMinRole("super_admin")` |
| `/relatorios` | novo `src/app/(protected)/relatorios/layout.tsx` | `await requireVisibleDomainsOrRedirect()` |
| `/relatorios/[id]` | `src/app/(protected)/relatorios/[id]/page.tsx` (já existe) | mantém `requireDomainAccess(report.dominio)` |
| `/api/agent/stream` | `src/app/api/agent/stream/route.ts` | `await requireAgentAccessOrJson()` antes de `runAgent` |
| `/api/agent/suggest-continuation` | idem | idem |
| `/api/agent/transcribe` | idem | idem |

### 5.3 Banner em `/dashboard` para denúncias silenciosas

Novo componente `src/components/dashboard/access-denied-banner.tsx`. Lê `searchParams` (server component). Mostra toast/banner descartável quando vê `?denied=...` ou `?error=no_domains`. Sem banner, o redirect parece silencioso. Textos:
- `denied=admin` → "Você não tem permissão para acessar Usuários."
- `denied=super_admin` → "Você não tem permissão para acessar essa área."
- `error=no_domains` → "Seu acesso aos relatórios ainda não foi configurado. Fale com seu administrador."

## 6. Gate de domínios do Agente Nex

### 6.1 `filterCatalog` ganha `userAllowedDomains`

Assinatura nova:

```text
filterCatalog({
  allTools,
  decision,
  routerEnabled,
  userAllowedDomains, // novo: Set<string> | "all"
})
```

**Duas camadas independentes:**

**Camada A — Router R1 (existe hoje):**
- Se `routerEnabled=false` ou fallback: passa `allTools` adiante.
- Se ativo + sem fallback: corta por `pickedDomains ∪ EXCLUDE_FROM_FILTERING ∪ UNKNOWN_DOMAIN`.

**Camada B — gate de permissão (novo, SEMPRE vale):**
- Se `userAllowedDomains === "all"`: passa adiante.
- Senão: corta toda tool cujo domínio NÃO está em `userAllowedDomains ∪ EXCLUDE_FROM_FILTERING ∪ UNKNOWN_DOMAIN`.

**Resultado entregue ao LLM:** `camadaA(allTools) ∩ camadaB(allTools)`.

`caminho3` vira parte explícita de `userAllowedDomains` quando o papel é admin/super_admin (computado pelo caller — `run-agent.ts`):

```text
function computeAllowedDomains(user: AuthUser, granted: ReportDomainId[]): Set<string> | "all" {
  if (seesAll(user.platformRole)) return "all";
  return new Set(granted); // manager/viewer: granted apenas. NÃO inclui caminho3.
}
```

### 6.2 Fast-path de recusa sem LLM

Implementado em `src/lib/agent/run-agent.ts`, logo após `pickDomains`:

```text
if (userAllowedDomains !== "all"
    && !routerDecision.fallback.triggered
    && routerDecision.pickedDomains.length > 0) {
  const nonTransversal = routerDecision.pickedDomains
    .filter(d => !EXCLUDE_FROM_FILTERING.has(d));
  const intersected = nonTransversal.filter(d => userAllowedDomains.has(d));
  if (intersected.length === 0 && nonTransversal.length > 0) {
    return await respondPermissionDenied({
      conversationId,
      user,
      deniedDomains: nonTransversal,
      availableDomains: [...userAllowedDomains],
      routerDecisionId,
      userQuestion: args.userMessage,
    });
  }
}
```

`respondPermissionDenied` em `src/lib/agent/permission-denial.ts`:
- Persiste mensagem do usuário (já é feito).
- Persiste mensagem de assistant com o template (§6.4).
- Loga em `AuditLog` com `action: "agent_permission_denied"`, `questionSnippet` sanitizado.
- Atualiza `agent_router_decision.outcome = 'permission_denied'`.
- Não chama LLM nem MCP.
- Retorna `ChatResult` com `text`, `usage: { input: 0, output: 0, costKnown: true, costUsd: 0 }`.

### 6.3 Defesa adicional antes de `session.callTool()`

Mesmo que o LLM chute o nome de uma tool fora do catálogo entregue (alucinação), `run-agent.ts` valida antes de executar:

```text
// Em run-agent, dentro do loop de tool calling:
for (const toolCall of message.toolCalls) {
  const domain = getToolDomain(toolCall.name);
  const transversal = EXCLUDE_FROM_FILTERING.has(domain) || domain === UNKNOWN_DOMAIN;
  const allowed =
    userAllowedDomains === "all" || transversal || userAllowedDomains.has(domain);
  if (!allowed) {
    // Não chama; devolve tool_result de erro semântico.
    toolResults.push({
      toolCallId: toolCall.id,
      content: `Acesso ao domínio "${domain}" não está liberado para o seu usuário.`,
    });
    continue;
  }
  // ... callTool normal.
}
```

Comportamento esperado: LLM vê o `tool_result` de erro e adapta a resposta. O `agent_permission_denied` NÃO é logado aqui (a defesa é só fail-safe; a métrica primária vem do fast-path da §6.2).

### 6.4 Template da resposta padrão

Template puro pt-br, sem travessão, em `src/lib/agent/permission-denial.ts`:

```text
const TEMPLATE = ({ denied, available }) => `
Vi que sua pergunta toca em ${formatDomainList(denied)} e o seu acesso na
plataforma hoje não cobre ${denied.length > 1 ? "esses módulos" : "esse módulo"}.

${available.length > 0
  ? `Posso te ajudar com ${formatDomainList(available)}. Quer seguir por aí?`
  : `Hoje você não tem acesso a nenhum módulo de dados na plataforma. Fale com seu administrador para liberar os módulos que precisar.`
}
`.trim();
```

`formatDomainList(["financeiro", "fiscal"])` → `"Financeiro e Fiscal"`. 3+ vira `"X, Y e Z"`. Usa `REPORT_DOMAINS` para id → label.

### 6.5 Bolha do Nex condicionada a `visibleDomains`

`src/app/(protected)/layout.tsx` muda:

```text
// Antes:
const canUseAgent = user.platformRole === "super_admin" || user.platformRole === "admin";

// Depois (com short-circuit):
const canUseAgent = seesAll(user.platformRole)
  ? true
  : (await getUserDomains(user.id)).length > 0;
```

`seesAll` faz curto-circuito: super_admin/admin NÃO disparam query. Manager/viewer disparam 1 query indexada (`findMany` por `userId`). O segmento de layout não re-renderiza em navegação client-side; query roda só em hard nav. Sem cache em memória nesta spec (TTL stale após mudança de permissão).

`bubbleEnabled` (`AgentSettings`) segue como kill-switch global.

### 6.6 Comportamento em mistura de domínios

Pergunta que casa com vários domínios, alguns permitidos outros não:
- Fast-path NÃO dispara (interseção ≥ 1).
- Camada B do `filterCatalog` corta as tools de domínio negado.
- LLM responde com as tools disponíveis. Sem hint extra no system prompt (KISS).
- Esperado: LLM articula tipo "sobre estoque vejo X; sobre financeiro não tenho dado para você." Aceitável como comportamento de MVP. Risco de alucinação de financeiro mitigado pela §6.3.

### 6.7 Comportamento em tool com prefixo desconhecido

`getToolDomain` retorna `UNKNOWN_DOMAIN` (`_desconhecido`). Camada B mantém (conservador). Teste novo alerta quando tool sem prefixo conhecido aparece (logger.warn em dev + asserção no teste de coerência).

## 7. Mudanças no cadastro de usuário

Componentes:
- `src/components/users/access-step.tsx` — lê `REPORT_DOMAINS`, propaga sozinho. Adicionar microcopy: "Estes módulos definem o que o usuário pode ver em Relatórios e perguntar ao Agente Nex."
- `src/components/users/user-form-dialog.tsx` — sem mudança estrutural.
- `src/lib/actions/domain-access.ts` — `updateUserDomains` já valida; sem mudança lógica.
- `src/lib/reports/domains.ts` — `REPORT_DOMAINS` perde 2 entradas.
- `prisma/schema.prisma` — enum `ReportDomain` perde `rh`/`producao`; coluna nova `AgentRouterDecision.outcome TEXT NULL`; enum `AuditAction` ganha `agent_permission_denied`.
- `prisma/migrations/<timestamp>_rbac_v2_alinhar_dominios_e_audit_router/migration.sql` — migration combinada (§8).

## 8. Migração de dados

### 8.1 Ordem de execução da Onda C (importante)

1. **Grep prévio.** `grep -rEn "['\"]rh['\"]|['\"]producao['\"]" src/ mcp/ prisma/ --include="*.ts" --include="*.tsx" --include="*.sql"`. Lista anexada ao PR.
2. **Refatorar referências hardcoded.** Cada hit decide-se: remover, virar constante (`DOMAIN_RH = 'rh'`), ou manter (migrations antigas: histórico, intocadas).
3. **Editar `prisma/schema.prisma`**: remove valores do enum, adiciona coluna `outcome`, valor `agent_permission_denied` no `AuditAction`.
4. **`prisma migrate dev --name rbac_v2`** — gera migration. Substituir o SQL gerado pelo manual da §8.2 (Prisma não sabe deletar valor de enum corretamente).
5. **`prisma generate`** — atualiza client. TS reflete a mudança.
6. **Atualizar `REPORT_DOMAINS`** em `src/lib/reports/domains.ts`.
7. **`npm test` + `npm run typecheck`** — verde antes de prosseguir.

### 8.2 SQL da migration

```sql
-- Pré-flight (script separado, NÃO faz parte da migration):
-- scripts/2026-05-28-pre-flight-rbac-v2.sh roda em prod:
-- SELECT user_id, domain, granted_by_id FROM user_domain_access
-- WHERE domain IN ('rh', 'producao');
-- Saída salva em docs/migrations/2026-05-28-rbac-v2-snapshot.txt (commitada).

BEGIN;

-- 1. AgentRouterDecision ganha outcome.
ALTER TABLE "agent_router_decision"
  ADD COLUMN IF NOT EXISTS "outcome" TEXT NULL;

-- 2. AuditAction ganha agent_permission_denied.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'agent_permission_denied';

-- 3. Deleta linhas órfãs de UserDomainAccess + audit interno.
WITH deleted AS (
  DELETE FROM "user_domain_access"
  WHERE domain IN ('rh', 'producao')
  RETURNING user_id, domain
)
INSERT INTO "audit_logs" (id, user_id, action, target_type, target_id, details, created_at)
SELECT gen_random_uuid(), user_id, 'user_domains_changed', 'User', user_id::text,
       jsonb_build_object('removed', jsonb_build_array(domain), 'reason', 'rbac_v2_alignment'),
       NOW()
FROM deleted;

-- 4. Recria enum ReportDomain sem rh/producao.
ALTER TYPE "ReportDomain" RENAME TO "ReportDomain_old";
CREATE TYPE "ReportDomain" AS ENUM (
  'cadastros', 'comercial', 'contabil', 'crm',
  'estoque', 'financeiro', 'fiscal'
);
ALTER TABLE "user_domain_access"
  ALTER COLUMN "domain" TYPE "ReportDomain"
  USING "domain"::text::"ReportDomain";
DROP TYPE "ReportDomain_old";

COMMIT;
```

**Idempotência:**
- Passos 1, 2 usam `IF NOT EXISTS` / `IF NOT EXISTS`.
- Passo 3 (`DELETE WHERE domain IN`) é idempotente naturalmente.
- Passo 4 NÃO é idempotente (vai falhar se rodado duas vezes — tipo já renomeado). Aceitável porque a migration roda 1x via `prisma migrate deploy`. Falha no meio é capturada pelo `BEGIN/COMMIT` (atomicidade).

**Down (rollback):**
```sql
BEGIN;
ALTER TYPE "ReportDomain" RENAME TO "ReportDomain_v2";
CREATE TYPE "ReportDomain" AS ENUM (
  'estoque','financeiro','fiscal','comercial','cadastros',
  'contabil','rh','crm','producao'
);
ALTER TABLE "user_domain_access"
  ALTER COLUMN "domain" TYPE "ReportDomain"
  USING "domain"::text::"ReportDomain";
DROP TYPE "ReportDomain_v2";
ALTER TABLE "agent_router_decision" DROP COLUMN IF EXISTS "outcome";
-- AuditAction.agent_permission_denied não é removível (Postgres limit; valor não usado se rollback).
COMMIT;
```

## 9. Auditoria e métricas

Novo enum value `AuditAction.agent_permission_denied`.

Linha gerada:

```text
{
  action: "agent_permission_denied",
  userId: user.id,
  targetType: "AgentRouterDecision",
  targetId: routerDecisionId,
  details: {
    deniedDomains: ["financeiro"],
    availableDomains: ["estoque", "comercial"],
    questionSnippet: sanitize(question, 200),
    routerVersion: "r1.0.0.0-<hash>",
  }
}
```

`sanitize` em `src/lib/agent/permission-denial.ts`:
1. Trunca a 200 chars.
2. `.replace(/\b\d{11}\b/g, "[doc]")` — CPF nu.
3. `.replace(/\b\d{14}\b/g, "[doc]")` — CNPJ nu.

CPF/CNPJ formatados (com pontos/hífen) NÃO são mascarados — decisão consciente de MVP (escopo expandiria muito). Anotado como risco aceito.

Retention: igual ao restante de `audit_logs` (sem TTL ativo).

### 9.1 Valores de `AgentRouterDecision.outcome`

Documentado (enum-like via TEXT):

| outcome | Quando gravado |
|---|---|
| `null` | linhas históricas pré-RBAC v2 |
| `"ok"` | turno completou normalmente (LLM respondeu) |
| `"permission_denied"` | fast-path de §6.2 disparou |
| `"failed"` | exceção não tratada (futuro; fora desta spec) |

Atualização em `run-agent.ts`: no fim do turno bem-sucedido, `updateDecision({ decisionId, outcome: "ok" })`. No fast-path, `respondPermissionDenied` já grava `"permission_denied"`. Default `null` por enquanto preserva histórico.

### 9.2 Card "Recusas por permissão"

`/agente/monitoramento` ganha card novo. Query `getPermissionDenialStats(period: "24h" | "7d" | "30d")` em `src/lib/actions/agent-permission-denials.ts`:

```text
{
  total: number,
  byDomain: Array<{ domain: string; count: number }>,
  recent: Array<{
    userId: string;
    userName: string;
    questionSnippet: string;
    deniedDomains: string[];
    timestamp: Date;
  }>,
}
```

Componente `src/components/agent/router/permission-denials-card.tsx`: KPI + bar chart de domínios + drill-down recente.

## 10. Edge cases

| Cenário | Comportamento |
|---|---|
| Owner com `platformRole = viewer` | `seesAll(role)` ignora `isOwner`. Owner não-super tem domínios concedidos como qualquer outro. Revisão fora desta spec. |
| Manager sem domínio | Bolha não aparece. `/relatorios` redireciona `?error=no_domains`. Banner exibe explicação. |
| Viewer sem domínio | Igual. |
| Super_admin sem domínio | `seesAll` força `"all"`. Sem mudança. |
| Usuário troca papel durante conversa | Próxima request pega novo papel (stateless). |
| Usuário perde domínio durante conversa | Próxima mensagem respeita. Histórico exibido permanece (decisão §2.9). |
| Router fallback (`triggered=true`) | Fast-path NÃO dispara. Camada B do filterCatalog ainda corta. |
| Tool sem prefixo conhecido (`UNKNOWN_DOMAIN`) | Mantida (conservador). Teste alerta se tool nova aparecer. |
| `caminho3` para viewer/manager | NÃO disponível (não está em `userAllowedDomains` calculado). Sem dupla camada implícita. |
| Pergunta mistura domínios permitidos/negados | Fast-path NÃO dispara. Filtra tools, LLM responde. Defesa §6.3 valida tool calls. |
| Kill-switch do Router (`routerEnabled=false`) | Camada A não filtra; camada B sempre filtra. Defesa preservada. |
| Embedding falha (`embed_failed`) | `pickedDomains=[]`; fast-path NÃO dispara; camada B corta. LLM responde. |
| LLM chuta tool fora do catálogo (alucinação) | §6.3 captura; devolve `tool_result` de erro semântico. |
| Layout `(protected)` para super_admin | Short-circuit: sem query de `getUserDomains`. |
| Layout `(protected)` para manager/viewer | 1 query por hard nav. Aceitável. |
| Mensagem do usuário tem CPF/CNPJ | `sanitize` mascara antes do `audit_logs`. |
| Audit logs explodem com bot externo | Rate limit existente em `/api/agent/stream` segura. |

## 11. Plano de testes

### 11.1 Unidade
- `src/lib/auth/require.test.ts` — `requireAuth`, `requireMinRole`, `requireVisibleDomainsOrRedirect`, `requireAgentAccessOrJson`. Mocks: `getCurrentUser`, `redirect`, `NextResponse.json`. Cobre hierarquia, query param de denúncia, no_domains, 401, 403.
- `src/lib/agent/router/filter-catalog.test.ts` — adiciona casos: `userAllowedDomains="all"`, set vazio, interseção parcial, interseção nula, fallback do Router, shadow + permissão (camadas independentes).
- `src/lib/agent/permission-denial.test.ts` — template com 0/1/N domínios; `sanitize` mascara CPF/CNPJ nu; latência simulada < 200ms; `costUsd = 0`.
- `src/lib/reports/domains.test.ts` — coerência: `REPORT_DOMAINS` ⊂ Router `DOMAINS`.
- `src/lib/text-sanitize.test.ts` (ou inline) — regex de CPF/CNPJ nus.

### 11.2 Integração
- `src/lib/agent/__tests__/run-agent-permission-denied.test.ts` — viewer com `{estoque}` pergunta financeiro → não chama LLM, persiste mensagem, gera audit_log, `router_decision.outcome = "permission_denied"`.
- `src/lib/agent/__tests__/run-agent-permission-allowed.test.ts` — viewer com `{financeiro}` pergunta financeiro → catálogo intersectado, LLM chamado.
- `src/lib/agent/__tests__/run-agent-shadow-still-gates.test.ts` — `routerEnabled=false`, viewer sem financeiro pergunta financeiro → tool não entra no catálogo do LLM (camada B funciona em shadow).
- `src/lib/agent/__tests__/run-agent-hallucinated-tool.test.ts` — LLM chama tool fora do catálogo (forçado via mock) → §6.3 devolve `tool_result` de erro, sem callTool real.

Setup: ts-jest (configurado em `jest.config.ts`). Prisma mockado por `jest.mock("@/lib/prisma")` no padrão dos testes existentes.

### 11.3 E2E manual (verificação obrigatória)

Seed via script `scripts/seed-rbac-v2-test.ts` (TypeScript, Prisma puro):
- `super_admin@matrix.local` (super_admin)
- `admin@matrix.local` (admin)
- `manager-est@matrix.local` (manager, só `estoque`)
- `viewer-nada@matrix.local` (viewer, sem domínio)

Senha temporária padrão (gerada no script). `npm run dev:fresh` antes.

Roteiro:
1. `viewer-nada` loga: bolha NÃO aparece; `/relatorios` redireciona; banner "Seu acesso ainda não foi configurado".
2. `manager-est` loga: bolha aparece; pergunta estoque funciona; pergunta financeiro → recusa < 500ms; `LlmUsage` sem incremento; AuditLog tem `agent_permission_denied`.
3. `admin` digita `/agente/configuracao`: layout permite (super_admin only? não, admin não passa) → redireciona para `/dashboard?denied=super_admin`, banner.
4. `manager-est` digita `/usuarios`: `/dashboard?denied=admin`, banner.
5. `manager-est` digita `/configuracao`: `/dashboard?denied=super_admin`, banner.
6. `manager-est` digita `/relatorios/saldo-produto` (estoque): renderiza OK.
7. Como super_admin, mudar manager-est para ter financeiro também. Manager pergunta financeiro de novo: agora funciona (LLM chamado).
8. `/agente/monitoramento` mostra card "Recusas por permissão" com contagem ≥ 1.
9. AuditLog: queries SQL conferindo (`SELECT * FROM audit_logs WHERE action='agent_permission_denied' ORDER BY created_at DESC LIMIT 5`).
10. `SELECT * FROM agent_router_decision WHERE outcome='permission_denied' LIMIT 5`.
11. `SELECT COUNT(*) FROM user_domain_access WHERE domain IN ('rh','producao')` = 0.
12. Regressão: super_admin perguntando qualquer coisa continua funcionando normal.

Evidências em `docs/superpowers/runs/2026-05-28-rbac-v2-e2e.md` (printscreens dos banners, queries SQL, recorte do `LlmUsage`, payloads de SSE).

## 12. Critérios de aceite (definition of done)

1. Toda tela administrativa e API route relevante tem gate server-side (`/usuarios`, `/configuracao`, `/integracoes`, `/agente`, `/relatorios`, `/api/agent/stream`, `/api/agent/suggest-continuation`, `/api/agent/transcribe`).
2. `REPORT_DOMAINS` tem exatamente 7 entradas. Teste de coerência verde.
3. Migration aplicada em dev sem erro; `outcome` em `agent_router_decision` existe; zero linhas `rh`/`producao` no fim.
4. Bolha do Nex aparece para manager/viewer com ≥1 domínio; não aparece sem nenhum.
5. Pergunta fora do acesso devolve mensagem padrão < 500ms (alvo 200ms), sem incremento em `llm_usage`.
6. `/agente/monitoramento` tem card "Recusas por permissão" populado em E2E.
7. Banners renderizam em `/dashboard` com texto humanizado quando query params batem.
8. Sanitização CPF/CNPJ comprovada em teste unitário.
9. Defesa §6.3 cobre alucinação de tool (teste integração).
10. `npm test` 100% verde; `npm run typecheck` verde; baseline atual (1968 testes) mantido ou superior.
11. `/gsd-code-review` e `/gsd-ui-review` sem severidade alta.
12. Grep de `'rh'`/`'producao'` no PR description: zero ocorrências em código de produção (migrations antigas OK).
13. `HISTORY.md` atualizado com cada commit relevante; active file deletado no fim.

## 13. Não-objetivos (YAGNI explícito)

- **Não** humaniza mensagem de recusa via LLM (follow-up).
- **Não** retroage histórico de conversa.
- **Não** muda `super_admin` vs `admin` para domínios.
- **Não** adiciona papéis novos.
- **Não** implementa permissão granular por relatório individual (continua por domínio).
- **Não** abre UI admin para "configurar texto da recusa".
- **Não** mexe nos módulos do Odoo nem na F2.
- **Não** abre tela nova "minhas permissões".
- **Não** cacheia `userAllowedDomains` em memória.
- **Não** retira `caminho3` de admin/super_admin.
- **Não** cobre `/api/mcp` externo (ApiKey-based, fora do escopo).
- **Não** mascara CPF/CNPJ formatado (regex só pega nus). MVP aceitável.

## 14. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Migration de enum trava em prod | Pré-flight + janela + rollback definido + atomicidade. |
| Usuário perde acesso a `rh`/`producao` | Pré-flight lista no PR; sem funcionalidade real perdida. |
| Fast-path falso positivo (recusa pergunta legítima) | Threshold + fallback do Router já filtram; `questionSnippet` em auditoria permite revisão. |
| LLM alucina nome de tool | §6.3 captura antes de `callTool`. |
| Tool nova sem prefixo conhecido | Teste de coerência detecta; logger.warn em dev. |
| Sanitização incompleta de CPF/CNPJ formatado | Risco aceito como MVP; ofuscações deliberadas ficam fora. |
| Hot path em `(protected)/layout.tsx` | Short-circuit `seesAll` evita query para super_admin/admin; manager/viewer aceita 1 query por hard nav. |
| Rollback perde dados de `rh`/`producao` | Backup gerado pelo pré-flight; rollback documentado. |
| Hardcode `'rh'`/`'producao'` em código novo entra depois e quebra TS | Grep prévio + Prisma generate atualizado expõem em compile time. |
| `caminho3` vazado por dupla camada mal coordenada | §6.1 colocou `caminho3` em `userAllowedDomains` para admin/super_admin; viewer/manager nunca vê. Coordenação única. |
| API route descoberta tarde | §3.3 lista todas; gate em todas as relevantes na Onda B. |

## 15. Estimativa de esforço

| Onda | Escopo | Esforço relativo |
|---|---|---|
| A | `src/lib/auth/require.ts` (4 helpers) + testes unit | S |
| B | Gate em telas (`/usuarios`, `/configuracao`, `/relatorios/layout`) + refator (`/agente`, `/integracoes`) + gate em API routes (`/api/agent/stream`, `/suggest-continuation`, `/transcribe`) + banner `/dashboard` | M |
| C | Grep + refator hardcoded + schema.prisma + migration + generate + REPORT_DOMAINS + testes coerência + pré-flight script | M |
| D | `filterCatalog` ganha `userAllowedDomains` + `computeAllowedDomains` no run-agent + testes unit das camadas | M |
| E | `permission-denial.ts` (template + sanitize + responder) + fast-path no run-agent + defesa §6.3 + bolha condicionada + atualização `outcome` no fim do turno feliz + testes integração | M |
| F | Card "Recusas por permissão" (query + componente + integração com `/agente/monitoramento`) | M |
| G | Seed E2E + roteiro manual + grep final + code review + UI review + PR | M |

Total: 7 ondas. Decomposição em microtarefas no PLAN v1.

## 16. Documentos/saídas geradas durante o sub-projeto

- `docs/superpowers/specs/2026-05-28-rbac-v2-gating-e-dominios-design.md` (esta spec, v3)
- `docs/superpowers/plans/2026-05-28-rbac-v2-gating-e-dominios-plan.md` (próximo, v3 após 2 reviews)
- `docs/superpowers/runs/2026-05-28-rbac-v2-e2e.md` (evidências E2E)
- `docs/migrations/2026-05-28-rbac-v2-snapshot.txt` (pré-flight prod)
- `scripts/2026-05-28-pre-flight-rbac-v2.sh` (pré-flight executor)
- `scripts/seed-rbac-v2-test.ts` (seed dos 4 usuários de teste)
- `prisma/migrations/<timestamp>_rbac_v2_alinhar_dominios_e_audit_router/` (SQL up + down)

## 17. Histórico de versões

- **v1 (2026-05-28):** primeira versão; perícia, catálogo unificado, matriz de gates, fast-path.
- **v2 (2026-05-28):** Review #1 aplicada (12 achados): separa shadow vs gate de permissão; fast-path independe de routerEnabled; `outcome` migration; grep prévio; remove `requireExactRole`; banner `/dashboard`; histórico exibido; sanitização CPF/CNPJ; idempotência da migration; latência alvo vs teto; reescreve §2.10; cache fica como follow-up.
- **v3 (2026-05-28):** Review #2 aplicada (11 achados materiais):
  1. `requireDomainAccess` já existia em `src/lib/reports/guard.ts` — não reinventa, apenas reutiliza para `/relatorios/[id]`.
  2. Mapeamento completo das API routes do agente (§3.3) + helper `requireAgentAccessOrJson`.
  3. Defesa §6.3 nova: validar `toolName` antes de `session.callTool()` (cobre alucinação de tool).
  4. `caminho3` vira parte explícita de `userAllowedDomains` (admin/super_admin only) em `computeAllowedDomains` — fim da dupla camada implícita BI_ROLES vs EXCLUDE_FROM_FILTERING.
  5. Short-circuit `seesAll` no `(protected)/layout.tsx` evita query para super_admin/admin.
  6. Ordem da Onda C documentada (grep → refator → schema → migrate → generate → REPORT_DOMAINS).
  7. Valores de `outcome` formalizados (§9.1) + atualização no fim do turno feliz.
  8. Seed script (`scripts/seed-rbac-v2-test.ts`) explicitado.
  9. `/api/mcp` externo (ApiKey) marcado FORA do escopo.
  10. Comportamento de mistura de domínios (§6.6) documentado.
  11. Jest setup confirmado (ts-jest, sem testcontainers); testes integração mockam Prisma no padrão atual.

SPEC v3 é a definitiva. Próximo: PLAN v1 (sobre esta v3).
