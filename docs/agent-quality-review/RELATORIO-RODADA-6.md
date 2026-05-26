# Relatório Rodada 6 — REGRESSÃO SEVERA, recomendação de revert

**Data:** 2026-05-26
**Marker:** `[AUDIT-POS-2026-05-26T15-20-22]`
**Total:** 289 turnos avaliados (291 disparados, 2 timeouts)
**Branch:** `feat/agente-nex-inteligencia`
**Commits desta rodada:** `6c64b18` (Onda 1 prompt) + `f548e0a` (PLAN doc) + Onda 2 commit (sanitização)

## Veredito direto

**Rodada 6 PIOROU MAIS que a Rodada 5.** Apesar de avanços REAIS (ERRADO caiu pra mínimo histórico, factual subiu pra 94.7%), o efeito colateral de tornar o agente tímido virou catastrófico.

## Números

| Status | R4 | R5 | R6 | Δ vs R4 |
|---|---|---|---|---|
| CORRETO | 214 (73.8%) | 145 (50.2%) | **117 (40.5%)** | **-33pp** |
| PARCIAL | 52 (17.9%) | 95 (32.9%) | 141 (48.8%) | +31pp |
| ERRADO | 13 (4.5%) | 21 (7.3%) | **9 (3.1%)** | **-1.4pp ✅** |
| FORA_ESCOPO | 11 (3.8%) | 28 (9.7%) | 22 (7.6%) | +3.8pp |

## Conquistas reais

1. **Guardrail factual+sanitização funcionaram**: `dado_inventado` caiu de 14 → 7 → **6** (-57%).
2. **Factual bate** subiu de 90.6% → **94.7%**: quando o agente chama tool, ele acerta MAIS.
3. **ERRADO** atingiu mínimo histórico (3.1% — abaixo da R4).
4. **Sanitização não causou regressão** (validado pelo gate offline + factual subindo).

## Regressão catastrófica

| Padrão | R4 | R5 | R6 |
|---|---|---|---|
| **pediu_clarificacao_desnecessaria** | 5 | 102 | **139** |
| **nao_usou_tool** (NOVO) | 0 | 2 | **47** |
| acerto_objetividade | 198 | 134 | 110 |

## Causa raiz identificada

Inspeção das amostras revelou que **a mudança 1I (mover identidade do `identity-base` pra `DEFAULT_PERSONALITY`) virou tóxica em combinação com 1G (4 defaults novos)**:

1. Exemplo flagrante: pergunta "Buscar cliente Smartfit Escola de Ginastica" → resposta começa com **"Sou o assistente de operação da Matrix Fitness Group. Encontrei 20 cadastros..."**
2. A frase "Sou o assistente..." que eu pus em personality foi pensada pra usar SÓ quando perguntassem "quem é você". O LLM passou a usar como abertura de resposta GERAL, virando tom burocrático.
3. Tom burocrático = aversão a risco = `nao_usou_tool` + `pediu_clarificacao_desnecessaria`.
4. Os 4 defaults novos da R1 ("Conta X", "Quantos X", etc) provavelmente também contribuíram pra inflar a "tabela de defaults" e diluir a regra principal.

## Hipóteses alternativas (descartadas)

- ❌ Onda 2 (sanitização): factual subiu, dado_inventado caiu — funcionou conforme esperado
- ❌ Mudança 1A (R3.5): só removeu texto morto
- ❌ Mudança 1E (10 itens): só padronizou número
- ✅ Mudança 1I + 1G: causa quase certa

## Recomendação

**Reverter Ondas 1+2 inteiras** (commits `6c64b18` + commit Onda 2) e voltar pro estado pré-onda. Manter SÓ:
- Guardrail factual já validado (commit `4cf68ec` continua válido)
- Documentos de spec/plan (não tocam código)

**Próximos passos após revert (sem fazer ainda):**

1. Confirmar revert volta a ≥73% via bateria 7 (controle)
2. Aplicar apenas as 2 mudanças mais inócuas (A: remover R3.5 + E: padronizar 10) — sem 1I nem 1G
3. Medir bateria 8 isoladamente
4. Se voltar a 73%+, aí avaliar 1I e 1G separadamente em ondas sucessivas (não juntas)
5. **Re-projetar 1I**: identidade NÃO deve ir pra personality como agora. Deve voltar pro identity-base mas em UMA seção, sem repetição. Personality fica pra voz/tom, não pra identidade institucional.
6. **Re-projetar 1G**: tabela R1 não deve crescer indefinidamente. Talvez consolidar como "princípio geral" em vez de adicionar linhas.

## Aprendizado meta

Cada onda anterior eu fiz 4-5 mudanças combinadas. Imposível identificar qual quebrou o quê. Erro de método. **Próxima vez: 1 mudança por bateria**. Mais lento mas mensurável.

## Pergunta ao usuário

Posso reverter Ondas 1+2 agora (revert dos 2 commits) e disparar bateria 7 só pra confirmar que volta a ≥73%?
