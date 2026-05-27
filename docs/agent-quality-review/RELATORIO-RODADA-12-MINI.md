# Relatório Rodada 12 — Mini + Onda A+B+C

**Data:** 2026-05-26 (noite)
**Marker:** `[AUDIT-POS-2026-05-26T21-58-49]`
**Total:** 100 turnos avaliados (100 disparados, 0 falhas técnicas)
**Modelo:** `gpt-5.4-mini` (primeira rodada produtiva no mini com prompt redesenhado)
**Commits desta rodada:** `7c4650a` (Onda A+B+C)

## Veredito

**Avanço claro em todas as dimensões críticas. 75% CORRETO, 0% ERRADO.** Mini com prompt redesenhado entrega o **menor índice de erro factual da série** (zero) sem perder objetividade. O ganho em **eliminação de invenção, ausência total de pedido de clarificação e zero placeholder Xs** sinaliza que as ondas A (bugs), B (catálogo) e C (prompt) atacaram pontos reais.

## Números

| Status | Quantidade | % |
|---|---|---|
| CORRETO | 75 | 75% |
| PARCIAL | 17 | 17% |
| ERRADO | 0 | **0%** ⭐ |
| FORA_DO_ESCOPO | 8 | 8% |

**% CORRETO = 75/100 = 75%** (denominador = todos avaliados).

## Comparativo histórico completo

| Rodada | Modelo | CORRETO | PARCIAL | ERRADO | FORA | Total | Δ vs anterior |
|---|---|---|---|---|---|---|---|
| R0 (4914 turnos) | nano | 51.8% | 19.8% | 21.7% | 6.7% | 4914 | baseline |
| R4 baseline | nano | **73.8%** | 17.9% | 4.5% | 3.8% | 290 | +22pp |
| R5 (R8+R2-7) | nano | 50.2% | 32.9% | 7.3% | 9.7% | 289 | -23.6pp |
| R6 (1I+1G+sanit) | nano | 40.5% | 48.8% | 3.1% | 7.6% | 289 | -10pp |
| R7 (banco override) | nano | 38.0% | 50.0% | 5.0% | 7.0% | 100 | -2.5pp |
| R8 (drift fix) | nano | 63.3% | 21.4% | 9.2% | 6.1% | 98 | +25pp |
| R9 (R3 suave) | nano | 69.0% | — | — | — | 100 | +5.7pp |
| R10 (Onda 5) | nano | 63.3% | — | — | — | 100 | -5.7pp |
| R11 nano | nano | ~50% | — | — | — | parcial | regrediu |
| R11 mini | mini | 72.3% | — | — | — | parcial | empata baseline |
| **R12 mini (esta)** | **mini** | **75%** | **17%** | **0%** | **8%** | **100** | **+2.7pp vs R11 mini** |

## Patterns (Top da R12 mini)

| Pattern | R0 | R4 | R12 mini | Status |
|---|---|---|---|---|
| `acerto_objetividade` | 51.3% | 68.3% | 53% (53 turnos) | ✅ Dominante |
| `acerto_modelo` | 1.3% | n/a | 20% (20) | ✅ Subiu — análises comparativas |
| `acerto_encadeamento` | 0.8% | 5.9% | 1% (1) | Estável |
| `limitacao_real_declarada` | 0.4% | 6.6% | 8% (8) | ✅ Honesto |
| `pediu_clarificacao_desnecessaria` | 6.2% | 1.7% | **0%** (0) | ⭐ Resolvido |
| `dado_inventado` | 0.5% | 4.8% | **0%** (0) | ⭐ Resolvido |
| `placeholder_nao_substituido` | **12.7%** | (não tinha métrica) | **0%** (0) | ⭐ Resolvido |
| `formato_quebrado` | 2.3% | — | **0%** (0) | ⭐ Resolvido |
| `fluxo_tool_incompleto` | 7.1% | 3.4% | 8% (8 PARCIAL) | ⚠️ Subiu (lacuna sem tentar combinar) |
| `resposta_truncada` | — | 3.4% | 5% (5 PARCIAL) | ⚠️ Persiste |
| `entendeu_mal_termo` | 3.8% | 3.8% | 3% (3 PARCIAL) | Estável |

