# R1 Router de catalogo, relatorio de calibragem

> Gerado em 2026-05-29T00:34:15.559Z
> Settings: threshold=0.55, topK=3, dataset=291 perguntas

## KPIs globais

- **Top-1 acerto:** 16.2% (35/216)
- **Top-K acerto (label em pickedDomains):** 16.7% (36/216)
- **Fallbacks:** 245/291 (84.2%)
- **Latencia pickDurationMs:** p50=445ms, p95=2078ms, p99=4672ms

## Por dominio (so dominios MCP mapeaveis)

| Dominio | Total | Top-1 | Top-K |
|---|---:|---:|---:|
| cadastros | 32 | 9.4% | 9.4% |
| comercial | 33 | 30.3% | 30.3% |
| contabil | 20 | 25.0% | 30.0% |
| estoque | 46 | 13.0% | 13.0% |
| financeiro | 45 | 13.3% | 13.3% |
| fiscal | 40 | 12.5% | 12.5% |

## Discordancias (label fora do top-K), top 30

Candidatos a ajustar `domain-vocabulary.ts`.

| Label | Pergunta | Picked | TopScore |
|---|---|---|---:|
| estoque | Qual o saldo total em estoque do produto [102] MGPL78 - GLUTE TRAINER MATRIX? | (fallback) | 0.51 |
| estoque | Quanto temos de mola espiral em aço no armazém? | (fallback) | n/a |
| estoque | Quantas unidades temos do produto 1000362251? | (fallback) | 0.34 |
| estoque | Qual o valor total do estoque em armazém? | (fallback) | 0.55 |
| estoque | Houve entrada de qual produto na última semana? | (fallback) | 0.49 |
| estoque | Top 5 produtos mais movimentados no mês | (fallback) | 0.47 |
| estoque | Qual o saldo do FLEXORA EXTENSORA? | (fallback) | 0.36 |
| estoque | Estou querendo saber quanto tem de halter em estoque | (fallback) | 0.46 |
| estoque | Quero conferir o estoque de barras | (fallback) | 0.49 |
| estoque | Cadê os equipamentos PMB403? | (fallback) | 0.29 |
| estoque | Tem quanto de cabo de aço? | (fallback) | 0.26 |
| estoque | Concentração do estoque por família | (fallback) | 0.45 |
| estoque | Produto 102 tem quantos em armazém? | (fallback) | 0.42 |
| estoque | Quero ver o saldo dos puxadores | (fallback) | 0.44 |
| estoque | Quantos itens temos com saldo zero? | (fallback) | 0.51 |
| estoque | Vai ter halteres pra entrega amanhã? | (fallback) | 0.28 |
| estoque | Cadê o estoque do pino de aço? | (fallback) | 0.41 |
| estoque | Tem disco de musculação parado? | (fallback) | 0.30 |
| estoque | Saldo do PMB403 hoje | (fallback) | 0.40 |
| estoque | Saldo de pino de aço fixação | (fallback) | 0.31 |
| estoque | O que temos do código 1000093102 | (fallback) | 0.37 |
| estoque | Estoque atual do GLUTE TRAINER | (fallback) | 0.32 |
| estoque | Tem [1000362265] ainda? | (fallback) | 0.34 |
| estoque | Quanto sobrou de cabo de aço esticado? | (fallback) | 0.26 |
| estoque | Tem produto sem movimento esse ano? | (fallback) | 0.41 |
| estoque | Quero ver entradas dos últimos 7 dias | (fallback) | 0.39 |
| estoque | Saída de produtos da semana passada | (fallback) | 0.47 |
| estoque | Movimentação de produtos no mês | (fallback) | 0.53 |
| estoque | Onde estão concentrados os produtos por marca? | (fallback) | 0.40 |
| estoque | Produtos do family pé na bola? | (fallback) | 0.32 |

## Categorias nao mapeaveis (semanticas, nao de dominio)

- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`
- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.
- Nao contam para Top-1 / Top-K accuracy (mappable=false).