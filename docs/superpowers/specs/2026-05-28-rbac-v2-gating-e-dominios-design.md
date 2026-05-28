# SPEC v1: RBAC v2 — Gating de telas e domínios do Agente Nex

> Sub-projeto: trava de telas por papel (defesa em profundidade) + realinhamento dos domínios do cadastro de usuário à realidade do Router R1 + amarração do Agente Nex aos `UserDomainAccess` do usuário logado, com fast-path de recusa via embedding (sem chamada ao LLM) quando a pergunta cai em domínio fora de acesso.

- **Branch alvo:** `feat/rbac-v2-gating-e-dominios` (criar a partir de `main`, depois que o R1 atual mergear; até lá, base `feat/router-catalogo-r1`).
- **Autor:** claude-revisao-usuarios-permissoes
- **Data:** 2026-05-28
- **Versão da spec:** v1 (a v2 e v3 sairão das duas reviews adversariais).
- **Skill aplicada:** `superpowers:brainstorming` → modo autônomo total (usuário dispensou perguntas intermediárias em 2026-05-28 13:30).

---

## 1. Por que esta spec existe

Hoje a plataforma já tem RBAC (4 papéis `super_admin`/`admin`/`manager`/`viewer` + flag `isOwner`) e um cadastro de domínios por usuário (`UserDomainAccess` apontando para `REPORT_DOMAINS`). Mas três problemas concretos:

1. **Defesa em profundidade falha.** Só `/agente/*` e `/integracoes/*` rejeitam server-side quem não é super_admin. As demais telas administrativas (`/usuarios`, `/configuracao`) e `/relatorios` confiam apenas no filtro da sidebar (`filterNav`), que é UI. Quem digitar `/usuarios` na barra de endereço sendo `manager` recebe a página renderizada (mesmo que server actions abaixo rejeitem).
2. **Cadastro de domínios desatualizado.** `REPORT_DOMAINS` lista 9 domínios (estoque, financeiro, fiscal, comercial, cadastros, contábil, rh, crm, producao), mas o Router R1 e o servidor MCP só implementam 7 (sem `rh` e `producao`). O cadastro pode conceder acesso a domínios fantasmas que não correspondem a tool nem a relatório.
3. **Agente Nex ignora permissão de domínio.** O `filterCatalog` do Router R1 filtra o catálogo entregue ao LLM pelos domínios que o próprio Router escolheu (similaridade semântica da pergunta), mas **não cruza** com `UserDomainAccess` do usuário logado. Pior: a bolha do Nex (`AgentBubble` em `(protected)/layout.tsx`) hoje só aparece para `super_admin` e `admin` — `manager` e `viewer` não têm chat algum. A regra que o usuário pediu (Nex respeita os módulos concedidos) hoje simplesmente não existe.

A SPEC corrige os três problemas em um único sub-projeto porque eles são interdependentes: redefinir os domínios sem amarrar no agente seria gastar fôlego à toa; amarrar o agente sem realinhar os domínios deixaria buracos lógicos (conceder acesso a "rh" que não existe).

## 2. Decisões canônicas desta spec

Decisões tomadas pelo Claude em modo autônomo, sustentadas pela perícia da §3. Ficam congeladas como "decisões da spec" — só mudam se uma review adversarial provar que estão erradas.

