---
agent: claude-nex-renaissance
started_at: 2026-05-24T17:18-03:00
branch: feat/f4-leitura-expansao
target_phase: Renascimento do Agente Nex (segmento A + sugestoes personalizadas)
status: in_progress
---

## Tópico
Execucao do "Renascimento do Agente Nex" (spec master v3 em
`docs/superpowers/specs/2026-05-24-agente-nex-renaissance-master.md`).
Sessao atual: complementar segmento A (sanitizer em Server Actions,
migration SQL pra dados existentes) + segmento A2 novo (welcome suggestions
personalizadas por usuario com auto-aprendizado das conversas anteriores).

## Arquivos que provavelmente vou tocar
- `src/lib/agent/welcome-suggestions.ts` (extend para personalizado)
- `src/lib/actions/welcome-suggestions.ts` (novo, Server Action)
- `src/lib/agent/personalized-suggestions/` (novo modulo)
- `src/components/agent/chat-panel.tsx` (busca personalizada no mount)
- `src/components/agent/agent-bubble.tsx`
- `src/app/(protected)/layout.tsx` (sem alteracao prevista)
- `src/lib/actions/agent-config.ts` (sanitizer wiring nas Server Actions de prompt)
- `prisma/migrations/2026XXXXXX_sanitize_agent_settings/` (migration de dados)
- `docs/superpowers/specs/2026-05-24-welcome-personalizado-spec.md` (novo)

## Arquivos compartilhados que VOU modificar
- `src/components/agent/chat-panel.tsx` (alta probabilidade de conflito;
  verificar tail de HISTORY antes de cada edit)
- `src/components/agent/agent-bubble.tsx` (idem)
- `src/lib/actions/agent-config.ts` (idem)

## Decisões / contexto importante
- Segmento A foi parcialmente entregue em commits anteriores (b5c6add e
  outros recentes). Continuando do ponto de parada documentado em
  `docs/superpowers/plans/2026-05-24-segmento-A-higiene-prompt.md`.
- Novidade desta sessao: sub-segmento "Welcome Personalizado" desenhado
  por solicitacao do usuario em 2026-05-24 17:14, vide screenshot da
  bubble com sugestoes default ainda visiveis. Algoritmo: 1 slot top
  all-time + 2 slots top recentes (28d) por usuario logado, mapeando
  tool calls do historico para perguntas template.

## Bloqueios
Nenhum no momento.
