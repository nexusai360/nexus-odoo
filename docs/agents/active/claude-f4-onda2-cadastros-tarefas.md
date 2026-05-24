---
agent: claude-f4-onda2-cadastros-tarefas
started_at: 2026-05-23T22:00-03:00
branch: feat/f4-onda2-cadastros-tarefas
target_phase: F4 Onda 2 (escrita) - Onda 1 redefinida (cadastros + tarefas)
status: in_progress
---

## Tópico

Implementar primeira leva de write tools do MCP focada em cadastros e
tarefas (já 100% validados E2E via API JSON-RPC oficial — ver
`docs/laudo-f4-onda2-crm-cadastros-tarefas.md`). Cobrir res.partner
completo (update/transition/delete), res.partner.category (criar/usar
tags), mail.activity (criar/atualizar/concluir tarefas).

Em paralelo: auditar a página `/integracoes/servidor-mcp/docs` (componente
`McpDocsContent`), atualizar visual para destacar tools write x read,
checar inventário de read tools vs documentadas, e injetar as novas write
tools com toda a documentação seguindo o padrão (curl/n8n/python/javascript).

## Arquivos que provavelmente vou tocar

- `mcp/tools/cadastros/*.ts` (novos arquivos de write)
- `mcp/tools/cadastros/index.ts` (registrar)
- `mcp/tools/crm/*.ts` (revisar res_partner.create existente)
- `mcp/catalog/index.ts` (assegurar registro)
- `mcp/catalog/api-key-catalog.ts` (capabilities novas)
- `mcp/lib/errors.ts` (erros novos se precisar)
- `mcp/__tests__/**/*.test.ts` (testes unit + e2e do escopo)
- `scripts/e2e/test-write-*.ts` (scripts e2e manuais reusáveis)
- `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx` (UI doc)
- `prisma/migrations/*` (se capabilities exigirem migration)
- `docs/superpowers/specs/2026-05-23-f4-onda2-cadastros-tarefas-{,v2,v3}.md`
- `docs/superpowers/plans/2026-05-23-f4-onda2-cadastros-tarefas-{,v2,v3}.md`

## Arquivos compartilhados que VOU modificar

- `mcp/server.ts` (talvez, se houver mudança no pipeline de write)
- `mcp/dispatcher/external-pipeline.ts` (talvez)
- `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`
- `prisma/schema.prisma` SE precisar de campos novos para audit/capability

Antes de tocar shared, vou checar histórico recente e outros agentes ativos.

## Decisões / contexto importante

- Onda 1 redefinida (NÃO é a Onda 1 da spec original, que assumia modelos
  Odoo padrão inexistentes na Tauga). O usuário decidiu não implementar
  CRM próprio agora; vai investigar uso do CRM da Tauga depois.
- Todas as 4 tools `res.partner.*` rodam contra API JSON-RPC oficial
  (sem dependência do `tauga_api_post`).
- `mail.activity` é Odoo padrão, sempre funciona.
- `res.partner.category` (tags) idem.
- Modo de auth: tools de escrita exigem **EXTERNO** (API key com
  capability). NUNCA acessíveis via interno (agente Nex).
- Documentação UI: padrão existente é o `mcp-docs-content.tsx` (1229
  linhas), com seções "Visão Geral", "Autenticação", "Conceitos", "Fluxo
  de uma chamada", "Tools" (agrupadas por módulo), "Códigos de erro",
  "Rate limits". As tools no painel já vêm via `catalogo` (server action
  `getMcpCatalogSchema`), então só preciso garantir que o componente
  renderize bem o operation="write" (cor + ícone diferentes).

## Bloqueios

- (nenhum por enquanto)
