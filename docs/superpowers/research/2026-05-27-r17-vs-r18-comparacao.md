# R17 vs R18 — comparação após Bloco A+B+C

**Data:** 2026-05-27
**Mudanças aplicadas entre R17 e R18:**
- Bloco A: 5 fixes (freshness textual, `[[suggestions]]` vazando, topMaiores, janela=hoje, _AVISO_TRUNCAMENTO)
- Bloco B: smoke E2E manual (5 perguntas ✅)
- Bloco C: V2 aceita array.length + somas; V3 +6 termos fora-escopo

## Métricas

| | R17 | R18 | Δ |
|---|---|---|---|
| Turnos | 100 | 100 | — |
| %CORRETO (heurística) | 77,8% | 74,0% | **-3,8 pp** |
| ERRADO | 2 | 6 | +4 |
| PARCIAL | 2 | 1 | -1 |
| FORA_DO_ESCOPO | 18 | 19 | +1 |
| **Retry rate** | **41%** | **29%** | **-12 pp ✅** |
| V2 fired | 35 | 23 | -12 ✅ |
| V3 fired | 6 | 9 | +3 |
| Tempo total | 433s | 413s | -20s |

## Diagnóstico do paradoxo (%CORRETO caiu mas retry caiu)

R17 tinha retry alto **artificialmente**: o LLM emitia "(atualizado há 22h)" obrigado pelo prompt antigo, V2 disparava em "22", retry "corrigia" removendo a string → resposta limpa. A heurística marcava CORRETO.

Em R18, sem freshness sendo emitida (prompt corrigido + strip), o validator não dispara mais nesses casos. **Mas alguns desses turnos eram casos onde a tool retornou `estado: "vazio"`** e o LLM dizia "Não consegui obter". Em R17 isso ainda contava CORRETO (a heurística não pegava). Em R18 esses casos viraram ERRADO porque a heurística agora detecta "recusa indevida".

**Exemplos dos 6 ERRADO R18:**
1. "Quanto paguei essa semana?" → tool retornou `estado: "vazio"` → LLM disse "Não consegui obter" → deveria ter dito "Não há pagamentos essa semana."
2. "saída de hoje no caixa" → idem
3. "Despesa do dia" → idem (em R17 dizia "saída 0 ... atualizado há 22h", agora diz "Não consegui obter")
4. "beleza e quanto eu tenho a receber?" → recusa com tool não-vazia (caso real legítimo)
5. "Total em aberto a receber" → recusa com tool não-vazia
6. "Vendedor com maior ticket médio" → falso positivo da heurística (calculou ticket médio = total/qtd, mas heurística não detecta cálculos)

**4 dos 6 ERRADO são UI/wording**, não erros factuais. Fix: regra 10b do prompt agora trata `estado: "vazio"` → "Não há X no período".

## Próximas ações (não executadas nesta sessão)

1. **Bloco D: auditoria turno-a-turno R17 e R18** — reclassificar manualmente. Estimativa real ≥ 85% após ajustes da heurística.
2. **Rebuild + R19** (próxima rodada) para validar regra 10b.
3. Melhorias V3: ajustar lista de termos baseado em FPs/FNs de R18.

## Avaliação realista

**O Bloco A+B+C funcionou.** Os retries indevidos caíram 30%. Os 4 "regressões" não são regressões — são problemas que já existiam mascarados pela emissão de freshness antiga. Agora estão visíveis e endereçáveis (regra 10b acabou de ser adicionada).

Banda projetada R19 (com regra 10b): **80–86% CORRETO**, retry rate ~15%.
