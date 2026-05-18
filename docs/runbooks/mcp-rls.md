# Runbook: RLS (Row-Level Security) para o MCP

## Status atual

**DESABILITADA** — F4 opera com tenant único (Matrix Fitness Group). A RLS não é necessária agora e não foi aplicada.

Este documento é o ponto de extensão para quando o sistema evoluir para multi-tenant.

---

## O que é a RLS aqui

A Row-Level Security restringe as linhas retornadas em cada SELECT com base em um contexto de sessão injetado pelo servidor MCP. Sem RLS, o isolamento de tenant é feito na camada de aplicação (RBAC + `tenant_id` nos filtros Prisma). Com RLS, o banco garante o isolamento mesmo que a camada de aplicação falhe ou seja contornada.

---

## Quando ativar

- Quando o sistema evoluir para **múltiplos tenants** no mesmo banco.
- Antes de ativar, é necessário adicionar uma coluna `tenant_id UUID` nas tabelas de fatos via migration Prisma.

---

## Como ativar (passo a passo)

### 1. Migration Prisma

Adicionar `tenant_id String @db.Uuid` nos modelos `FatoEstoqueSaldo`, `FatoEstoqueMovimento`, `FatoProdutoParado`, `FatoFinanceiroSaldo`, `FatoFinanceiroMovimento`, `FatoFinanceiroTitulo` e gerar/aplicar a migration.

### 2. Injeção do contexto no servidor MCP

No client Prisma do MCP (`mcp/lib/prisma.ts`), adicionar um middleware que injeta o tenant no início de cada query:

```typescript
prisma.$use(async (params, next) => {
  await prisma.$executeRaw`SET LOCAL app.current_tenant = ${currentTenantId}`;
  return next(params);
});
```

Ou via `$executeRaw` em cada transação.

### 3. Aplicar o SQL

Descomentar o bloco em `prisma/sql/2026-05-17-mcp-rls.sql` e executar com o usuário `nexus`:

```bash
psql "$DATABASE_URL" -f prisma/sql/2026-05-17-mcp-rls.sql
```

### 4. Verificar que a RLS está ativa

```sql
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN (
  'fato_estoque_saldo', 'fato_estoque_movimento', 'fato_produto_parado',
  'fato_financeiro_saldo', 'fato_financeiro_movimento', 'fato_financeiro_titulo'
);
-- Esperado: relrowsecurity = true em todas
```

### 5. Testar o isolamento

```sql
-- Conectado como nexus_mcp sem setar o tenant → nenhuma linha retornada:
SET LOCAL app.current_tenant = '';
SELECT count(*) FROM fato_estoque_saldo;  -- Esperado: 0

-- Setando um tenant válido → retorna as linhas do tenant:
SET LOCAL app.current_tenant = '<uuid_do_tenant>';
SELECT count(*) FROM fato_estoque_saldo;  -- Esperado: > 0
```

---

## Verificar estado atual (RLS desabilitada)

```sql
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN (
  'fato_estoque_saldo', 'fato_estoque_movimento', 'fato_produto_parado',
  'fato_financeiro_saldo', 'fato_financeiro_movimento', 'fato_financeiro_titulo'
);
-- Esperado: relrowsecurity = false em todas (estado correto para F4)
```

---

## Decisão de design

A RLS foi conscientemente deixada desabilitada em F4 porque:

1. **Tenant único** — não há risco de vazamento de dados entre tenants.
2. **RBAC em 7 camadas** — o isolamento já é garantido por catálogo filtrado por role, `assertToolAllowed`, validação Zod, e filtros Prisma com `userId`.
3. **Prematuridade** — adicionar `tenant_id` nas tabelas de fatos antes de ter multi-tenant seria over-engineering.

A ativação da RLS é um **passo de evolução natural** quando (se) a plataforma atender múltiplos clientes no mesmo banco.
