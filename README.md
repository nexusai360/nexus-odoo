# nexus-odoo

Plataforma de dados do ERP Odoo da **Matrix Fitness Group** — empresa de
movimentação e entrega de equipamentos de academia.

Duas frentes sobre uma base comum:

- **Dashboard de relatórios** — painel visual com gráficos e relatórios, acesso por perfil.
- **MCP semântico** — camada de consulta para um agente de IA responder perguntas
  sobre a operação (futuramente via WhatsApp).

## Como funciona

O Odoo (instância Tauga) é acessível só via **API XML-RPC** — sem acesso ao banco.
Um worker sincroniza periodicamente os dados do Odoo para um **banco interno (cache)**.
Dashboard e MCP leem desse cache; nunca tocam o Odoo ao vivo.

```
Odoo Tauga ──XML-RPC──▶ Worker (cron) ──▶ Postgres cache ──┬──▶ Dashboard
                                                            └──▶ MCP semântico ──▶ Agente IA
```

## Stack

Next.js 16 · TypeScript · Tailwind v4 · Prisma v7 · PostgreSQL · Redis · BullMQ ·
NextAuth v5 · `@modelcontextprotocol/sdk` · Python (discovery do Odoo).

## Estrutura (planejada)

```
app/        Dashboard Next.js
mcp/        Servidor MCP semântico
worker/     Cron de sincronização XML-RPC
prisma/     Schema do cache (compartilhado)
discovery/  Mapeamento do Odoo (Python)
docs/       Specs, plans, runbooks, fluxo de Git
```

## Roadmap

| Fase | Sub-projeto | Status |
|---|---|---|
| F0 | Discovery do Odoo | a iniciar |
| F1 | Fundação | — |
| F2 | Ingestão / cache | — |
| F3 | Dashboard de relatórios | — |
| F4 | MCP semântico | — |
| F5 | Integração WhatsApp | — |

## Documentação

- `CLAUDE.md` — workflow, arquitetura e decisões canônicas.
- `docs/git-workflow.md` — fluxo de branches e PRs.
- `docs/superpowers/specs/` — especificações por fase.
- `docs/superpowers/plans/` — planos de implementação por fase.

## Ambiente

Copie `.env.example` para `.env.local` (dev) e preencha os valores reais.
`.env.local` e `.env.production` nunca são commitados.

---

Projeto interno **Nexus AI**.