1. **Hierarquia de papéis NÃO muda.** Continua `super_admin > admin > manager > viewer`, com `isOwner` como flag complementar. Quem confirmou: usuário verbatim em 2026-05-28, "essas regras que você me mencionou e como você me descreveu, é isso mesmo, desse jeito tem que funcionar".
2. **Domínios passam a espelhar 1:1 o vocabulário do Router R1.** `rh` e `producao` saem (e linhas em `UserDomainAccess` que apontavam para eles são deletadas). Os domínios reais ficam: `cadastros`, `comercial`, `contabil`, `crm`, `estoque`, `financeiro`, `fiscal`. O cadastro de usuário e o catálogo do Router falam exatamente a mesma língua.
3. **Defesa em profundidade obrigatória em toda tela administrativa.** O filtro da sidebar (`filterNav`) é mantido como UX (não mostrar o que a pessoa não acessa), mas cada layout/rota administrativa ganha um gate server-side com `redirect("/dashboard")` quando o papel é insuficiente. O helper canônico é `requireMinRole(role)` em `src/lib/auth/require.ts` (novo arquivo).
4. **O Agente Nex passa a ser disponível para todos os papéis autenticados**, com catálogo filtrado pelos domínios concedidos. `super_admin` e `admin` continuam vendo o catálogo inteiro (`seesAll`). `manager` e `viewer` veem o catálogo intersectado com `UserDomainAccess`. Usuário sem nenhum domínio concedido NÃO recebe bolha (volta o comportamento atual de "nada na bubble", mas agora baseado em `visibleDomains` vazio, não em papel).
5. **Fast-path de recusa via embedding, sem LLM.** Quando o Router R1 detecta que a pergunta cai inteiramente em domínio(s) NÃO permitido(s) ao usuário, o turno é encerrado com mensagem padrão pré-fabricada, antes de chamar o LLM. Custo: 0 tokens. Latência: ~50ms (só embedding do Router).
6. **Resposta padrão é template puro no MVP.** Texto humanizado, parametrizado pelos domínios negados e pelos domínios disponíveis ao usuário. Humanização adicional via LLM fica como follow-up (não entra neste sub-projeto). Filosofia do usuário: "código resolve o que dá; manda mastigado pro LLM".
7. **Tools transversais ficam sempre disponíveis.** `caminho3` (BI livre) e `dominios-vazios` (responder "ainda não temos") já são `excludeFromFiltering: true` no Router. Continua assim. `caminho3` segue restrito a `super_admin`/`admin` no `run-agent.ts` (já é).
8. **Histórico de conversa não é retroativo.** Mudança de permissão depois da conversa NÃO afeta mensagens passadas (auditoria limpa). Próximas perguntas passam a respeitar o novo estado.
9. **Auditoria registra cada recusa.** Novo `AuditAction.agent_permission_denied` em `AuditLog`. Captura `userId`, `deniedDomains`, `askedSnippet` (primeiros 200 chars da pergunta), `routerDecisionId` (para correlacionar com `agent_router_decision`).
10. **Migração de dados é manual via SQL com janela.** Drop dos enums `rh` e `producao` exige `DELETE` prévio em `UserDomainAccess`. Migration Prisma gera o DDL, mas a deleção das linhas é parte da mesma migration (SQL puro embutido).
11. **Plugar MCPs, Integrações e Configuração permanecem `super_admin` only.** Não há mudança de política aqui, apenas formalização do gate via `requireMinRole`.

## 3. Realidade atual (perícia 2026-05-28)

Realidade vs. cadastro de domínios:

| Domínio em `REPORT_DOMAINS` | Existe no Router R1? | Tem tools MCP? | Tem relatório? | Veredito |
|---|---|---|---|---|
| estoque | sim | sim (`mcp/tools/estoque`) | sim (6 relatórios) | mantém |
| financeiro | sim | sim (`mcp/tools/financeiro`) | não (F4 onda 2 pendente) | mantém |
| fiscal | sim | sim (`mcp/tools/fiscal`) | não (F4 onda 2) | mantém |
| comercial | sim | sim (`mcp/tools/comercial`) | não | mantém |
| cadastros | sim | sim (`mcp/tools/cadastros`) | não | mantém |
| contabil | sim | sim (`mcp/tools/contabil`) | não | mantém |
| crm | sim | sim (`mcp/tools/crm`) | não | mantém |
| rh | **NÃO** | apenas placeholder em `dominios-vazios` | não | **REMOVE** |
| producao | **NÃO** | apenas placeholder em `dominios-vazios` | não | **REMOVE** |

Mais 2 entradas no Router R1 (não são domínios de negócio, são escape hatch técnico, não vão pro cadastro):
- `caminho3` (BI livre, super_admin/admin only)
- `dominios-vazios` (responder "ainda não temos")

Rotas protegidas que existem e seu gate atual:

