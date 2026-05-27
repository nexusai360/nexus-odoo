# Relatório Rodada 5 — RETROCESSO

**Data:** 2026-05-26
**Marker:** `[AUDIT-POS-2026-05-26T12-12-53]`
**Total:** 289 turnos avaliados (291 disparados, 2 timeouts)
**Branch:** `feat/agente-nex-inteligencia`
**Commits desta rodada:** `7f33a9d` (guardrails + R8)

## Veredito

**A rodada 5 piorou o sistema.** Apesar do guardrail factual ter reduzido invenções (-50%), uma regressão massiva da REGRA #1 (não pedir clarificação) anulou o ganho e empurrou o sistema para trás.

## Números Comparativos

| Status | Rodada 4 | Rodada 5 | Delta |
|---|---|---|---|
| CORRETO | 214 (73.8%) | 145 (50.2%) | **-69 (-23.6pp)** |
| PARCIAL | 52 (17.9%) | 95 (32.9%) | +43 (+15.0pp) |
| ERRADO | 13 (4.5%) | 21 (7.3%) | +8 (+2.8pp) |
| FORA_DE_ESCOPO | 11 (3.8%) | 28 (9.7%) | +17 (+5.9pp) |

## Padrões — O Que Melhorou

| Padrão | r4 | r5 | Δ |
|---|---|---|---|
| dado_inventado | 14 | 7 | **-7** (guardrail funcionou) |
| entendeu_mal_termo | 11 | 3 | -8 |
| resposta_truncada | 10 | 7 | -3 |
| parametro_incompleto | 8 | 4 | -4 |

## Padrões — O Que Piorou (CATASTRÓFICO)

| Padrão | r4 | r5 | Δ |
|---|---|---|---|
| **pediu_clarificacao_desnecessaria** | **5** | **102** | **+97 (20×)** |
| acerto_objetividade | 198 | 134 | -64 |
| fluxo_tool_incompleto | 10 | 14 | +4 |
| formato_quebrado | 3 | 5 | +2 |

## Causa Raiz

99 dos 102 casos de `pediu_clarificacao_desnecessaria` têm `TOOLS=NENHUMA` — o agente nem tentou chamar uma tool antes de pedir esclarecimento. Exemplos típicos da rodada 5:

- **"Pedido sem nota emitida ainda"** → "Para te trazer do jeito certo, preciso de 2 confirmações..."
- **"Quantas filiais temos?"** → "Pra te responder certo, só preciso confirmar o que você chama de filiais..."
- **"Conta contas a pagar"** → "Para eu te passar o número certo, me confirma só uma coisa..."
- **"Notas recebidas do fornecedor Casa Ferolla"** → "preciso só do período..."

Todas violam a REGRA #1 ABSOLUTA. Na rodada 4 esses casos eram respondidos com defaults (mês corrente, top 10, etc).

## Hipótese de Mecanismo

A REGRA #8 ("TOOL VAZIA = DIGA VAZIA") adicionada no prompt, com 24 linhas reforçando "NUNCA invente / declare ausência", parece ter empurrado o agente para um modo defensivo onde **prefere perguntar a arriscar**. O efeito é o oposto do desejado: em vez de evitar invenção quando a tool retornar vazio, o agente está evitando CHAMAR A TOOL para não correr risco.

## Ganhos Reais (Isolados)

- **Guardrail factual R$ + empty-result**: o que foi medido como objetivo funcionou. Casos críticos da rodada 4 (#3694548f, #8185fe09) seriam pegos. O guardrail no código não é responsável pela regressão.
- **dado_inventado**: -50% (14 → 7).
- **entendeu_mal_termo**: -73% (11 → 3).

## Recomendação Honesta

**Reverter o commit `7f33a9d` ou, no mínimo, remover a REGRA #8 do prompt** e manter apenas os guardrails de código (`findInventedValues` + `detectsHallucinatedNonEmpty` + prompt de correção endurecido). Esses funcionam sem alterar o comportamento ativo do agente.

Reproposta de mudança mínima:
1. Reverter SOMENTE o bloco R8 em `identity-base.ts` (linhas 110-133)
2. Manter o código em `run-agent.ts` (guardrails são defesa em produção)
3. Rodar bateria 6 para validar que volta a 73-74% CORRETO + queda em dado_inventado

## Métricas de Verificação Factual

- Rodada 4: factual bate em 242/267 com toolResults (90.6%)
- Rodada 5: factual bate em 140/152 com toolResults (92.1%) — **leve melhora**

Ou seja: quando o agente DE FATO chamou tool, ele acertou mais. O problema é que chamou tool em muito menos casos (152 vs 267).

## Próximo Passo

Aguardar decisão do usuário sobre reverter R8.
