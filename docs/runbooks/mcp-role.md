# Runbook: Role Postgres `nexus_mcp`

## Objetivo

Provisionar o role `nexus_mcp` com **privilégios mínimos** para o servidor MCP, isolando-o do usuário `nexus` (que tem acesso total) e impedindo qualquer leitura das tabelas `raw_*` ou escrita/deleção nas tabelas de fatos.

Implementa o **RBAC camada 4** definido na spec v3 §3.6 e no achado C4/4f-1 do plano de execução F4.

---

## Quando aplicar

- **Primeiro deploy** (dev ou produção): executar o script uma vez.
- **Adição de nova tabela de fato**: adicionar o `GRANT SELECT` correspondente e reaplicar.
- O script é idempotente para a criação do role (`DO/EXCEPTION`), mas os `GRANT`/`REVOKE` são reexecutados normalmente — isso é seguro.

---

## Pré-requisitos

- Acesso ao banco `nexus_odoo` com o usuário `nexus` (ou outro com SUPERUSER/GRANT OPTION).
- Variável de ambiente `DATABASE_URL` apontando para o banco alvo.

---

## Passo a passo

### 1. Editar a senha no script

Antes de aplicar, substitua `SUBSTITUIR_POR_SENHA_FORTE` no arquivo
`prisma/sql/2026-05-17-mcp-role.sql` por uma senha segura (≥ 32 caracteres, gerada aleatoriamente).

```bash
# Gerar senha forte:
openssl rand -base64 32
```

**Nunca commitar o arquivo com a senha real.** O arquivo no repositório mantém o placeholder.

### 2. Aplicar o script

```bash
psql "$DATABASE_URL" -f prisma/sql/2026-05-17-mcp-role.sql
```

Ou via Docker (ambiente local):

```bash
docker compose exec db psql -U nexus nexus_odoo \
  -f /docker-entrypoint-initdb.d/2026-05-17-mcp-role.sql
```

### 3. Verificar os privilégios

```sql
-- Conectado ao banco nexus_odoo como nexus:
\dp fato_estoque_saldo      -- deve mostrar nexus_mcp=r/...
\dp mcp_audit_log           -- deve mostrar nexus_mcp=a/... (somente INSERT)
\dp raw_stock_quant         -- NÃO deve mostrar nexus_mcp
```

### 4. Compor `MCP_DATABASE_URL`

```
MCP_DATABASE_URL=postgresql://nexus_mcp:<SENHA>@<HOST>:5432/nexus_odoo?schema=public
```

Para dev local (com Docker Compose, porta 5436 exposta):

```
MCP_DATABASE_URL=postgresql://nexus_mcp:<SENHA>@localhost:5436/nexus_odoo?schema=public
```

Adicionar ao `.env.local` (nunca ao `.env.example` com senha real):

```bash
echo 'MCP_DATABASE_URL=postgresql://nexus_mcp:<SENHA>@localhost:5436/nexus_odoo?schema=public' >> .env.local
```

### 5. Verificar que o MCP funciona com o role

```bash
# Subir o MCP com a variável setada:
MCP_DATABASE_URL=<url_nexus_mcp> npx tsx mcp/index.ts

# Em outro terminal, confirmar que raw_* é bloqueado:
psql "postgresql://nexus_mcp:<SENHA>@localhost:5436/nexus_odoo" \
  -c "SELECT count(*) FROM raw_stock_quant;"
# Esperado: ERROR: permission denied for table raw_stock_quant
```

---

## Tabelas com acesso concedido

| Tabela | Privilégio | Motivo |
|---|---|---|
| `fato_estoque_saldo` | SELECT | Tools de estoque R1/R2 |
| `fato_estoque_movimento` | SELECT | Tools de estoque R3/R5 |
| `fato_produto_parado` | SELECT | Tool de estoque R4 |
| `fato_financeiro_saldo` | SELECT | Tool financeiro saldo |
| `fato_financeiro_movimento` | SELECT | Tool financeiro caixa/fluxo |
| `fato_financeiro_titulo` | SELECT | Tools financeiro receber/pagar/vencidos |
| `User` | SELECT | Resolução de contexto do usuário |
| `UserDomainAccess` | SELECT | RBAC por domínio |
| `sync_state` | SELECT | Indicador de frescor dos dados |
| `FatoBuildState` | SELECT | Estado do builder de fatos |
| `mcp_audit_log` | INSERT | Gravação de audit (sem leitura) |
| `feature_requests` | INSERT | Registro de lacunas (3a) |

## Tabelas explicitamente bloqueadas

- Todas as `raw_*` (dados brutos do Odoo)
- SELECT em `mcp_audit_log` (o MCP só grava, não lê)
- UPDATE/DELETE em qualquer tabela

---

## Troubleshooting

**Erro `role "nexus_mcp" already exists`:** o bloco `DO/EXCEPTION` evita esse erro — se ocorrer, o script foi rodado sem o bloco ou em versão antiga. Aplicar o script atual.

**Erro `permission denied for table fato_estoque_saldo`:** o GRANT não foi aplicado para essa tabela. Reaplicar o script com o usuário `nexus`.

**MCP sobe mas ferramentas retornam erro de auth:** verificar que `MCP_DATABASE_URL` usa o role `nexus_mcp`, não o `nexus`.
