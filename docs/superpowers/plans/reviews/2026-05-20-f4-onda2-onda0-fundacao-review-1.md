# Review Crítica #1 — Plan v1 da Onda 0 (F4 Onda 2)

> **Reviewer:** Claude Opus 4.7 (adversarial mode)
> **Plano alvo:** `docs/superpowers/plans/2026-05-20-f4-onda2-onda0-fundacao.md` v1
> **Data:** 2026-05-20
> **Postura:** Auditoria adversarial. Caçar **tasks grandes demais** (não-bite-sized), **placeholders**, **referências inconsistentes**, **steps faltando**, **ordem errada**, **dependências não declaradas**. Se não achar nada material, falhou.

## Resumo Executivo

V1 tem boa estrutura macro (17 blocos, sequência lógica). Porém:

- **5 tasks excessivamente grandes** (não-bite-sized) — precisam decomposição.
- **8 placeholders e "implementar com" sem código** — violação direta do writing-plans.
- **6 dependências não declaradas entre tasks** (ordem importa, plano não explicita).
- **4 referências a arquivos/funções inexistentes** ou não definidas no plano.
- **3 gaps de cobertura** vs spec v3.
- **2 commits atômicos questionáveis** (commits grandes demais; precisariam quebrar).

**Total: 28 itens acionáveis.**

Conclusão: aplicar achados → produzir **Plan v2**.

---

## A. Tasks grandes demais (não-bite-sized) (5)

Writing-plans: "Each step is one action (2-5 minutes)". Tasks abaixo escondem múltiplas unidades.

### A1. Task K2 (Componente VisaoGeralCard)

**Onde:** Bloco K Task K2 — "Componente VisaoGeralCard com fetch do health" tem ~6 elementos visuais (URL, status, transport, versão, métricas) — cada um é uma unidade.

**Correção v2:** Decompor em:
- K2.1: card básico com URL pública (copy-to-clipboard)
- K2.2: status badge com cores (alimentado pelo health)
- K2.3: transport + versão do protocolo (badges informativos)
- K2.4: versão do servidor
- K2.5: métricas 24h (delega para K3 server action)

### A2. Task L3 (NovaChaveDialog com matriz)

**Onde:** Bloco L Task L3 — "Formulário com Label/descrição/Tenant/Matriz/Confirmação/Rate limit/Expiração/allowedOrigins" — 8 campos diferentes.

**Correção v2:** Decompor em:
- L3.1: form base (Label, descrição, tenant selector)
- L3.2: matriz de capabilities (sub-componente próprio)
- L3.3: confirmação dupla para ações sensíveis (modal de confirmação)
- L3.4: rate limit slider
- L3.5: expiração date picker
- L3.6: allowedOrigins (lista editável de strings)
- L3.7: submit handler + integração com TokenRevealDialog

### A3. Task L5 (Editar/Rotacionar/Revogar/Marcar perdida)

**Onde:** Bloco L Task L5 — 4 server actions diferentes + 1 dialog component.

**Correção v2:** Uma task por server action + uma task para o dialog:
- L5.1: server action `updateApiKey` + test
- L5.2: server action `rotateApiKey` + test
- L5.3: server action `revokeApiKey` + test
- L5.4: server action `markLostAndRegenerate` + test
- L5.5: componente `EditarChaveDialog`
- L5.6: integração no menu de ações da lista de chaves

### A4. Task N5 (Layout da tab Documentação)

**Onde:** Bloco N Task N5 — "Sidebar com seções, conteúdo MDX, syntax highlighting, busca Cmd+K" — 4 features.

**Correção v2:**
- N5.1: layout base com sidebar de seções
- N5.2: renderização de MDX (next-mdx-remote ou similar)
- N5.3: syntax highlighting via Shiki (instalar lib, configurar)
- N5.4: busca interna (Cmd+K, lista por nome de tool/erro)

### A5. Task O1 (Mover "Plugar MCPs")

**Onde:** Bloco O Task O1 — "verificar active, comunicar mudança, atualizar sidebar, migrar rotas e componentes".

**Correção v2:**
- O1.1: coordenação multi-agente (ler active/, comunicar se há overlap)
- O1.2: criar nova rota `src/app/(protected)/agente/plugar-mcps/`
- O1.3: mover componentes e conteúdo da rota antiga
- O1.4: atualizar `sidebar.tsx` (remover de Integrações + adicionar em Agente Nex)
- O1.5: remover rota antiga `src/app/(protected)/integracoes/mcp/`
- O1.6: validar navegação (rodar dev server, clicar)

