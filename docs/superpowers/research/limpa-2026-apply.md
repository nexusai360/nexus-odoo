# APPLY , Purge pre-2026 (2026-06-11T17:40Z)

| tabela | deletadas | lotes | duracao s |
|---|---|---|---|
| raw_sped_documento_item_rastreabilidade | 160 | 1 | 1.9 |
| raw_sped_documento_duplicata | 18237 | 2 | 0.6 |
| raw_sped_documento_item | 173758 | 18 | 15.7 |
| raw_sped_documento_pagamento | 33060 | 4 | 0.5 |
| raw_sped_documento_referenciado | 1968 | 1 | 0.0 |
| raw_sped_documento_volume | 16435 | 2 | 0.3 |
| raw_estoque_extrato | 0 | 1 | 0.0 |
| raw_finan_banco_extrato | 76 | 1 | 0.0 |
| raw_finan_fluxo_caixa | 249 | 1 | 0.0 |
| raw_finan_lancamento | 76 | 1 | 0.2 |
| raw_pedido_documento | 81 | 1 | 0.1 |
| raw_pedido_parcela | 40 | 1 | 0.0 |
| raw_sped_consulta_dfe_item | 5831 | 1 | 0.1 |
| raw_sped_documento | 39919 | 4 | 1.0 |
| raw_sped_apuracao | 0 | 1 | 0.0 |

**Total deletado: 289890 linhas em 21s.**
Proximo: `--vacuum` (T4d) com worker parado, depois rebuild dos fatos (T5/T6).

## VACUUM (2026-06-11T17:42Z)

| tabela | MB antes | MB depois | ganho MB | duracao s |
|---|---|---|---|---|
| raw_sped_documento_item_rastreabilidade | 53 | 50 | 3 | 0.3 |
| raw_sped_documento_duplicata | 13 | 2 | 11 | 0.1 |
| raw_sped_documento_item | 925 | 194 | 731 | 2.0 |
| raw_sped_documento_pagamento | 24 | 3 | 22 | 0.1 |
| raw_sped_documento_referenciado | 2 | 1 | 2 | 0.1 |
| raw_sped_documento_volume | 10 | 2 | 9 | 0.0 |
| raw_estoque_extrato | 37 | 18 | 19 | 0.2 |
| raw_finan_banco_extrato | 1 | 1 | 0 | 0.0 |
| raw_finan_fluxo_caixa | 15 | 11 | 3 | 0.1 |
| raw_finan_lancamento | 37 | 30 | 8 | 0.1 |
| raw_pedido_documento | 14 | 11 | 3 | 0.0 |
| raw_pedido_parcela | 4 | 3 | 1 | 0.0 |
| raw_sped_consulta_dfe_item | 23 | 13 | 10 | 0.1 |
| raw_sped_documento | 213 | 43 | 170 | 0.2 |
| raw_sped_apuracao | 0 | 0 | 0 | 0.1 |
| raw_sped_produto_lote_serie | 2902 | 2809 | 94 | 38.1 |

**Ganho total: 1083 MB.** Duracao de DEV dimensiona a janela de PROD (T10).