| Rota | Papel mínimo conceitual | Gate hoje | Falta gate? |
|---|---|---|---|
| `/dashboard` | autenticado | só auth global | OK |
| `/perfil`, `/perfil/trocar-senha` | autenticado | só auth global | OK |
| `/relatorios`, `/relatorios/[id]` | autenticado (conteúdo filtrado por domínio) | só auth global | OK estrutural, mas precisa gate quando `visibleDomains` é vazio |
| `/usuarios` | admin+ | só sidebar | **falta** redirect server-side |
| `/configuracao` | super_admin | só sidebar | **falta** redirect server-side |
| `/integracoes` (e subrotas: `api`, `bi`, `canais`, `canais/whatsapp`, `servidor-mcp/*`, `webhooks`) | super_admin | `layout.tsx` já redireciona | OK |
| `/agente` (e 8 sub-telas) | super_admin | `layout.tsx` já redireciona | OK |

## 4. Catálogo unificado de domínios

Após esta spec, `REPORT_DOMAINS` em `src/lib/reports/domains.ts` deixa de ser a fonte da verdade independente e passa a derivar do Router R1. Decisão técnica: como o enum `ReportDomain` é Prisma (precisa ser estático no schema), o caminho é alinhar manualmente os dois e adicionar um teste de coerência:

- Enum Prisma `ReportDomain` perde `rh` e `producao`.
- `REPORT_DOMAINS` (UI labels) perde `rh` e `producao`.
- Novo teste em `src/lib/reports/domains.test.ts` (ou `src/lib/agent/router/domain-vocabulary.test.ts`): garante que `REPORT_DOMAINS.map(d => d.id)` é subconjunto de `DOMAINS.map(d => d.domain)` (Router pode ter `caminho3`/`dominios-vazios` que cadastro não tem, mas todo domínio do cadastro precisa estar no Router).

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

Ordem alfabética dos `id` (já é como está hoje minus `rh`/`producao`).

## 5. Matriz de gating das telas

Novo helper canônico: `requireMinRole(minRole: PlatformRole): Promise<AuthUser>` em `src/lib/auth/require.ts`. Funciona assim:

```text
const user = await requireMinRole("admin");
// Se user.platformRole tem hierarquia >= admin, retorna user.
// Caso contrário, redirect("/dashboard"). Se não autenticado, redirect("/login").
```

A hierarquia já existe em `PLATFORM_ROLE_HIERARCHY` (super_admin=4, admin=3, manager=2, viewer=1).

Aplicação:

| Rota | Layout/page que ganha gate | Helper |
|---|---|---|
| `/usuarios` | `src/app/(protected)/usuarios/page.tsx` (server component) ou novo `layout.tsx` | `await requireMinRole("admin")` |
| `/configuracao` | `src/app/(protected)/configuracao/page.tsx` ou novo `layout.tsx` | `await requireMinRole("super_admin")` |
| `/integracoes/*` | já tem layout próprio, **refatora para usar `requireMinRole`** | `await requireMinRole("super_admin")` |
| `/agente/*` | já tem layout próprio, **refatora para usar `requireMinRole`** | `await requireMinRole("super_admin")` |
| `/relatorios`, `/relatorios/[id]` | server component existente | `await requireDomainsOrRedirect()` (helper extra, ver §6) |

Os layouts antigos do `/agente` e `/integracoes` deixam de ter código de redirect inline e passam a chamar o helper. Reduz duplicação e cria um único ponto de manutenção.

## 6. Helpers de gating em `src/lib/auth/require.ts`

Novo módulo. Três funções puras (testáveis sem Next):

- `requireAuth(): Promise<AuthUser>` — `redirect("/login")` se não autenticado.
- `requireMinRole(min: PlatformRole, redirectTo = "/dashboard"): Promise<AuthUser>` — chama `requireAuth`, depois compara `PLATFORM_ROLE_HIERARCHY[user.platformRole] >= PLATFORM_ROLE_HIERARCHY[min]`. Falha → `redirect(redirectTo)`.
- `requireExactRole(role: PlatformRole, redirectTo = "/dashboard"): Promise<AuthUser>` — versão estrita (usada pouco; mantém porque pode ser útil).
- `requireDomainsOrRedirect(redirectTo = "/dashboard"): Promise<{ user: AuthUser; domains: ReportDomainId[] }>` — útil em `/relatorios`: chama `requireAuth`, busca `visibleDomains(user.platformRole, granted)`, se for vazio (manager/viewer sem domínio concedido), redireciona com toast/query param (`?error=no_domains`).

Os helpers exigem `getCurrentUser()` (já existe em `src/lib/auth.ts`), `PLATFORM_ROLE_HIERARCHY` (já em `src/lib/constants/roles.ts`) e `redirect` (`next/navigation`).

