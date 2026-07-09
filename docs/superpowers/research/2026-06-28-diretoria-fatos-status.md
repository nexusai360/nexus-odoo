# Status dos fatos no cache , base para as Ondas 1-3 da Diretoria

> Verificado contra o banco dev (localhost, 2026-06-28). Define o que está pronto
> para ligar nas telas, o que precisa de builder/query e o que é gap sem fonte.

## Populados (prontos para uso)

| Fato | count | Telas que dependem |
|---|---|---|
| `fato_pedido` | 2.122 | Vendas C2/C5/C6, Pedidos B1/B2/B5/B6 |
| `fato_nota_fiscal` | 11.521 | Vendas C2, faturamento |
| `fato_nota_fiscal_item` | 54.806 | Vendas C4/C7 (marca/itens) |
| `fato_pedido_parcela` | 3.224 | Vendas C10 (formas de pagamento) |
| `fato_parceiro` | 7.234 | UF (C3/B4), cliente |
| `fato_produto` | 3.818 | marca, catálogo |
| `fato_estoque_saldo` | 3.904 | Estoque A2/A4/A5, Pedidos B7 (disponível) |
| `fato_financeiro_titulo` | 6.767 | Pedidos B3 (a receber), Compras A8 (a pagar) |
| `fato_dfe` | 10.581 | Compras A8 (notas recebidas) |

## Vazios (ativar builder/sync antes de prometer a seção)

| Fato/raw | count | Impacto | Ação |
|---|---|---|---|
| `fato_comissao` | 0 | ranking por comissão | confirmar se Odoo expõe; senão gap |
| `fato_cotacao` | 1 | compras/cotações | builder/sync ou gap |
| `raw_crm_pipeline` | 0 | (não usado nas ondas 1-3) | ignorar por ora |

## Queries: prontas vs criar (confirmado no código)

- **Prontas**: C5 (`queryPedidosPorVendedor`), C7 (`queryProdutosFaturados`), B3
  (`queryContasAReceber`), A8-nota (`queryNotasRecebidasPorFornecedor`).
- **Criar** (fato existe): C3 vendas/UF, C4 vendas/marca, C6 modalidades, C8/C9
  comparativo, C10 formas de pagamento, B2 cliente+UF.

## Builders a criar (dado em raw, populado)

- `fato_serial` (A6) de `raw_sped_produto_lote_serie` (8.721 linhas): nome=serial,
  produto_id=modelo, valor_custo, data_compra=chegada, data_venda/baixa=saída.
- `fato_compra` (A7/A8 ativas) de `raw_pedido_documento` (2.184): data_prevista
  (contagem regressiva), comprador_id, valores; lead time/atraso derivados.
- Margem por linha: de `raw_sped_produto_lote_serie.valor_custo` ou
  `raw_pedido_documento.al_margem`/`vr_custo_comercial`. Até lá, margem ESTIMADA
  (receita − `fato_produto.preco_custo` × qtd), com rótulo explícito.

## Gaps sem fonte (exigem sync novo do Odoo)

- Quantidade reservada de estoque (`reserved_quantity`) para "% reservado" (B7) e
  coluna "Reserva" (B2). Entregar só "disponível" até sincronizar o campo.
- Hierarquia comercial nomeada de 5 níveis. Matéria-prima em raw
  (`raw_sped_usuario_departamento.nivel`/`departamento_superior_id`,
  `raw_pedido_documento.funcionario_gerente_id`), mas o de-para dos rótulos do
  cliente exige sync/config. Entregar vendedor plano; evoluir depois.

## Notas de campo

- forma de pagamento = `formaPagamentoNome` (não `formaPagamento`).
- UF de venda via `pedido/nota.participanteId` → `fato_parceiro.uf`.
- "modalidade" (C5/C6): usar `fato_pedido.operacaoNome` (decisão de produto).