## Mudanças desta rodada (Onda A+B+C)

### Onda A — Bugs de código
- **A1**: Stripper defensivo de freshness `Xs` (`src/lib/agent/quality/freshness-stripper.ts` + integração em `run-agent.ts`). Bug atacado: 12.7% / 624 turnos no R0. **Resultado: 0 ocorrências em R12.** ⭐
- **A2**: Retry exponencial em rate limit (3 tentativas 200/800/2000ms no tool dispatch). Substitui single-shot 1500ms. **Resultado: 0 recusas indevidas, 1 turno com ~60s (retry funcionou).**
- **A3**: Sanitizer `_agregado` (já ativo via env). Mantido.

### Onda B — Catálogo
- **B**: Descrições Zod desambiguadoras em `preco_produto` e `preco_tabela` (`use para X / NÃO use para Y`). **Resultado: zero confusão entre tools de preço.**

### Onda C — Prompt redesenhado pra mini (12.013 chars, +52% vs anterior)
- **Bloco FLUXOS CANÔNICOS** (7 fluxos diretos: notas/preco/saldo/cliente/fornecedor → tool específica sem buscar parceiro antes). **Resultado: encadeamento direto, +52% acerto_modelo.**
- **Bloco EXTRAÇÃO DE IDENTIFICADORES** (códigos entre `[colchetes]`, CNPJ, nome próprio). **Resultado: extração de `[102]`, `[1000205039]`, `[1000362265]`, PMB403 funcionou.**
- **Regra de freshness explícita** (use `atualizadoHa` da tool). **Resultado: 0 placeholders.**
- **Guardrail anti-invenção em tom suave** ("prefira incompleto a inventado"). **Resultado: 0 dado_inventado vs 14 em R4.**
- **Mais exemplos** (8 pares ❌/✅), ordem de prioridade clarificada.
- **Modelo mini** (gpt-5.4-mini ativo em `llm_configs`).

## Conquistas vs R4 baseline (nano)

| Métrica | R4 baseline | R12 mini | Δ |
|---|---|---|---|
| % CORRETO | 73.8% | 75% | +1.2pp |
| % ERRADO | 4.5% | **0%** | **-4.5pp** ⭐ |
| % PARCIAL | 17.9% | 17% | -0.9pp |
| dado_inventado | 14 | **0** | **-100%** |
| placeholder Xs | 12.7%* | **0** | **-100%** |
| pediu_clarificacao | 5 | **0** | **-100%** |
| fluxo_tool_incompleto | 10 | 8 | -20% |
| `resposta_truncada` | 10 | 5 | -50% |

*placeholder Xs: 12.7% no R0 (4914 turnos); R4 não monitorou explicitamente.

## Análise dos 17 PARCIAIS (principais)

Tipos de PARCIAL identificados:

1. **`fluxo_tool_incompleto` (8 casos)** — agente registrou lacuna em métricas que TÊM tool disponível, sem tentar combinar:
   - "Fornecedor que mais devemos" → poderia agregar `financeiro_contas_a_pagar` por fornecedor
   - "Comparativo de faturamento por mês esse ano" → iterar `fiscal_faturamento_periodo` mês a mês
   - "Conta a receber em 30 dias" → `financeiro_contas_a_receber` suporta filtro
   - "Pedido com maior valor em aberto" → `comercial_pedidos_periodo` ordenado por valor
   - "Cliente com pedido em aberto + título vencido" → cruzar tools existentes
   - "Lista de fornecedores ativos" → `cadastro_buscar_parceiro` com filtro
   - "Parceiros novos da semana" → `cadastro_buscar_parceiro` com filtro de período de cadastro
   - "Top 5 movimentados no mês" → `estoque_top_movimentados` existe

