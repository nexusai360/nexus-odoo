---
agent: claude-consumo-nex-polish
started_at: 2026-05-25T19:38-03:00
branch: feat/f4-leitura-expansao
target_phase: F4 leitura (polish UX da tela /agente/consumo + ajustes pontuais da bubble)
status: in_progress
---

## Tópico
Polish da tela `/agente/consumo` (KPIs sincronizam com o navegador do
gráfico, drillLabel end-inclusive, tag de período sem vírgula, dot
permanente no AreaChart, badge de raciocínio no drill-down, formato
compacto Mi/Bi/Tri/Qua para contagens grandes) e dois bugs pontuais da
bubble do Agente Nex: "Encerrar sessão" mantendo a bubble aberta e
travamento ao fechar pelo X.

## Arquivos que provavelmente vou tocar
- `src/components/agent/consumo/consumo-content.tsx`
- `src/components/agent/consumo/usage-detail-inline.tsx`
- `src/components/charts/interactive/area-chart.tsx`
- `src/components/dashboard/period-navigator.tsx`
- `src/lib/agent/llm/usage-stats.ts`
- `src/lib/agent/llm/format.ts` + `format.test.ts` (novo)
- Documentação em `docs/superpowers/specs/` e `docs/superpowers/plans/`

## Arquivos compartilhados que VOU modificar
- `src/components/agent/agent-bubble.tsx` (compartilhado: src/components/agent/)
  > Mudança fechada e já commitada (33feccd). Não pretendo mexer mais.
- `src/components/agent/agent-message.tsx` (compartilhado: src/components/agent/)
  > **Conflito potencial com `claude-nex-bubble-storytelling`** (active
  > file declara o mesmo arquivo). Minha alteração já está commitada
  > (no commit 8aed04f, junto com mudanças do outro agente — git
  > absorveu por adicionar `-a`): trocar `caughtUp && !streaming` por
  > apenas `!streaming` no `TypewriterBody` para corrigir o bug de
  > "primeira resposta sem negrito". Não pretendo mexer mais; respeito
  > o tópico de animações do outro agente.

## Decisões / contexto importante
- Spec: `docs/superpowers/specs/2026-05-25-consumo-nex-ajustes-design.md`
- Plan: `docs/superpowers/plans/2026-05-25-consumo-nex-ajustes-plan.md`
- Fluxo: spec → reviews internos → plan → reviews internos → execução
  inline (modo autônomo do CLAUDE.md), tudo em Opus 4.7.
- Tool calls no drill-down (D6b) ficou fora desta entrega — exige
  migration + ajuste em 4 adapters. Registrado como follow-up.
- Formato compacto usa NBSP duplo entre número e sufixo (Mi/Bi/Tri/Qua)
  porque espaço comum em HTML/JSX colapsa.

## Commits desta sessão (até agora)
- `71a9d9b` docs(consumo): spec e plan
- `807b4dd` feat(consumo): KPIs sincronizam com gráfico, drillLabel
  inclusivo, dot visível, raciocínio no drill-down, formato compacto
- `536e8bd` style(consumo): sufixos Mi/Bi/Tri/Qua com espaço duplo
- `61f1f58` fix(consumo): remove nota redundante de raciocínio + mais
  espaço capacidades
- `b35caf4` fix(consumo): NBSP no separador do formato compacto
- `33feccd` fix(agent-bubble): encerrar sessão mantém bubble + remove
  travamento ao fechar pelo X
- Bold fix (linha 818-830 de `agent-message.tsx`) absorvido em `8aed04f`
  pelo outro agente.

## Bloqueios
- (vazio)
