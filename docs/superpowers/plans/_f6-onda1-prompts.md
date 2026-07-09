# F6 Onda 1 , Prompts golden do construtor (G2a)

> Casos congelados para a corrida E2E (G2c). Fonte 100% disponivel no construtor
> da onda 1: `fato_estoque_saldo` (dominio estoque). Unico template que renderiza
> na onda 1: **DataTable** (shape derivado `tabela`). Logo, todo caso "com fonte"
> esperado abaixo resolve para uma `DataTable` sobre `fato_estoque_saldo`.
>
> Campos disponiveis no shape `tabela` (do contrato real, `source-registry.ts`):
> `produtoNome` (texto), `familiaNome` (texto), `marcaNome` (texto),
> `saldoTotal` (numero), `valorTotal` (moeda).
>
> Filtros suportados pela fonte: `armazemId`, `familiaId`, `termo`.
>
> Criterio de aceite (G2c): **>= 7 dos 8** casos "com fonte" geram ficha valida
> que renderiza, com `shape === "tabela"`, `template === "DataTable"` e ao menos
> uma coluna entre as plausiveis. Os 2 casos "sem fonte" devem disparar recusa
> honesta (`SEM_FONTE`) + `FeatureRequest`.

## 8 casos COM fonte (esperado: ficha valida DataTable/tabela)

| # | Prompt | shapeEsperado | colunasPlausiveis |
|---|--------|---------------|-------------------|
| 1 | Quero uma tabela com o saldo de estoque de cada produto | tabela | produtoNome, saldoTotal |
| 2 | Mostre o valor parado em estoque por produto | tabela | produtoNome, valorTotal |
| 3 | Lista de produtos com saldo e valor, agrupando por familia | tabela | familiaNome, produtoNome, saldoTotal, valorTotal |
| 4 | Tabela de estoque por marca, com saldo e valor | tabela | marcaNome, saldoTotal, valorTotal |
| 5 | Saldo de estoque do armazem principal (filtre por armazem) | tabela | produtoNome, saldoTotal |
| 6 | Produtos de uma familia especifica com seus saldos (filtro de familia) | tabela | produtoNome, familiaNome, saldoTotal |
| 7 | Relatorio de itens em estoque com nome, familia, marca, saldo e valor | tabela | produtoNome, familiaNome, marcaNome, saldoTotal, valorTotal |
| 8 | Tabela de produtos ordenada pelo maior valor em estoque | tabela | produtoNome, valorTotal |

## 2 casos SEM fonte (esperado: recusa honesta + FeatureRequest)

| # | Prompt | Por que nao tem fonte |
|---|--------|------------------------|
| A | Faturamento por vendedor no ultimo trimestre | dominio comercial/faturamento ainda sem fato no construtor (onda 1 so estoque) |
| B | Comissoes pagas por mes aos representantes | dominio financeiro/comercial sem fonte no construtor (onda 1 so estoque) |

> Observacao: a recusa depende do modelo seguir a convencao do system prompt
> (responder iniciando com `SEM_FONTE:`). O `run-builder` registra o
> `FeatureRequest` e devolve `recusa: true`. Casos sem fonte que o modelo tente
> "forcar" numa fonte de estoque irrelevante contam como falha de aceite.