---

## B. Placeholders / "implementar com" sem código (8)

Writing-plans: "Complete code in every step — if a step changes code, show the code". Itens abaixo violam.

### B1. Task C1 — código da interface OK; implementação `createOdooClient` ausente

**Onde:** Bloco C Task C1 mostra apenas a interface. A função `createOdooClient` que será chamada nos testes C2+ não tem assinatura nem stub.

**Correção v2:** Adicionar em C1:
```typescript
// Stub a ser preenchido nas tasks C2-C7
export function createOdooClient(config: OdooConfig): OdooWriteClient {
  // implementação completa nas tasks subsequentes
  throw new Error("not implemented yet");
}
```
E em cada task C2-C7, mostrar a versão completa após implementação (não só "implementar X").

### B2. Task F1 — referência a `WriteToolEntry` mas não mostra código integralmente

**Onde:** Bloco F Task F1 — "Adicionar WriteToolEntry e WriteToolHandlerCtx conforme spec §5.1" sem o código repetido.

**Correção v2:** Repetir o código da spec §5.1 no próprio plano (engenheiro pode ler tasks fora de ordem; não pode ser obrigado a buscar na spec).

### B3. Task H2 — código do worker incompleto

**Onde:** Bloco H Task H2 mostra tests mas não a implementação. "Implementar com upsert via Prisma para os modelos raw_* aplicáveis" é vago.

**Correção v2:** Mostrar código completo:
```typescript
// src/worker/sync/directed.ts
import { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import type { DirectedSyncJob } from "@/mcp/sync/queue";
import { acquireLock, releaseLock } from "@/mcp/lib/distributed-lock";

export async function processDirectedSync(job: Job<DirectedSyncJob> | DirectedSyncJob, deps?: { odoo?: OdooWriteClient }): Promise<void> {
  const data: DirectedSyncJob = "data" in (job as Job) ? (job as Job).data : (job as DirectedSyncJob);
  const { model, ids, operation, snapshotAfter, requestId, apiKeyId } = data;
  for (const id of ids) {
    const lockKey = `mcp:sync:${model}:${id}`;
    const got = await acquireLock(redis, lockKey, { ttlSec: 30 });
    if (!got) continue;  // outro worker está cuidando
    try {
      if (operation === "delete") {
        if (model === "res.partner") await prisma.rawResPartner.delete({ where: { id } });
      } else {
        const data = snapshotAfter ?? (await deps!.odoo!.read(model, [id], ["id", /* ... */]))[0];
        if (model === "res.partner") {
          await prisma.rawResPartner.upsert({
            where: { id },
            create: data as any,
            update: data as any,
          });
        }
      }
    } finally {
      await releaseLock(redis, lockKey);
    }
  }
}
```

### B4. Task I1 — checks têm "ajustar quando houver mais tabelas"

**Onde:** Bloco I Task I1 — `cache_freshness_seconds` "ajustar quando houver mais tabelas". Placeholder.

**Correção v2:** Trocar para implementação concreta na Onda 0:
```typescript
async function cacheFreshness(): Promise<number> {
  // Onda 0: apenas raw_res_partner. Ondas seguintes adicionam.
  const latest = await prisma.rawResPartner.aggregate({ _max: { updatedAt: true } });
  if (!latest._max.updatedAt) return 0;
  return Math.floor((Date.now() - latest._max.updatedAt.getTime()) / 1000);
}
```

### B5. Task J2 — "ConflictError class em mcp/lib/errors.ts (a criar)"

**Onde:** Bloco J Task J2.

**Correção v2:** Criar uma sub-task J2.0 antes:
```typescript
// mcp/lib/errors.ts
export class ConflictError extends Error {
  constructor(message: string, public details?: object) { super(message); this.name = "ConflictError"; }
  code = "conflict" as const;
  httpStatus = 409;
}
export class CapabilityMissingError extends Error { /* ... */ }
export class TokenInUnsafeLocationError extends Error { /* ... */ }
// ... cada errorCode da §Anexo C da spec
```

### B6. Task K3 — server action métricas com `// p50/p99 via PERCENTILE_CONT (raw SQL)`

**Onde:** Bloco K Task K3 — placeholder de SQL.

**Correção v2:** Mostrar o SQL completo:
```typescript
const latencyStats = await prisma.$queryRaw<Array<{ p50: number; p99: number }>>`
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
  FROM mcp_audit_logs
  WHERE created_at >= ${since} AND status = 'success'
`;
```

### B7. Task L2 — `getCurrentSuperAdminId` referenciado sem definição