Cada helper recebe testes unitários cobrindo: hierarquia, fallback, mock de `redirect` (vitest spy).

## 7. Gate de domínios do Agente Nex

### 7.1 `filterCatalog` ganha `allowedDomains`

Assinatura nova de `filterCatalog`:

```text
filterCatalog({
  allTools,
  decision,
  routerEnabled,
  userAllowedDomains, // novo: Set<string> | "all"
})
```

Regras (em ordem):

1. **`userAllowedDomains === "all"`** (super_admin, admin): comporta como hoje. Se `routerEnabled=false` ou fallback, catálogo inteiro. Senão, filtro por `pickedDomains + excludeFromFiltering + UNKNOWN_DOMAIN`.
2. **`userAllowedDomains` é set não vazio** (manager/viewer com pelo menos 1 domínio):
   - `effectiveAllowed = userAllowedDomains ∪ EXCLUDE_FROM_FILTERING ∪ UNKNOWN_DOMAIN`.
   - Quando `routerEnabled=false` ou fallback: ainda corta pelo `effectiveAllowed`. O usuário NUNCA vê tool de domínio fora do acesso, independente do estado do router.
   - Quando router ativo + sem fallback: `effective = (pickedDomains ∩ effectiveAllowed) ∪ EXCLUDE_FROM_FILTERING ∪ UNKNOWN_DOMAIN`.
   - Se `pickedDomains` tem itens, **mas a interseção com `userAllowedDomains` é vazia** (sem nenhum domínio do usuário casando com a pergunta) → fast-path de recusa (§7.2).
3. **`userAllowedDomains` é set vazio** (manager/viewer sem nenhum domínio concedido): a bolha do Nex nem aparece (`(protected)/layout.tsx` decide). Se cair em `/api/agent/stream` por força bruta (ex.: alguém colando curl), `runAgent` rejeita com `DENIED_NO_DOMAINS` antes de qualquer chamada de embedding ou LLM.

### 7.2 Fast-path de recusa sem LLM

Implementado em `src/lib/agent/run-agent.ts`, imediatamente após a chamada de `pickDomains`:

```text
if (userAllowedDomains !== "all"
    && routerDecision.pickedDomains.length > 0
    && !routerDecision.fallback.triggered) {
  const intersected = routerDecision.pickedDomains.filter(d =>
    userAllowedDomains.has(d) || EXCLUDE_FROM_FILTERING.has(d)
  );
  if (intersected.length === 0) {
    const deniedDomains = routerDecision.pickedDomains.filter(d =>
      !EXCLUDE_FROM_FILTERING.has(d)
    );
    return await respondPermissionDenied({
      conversationId,
      user,
      deniedDomains,
      availableDomains: [...userAllowedDomains],
      routerDecisionId,
      userQuestion: args.userMessage,
    });
  }
}
```

`respondPermissionDenied` é nova, vive em `src/lib/agent/permission-denial.ts`:

- Persiste a mensagem do usuário (já estava sendo persistida).
- Persiste a mensagem de assistant com o texto do template (§7.3).
- Loga em `AuditLog` com `action: "agent_permission_denied"`.
- Atualiza o `agent_router_decision` correspondente com `outcome: "permission_denied"` (novo campo nullable em `AgentRouterDecision`).
- Não chama LLM nem MCP. Retorna `ChatResult` com `text`, `usage: { input: 0, output: 0, ... costKnown: true, costUsd: 0 }`.

Latência alvo: < 100ms (só I/O de banco + retorno).

### 7.3 Template da resposta padrão

Template puro pt-br, sem travessão, definido em `src/lib/agent/permission-denial.ts`:

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

`formatDomainList` converte ids para labels humanizados (`["financeiro", "fiscal"]` → `"Financeiro e Fiscal"`; 3+ vira `"X, Y e Z"`). Usa `REPORT_DOMAINS` para o mapeamento.

### 7.4 Bolha do Nex liberada para manager/viewer

`src/app/(protected)/layout.tsx` muda a condição `canUseAgent`:

```text
const granted = await getUserDomains(user.id);
const visible = visibleDomains(user.platformRole, granted);
const canUseAgent = visible.length > 0; // super_admin/admin: sempre true
```

