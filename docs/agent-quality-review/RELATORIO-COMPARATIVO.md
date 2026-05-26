# Relatorio Comparativo — Antes vs Depois das Mudancas

> Gerado em 2026-05-26T04:01:06.426Z
> ANTES: auditoria de 4.914 turnos historicos (data 2026-05-26 03:00).
> DEPOIS: 291 perguntas de teste rodadas apos aplicar A+B+C (data 2026-05-26 03:43).

## 1. Resultado bruto

| Status | Antes (4914) | Depois (291) | Variacao |
|---|---|---|---|
| CORRETO | 2544 (51.8%) | 89 (30.7%) | -21.1pp |
| PARCIAL | 973 (19.8%) | 124 (42.8%) | 23.0pp |
| ERRADO | 1066 (21.7%) | 17 (5.9%) | **-15.8pp** |
| FORA_DE_ESCOPO | 331 (6.7%) | 60 (20.7%) | 14.0pp |

## 2. Verificacao factual (apenas turnos com toolResults)

Nova dimensao disponivel pos-instrumentacao da Onda 1.

- **Factual BATE**: 98 / 107 = **91.6%**
- Factual NAO BATE: 9
- Sem toolResults (nao aplicavel): 183

## 3. Top padroes (depois)

| Padrao | Ocorrencias | % |
|---|---|---|
| `pediu_clarificacao_desnecessaria` | 182 | 62.8% |
| `acerto_objetividade` | 89 | 30.7% |
| `nao_usou_tool` | 68 | 23.4% |
| `fluxo_tool_incompleto` | 16 | 5.5% |
| `acerto_modelo` | 15 | 5.2% |
| `limitacao_real_declarada` | 10 | 3.4% |
| `loop_clarificacao` | 5 | 1.7% |
| `acerto_encadeamento` | 5 | 1.7% |
| `resposta_truncada` | 4 | 1.4% |
| `dado_inventado` | 4 | 1.4% |
| `entendeu_mal_termo` | 1 | 0.3% |
| `parametro_incompleto` | 1 | 0.3% |

## 4. Achados-chave

### Bug do placeholder Xs
- Antes: 624 turnos (12.7%)
- Depois: 0 turnos (0.00%)
- **Eliminacao: 100.0% reducao**

### Erros graves (status=ERRADO)
- Antes: 1066 turnos (21.7%)
- Depois: 17 turnos (5.9%)
- **Reducao absoluta: 15.8pp**

Exemplos dos erros restantes:
- (`53c7c8d8...`) Tool retornou somente 4 contas (IRRF S/ ALUGUEL, D.A ALUGUEL, 2 RECEITAS de aluguel). A IA inventou codigos 1.1.4.1.01.000004 ALUGUEIS PAGOS ANTECIPADAMENTE MATRIZ que NAO estao no resultado. Resposta fabricada.
- (`6039c5ad...`) Chamou a tool fiscal_notas_recebidas para o mes corrente e RECEBEU os dados, mas em vez de responder a contagem pediu clarificacao - jogou fora o resultado. Deveria ter respondido com contagem do array.
- (`721cccd6...`) Não há tool de margem por produto no catálogo; deveria registrar lacuna em vez de pedir 3 clarificações que não vão a lugar nenhum.
- (`79d88859...`) Não há tool/dado de meta no Odoo; deveria registrar lacuna em vez de pedir definição de meta.
- (`8f1597d8...`) Não há tool de tempo médio de ciclo de pedido; deveria registrar lacuna.
- (`922c8c68...`) Saldo de bancos/caixa não está coberto pelo MCP; deveria registrar lacuna em vez de oferecer opções inexistentes.
- (`b8b5fddc...`) So chamou fiscal_faturamento_periodo para maio (01/05-26/05). Os numeros do mes anterior (R$31.485.649,15 / 520 notas) NAO estao em toolResults - foram inventados/alucinados. Faltou 2a chamada para 01/04-26/04.
- (`b9f508f9...`) Chamou as duas tools (ICMS-IPI e PIS-COFINS) mas o backend retornou o MESMO payload (sem distincao por tipo - so ICMS+IBPT). Resposta repete os mesmos numeros e omite PIS/COFINS, declarando incorretamente que esses sao 'o total'. Pergunta era total geral; resposta nao entrega PIS/COFINS.

### Deslocamento ERRADO -> PARCIAL
Erros graves cairam, mas PARCIAL subiu 19pp. Diagnostico: o agente passou
a pedir clarificacao em vez de inventar (top padrao em todos os 8 batches:
). Isso e uma escolha conservadora:
responder errado virou responder "preciso de mais detalhe". Melhoria
liquida sim, mas e necessario calibrar quando assumir defaults razoaveis.

## 5. Proximas mudancas sugeridas

### Refinar R3 (defaults razoaveis)
A regra atual diz "defaults em vez de pedir clarificacao", mas o agente esta
aplicando timido demais. Endurecer com exemplos:
- "saldo do produto X" sem periodo -> NUNCA pedir periodo (saldo nao tem periodo)
- "faturamento" sem periodo -> assumir mes corrente, SEM pedir confirmacao
- "clientes" / "fornecedores" sem contexto -> listar top 10 e mencionar que pode filtrar

### Refinar R5 (rate limit)
21% FORA_DE_ESCOPO sao quase todos rate limit. Confirmar que o agente esta
mesmo tentando retry antes de declarar.
