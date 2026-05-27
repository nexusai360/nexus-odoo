# Relatório Rodada 13 — Mini + Onda D (agregação forçada + combinação tools + tools novas)

**Data:** 2026-05-26 (noite)
**Marker:** `[AUDIT-POS-2026-05-26T22-...]`
**Total:** 100 turnos avaliados (100 disparados, 0 falhas técnicas)
**Modelo:** `gpt-5.4-mini`
**Commits:** `c019593` (Onda D)

## Veredito

**Praticamente estável vs R12 (74 vs 75 CORRETO).** Ganhos concentrados em fluxos compostos (cliente que mais deve, devedores principais, fornecedor que mais devemos, plano contas geral) e perdas concentradas em **agregação forçada não cumprida** em alguns paths. **0% ERRADO mantido**. Onda D resolveu ~50% dos PARCIAIS atacados mas introduziu nova classe de problema: **mini com prompt maior (13.300 chars) começa a perder atenção em regras críticas**.

## Números

| Status | R12 | R13 | Δ |
|---|---|---|---|
| CORRETO | 75 | 74 | -1 |
| PARCIAL | 17 | 17 | 0 |
| ERRADO | 0 | **0** | 0 ⭐ |
| FORA_DO_ESCOPO | 8 | 9 | +1 |

## Comparativo histórico

| Rodada | Modelo | CORRETO | PARCIAL | ERRADO | FORA |
|---|---|---|---|---|---|
| R4 baseline | nano | 73.8% | 17.9% | 4.5% | 3.8% |
| R12 mini | mini | 75% | 17% | 0% | 8% |
| **R13 mini** | mini | **74%** | **17%** | **0%** | **9%** |

## O que funcionou (Onda D conquistou)

**Composição de tools (Grupo B do diagnóstico R12 → 4 PARCIAIS resolvidos):**
- ✅ "Fornecedor que mais devemos" → agora **CORRETO** (Jds R$ 3.666.577,92, agregou contas_a_pagar por participante)
- ✅ "Cliente que mais deve / Devedores principais" → agora **CORRETO** (top 10 com valores)
- ✅ "Quem precisa de cobrança hoje?" → **CORRETO** (top 10 vencidos a receber por cliente)
- ✅ "Inadimplência atual" → **CORRETO** (composição vencidos a pagar + a receber)

**Fluxos com tool nova (Onda D):**
- ✅ "Plano de contas geral" → 934 contas + 20 primeiras (era PARCIAL/FORA em R12)
- ✅ Sobrou alguma coisa do [102]? → extração + saldo + freshness

**Outros patterns mantidos:**
- ✅ acerto_modelo dobrou em casos analíticos (mes vs mes anterior, dados mistos com nuance)
- ✅ ambiguidade tratada bem (Smartfit, FLEXORA EXTENSORA, cabo de aço)

## O que não funcionou (Grupo A persistiu)

**Regra "use totalAPagar / totalAReceber / totalVencido direto" foi IGNORADA em 4 casos:**

| Pergunta | Tool tem agregado? | Resposta R13 |
|---|---|---|
| "Beleza e quanto eu tenho a receber?" | ✅ totalAReceber | ❌ "veio sem somatório" |
| "Quanto a empresa deve hoje?" | ✅ totalAPagar | ❌ "não consegui obter" |
| "Total em aberto a receber" | ✅ totalAReceber | ❌ "não consegui obter total" |
| "Lista 20 produtos mais caros parados" | ✅ R$ 51.9M no dados | ❌ "lista veio cortada" |

**Causa provável:** prompt cresceu pra 13.300+ chars; mini perde atenção em regras que vêm DEPOIS da seção de tools. Bloco "Agregação forçada" precisa ficar MAIS NO TOPO ou ser repetido.

**Composição não tentada em 5 casos:**
- "Faturamento por mês esse ano" → Onda D mandou iterar fiscal_faturamento_periodo, agente não iterou
- "Comparativo mes-a-mes" → idem
- "Conta a pagar em 30 dias" → contas_a_pagar tem dataVencimento, agente declarou lacuna
- "Quantos clientes ativos?" → D5 implementou totalClientesAtivos mas agente registrou lacuna mesmo
- "Quantas notas recebidas mes?" → fiscal_notas_recebidas existe, declarou "não consegui"

**Causa provável:** mini está "preguiçoso" em fluxos que exigem múltiplas chamadas. Prefere lacuna ao loop.

## Patterns R13

| Pattern | R12 | R13 | Δ |
|---|---|---|---|
| `acerto_objetividade` | 53 | 39 | -14 |
| `acerto_modelo` | 20 | 31 | +11 ⭐ |
| `acerto_encadeamento` | 1 | 4 | +3 ⭐ |
| `limitacao_real_declarada` | 8 | 10 | +2 |
| `fluxo_tool_incompleto` | 8 | 7 | -1 |
| `resposta_truncada` | 5 | 5 | 0 |
| `entendeu_mal_termo` | 3 | 3 | 0 |
| `pediu_clarificacao_desnecessaria` | 0 | 1 | +1 (regressão pequena) |
| `dado_inventado` | 0 | 0 | ⭐ |
| `placeholder_nao_substituido` | 0 | 0 | ⭐ |

**Análise:** mini está ficando mais analítico (acerto_modelo +11) e fazendo mais encadeamento (acerto_encadeamento +3). Mas sacrificou parte da objetividade direta.

## Gap remanescente (74% → 90%+)

### Onda E (próxima rodada) — alvos cirúrgicos

1. **Reorganizar prompt** — mover bloco "Agregação forçada" PRO TOPO (logo após COMO AGIR), antes da seção de tools. Cabe em 5 linhas.
2. **Reduzir prompt** — 13.300 chars é muito mesmo pra mini. Cortar exemplos redundantes, remover tools "em implantação" da lista. Alvo: 10.000 chars.
3. **Few-shot dirigido** — adicionar 2 exemplos novos diretos no prompt para os casos persistentes:
   - "Total a receber" → use totalAReceber direto
   - "Faturamento mes-a-mes" → iterar fiscal_faturamento_periodo
4. **Tool nova `comercial_pedidos_listar`** — devolve lista de pedidos (não só totais). Resolve "pedido com maior valor em aberto" sem cruzamento.
5. **Tool nova `fiscal_faturamento_por_mes`** — retorna breakdown mes-a-mes direto. Resolve "comparativo mes-a-mes do ano".
6. **Bateria 200q** (não 100) — variância menor.

### Decisões estratégicas

- **Mini fica em produção** (0% ERRADO é o ganho mais valioso, mesmo com regressão de 1pp no CORRETO).
- **Onda E deve atacar agregação ignorada em prompt** (3-4 PARCIAIS direto). Esperado: 80–85% CORRETO.

## Custo

- 100 conversas, mini, ~14s/turno médio, ~$0.018 médio por turno
- Total estimado: **~$1.80** (similar ao R12)

## Resumo

R13 NÃO superou R12 no CORRETO bruto mas **consolidou ganhos qualitativos** (composição funcional em devedores/cobrança/fornecedor; ambiguidade tratada melhor; análises comparativas mais ricas). O bottleneck agora é DESLIGAR a regressão de agregação direta em alguns paths críticos — provavelmente atenção do mini perdida em prompt grande. Onda E deve focar em **reduzir e priorizar prompt** + **2 tools novas pra fluxos compostos**. Meta realista: 80–85% em R14.