A flag `bubbleEnabled` (`AgentSettings`) continua valendo como kill-switch global. `isSuperAdmin` na bolha continua sendo passado para os ajustes admin-only do chat panel.

### 7.5 Tools transversais

`EXCLUDE_FROM_FILTERING` no Router R1 já cobre `caminho3` e `dominios-vazios`. Esta spec mantém. `caminho3` continua filtrado adicionalmente em `run-agent.ts` por `BI_ROLES` (super_admin/admin). Sem mudança.

Se aparecer tool com prefixo desconhecido (não casa com nenhum `KNOWN_DOMAIN`), `getToolDomain` retorna `_desconhecido` e a tool fica sempre disponível (já era). Mantém.

## 8. Mudanças no cadastro de usuário

Componentes afetados:

- `src/components/users/access-step.tsx` — checkboxes dos domínios. Já lê `REPORT_DOMAINS` direto, então a remoção de `rh`/`producao` no `domains.ts` propaga sozinha. Adicionar microcopy explicativo: "Estes módulos definem o que o usuário pode ver em Relatórios e perguntar ao Agente Nex." (mudança mínima de UX que reflete o novo papel do cadastro).
- `src/components/users/user-form-dialog.tsx` — sem mudança estrutural; é o consumidor.
- `src/lib/actions/domain-access.ts` — `updateUserDomains` já valida via `grantableDomains` e `canEditUser`. Sem mudança lógica. Só ganha `audit_log` enriquecido (mas isso é cosmético, é o que já existe).
- `src/lib/reports/domains.ts` — `REPORT_DOMAINS` perde 2 entradas; `visibleDomains` e `grantableDomains` não mudam (são puras).
- `prisma/schema.prisma` — enum `ReportDomain` perde `rh` e `producao`.
- `prisma/migrations/<timestamp>_drop_dominios_rh_producao` — DDL: deleta linhas em `UserDomainAccess` com domínio em (`rh`, `producao`), depois `ALTER TYPE report_domain RENAME TO report_domain_old; CREATE TYPE report_domain AS ENUM (...); ALTER TABLE ... USING ...::text::report_domain; DROP TYPE report_domain_old;`. Pattern de remoção de valor de enum em Postgres.

## 9. Migração de dados

A migração de enum no Postgres é destrutiva. Sequência:

1. **Backup automático.** A migration grava em `docs/migrations/2026-05-28-rbac-v2-backup.sql` um snapshot das linhas que serão deletadas (`SELECT user_id, domain, granted_by_id FROM user_domain_access WHERE domain IN ('rh', 'producao')`). Arquivo entra no commit junto da migration.
2. **`DELETE FROM user_domain_access WHERE domain IN ('rh', 'producao')`** dentro da migration.
3. **Recriação do enum** (pattern Postgres descrito acima).
4. **Audit log automático**: a migration insere um `audit_logs` com `action: "user_domains_changed"`, `target_id` = cada userId afetado, `details: { removed: ['rh'], reason: 'rbac_v2_alignment' }`. Garante rastreabilidade.

Em produção, antes do merge: rodar `SELECT user_id, domain FROM user_domain_access WHERE domain IN ('rh', 'producao')` para saber se há impacto real. Se houver, comunicar usuários afetados (são manager/viewer com acesso fantasma — não perdem nada real).

## 10. Auditoria e métricas

Novo enum value:

```text
enum AuditAction {
  ...
  agent_permission_denied
}
```

Cada recusa do Nex gera uma linha. Detalhe:

```text
{
  action: "agent_permission_denied",
  userId: user.id,
  targetType: "AgentRouterDecision",
  targetId: routerDecisionId,
  details: {
    deniedDomains: ["financeiro"],
    availableDomains: ["estoque", "comercial"],
    questionSnippet: "primeiros 200 chars",
    routerVersion: "r1.0.0.0-<hash>",
  }
}
```

Métrica nova em `/agente/monitoramento`: card "Recusas por permissão", contagem em janelas (24h / 7d / 30d), drill-down por domínio negado. Implementação: nova query `getPermissionDenialStats(period)` em `src/lib/actions/agent-router.ts` (ou novo arquivo `agent-permission-denials.ts`). UI: novo componente em `src/components/agent/router/permission-denials-card.tsx`.

## 11. Edge cases

