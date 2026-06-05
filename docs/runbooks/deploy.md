# Runbook , Deploy do nexus-odoo (producao)

> Producao: **https://agentenex.nexusai360.com**
> Infra: VPS Hostinger (82.29.61.175) + Docker Swarm + Portainer (`painel.nexusai360.com`) + Traefik (SSL Let's Encrypt).
> Modelo copiado do projeto irmao `nexus-insights`.

## Resumo

Push em `main` -> GitHub Actions (`.github/workflows/build.yml`):
1. **build-app** , builda `docker/Dockerfile` e pusha `ghcr.io/nexusai360/nexus-odoo:latest` (+ `:sha-XXXX`). Usada por `app` e `worker`.
2. **build-mcp** , builda `mcp/Dockerfile` e pusha `ghcr.io/nexusai360/nexus-odoo-mcp:latest`. Usada pelo `mcp`.
3. **deploy** , chama a Portainer API, puxa as duas imagens no no Swarm e forca redeploy dos services `nexus-odoo_app`, `nexus-odoo_mcp` e `nexus-odoo_worker` via `TaskTemplate.ForceUpdate++`.

Sem acao manual em producao depois do setup inicial.

## Arquitetura da stack (Swarm)

5 services em uma stack Portainer chamada `nexus-odoo`:

| Service | Imagem | Funcao | Exposto |
|---|---|---|---|
| `app` | `ghcr.io/nexusai360/nexus-odoo:latest` | Next.js (dashboard + `/api/mcp`) | Traefik -> `agentenex.nexusai360.com:3000` |
| `mcp` | `ghcr.io/nexusai360/nexus-odoo-mcp:latest` | servidor MCP semantico | interno (porta 3100, rede `nexus_odoo_internal`) |
| `worker` | `ghcr.io/nexusai360/nexus-odoo:latest` | cron de sync JSON-RPC do Odoo | interno |
| `db` | `pgvector/pgvector:pg16` | Postgres cache (`nexus_odoo_l1`) | interno |
| `redis` | `redis:7-alpine` | fila BullMQ / cache | interno |

Redes: `rede_nexusAI` (externa, do Traefik, so o `app` entra) + `nexus_odoo_internal` (overlay interna, todos).

O `mcp` NAO e exposto ao publico: o app fala com ele por `MCP_URL=http://mcp:3100/mcp` na rede interna. O endpoint publico do MCP e `/api/mcp` (proxy dentro do app).

## Pre-requisitos (configurados uma vez)

### Secrets no repositorio `nexusai360/nexus-odoo`
- `PORTAINER_URL` , `https://painel.nexusai360.com`
- `PORTAINER_TOKEN` , API Key do Portainer (`X-API-Key`).
- `PORTAINER_ENDPOINT_ID` , `1`.
- `PORTAINER_STACK_ID` , ID da stack `nexus-odoo` (preenchido depois de criar a stack).

> Sem `PORTAINER_STACK_ID` o job `deploy` apenas pula (exit 0). Isso e esperado
> no primeiro merge, antes da stack existir.

### Imagens publicas no GHCR
Apos o primeiro build, tornar os pacotes `nexus-odoo` e `nexus-odoo-mcp` **publicos**
(ou configurar registry auth no Portainer), senao o Swarm nao consegue puxar.

## Provisionamento do banco (roles do MCP)

O `mcp` conecta com roles de menor privilegio (`nexus_mcp`, `nexus_mcp_bi`) que
NAO vivem no `prisma migrate`. O **entrypoint do `app` roda `npm run db:provision`
automaticamente** no boot quando `MCP_DB_PASSWORD` e `MCP_BI_DB_PASSWORD` estao no
ambiente (idempotente). Ver `deploy-mcp-db.md`. Sem isso, as tools do MCP retornam
`permission denied`.

## Variaveis de ambiente da stack

Definidas no compose da stack no Portainer (nunca no Git). As senhas/segredos sao
**proprios do nexus-odoo** (nao reaproveitar do insights):

`DATABASE_URL` (role owner `nexus`), `DB_PASSWORD`, `REDIS_URL`, `NEXTAUTH_SECRET`,
`NEXTAUTH_URL=https://agentenex.nexusai360.com`, `ENCRYPTION_KEY`, `ADMIN_*`,
`ODOO_URL/DB/USERNAME/PASSWORD` (Tauga), `MCP_DATABASE_URL` (role `nexus_mcp`),
`MCP_BI_DATABASE_URL` (role `nexus_mcp_bi`), `MCP_DB_PASSWORD`, `MCP_BI_DB_PASSWORD`,
`MCP_SERVICE_TOKEN`, `MCP_URL=http://mcp:3100/mcp`.

## Primeiro deploy (do zero)

1. Merge do PR de infra em `main` -> Actions builda e pusha as duas imagens no GHCR.
2. Tornar os pacotes GHCR publicos.
3. Criar a stack `nexus-odoo` no Portainer (Swarm) com o compose + env acima.
   O entrypoint do `app` aplica migrations, provisiona roles do MCP e roda o seed.
4. Pegar o `Id` da stack criada e gravar em `PORTAINER_STACK_ID` (secret do repo).
5. A partir daqui, todo push em `main` redeploya sozinho.

## Verificacao apos deploy

```bash
curl -s https://agentenex.nexusai360.com/api/health      # {"ok":true}
curl -sI https://agentenex.nexusai360.com/login          # 200, cert valido
```

No container do app, confirmar provisionamento:
```sql
\dp fato_pedido     -- nexus_mcp=r / nexus_mcp_bi=r
```

## Troubleshooting

- **Pull image HTTP 403**: pacote GHCR privado -> tornar publico ou configurar registry auth.
- **Service update HTTP 405**: usar `/docker/services/{id}/update?version=N` (ForceUpdate++), nunca `/api/stacks/{id}/git/redeploy` (so git-managed).
- **MCP `permission denied`**: roles nao provisionados -> conferir `MCP_DB_PASSWORD`/`MCP_BI_DB_PASSWORD` no env do `app` e logs do entrypoint.
- **Redeploy manual (ultimo recurso)**: Portainer UI -> Stacks -> `nexus-odoo` -> Update the stack -> "Re-pull image and redeploy".
