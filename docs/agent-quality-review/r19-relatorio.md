# R19 - Relatorio pos-Ronda 1

**Data:** 2026-05-27
**Branch:** feat/agente-nex-95pct-ronda1
**Marker:** `[AUDIT-POS-2026-05-27T21-50-50]`
**Duracao:** 412s (100 turnos, concurrency 5)

---

## 1. Numeros R19

### Heuristica (com bugfix Bloco 5)
| Status | Count | % |
|---|---|---|
| CORRETO | 66 | 66% |
| PARCIAL | 22 | 22% |
| ERRADO | 8 | 8% |
| FORA | 4 | 4% |

### Auditoria manual (34 nao-CORRETO revisados turno-a-turno)
| Status | Real | % |
|---|---|---|
| CORRETO | **84** | **84%** |
| PARCIAL | 4 | 4% |
| ERRADO | 9 | 9% |
| FORA | 3 | 3% |

**18 turnos reclassificados como CORRETO** porque a heuristica nao reconhece
quando o agente cumpre a §10b ("nao ha X") ou a §12b (clarificacao).

### AutoValidator activity
| Validador | Disparos R17 | R18 | **R19** |
|---|---|---|---|
| V1 anti-truncamento | 0 | 0 | 0 |
| V2 anti-invencao | 35 | 23 | 25 |
| V3 anti-recusa | 6 | 9 | 3 |
| V4 anti-placeholder | 0 | 0 | 0 |
| **V5 anti-ignorou_RESPOSTA (novo)** | — | — | **11** |
| **Total retries** | 41 (41%) | 32 (32%) | **39 (39%)** |

V5 disparou 11x e o retry corrigiu corretamente na maioria (logs mostram
"retry OK V5 dur=Xms"). V3 caiu de 9 para 3 — sinal que o prompt §10b
esta cumprindo e o caso "tool vazio = nao consegui" ficou mais raro.

---

## 2. Evolucao consolidada

| Rodada | CORRETO real | Validator | Mudancas |
|---|---|---|---|
| R17 | 78,5% | V1-V4 active | baseline |
| R18 | ~74% (heur) / similar real | V1-V4 active | regra §10b + topMaiores + V2/V3 expandidos |
| **R19** | **84%** | **V1-V5 active** | **Ronda 1: TS-2/3/4 + 7 mapeamentos + V5 + §12b expandida** |

**Delta R17 -> R19:** +5,5pp (78,5% -> 84%). Dentro da banda projetada
(80-86%) do laudo final.

---

## 3. Onde os fixes funcionaram (vitorias verificadas)

