# Comparativo 3 Pontos: Antes, Rodada 1, Rodada 2

| Metrica | Antes (4914) | Rodada 1 (291) | **Rodada 2 (290)** |
|---|---|---|---|
| CORRETO | 51.8% | 30.7% | **43.8%** |
| PARCIAL | 19.8% | 42.8% | 49.7% |
| ERRADO | 21.7% | 5.9% | **4.1%** |
| FORA_ESCOPO | 6.7% | 20.7% | **2.4%** |
| placeholder Xs | 12.7% | 0% | 0.0% |
| Factual bate | n/a | 91.6% | 90.6%

## Mudancas aplicadas entre rodada 1 e 2:
- R3 endurecida com defaults canonicos (R3.1-R3.6)
- Retry de rate limit no codigo (run-agent.ts)

## Top padroes residuais (rodada 2):

- `pediu_clarificacao_desnecessaria`: 140 (48.3%)
- `acerto_objetividade`: 93 (32.1%)
- `nao_usou_tool`: 56 (19.3%)
- `acerto_modelo`: 14 (4.8%)
- `fluxo_tool_incompleto`: 12 (4.1%)
- `limitacao_real_declarada`: 9 (3.1%)
- `dado_inventado`: 6 (2.1%)
- `acerto_encadeamento`: 5 (1.7%)

## Diagnostico do gap ate 95%:

- ERRADO + FORA_ESCOPO somam apenas 6.6% — proximo do minimo aceitavel.
- O grande gap esta em PARCIAL (49.7%): agente ainda pede clarificacao demais.
- top padrao continua `pediu_clarificacao_desnecessaria` (140 turnos).
- Proximas mudancas devem focar em transformar PARCIAL -> CORRETO sem aumentar ERRADO.

## Exemplos dos 12 erros residuais:

- Disse 'mês passado: R$33.997.934,37 em 628 notas' mas só chamou tool para maio/2026. Valor de abril não veio de tool. Variação inventada.
- Tool retorna 49 etapas. Soma de quantidades nao-finalizadas eh 540, nao 533. Sem cancelados (13) seria 527, nao 520. Numeros nao batem com o agregado real do toolResult.
- Pergunta legitima sobre cruzar pedidos abertos com contas a receber em atraso. Em vez de tentar via tools (comercial_pedidos_por_etapa + financeiro_titulos_vencidos) e cruzar por participante, pediu 3 confirmacoes - virou loop.
- Tool retornou os titulos a receber em aberto, mas o agente declarou 'visualizacao truncada' e nao deu o total - poderia ter somado os vrSaldo das linhas. Falha grave: alucinou que estava truncado e jogou pergunta de volta.
- User pediu 'essa semana'. Tool chamada apenas com 25/05 a 26/05 (2 dias). Resposta diz '25/05/2026 a 31/05/2026' mas o R$ 0,00 cobre so 2 dias - texto contradiz o filtro real.
- ToolResults retornou apenas linhas com dataVencimento=2026-05-26 (hoje). Resposta cita amanha 27/05 com 'Pedido 1476 R$ 6.000' e 'Pedido 103 parcela 4 R$ 2.577,89' - nenhum desses aparece nas linhas (que tem 21000, 2000, 17560.15, 6210.65, 2796.07). Dados completamente inventados. Alem disso, argumento foi ateDias=1 mas tool retornou itens de hoje, nao de amanha.