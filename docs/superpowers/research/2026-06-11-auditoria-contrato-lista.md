# Auditoria , Contrato de Lista (Fase B task-zero, 2026-06-11)

> Varredura DETERMINISTICA (script) de mcp/tools. Critérios da SPEC v3 §Fase B.
> Números: 114 tools, **78 com lista**, **1 declara ordenação**, **5 com topMaiores/topPor**,
> **65 monetárias com lista sem topMaiores**. 18 queries findMany sem orderBy
> (nem toda query precisa , agregadoras ordenam no shaping; a migração avalia caso a caso).

## Ordem de migração (perícias ERRADO concentram em financeiro/fiscal)

| tool | domínio | listas | declara ordenação | topMaiores | monetária |
|---|---|---|---|---|---|
| financeiro_baixas_cobranca | financeiro | linhas | NÃO | NÃO | SIM |
| financeiro_carteiras_cobranca | financeiro | linhas | NÃO | NÃO | SIM |
| financeiro_cheques | financeiro | linhas | NÃO | NÃO | SIM |
| financeiro_contas_a_pagar | financeiro | titulos | NÃO | SIM | SIM |
| financeiro_contas_a_receber | financeiro | titulos | NÃO | SIM | SIM |
| financeiro_fluxo_caixa | financeiro | serie | NÃO | SIM | SIM |
| financeiro_pix_recebidos | financeiro | linhas | NÃO | NÃO | SIM |
| financeiro_remessas_geradas | financeiro | linhas | NÃO | NÃO | SIM |
| financeiro_resultado_por_conta | financeiro | linhas | NÃO | NÃO | SIM |
| financeiro_retornos_processados | financeiro | linhas | NÃO | NÃO | SIM |
| financeiro_saldo_contas | financeiro | contas | NÃO | NÃO | SIM |
| financeiro_titulos_vencidos | financeiro | titulos | SIM | SIM | SIM |
| fiscal_apuracao | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_carta_correcao | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_certificados | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_dfe_importados_periodo | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_dfe_pendentes_manifestacao | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_dfe_por_fornecedor | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_faturamento_mensal_serie | fiscal | serie | NÃO | NÃO | SIM |
| fiscal_faturamento_nao_autorizado | fiscal | porSituacao | NÃO | NÃO | SIM |
| fiscal_faturamento_por_cfop | fiscal | linhas,semCfopPorFinalidade | NÃO | NÃO | SIM |
| fiscal_faturamento_por_cliente | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_faturamento_por_empresa | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_faturamento_por_marca | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_faturamento_por_operacao | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_faturamento_por_regime | fiscal | empresas,regimes | NÃO | NÃO | SIM |
| fiscal_faturamento_por_uf | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_intercompany | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_mdfe_manifestos | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_notas_emitidas | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_notas_emitidas_por_cliente | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_notas_emitidas_por_produto | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_notas_recebidas | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_notas_recebidas_por_fornecedor | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_ponte_faturamento | fiscal | deducoesNaoReceita | NÃO | NÃO | SIM |
| fiscal_produtos_faturados | fiscal | linhas | NÃO | NÃO | SIM |
| fiscal_reinf_eventos | fiscal | linhas | NÃO | NÃO | SIM |
| referencia_buscar | fiscal | linhas | NÃO | NÃO | não |
| estoque_concentracao | estoque | familia,marca | NÃO | NÃO | SIM |
| estoque_entradas_saidas | estoque | serie | NÃO | NÃO | SIM |
| estoque_locais_por_produto | estoque | linhas | NÃO | NÃO | SIM |
| estoque_produtos_parados | estoque | linhas | NÃO | NÃO | SIM |
| estoque_produtos_saldo_zero | estoque | linhas | NÃO | NÃO | SIM |
| estoque_saldo_produto | estoque | linhas,topCandidates | NÃO | SIM | SIM |
| estoque_top_movimentados | estoque | top | NÃO | NÃO | SIM |
| estoque_valor_armazem | estoque | linhas | NÃO | NÃO | SIM |
| comercial_parcelas_a_vencer | comercial | linhas | NÃO | NÃO | SIM |
| comercial_pedido_historico_etapas | comercial | eventos,porEtapa | NÃO | NÃO | SIM |
| comercial_pedido_travados_por_etapa | comercial | linhas | NÃO | NÃO | SIM |
| comercial_pedidos_atrasados | comercial | linhas | NÃO | NÃO | SIM |
| comercial_pedidos_listar_top_valor | comercial | linhas | NÃO | NÃO | SIM |
| comercial_pedidos_por_etapa | comercial | linhas | NÃO | NÃO | SIM |
| comercial_pedidos_por_uf | comercial | linhas | NÃO | NÃO | SIM |
| comercial_pedidos_por_vendedor | comercial | linhas | NÃO | NÃO | SIM |
| comercial_pedidos_sem_vendedor | comercial | linhas | NÃO | NÃO | SIM |
| comercial_produtos_por_familia | comercial | familias,produtos | NÃO | NÃO | SIM |
| comercial_produtos_por_margem | comercial | linhas | NÃO | NÃO | SIM |
| comercial_vendedores_cadastrados | comercial | linhas | NÃO | NÃO | SIM |
| preco_produto | comercial | linhas | NÃO | NÃO | SIM |
| preco_tabela | comercial | linhas | NÃO | NÃO | SIM |
| cadastro_buscar_parceiro | cadastros | linhas | NÃO | NÃO | SIM |
| cadastro_cidades_listar | cadastros | linhas | NÃO | NÃO | SIM |
| cadastro_filiais_listar | cadastros | linhas | NÃO | NÃO | SIM |
| cadastro_parceiros_novos | cadastros | linhas | NÃO | NÃO | SIM |
| cadastro_parceiros_por_cidade | cadastros | linhas | NÃO | NÃO | SIM |
| cadastro_parceiros_por_uf | cadastros | linhas | NÃO | NÃO | SIM |
| cadastro_parceiros_sem_documento | cadastros | linhas | NÃO | NÃO | SIM |
| cadastros.res_partner_category.set_tags | cadastros | category_ids | NÃO | NÃO | não |
| servico_buscar | cadastros | linhas | NÃO | NÃO | não |
| servico_listar | cadastros | linhas | NÃO | NÃO | não |
| bi_consulta_avancada | fora-do-catalogo | colunas,linhas | NÃO | NÃO | não |
| contabil_centro_custo | contabil | linhas | NÃO | NÃO | SIM |
| contabil_conta_referencial | contabil | linhas | NÃO | NÃO | não |
| contabil_estrutura_conta | contabil | filhas | NÃO | NÃO | SIM |
| contabil_movimento_conta | contabil | linhas | NÃO | NÃO | não |
| contabil_plano_de_contas | contabil | linhas | NÃO | NÃO | SIM |
| contabil_resultado_por_natureza | contabil | linhas | NÃO | NÃO | não |
| contabil_saldo_conta | contabil | linhas | NÃO | NÃO | SIM |

