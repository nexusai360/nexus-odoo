# Auditoria manual R17 + R18 (48 turnos nao-CORRETO)

**Data:** 2026-05-27
**Branch:** feat/agente-nex-95pct-ronda1
**Objetivo:** reclassificar os 48 turnos nao-CORRETO de R17+R18, identificar onde a heuristica errou e mapear cada falha real a um fix preferencialmente em codigo TS (entregar pronto pro agente).

---

## 1. Reclassificacao caso a caso

Notacao: **REAL** = veredito da auditoria manual. **Fix** = onde a correcao vive.

### R17

| # | Pergunta | Heur. | Real | Fix |
|---|---|---|---|---|
| 1 | Cliente que comprou mais notas esse mes | FORA | **ERRADO** | TS: tool comercial top-clientes-por-pedidos OU prompt: redirecionar p/ `fiscal_notas_emitidas` + GROUP BY |
| 2 | Conta a receber em 30 dias | FORA | **ERRADO** | Prompt: redirecionar p/ `financeiro_titulos_vencidos` com janela 30d futuro |
| 3 | Faturamento pra rede de academias | FORA | **FORA OK** | (sem fix, "rede" nao e atributo) |
| 4 | Fornecedor sem cadastro | FORA | **ERRADO** | TS: validacao em parceiros_buscar — termo "." retorna lixo, deveria rejeitar |
| 5 | Liquidez imediata | FORA | **FORA OK** | (resposta ja orienta bem) |
| 6 | Notas emitidas para o cliente Smartfit Alphaville | FORA | **ERRADO** | Prompt: redirecionar p/ `fiscal_notas_emitidas` com filtro de cliente |
| 7 | Parceiros novos cadastrados esta semana | FORA | **FORA OK** | (data de cadastro nao indexada) |
| 8 | Parceiros sem documento cadastrado | FORA | **FORA OK** | (query custom complexa, sem ROI) |
| 9 | Pedidos cancelados versus fechados esse mes | FORA | **ERRADO** | Prompt: redirecionar p/ `comercial_pedidos_por_etapa` |
| 10 | Pedido sem nota emitida ainda | FORA | **FORA OK** | (exige JOIN nao instrumentado) |
| 11 | Produto mais vendido em quantidade | FORA | **CORRETO** | (heuristica errou — resposta tem T600X, 1.103 unidades) |
| 12 | quais notas? | ERRADO | **ERRADO** | Prompt: §12b nao foi cumprida; ou V6 anti-pergunta-curta |
| 13 | Quantas contas temos no plano contabil? | FORA | **ERRADO** | TS: calculo canonico `count` no envelope de `contabil_plano_contas`. Hoje agente nao usa count direto |
| 14 | Quanto faturei comparado com a meta? | FORA | **FORA OK** | (nao temos meta no ERP) |
| 15 | Quanto paguei essa semana? | ERRADO | **ERRADO** | Prompt: §10b ja existe mas LLM ignora. V5 anti-recusa pega |
| 16 | Quantos pedidos foram fechados esse mes? | FORA | **CORRETO** | (heuristica errou — 50 pedidos R$ 20,6M) |
| 17 | Soma de contas a pagar por fornecedor | FORA | **ERRADO** | **TS: campo novo `topPorFornecedor[]`** em `financeiro_contas_a_pagar` (group by parceiro_id) |
| 18 | Titulos vencidos hoje | PARCIAL | **PARCIAL OK** | TS: refinar texto pra nao falar "truncada"; lista de 10 ja eh ok |
| 19 | Top 10 maiores contas a receber abertas | PARCIAL | **ERRADO** | Prompt §13c + V5: `topMaiores` ja vem pronto, LLM ignorou |
| 20 | Top 5 produtos por margem | FORA | **FORA OK** | (custo nao indexado) |
| 21 | Vai bater a meta esse mes? | FORA | **FORA OK** | (sem meta) |
| 22 | Vai ter halteres pra entrega amanha? | FORA | **FORA OK** | (predicao de demanda) |

### R18

