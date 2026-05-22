# Review Crítica #2 — Plan v2 da Onda 0 (F4 Onda 2)

> **Reviewer:** Claude Opus 4.7 (adversarial intensificado)
> **Plano alvo:** `docs/superpowers/plans/2026-05-20-f4-onda2-onda0-fundacao.md` v2
> **Data:** 2026-05-20
> **Postura:** Auditoria adversarial **mais profunda que a #1**. A v2 corrigiu 32 itens; esta caça **o que apareceu com a reescrita** + **detalhes operacionais e de testabilidade que ainda escapam**. Se nada material, falhei.

## Resumo Executivo

V2 está significativamente mais robusto. Porém:

- **6 problemas operacionais** que aparecem quando se pensa em execução real (não em design).
- **4 testes que ainda dependem de configuração externa** (Redis real, DB real) sem instrução clara.
- **3 ordens de tasks ainda erradas** (dependências entre tasks B-1, B0, C).
- **5 gaps de cobertura** ainda existentes vs spec v3.
- **3 questões sobre rollback / migration safety** ausentes.
- **2 inconsistências introduzidas pela v2** (Apêndice vs Blocos originais).

**Total: 23 itens acionáveis.**

Conclusão: aplicar achados → **Plan v3** (final).

---

## A. Problemas operacionais (6)

### A1. Plan v2 não define ENV vars necessárias para o servidor MCP

**Onde:** Bloco D Task D0 (pino) menciona `LOG_LEVEL` mas o plano completo de ENV vars não está consolidado.

**Problema:** Spec Anexo B lista ENVs mas o plano não tem uma task explícita para popular `.env.example`. Resultado: dev iniciando do zero não sabe quais ENVs configurar.

**Correção v3:** Adicionar `Task B-1.5: Atualizar .env.example com variáveis novas`:
```bash
# F4 Onda 2 — Servidor MCP
ODOO_WRITE_URL=https://grupojht.teste.tauga.online
ODOO_WRITE_DB=grupojht_teste
ODOO_WRITE_USER=
ODOO_WRITE_PASSWORD=
ODOO_WRITE_TIMEOUT_MS=30000

MCP_AUDIT_DETAIL_RETENTION_DAYS=90
MCP_AUDIT_FULL_RETENTION_DAYS=730
MCP_IDEMPOTENCY_TTL_HOURS=24
MCP_TOKEN_PREFIX=mcp_live_
MCP_TOKEN_ENTROPY_BYTES=32
MCP_EXTERNAL_RATE_LIMIT_DEFAULT=60
MCP_EXTERNAL_RATE_LIMIT_MAX=600
MCP_KEY_CACHE_TTL_SEC=60
MCP_KEY_CACHE_MAX_SIZE=1000

LOG_LEVEL=info

# (Modo interno — já existente)
# MCP_SERVICE_TOKEN=
```

### A2. Migration de dados de `scopes` → `capabilities` falta

**Onde:** Bloco B Task B1 estende `ApiKey` mas não migra `scopes` existente.

**Problema:** ApiKeys existentes ficam com `capabilities = {version:1, read:[], write:{}}` (default) ignorando o que tinham em `scopes`. Risco de perder configuração.

**Correção v3:** Adicionar `Task B4.5: Migration de dados scopes → capabilities`:
```sql
-- Script Node.js executado após migration estrutural
-- prisma/seed-migrate-scopes.ts
import { prisma } from "@/lib/prisma";

async function migrateScopes() {
  const keys = await prisma.apiKey.findMany({ where: { active: true } });
  for (const key of keys) {
    const scopes = (key.scopes as unknown as string[]) ?? [];
    const capabilities = parseScopes(scopes);  // ex: "read:crm" → { read: ["crm"], write: {} }
    await prisma.apiKey.update({
      where: { id: key.id },
      data: {
        capabilities,
        isSystemKey: true,  // marca como herdada; super_admin reconfigura
        capabilitiesVersion: 1,
      },
    });
  }
  console.log(`Migrated ${keys.length} keys`);
}

function parseScopes(scopes: string[]): Capabilities {
  const cap: Capabilities = { version: 1, read: [], write: {} };
  for (const s of scopes) {
    const [action, module] = s.split(":");
    if (action === "read") cap.read.push(module);
    else if (["create", "update", "delete", "transition"].includes(action)) {
      cap.write[module] = [...(cap.write[module] ?? []), action];
    }
  }
  return cap;
}
```
Rodar uma vez (`npx tsx prisma/seed-migrate-scopes.ts`) após migration Prisma. Documentar em script de deploy.

