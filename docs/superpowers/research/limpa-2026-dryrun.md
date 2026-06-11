# DRY-RUN , Purge pre-2026 (2026-06-11T18:08Z)

| tabela | criterio | a deletar | NULLs preservados | total | MB |
|---|---|---|---|---|---|
| raw_sped_documento_item_rastreabilidade | filho de raw_sped_documento_item | 0 | 0 | 43012 | 50 |
| raw_sped_documento_duplicata | filho de raw_sped_documento | 0 | 0 | 3854 | 2 |
| raw_sped_documento_item | filho de raw_sped_documento | 0 | 0 | 48032 | 194 |
| raw_sped_documento_pagamento | filho de raw_sped_documento | 0 | 0 | 3701 | 3 |
| raw_sped_documento_referenciado | filho de raw_sped_documento | 0 | 0 | 942 | 1 |
| raw_sped_documento_volume | filho de raw_sped_documento | 0 | 0 | 2867 | 2 |
| raw_estoque_extrato | data data < 2026 | 0 | 0 | 17514 | 18 |
| raw_finan_banco_extrato | data data < 2026 | 0 | 0 | 1389 | 1 |
| raw_finan_fluxo_caixa | data data < 2026 | 0 | 0 | 15084 | 11 |
| raw_finan_lancamento | quitado/baixado pago<2026 (vivos FICAM) | 0 | 0 | 11168 | 30 |
| raw_pedido_documento | data data_orcamento < 2026 | 0 | 0 | 1793 | 11 |
| raw_pedido_parcela | data data_vencimento < 2026 | 0 | 0 | 2990 | 3 |
| raw_sped_consulta_dfe_item | data data_hora_emissao < 2026 | 0 | 0 | 8511 | 13 |
| raw_sped_documento | data data_emissao < 2026 | 0 | 0 | 10473 | 43 |
| raw_sped_apuracao | data data_final < 2026 | 0 | 0 | 8 | 0 |

**Total a deletar: 0 linhas.** Aprovar antes do --apply (T4c).

## Contexto desta versao (pos-purge)
Este arquivo foi regravado pelo dry-run de VERIFICACAO rodado APOS o purge e
apos 2+ ciclos do worker com o corte ativo: **0 linhas a deletar** = criterio
de aceite nº 3 da spec ("sync nao reimporta pre-2026") comprovado no ciclo
real. A versao APROVADA pelo usuario (289.890 linhas) esta no historico git
(commit d39cb4e e anteriores); a execucao real esta em limpa-2026-apply.md.
