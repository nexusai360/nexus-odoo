# Runbook: rebuild de containers após mudar código

> **Por que esse runbook existe.** Em 2026-05-25 ficou comprovado que
> as ondas de melhoria do agente (busca fuzzy universal, helpers
> `searchProductByNameWithMeta`, migrations de `unaccent`/`pg_trgm`,
> e o refator dos 4 adapters de LLM) **estavam no código** mas o
> container MCP rodava build de 22/05 — sem volume mount, sem rebuild.
> Resultado: a feature "mola espiral em aço" continuou falhando por
> dias mesmo com fix entregue no Git. Esse runbook existe para isso
> nunca mais acontecer.

## A regra em 1 linha

> **Toda vez que código que um container consome muda, rebuilde aquele
> container antes de validar a feature.** Em dev local é manual. Em
> produção é automático via CI → Portainer.

## REGRA COMPLEMENTAR: criou tabela nova? Dê GRANT.

> **Toda fato/tabela nova lida pelo MCP precisa de `GRANT SELECT` na
> própria migration.** O servidor MCP roda com role `nexus_mcp` (e
> `nexus_mcp_bi` para BI). Sem GRANT explícito, a tool falha com
> `permission denied for table X` (Postgres code `42501`) — invisível
> nos logs do Prisma do app, visível no `mcp_audit_log.error_message`.
>
> Pattern idempotente recomendado (dev local sem roles + prod com roles):
>
> ```sql
> DO $$ BEGIN
>   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
>     EXECUTE 'GRANT SELECT ON <minha_tabela> TO nexus_mcp';
>   END IF;
>   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
>     EXECUTE 'GRANT SELECT ON <minha_tabela> TO nexus_mcp_bi';
>   END IF;
> END $$;
> ```
>
> Esse pattern existe no migration `20260525130000_fato_produto_canonica`
> como referência canônica.

## Mapa de impacto código → container

| Você mudou… | Rebuilde |
|---|---|
| `mcp/**` (ferramentas, dispatcher, catalog) | `mcp` |
| `src/lib/reports/queries/**` (consultas que tools MCP usam) | `mcp` |
| `src/lib/odoo/**` ou worker queues | `worker` |
| `prisma/schema.prisma`, `src/generated/prisma/**`, migrations | **todos** (app + mcp + worker) |
| `src/lib/agent/llm/**` (adapters de LLM) | `app` (e `mcp` se importar daí) |
| `src/**` que não seja MCP/queries/Odoo | `app` |
| `next.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json` | `app` (e `mcp`/`worker` se afetar import) |
| `Dockerfile`, `mcp/Dockerfile`, ou base image | container correspondente |
| Variáveis novas em `.env.*` que o container lê | normalmente só `up -d` basta (sem rebuild) |

> **Em dúvida:** rebuilde só o serviço que provavelmente foi afetado.
> Custo de rebuild errado é baixo (1-2min). Custo de não rebuildar é
> horas de debug.

## Comandos canônicos

```bash
# Rebuild + restart de um serviço (uso mais comum):
docker compose up -d --build mcp

# Rebuild explícito + restart (equivalente, mais legível):
docker compose build mcp
docker compose up -d mcp

# Rebuild todos:
docker compose up -d --build

# Conferir quando o container subiu (data do .StartedAt):
docker inspect nexus-odoo-mcp-1 --format '{{.State.StartedAt}}'

# Conferir data do último commit que mexeu num caminho:
git log -1 --format=%aI -- mcp/

# Comparar as duas para detectar container velho:
echo "Container: $(docker inspect nexus-odoo-mcp-1 --format '{{.State.StartedAt}}')"
echo "Código:    $(git log -1 --format=%aI -- mcp/ src/lib/reports/queries/)"
```

## Gatilhos automáticos (modo autônomo)

Quando estiver em modo autônomo (`/gsd-autonomous`, ou execução de
plano `superpowers:executing-plans`), **rebuilde sem perguntar** em
qualquer um destes cenários:

1. **Fim de onda que mudou caminhos do mapa acima.** Antes da próxima
   onda começar.
2. **Antes de qualquer verificação UI/bubble/playground.** Validação
   contra produto real só roda contra container atualizado.
3. **Antes do `/ultrareview`.** O reviewer precisa ver código rodando,
   não código no Git.
4. **Antes do deploy assistido.** Pré-flight sanity.
5. **Quando outro agente comitar mudança que afeta container do meu
   trabalho.** Detectar via `git fetch && git log HEAD..origin/main`.

## Como verificar que o rebuild surtiu efeito

Antes de declarar a feature pronta:

```bash
# 1. Confirme que arquivo está no container
docker exec nexus-odoo-mcp-1 grep -l "<termo-da-feature>" /app/<caminho> | head -3

# 2. Confirme uptime curto do container
docker inspect <container> --format '{{.State.StartedAt}}'

# 3. Smoke test pela tool real
# (varia por feature — exemplo:)
curl -s http://localhost:3100/health
```

Se passou os 3, a feature está **rodando**, não só commitada.

## Registro em HISTORY.md

Sempre que rebuildar, append em `docs/agents/HISTORY.md`:

```
2026-MM-DD HH:MM | agent=<id> | scope=infra | summary=rebuild <svc> apos onda <X> tocar <caminho>
```

Isso ajuda outros agentes a saber o que está rodando.

## Quando NÃO precisa rebuildar

- Mudou só docs (`docs/**`, `*.md`).
- Mudou só testes (`*.test.ts`) — testes rodam fora do container.
- Mudou só specs/plans em `docs/superpowers/`.
- Mudou só `docs/agents/active/<id>.md` ou `HISTORY.md`.
- Mudou só `next.config.ts` se a mudança não muda imports (raríssimo).

## Em caso de dúvida

`docker compose up -d --build` em tudo. Demora 2-3min e cobre tudo.
