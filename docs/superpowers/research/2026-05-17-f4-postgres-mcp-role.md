# Role Postgres read-only para o Caminho 3c — nexus_mcp_bi

**Data original:** 2026-05-17
**Revisado em:** 2026-05-18 (Onda H — executor embutido, não Crystal DBA)

**Contexto:** Caminho 3c do MCP semântico — modo BI avançado. Restrito a `admin`/`super_admin`.

---

## Revisão de 2026-05-18 — Decisão de arquitetura

O documento original previa o Caminho 3c via **Postgres MCP (Crystal DBA)** — o servidor MCP
semântico enviaria a pergunta ao Crystal DBA, que geraria e executaria o SQL. Essa abordagem foi
**revisada conscientemente** (achado C2 da review do plano v2):

**Decisão adotada: executor de SQL embutido no próprio servidor MCP semântico.**

- A tool `bi_consulta_avancada` recebe um SQL pronto (`{ sql }`) do agente e o executa diretamente
  via `pg.Pool` com o role `nexus_mcp_bi`.
- O text-to-SQL é responsabilidade do **agente da F5** — o MCP apenas executa.
- O **Postgres MCP (Crystal DBA)** ficou restrito a ambiente **dev/DBA** — não é usado em produção.
- Implementado em `mcp/tools/caminho3/bi-consulta-avancada.ts` (H.7), com pool dedicado em
  `mcp/tools/caminho3/bi-pool.ts` (H.5) e guard AST em `mcp/tools/caminho3/sql-guard.ts` (H.6).

---

## Definição do role `nexus_mcp_bi`

Script aplicado: `prisma/sql/2026-05-18-mcp-bi-role.sql`.

### Permissões concedidas

- `SELECT` nos **12 fatos** (todos os domínios):
  `fato_estoque_saldo`, `fato_estoque_movimento`, `fato_produto_parado`,
  `fato_financeiro_saldo`, `fato_financeiro_movimento`, `fato_financeiro_titulo`,
  `fato_pedido`, `fato_pedido_parcela`, `fato_nota_fiscal`, `fato_nota_fiscal_item`,
  `fato_parceiro`, `fato_conta_contabil`.
- `SELECT` em `sync_state` e `fato_build_state` (frescor — uso legítimo de BI).
- `INSERT` em `mcp_audit_log`.

### Permissões intencionalmente ausentes (menor privilégio — achado P-M5)

- **Sem** `GRANT` em `users` nem `user_domain_access` — o `nexus_mcp_bi` não precisa de auth.
- **Sem** `GRANT` em `raw_*` — dados brutos nunca acessíveis pelo Caminho 3c.
- **Sem** `SELECT` em `mcp_audit_log` — o role grava mas nunca lê seu próprio log.
- **Sem** `UPDATE`/`DELETE`/DDL em nenhuma tabela.

### Reforço de segurança em runtime

O pool `bi-pool.ts` registra `pool.on("connect", ...)` que executa:
- `SET default_transaction_read_only = on` — reforço de read-only por transação.
- `SET statement_timeout = '5s'` — mata queries longas (defesa contra DoS).

O role `nexus_mcp_bi` é o **controle primário**; o guard AST (`sql-guard.ts`) é
defesa-em-profundidade.

---

## Fluxo do Caminho 3c de produção

1. Agente (F5) gera o SQL e chama `bi_consulta_avancada({ sql })`.
2. Pipeline do `server.ts`: rate limit → RBAC (gate `admin`/`super_admin`) → parse Zod do input.
3. Handler: `validarSqlSelect(sql)` via AST — se recusado, lança `SqlGuardError` → `outcome="invalid_input"`.
4. Handler: `getBiPool()` — se null (env ausente), lança `Error` → `outcome="error"`.
5. Handler: executa `pool.query(...)` sob role `nexus_mcp_bi`.
6. Pipeline: `auditSafe(...)` grava `McpAuditLog` com `params = rawInput = { sql }` e `outcome` correto.
   O audit de `params` é **automático** — o pipeline passa `rawInput` antes do handler.
   O campo de audit é `params` (não `meta` — `McpAuditLog` não tem campo `meta`).
7. Handler retorna output tabular `{ colunas, linhas, totalLinhas, truncado, aviso }`.
   `outcome` de sucesso é `"ok"` (não `"dynamic_query"` — o pipeline usa `AuditOutcome`).

---

## Variável de ambiente

```env
# .env.local / .env.production
MCP_BI_DATABASE_URL=postgresql://nexus_mcp_bi:<senha>@localhost:5432/nexus_odoo?schema=public
```

Ausente → o servidor MCP sobe normalmente (fail-safe). A tool `bi_consulta_avancada` responde
o erro estruturado "modo BI não configurado" sem derrubar o boot.

---

## Diferença entre `nexus_mcp` e `nexus_mcp_bi`

| Característica | `nexus_mcp` | `nexus_mcp_bi` |
|---|---|---|
| Uso | Servidor MCP semântico (tools auditadas) | Executor SQL do Caminho 3c |
| SELECT em `fato_*` (12 fatos) | Sim | Sim |
| SELECT em `raw_*` | **Não** | **Não** |
| SELECT em `users` / `user_domain_access` | Sim | **Não** (P-M5) |
| INSERT em `mcp_audit_log` | Sim | Sim |
| INSERT em `feature_requests` | Sim (3a) | **Não** |
| Roles que podem usar | Todos (filtrado por RBAC) | Apenas admin/super_admin |
| `default_transaction_read_only` | Não (necessário apenas no BI) | **Sim** (bi-pool.ts) |
