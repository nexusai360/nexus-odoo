# Relatorio Final da Auditoria de Qualidade — Agente Nex

> Gerado em 2026-05-26T03:08:39.132Z
> Spec: docs/agent-quality-review/AUDIT-SPEC.md

## 1. Sumario executivo

- **Turnos avaliados**: 4914
- **Batches processados**: 123

| Status | Quantidade | % |
|---|---|---|
| CORRETO | 2544 | 51.8% |
| PARCIAL | 973 | 19.8% |
| ERRADO | 1066 | 21.7% |
| FORA_DE_ESCOPO | 331 | 6.7% |

**Taxa de acerto: 51.8%**

## 2. Top 10 padroes de falha

### #1 `placeholder_nao_substituido` — 624 turnos (12.7%)

**Acao:** BUG DE CODIGO. Investigar template de freshness em mcp/lib/freshness.ts e/ou identity-base.ts.

**Exemplo (turnoId 0054e6e1-d0a3-47bb-b406-4fa6c554e7fa):** Resposta correta com 2 notas e valor total, mas freshness ficou como 'Xs' nao substituido.

### #2 `parametro_incompleto` — 369 turnos (7.5%)

**Acao:** Revisar descricao das tools para enfatizar parametros obrigatorios. Adicionar exemplos no identity-base.

**Exemplo (turnoId 000af68f-a6af-43a0-a251-c753c184f787):** Chamou estoque_saldo_produto sem id do produto, mesmo com o código 1000205039 explícito entre colchetes. Pediu clarificação que era desnecessária.

### #3 `fluxo_tool_incompleto` — 349 turnos (7.1%)

**Acao:** Adicionar regra no prompt: enumerar fluxos canonicos de encadeamento de tools (parceiro->notas, produto->preco, etc).

**Exemplo (turnoId 00c1724d-272a-4343-bc2e-544872e1e71d):** Buscou parceiro mas falhou por rate limit; nao encadeou fiscal_notas_recebidas_por_fornecedor nem tentou retry. Pediu CNPJ que era desnecessario.

### #4 `pediu_clarificacao_desnecessaria` — 303 turnos (6.2%)

**Acao:** Revisar regra existente sobre defaults; pode estar sendo ignorada. Adicionar exemplos novos.

**Exemplo (turnoId 000af68f-a6af-43a0-a251-c753c184f787):** Chamou estoque_saldo_produto sem id do produto, mesmo com o código 1000205039 explícito entre colchetes. Pediu clarificação que era desnecessária.

### #5 `formato_quebrado` — 114 turnos (2.3%)

**Acao:** Reforcar regra de saida no prompt; exemplos de bom markdown.

**Exemplo (turnoId 00703a08-02c7-493f-8360-1ed4c2b09404):** Resposta certa (3 notas) mas comeca com identificacao desnecessaria 'Sou o assistente de operacao' que polui a saida.

### #6 `recusa_indevida` — 70 turnos (1.4%)

**Acao:** Revisar guardrails muito restritivos.

**Exemplo (turnoId 3c4d6293-08f4-4be8-8a2a-f647ddde20fc):** Recusa por 'muitas requisições' sem comprovação real; pergunta simples e válida.

### #7 `pergunta_ignorada` — 43 turnos (0.9%)

**Acao:** Revisar prompt: agente pode estar seguindo template em vez de ler a pergunta.

**Exemplo (turnoId 04102f83-fea7-42f7-a05a-92c30bb9090c):** Usuário pediu 'regras de preço', mas o agente chamou preco_tabela (itens de uma tabela específica de custo) e respondeu como 'regras'. Pode ter confundido itens de tabela com regras de preço.

### #8 `dado_inventado` — 23 turnos (0.5%)

**Acao:** Endurecer guardrail: 'Nunca responda numero/nome sem origem em tool retornada'.

**Exemplo (turnoId 0423eb48-1a97-434b-ba2b-40773f85c326):** Resposta menciona '58 (última leitura...)' que não tem origem clara nos dados retornados e gera ruído; também placeholder 'Xs'.

### #9 `gramatica_plural` — 21 turnos (0.4%)

**Acao:** Adicionar regra de concordancia no prompt: 'Existe 1 X' vs 'Existem N X'.

**Exemplo (turnoId 0d1243cc-bde8-412c-a128-02061792725f):** Resposta correta mas formato com aspas/parênteses estranhos no nome '(-) PERDAS...' e detalhe extra que poderia confundir.

### #10 `loop_clarificacao` — 21 turnos (0.4%)

**Acao:** Adicionar regra: 'Depois de 1 clarificacao, assumir default razoavel e responder'.

**Exemplo (turnoId 3a1af840-c6c5-4d3e-98c1-c13b80b4c4c7):** Falhou por rate limit e pediu mais palavras quando a descrição completa já estava na pergunta.

## 3. Acertos a preservar

- `acerto_objetividade` — 2522 turnos (51.3%)
  - Exemplo: Tool certa, parametro correto, resposta direta com nome da conta e freshness valido.
- `acerto_modelo` — 63 turnos (1.3%)
  - Exemplo: Faturamento do mes corrente com periodo correto, valor e contagem de notas. Resposta exemplar.
- `acerto_encadeamento` — 40 turnos (0.8%)
  - Exemplo: Encadeou cadastro_buscar_parceiro corretamente e retornou contagem de notas com periodo e freshness.

