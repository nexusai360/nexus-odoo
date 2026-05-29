# R1 Router de catalogo, relatorio de calibragem

> Gerado em 2026-05-29T01:48:41.700Z
> Settings: threshold=0.3, topK=3, dataset=291 perguntas

## KPIs globais

- **Top-1 acerto:** 88.9% (192/216)
- **Top-K acerto (label em pickedDomains):** 99.1% (214/216)
- **Fallbacks:** 9/291 (3.1%)
- **Latencia pickDurationMs:** p50=589ms, p95=1286ms, p99=8701ms

## Por dominio (so dominios MCP mapeaveis)

| Dominio | Total | Top-1 | Top-K |
|---|---:|---:|---:|
| cadastros | 32 | 100.0% | 100.0% |
| comercial | 33 | 87.9% | 97.0% |
| contabil | 20 | 90.0% | 100.0% |
| estoque | 46 | 89.1% | 97.8% |
| financeiro | 45 | 77.8% | 100.0% |
| fiscal | 40 | 92.5% | 100.0% |

## Discordancias (label fora do top-K), top 30

Candidatos a ajustar `domain-vocabulary.ts`.

| Label | Pergunta | Picked | TopScore |
|---|---|---|---:|
| estoque | Cadê o estoque do pino de aço? | (fallback) | n/a |
| comercial | Pedidos em aprovação | (fallback) | n/a |

## Categorias nao mapeaveis (semanticas, nao de dominio)

- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`
- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.
- Nao contam para Top-1 / Top-K accuracy (mappable=false).