| Cenário | Comportamento |
|---|---|
| Owner com `platformRole = viewer` (improvável mas possível) | Owner é flag complementar. `seesAll(role)` ignora `isOwner` hoje. Mantém: owner não-super tem domínios concedidos como qualquer outro. Pode ser revisto fora desta spec. |
| Manager sem nenhum domínio concedido | Bolha do Nex não aparece. `/relatorios` redireciona com `?error=no_domains`. |
| Viewer sem nenhum domínio concedido | Mesmo do manager. |
| Super_admin sem nenhum domínio (impossível por `seesAll`, mas...) | `seesAll` força `["all"]`. Não afeta. |
| Usuário troca `platformRole` durante conversa em curso | Próxima requisição já pega o novo papel (stateless). Conversa em si continua salva. |
| Usuário perde domínio durante conversa | Mesma coisa. Próxima mensagem respeita. Histórico fica. |
| Router retorna `fallback.triggered = true` (mensagem trivial, embedding falhou) | Fast-path NÃO dispara. Catálogo intersecciona apenas com `userAllowedDomains` (item 2 da §7.1), LLM responde normalmente. |
| Tool sem prefixo conhecido | Domínio = `_desconhecido`, sempre incluída. Mantém comportamento conservador atual. |
| `caminho3` para viewer/manager | Continua não disponível (BI_ROLES). Não muda nada. |
| Pergunta sobre vários domínios, alguns permitidos outros não | Não dispara fast-path. Filtra tools (manter só as permitidas) e LLM responde com o que tem. O prompt ganha hint opcional: "Tools indisponíveis ao usuário foram omitidas." (descreve, não vaza nomes). |
| Usuário com `caminho3` desliga via kill-switch global do Router | Kill-switch desativa o filtro do Router (catálogo inteiro). Combinado com a regra "sempre corta por `userAllowedDomains`" do item 2 da §7.1, o usuário NÃO ganha tool fora do acesso. Defesa em profundidade preservada. |

## 12. Plano de testes

### Unidade
- `src/lib/auth/require.test.ts` — `requireMinRole`, `requireExactRole`, `requireDomainsOrRedirect` com mock de `redirect`.
- `src/lib/agent/router/filter-catalog.test.ts` — adiciona casos com `userAllowedDomains`: `"all"`, set vazio, interseção parcial, interseção nula.
- `src/lib/agent/permission-denial.test.ts` — template com 0/1/N domínios disponíveis, audit log gerado, costUsd zero.
- `src/lib/reports/domains.test.ts` — `REPORT_DOMAINS` é subconjunto de Router `DOMAINS`.

### Integração
- `src/lib/agent/__tests__/run-agent-permission-denied.test.ts` — runAgent com viewer + domínio negado → não chama LLM, persiste mensagem, gera audit_log, atualiza router_decision.
- `src/lib/agent/__tests__/run-agent-permission-allowed.test.ts` — viewer com financeiro concedido pergunta financeiro → catálogo intersectado, LLM chamado normalmente.

### E2E manual (verificação obrigatória pelo CLAUDE.md)
- Subir dev (`npm run dev:fresh`), criar 4 usuários:
  - `super_admin@matrix.local` (super_admin, sem domínios — herda todos)
  - `admin@matrix.local` (admin, sem domínios — herda todos)
  - `manager-est@matrix.local` (manager, só `estoque`)
  - `viewer-nada@matrix.local` (viewer, sem nada)
- Validações:
  1. `viewer-nada` loga: bolha do Nex não aparece; `/relatorios` redireciona.
  2. `manager-est` loga: bolha aparece; pergunta sobre estoque funciona; pergunta sobre financeiro recebe recusa instantânea (< 200ms), sem custo de LLM em `LlmUsage`.
  3. `admin` digita `/agente/configuracao`: layout redireciona para `/dashboard` (refatorado pelo `requireMinRole`).
  4. `manager-est` digita `/usuarios` na URL: redireciona para `/dashboard` (gate novo).
  5. AuditLog tem 1 linha de `agent_permission_denied` por recusa.
  6. `/agente/monitoramento` mostra contador de recusas.
- Documentar passo a passo em `docs/superpowers/runs/2026-05-28-rbac-v2-e2e.md`.

## 13. Critérios de aceite (definition of done)