### A3. Rollback da migration não definido

**Onde:** Bloco B Task B5 aplica migration sem plano de rollback.

**Problema:** Se algo der errado em prod, como reverter? Prisma migrate não tem rollback automático.

**Correção v3:** Adicionar `Task B5.5: Documentar rollback da migration`:
- Migration aplicada em dev/staging primeiro.
- Antes de aplicar em prod: backup completo do DB.
- Rollback SQL escrito manualmente em `prisma/migrations/<timestamp>_f4_onda2_mcp_writes/rollback.sql`:
```sql
DROP TABLE IF EXISTS mcp_idempotency_records;
DROP TABLE IF EXISTS mcp_audit_logs;
ALTER TABLE api_keys
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS capabilities,
  DROP COLUMN IF EXISTS capabilities_version,
  -- ... todas as colunas novas
```
- Procedimento de rollback documentado em `docs/HANDOFF-2026-MM-DD-f4-onda2-onda0.md`.

### A4. Bloco P "em paralelo" cria ambiguidade

**Onde:** Plan v2 nota "Bloco P executado em paralelo com cada bloco anterior" mas não detalha COMO.

**Problema:** Subagentes recebem instrução "implementar Bloco D" — vão criar testes E2E lá ou esperar Bloco P? Ambiguidade.

**Correção v3:** Esclarecer:
- **Testes unitários e de integração:** parte do bloco onde o componente vive (escritos junto da implementação via TDD).
- **Testes E2E end-to-end completos** (que rodam contra base de teste real): consolidados no Bloco P, executados **após** os blocos correspondentes terem componentes funcionais. Não é sequencial nem paralelo — é "Bloco P é validação cumulativa".
- Reescrever a nota do Bloco P para "Bloco P consolida cenários E2E. Testes unitários/integração ficam nos blocos correspondentes (TDD)."

### A5. Subagentes Sonnet executam tasks sem ler a spec inteira

**Onde:** Plan v2 dispatcha cada bloco para um subagente fresh. Subagente sem contexto da spec inteira pode interpretar errado.

**Problema:** Por exemplo, no Bloco H subagente pode esquecer da política de "snapshotAfter reusado em vez de re-buscar" (otimização §11.1).

**Correção v3:** Adicionar `Task <Block>-0.0: Subagent context briefing` em cada bloco:
- Cada bloco começa com: "Subagente lê primeiro: spec v3 §X, §Y, §Z (apenas as seções relevantes). Plano: este bloco completo (não outros blocos)."
- Lista de seções relevantes em cada preâmbulo de bloco.
- O Opus que revisa entre blocos confirma que o subagente leu as referências antes de avaliar o output.

### A6. `dayjs` referenciado em Task H6 mas não instalado

**Onde:** Plan v2 Task H6 test usa `dayjs().subtract(100, "day").toDate()`.

**Problema:** `dayjs` pode não estar no projeto. Verificar.

**Correção v3:** Trocar para Date nativo ou confirmar dayjs em uso:
```typescript
const oldDate = new Date(Date.now() - 100 * 86400_000);
```
Ou adicionar dayjs como dependência se for usado no resto do projeto.

---

## B. Testes que dependem de configuração externa (4)

### B1. Tests do Bloco C usam `global.fetch = jest.fn()` — pode quebrar entre tests

**Onde:** Bloco C Tasks C2-C7.

**Problema:** Substituir `global.fetch` é fragil; afeta outros testes da mesma suite se setup/teardown não isolar.

**Correção v3:** Usar `msw` (Mock Service Worker) para mockar fetch deterministicamente. Ou injetar `fetch` no client:
```typescript
export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  password: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;  // injetável para tests
}
```
Em tests: `createOdooClient({ ...config, fetch: jest.fn() })`. Mais limpo.

### B2. Tests de Bloco E (idempotency) usam Redis — qual?

**Onde:** Bloco E Task E2 — "Test (com `ioredis-mock` ou redis real em teste integration)".

**Problema:** Ambiguidade. `ioredis-mock` é OK para unit; testes E2E precisam Redis real. Decisão?

**Correção v3:** Padronizar:
- Unit tests (`*.test.ts` em `__tests__/` próximos): usam `ioredis-mock` via fixture `createMockRedis()` do Bloco B-1.2.
- E2E tests (`mcp/__tests__/e2e/*.test.ts`): usam Redis real configurado em `.env.test`. Pré-requisito: `docker-compose up redis` antes de rodar.

### B3. Tests de DB (Prisma) — schema applied?

**Onde:** Bloco B Task B6 usa `@/generated/prisma/client` — assume `prisma generate` rodou.

