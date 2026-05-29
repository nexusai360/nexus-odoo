# R1 Router de catalogo, relatorio de calibragem

> Gerado em 2026-05-29T02:07:16.473Z
> Settings: threshold=0.3, topK=3, dataset=291 perguntas

## KPIs globais

- **Top-1 acerto:** 87.0% (188/216)
- **Top-K acerto (label em pickedDomains):** 96.3% (208/216)
- **Fallbacks:** 15/291 (5.2%)
- **Latencia pickDurationMs:** p50=539ms, p95=907ms, p99=6150ms

## Por dominio (so dominios MCP mapeaveis)

| Dominio | Total | Top-1 | Top-K |
|---|---:|---:|---:|
| cadastros | 32 | 100.0% | 100.0% |
| comercial | 33 | 90.9% | 100.0% |
| contabil | 20 | 90.0% | 100.0% |
| estoque | 46 | 78.3% | 84.8% |
| financeiro | 45 | 77.8% | 97.8% |
| fiscal | 40 | 92.5% | 100.0% |

## Discordancias (label fora do top-K), top 30

Candidatos a ajustar `domain-vocabulary.ts`.

| Label | Pergunta | Picked | TopScore |
|---|---|---|---:|
| estoque | Qual armazém tem mais valor de estoque? | (fallback) | n/a |
| estoque | Produtos do family pé na bola? | (fallback) | n/a |
| estoque | Saldo do produto de código completo 1000205039 | (fallback) | n/a |
| estoque | Saldo do MGPL78 | (fallback) | n/a |
| estoque | Sobrou alguma coisa do [102]? | (fallback) | n/a |
| estoque | Estoque morto da empresa | (fallback) | n/a |
| estoque | Tem [1000362251] hoje no estoque? | (fallback) | n/a |
| financeiro | Qual o saldo atual das contas? | (fallback) | n/a |

## Categorias nao mapeaveis (semanticas, nao de dominio)

- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`
- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.
- Nao contam para Top-1 / Top-K accuracy (mappable=false).