**Onde:** Bloco L Task L2 — usa `getCurrentSuperAdminId()` sem mostrar o que é.

**Correção v2:** Substituir por código real:
```typescript
import { auth } from "@/auth";
async function requireSuperAdmin(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "super_admin") {
    throw new Error("forbidden");
  }
  return session.user.id;
}
// usar requireSuperAdmin() em todas as actions
```

### B8. Task N4 — "exemplos opcionais por tool" — onde definidos?

**Onde:** Bloco N Task N4.

**Correção v2:** Definir contrato:
- Cada `ToolEntry` ganha campo opcional `examples?: Array<{ language: "curl" | "n8n" | "python" | "javascript"; code: string; description?: string }>` (adicionar em F1 do `WriteToolEntry`).
- POC `crm.res_partner.create` traz 4 exemplos (1 por linguagem) na Task J2.

---

## C. Dependências não declaradas (6)

Plano lista blocos sequenciais mas algumas tasks dentro de blocos posteriores dependem de coisas de blocos anteriores **não-fechadas**.

### C1. Task B6 (test tipos Prisma) depende de `@/generated/prisma/client` ter sido regenerado

**Correção v2:** Adicionar step explícito antes do test: `npx prisma generate`.

### C2. Task D2 (sha256hex) duplica funcionalidade de `mcp/auth/service-token.ts` (que já usa `createHash("sha256")`)

**Correção v2:** Em D2, mencionar a duplicação proposital (helper utilitário reusable) ou refatorar `service-token.ts` para usar o helper. Decisão: criar helper novo, refatorar `service-token.ts` para usá-lo (limpeza).

### C3. Task D6 (auth middleware) depende de `mcp/lib/redis.ts` existente

**Correção v2:** Listar como pré-requisito; se não tiver export adequado, ajustar.

### C4. Task E2 (lock distribuído) usa `redis: Redis` — depende de conexão configurada

**Correção v2:** Reusar conexão de `mcp/lib/redis.ts`; teste usa `ioredis-mock` ou conexão real configurada no test setup.

### C5. Task H1 (queue) depende de Redis config compartilhada com BullMQ

**Correção v2:** Verificar `src/lib/queue.ts` existente; reusar `connection: redisOpts`.

### C6. Task K1 (rota Next.js) depende de RBAC `super_admin` middleware existente

**Correção v2:** Adicionar pré-step: ler `src/middleware.ts` para confirmar como o RBAC é aplicado por rota. Se não existir gating por role, adicionar.

---

## D. Referências inexistentes / não definidas (4)

### D1. `mockOdooWriteClient` referenciado em testes (Bloco J, P)

**Correção v2:** Adicionar uma task na Bloco C ou J para criar `mcp/__tests__/mocks/odoo-write-client.ts`:
```typescript
export function mockOdooWriteClient(): jest.Mocked<OdooWriteClient> {
  return {
    authenticate: jest.fn(),
    create: jest.fn(),
    write: jest.fn(),
    unlink: jest.fn(),
    read: jest.fn(),
    search: jest.fn(),
    execute_kw: jest.fn(),
    searchIrModelData: jest.fn(),
  };
}
```

### D2. `mockPrisma` referenciado em testes (Bloco D)

**Correção v2:** Adicionar criação de helper em `mcp/__tests__/mocks/prisma.ts` antes do Bloco D.

### D3. `mockCtx` referenciado em Task J1

**Correção v2:** Criar fixture `mcp/__tests__/fixtures/contexts.ts` com factory `createMockContext()`.

### D4. `redis` global / instância referenciada em testes

**Correção v2:** Padronizar acesso ao Redis via injeção. Test setup configura `ioredis-mock` no início.

---

## E. Gaps de cobertura vs spec v3 (3)

### E1. CORS (spec §3.5) — nenhuma task implementa

**Onde:** Plano v1 não tem task para CORS.

**Correção v2:** Adicionar `Bloco D Task D10: CORS middleware`:
- Lê `allowedOrigins` da ApiKey.
- Aplica `Access-Control-Allow-Origin` se Origin na whitelist.
- Bloqueia se não.
- Teste: preflight OPTIONS funciona; chave sem allowedOrigins não recebe header.

### E2. Logging operacional via `pino` (spec §3.6) — nenhuma task configura

**Correção v2:** Adicionar `Bloco D Task D0: configurar pino`:
- Instalar `pino` + `pino-pretty` (caso ainda não instalado — A5 verifica).
- Criar `mcp/lib/logger.ts` exportando `logger`.
- Configurar levels via env `LOG_LEVEL`.
- Função `maskToken(authorization)` para logs seguros.

