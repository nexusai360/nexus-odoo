# Relatório R16 , 100 turnos pós 5 fixes cirúrgicos do prompt

Data: 2026-05-27
Marker: `[AUDIT-POS-2026-05-27T04-13-16]`
Modelo: gpt-5.4-mini
Duração: 355s

## Totais

| Status | Quantidade | % |
|---|---:|---:|
| CORRETO | 66 | 66% |
| PARCIAL | 12 | 12% |
| ERRADO | 13 | 13% |
| FORA_DE_ESCOPO | 9 | 9% |

## Comparativo

| Rodada | CORRETO | PARCIAL | ERRADO | FORA |
|---|---:|---:|---:|---:|
| R14 | 74% | 23% | 0% | 3% |
| R15 | 68% | 13% | 4% | 15% |
| **R16** | **66%** | **12%** | **13%** | **9%** |

## Precisão factual

| Métrica | Valor |
|---|---:|
| bate | 62 |
| nao_bate | 17 |
| nao_aplicavel | 21 |
| Precisão | **78.5%** (R15: 92.4%) |

## Diagnóstico , por que o R16 regrediu

As 5 mudanças aplicadas no prompt (commit `993d7dc`) foram revertidas no commit `ccdf4f6`. Motivo:

A regra **"Tool retornou ok = você TEM o dado (REGRA CRÍTICA) , OBRIGATÓRIO agregar você mesmo"** induziu o `mini` a inventar números em vez de desistir. **9 das 13 falhas ERRADO são `dado_inventado`**:

- Soma parcial reportada como total (Smartfit R$ 533k em vez de R$ 678k real) , 5 turnos.
- Tool de redirect ignorada , `registrar_lacuna` mandou chamar tool X, agente não chamou mas inventou números (R$ 1.352.659,18 sem origem em tool result).
- Contagens inventadas (519 pedidos, 170 notas, 70 cadastros) sem aparecer em nenhum tool result.

**Tradeoff observado:**

- ANTES (R15): agente desistia (4 erros, mas pelo menos honestos).
- DEPOIS (R16): agente inventava (13 erros, mais perigosos).

## Aprendizado meta , bateria não é determinística

R14 (74%) e R15 (68%) usaram o **mesmo prompt** e tiveram diferença de 6pp. As 100 perguntas da bateria são sorteadas aleatoriamente de `test-questions.json` a cada execução. Comparar % entre baterias sem normalizar é otimizar contra ruído.

**Próximo passo recomendado** (não executado nesta sessão): trocar o sample aleatório por um conjunto fixo de perguntas-âncora pra medir efeito real de cada mudança de prompt.

## Estado final

- Prompt no commit `ccdf4f6` = baseline R15 (sem as 5 mudanças do R16).
- Tool `comercial_pedidos_listar_top_valor` mantida (commit `6d7a592`).
- 200 evaluations (R15 + R16) aplicadas no banco via `scripts/quality-audit/apply-r15-r16-results.ts`.
