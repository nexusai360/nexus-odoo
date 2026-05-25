---
agent: claude-nex-llm-adapters-modernization
started_at: 2026-05-25T04:25-03:00
last_updated_at: 2026-05-25T05:15-03:00
branch: feat/f4-leitura-expansao
target_phase: F4 leitura (modernização dos adapters de LLM)
status: in_progress
phase: spec+plan_completos__inicio_execucao
last_commits:
  - 459a7e9 (spec phase v3 + 2 reviews + capability table)
  - b23b5b0 (plan phase v3 + 2 reviews)
next_task: T1.1 types.ts (ReasoningEffort + auto, ReasoningContext, ChatResult.streamed)
---

## Tópico
Modernização dos 4 adapters de LLM (OpenAI, Anthropic, Gemini,
OpenRouter) para os endpoints e parâmetros mais atuais, com suporte
real a raciocínio + tools simultaneamente em todos os providers que
oferecem essa combinação. Inclui: migrar OpenAI para `/v1/responses`
como rota canônica para todo modelo com reasoning (não só `-pro`);
adicionar `thinking` no Anthropic Messages API; adicionar
`thinkingConfig` no Gemini 2.5/3.x; passar `reasoning.effort` no
OpenRouter; atualizar `REASONING_LEVELS` no catálogo; testes por
provider; verificação contra API real (Responses do gpt-5.4-nano com
tools, Anthropic com Claude 4.x thinking, Gemini Flash Thinking,
OpenRouter R1).

> Pivot do escopo: a tarefa original era prompt-fidelity. O usuário
> apontou que `gpt-5.4-nano` aceita reasoning + tools via Responses
> API (docs OpenAI confirmam), o que prova que os adapters estão
> arcaicos. Trabalho do prompt fica para depois desta entrega.

## Arquivos que provavelmente vou tocar
- src/lib/agent/llm/providers/openai.ts (refator grande)
- src/lib/agent/llm/providers/anthropic.ts (adicionar thinking)
- src/lib/agent/llm/providers/gemini.ts (adicionar thinkingConfig)
- src/lib/agent/llm/providers/openrouter.ts (passar reasoning)
- src/lib/agent/llm/catalog.ts (REASONING_LEVELS expandido + flags)
- src/lib/agent/llm/types.ts (se precisar carregar mais metadata)
- src/lib/agent/run-agent.ts (remoção da trava ou expansão do checkpoint)
- testes correspondentes em providers/*.test.ts
- docs/superpowers/specs/2026-05-25-llm-adapters-modernization-design.md (NOVO)
- docs/superpowers/specs/2026-05-25-llm-adapters-review-1.md (NOVO)
- docs/superpowers/specs/2026-05-25-llm-adapters-review-2.md (NOVO)
- docs/superpowers/plans/2026-05-25-llm-adapters-modernization-plan.md (NOVO)
- docs/superpowers/plans/2026-05-25-llm-adapters-plan-review-1.md (NOVO)
- docs/superpowers/plans/2026-05-25-llm-adapters-plan-review-2.md (NOVO)

## Arquivos compartilhados que VOU modificar
Nenhum da lista de alta probabilidade de conflito do AGENTS.md. NÃO
vou tocar em:
- src/components/agent/agent-message.tsx (claude-nex-bubble-storytelling)
- src/app/globals.css (claude-nex-bubble-storytelling)

## Decisões / contexto importante
- Outro agente ativo: claude-nex-bubble-storytelling (animações da bubble).
  Áreas disjuntas.
- Modelo ativo hoje: openai/gpt-5.4-nano com reasoning_checkpoint=OFF.
- Trabalho de prompt-fidelity entra em fila pós-entrega.

## Bloqueios
- (vazio)
