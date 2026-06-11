# DRY-RUN , Purge pre-2026 (2026-06-11T15:39Z)

| tabela | criterio | a deletar | NULLs preservados | total | MB |
|---|---|---|---|---|---|
| raw_estoque_extrato | data data < 2026 | 120 | 0 | 17487 | 37 |
| raw_finan_banco_extrato | data data < 2026 | 76 | 0 | 1465 | 1 |
| raw_finan_fluxo_caixa | data data < 2026 | 249 | 0 | 15333 | 15 |
| raw_finan_lancamento | quitado/baixado pago<2026 (vivos FICAM) | 76 | 0 | 11229 | 36 |
| raw_pedido_documento | data data_orcamento < 2026 | 81 | 0 | 1861 | 14 |
| raw_pedido_parcela | data data_vencimento < 2026 | 40 | 0 | 3024 | 4 |
| raw_sped_consulta_dfe_item | data data_hora_emissao < 2026 | 5831 | 0 | 14338 | 23 |
| raw_sped_documento | data data_emissao < 2026 | 39919 | 0 | 50358 | 213 |
| raw_sped_documento_pagamento | filho de raw_sped_documento | 33060 | 0 | 36756 | 24 |
| raw_sped_documento_referenciado | filho de raw_sped_documento | 1968 | 0 | 2909 | 2 |
| raw_sped_apuracao | data data_final < 2026 | 0 | 0 | 8 | 0 |

**Total a deletar: 81420 linhas.** Aprovar antes do --apply (T4c).

## Pendencias conhecidas deste dry-run (T4b parcial)
- 3 filhos falharam com PrismaClientKnownRequestError (raw_sped_documento_item,
  _duplicata, _item_rastreabilidade) , investigar o cast da FK m2o (linhas com
  documento_id/item_id nao-array?) na proxima sessao. Sao exatamente as tabelas
  do maior ganho (923MB) , o purge NAO roda sem elas resolvidas.
- volume nao esta no MODEL_CATALOG (tabela raw_sped_documento_volume existe) ,
  conferir se o modelo e sincronizado por outro nome.

