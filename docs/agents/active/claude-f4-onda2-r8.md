# Agente: claude-f4-onda2-r8

- **Branch:** `feat/f4-onda2-mcp-escrita`
- **Tópico:** Rodada 8 (feedback por áudio + prints, 2026-05-21). Webhooks no padrão de
  card + modal; Plugar MCP com abas (Visão Geral, Servidores, Logs de MCP externo).
- **Spec:** `docs/superpowers/specs/2026-05-21-f4-onda2-r8-webhooks-plugar-mcp.md`.
- **Plano:** `docs/superpowers/plans/2026-05-21-f4-onda2-r8.md`.
- **Modo:** sessão principal, Opus 4.7, sem subagentes. `ui-ux-pro-max` em toda UI.
  Sem travessão. Metodologia completa: spec v3 (2 reviews) -> plan v3 (2 reviews) ->
  execução -> verificação.

## Arquivos previstos
- `prisma/schema.prisma` (modelo `ExternalMcpCallLog`) + migration
- `src/lib/agent/mcp-client.ts` (captura das chamadas)
- `src/lib/actions/external-mcp-call-log.ts` (consulta, nova)
- `src/components/integracoes/webhooks-content.tsx`, `webhook-edit-dialog.tsx`
- `src/components/integrations/webhook-wizard.tsx`
- `src/components/agent/plugar-mcps-content.tsx` (split em abas)
- `src/app/(protected)/agente/plugar-mcps/` (layout + rotas das abas)
- `src/lib/tours/webhook-tour.ts`, `plugar-mcps-tour.ts`

## Em execução nesta sessão.
