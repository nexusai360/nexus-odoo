---
agent: claude-f4-onda2-crm-completo
started_at: 2026-05-23T15:50-03:00
branch: feat/f4-onda2-crm-completo
target_phase: F4 Onda 2 (escrita) — Onda 1 do plano da spec 2026-05-20-f4-onda2-mcp-escrita-design
status: in_progress
---

## Tópico

Implementar a Onda 1 (CRM completo) do MCP de escrita: estender o catálogo
de WriteToolEntry para cobrir `res.partner` (update/delete/transition),
`crm.lead`, `crm.team`, `crm.stage`, `crm.tag`, `crm.lost.reason`. Validar
end-to-end contra a base de teste `teste_grupojht` (única que tem dados
desses modelos sem depender do refresh com módulos de operação).

## Arquivos que provavelmente vou tocar

- `mcp/tools/crm/*.ts` (novas tools)
- `mcp/catalog/registry.ts` (registro das novas tools)
- `mcp/lib/errors.ts` (se faltar algum erro tipado)
- `scripts/e2e/*.ts` (scripts de validação E2E)
- `docs/superpowers/specs/2026-05-23-f4-onda2-onda1-crm-completo*.md`
- `docs/superpowers/plans/2026-05-23-f4-onda2-onda1-crm-completo*.md`
- `docs/tauga-base-teste-bloqueio.md`

## Arquivos compartilhados que VOU modificar

- Nenhum dos da lista de alto risco do AGENTS.md (não toco
  `prisma/schema.prisma`, `CLAUDE.md`, `package.json`, `sidebar.tsx`,
  componentes do agente). Mexer só em `mcp/`, `docs/` e `scripts/`.

## Decisões / contexto importante

- Canal de escrita já validado E2E contra `teste_grupojht` (uid=11).
  Script: `scripts/e2e/test-write-partner.ts`.
- `clientFromEnv("write")` sem fallback para `ODOO_*` (commit anterior).
- Spec mãe: `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md`
  §2.2 e §10.x, que delega Ondas 1-7 a sub-specs.
- Onda 1 não depende do refresh com módulos de operação (CRM já existe na
  base teste).

## Bloqueios

- A investigação completa (registrada em
  `docs/laudo-f4-onda2-realidade-tauga.md`) mostrou que a spec mãe da
  F4 Onda 2 (2026-05-20) partiu de premissa errada: assumiu modelos padrão
  do Odoo (`crm.lead`, `sale.order`, `purchase.order`, `stock.picking`,
  `account.move`, etc.) que **não existem no Odoo da Tauga, nem em prod**.
  O ERP é todo custom (`pedido.*`, `sped.*`, `finan.*`, `contabil.*`,
  `estoque.*`). Aguardando decisão do usuário sobre executar a Onda 1
  redefinida (`res.partner` completo, único escopo executável hoje sem
  destravamento da Tauga) e sobre a mensagem para a Tauga (§7 do laudo).
