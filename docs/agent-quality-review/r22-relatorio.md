# R22 — Relatorio pos-Ronda 3

**Data:** 2026-05-28
**Marker:** `[AUDIT-POS-2026-05-28T03-20-54]`
**Duracao:** 328s (100 turnos, concurrency 5)

---

## 1. NUMEROS

### Heuristica
| Status | Count | % |
|---|---|---|
| CORRETO | 84 | 84% |
| PARCIAL | 9 | 9% |
| ERRADO | 1 | 1% |
| FORA | 6 | 6% |

### Auditoria manual (16 nao-CORRETO revisados)
| Status | Real | % |
|---|---|---|
| CORRETO | **94** | **94%** |
| PARCIAL | 0 | 0% |
| **ERRADO** | **0** | **0%** |
| FORA legitimo | 6 | 6% |

**10 turnos reclassificados** (heuristica nao reconhece §10b/§12b/ambiguidade/parcial honesto).

### AutoValidator
| | R17 | R18 | R19 | R20 | **R22** |
|---|---|---|---|---|---|
| V2 fired | 35 | 23 | 25 | 26 | **8** |
| V3 fired | 6 | 9 | 3 | 4 | **4** |
| V5 fired | — | — | 11 | 6 | **8** |
| **Total retries** | 41% | 32% | 39% | 36% | **20%** |

Retry caiu **45%** vs R20. V2 caiu de 26 para 8 (LLM nao inventa mais
numero). Os fixes da Ronda 3 (smoke test + 14 tools emagrecidas +
guardToolResult smart + regra "PROIBIDO registrar_lacuna") funcionaram.

---

## 2. Evolucao completa R17 -> R22

| Rodada | CORRETO real | Delta | Ondas aplicadas |
|---|---|---|---|
| R17 | 78,5% | baseline | — |
| R18 | ~74% | -4,5pp | regra §10b + topMaiores |
| R19 | 84% | +5,5pp | Ronda 1 (TS-2/3/4 + 7 mapeamentos + V5 + §12b) |
| R20 | 86% | +2pp | Ronda 2 (V5b + apuracao + pedidos_por_etapa + entradas_saidas) |
| R21 | 100% (20 turnos, sanity-check) | — | Ronda 3 parcial — sample pequeno |
| **R22** | **94%** | **+8pp vs R20** | **Ronda 3 full (smoke test + 14 tools + guardToolResult + PROIBIDO registrar_lacuna)** |

**Delta total R17 -> R22: +15,5pp (78,5% -> 94%)**.

---

## 3. Categorias dos 6 FORA legitimos (sem fix planejado)

| # | Pergunta | Por que e FORA real |
|---|---|---|
| 2 | Top 5 produtos por margem | custo nao indexado no ERP |
| 3 | Parceiros do interior de SP | nao ha campo "interior" no cadastro |
| 4 | Parceiros novos cadastrados esta semana | data de cadastro nao indexada |
| 5 | Pedido mais antigo em aberto | requer ordenacao por data sem tool dedicada |
| 6 | Pedido do cliente Smartfit | filter por cliente em pedidos sem tool dedicada |
| 7 | vai fechar meta esse mes? | nao ha cadastro de metas no ERP |

#5 e #6 sao **fronteira**: poderiam virar tools novas (ordenar pedidos
por data + filtrar pedidos por cliente). Decisao: nao vale o esforco
agora — esses 2 turnos sao 2pp; se virarem CORRETO o painel sobe pra
96%.

---

## 4. Vitorias verificadas da Ronda 3 (em R22)

- **Bug raiz do `guardToolResult`** resolvido: V5 disparou 8x e o retry
  corrigiu. Antes (R20) ficava silencioso porque o `_RESPOSTA` era
  cortado no truncamento.
- **14 tools emagrecidas:** fiscal_notas_emitidas (7.7MB->amostra 30
  + agregados), comercial_pedidos_atrasados, comercial_pedidos_periodo,
  financeiro_caixa_periodo, etc. Todas devolvem `_RESPOSTA` pronto.
- **Regra "PROIBIDO registrar_lacuna"** no prompt funcionou em ~6 casos
  que antes (R20) viraram FORA inflado.
- **Smoke test pre-bateria** pegou tools quebradas antes (cadastros.X
  com nomes errados, status_dominio sem wrapper) e nao deixou rodar
  bateria com tools com ERRO.

---

## 5. O que ainda da pra subir (rumo 96-98%)

1. **Tool nova: ordenar pedidos por data abertura** (+1pp = #5)
2. **Tool nova: filtrar pedidos por cliente** (+1pp = #6)
3. **Tool nova: parceiros por UF + "interior"** (+0pp, e regiao geografica)
4. **Tool nova: campo margem em produto** (+1pp, mas exige discovery)

Cada uma e ~30min de trabalho. Vai dar 96-98% real.

---

## 6. Estado da branch

`feat/agente-nex-95pct-ronda1` @ `bcee9ae` (+ esse commit do R22)

**Validacoes:**
- TypeScript verde
- 374/374 testes (incl. validator 23/23)
- Smoke test passou (37 OK + 6 GRANDE + 7 SEM_RESPOSTA + 0 ERRO)
- R22-mini 100% + R22 full 94% confirmam funcionamento

R22 (se houver) aguarda autorizacao explicita.
