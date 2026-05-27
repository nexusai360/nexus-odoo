---
agent: claude-nex-bubble-storytelling
started_at: 2026-05-25T02:35-03:00
branch: feat/f4-leitura-expansao
target_phase: F4 leitura (polish UX)
status: in_progress
---

## Tópico
Polish das animações da bubble do Agente Nex: tornar a sequência
"Pensando -> Consultando -> Raciocínio + resposta" uma narrativa contínua
e orquestrada (cross-fade do header, cross-fade do ícone do step, reveal
da resposta com delay para aparecer DEPOIS da trilha colapsar, typing
word-by-word com cadência deliberada).

## Arquivos que provavelmente vou tocar
- src/components/agent/agent-message.tsx
- src/app/globals.css (keyframe nexWordIn)

## Arquivos compartilhados que VOU modificar
- src/components/agent/agent-message.tsx (compartilhado: src/components/agent/)

> Nenhum outro agente está em docs/agents/active/ neste momento.
> Último commit em src/components/agent/agent-message.tsx é meu desta
> sessão (continuação direta do trabalho de claude-nex-bubble-polish
> registrado em HISTORY 2026-05-25 02:05).

## Decisões / contexto importante
- Sequência alvo: shimmer "Pensando" -> steps entram com cross-fade ->
  no done a trilha colapsa primeiro (300ms), header faz cross-fade
  textual e o ícone Sparkles morfa em Chevron, ÍCONE do step running ->
  done com cross-fade, e SÓ ENTÃO o corpo da resposta entra (delay 320ms,
  duração 450ms) com typing word-by-word lento (480ms por palavra,
  stagger até 320ms).
- Mantida a arquitetura "única bolha" (UiMessage role=assistant criada
  já no thinking).
- Sem dependências novas, sem mudanças de API.

## Bloqueios
- (vazio)
