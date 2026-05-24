---
agent: claude-agente-nex-config-polish
started_at: 2026-05-24T01:15-03:00
branch: feat/agente-nex-config-polish
target_phase: Agente Nex configuração — polish completo solicitado pelo usuário
status: in_progress
---

## Tópico

Polish completo da tela /agente/configuracao + sincronização de catálogo de
modelos LLM:

1. Alinhamento Provedor x Modelo (botão refresh muda visual)
2. Botão "Atualizar modelos" mais visível (texto sublinhado roxo)
3. Sync trazendo modelos 2024+ ordenados por data (novo → antigo) e
   custo (caro → barato) dentro de cada data, com pricing oficial
4. Sync para os 4 providers (hoje só OpenAI + OpenRouter)
5. Sync também identifica suporte a raciocínio
6. Limpeza de modelos órfãos no banco (preço sob consulta) e na whitelist
7. "Outro (digitar manualmente)" fixo no TOPO da lista de modelos
8. Tag de provedor neutra à esquerda da tier-badge para OpenRouter
9. Tag verde "FREE" para modelos free do OpenRouter
10. Mais modelos para Anthropic, Gemini, OpenRouter
11. Espaçamento do título "Recursos" igual ao bottom do card
12. Lista de "Nível de esforço" adaptada por provider (já é)

## Arquivos que VOU tocar

- src/lib/agent/llm/types.ts (CostTier + free)
- src/lib/agent/llm/catalog.ts (filtros 2024+, tag provedor, expansão)
- src/lib/agent/llm/sync-catalog.ts (Anthropic, Gemini, reasoning, filtros)
- src/lib/agent/llm/sync-whitelist.ts (ampliar OpenAI, Anthropic, Gemini)
- src/components/ui/tier-badge.tsx (tier free verde)
- src/components/ui/provider-badge.tsx (NOVO)
- src/components/ui/searchable-select.tsx (startAdornment opcional)
- src/components/agent/llm-config-form.tsx (botão refresh visível,
  Outro no topo, provider badge)
- src/components/agent/reasoning-card.tsx (revisão)
- src/app/(protected)/agente/configuracao/page.tsx (padding Recursos)
- scripts/cleanup-llm-model-entry.ts (NOVO)
- prisma/migrations/* (se reasoningLevels precisar de seed)

## Arquivos compartilhados de alto risco

- src/lib/agent/llm/catalog.ts (mudança em lista/filtro afeta outros consumidores)
- src/components/ui/searchable-select.tsx (usado em outros lugares)
- src/components/ui/tier-badge.tsx (idem)

Antes de tocar shared: git log -5 + ls active.

## Bloqueios

- (nenhum)
