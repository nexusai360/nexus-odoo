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

Correções das tools do MCP rumo a 100% de assertividade na bateria L3, conforme
`docs/superpowers/research/2026-05-22-l3-caminho-100.md`:

- **A** — tools de contagem dedicadas (`servico_contar`, `comercial_contar_pedidos`,
  `fiscal_contar_notas`, `preco_contar_regras`) para resolver a categoria `global`.
- **B** — `fiscal_notas_recebidas_por_fornecedor` ganha `totalAgregado`,
  `totalFornecedoresDistintos` e filtro por `documento` (CNPJ/CPF).

## Arquivos que VOU modificar nesta sessão

- `mcp/tools/cadastros/`, `mcp/tools/comercial/`, `mcp/tools/fiscal/` (novas tools + índices)
- `src/lib/reports/queries/{servicos,comercial,fiscal,precos}.ts` (novas queries de contagem)
- `mcp/__tests__/integration.test.ts` (contagem do catálogo: 41→45 / 42→46)
- `src/lib/reports/queries/*.test.ts` (testes unitários das queries novas)
- `STATUS.md`, `docs/agents/HISTORY.md`

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
