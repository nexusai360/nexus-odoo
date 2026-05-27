# Handoff , Sessão 2026-05-27 agente-qualidade (painel /agente/monitoramento)

> Continuação da sessão anterior (handoff em
> `docs/handoffs/2026-05-27-agente-qualidade-ondas-E-F-G-H.md`). Esta sessão
> focou em 4 frentes: (1) fixes visuais no painel, (2) limpeza/avaliação do
> banco de evaluations, (3) ondas R15/R16 do prompt, (4) revert do R16 após
> regressão.

## Estado final (HEAD `116acfb` na main)

- Branch `feat/agente-nex-inteligencia` deletada (mergeada via PR #14 + #13).
- Branches de fix mergeadas em ordem: #15 → #16 → #17 → #18 → #19 → #20 → #21.
- Repo principal sincronizado com `main`. Next dev (porta 3000) ativo,
  rodando da raiz `/Users/joaovitorzanini/Developer/Claude Code/...`.
- MCP container rebuildado em 03:22Z com a tool nova
  `comercial_pedidos_listar_top_valor`.
- Prompt em baseline R15 (R16 revertido após regressão).

## R15 + R16: o que aconteceu

**R15** (commit `24e2919`, antes do R16): 100 turnos pós-ondas E+F+G+H =
**68% CORRETO / 13% PARCIAL / 4% ERRADO / 15% FORA**. Relatório em
`docs/agent-quality-review/RELATORIO-RODADA-15.md`.

**R16** (commit `993d7dc`, REVERTIDO em `ccdf4f6`): 5 fixes cirúrgicos no
prompt baseados nas 17 falhas reais do R15. Resultado: **66% / 12% / 13% /
9%** , ERRADO triplicou (4 → 13). Causa: a regra "agregue você mesmo"
induziu o mini a inventar somas parciais e contagens. 9 das 13 falhas ERRADO
foram `dado_inventado`. Reverti pro baseline R15. Detalhe em
`docs/agent-quality-review/RELATORIO-RODADA-16.md`.

**Aprendizado meta:** R14 (74%) e R15 (68%) usaram o MESMO prompt e tiveram
6pp de diferença , a bateria sorteia 100 perguntas aleatoriamente de
`test-questions.json`, então comparação % entre rodadas é ruidosa. Pra medir
efeito real de mudança de prompt, alguém precisa modificar
`scripts/quality-audit/03-run-test-questions.ts` pra usar conjunto fixo de
perguntas-âncora.

## Fixes do painel /agente/monitoramento (PRs #15-21)

| PR | Fix |
|---|---|
| **#15** | Status vazio em 24 linhas (gap `FORA_DE_ESCOPO` vs `FORA_DO_ESCOPO`). Coluna Rodada movida pra entre Data e Pergunta, Badge neutro. Filtro Rodada do header com nome (R15·100). Botão "Limpar" foi pra esquerda. Mapeamento marker→rodada em `src/lib/agent/quality/rodada-labels.ts` (R8..R16 hardcoded + fallback). |
| **#16** | Append no HISTORY registrando PR #15. |
| **#17** | Bug crítico do dropdown Rodada: regexp_replace com `\s` em template literal do Prisma virou `s.*$` no PG (não cortava título). Refeito com substring+position , 9 rodadas agora separadas. Altura dos 3 charts 260→420. 4914 evals lixo deletadas. 295 pendentes (R8/R9/R10) avaliados via heurística (`heuristica-v1`) + R14 cancelada → FALHA_TECNICA. |
| **#18** | `getDistinctPatterns` e `getDailyCorrectness` usavam SQL bruto sem `buildWhere` , ignoravam filtro de rodada e modelo. Refatorado pra `findMany + buildWhere`. Agora todos os gráficos respeitam o filtro de Rodada. |
| **#19** | Filtro Rodada vira multi-select com checkboxes (igual ao filtro Status). Page size da tabela 25/50/100 → 50/100/500, default 50. |
| **#20** | Reduzir largura do dropdown Rodada (trigger 180px, popover 200px). |
| **#21** | Fix hydration mismatch no `RodadaMultiSelect` , PopoverTrigger da base-ui renderiza wrapper diferente entre SSR e CSR. Solução: state `mounted` + placeholder div no SSR. |

## Scripts úteis adicionados

```
scripts/quality-audit/apply-r15-r16-results.ts          # aplica results de subagentes no banco
scripts/quality-audit/cleanup-non-audit.ts              # deleta evaluations PENDENTE sem prefixo [AUDIT-]
scripts/quality-audit/fix-status-and-list-markers.ts    # normaliza FORA_DE_ESCOPO + lista markers
scripts/quality-audit/inspect-status.ts                 # distribuição de status
scripts/quality-audit/list-pendentes-por-rodada.ts      # pendentes por marker
scripts/quality-audit/heuristic-eval-pendentes.ts       # avaliação heurística automática
```

## Estado do banco (após sessão)

| status | qtd |
|---|---:|
| CORRETO | ~360 |
| PARCIAL | ~170 |
| ERRADO | ~220 |
| FORA_DO_ESCOPO | ~50 |
| FALHA_TECNICA | 6 |
| PENDENTE | 0 |

**0 pendentes no painel.** As 4914 evals "lixo" (de conversas reais, não de
bateria) foram deletadas. As 295 das baterias antigas (R8/R9/R10) avaliadas
via heurística , `judgeVersion=heuristica-v1` permite reavaliar com
subagentes futuramente se quiser precisão real.

## 9 rodadas no banco (mapeamento canônico)

```
R8  → [AUDIT-POS-2026-05-26T17-21-31]   100 turnos
R9  → [AUDIT-POS-2026-05-26T18-01-27]    97 turnos
R10 → [AUDIT-POS-2026-05-26T18-05-49]   100 turnos
R11 → [AUDIT-POS-2026-05-26T21-58-49]   100 turnos
R12 → [AUDIT-POS-2026-05-26T22-44-49]   100 turnos
R13 → [AUDIT-POS-2026-05-27T01-32-20]   100 turnos
R14 → [AUDIT-POS-2026-05-27T02-47-42]     4 turnos (cancelada)
R15 → [AUDIT-POS-2026-05-27T03-33-55]   100 turnos
R16 → [AUDIT-POS-2026-05-27T04-13-16]   100 turnos
```

Mapeamento vive em `src/lib/agent/quality/rodada-labels.ts`. Pra adicionar
R17+ depois, só estender o `KNOWN_MARKERS` (ou deixar o fallback
`R-DD/MM HH:MM` cobrir).

## Próximos passos sugeridos

1. **Anchor set fixo na bateria** , prioridade pra comparar prompts.
2. **Reavaliar R8/R9/R10 com subagentes** se quiser substituir a heurística
   por avaliação rigorosa.
3. **Continuar evolução do prompt** , o R15 (68%) é o estado atual. Próximas
   mudanças devem ser validadas com bateria reproduzível.