| # | Pergunta | Heur. | Real | Fix |
|---|---|---|---|---|
| 23 | beleza e quanto eu tenho a receber? | ERRADO | **ERRADO** | V5 anti-recusa: `financeiro_contas_a_receber` tem soma agregada |
| 24 | Conta a receber em 30 dias | FORA | **ERRADO** | Prompt: redirecionar (mesmo de #2) |
| 25 | Conta contas a receber | FORA | **ERRADO** | Prompt: pergunta curta com sentido obvio (=contas a receber) |
| 26 | Contas a pagar do mes | FORA | **ERRADO** | Prompt: redirecionar p/ `financeiro_contas_a_pagar` |
| 27 | Despesa do dia | ERRADO | **ERRADO** | Prompt: §10b nao foi cumprida; V5 anti-recusa |
| 28 | Esta vencendo titulo essa semana? | FORA | **ERRADO** | Prompt: redirecionar p/ `financeiro_titulos_vencidos` janela=essa_semana |
| 29 | Faturamento por estado esse mes | FORA | **FORA OK** | (estado/UF nao indexado) |
| 30 | Faturamento por regiao esse mes | FORA | **FORA OK** | (idem) |
| 31 | Lista de fornecedores ativos | FORA | **ERRADO** | Prompt: redirecionar p/ `parceiros_listar` tipo=fornecedor |
| 32 | Lista os 20 produtos mais caros que temos parados | PARCIAL | **CORRETO** | (heuristica falso positivo "agregacao manual" — eh a propria saida da tool) |
| 33 | Me mostra os 10 produtos com maior saldo em estoque hoje | FORA | **ERRADO** | Prompt: redirecionar p/ tool de top produtos por saldo (OU TS: novo `topMaiores` em saldo_resumo) |
| 34 | Parceiros da Bahia | FORA | **FORA OK** | (UF parceiro nao indexada) |
| 35 | Pedidos cancelados esse mes | FORA | **ERRADO** | Prompt: redirecionar (mesmo de #9) |
| 36 | Pedidos em entrega que estao atrasados | FORA | **FORA OK** | (sem status de entrega) |
| 37 | Pedido sem nota emitida ainda | FORA | **FORA OK** | (mesmo de #10) |
| 38 | Produto mais vendido em quantidade | FORA | **CORRETO** | (heuristica errou — T600X 15.305 unidades) |
| 39 | Produtos do family pe na bola? | FORA | **ERRADO** | Prompt §12b (pergunta confusa, deveria pedir clarificacao) |
| 40 | Quantas contas temos no plano contabil? | FORA | **ERRADO** | TS calculo canonico count (mesmo de #13) |
| 41 | Quanto paguei essa semana? | ERRADO | **ERRADO** | V5 anti-recusa (mesmo de #15) |
| 42 | Quantos pedidos foram fechados esse mes? | FORA | **PARCIAL** | Prompt + TS: `comercial_pedidos_por_etapa` deve aceitar periodo mensal (ja aceita? validar) |
| 43 | saida de hoje no caixa | ERRADO | **ERRADO** | V5 anti-recusa (mesmo de #15) |
| 44 | Tempo medio de fechamento do pedido | FORA | **FORA OK** | (sem data fim) |
| 45 | Total a receber esse mes | FORA | **ERRADO** | Prompt: redirecionar p/ `financeiro_contas_a_receber` |
| 46 | Total em aberto a receber | ERRADO | **ERRADO** | V5 anti-recusa |
| 47 | Vai ter halteres pra entrega amanha? | FORA | **FORA OK** | (mesmo de #22) |
| 48 | Vendedor com maior ticket medio | ERRADO | **CORRETO** | (heuristica falso positivo — calculo correto R$5,6M/4=R$1,4M; nao eh invencao) |

---

## 2. Metrica real consolidada R17+R18

| Status | Heuristica | **Auditado** | Delta |
|---|---|---|---|
| CORRETO | 152 | **157** | +5 |
| PARCIAL | 3 | 2 | -1 |
| ERRADO | 8 | **25** | +17 |
| FORA_DO_ESCOPO | 37 | **16** | -21 |
| **% CORRETO** | 76% | **78,5%** | +2,5pp |

**Onde a heuristica mente:**
1. **FORA inflado** (heuristica marca FORA todo turno com `registrar_lacuna`): 21 FORAs heuristicos eram na verdade ERRADO (15) ou CORRETO (5) ou PARCIAL (1).
2. **ERRADO subestimado**: heuristica so pega "Nao consegui" — perde os casos de "lista veio truncada", recusa sutil com dado parcial, ou tools nao chamadas quando deveriam.

**Gap real para 95%:** 190 − 157 = **33 turnos** a converter (vs 38 que o laudo anterior dizia).

---

## 3. Estrategia de fix (priorizada por ROI)

Principio: **mover trabalho para o codigo TS sempre que possivel**; o agente so deve "transcrever" o que o servidor ja entregou. Nao mexer no que ja funciona.

### Bloco 1 — fixes em TS (entregar pronto pro agente)

| ID | Onde | O que muda | Resolve |
|---|---|---|---|
| **TS-1** | `mcp/tools/financeiro/contas-a-pagar.ts` | Adicionar campo `topPorFornecedor[]` (group by parceiro_id, soma, top 10 ordenado desc) | #17 |
| **TS-2** | `mcp/tools/contabil/plano-contas.ts` | Adicionar `_agregado.contagem` no envelope (count de contas ativas) | #13, #40 |
| **TS-3** | `mcp/tools/cadastros/parceiros-buscar.ts` | Validar termo de busca: rejeitar termos com `length < 2` ou regex `^[\W_]+$` (pontuacao pura) | #4 |
| **TS-4** | `mcp/tools/estoque/saldo-resumo.ts` | Adicionar `topMaiores[]` (saldo desc, top 10) | #33 |

### Bloco 2 — fixes em prompt (mapeamentos de pergunta → tool)

| ID | Regra | Resolve |
|---|---|---|
| **PR-1** | "vencendo essa semana/proxima/30 dias" → `financeiro_titulos_vencidos` com janela apropriada | #2, #24, #28 |
| **PR-2** | "notas para o cliente X" → `fiscal_notas_emitidas` com filtro cliente (ja existe? validar) | #6 |
| **PR-3** | "cancelados vs fechados", "pedidos cancelados/fechados esse mes" → `comercial_pedidos_por_etapa` | #9, #35 |
| **PR-4** | "lista de fornecedores ativos" → `parceiros_listar` tipo=fornecedor + `ativo=true` | #31 |
| **PR-5** | "contas a pagar/receber do mes" → `financeiro_contas_a_pagar` / `contas_a_receber` (e nao `titulos_vencidos`) | #25, #26, #45 |
| **PR-6** | "cliente que mais compra/comprou" → `fiscal_notas_emitidas` group by cliente (OU tool nova) | #1 |

### Bloco 3 — Validator V5 anti-ignorou_RESPOSTA

Acao: detectar quando o envelope tem `_RESPOSTA` (ou `_agregado.soma` ou `topMaiores`) e a resposta final do LLM:
- Comeca com "Nao consegui" / "Nao encontrei" / "Lista veio truncada",
- OU tem overlap de tokens com `_RESPOSTA` < 30%.

Acao: retry corretivo com prompt "Voce ignorou _RESPOSTA. Use-o literalmente."

**Resolve:** #15, #19, #23, #25, #26, #27, #31, #33, #41, #43, #45, #46 = **12 turnos** (a maior categoria).

### Bloco 4 — Prompt §12b mais explicita (pergunta sem sentido)

Acao: tornar a regra §12b um pouco menos restritiva: aceitar perguntas com **gramatica quebrada** ou **slang/erros de digitacao** que nao casam com mapeamento conhecido. Adicionar exemplos concretos:
- "Produtos do family pe na bola?" → "Nao entendi 'family pe na bola'. Voce quer ver uma categoria/linha de produtos? Qual o nome correto?"
- "quais notas?" → ja existente
- "Conta contas a receber" → mapear como sinonimo de "contas a receber" no Bloco 2

**Resolve:** #12, #25, #39.

### Bloco 5 — Bug fix heuristica

Ajustar `scripts/quality-audit/03-*.ts` para nao marcar como FORA todo turno que usou `registrar_lacuna` quando ANTES tinha sido feita uma tool de dado e a resposta cita dado factual. Isso reduz ruido em rodadas futuras (R19+).

---

## 4. Coisas que NAO sao para mexer (preservar o que funciona)

- Envelope canonico em 29 tools — funciona, nao tocar.
- AutoValidator V1-V4 — funciona, nao tocar.
- `topMaiores` em contas-a-receber/pagar — funciona, V5 vai fazer o LLM USAR.
- regra §10b "vazio = nao ha" — esta no prompt, V5 vai bater quando LLM ignora.
- Calculos canonicos somatorio/contagem em finance — funcionam.

**Toda mudanca e ADITIVA.** Nenhum fix re-escreve comportamento existente.

---

## 5. Projecao apos Ronda 1

| Item | Cura projetada |
|---|---|
| TS-1 a TS-4 (entregar pronto) | +4 a +6 turnos |
| PR-1 a PR-6 (mapeamentos) | +6 a +9 turnos |
| Validator V5 | +8 a +12 turnos |
| §12b explicita | +2 a +3 turnos |
| **Total Ronda 1** | **+20 a +30 turnos** |

Banda projetada: **86% a 93% CORRETO** apos Ronda 1.

Disparar R19 **somente** apos:
1. TS-1 a TS-4 implementados, testados, rebuild dos containers.
2. PR-1 a PR-6 no `identity-base.ts`.
3. V5 ativo no `run-agent.ts`.
4. §12b expandida no prompt.
5. Approval do humano (gatilho explicito).
