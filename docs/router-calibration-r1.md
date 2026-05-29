# R1 Router de catalogo, relatorio de calibragem

> Gerado em 2026-05-29T01:31:46.431Z
> Settings: threshold=0.25, topK=3, dataset=291 perguntas

## KPIs globais

- **Top-1 acerto:** 77.8% (168/216)
- **Top-K acerto (label em pickedDomains):** 93.1% (201/216)
- **Fallbacks:** 9/291 (3.1%)
- **Latencia pickDurationMs:** p50=544ms, p95=1211ms, p99=6444ms

## Por dominio (so dominios MCP mapeaveis)

| Dominio | Total | Top-1 | Top-K |
|---|---:|---:|---:|
| cadastros | 32 | 96.9% | 96.9% |
| comercial | 33 | 75.8% | 97.0% |
| contabil | 20 | 65.0% | 85.0% |
| estoque | 46 | 82.6% | 95.7% |
| financeiro | 45 | 84.4% | 95.6% |
| fiscal | 40 | 57.5% | 85.0% |

## Discordancias (label fora do top-K), top 30

Candidatos a ajustar `domain-vocabulary.ts`.

| Label | Pergunta | Picked | TopScore |
|---|---|---|---:|
| estoque | Tem quanto de cabo de aço? | (fallback) | 0.24 |
| estoque | O que temos do código 1000093102 | cadastros, fiscal, dominios-vazios, caminho3 | 0.42 |
| financeiro | Quanto vai sair essa semana? | comercial, fiscal, estoque, dominios-vazios, caminho3 | 0.31 |
| financeiro | Fornecedor que mais devemos | cadastros, fiscal, comercial, dominios-vazios, caminho3 | 0.40 |
| fiscal | Quantas notas recebemos do fornecedor [SMARTFIT]? | (fallback) | n/a |
| fiscal | Top 5 clientes que mais compraram esse mês | comercial, cadastros, crm, dominios-vazios, caminho3 | 0.44 |
| fiscal | Top 5 clientes que mais compraram este ano | comercial, cadastros, crm, dominios-vazios, caminho3 | 0.43 |
| fiscal | Produtos mais vendidos nos últimos 30 dias | comercial, estoque, crm, dominios-vazios, caminho3 | 0.48 |
| fiscal | Produto mais vendido em valor | comercial, crm, estoque, dominios-vazios, caminho3 | 0.51 |
| fiscal | Produto mais vendido em quantidade | comercial, estoque, crm, dominios-vazios, caminho3 | 0.51 |
| comercial | Parcelas que vencem amanhã | financeiro, fiscal, estoque, dominios-vazios, caminho3 | 0.38 |
| cadastros | Buscar fornecedor Icaro Rossas | (fallback) | n/a |
| contabil | Conta de receita de vendas | financeiro, comercial, fiscal, dominios-vazios, caminho3 | 0.49 |
| contabil | Buscar conta com 'aluguel' no nome | financeiro, cadastros, caminho3, dominios-vazios | 0.34 |
| contabil | Buscar conta com 'imposto' no nome | fiscal, financeiro, cadastros, dominios-vazios, caminho3 | 0.40 |

## Categorias nao mapeaveis (semanticas, nao de dominio)

- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`
- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.
- Nao contam para Top-1 / Top-K accuracy (mappable=false).