# DRY-RUN , Purge pre-2026 (2026-06-11T16:21Z)

| tabela | criterio | a deletar | NULLs preservados | total | MB |
|---|---|---|---|---|---|
| raw_estoque_extrato | data data < 2026 | 120 | 0 | 17484 | 37 |
| raw_finan_banco_extrato | data data < 2026 | 76 | 0 | 1465 | 1 |
| raw_finan_fluxo_caixa | data data < 2026 | 249 | 0 | 15333 | 15 |
| raw_finan_lancamento | quitado/baixado pago<2026 (vivos FICAM) | 76 | 0 | 11230 | 37 |
| raw_pedido_documento | data data_orcamento < 2026 | 81 | 0 | 1861 | 14 |
| raw_pedido_parcela | data data_vencimento < 2026 | 40 | 0 | 3024 | 4 |
| raw_sped_consulta_dfe_item | data data_hora_emissao < 2026 | 5831 | 0 | 14338 | 23 |
| raw_sped_documento | data data_emissao < 2026 | 39919 | 0 | 50358 | 213 |
| raw_sped_documento_duplicata | filho de raw_sped_documento | 18237 | 0 | 22081 | 13 |
| raw_sped_documento_item | filho de raw_sped_documento | 173758 | 0 | 221632 | 924 |
| raw_sped_documento_item_rastreabilidade | filho de raw_sped_documento_item | 160 | 0 | 43124 | 53 |
| raw_sped_documento_pagamento | filho de raw_sped_documento | 33060 | 0 | 36756 | 24 |
| raw_sped_documento_referenciado | filho de raw_sped_documento | 1968 | 0 | 2909 | 2 |
| raw_sped_documento_volume | filho de raw_sped_documento | 16435 | 0 | 19291 | 10 |
| raw_sped_apuracao | data data_final < 2026 | 0 | 0 | 8 | 0 |

**Total a deletar: 290010 linhas.** Aprovar antes do --apply (T4c).

## Notas deste dry-run (T4b completo, pendencias da versao anterior RESOLVIDAS)
- Causa raiz das 3 falhas (item/duplicata/rastreabilidade): FK m2o vazia vem
  como `false` do Odoo, e em jsonb o escalar age como array de 1 elemento no
  operador `-> 0` (false->>0 = 'false' passa no IS NOT NULL e quebra o cast
  ::int). Fix: guard `jsonb_typeof(data->'fk') = 'array'` nos predicados de
  filho e neto; linhas com FK false/null sao preservadas.
- sped.documento.volume ESTAVA no catalogo (anotacao anterior errada), so sem
  cortePai; FK verificada no banco (18.742 array + 549 false) e adicionada.
- Cobertura: 15/15 tabelas com corte mapeadas, nenhuma falha.
