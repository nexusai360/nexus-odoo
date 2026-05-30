# Review O4 (auditoria de cobertura + shape real)

Auditoria via subagente (introspecção JSON-RPC). Conclusões aplicadas na SPEC v3:
- Cobertos: finan.fluxo.caixa (FatoFinanceiroMovimento), finan.lancamento (FatoFinanceiroTitulo).
- CORTAR: finan.banco.extrato (linha de saldo, overlap FatoFinanceiroSaldo; sem tipo/historico/conciliado),
  finan.pagamento.divida (baixa/quitacao, vr_saldo=0, abandonado no R1), finan.conta isolado (dimensao).
- GAP REAL: finan.lancamento.item (9663, raw orfao) , quebra por conta gerencial (conta_id) e
  centro de resultado (centro_resultado_id). Nenhuma tool atual da essa quebra (DRE gerencial).
- Builder herda `tipo` e data do lancamento pai (finan.lancamento) via join, pois o item nao tem tipo proprio.
- 2a tool (centro de resultado) condicional: centro_resultado_id veio false na amostra; validar no E2E.
