# F4 — Descoberta das Fontes do Domínio Financeiro

> Task 4a.2 — executada em 2026-05-18.

---

## Modelos no `MODEL_CATALOG` e seus modos

| Odoo Model | `mode` no catalog | Tabela raw esperada |
|---|---|---|
| `finan.fluxo.caixa` | `incremental` | `raw_finan_fluxo_caixa` |
| `finan.pagamento.divida` | `incremental` | `raw_finan_pagamento_divida` |
| `finan.banco.saldo.hoje` | `snapshot` | `raw_finan_banco_saldo_hoje` |

Confirma a tabela 3.4 da spec: `finan.banco.saldo.hoje` é `snapshot`; os demais são `incremental`. ✅

---

## Step 1 — Valores reais de `selection` dos campos relevantes

### `finan.banco.saldo.hoje`

Campo `tipo` (campo selection documentado na amostra):
- `"corrente"` — todos os 8 registros da amostra são `corrente`.

Não há campo `selection` explícito definido no schema de discovery para os demais
campos monetários (`saldo`, `entrada`, `saida`, `anterior`). São `float` simples.

### `finan.fluxo.caixa`

Campos disponíveis na amostra: `entrada`, `saida`, `valor`, `entrada_prevista`,
`saida_prevista`, `valor_previsto`, `data`, `conta_id`, `centro_resultado_id`.

**Nenhum campo `selection` definido** para `tipo`/`situacao`/`sinal` — não existem
nesses registros.

### `finan.pagamento.divida`

Campos na amostra (todos os 8 registros):
- `situacao`: `"efetivo"` (pagamentos confirmados)
- `situacao_divida`: `"quitado"`
- `situacao_divida_simples`: `"quitado"`
- `sinal`: `-1` (saída = pagamento) — presumido que `+1` = recebimento
- `tipo`: `"pagamento"` — presumido que `"recebimento"` existe

**Nenhum campo `selection` explícito** no schema de discovery (os valores acima
são extraídos da amostra empírica).

---

## Step 2 — Realizado × Previsto coexistem na mesma linha

**Confirmado: realizado e previsto coexistem na mesma linha** em `finan.fluxo.caixa`.

Exemplo da amostra:
```
id=518648: entrada=0.0, entrada_prevista=1237.5, saida=0.0, saida_prevista=0.0
```

A linha tem tanto `entrada`/`saida`/`valor` (realizado, possivelmente zero) quanto
`entrada_prevista`/`saida_prevista`/`valor_previsto`. Não são linhas distintas por
`natureza`.

**Decisão #IM-2 resolvida:** `FatoFinanceiroMovimento` **NÃO ganha coluna `natureza`**.
O modelo do plano (sem `natureza String`) é o correto. A Task 4a.3 cria o modelo
sem essa coluna.

---

## Step 3 — Unicidade de `banco_id` em `raw_finan_banco_saldo_hoje`

**Resultado:** 8 linhas, 8 `banco_id` distintos. `banco_id` é único por linha no snapshot.

```
banco_id values: [2, 1, 3, 4, 5, 6, 7, 9]
distinct banco_ids: 8
total rows: 8
```

**Decisão PK de `FatoFinanceiroSaldo`:** usar `bancoId Int @id` (variante PK-bancoId
conforme o plano). A Task 4a.3 usa o modelo sem o `@@unique` composto.

---

## Step 4 — Critério "não pago" para `fato_financeiro_titulo`

**Critério nomeado `CRITERIO_NAO_PAGO`:**

> Um título é considerado "não pago" quando `dataPagamento IS NULL` (campo
> `data_pagamento` ausente/nulo no raw). O campo `situacaoSimples` pode ser
> `"aberto"` ou similar, mas a regra determinística é `dataPagamento == null`,
> independente do valor de `situacaoSimples` — pois a amostra mostrou apenas
> títulos `"quitado"` com `data_pagamento` preenchida.

Exemplo da amostra (todos quitados):
```
situacao_divida_simples=quitado, data_pagamento=2026-05-13
```

As tasks 4d.5/4d.6/4d.7 usam:
```ts
where: { dataPagamento: null }
```
como filtro de "não pago" no `findMany`.

---

## Step 5 — Presença no `MODEL_CATALOG`

Confirmado em `src/worker/catalog/model-catalog.ts`:

```ts
{ odooModel: "finan.fluxo.caixa", mode: "incremental" },
{ odooModel: "finan.pagamento.divida", mode: "incremental" },
{ odooModel: "finan.banco.saldo.hoje", mode: "snapshot" },
```

Todos presentes com os modos corretos conforme spec. ✅

---

## Resumo das decisões para Task 4a.3

1. **`FatoFinanceiroMovimento` sem campo `natureza`** — realizado e previsto
   coexistem na mesma linha.
2. **`FatoFinanceiroSaldo` com `bancoId Int @id`** — `banco_id` é único por linha.
3. **`CRITERIO_NAO_PAGO = dataPagamento: null`** — usado nas tools de vencidos.
