---
agent: claude-f4-leitura-expansao
started_at: 2026-05-21T20:44-03:00
updated_at: 2026-05-22T16:40-03:00
branch: feat/f4-leitura-expansao
target_phase: F4 — L2 (bateria de validação de leitura)
status: in_progress
---

# agente: claude-f4-leitura-expansao

- **Branch:** `feat/f4-leitura-expansao` (criada de `origin/main`)
- **Tópico:** F4 — Expansão da base de leitura com o novo nível de acesso
  (`joaozanini`, 103 grupos). Mapear 100% do acesso, ampliar cache/fatos/tools
  do MCP, bateria de leitura (L2) e validação do agente Nex (L3).

## Sessão atual (2026-05-22) — progresso

1. **CONCLUÍDO** — Correções L3 das tools (commit 088cb91): tools de contagem +
   `fiscal_notas_recebidas_por_fornecedor` com `totalAgregado`/filtro CNPJ.
2. **CONCLUÍDO** — Onda L1c (resíduo 4a): 3 modelos raw, `fato_certificado`,
   tool `fiscal_certificados`, `excludeFields` no sync. Verificado.
3. **CONCLUÍDO** — Onda L1b (camada de referência): 27 modelos raw,
   `fato_referencia`, tool `referencia_buscar`. Verificado (22.288 entradas).
4. **CONCLUÍDO** — Onda I: ingestão completa dos 114 modelos do cache.
5. **EM CURSO** — Bateria L2: harness `scripts/f4l-l2-harness.ts` que confere
   as tools de leitura contra o Odoo. 1ª corrida: 55/56 tools ok. Ajustando o
   harness e investigando 2 achados de fidelidade de sync (modelos da F2).

## Arquivos que TOCO nesta sessão

- `prisma/schema.prisma`, `prisma/migrations/` (modelos Raw*/Fato* novos — feito)
- `src/worker/catalog/`, `src/worker/fatos/`, `src/worker/odoo/field-selection.ts`
- `mcp/tools/` (cadastros, comercial, fiscal), `mcp/catalog/`, `mcp/lib/freshness.ts`
- `src/lib/reports/queries/`, `src/lib/agent/bi-schema-reference.ts`
- `scripts/f4l-*.ts`, `mcp/__tests__/integration.test.ts`
- `docs/superpowers/{specs,plans,research}/`, `docs/agents/HISTORY.md`

## Coordenação multi-agente

> Há outras sessões Claude em paralelo (terminais diferentes). Esta sessão
> trabalha **só** em `mcp/`, `src/worker/`, `src/lib/reports/`,
> `src/lib/agent/bi-schema-reference.ts`, `prisma/`, `scripts/` e `docs/`.
> **Não toca** `src/components/`, `src/app/` (front-end) — área das outras
> sessões (ex.: tela de consumo do Agente Nex). Sem sobreposição prevista.
> Commits seletivos (nunca `git add -A`).

## Observações

- Escrita no Odoo: nunca. Somente leitura.
- Não disparar requisições à OpenAI (custo) — bateria L3 fica no gate do
  usuário.

## Bloqueios

- (nenhum)
