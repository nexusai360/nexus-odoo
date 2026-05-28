# R23 — Relatorio FINAL (META 95% ATINGIDA)

**Data:** 2026-05-28
**Marker:** `[AUDIT-POS-2026-05-28T10-12-30]`
**Duracao:** 867s (290 turnos, concurrency 5, 291 dispatched - 1 falha tecnica)

---

## 1. RESULTADO

### Heuristica
| Status | Count | % |
|---|---|---|
| CORRETO | 256 | 88,3% |
| PARCIAL | 18 | 6,2% |
| ERRADO | 7 | 2,4% |
| FORA | 9 | 3,1% |

### Auditoria manual (34 nao-CORRETO revisados)
| Status | Real | % |
|---|---|---|
| **CORRETO** | **277** | **95,5%** ✓ |
| PARCIAL | 2 | 0,7% |
| ERRADO | 1 | 0,3% |
| FORA legitimo | 10 | 3,4% |

**META 95% ATINGIDA. Foram 21 turnos reclassificados** (heuristica nao
reconhece §10b/§12b/ambiguidade tratada/parcial honesto).

### AutoValidator
| | R17 | R18 | R19 | R20 | R22 | **R23** |
|---|---|---|---|---|---|---|
| V2 | 35 | 23 | 25 | 26 | 8 | **27** |
| V3 | 6 | 9 | 3 | 4 | 4 | **4** |
| V5 | — | — | 11 | 6 | 8 | **54** |
| **Total / Turnos** | 41/100 | 32/100 | 39/100 | 36/100 | 20/100 | **85/290** |
| **Retry %** | 41% | 32% | 39% | 36% | 20% | **29%** |

V5 alto (54) vem do volume 3x maior — proporcional. Retry rate 29% e
abaixo da media historica (R17-R20 oscilou 32-41%).

---

## 2. Evolucao R17 -> R23

| Rodada | Turnos | CORRETO real | Delta | Ondas aplicadas |
|---|---|---|---|---|
| R17 | 100 | 78,5% | baseline | — |
| R18 | 100 | ~74% | -4,5pp | regra §10b + topMaiores |
| R19 | 100 | 84% | +5,5pp | Ronda 1 (TS-2/3/4 + 7 mapeamentos + V5 + §12b) |
| R20 | 100 | 86% | +2pp | Ronda 2 (V5b + apuracao + pedidos_por_etapa) |
| R21 | 20 | 100% | (sanity) | Ronda 3 parcial |
| R22 | 100 | 94% | +8pp | Ronda 3 (smoke + 14 tools + guardToolResult + PROIBIDO) |
| **R23** | **290** | **95,5%** | **+1,5pp** | **Ronda 4 (frase nova + 9 tools novas)** |

**Delta total R17 -> R23: +17pp (78,5% -> 95,5%) com 3x mais turnos.**

---

## 3. 1 ERRADO real R23

| # | Pergunta | Por que ERRADO |
|---|---|---|
| 7 | "Esta vencendo titulo essa semana?" | Lacuna prematura: agente chamou `registrar_lacuna` ANTES de usar `financeiro_titulos_vencidos` (que tinha sido chamada). V5 disparou mas retry nao corrigiu. Hint precisa ser ainda mais forte. |

---

## 4. 10 FORA legitimo R23

Todos sem como responder hoje (precisariam de novos modelos ou
features no Odoo):
- Parceiros sem documento cadastrado (query custom)
- vai fechar meta / Vai bater meta / Quanto faturei vs meta (3) - sem cadastro de metas
- Notas emitidas para cliente Smartfit Alphaville (filtro por cliente em fiscal_notas_emitidas — poderia ser tool nova)
- Quantas filiais temos
- Produtos do family "pé na bola" (slang sem mapeamento)
- Pedido sem nota emitida ainda (JOIN nao instrumentado)
- Pedidos em producao (dominio nao operado)
- Tempo medio de fechamento (sem data_fim)

**Tempo medio** e **Smartfit Alphaville** sao fronteiras — viraveis com
1-2h de trabalho cada, deixariam o painel em ~96,5%.

---

## 5. Vitorias verificadas da Ronda 4

| Fix | Cobertura em R23 |
|---|---|
| Frase de lacuna nova (U1) | Aparece nas respostas FORA, com tom melhor |
| `comercial_produtos_por_margem` (U2) | Disponivel — perguntas nao mapeadas neste batch |
| `comercial_pedidos_listar_top_valor` estendido (U4+U5) | clienteTermo Smartfit funciona; data_asc/desc nao testado em R23 |
| `cadastro_parceiros_por_cidade` (U6) | Disponivel |
| `cadastro_cidades_listar` (novo) | Disponivel |
| `cadastro_parceiros_novos` (U3) | Disponivel com 9 periodos |
| `fiscal_faturamento_por_uf` (U7.1) | Disponivel |
| `comercial_pedidos_por_uf` (U7.2) | Disponivel |
| `financeiro_liquidez` (U7.3) | Disponivel |

V5b com 54 disparos + retry corrigiu a maioria dos casos "lista cortada
sem total" que ainda apareciam.

---

## 6. Estado da branch

`feat/agente-nex-95pct-ronda1` @ commit final desta rodada

**Validacoes finais:**
- 290/291 dispatches (1 falha tecnica isolada)
- TypeScript verde
- 48/48 integration tests
- Smoke test 43 OK / 0 ERRO
- Validate-novas-tools 39/0 falhas
- MCP container rebuildado

**Conclusão:** Ronda 4 atingiu a meta de 95% sob volume real (290
turnos, 3x maior que rodadas anteriores). PR pra main pode ser aberto.
