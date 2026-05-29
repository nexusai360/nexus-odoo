# R1 Router de catalogo, relatorio de calibragem

> Gerado em 2026-05-29T01:51:13.402Z
> Settings: threshold=0.3, topK=3, dataset=291 perguntas

## KPIs globais

- **Top-1 acerto:** 88.0% (190/216)
- **Top-K acerto (label em pickedDomains):** 98.1% (212/216)
- **Fallbacks:** 12/291 (4.1%)
- **Latencia pickDurationMs:** p50=577ms, p95=1657ms, p99=6383ms

## Por dominio (so dominios MCP mapeaveis)

| Dominio | Total | Top-1 | Top-K |
|---|---:|---:|---:|
| cadastros | 32 | 96.9% | 96.9% |
| comercial | 33 | 87.9% | 97.0% |
| contabil | 20 | 90.0% | 100.0% |
| estoque | 46 | 91.3% | 100.0% |
| financeiro | 45 | 75.6% | 97.8% |
| fiscal | 40 | 90.0% | 97.5% |

## Discordancias (label fora do top-K), top 30

Candidatos a ajustar `domain-vocabulary.ts`.

| Label | Pergunta | Picked | TopScore |
|---|---|---|---:|
| financeiro | Contas a pagar do mês | (fallback) | n/a |
| fiscal | Faturamento por cliente esse mês | (fallback) | n/a |
| comercial | Quem é o vendedor com mais pedidos? | (fallback) | n/a |
| cadastros | Cadastro completo do cliente Smartfit | (fallback) | n/a |

## Categorias nao mapeaveis (semanticas, nao de dominio)

- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`
- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.
- Nao contam para Top-1 / Top-K accuracy (mappable=false).