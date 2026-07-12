# DRY-RUN , Purge pre-2026 (2026-07-12T01:58Z)

| tabela | criterio | a deletar | NULLs preservados | total | MB |
|---|---|---|---|---|---|
| raw_sped_documento_item_rastreabilidade | filho de raw_sped_documento_item | 3885 | 0 | 55422 | 77 |
| raw_sped_documento_duplicata | filho de raw_sped_documento | 471 | 0 | 5504 | 4 |
| raw_sped_documento_item | filho de raw_sped_documento | 16838 | 0 | 62291 | 316 |
| raw_sped_documento_pagamento | filho de raw_sped_documento | 2449 | 0 | 4462 | 3 |
| raw_sped_documento_referenciado | filho de raw_sped_documento | 436 | 0 | 1568 | 1 |
| raw_sped_documento_volume | filho de raw_sped_documento | 907 | 0 | 3970 | 2 |
| raw_estoque_extrato | data data < 2026 | 486 | 0 | 24084 | 50 |
| raw_finan_banco_extrato | data data < 2026 | 6 | 0 | 1389 | 1 |
| raw_finan_fluxo_caixa | data data < 2026 | 379 | 0 | 15084 | 17 |
| raw_finan_lancamento | quitado/baixado pago<2026 (vivos FICAM) | 61 | 0 | 15102 | 66 |
| raw_pedido_documento | data data_orcamento < 2026 | 144 | 0 | 2507 | 19 |
| raw_pedido_parcela | data data_vencimento < 2026 | 44 | 0 | 5033 | 7 |
| raw_sped_consulta_dfe_item | data data_hora_emissao < 2026 | 4899 | 0 | 13148 | 22 |
| raw_sped_documento | data data_emissao < 2026 | 3781 | 0 | 13780 | 64 |
| raw_sped_apuracao | data data_final < 2026 | 0 | 0 | 9 | 0 |

**Total a deletar: 34786 linhas.** Aprovar antes do --apply (T4c).
