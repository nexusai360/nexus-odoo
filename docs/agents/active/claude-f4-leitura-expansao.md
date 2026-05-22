---
agent: claude-f4-leitura-expansao
started_at: 2026-05-21T20:44-03:00
updated_at: 2026-05-22T12:45-03:00
branch: feat/f4-leitura-expansao
target_phase: F4 — L3 (validação do agente Nex)
status: in_progress
---

# agente: claude-f4-leitura-expansao

- **Branch:** `feat/f4-leitura-expansao` (criada de `origin/main`)
- **Tópico:** F4 — Expansão da base de leitura com o novo nível de acesso
  (`joaozanini`, 103 grupos). Mapear 100% do acesso, ampliar cache/fatos/tools
  do MCP, bateria de leitura real (L2) e validação do agente Nex (L3).

## Sessão atual (2026-05-22)

1. **CONCLUÍDO** — Correções L3 (commit 088cb91): tools de contagem (`servico_contar`,
   `comercial_contar_pedidos`, `fiscal_contar_notas`, `preco_contar_regras`) e
   `fiscal_notas_recebidas_por_fornecedor` com `totalAgregado` + filtro CNPJ.
2. **EM CURSO** — L1b + resíduo 4a: camada de referência (NCM, CFOP, CEST, CNAE,
   municípios, alíquotas) como raw consultável + fato/tool para o resíduo
   operacional de 4a (certificado, baixa de lançamento, faturamento, consulta DF-e).
   Depois: bateria L2 de validação de leitura.

## Arquivos que VOU modificar nesta sessão

- `prisma/schema.prisma`, `prisma/migrations/` (novos modelos Raw* / Fato*)
- `src/worker/catalog/model-catalog.ts` (novos modelos de sync)
- `src/worker/fatos/` (builders do resíduo 4a)
- `mcp/tools/`, `mcp/catalog/` (tools novas)
- `src/lib/reports/queries/` (queries novas)
- `mcp/__tests__/integration.test.ts`, testes unitários
- `STATUS.md`, `docs/agents/HISTORY.md`, `docs/superpowers/{specs,plans}/`

## Arquivos compartilhados que VOU modificar

- `mcp/` (catálogo e tools de leitura — só adições, sem tocar write tools)
- `src/lib/reports/` (queries de domínio — só adições)
- `STATUS.md`, `docs/agents/HISTORY.md`

## Coordenação — outro agente ativo

> Há outra sessão Claude em paralelo (terminal diferente) trabalhando no
> **Agente Nex / tela de consumo** (provável `src/components/agent/`).
> Minha sessão **não toca** `src/components/`: trabalho 100% em `mcp/` e
> `src/lib/reports/queries/`. Sem sobreposição de arquivos prevista.

## Observações

- Escrita no Odoo: nunca. Somente leitura.
- Não disparar requisições à OpenAI (custo) sem autorização — bateria L3 fica
  pendente de re-execução.

## Bloqueios

- (nenhum)
