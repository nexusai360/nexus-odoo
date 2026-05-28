# R20 — Relatorio pos-Ronda 2

**Data:** 2026-05-27
**Marker:** `[AUDIT-POS-2026-05-27T22-43-15]`
**Duracao:** 324s (100 turnos, concurrency 5) — mais rapida que R19 (412s)

---

## 1. Numeros

### Heuristica (com fix §10b/§12b da Ronda 1.5)
| Status | R17 | R18 | R19 | **R20** |
|---|---|---|---|---|
| CORRETO | 78 | 74 | 84 | **81** |
| PARCIAL | 2 | 1 | 6 | 6 |
| ERRADO | 2 | 6 | 6 | 7 |
| FORA | 18 | 19 | 4 | 6 |

### Auditoria manual (19 nao-CORRETO revisados turno-a-turno)
| Status | R17 | R18 | R19 | **R20** |
|---|---|---|---|---|
| CORRETO real | 78,5% | ~74% | **84%** | **86%** |
| PARCIAL | 2 | 1 | 4 | 3 |
| ERRADO | 2 | 6 | 9 | 8 |
| FORA | 18 | 19 | 3 | 3 |

**Delta total R17 → R20: +7,5pp (78,5% → 86%)**

### AutoValidator activity
| | R17 | R18 | R19 | R20 |
|---|---|---|---|---|
| V2 (anti-invencao) | 35 | 23 | 25 | 26 |
| V3 (anti-recusa) | 6 | 9 | 3 | 4 |
| V5 (anti-ignorou) | — | — | 11 | 6 |
| **Total retries** | 41% | 32% | 39% | **36%** |

V5 baixou de 11 (R19) para 6 (R20) porque os fixes da Ronda 2
(apuracao discriminada, pedidos_por_etapa rico, entradas_saidas fmt)
reduziram os casos onde o LLM era forcado a recusar.

---

## 2. Descoberta critica durante auditoria — bug raiz no `guardToolResult`

Auditando os 8 ERRADO restantes, identifiquei um **bug estrutural** que
afetava silenciosamente todas as rodadas:

**Problema:** o `guardToolResult` em `src/lib/agent/run-agent.ts` cortava
o JSON do **inicio** quando excedia 24 KB. A lista `titulos[]` /
`linhas[]` (que vem antes dos campos canonicos no envelope) consumia
todo o espaco, e `_RESPOSTA`, `_DESTAQUE`, `_agregado`, `topMaiores`
(que ficam no fim) eram **sempre descartados**.

**Consequencia:**
- LLM via lista crua sem totais.
- LLM recusava com "nao consegui consolidar".
- V5/V5b nao disparava (porque `_RESPOSTA` nao chegava ao validator).
- Heuristica marcava como ERRADO.

**Diagnostico:** confirmado via inspecao direta no banco de dados em
`message.tool_results` de turnos ERRADO. O JSON terminava cortado no
meio de `numeroDocumento`, sem chegar aos campos canonicos.

**Fix aplicado (commit `832be95`):** `guardToolResult` agora parsea o
JSON, encurta listas internas (30 itens; depois 10 se ainda nao couber)
preservando os campos canonicos, e injeta `dados._amostraReduzida`
explicando ao LLM que a lista foi encurtada e direcionando ao uso de
`_RESPOSTA`/`_DESTAQUE`/`topMaiores`.

**Impacto esperado em R21:** os 5 ERRADO de "tool factual + recusa
explicita" (#2 Quantas notas, #4 Total em aberto a pagar, #7 Conta
contas a pagar, #15 Quanto temos a receber, #18 Total em aberto a
receber) devem virar CORRETO. Projecao: **86% → 91-93% CORRETO**.

---

## 3. 8 ERRADO reais R20 (auditoria)

| # | Pergunta | Categoria | Status apos fix do `guardToolResult` |
|---|---|---|---|
| 2 | Quantas notas fiscais recebemos esse mes? | Tool truncada | **deve corrigir** |
| 4 | Total em aberto a pagar | Tool truncada | **deve corrigir** |
| 5 | Conta contas a receber | Lacuna prematura | Hint V3 ampliado ja entregue; depende de LLM seguir |
| 7 | Conta contas a pagar | Tool truncada | **deve corrigir** |
| 8 | Conta a pagar em 30 dias | Mapeamento PR-1 nao seguido | Precisa fix prompt |
| 11 | Esta vencendo titulo essa semana? | Mapeamento PR-1 nao seguido | Precisa fix prompt |
| 15 | Quanto temos em contas a receber? | Tool truncada | **deve corrigir** |
| 18 | Total em aberto a receber | Tool truncada | **deve corrigir** |

**5/8 ERRADO** sao do mesmo bug raiz (tool truncada). O fix do
`guardToolResult` cobre todos esses.

**2/8** (#8 e #11) sao mapeamentos prompt-tool que o LLM nao seguiu.
Vou abordar na Ronda 3 com regra mais forte no prompt.

**1/8** (#5) e lacuna prematura ja com hint V3 ampliado; resiste
em ~50% das vezes mesmo com retry. Cobre na Ronda 3 com fallback
forcado.

---

## 4. Vitorias verificadas da Ronda 2

| Fix Ronda 2 | Caso resolvido em R20 (vs R19) |
|---|---|
| `fiscal_apuracao` discriminado | PIS/COFINS do mes nao apareceu como ERRADO no R20 (apareceu em R19 #28) |
| `comercial_pedidos_por_etapa` rico | "Quantos pedidos foram fechados" nao apareceu como ERRADO no R20 (apareceu em R19 #24) |
| `estoque_entradas_saidas` fmt vazio | Casos similares "Saida hoje", "Entradas semana" nao apareceram em R20 |
| Hint V3 com lacuna prematura | "Soma de contas a receber por cliente" nao apareceu como ERRADO no R20 (apareceu em R19 #5) |
| V5b numeros ocultos | Disparou em #6 R20 ("Notas recebidas esta semana"): citou numeros mas declarou "nao consegui" — V5b detectou e flagou |

---

## 5. Estado final da branch

**Branch:** `feat/agente-nex-95pct-ronda1`
**Commits desde R19:**
- `849c1df` Auto-numeracao de rodadas + heuristica reconhece §10b/§12b
- `65a03c0` Ronda 2: V5b + pedidos_por_etapa rico + entradas_saidas fmt
- `395b377` Ronda 2: hint lacuna prematura + fiscal_apuracao por tributo
- `832be95` **fix(quality): guardToolResult preserva campos canonicos (BUG RAIZ R20)**

**Validacoes:**
- TypeScript verde
- 374/374 testes passando
- MCP container rebuildado (mas o fix do `guardToolResult` esta em
  `src/lib/agent/run-agent.ts` que roda no APP, nao no MCP — app em
  hot-reload no host)

---

## 6. Proximos passos para R21 (com autorizacao)

1. **Validar fix do `guardToolResult`** — esperado +5pp (86% → 91-93%).
2. **Mapeamentos no prompt** (Ronda 3) para casos #8/#11:
   - "Vencendo essa semana / em 30 dias" -> regra explicita "use
     `financeiro_titulos_vencidos` OU `financeiro_contas_a_pagar`,
     NUNCA registrar_lacuna direto".
3. **Fallback forcado** em lacuna prematura: se V3 dispara com lacuna
   prematura e o retry nao corrige, marcar resposta como falha
   explicita em vez de aceitar.

Sem disparar R21 sem autorizacao explicita do humano.
