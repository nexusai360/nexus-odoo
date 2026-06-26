# F6 Onda 1 , Aceite E2E do construtor (G2c)

> Corrida E2E real (`scripts/e2e-f6-construtor.ts`) contra o **LLM real**
> (modelo do card, `openai/gpt-5-mini`) e o **cache real de estoque**
> (`fato_estoque_saldo`, 3904 linhas; produtor resolve 1894 linhas agregadas por
> produto). Data: 2026-06-26. Usuario de teste: nexusai360@gmail.com (super_admin).
>
> Criterio: **>= 7/8** com fonte geram ficha valida que renderiza; **2/2** sem
> fonte disparam recusa honesta + FeatureRequest.

## Resultado: 8/8 com fonte | 2/2 sem fonte , APROVADO

Modelo: `openai/gpt-5-mini`

| # | Prompt | Resultado | Veredito |
|---|--------|-----------|----------|
| 1 | Quero uma tabela com o saldo de estoque de cada produto | tabela (1894 linhas) | OK |
| 2 | Mostre o valor parado em estoque por produto | tabela (1894 linhas) | OK |
| 3 | Lista de produtos com saldo e valor, agrupando por familia | tabela (1894 linhas) | OK |
| 4 | Tabela de estoque por marca, com saldo e valor | tabela (1894 linhas) | OK |
| 5 | Saldo de estoque do armazem principal | tabela (1894 linhas) | OK |
| 6 | Produtos de uma familia especifica com seus saldos | tabela (1894 linhas) | OK |
| 7 | Relatorio de itens em estoque com nome, familia, marca, saldo e valor | tabela: produtoNome, familiaNome, marcaNome, saldoTotal, valorTotal (1894 linhas) | OK |
| 8 | Tabela de produtos ordenada pelo maior valor em estoque | tabela (1894 linhas) | OK |
| A | Faturamento por vendedor no ultimo trimestre | recusa=true + FeatureRequest registrado | OK |
| B | Comissoes pagas por mes aos representantes | recusa=true + FeatureRequest registrado | OK |

FeatureRequests confirmados na tabela `feature_requests` para os dois pedidos sem
fonte (dedup por `pergunta_resumo` funcionando: re-rodadas nao duplicam).

## Observacao de qualidade (nao bloqueia o aceite)

Em 7 dos 8 casos o agente criou a `DataTable` sem preencher `config.colunas`
(o caso 7, que pediu colunas explicitas, populou as 5). O `DataTable` renderiza
mesmo sem `colunas` (deriva as chaves das linhas), entao a ficha e valida e
renderiza. Melhoria para a onda 2: reforcar no system prompt que o agente
defina `config.colunas` a partir de `prever_dado` para um cabecalho mais
amigavel. Registrado como refinamento, nao como defeito.

## Reproduzir

```bash
npx tsx --env-file=.env.local scripts/e2e-f6-construtor.ts
```

Custo aproximado: ~10 conversas curtas do gpt-5-mini (centavos).