**Problema:** Em CI, o Prisma generate precisa rodar antes dos tests. Mas a etapa B4 (migration) ainda não rodou na CI quando B6 é avaliado.

**Correção v3:** Adicionar nota explícita: o test do Bloco B6 só roda após migration estrutural aplicada. Se for em CI:
```yaml
# .github/workflows/ci.yml (mental — não está na spec)
- run: npx prisma migrate deploy
- run: npx prisma generate
- run: npm test
```
Mencionar essa ordem no preâmbulo do Bloco B.

### B4. Tests E2E (Bloco P) precisam de configuração da base de teste — não documentado

**Onde:** Bloco P.

**Problema:** Como configurar `.env.test` com credenciais de teste? Onde fica o usuário Odoo?

**Correção v3:** Adicionar `Task P0: Setup .env.test com credenciais Odoo de teste`:
- Documentar formato.
- Indicar local de cofre (Portainer secrets, 1Password, etc).
- Test runner valida que as ENVs estão preenchidas antes de rodar; senão skip com mensagem clara.

---

## C. Ordens ainda erradas (3)

### C1. Bloco B-1 vs Bloco B0

**Onde:** v2 adicionou Bloco B-1 (mocks) antes do Bloco B. Mas Bloco B0 (dependências NPM) está dentro do Bloco B. `ioredis-mock` precisa estar instalado antes do Bloco B-1.

**Correção v3:** Mover `Task B0` para o início absoluto, antes do Bloco B-1. Renomear como `Task A11: Dependências NPM finais` (no fim do Bloco A, antes do B-1):
```
Bloco A → Task A11 (deps NPM)
↓
Bloco B-1 (mocks/fixtures)
↓
Bloco B (schema + migration)
↓
Bloco C (Odoo client)
...
```

### C2. Helper `requireSuperAdmin` referenciado no Apêndice mas usado no Bloco L

**Onde:** Apêndice v2 mostra o código de `requireSuperAdmin` mas o Bloco L (que usa) é antes do apêndice no documento.

**Problema:** Ordem física no documento confunde. Subagente lendo o Bloco L não vê o helper.

**Correção v3:** Mover `requireSuperAdmin` para uma task explícita no início do Bloco L (`Task L0: Helper requireSuperAdmin`). Apêndice fica como referência.

### C3. Sub-tasks K2.1-K2.5 não declaradas como sequenciais

**Onde:** Apêndice v2 lista decomposição de K2 mas não diz se são paralelas ou sequenciais.

**Correção v3:** Decisão: K2.1-K2.5 são sequenciais (mesma seção do painel; K2.5 depende de K3 que vem depois → re-ordenar para K3 antes de K2.5). Documentar:
```
K1 → K2.1 → K2.2 → K2.3 → K2.4 → K3 → K2.5 → (commit final K4 atômico ou commits por sub-task)
```

---

## D. Gaps de cobertura ainda existentes vs Spec v3 (5)

### D1. Spec §5.5 fala em "Snapshot grava todos os campos retornados pelo método read da tool" + "Limite de tamanho de campo: valores >10KB são truncados" — não tem task

**Correção v3:** Adicionar `Task H2.5: Helper de truncamento de snapshot`:
```typescript
// mcp/lib/snapshot.ts
const MAX_FIELD_SIZE = 10 * 1024;

export function truncateSnapshot<T extends object>(snapshot: T): T {
  const out: Record<string, unknown> = { ...snapshot };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && v.length > MAX_FIELD_SIZE) {
      out[k] = `${v.slice(0, MAX_FIELD_SIZE)}...[truncated:${v.length}]`;
    }
  }
  return out as T;
}
```
Aplicado em audit log e na resposta do handler.

### D2. Spec §5.6 fala em `searchIrModelData` no client — coberto. Mas faltam métodos `searchRead` e `fieldsGet` (úteis para discovery futuro)

**Correção v3:** Estender OdooWriteClient com `searchRead(model, domain, fields, options)` e `fieldsGet(model)` no Bloco C. Discovery (§17 da spec) vai usar.

### D3. Spec §7.1 (coexistência dos dois modelos) — não há task que **testa** ambos modos juntos

**Correção v3:** Adicionar `Task P-coexist: Test E2E modo interno + externo na mesma sessão`:
- Cliente A faz call no modo interno (lê tool de leitura).
- Cliente B faz call no modo externo (escreve via tool).
- Mesmo servidor responde ambos corretamente.
- Audit log mostra `authMode: "internal"` vs `"external"`.

### D4. Spec §10.5 (audit em denials) — não testado

