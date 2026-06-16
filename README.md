# nexus-odoo

Plataforma de dados do ERP Odoo da **Matrix Fitness Group** — empresa de
movimentação e entrega de equipamentos de academia.

Duas frentes sobre uma base comum:

- **Dashboard de relatórios** — painel visual com gráficos e relatórios, acesso por perfil.
- **MCP semântico** — camada de consulta para o agente de IA (Nex) responder
  perguntas sobre a operação, in-app e via WhatsApp.

## Como funciona

O Odoo (instância Tauga) é acessível só via **API JSON-RPC** — sem acesso ao banco.
(O XML-RPC foi descartado: quebra no `fields_get` de modelos com metadados da
customização SPED da Tauga; a F0 comprovou o JSON-RPC estável.) Um worker
sincroniza periodicamente os dados do Odoo para um **banco interno (cache)** em
duas frentes: incremental a cada 3 minutos e snapshot/reconcile a cada 24 horas.
Dashboard e MCP leem desse cache; nunca tocam o Odoo ao vivo. A escrita (tools
`write:*` do MCP) é a única exceção que vai ao Odoo, sempre seguida de sync
direcionado da linha afetada.

```
Odoo Tauga ──JSON-RPC──▶ Worker (cron) ──▶ Postgres cache ──┬──▶ Dashboard (app)
                                                            └──▶ MCP semântico ──▶ Agente Nex
```

## Stack

Next.js 16 · TypeScript · Tailwind v4 · Prisma v7 · PostgreSQL · Redis · BullMQ ·
NextAuth v5 · `@modelcontextprotocol/sdk` (transporte Streamable HTTP) · Python
(discovery do Odoo).

## Estrutura

```
app/        Dashboard Next.js (container "app")
mcp/        Servidor MCP semântico (container "mcp")
worker/     Cron de sincronização JSON-RPC (container "worker")
prisma/     Schema do cache, compartilhado (126 tabelas raw_* + 40 fato_*)
discovery/  Mapeamento do Odoo (Python)
docs/       Specs, plans, runbooks, fluxo de Git
```

Containers em produção: `app`, `mcp`, `worker`, `db` (Postgres) e `redis`.

## Roadmap

| Fase | Sub-projeto | Status |
|---|---|---|
| F0 | Discovery do Odoo | concluída |
| F1 | Fundação (login, RBAC) | concluída |
| F2 | Ingestão / cache (worker + cron) | concluída |
| F3 | Dashboard de relatórios | concluída |
| F4 | MCP semântico (todos os domínios, em ondas) | concluída e em produção |
| F5 | Integração WhatsApp + Agente Nex | em execução |
| F6 | Construtor de relatórios | planejada |

O servidor MCP expõe hoje **121 tools** (112 de leitura, 9 de escrita) sobre os
domínios fiscal, comercial, cadastros, financeiro, estoque, contábil e CRM.
Leitura responde do cache; escrita vai ao Odoo, gated por capability da chave de
API e idempotência.

## Documentação

- `CLAUDE.md` — workflow, arquitetura e decisões canônicas.
- `STATUS.md` — ponto de retomada: o que foi feito e a próxima ação.
- `docs/git-workflow.md` — fluxo de branches e PRs.
- `docs/runbooks/deploy-procedure.md` — deploy (auto via Shepherd) e troubleshooting.
- `docs/superpowers/specs/` e `/plans/` — especificações e planos por fase (histórico).

## Deploy

O merge na `main` dispara o build da imagem no GitHub Actions; o **Shepherd**
(dentro da VPS) detecta a imagem nova no ghcr e atualiza os serviços `app`, `mcp`
e `worker` sozinho, um por vez. Detalhes e fallback manual em
`docs/runbooks/deploy-procedure.md`.

## Ambiente

Copie `.env.example` para `.env.local` (dev) e preencha os valores reais.
`.env.local` e `.env.production` nunca são commitados.

---

Projeto interno **Nexus AI**.
