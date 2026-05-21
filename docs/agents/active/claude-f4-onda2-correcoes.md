# Agente: claude-f4-onda2-correcoes

- **Início:** 2026-05-21
- **Branch:** `feat/f4-onda2-mcp-escrita`
- **Tópico:** Correções da F4 Onda 2 — rework integral da UI do painel Servidor MCP,
  correção de conceito do "Plugar MCPs", documentação no padrão NFE Nexus.
- **Modo:** sessão principal, Opus 4.7, sem subagentes. `ui-ux-pro-max` em toda UI.

## Arquivos compartilhados que VOU modificar

- `src/components/integracoes/servidor-mcp/*` (visao-geral, chaves-lista, logs-timeline, docs-*)
- `src/components/agent/plugar-mcps-content.tsx`
- `src/app/(protected)/integracoes/servidor-mcp/**`
- `src/app/(protected)/agente/plugar-mcps/page.tsx`
- `src/content/mcp-docs/**`
- `prisma/schema.prisma` (model novo p/ MCPs externos) + nova migration
- `STATUS.md`, `docs/superpowers/plans/`, `docs/superpowers/specs/reviews/`

## Estado

Sessão única ativa no repo. Sem outros agentes. Execução autônoma autorizada
pelo usuário (não interromper até concluir tudo).
