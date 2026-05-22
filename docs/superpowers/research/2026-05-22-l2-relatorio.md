# L2 — Bateria de validação de leitura — relatório

> Gerado por `scripts/f4l-l2-harness.ts` em 2026-05-22T19:42:48.097Z.

## Resumo

- Casos de tool: **56/56** ok (100.0%).
- Fidelidade do cache: **108/114** modelos ok.

## Por domínio

| Domínio | ok / total |
|---|---|
| cadastros | 6/6 |
| comercial | 9/9 |
| contabil | 2/2 |
| crm | 1/1 |
| estoque | 6/6 |
| financeiro | 6/6 |
| fiscal | 26/26 |

## Casos com divergência

Nenhuma.

## Fidelidade cache vs Odoo (divergências)

| Modelo | raw | Odoo | Nota |
|---|---|---|---|
| estoque.saldo | 9231 | 9323 | DIVERGE em 92 |
| finan.banco.extrato | 1465 | 1485 | DIVERGE em 20 |
| finan.banco.saldo | 218 | 222 | DIVERGE em 4 |
| finan.fluxo.caixa | 15333 | 15480 | DIVERGE em 147 |
| pedido.documento.historico.tempo | 0 | 8658 | SYNC EM ERRO (RADAR R8) — diff 8658 |
| sped.produto.lote.serie | 5000 | 7534 | SYNC EM ERRO (RADAR R8) — diff 2534 |

## Todos os casos de tool

| Tool | Caso | Estado | OK | Esperado | Obtido |
|---|---|---|---|---|---|
| servico_contar | total de serviços == search_count(sped.servico) | ok | ✓ | 336 | 336 |
| preco_contar_regras | total de regras de preço == search_count(sped.tabela.preco.regra) | ok | ✓ | 11864 | 11864 |
| comercial_contar_pedidos | total de pedidos == search_count(pedido.documento) | ok | ✓ | 1552 | 1553 |
| fiscal_contar_notas | total/entrada/saída de notas == search_count(sped.documento) | ok | ✓ | total=47033 entrada=10756 saida=36277 | total=47033 entrada=10756 saida=36277 |
| cadastro_contar_parceiros | total de parceiros == search_count(res.partner) | ok | ✓ | 6564 | 6564 |
| servico_listar | campo total == search_count(sped.servico) | ok | ✓ | 336 | 336 |
| referencia_buscar | referencia_buscar(ncm) total == search_count(sped.ncm) | ok | ✓ | 12032 | 12032 |
| referencia_buscar | referencia_buscar(cfop) total == search_count(sped.cfop) | ok | ✓ | 604 | 604 |
| referencia_buscar | referencia_buscar(cest) total == search_count(sped.cest) | ok | ✓ | 924 | 924 |
| referencia_buscar | referencia_buscar(cnae) total == search_count(sped.cnae) | ok | ✓ | 1301 | 1301 |
| referencia_buscar | referencia_buscar(nbs) total == search_count(sped.nbs) | ok | ✓ | 920 | 920 |
| referencia_buscar | referencia_buscar(natureza_operacao) total == search_count(sped.natureza.operacao) | ok | ✓ | 104 | 104 |
| referencia_buscar | referencia_buscar(unidade) total == search_count(sped.unidade) | ok | ✓ | 73 | 73 |
| referencia_buscar | referencia_buscar(cst_icms) total == search_count(sped.cst.icms) | ok | ✓ | 15 | 15 |
| referencia_buscar | referencia_buscar(cst_icms_sn) total == search_count(sped.cst.icms.sn) | ok | ✓ | 10 | 10 |
| referencia_buscar | referencia_buscar(cst_ipi) total == search_count(sped.cst.ipi) | ok | ✓ | 14 | 14 |
| referencia_buscar | referencia_buscar(cst_pis_cofins) total == search_count(sped.cst.pis.cofins) | ok | ✓ | 33 | 33 |
| referencia_buscar | referencia_buscar(cst_cibs) total == search_count(sped.cst.cibs) | ok | ✓ | 159 | 159 |
| referencia_buscar | referencia_buscar(municipio) total == search_count(sped.municipio) | ok | ✓ | 5829 | 5829 |
| referencia_buscar | referencia_buscar(pais) total == search_count(sped.pais) | ok | ✓ | 242 | 242 |
| referencia_buscar | referencia_buscar(estado) total == search_count(sped.estado) | ok | ✓ | 28 | 28 |
| fiscal_notas_recebidas | notas recebidas 2026 == search_count(entrada_saida=0, periodo) | ok | ✓ | 2402 | 2402 |
| fiscal_notas_emitidas | notas emitidas 2026 == search_count(entrada_saida=1, periodo) | ok | ✓ | 4712 | 4712 |
| contabil_estrutura_conta | estrutura da conta 4 responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| crm.res_partner.get | res_partner.get(1) confere com o Odoo | ? | ✓ | found=true (res.partner 1 no Odoo) | found=true |
| estoque_saldo_produto | smoke: estoque_saldo_produto responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| estoque_valor_armazem | smoke: estoque_valor_armazem responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| estoque_entradas_saidas | smoke: estoque_entradas_saidas responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| estoque_top_movimentados | smoke: estoque_top_movimentados responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| estoque_produtos_parados | smoke: estoque_produtos_parados responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| estoque_concentracao | smoke: estoque_concentracao responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| financeiro_saldo_contas | smoke: financeiro_saldo_contas responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| financeiro_caixa_periodo | smoke: financeiro_caixa_periodo responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| financeiro_fluxo_caixa | smoke: financeiro_fluxo_caixa responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| financeiro_contas_a_receber | smoke: financeiro_contas_a_receber responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| financeiro_contas_a_pagar | smoke: financeiro_contas_a_pagar responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| financeiro_titulos_vencidos | smoke: financeiro_titulos_vencidos responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| comercial_pedidos_periodo | smoke: comercial_pedidos_periodo responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| comercial_pedidos_por_etapa | smoke: comercial_pedidos_por_etapa responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| comercial_pedidos_por_vendedor | smoke: comercial_pedidos_por_vendedor responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| comercial_pedidos_atrasados | smoke: comercial_pedidos_atrasados responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| comercial_parcelas_a_vencer | smoke: comercial_parcelas_a_vencer responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| preco_produto | smoke: preco_produto responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| preco_tabela | smoke: preco_tabela responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_faturamento_periodo | smoke: fiscal_faturamento_periodo responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_impostos_periodo | smoke: fiscal_impostos_periodo responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_faturamento_por_cliente | smoke: fiscal_faturamento_por_cliente responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_produtos_faturados | smoke: fiscal_produtos_faturados responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_notas_recebidas_por_fornecedor | smoke: fiscal_notas_recebidas_por_fornecedor responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_apuracao | smoke: fiscal_apuracao responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_carta_correcao | smoke: fiscal_carta_correcao responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| fiscal_certificados | smoke: fiscal_certificados responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| cadastro_buscar_parceiro | smoke: cadastro_buscar_parceiro responde sem erro | vazio | ✓ | estado ok/vazio | estado vazio |
| cadastro_parceiros_por_uf | smoke: cadastro_parceiros_por_uf responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
| servico_buscar | smoke: servico_buscar responde sem erro | vazio | ✓ | estado ok/vazio | estado vazio |
| contabil_plano_de_contas | smoke: contabil_plano_de_contas responde sem erro | ok | ✓ | estado ok/vazio | estado ok |
