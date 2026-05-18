# Role Postgres read-only para o Postgres MCP (3c futuro)

**Data:** 2026-05-17  
**Contexto:** Caminho 3c do MCP semântico — modo BI avançado (text-to-SQL via Postgres MCP, Crystal DBA). Restrito a `admin`/`super_admin`. A tool `bi_consulta_avancada` é o ponto de extensão; nesta fase entrega stub.

---

## Propósito

Quando o Caminho 3c for habilitado, o agente de IA consultará o banco via Postgres MCP com um role dedicado de leitura mínima. Este documento especifica as permissões desse role para que seja criado corretamente na task 4f-1 ou fase posterior.

---

## Definição do role `nexus_mcp_bi`

> Separado do role `nexus_mcp` (usado pelo servidor MCP semântico) para isolar as permissões de leitura ampla do BI do acesso estruturado do servidor.

```sql
-- Criar role de leitura restrita para o Postgres MCP (Caminho 3c)
CREATE ROLE nexus_mcp_bi LOGIN PASSWORD '<senha-forte-gerada-por-vault>';

-- Acesso read-only nas tabelas de fatos (camada semântica)
GRANT SELECT ON
  fato_estoque_saldo,
  fato_estoque_movimento,
  fato_produto_parado,
  fato_financeiro_saldo,
  fato_financeiro_movimento,
  fato_financeiro_titulo
TO nexus_mcp_bi;

-- Acesso de leitura nas tabelas de controle necessárias para contexto
GRANT SELECT ON
  "User",
  "UserDomainAccess",
  sync_state,
  "FatoBuildState"
TO nexus_mcp_bi;

-- Gravação em audit (o Postgres MCP deve registrar cada consulta executada)
GRANT INSERT ON mcp_audit_log TO nexus_mcp_bi;

-- Explicitamente REVOGAR tudo que não foi concedido acima
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nexus_mcp_bi;
-- Re-conceder (após o REVOKE geral, re-aplicar os GRANTs acima)

-- Proibições críticas (nunca conceder ao nexus_mcp_bi):
-- - SELECT em raw_* (dados brutos não validados, sem RLS)
-- - SELECT em mcp_audit_log (um role não lê seus próprios logs de auditoria)
-- - UPDATE / DELETE em qualquer tabela
-- - INSERT em qualquer tabela além de mcp_audit_log
-- - TRUNCATE, DROP, CREATE
```

---

## Variável de ambiente

```env
# .env.local / .env.production
MCP_BI_DATABASE_URL=postgresql://nexus_mcp_bi:<senha>@localhost:5432/nexus_odoo
```

O servidor MCP semântico usa `MCP_DATABASE_URL` (role `nexus_mcp`). O Postgres MCP (Crystal DBA) usa `MCP_BI_DATABASE_URL`. As duas conexões são separadas por design.

---

## Política de query no Postgres MCP

Quando o Caminho 3c for implementado, o handler de `bi_consulta_avancada` deve:

1. Validar que o usuário tem role `admin` ou `super_admin` (gate já implementado na ToolEntry).
2. Enviar a pergunta ao Postgres MCP com `MCP_BI_DATABASE_URL`.
3. Registrar em `mcp_audit_log` com `outcome = "dynamic_query"` e o SQL executado no campo `meta`.
4. Retornar a resposta ao agente com aviso explícito: _"Esta resposta foi gerada por consulta dinâmica não coberta pelo catálogo semântico validado."_

---

## Diferença entre `nexus_mcp` e `nexus_mcp_bi`

| Característica | `nexus_mcp` | `nexus_mcp_bi` |
|---|---|---|
| Uso | Servidor MCP semântico (tools auditadas) | Postgres MCP — modo BI avançado (3c) |
| SELECT em `fato_*` | Sim | Sim |
| SELECT em `raw_*` | **Não** | **Não** |
| INSERT em `mcp_audit_log` | Sim | Sim |
| INSERT em `feature_requests` | Sim (3a) | Não |
| SELECT em `mcp_audit_log` | **Não** | **Não** |
| Roles que podem usar | Todos (filtrado por RBAC) | Apenas admin/super_admin |

---

## Ponto de extensão (task 4f-1)

A task 4f-1 (Onda 4f) cria o role `nexus_mcp` para o servidor semântico. O role `nexus_mcp_bi` deve ser criado na mesma migration ou em migration separada quando o Caminho 3c for habilitado. Não bloqueia a entrega da Onda 4e ou 4f.
