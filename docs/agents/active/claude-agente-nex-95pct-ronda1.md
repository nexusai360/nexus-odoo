---
agent: claude-agente-nex-95pct-ronda1
started_at: 2026-05-27T14:10-03:00
branch: feat/agente-nex-95pct-ronda1
target_phase: F4 onda 1 - qualidade Agente Nex (Ronda 1 do laudo R17+R18)
status: in_progress
---

## Tópico
Ronda 1 do plano rumo a 95% (laudo `docs/superpowers/research/2026-05-27-laudo-final-r17-r18-rumo-95.md`).
Objetivo: sair de 76% (R17+R18) para 80-86% via 3 frentes:

1. **Auditoria turno-a-turno R17 + R18** (44 não-CORRETO) com critério rigoroso,
   reclassificando heurística cega -> avaliação contextual.
2. **Validator V5 anti-ignorou_RESPOSTA**: detectar quando LLM recusa apesar
   de `_RESPOSTA` curado existir no envelope (Categoria C do laudo).
3. **Disparar R19** com a regra §10b já ativa + V5 em modo active para
   validar a cura da Categoria A (vazio mal traduzido) e C (recusa indevida).

## Arquivos que provavelmente vou tocar
- src/lib/agent/validation/auto-validator.ts (adicionar V5)
- src/lib/agent/validation/auto-validator.test.ts (testes V5)
- src/lib/agent/run-agent.ts (integração V5 no fluxo de retry)
- prisma/schema.prisma (flag validator_v5_enabled, aditivo)
- docs/agent-quality-review/auditoria-r17-r18-manual.md (output da auditoria)
- scripts/quality-audit/audit-manual-batch.ts (script auxiliar de leitura)

## Arquivos compartilhados que VOU modificar
- prisma/schema.prisma (1 coluna nova, aditiva, sem migration destrutiva)

## Decisões / contexto importante
- Branch criada a partir de main = 1270018 (incluindo trabalho do outro
  agente: fix lock zumbi 15min, OOM fix concurrency 5, paralelo, sync-config).
- Heurística atual de classificação está em scripts/quality-audit/03-*.ts
  (vide /tmp/audit-r17.py para o algoritmo); ela classifica como FORA todos
  os turnos que usaram `registrar_lacuna`, mascarando ~15 ERRADOs reais.
- Auditoria manual NÃO precisa script novo de IA - é leitura caso a caso
  do envelope vs resposta vs pergunta, marcando reclassificação no banco
  via UPDATE em conversation_quality_evaluations.

## Bloqueios
- (vazio)
