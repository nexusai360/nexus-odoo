# Relatório Rodada 8 — Fix do drift funcionou, recuperação parcial

**Data:** 2026-05-26 (tarde)
**Marker:** `[AUDIT-POS-2026-05-26T16-39-11]`
**Total:** 98 turnos avaliados (100 disparados, 2 timeouts)
**Commits desta sequência:** `e4298cf` (reverteu R2-R7+1I+1G) + `c90197b` (flag usesCodeDefaults)

## Veredito

**Recuperação real e mensurável.** R8 saltou de **38% (R7) → 63.3% (R8)** depois do fix do drift dev/banco. Confirma a hipótese: o problema das rodadas anteriores era o banco sobrescrevendo o código, não o prompt em si.

## Evolução completa

| Rodada | CORRETO | PARCIAL | ERRADO | FORA_ESCOPO | Total | Comentário |
|---|---|---|---|---|---|---|
| **R4 (baseline)** | **73.8%** | 17.9% | 4.5% | 3.8% | 290 | Prompt enxuto (só R1 + exemplos) |
| R5 (+R8+R2-7) | 50.2% | 32.9% | 7.3% | 9.7% | 289 | Empilhou regras inegociáveis |
| R6 (+sanit+1I+1G) | 40.5% | 48.8% | 3.1% | 7.6% | 289 | Pior ainda — 1I+1G amplificaram |
| R7 (db override) | 38.0% | 50.0% | 5.0% | 7.0% | 100 | Reversão NÃO efetivou — banco sobrescrevia código |
| **R8 (flag fix)** | **63.3%** | 21.4% | 9.2% | 6.1% | 98 | Drift resolvido, prompt enxuto ativo |

## Patterns (Top da R8)

| Pattern | R4 | R5 | R6 | R7 | R8 | Comentário |
|---|---|---|---|---|---|---|
| `acerto_objetividade` | 198 | 134 | 110 | 38 | **58** | Voltou a dominar |
| `pediu_clarificacao_desnecessaria` | 5 | 102 | 139 | 80+ | **~0** | ✅ Resolvido |
| `nao_usou_tool` | 0 | 2 | 47 | alto | **~0** | ✅ Resolvido |
| `entendeu_mal_termo` | 11 | 3 | 3 | 5 | **12** | ⚠️ Subiu — vale investigar |
| `dado_inventado` | 14 | 7 | 6 | 5 | **8** | Estável-baixo |
| `resposta_truncada` | 10 | 7 | 1 | 0 | 9 | Voltou (sem R3 forçando agregação) |

## Causa raiz identificada e corrigida

**Drift dev/banco** (commit `c90197b`):
- Antes: `agent-config.ts:ensureGlobalSettings` copiava `IDENTITY_BASE` do código pro banco quando vazio. Depois disso, banco virava fonte e mudanças no código eram ignoradas.
- Depois: nova flag `usesCodeDefaults` controla a fonte. Default `true` → código é fonte da verdade. Auto-flip pra `false` só quando admin salva via UI `/agente/prompt`. Botão futuro "Voltar ao padrão" reseta pra `true`.
- Tanto `mapSettings` (agent-config) quanto `loadAgentSettings` (run-agent) agora respeitam a flag.

Resultado: dev edita `identity-base.ts` → mudança reflete imediatamente. Sem mais UPDATE manual no banco.

## Gap remanescente (63% → 74%+)

10.5pp abaixo do R4 baseline. Hipóteses (a investigar em ondas futuras):

1. **Amostra menor** (98 vs 290 perguntas) tem mais variância. Variabilidade natural pode explicar parte.
2. **ERRADO subiu pra 9.2%** (vs 4.5% R4). `dado_inventado` 8 + `entendeu_mal_termo` 12 sugerem que removi as REGRAS #4 (não invente) e #6 (busca por nome) que cobriam esses casos. Trade-off real: ganhei objetividade mas perdi proteção factual.
3. **`resposta_truncada` voltou** (9 vs 0 em R7): sem REGRA #3 (agregação obrigatória), agente truncou de novo.

## Próximos passos sugeridos (sem fazer ainda)

1. **Bateria 9 com 300 perguntas** pra reduzir variância e confirmar 63% (ou ver se sobe pra ~70+ com amostra maior).
2. Se gap persistir, **reintroduzir 1-2 regras chave de forma incremental** (uma por rodada, mensurando):
   - Primeiro: regra de agregação (R3) — provavelmente recupera `resposta_truncada` sem causar regressão de tom (R3 é cálculo, não "inegociável")
   - Depois: regra anti-invenção REFORMULADA (sem tom "INEGOCIÁVEL") — tipo "se não tem certeza, prefira incompleto a inventado"
3. **Onda 3a** (`/agente/qualidade`) pode prosseguir em paralelo — schema já está aplicado.

## Conquistas técnicas além da métrica

- **Drift dev/banco resolvido em definitivo** com flag boolean simples
- **Schema Onda 3a parcialmente aplicado** (tabela `ConversationQualityEvaluation` migrada)
- **Sanitização tool results** continua funcionando (factual_bate alto)
- **Guardrail factual** continua ativo
- **Custo limitado**: bateria reduzida (100q) gastou ~30% dos tokens de uma bateria completa
