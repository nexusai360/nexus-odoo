---
agent: claude-agente-nex-config-recursos
started_at: 2026-05-22T16:45-03:00
updated_at: 2026-05-22T17:25-03:00
branch: feat/f4-leitura-expansao
target_phase: F5 (reorganizacao Configuracao/Recursos do Agente Nex)
status: blocked
---

## Topico
Reorganizar Configuracao/Recursos do Agente Nex: mover Recursos para a tela
de Configuracao, respiro Chave/Consumo, card de modo raciocinio, catalogo de
modelos atualizavel. Spec/plano em docs/superpowers/ (2026-05-22-agente-nex-config-*).

## Progresso (plano 2026-05-22-agente-nex-config-recursos.md)
CONCLUIDO (tasks exclusivas):
- T1: pesquisa de suporte a raciocinio (research doc)
- T2: catalog.ts declara reasoning + helpers (commit 3882f87)
- T8: Recursos migra de Prompt para Configuracao (commit aac795a)
- T9: respiro Chave de API / Consumo (commit daefcc4)
- T13: componente ReasoningCard (commit 9fc07a9)

BLOQUEADO (aguardando claude-agente-nex-melhorias liberar arquivos
compartilhados — regra de coordenacao do usuario):
- T3, T11: prisma/schema.prisma (migrations LlmModelEntry + reasoning)
- T12: src/lib/actions/agent-config.ts
- T14: src/components/agent/resources-toggles.tsx
- T15: src/lib/agent/llm/providers/openai.ts
- T4-T7, T10: dependem de T3 (cadeia do catalogo hibrido)

## Retomada
Quando o claude-agente-nex-melhorias encerrar (active file removido),
executar T3-T7, T10-T12, T14-T15 do plano, depois a Fase 5 (verificacao).

## Bloqueios
- Arquivos compartilhados ainda em uso pelo claude-agente-nex-melhorias
  (Fases D/E do plano dele tocam resources-toggles, agent-config, schema, openai).
