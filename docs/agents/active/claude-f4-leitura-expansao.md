# agente: claude-f4-leitura-expansao

- **Início:** 2026-05-21
- **Branch:** `feat/f4-leitura-expansao` (criada de `origin/main`)
- **Tópico:** F4 — Expansão da base de leitura com o novo nível de acesso
  (`joaozanini`, 103 grupos). Mapear 100% do acesso, ampliar cache/fatos/tools
  do MCP e superfícies de front-end, bateria de leitura real (L2) e validação
  do agente Nex (L3).

## Sub-projetos

- **L1** — Expansão da base de leitura (raw + fatos + tools MCP + front-end).
- **L2** — Bateria de leitura real (1000+ leituras conferidas contra o Odoo).
- **L3** — Validação do agente Nex (1000+ perguntas, meta 97-100% de acerto).

## Arquivos compartilhados que VOU modificar

- `prisma/schema.prisma` (novos modelos `Raw*` / `Fato*`)
- `prisma/migrations/`
- `src/worker/catalog/model-catalog.ts`
- `src/worker/fatos/registry.ts`
- `mcp/` (catálogo e tools de leitura)
- `src/lib/reports/` (domínios)
- `STATUS.md`, `docs/agents/HISTORY.md`
- `.env.local` (não versionado)

## Observações

- Trabalho independente do PR #10 (`feat/f4-onda2-mcp-escrita`, escrita). Sem
  sobreposição de arquivos prevista até o merge.
- Escrita no Odoo: nunca. Somente leitura, e somente na base de produção.