### E3. Cleanup job de `McpIdempotencyRecord` expirados (spec §10.3 retenção 24h)

**Correção v2:** Adicionar `Bloco H Task H5: cleanup job idempotency`:
- Cron diária (BullMQ schedule) que executa `DELETE FROM mcp_idempotency_records WHERE expires_at < now()`.
- Registrar como repeatable job no worker.

### E4. Cleanup job de `McpAuditLog` (retenção 90d/2a) — ausente

**Correção v2:** Adicionar `Bloco H Task H6: cleanup job audit log`:
- Cron diária 01:00 BRT.
- Após 90d: NULL nos JSONs grandes (`payload`, `snapshotBefore`, `snapshotAfter`, `result`).
- Após 2a: DELETE da linha.
- Configurável via env `MCP_AUDIT_DETAIL_RETENTION_DAYS` e `MCP_AUDIT_FULL_RETENTION_DAYS` (spec §10.3).

---

## F. Commits atômicos questionáveis (2)

### F1. Commit Bloco L (CRUD inteiro)

**Onde:** Task L6 commita tudo: lista + dialog + 4 actions + token reveal dialog.

**Correção v2:** Quebrar em commits intermediários por sub-task. Cada sub-task de L termina com seu próprio commit. Bloco L vira ~6 commits.

### F2. Commit Bloco N (toda a documentação)

**Onde:** Task N6 commita MDX + componente + rotas + busca.

**Correção v2:** Commits separados por sub-task.

---

## G. Ajustes de ordem e fluxo (4)

### G1. Bloco C antes do Bloco D?

**Atual:** C (Odoo client) → D (Auth middleware). OK porque o auth não chama o Odoo no caminho crítico.

**Confirmar:** Sim, ordem está correta.

### G2. Mocks devem existir ANTES dos testes que os usam

**Atual:** Mocks referenciados em B6, C2, D3 sem criação prévia.

**Correção v2:** Criar mocks no início do Bloco B (Task B-1 "Setup de testes"):
- `mcp/__tests__/mocks/prisma.ts`
- `mcp/__tests__/mocks/redis.ts` (com `ioredis-mock`)
- `mcp/__tests__/mocks/odoo-write-client.ts`
- `mcp/__tests__/fixtures/contexts.ts`

### G3. Bloco H (worker) precisa de OdooWriteClient (C) para `read` no caso "update sem snapshotAfter"

**Atual:** Bloco H depende implicitamente do Bloco C.

**Correção v2:** Declarar explicitamente no preâmbulo do Bloco H.

### G4. Bloco P (testes E2E) depende de TUDO

**Atual:** Implícito. Mas testes E2E precisam estar definidos antes da execução começar — não no fim.

**Correção v2:** Plano deixar claro que **Bloco P inteiro é parte do critério de aceitação**, executado **em paralelo com cada bloco anterior** (não sequencial). Adicionar nota no preâmbulo do Bloco P.

---

## H. Ação consolidada para Plan v2

### H.1. Decomposições

- Quebrar K2, L3, L5, N5, O1 em sub-tasks bite-sized (A1-A5).
- Quebrar commits de L e N em múltiplos (F1, F2).

### H.2. Códigos completos

- B1 (createOdooClient stub), B2 (WriteToolEntry código), B3 (processDirectedSync completo), B4 (cacheFreshness concreto), B5 (mcp/lib/errors.ts inicial), B6 (SQL completo), B7 (requireSuperAdmin), B8 (examples no ToolEntry).

### H.3. Dependências declaradas

- C1-C6 (Prisma gen explícito, Redis lib, queue lib, RBAC middleware, mocks before usage).

### H.4. Mocks/fixtures criados antes de uso

- Bloco B Task B-1: setup de mocks/fixtures globais.

### H.5. Gaps de cobertura

- D0: configurar `pino`.
- D10: CORS middleware.
- H5: cleanup job idempotency.
- H6: cleanup job audit log.

### H.6. Ajustes de ordem

- Bloco P executado em paralelo com cada bloco (P deixa de ser sequencial no fim).

---

## I. Pronto para v2

Aplicar todos os achados acima → **Plan v2**. A Review #2 vai cavar mais detalhes (provavelmente operacionais e de testabilidade).

**Achados materiais nesta review:** 5 tasks grandes + 8 placeholders + 6 dependências + 4 referências + 3 gaps + 2 commits + 4 ordem = **32 itens acionáveis.**