## 4. Bugs de codigo detectados

Estes itens **NAO se resolvem com prompt** — precisam de fix em codigo:

- `placeholder_nao_substituido` (624 turnos · 12.7%) — BUG DE CODIGO. Investigar template de freshness em mcp/lib/freshness.ts e/ou identity-base.ts.
- `resposta_truncada` (2 turnos · 0.0%) — Verificar maxTokens do adapter LLM ativo.

## 5. Gaps de produto (FORA_DE_ESCOPO)

Total: 331 turnos em 331.

**Exemplos:**
- Falha temporária de rate limit declarada honestamente, não é erro do agente.
- Falha de rate limit declarada honestamente.
- Rate limit declarado honestamente.
- Rate limit declarado honestamente.
- Rate limit declarado honestamente.
- Tool retornou erro de rate limit; o agente declarou a limitação de forma honesta.
- Rate limit real do sistema; agente comunicou claramente.
- Rate limit real; agente reconheceu a limitacao.

## 6. Top recomendacoes de mudanca de prompt (clusterizadas)

### #1 (mencionada em 121 turnos)

> Extrair id entre colchetes como produtoId.

### #2 (mencionada em 91 turnos)

> Adicionar regra: notas de fornecedor X = fiscal_notas_recebidas_por_fornecedor direto.

### #3 (mencionada em 76 turnos)

> Encadear cadastro_buscar_parceiro → fiscal_notas_recebidas_por_fornecedor.

### #4 (mencionada em 36 turnos)

> Regra: 'termo' obrigatorio em estoque_saldo_produto.

### #5 (mencionada em 34 turnos)

> Retry em rate limit.

### #6 (mencionada em 23 turnos)

> Adicionar regra: sempre passar termo do produto a partir dos colchetes.

### #7 (mencionada em 21 turnos)

> Encadear fiscal_notas_recebidas_por_fornecedor.

### #8 (mencionada em 18 turnos)

> Regra: nunca chamar estoque_saldo_produto sem termo/produtoId derivado da pergunta.

### #9 (mencionada em 16 turnos)

> Nao usar numero entre colchetes como produtoId; usar termo.

### #10 (mencionada em 15 turnos)

> Extrair codigo entre colchetes como termo em estoque_saldo_produto.

### #11 (mencionada em 13 turnos)

> Retry automatico em rate limit.

### #12 (mencionada em 10 turnos)

> estoque_saldo_produto sempre com 'termo' extraído.

### #13 (mencionada em 10 turnos)

> Regra: usar 'Existe 1 regra' (singular) quando contagem = 1.

### #14 (mencionada em 9 turnos)

> Adicionar regra: passar termo do produto em estoque_saldo_produto.

### #15 (mencionada em 8 turnos)

> Forcar termo no estoque_saldo_produto quando pergunta tem produto especifico.

## 7. Recomendacoes priorizadas (por impacto)

Ordenado por `quantidade × severidade`. Severidades:
- **ALTA**: tool_errada, dado_inventado, pergunta_ignorada, loop_clarificacao
- **MEDIA**: fluxo_tool_incompleto, parametro_incompleto, pediu_clarificacao_desnecessaria
- **BAIXA**: gramatica_plural, formato_quebrado
- **BUG**: placeholder_nao_substituido, resposta_truncada

| # | Padrao | Severidade | Turnos | Impacto | Acao |
|---|---|---|---|---|---|
| 1 | `placeholder_nao_substituido` | BUG | 624 | 1248 | BUG DE CODIGO. Investigar template de freshness em mcp/lib/freshness.ts e/ou identity-base.ts. |
| 2 | `parametro_incompleto` | MEDIA | 369 | 738 | Revisar descricao das tools para enfatizar parametros obrigatorios. Adicionar exemplos no identity-base. |
| 3 | `fluxo_tool_incompleto` | MEDIA | 349 | 698 | Adicionar regra no prompt: enumerar fluxos canonicos de encadeamento de tools (parceiro->notas, produto->preco, etc). |
| 4 | `pediu_clarificacao_desnecessaria` | MEDIA | 303 | 606 | Revisar regra existente sobre defaults; pode estar sendo ignorada. Adicionar exemplos novos. |
| 5 | `recusa_indevida` | ALTA | 70 | 210 | Revisar guardrails muito restritivos. |
| 6 | `pergunta_ignorada` | ALTA | 43 | 129 | Revisar prompt: agente pode estar seguindo template em vez de ler a pergunta. |
| 7 | `formato_quebrado` | BAIXA | 114 | 114 | Reforcar regra de saida no prompt; exemplos de bom markdown. |
| 8 | `dado_inventado` | ALTA | 23 | 69 | Endurecer guardrail: 'Nunca responda numero/nome sem origem em tool retornada'. |
| 9 | `loop_clarificacao` | ALTA | 21 | 63 | Adicionar regra: 'Depois de 1 clarificacao, assumir default razoavel e responder'. |
| 10 | `tool_errada` | ALTA | 11 | 33 | Revisar descricao das tools confundidas; explicitar diferenciacao no prompt-mestre. |

## 8. Proximos passos

1. Revisar este relatorio.
2. Marcar quais recomendacoes da §7 voce aceita.
3. Em sessao seguinte: aplicar mudancas aceitas em identity-base.ts / compose.ts / tools.
4. Re-rodar a auditoria contra conversas POS-mudanca para comparar taxa de acerto.
