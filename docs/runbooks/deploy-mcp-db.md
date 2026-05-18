# Runbook — provisionamento do banco para o MCP (deploy)

> Resolve o item R4 do `docs/RADAR.md`. Passo **obrigatório** de todo deploy
> que toca o schema ou adiciona fatos/tools.

## O que e por quê

O servidor MCP conecta ao Postgres com dois roles de **menor privilégio**:

- `nexus_mcp` — as 33 tools semânticas (SELECT em `fato_*`, INSERT em audit).
- `nexus_mcp_bi` — o Caminho 3c / modo BI (SELECT read-only em `fato_*`).

Esses roles e seus GRANTs **não vivem no `prisma migrate`** — são provisionados
pelo script idempotente **`prisma/sql/provision-mcp.sql`**. Se um deploy rodar
`prisma migrate deploy` sem rodar o provisionamento, o container `mcp` sobe e
todas as tools retornam `permission denied`.

## O comando de deploy

Sempre rodar, no ambiente de destino, com acesso de **superusuário** ao banco
(`DATABASE_URL` apontando para o role `nexus`/owner):

```bash
npm run db:deploy
```

Esse script faz, em ordem:
1. `prisma migrate deploy` — aplica as migrations (cria/atualiza tabelas).
2. `npm run db:provision` — roda `provision-mcp.sql`, que cria/atualiza os roles
   e (re)aplica os GRANTs.

Requer as variáveis de ambiente:
- `DATABASE_URL` — conexão de superusuário (owner do banco).
- `MCP_DB_PASSWORD` — senha do role `nexus_mcp`.
- `MCP_BI_DB_PASSWORD` — senha do role `nexus_mcp_bi`.

As senhas vêm do ambiente (Portainer / `.env`), **nunca** do arquivo SQL.

## Garantias do script

- **Idempotente** — seguro rodar a cada deploy. Cria os roles só se não
  existirem; sempre revoga tudo e reaplica o estado final determinístico.
- **À prova de esquecimento** — o GRANT de SELECT nos fatos é dinâmico: um
  loop sobre todas as tabelas `fato_*`. **Um fato novo é coberto
  automaticamente** no próximo `npm run db:deploy`, sem editar o script.
- **Menor privilégio preservado** — sem SELECT em `mcp_audit_log`, sem acesso a
  `raw_*`, sem UPDATE/DELETE/DDL.

## Verificação pós-deploy

```sql
\dp fato_pedido          -- deve mostrar nexus_mcp=r e nexus_mcp_bi=r
\dp mcp_audit_log        -- deve mostrar nexus_mcp=a / nexus_mcp_bi=a (INSERT, sem SELECT)
\dp raw_pedido_documento -- NÃO deve listar nenhum role do MCP
```

Ou suba o container `mcp` e confirme que `tools/list` responde e uma tool
qualquer retorna dados (não `permission denied`).

## RLS (camada 5 — preparada, desabilitada)

`prisma/sql/2026-05-17-mcp-rls.sql` é separado: Row-Level Security preparada
mas **desabilitada** (tenant único). Não faz parte do deploy padrão. Ver
`docs/runbooks/mcp-rls.md`.