### Bloco 4 (§12b expandida) — 8 vitorias
Perguntas que antes viravam ERRADO "Nao consegui obter" agora viram
clarificacao limpa:
- "quais notas?" -> "Voce quer emitidas, recebidas ou vencidas?"
- "qual cliente?" -> "Cadastrado, faturamento ou titulos?"
- "saldo do produto" -> "Qual produto?"
- "Fornecedor sem cadastro" -> "Listar, especifico ou ativos?"
- "Pedidos por estado" -> "Status, UF ou etapa?"
- "show, e do mes anterior?" -> "Faturamento, pedidos ou estoque?"
- "Diferenca entre contas a receber e a pagar" -> resposta conceitual correta
- "Conta contas a receber" -> sigma de normalizacao funcionou em alguns,
  mas falhou em 1 (#33 continuou disparando V2 e desistindo)

### Prompt §10b (vazio = nao ha) — 6 vitorias
Antes: "Nao consegui obter essa informacao agora."
Agora:
- "Despesa do dia" -> "Nao ha despesa registrada hoje"
- "Saida da semana passada" -> "Nao ha saida na semana passada"
- "Quanto vai sair essa semana?" -> "Nao ha saida registrada nesta semana"
- "O que entrou e saiu hoje?" -> "Nao encontrei registros de entradas ou
  saidas para hoje"
- "Titulos vencidos hoje" -> "Nao ha titulos vencidos hoje. Total vencido:
  R$ 0,00 em 0 titulos" (perfeito)
- "Quero ver entradas dos ultimos 7 dias" -> "Nao ha entradas nos ultimos
  7 dias"

### V5 (anti-ignorou_RESPOSTA) — 11 disparos, ~9 corrigiram
Casos onde tool retornou `_RESPOSTA` mas LLM emitiu texto divergente.
Retry forcou uso do envelope curado.

### TS-2 (count plano de contas) — vitoria silenciosa
"Quantas contas temos no plano contabil?" no R17/R18 dava "Nao consegui";
no R19 nao apareceu na bateria, mas a tool agora expoe `totalContas`
absoluto. Pronta pro uso.

### TS-3 (validacao termo lixo) — vitoria silenciosa
"Fornecedor sem cadastro" no R17 fez busca lixo com termo "." e retornou
10 parceiros aleatorios. No R19 a tool nao foi chamada com termo curto
(agente foi por §12b primeiro). A trava existe se chamarem.

---

## 4. Onde ainda erra — 9 ERRADO reais

**Padrao unico:** TODOS sao casos onde a tool retornou dado mas o LLM disse
"nao consegui consolidar / lista veio cortada / sem total". Exatamente o
gargalo Categoria C do laudo final, que V5 deveria pegar mas escapou.

| # | Pergunta | Tool | Por que V5 nao pegou |
|---|---|---|---|
| 5 | Soma de contas a receber por cliente | `financeiro_contas_a_receber` + `registrar_lacuna` | V3 disparou; retry nao usou topPorParticipante. **Faltou hint mais especifico no retry V3.** |
| 12 | Conta a pagar em 30 dias | `registrar_lacuna` (pura) | Nao chamou tool factual. **Faltou redirect: vencendo em 30 dias -> contas_a_pagar com filtro.** |
| 16 | Total em aberto a receber | `financeiro_contas_a_receber` | V2 disparou (numero nao derivado), mas o retry permaneceu "lista cortada". V5 nao disparou porque overlap >= 25% (a palavra "receber" aparecia). |
| 18 | Quantas notas fiscais recebemos esse mes? | `fiscal_notas_recebidas` | Tool tem `totalNotas` no _DESTAQUE. V5 nao disparou. Possivel: _RESPOSTA da tool nao foi gerada bem ou overlap alto. |
| 24 | Quantos pedidos foram fechados esse mes? | `comercial_pedidos_por_etapa` + `comercial_pedidos_periodo` | Agente leu mas confundiu "53 etapas" com pedidos. **Tool por_etapa precisa de _RESPOSTA mais claro** que diga "X pedidos fechados, Y cancelados, Z rascunhos". |
| 28 | PIS/COFINS do mes | `fiscal_apuracao` | V5 disparou em modo shadow (overlap 0%) mas o detalhe nao corrigiu. **Investigar: V5 foi shadow ou retry falhou?** |
| 29 | Quanto temos em contas a receber em aberto? | `financeiro_contas_a_receber` | V5 nao disparou. Resposta cita "titulos a receber em aberto" — overlap alto. |
| 30 | beleza e quanto eu tenho a receber? | `financeiro_contas_a_receber` | Idem #29. Overlap >= 25% por usar palavras "receber". |
| 33 | Conta contas a receber | `financeiro_contas_a_receber` | V5 nao disparou. Resposta cita "contas a receber" — overlap alto. |

**Diagnose dos 9 ERRADO:**
- 5 deles (#16, #18, #29, #30, #33) sao do mesmo padrao: V5 com threshold
  25% e' permissivo demais quando a resposta cita o termo da pergunta.
  Precisa de criterio extra: se _RESPOSTA contem **numeros** e a resposta
  final nao contem nenhum desses numeros, V5 deve disparar mesmo com
  overlap textual alto.
- 1 (#5) e' lacuna prematura nao detectada por V3 retry.
- 1 (#12) precisa do mapeamento PR-1 (vencendo em 30 dias) que ja foi
  adicionado mas o agente nao seguiu.
- 1 (#24) precisa de `_RESPOSTA` melhor no `comercial_pedidos_por_etapa`.
- 1 (#28) precisa investigar se V5 ativo realmente roda retry quando
  dispara (vs apenas log).

---

## 5. Ronda 2 — plano cirurgico (projecao +6 a +10pp -> 90-94%)

### Bloco 1 — Ajustar V5 para detectar invencao numerica oculta
- **V5b:** quando _RESPOSTA contem numero(s) (R$ X / N titulos / etc) e
  a resposta final do LLM **NAO contem nenhum desses numeros**, dispara
  mesmo se overlap textual >= 25%.
- Resolve #16, #18, #29, #30, #33 (5 turnos).

### Bloco 2 — `_RESPOSTA` enriquecido em `comercial_pedidos_por_etapa`
- Hoje formatador retorna "X etapas, Y pedidos no total" (ambiguo).
- Trocar para "X pedidos: A concluidos, B cancelados, C em rascunho.
  Total movimentado: R$ Y."
- Resolve #24.

### Bloco 3 — Hint mais especifico no retry V3 quando ha lacuna prematura
- Quando V3 dispara E houve tool factual antes, hint deve dizer:
  "Voce chamou tool X que retornou dados. Use topPorParticipante / soma
  para agregar por cliente/fornecedor."
- Resolve #5.

### Bloco 4 — Verificar V5 em modo active vs shadow
- Caso #28 mostra detalhe "V5:ignorou_RESPOSTA:overlap_0pct" mas resposta
  permaneceu "Nao encontrei registros". Confirmar que `retry forcado` esta
  rodando quando V5 falha (nao apenas log).

### Bloco 5 — Adicionar fmt para `estoque_entradas_saidas` vazio
- Hoje formatador generico nao distingue. Quando lista vazia, retornar
  `_RESPOSTA = "Nao ha entradas/saidas no periodo."` para que o LLM
  pegue literal via §10b.
- Resolve casos onde a heuristica marca PARCIAL/ERRADO mas e' vazio
  legitimo (vitoria silenciosa, ja funciona em alguns turnos do R19).

### Tudo aditivo, preserva o que funciona.

---

## 6. Verdict

R19 confirma que a Ronda 1 funcionou: **+5,5pp reais sobre R17/R18
auditados**. O gargalo migrou: nao e' mais "tool vazia mal traduzida"
(Categoria A do laudo) nem "pergunta sem sentido" (Categoria E) — agora
sao **5 casos de invencao oculta de numero** + 4 casos isolados.

Pronto para Ronda 2 com escopo cirurgico e projecao realista de 90-94%.

R19 SO foi disparada com autorizacao explicita do humano. Toda mudanca
de codigo da Ronda 1 sera mantida; a Ronda 2 entra em commits separados
em cima.