**Correção v3:** Adicionar cenários ao Bloco P:
- Denial `unauthorized` → audit grava apenas metadados (sem payload).
- Denial `capability_missing` → audit grava payload com redaction.
- Denial `rate_limited` → audit grava payload.

### D5. Spec §3.2 atualização do CLAUDE.md — Task Q1 existe mas não confirma numeração atual primeiro

**Correção v3:** Reformular `Task Q1`:
```
1. ler CLAUDE.md §5 inteira;
2. identificar a decisão atual sobre cache obrigatório (provavelmente #2);
3. confirmar com `git log` que não foi editada por outro agente recentemente;
4. atualizar com o texto novo da spec §3.2.
```

---

## E. Rollback / migration safety (3)

### E1. Plan v2 não tem rollback de feature (não migration) — se Onda 0 falha em prod, como reverter?

**Correção v3:** Adicionar `Task Q-rollback: Documentar feature flag de cutover`:
- ENV `MCP_WRITE_ENABLED=false` desabilita o middleware de write (retorna 503 `feature_disabled` para todas as `WriteToolEntry`).
- Default em prod: `false`. Manual ativação pelo super_admin após validação.
- Rollback rápido: trocar ENV para `false`, redeploy.

### E2. Cutover ODOO_WRITE_URL: teste → produção sem instrumentação

**Correção v3:** Task Q-cutover: ao trocar ODOO_WRITE_URL para produção, primeiros 24h em modo "shadow":
- Tools `WriteToolEntry` aceitam header `X-MCP-Shadow-Run: true` que faz dry-run (valida tudo + chama Odoo em base de teste, NÃO em produção).
- Painel mostra alerta "modo shadow ativo" durante o período.
- Após validação humana: remove shadow.

### E3. ApiKey existente migrada com `isSystemKey=true` — mas se nunca for reconfigurada, fica "trancada"

**Correção v3:** Plan v2 marca migrações como `isSystemKey=true`. Mas sem prazo de revisão, ficam para sempre. Adicionar lembrete no painel:
- Lista de chaves mostra banner "X chaves herdadas precisam de reconfiguração".
- Click expande lista.
- Sem botão "ignorar" — força ação.

---

## F. Inconsistências v1 → v2 (2)

### F1. Apêndice v2 cita "K3 antes de K2.5" mas as numerações nos blocos originais não refletem

**Correção v3:** Aplicar a reordenação dentro do próprio Bloco K, removendo a redundância do apêndice.

### F2. Decomposições do Apêndice precisam ser refletidas nos blocos originais (não só no apêndice)

**Correção v3:** Substituir tasks K2, L3, L5, N5, O1 nos blocos pelas sub-tasks. Apêndice fica só como nota histórica de transição v1→v2.

---

## G. Ação consolidada para Plan v3

### G.1. Adições críticas

- A1: Task B-1.5 / `.env.example` atualizado.
- A2: Task B4.5 migration de dados de scopes.
- A3: Task B5.5 rollback documentado.
- A4: Reescrever nota sobre Bloco P.
- A5: Adicionar `Task <Block>-0.0: Subagent context briefing` em cada bloco.
- D1: Task H2.5 truncamento snapshot.
- D2: Estender OdooWriteClient com `searchRead`, `fieldsGet`.
- D3: Task P-coexist.
- D4: Cenários E2E para denials.
- E1: ENV `MCP_WRITE_ENABLED` (kill switch).
- E2: Modo shadow no cutover.

### G.2. Correções de ordem

- C1: Mover B0 → A11 (deps NPM antes de mocks).
- C2: Mover `requireSuperAdmin` para Task L0.
- C3: Ordenar K2.1-K2.5 + K3 explicitamente.

### G.3. Refatorações

- F1+F2: Apêndice v2 vira nota histórica; decomposições migradas para os blocos originais.

### G.4. Esclarecimentos

- B1-B4: padronizar uso de mocks (ioredis-mock unit; redis real E2E; msw para fetch; .env.test obrigatório).

### G.5. Detalhes pequenos

- A6: Substituir `dayjs` por Date nativo nos tests.
- D5: Task Q1 detalhada.
- E3: Banner de reconfiguração de chaves herdadas.

---

## H. Pronto para Plan v3

Aplicar todos os achados acima → **Plan v3 (final)**. Após v3, o plano está pronto para execução via `superpowers:subagent-driven-development`.

**Achados materiais nesta review:** 6 operacionais + 4 testes + 3 ordem + 5 gaps + 3 rollback + 2 inconsistências = **23 itens acionáveis.**