## Queries findMany sem orderBy (avaliar caso a caso)

- src/lib/reports/queries/financeiro-resultado.ts:queryResultadoPorConta
- src/lib/reports/queries/financeiro.ts:querySaldoContas
- src/lib/reports/queries/financeiro.ts:queryContasAReceber
- src/lib/reports/queries/financeiro.ts:queryContasAPagar
- src/lib/reports/queries/estoque.ts:querySaldoProduto
- src/lib/reports/queries/estoque.ts:queryValorArmazem
- src/lib/reports/queries/fiscal.ts:queryFaturamentoPeriodo
- src/lib/reports/queries/fiscal.ts:queryImpostosPeriodo
- src/lib/reports/queries/fiscal.ts:queryFaturamentoPorCliente
- src/lib/reports/queries/fiscal.ts:queryProdutosFaturados
- src/lib/reports/queries/fiscal.ts:queryNotasRecebidasPorFornecedor
- src/lib/reports/queries/pedido-historico.ts:queryPedidoTravadosPorEtapa
- src/lib/reports/queries/comercial.ts:queryPedidosPeriodo
- src/lib/reports/queries/comercial.ts:queryPedidosPorVendedor
- src/lib/reports/queries/cadastros.ts:queryBuscarParceiro
- src/lib/reports/queries/cadastros.ts:queryParceirosPorUf
- src/lib/reports/queries/financeiro.ts:queryCaixaPeriodo (agrega, orderBy dispensável)
- src/lib/reports/queries/financeiro.ts:queryFluxoCaixa (agrega+sort no shaping)

## Gate incremental
Allowlist `TOOLS_SEM_CONTRATO_DE_LISTA` em teste de contrato; começa com as 77 não-migradas e PRECISA esvaziar até o fim da Fase B (padrão TOOLS_SEM_FORMATADOR_REAL da F4).