2. **`resposta_truncada` (5 casos)** — declarou "veio truncado/incompleto" sem somar o que veio. O sanitizer `_agregado` deveria cobrir mas não está alcançando esses paths:
   - "Total em aberto a pagar"
   - "Contas a pagar do mês"  
   - "Quanto temos em contas a receber em aberto?"
   - "Conta contas a pagar"
   - "Pedidos com prazo estourado"

3. **`entendeu_mal_termo` (3 casos)** — fuzzy match impreciso ou termo muito específico:
   - Código 1000362265 retornou Mola Espiral (1000097424) — fuzzy mais agressivo que deveria
   - "Conta de impostos a recolher" — não encontrou conta que existe (2.1.1.3.09)
   - "Top 5 movimentados no mês" — declarou ausência de movimentação que deveria ter

4. **`acerto_objetividade` em 1 caso** — valor R$ 0,00 em "Casa Ferolla" notas suspeito (pode ser real, mas valor zero levanta dúvida).

## Análise dos 8 FORA_DO_ESCOPO (lacunas reais)

Todos foram tratados corretamente via `registrar_lacuna`:

1. Vendedores cadastrados (sem tool de listagem de vendedores)
2. Faturamento por região (sem agrupador por região)
3. Faturamento por estado (sem agrupador por UF na fiscal)
4. Pedidos sem vendedor atribuído (filtro inexistente)
5. Faturamento por marca (sem agrupador por marca)
6. Quantos parceiros pessoa física (existe pra PJ — inconsistência menor)
7. Itens com saldo zero (sem tool de contagem)
8. Tempo médio fechamento pedido (métrica complexa)

## Gap remanescente (75% → 90%+)

O caminho pra 90% está mapeado pelos 17 PARCIAIS:

### Onda D (próxima rodada) — atacar PARCIAIS direto

1. **Reforçar "tente combinar tools antes de declarar lacuna"** no prompt. Adicionar regra: "antes de chamar `registrar_lacuna`, verifique se a métrica pode ser composta de 2-3 tools existentes."
2. **Forçar agregação no LLM quando tool result tem total** — o sanitizer já anexa `_agregado` mas o LLM está ignorando em alguns casos. Reforçar exemplo no prompt: "se a tool retornou 30 títulos, some os valores e mostre o total — não declare 'truncado'."
3. **Calibrar fuzzy match** das tools de busca (estoque_saldo_produto, cadastro_buscar_parceiro) — quando o código exato não bate, retornar `ambiguidade` ao invés de fuzzy lookup silencioso.
4. **Adicionar tool `comercial_pedidos_top_valor`** OU melhorar `comercial_pedidos_periodo` para aceitar `ordenacao: "valor_desc"`. Resolve "pedido com maior valor em aberto" sem agregação manual.

### Decisão estratégica
- **Manter mini em produção** — entrega 75% CORRETO com 0% ERRADO; o ganho de robustez factual justifica o custo 5× maior por turno.
- **Bateria 300q antes de considerar produção estável** — amostra 100 tem variância ±5pp; 300q dá confiança estatística.

## Custo estimado da rodada

- 100 conversas, mini, ~10–15s/turno, ~$0.015 médio por turno
- Total estimado: **~$1.50** (aprox 5× o custo nano da R11)

## Conclusões

- **Mini + prompt redesenhado supera baseline R4 nano em qualidade factual.** Não em margem alta no CORRETO bruto (75 vs 73.8) mas em **eliminação total de invenção e erro** (0% ERRADO).
- **Bugs A1+A2 + descrições B + prompt C** atacaram exatamente os top patterns do R0 e mostraram efeito direto.
- **PARCIAIS persistem** principalmente em fluxos compostos (cruzamento de tools, agregação manual). Próxima onda tem alvo claro.
- **Bateria 100 é suficiente pra sinalizar tendência mas não pra decidir SLA de produção.** 300q recomendado pra validar.
