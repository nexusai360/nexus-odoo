# R1 Router de catalogo, relatorio de calibragem

> Gerado em 2026-05-29T06:42:12.863Z
> Settings: threshold=0.3, topK=3, dataset=291 perguntas

## KPIs globais

- **Top-1 acerto:** 88.4% (191/216)
- **Top-K acerto (label em pickedDomains):** 98.6% (213/216)
- **Fallbacks:** 11/291 (3.8%)
- **Latencia pickDurationMs:** p50=370ms, p95=1553ms, p99=5661ms

## Por dominio (so dominios MCP mapeaveis)

| Dominio | Total | Top-1 | Top-K |
|---|---:|---:|---:|
| cadastros | 32 | 100.0% | 100.0% |
| comercial | 33 | 90.9% | 100.0% |
| contabil | 20 | 90.0% | 100.0% |
| estoque | 46 | 87.0% | 95.7% |
| financeiro | 45 | 75.6% | 97.8% |
| fiscal | 40 | 92.5% | 100.0% |

## Discordancias (label fora do top-K), top 30

Candidatos a ajustar `domain-vocabulary.ts`.

| Label | Pergunta | Picked | TopScore |
|---|---|---|---:|
| estoque | Quais produtos estão parados (sem movimentação) há mais de 90 dias? | (fallback) | n/a |
| estoque | Onde estão concentrados os produtos por marca? | (fallback) | n/a |
| financeiro | Posição dos bancos hoje | (fallback) | n/a |

## Categorias nao mapeaveis (semanticas, nao de dominio)

- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`
- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.
- Nao contam para Top-1 / Top-K accuracy (mappable=false).