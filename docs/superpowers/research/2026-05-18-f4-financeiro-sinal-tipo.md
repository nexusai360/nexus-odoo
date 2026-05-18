# F4 — Evidência: campo `tipo` vs `sinal` em `finan.pagamento.divida`

> Investigação I1 — 2026-05-18. Consulta ao banco dev (raw_finan_pagamento_divida).

## Consulta executada

```sql
SELECT data->>'tipo' as tipo, data->>'sinal' as sinal, COUNT(*)
FROM raw_finan_pagamento_divida
WHERE raw_deleted = false
GROUP BY data->>'tipo', data->>'sinal';
```

## Resultado

| tipo        | sinal | count |
|-------------|-------|-------|
| pagamento   | -1    | 412   |
| recebimento | 1     | 729   |
| recebimento | 0     | 5     |

## Análise

- **`sinal = 0` com `tipo = "recebimento"` existe** (5 registros). Isso invalida a regra
  `sinal >= 0 → a_receber` como regra completa — um sinal zerado poderia tecnicamente ser
  qualquer coisa, mas aqui a fonte revela que são recebimentos.
- O campo `tipo` (selection: `"pagamento"` / `"recebimento"`) é o **oráculo correto** —
  ele está presente em 100% dos registros e reflete a semântica do domínio diretamente.
- A derivação por `sinal` (`sinal < 0 → a_pagar`) acertaria em 412+729 casos mas falharia
  por fragilidade de design: qualquer `sinal = 0` futuro viraria `a_receber` por coincidência,
  não por regra.

## Decisão aplicada

`derivaTipo` usa `raw.tipo === "pagamento" ? "a_pagar" : "a_receber"` — mapeamento direto do
campo selection real. Código auditado e testado com os 3 casos (pagamento/-1, recebimento/1,
recebimento/0).