1. Toda tela administrativa tem gate server-side. Verificado por teste manual + grep no diff (cada `/usuarios`, `/configuracao`, `/integracoes`, `/agente` tem `requireMinRole` ou layout equivalente).
2. `REPORT_DOMAINS` tem exatamente 7 entradas. Teste de coerência com Router R1 verde.
3. Migration aplicada em dev sem erro; `SELECT COUNT(*) FROM user_domain_access WHERE domain IN ('rh', 'producao')` retorna 0 depois.
4. Bolha do Nex aparece para manager/viewer com pelo menos 1 domínio; não aparece sem nenhum.
5. Pergunta sobre domínio fora do acesso devolve mensagem padrão em < 200ms, sem incremento em `llm_usage`.
6. `/agente/monitoramento` tem card "Recusas por permissão" com dados de teste.
7. Sem regressão: bateria `npm test` 100% verde; `npm run typecheck` verde; baseline atual de testes (1968) mantido ou superior.
8. Code review (`/gsd-code-review`) e UI review (`/gsd-ui-review`) sem severidade alta.

## 14. Não-objetivos (YAGNI explícito)

- **Não** implementa humanização da mensagem de recusa via LLM (fica como follow-up).
- **Não** retroativa histórico de conversa (mudança de permissão não muda passado).
- **Não** mexe na lógica de `super_admin` vs `admin` para domínios (ambos continuam vendo tudo).
- **Não** adiciona novos papéis (`super_admin`/`admin`/`manager`/`viewer` continua sendo o universo).
- **Não** unifica `UserDomainAccess` com permissões granulares por relatório individual. O domínio continua sendo a granularidade.
- **Não** implementa configuração admin "qual o texto da recusa por domínio". Template é estático no MVP.
- **Não** mexe nos módulos do Odoo nem na F2 de ingestão (descoberta de dados continua separada).
- **Não** abre tela nova para "ver minhas permissões": o `/perfil` poderia ganhar isso depois, mas não é desta spec.
- **Não** implementa permissão por relatório individual (granularidade segue por domínio).

## 15. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Migration de enum em prod trava se houver lock concorrente | Migration roda em janela; testar antes em staging; pattern de recriação de enum sequencial; rollback via `down.sql` (também gerado). |
| Usuário existente perde acesso a `rh`/`producao` e reclama | Comunicação prévia: rodar `SELECT` em prod antes do merge, listar usuários afetados, comunicar que não havia funcionalidade ligada a esses domínios. |
| Fast-path de recusa marca falso positivo (recusa pergunta legítima) | `pickedDomains` do Router já tem threshold + fallback. Se score baixo, fallback dispara e o fast-path não executa. Adicional: log `questionSnippet` permite auditar a recusa depois. |
| LLM consegue chamar tool de domínio negado por nome direto (alucinação) | `filterCatalog` corta a tool do catálogo entregue ao LLM. Se LLM alucinar nome de tool, MCP retorna `unknown tool`. Defesa pelo dispatch. |
| Helper `requireMinRole` quebra layouts existentes | Refator é gradual: `/agente` e `/integracoes` já têm o padrão inline; refator copia comportamento e adiciona testes. `/usuarios` e `/configuracao` são adições puras (não há código que possa quebrar). |
| Audit logs explodem se LLM externo bombardear `/api/agent/stream` | Rate limit existente no endpoint segura; `agent_permission_denied` reusa a mesma proteção. |

## 16. Estimativa de esforço

| Onda | Escopo | Esforço relativo |
|---|---|---|
| A | Helper `requireMinRole` + testes | S |
| B | Gate em `/usuarios` e `/configuracao` + refator de `/agente` e `/integracoes` | S |
| C | `REPORT_DOMAINS` alinhado + migration + audit prévio | M |
| D | `filterCatalog` com `allowedDomains` + testes | M |
| E | `permission-denial.ts` + run-agent fast-path + bolha gate em (protected)/layout | M |
| F | Card "Recusas por permissão" em `/agente/monitoramento` | M |
| G | Testes integração + E2E manual + code/UI review + PR | M |

Total: ~7 ondas. Microtarefas saem do PLAN v1.

## 17. Histórico de versões

- v1 (2026-05-28): primeira versão. Capturou perícia, definiu catálogo unificado, matriz de gates, fast-path. Aguarda Review #1 adversarial.
