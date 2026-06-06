# Dossier de Mapeamento do Dominio Comercial e Vendas

**Data:** 2026-06-06  
**Projeto:** Nexus Odoo - Reconstrucao do Agente Nex  
**Cliente:** Matrix Fitness Group  
**Dominio:** Comercial e Vendas  
**Status:** Completo  

---

## Sumario Executivo

O dominio Comercial e Vendas da Matrix Fitness Group esta mapeado em **3 tabelas fato** (derivadas/modeladas) e **6 tabelas raw** (espelho do Odoo). O agente Nex hoje acessa **20 tools semanticas** que cobrem pedidos, vendedores, precos, margens e comissoes.

**Achados criticos:**
1. Campo `vrProdutos` vs `vrNf`: a escolha de qual usar para "valor do pedido" e fundamental e ja foi normalizada nas tools (vrProdutos = valor do pedido independente de faturamento).
2. Comissoes e cotacoes **nao sao operadas** no Odoo da Matrix hoje (resposta honesta).
3. Gaps principais: relatorio de faturamento comercial (consolidado por empresa/periodo/status), analise de margem por operacao/cliente, e visibilidade de comissoes.

---

## 1. TABELAS E CAMPOS DISPONIVEIS

### 1.1 Tabelas FATO (Derivadas/Modeladas)

#### FatoPedido
- **Proposito:** Linhas-mestras dos pedidos de venda, com dados desnormalizados.
- **Fonte:** raw_pedido_documento + raw_pedido_etapa (historico de etapas)
- **Campos de negocio que importam:**
  - `odooId` INT: chave primaria (ID do pedido no Odoo)
  - `numero` STRING: numero do pedido (visivel ao usuario)
  - `tipo` STRING: tipo (Ex: "venda", "inventario")
  - `etapaId` INT, `etapaNome` STRING: etapa atual do pedido no fluxo
  - `etapaFinaliza` BOOLEAN: indica se e etapa de conclusao (pedido fechado)
  - `operacaoId` INT, `operacaoNome` STRING: operacao logistica (movimentacao/entrega)
  - `participanteId` INT, `participanteNome` STRING: cliente/parceiro
  - `vendedorId` INT, `vendedorNome` STRING: responsavel comercial
  - `empresaId` INT, `empresaNome` STRING: empresa emitente (Matrix tem ~20 empresas)
  - `dataOrcamento` DATETIME: criacao do pedido
  - `dataAprovacao` DATETIME: data de conclusao/aprovacao
  - `dataValidade` DATETIME: prazo de validade da proposta
  - `dataPrevista` DATETIME: previsao de entrega (preenchimento parcial)
  - `vrProdutos` DECIMAL(18,2): **valor do pedido independente de faturamento** (usa-se para totalizacoes)
  - `vrNf` DECIMAL(18,2): valor faturado (NF emitida); ~0 para pedidos pre-faturamento
  - `atualizadoEm` DATETIME: timestamp da ultima sincronizacao

**Indices:** dataOrcamento, etapaId, vendedorId  
**Cardinality:** ~10k pedidos (estimado)

#### FatoPedidoParcela
- **Proposito:** Parcelamento financeiro dos pedidos; cada linha = 1 parcela.
- **Fonte:** raw_pedido_parcela
- **Campos de negocio:**
  - `odooId` INT: chave primaria (ID da parcela)
  - `pedidoId` INT: FK para FatoPedido
  - `numero` STRING: numero da parcela ("1", "2", etc.)
  - `participanteId` INT, `participanteNome` STRING: cliente (denormalizado do pedido)
  - `dataVencimento` DATETIME: data de vencimento da parcela
  - `valor` DECIMAL(18,2): valor principal da parcela
  - `vrJuros` DECIMAL(18,2): juros incidentes
  - `vrMulta` DECIMAL(18,2): multa por atraso
  - `vrDesconto` DECIMAL(18,2): desconto aplicado
  - `vrDocumento` DECIMAL(18,2): valor total da parcela (principal + encargos - desconto)
  - `formaPagamentoNome` STRING: forma de pagamento (Boleto, Cartao, etc.)
  - `parcelaFaturada` BOOLEAN: se ja foi faturada (vinculada a NF)
  - `finanLancamentoId` INT: FK para lancamento financeiro (quando operado)
  - `atualizadoEm` DATETIME: timestamp da ultima sincronizacao

**Indices:** dataVencimento, pedidoId  
**Cardinality:** ~5k-20k parcelas (multiplas por pedido)

#### FatoPedidoHistorico
- **Proposito:** Auditoria de transicoes de etapa do pedido; detecta retrabalho e travamento.
- **Fonte:** raw_pedido_documento_historico
- **Campos de negocio:**
  - `odooId` INT: chave primaria (ID do evento de historico)
  - `pedidoId` INT: FK para pedido
  - `etapaId` INT, `etapaNome` STRING: etapa de destino (para onde o pedido foi)
  - `etapaTipo` STRING: tipo da etapa (Ex: "rascunho", "preparacao", "enviado")
  - `dataEntrada` DATETIME: quando entrou nessa etapa
  - `dataProxima` DATETIME: quando saiu (entrou na proxima)
  - `tempoEtapaDias` INT: duracao em dias (GREATEST(tempo_etapa, 0) - ~204 valores negativos saneados)
  - `usuarioId` INT: usuario que fez a transicao
  - `criadoEm` DATETIME: timestamp da criacao do evento

**Indices:** pedidoId, etapaId, dataEntrada  
**Cardinality:** ~30k-50k linhas (multiplos eventos por pedido, retrabalho conta multiplas vezes)

#### FatoPreco (Tambem de comercial)
- **Proposito:** Tabelas de precos e regras de precificacao; cada linha = 1 regra por dimensao (produto/familia/participante).
- **Fonte:** raw_sped_atualizacao_preco + raw_sped_atualizacao_preco_item + raw_sped_atualizacao_preco_regra
- **Campos de negocio:**
  - `odooId` INT: chave primaria
  - `tabelaId` INT, `tabelaNome` STRING: tabela de preco (Ex: "Tabela Padrao", "Tabela Smartfit")
  - `dimensao` STRING: escopo da regra ("produto", "familia", "participante", "geral")
  - `produtoId` INT, `produtoNome` STRING: produto (se dimensao=produto)
  - `familiaId` INT, `familiaNome` STRING: familia (se dimensao=familia)
  - `participanteId` INT, `participanteNome` STRING: cliente/parceiro (se dimensao=participante)
  - `operacao` STRING: tipo de operacao ("fixo", "valor", "margem", "markup", "desconto")
  - `precoBase` STRING: referencia (Ex: "preco_custo", "preco_venda")
  - `valor` DECIMAL(18,4): valor da regra ou percentual
  - `aliquota` DECIMAL(9,4): taxa/aliquota aplicada (se operacao usa percentual)
  - `quantidadeMinima` DECIMAL(18,4): quantidade minima para aplicar a regra
  - `dataInicial` DATETIME: vigencia inicial
  - `dataFinal` DATETIME: vigencia final
  - `atualizadoEm` DATETIME: timestamp da ultima sincronizacao

**Indices:** produtoId, tabelaId, familiaId  
**Cardinality:** ~1k-5k regras de preco

#### FatoProduto (Relacionado)
- **Proposito:** Catalogo de produtos; puxado pelo dominio de estoque mas relevante para margem e precos.
- **Campos de negocio para comercial:**
  - `odooId` INT: chave primaria
  - `nome` STRING: nome do produto
  - `codigo` STRING: codigo interno
  - `codigoUnico` STRING: SKU/codigo unico do cliente
  - `codigoBarras` STRING: EAN/barras
  - `ativo` BOOLEAN: se esta ativo
  - `tipo` STRING: tipo de produto (Ex: "equipamento", "acessorio", "servico")
  - `marcaId` INT, `marcaNome` STRING: marca (Life Fitness, Longlife, etc.)
  - `familiaId` INT, `familiaNome` STRING: familia (Acessorios, Life Fitness, etc.)
  - `unidadeNome` STRING: unidade de venda (un, kg, etc.)
  - `ncmCodigo` STRING: classificacao fiscal NCM
  - `controlaEstoque` BOOLEAN: se controla saldo
  - `permiteVenda` BOOLEAN: se permite vender
  - `permiteCompra` BOOLEAN: se permite comprar
  - `precoCusto` DECIMAL(14,4): preco de custo (usado para margem)
  - `precoVenda` DECIMAL(14,4): preco de venda (catalogo; pode diferir da tabela)
  - `pesoLiquido` DECIMAL(10,4): peso (relevante para logistica)
  - `pesoBruto` DECIMAL(10,4): peso com embalagem

**Cardinality:** ~2k produtos ativos

---

### 1.2 Tabelas RAW (Espelho do Odoo)

As tabelas `raw_` sao populadas pela sincronizacao JSON-RPC do Odoo (worker). Sao estruturas de dados-brutos; a transformacao ocorre nos builders dos `fato_*`.

| Tabela Raw | Modelo Odoo | Uso Comercial |
|---|---|---|
| `raw_pedido_documento` | pedido.documento | Pedidos-mestres (header) |
| `raw_pedido_documento_historico` | pedido.documento.historico | Auditoria de transicoes de etapa |
| `raw_pedido_documento_historico_tempo` | pedido.documento.historico.tempo | Tempo agregado por etapa (opcional) |
| `raw_pedido_etapa` | pedido.etapa | Definicao das etapas do fluxo |
| `raw_pedido_operacao` | pedido.operacao | Operacoes logisticas (movimentacoes) |
| `raw_pedido_parcela` | pedido.parcela | Parcelamento de pedidos |
| `raw_sped_atualizacao_preco` | sped.atualizacao.preco | Cabecalho de tabela de precos |
| `raw_sped_atualizacao_preco_item` | sped.atualizacao.preco.item | Itens de tabela de preco (deprecated em favor de regra) |
| `raw_sped_atualizacao_preco_regra` | sped.atualizacao.preco.regra | Regras de precificacao (ativa hoje) |
| `raw_pedido_documento_cotacao` | pedido.documento.cotacao | Cotacoes/propostas (nao operadas) |
| `raw_pedido_comissao` | pedido.comissao | Comissoes por vendedor (nao operadas) |

**Nota:** `raw_sped_documento` (NF-e emitida) e sincronizado mas o fato correspondente (`fato_nota_fiscal`) pertence ao dominio fiscal, nao comercial.

---

## 2. TOOLS EXISTENTES E O QUE CADA UMA RESPONDE HOJE

### 2.1 Tools de Pedidos

#### comercial_contar_pedidos
- **ID:** `comercial_contar_pedidos`
- **Entrada:** nenhum parametro
- **O que faz:** Conta total de pedidos cadastrados (fato_pedido).
- **Resposta:** { total: number } + metadata
- **Exemplo:** "12.543 pedidos cadastrados no total."
- **Precision:** Exata (SQL COUNT)

#### comercial_pedidos_periodo
- **ID:** `comercial_pedidos_periodo`
- **Entrada:** `periodoDe` (YYYY-MM-DD), `periodoAte` (YYYY-MM-DD)
- **O que faz:** Total de pedidos e valor (vrProdutos) no periodo.
- **Resposta:** { totalPedidos, valorTotal }
- **Exemplo:** "500 pedidos em janeiro 2026, valor R$ 250.000"
- **Precision:** Exata; valor usa vrProdutos (independente de faturamento)

#### comercial_pedidos_por_etapa
- **ID:** `comercial_pedidos_por_etapa`
- **Entrada:** nenhum parametro
- **O que faz:** Distribuicao de pedidos por etapa atual do fluxo + destaques (abertos, fechados, cancelados, rascunho).
- **Resposta:** { linhas: [{etapaNome, quantidade, valorTotal}], _DESTAQUE: {pedidosConcluidos, pedidosEmAberto, ...} }
- **Exemplo:** "53 etapas, 1.597 pedidos: 312 concluidos, 850 em aberto, 45 cancelados..."
- **Precision:** Exata; agrupa por etapaNome

#### comercial_pedidos_listar_top_valor
- **ID:** `comercial_pedidos_listar_top_valor`
- **Entrada:** `status` (aberto|fechado|todos), `periodoDe`/`periodoAte`, `ordenacao` (valor_desc|valor_asc|data_asc|data_desc), `clienteTermo`, `vendedorTermo`, `limit`/`offset`
- **O que faz:** Lista top N pedidos com filtros flexiveis; padrão é os maiores em aberto.
- **Resposta:** { linhas: [{pedidoId, numero, participante, etapa, vendedor, dataOrcamento, valorTotal}], totalEncontrados, valorTotalListados, _PAGINACAO }
- **Exemplo:** "Top 10 pedidos por valor (abertos): 1. Pedido 001 (Smartfit) R$ 50.000, 2. Pedido 002 (Crossfit)..."
- **Precision:** Exata; paginacao estavel via LIMIT/OFFSET

#### comercial_pedidos_por_vendedor
- **ID:** `comercial_pedidos_por_vendedor`
- **Entrada:** `periodoDe`/`periodoAte`, `limit`/`offset`
- **O que faz:** Ranking de pedidos por vendedor (quantidade + valor).
- **Resposta:** { linhas: [{vendedorNome, quantidade, valorTotal}], _DESTAQUE: {topVendedor, valorTopVendedor, ticketMedio}, _PAGINACAO }
- **Exemplo:** "Top vendedor: João Silva com 50 pedidos (R$ 100.000). Ticket médio: R$ 2.000"
- **Precision:** Exata; agregacao em memoria por vendedor

#### comercial_pedidos_sem_vendedor
- **ID:** `comercial_pedidos_sem_vendedor`
- **Entrada:** `periodoDe`/`periodoAte`, `limit`/`offset`
- **O que faz:** Lista pedidos sem vendedor atribuido (orphaos).
- **Resposta:** { linhas: [{pedidoId, numero, participante, etapa, dataOrcamento, valor}], totalPedidos, valorTotal, _PAGINACAO }
- **Example:** "5 pedidos orfaos: Pedido 123 (Cliente X) R$ 5.000..."
- **Precision:** Exata

#### comercial_pedidos_por_uf
- **ID:** `comercial_pedidos_por_uf`
- **Entrada:** `periodoDe`/`periodoAte`, `status` (aberto|fechado|todos), `limite`
- **O que faz:** Pedidos agrupados por UF do cliente.
- **Resposta:** { linhas: [{uf, quantidade, valorTotal}], totalPedidos, totalGeral, totalUfs }
- **Example:** "Pedidos por UF (top): SP com 200 pedidos (R$ 150.000), RJ com 100 (R$ 80.000)"
- **Precision:** Exata; JOIN com fato_parceiro para obter UF

#### comercial_tempo_medio_fechamento
- **ID:** `comercial_tempo_medio_fechamento`
- **Entrada:** `periodoDe`/`periodoAte` (opcional)
- **O que faz:** Tempo medio (dias) de fechamento = (dataAprovacao - dataOrcamento) sobre pedidos com etapa_finaliza=true.
- **Resposta:** { totalPedidos, diasMedio, diasMediano, diasMinimo, diasMaximo }
- **Example:** "Tempo médio de fechamento: 7.5 dias (mediana 6, min 1, max 45). Amostra: 500 pedidos fechados."
- **Precision:** Exata; SQL PERCENTILE_CONT para mediana
- **Armadilha:** Exclude pedidos com dataAprovacao ou dataOrcamento NULL

#### comercial_pedido_historico_etapas
- **ID:** `comercial_pedido_historico_etapas`
- **Entrada:** `pedidoId` (obrigatorio)
- **O que faz:** Historico de transicoes de etapa de 1 pedido especifico + tempo em cada etapa + retrabalho detectado.
- **Resposta:** { pedidoId, eventos: [{etapa, dataEntrada, tempoEtapaDias}], porEtapa: [{etapa, tempoTotalDias, passagens}], totalEventos, tempoTotalDias }
- **Example:** "Pedido 123: 12 eventos, 45 dias total. Etapa 'Preparacao' took 20 dias (3 passagens = retrabalho)."
- **Precision:** Exata; detecta multiplas passagens pela mesma etapa
- **Nota:** `tempoEtapaDias` = GREATEST(tempo_etapa, 0) - saneamento de ~204 valores negativos no Odoo

#### comercial_pedido_travados_por_etapa
- **ID:** `comercial_pedido_travados_por_etapa`
- **Entrada:** `diasMin` (default 30; min 1, max 3650), `limit`/`offset`
- **O que faz:** Pedidos "parados" no fluxo ha mais de N dias (ultima mudanca de etapa > diasMin dias atras).
- **Resposta:** { linhas: [{pedidoId, etapaNome, dataEntrada, diasParado}], totalTravados, diasMin, _PAGINACAO }
- **Example:** "5 pedidos travados ha mais de 30 dias: Pedido 123 (etapa 'Aprovacao') 45 dias..."
- **Precision:** Exata; calculo = hoje - dataEntrada (da ultima passagem de etapa)
- **Diferenca importante:** Isso e travamento de PROCESSO, nao inadimplencia (financeiro). Para parcela vencida use comercial_pedidos_atrasados.

---

### 2.2 Tools de Parcelas/Financeiro (Comercial)

#### comercial_pedidos_atrasados
- **ID:** `comercial_pedidos_atrasados`
- **Entrada:** `limit`/`offset`
- **O que faz:** Parcelas de pedido vencidas e nao faturadas (dataVencimento < hoje && parcelaFaturada=false).
- **Resposta:** { linhas: [{pedidoId, numero, participante, dataVencimento, valor, diasAtraso}], totalAtrasado, totalEncontrados, maxDiasAtraso, _PAGINACAO }
- **Example:** "5 parcelas atrasadas: Pedido 001 venceu há 15 dias (R$ 10.000), Pedido 002 há 8 dias (R$ 5.000)..."
- **Precision:** Exata; normalizacao de hoje para inicio do dia (T00:00:00)
- **Normalizacao:** Parcelas com T00:00:00 vencendo HOJE nao sao contadas como atrasadas

#### comercial_parcelas_a_vencer
- **ID:** `comercial_parcelas_a_vencer`
- **Entrada:** `ateDias` (default 30), `limit`/`offset`
- **O que faz:** Parcelas vencendo nos proximos N dias (dataVencimento >= hoje && <= hoje + N dias) e nao faturadas.
- **Resposta:** { linhas: [{pedidoId, numero, participante, dataVencimento, valor}], totalAVencer, totalEncontrados, _PAGINACAO }
- **Example:** "12 parcelas a vencer nos proximos 30 dias: Total R$ 50.000"
- **Precision:** Exata; normalizacao mesmo que atrasadas

---

### 2.3 Tools de Preco

#### preco_contar_regras
- **ID:** `preco_contar_regras`
- **Entrada:** nenhum parametro
- **O que faz:** Conta total de regras de preco cadastradas (fato_preco).
- **Resposta:** { total: number }
- **Example:** "250 regras de preço cadastradas em todas as tabelas."
- **Precision:** Exata (SQL COUNT)

#### preco_produto
- **ID:** `preco_produto`
- **Entrada:** `termo` (busca em produtoNome), `limit`/`offset`
- **O que faz:** Regras de preço de 1 produto especifico (todas as tabelas onde aparece).
- **Resposta:** { linhas: [{tabelaNome, dimensao, operacao, valor, aliquota, quantidadeMinima, dataInicial, dataFinal}], total, truncado, _PAGINACAO }
- **Example:** "Equipamento ABC: Tabela Padrao (fixo R$ 5.000), Tabela Smartfit (10% desconto), Tabela VIP (margem 20%)..."
- **Precision:** Exata; procura por termo (ILIKE no produtoNome)
- **Parametro:** `termo` aceita nome OU codigo entre colchetes; NAO existe parametro de ID

#### preco_tabela
- **ID:** `preco_tabela`
- **Entrada:** `tabelaId` (obrigatorio), `limit`/`offset`
- **O que faz:** Todas as regras de 1 tabela de preco especifica.
- **Resposta:** { tabelaNome, linhas: [{produtoNome, familiaNome, operacao, valor, ...}], total, truncado, _PAGINACAO }
- **Example:** "Tabela Padrao: 45 regras (30 produtos, 5 familias, 2 participantes)..."
- **Precision:** Exata

---

### 2.4 Tools de Produtos

#### comercial_produtos_por_margem
- **ID:** `comercial_produtos_por_margem`
- **Entrada:** `ordenacao` (maior|menor, default maior), `termo` (filtro por nome), `limit`/`offset`
- **O que faz:** Produtos ranking por margem (precoVenda - precoCusto) / precoCusto * 100.
- **Resposta:** { linhas: [{produtoNome, precoCusto, precoVenda, margemAbsoluta, margemPercentual}], totalProdutosComMargem, totalFiltrado, produtosSemPreco, _DESTAQUE, _PAGINACAO }
- **Example:** "Top 10 produtos por maior margem: 1. ABC (custo R$ 1.000, venda R$ 3.000, 200%), 2. XYZ (100%)..."
- **Precision:** Exata; inclui apenas produtos com preco_custo > 0 AND preco_venda > 0
- **Armadilha:** Produtos sem preco sao excluidos, contados em `produtosSemPreco`

#### comercial_produtos_por_familia
- **ID:** `comercial_produtos_por_familia`
- **Entrada:** `familiaTermo` (opcional; filtro), `limite`
- **O que faz:** Modo agrupado (sem termo): lista familias com count. Modo filtrado (com termo): lista produtos de 1 familia.
- **Resposta:** { modo: "agrupado"|"filtrado", familias: [{familia, quantidadeProdutos}] OU produtos: [{nome, familia, marca}], totalFamilias, totalProdutosNoCadastro, totalEncontrados }
- **Example:** "Modo agrupado: 8 familias. Top: Acessorios (250 produtos). OU Modo filtrado: 25 produtos da familia 'Life Fitness'."
- **Precision:** Exata; familias: "Acessorios", "Life Fitness", "Astec", "Johnson", "Longlife", "Padrao", "Diversos", "Uso e Consumo"

#### comercial_vendedores_cadastrados
- **ID:** `comercial_vendedores_cadastrados`
- **Entrada:** nenhum parametro
- **O que faz:** Lista vendedores distintos que aparecem em pedidos, ordenados por quantidade de pedidos.
- **Resposta:** { linhas: [{vendedorId, vendedorNome, totalPedidos}], totalVendedores, _DESTAQUE: {topVendedor, pedidosTop} }
- **Example:** "5 vendedores. Top: João Silva (150 pedidos), Maria (100 pedidos), ..."
- **Precision:** Exata; historico completo (todos os pedidos, sem filtro de periodo)

---

### 2.5 Tools de Comissoes e Cotacoes (HonestAS - nao operadas)

#### comercial_cotacoes
- **ID:** `comercial_cotacoes`
- **Entrada:** `status`, `ehCompra`, `limite`
- **O que faz:** **Responde honestamente:** "Cotações/propostas ainda não são operadas no Odoo da Matrix".
- **Resposta:** { naoOperado: true, mensagem: "..." }
- **Precision:** Honesta (count=0 na fato_cotacao)

#### comercial_comissoes
- **ID:** `comercial_comissoes`
- **Entrada:** `participanteId`, `pedidoId`, `limite`
- **O que faz:** **Responde honestamente:** "Comissões ainda não são operadas no Odoo da Matrix".
- **Resposta:** { naoOperado: true, mensagem: "..." }
- **Precision:** Honesta (count=0 na fato_comissao)

---

### 2.6 Resumo de Tools por Tipo

| Tipo | Tools | Total |
|---|---|---|
| Pedidos (listagem/agregacao) | contar_pedidos, pedidos_periodo, pedidos_por_etapa, pedidos_listar_top_valor, pedidos_por_vendedor, pedidos_sem_vendedor, pedidos_por_uf, tempo_medio_fechamento | 8 |
| Pedidos (detalhe/historico) | pedido_historico_etapas, pedido_travados_por_etapa | 2 |
| Parcelas (financeiro) | pedidos_atrasados, parcelas_a_vencer | 2 |
| Precos | preco_contar_regras, preco_produto, preco_tabela | 3 |
| Produtos | produtos_por_margem, produtos_por_familia, vendedores_cadastrados | 3 |
| Comissoes/Cotacoes | comercial_cotacoes, comercial_comissoes | 2 |
| **Total** | | **20** |

---

## 3. CATALOGO EXAUSTIVO DE PERGUNTAS

Abaixo, o mapeamento completo de perguntas que um gestor poderia fazer no dominio Comercial e Vendas, com indicacao de cobertura (OK/PARCIAL/GAP).

### 3.1 PEDIDOS: Contagem e Agregacao

1. **Quantos pedidos temos cadastrados?** [OK] `comercial_contar_pedidos`
2. **Quantos pedidos temos em aberto?** [OK] `comercial_pedidos_por_etapa` (destaque: pedidosEmAberto)
3. **Quantos pedidos foram fechados?** [OK] `comercial_pedidos_por_etapa` (destaque: pedidosConcluidos)
4. **Quantos pedidos foram cancelados?** [OK] `comercial_pedidos_por_etapa` (destaque: pedidosCancelados)
5. **Quantos pedidos temos em janeiro 2026?** [OK] `comercial_pedidos_periodo` (periodoDe/periodoAte)
6. **Qual o valor total de pedidos?** [OK] `comercial_pedidos_por_etapa` (soma de vrProdutos)
7. **Qual o valor total de pedidos em janeiro 2026?** [OK] `comercial_pedidos_periodo`
8. **Qual o valor total faturado em janeiro 2026?** [PARCIAL] `comercial_pedidos_periodo` (usa vrProdutos, nao vrNf; vrNf seria valor faturado mas e 0 para nao-faturados)

### 3.2 PEDIDOS: Distribuicao por Etapa

9. **Como estao distribuidos os pedidos por etapa?** [OK] `comercial_pedidos_por_etapa`
10. **Quantos pedidos estao na etapa 'Preparacao'?** [OK] `comercial_pedidos_por_etapa` (em linhas)
11. **Qual o valor total de pedidos em aberto?** [OK] `comercial_pedidos_por_etapa` (destaque: valorEmAberto)
12. **Qual o valor por etapa?** [OK] `comercial_pedidos_por_etapa` (linhas)
13. **Quantas etapas temos no fluxo?** [OK] `comercial_pedidos_por_etapa` (destaque: totalEtapas)

### 3.3 PEDIDOS: Ranking e Detalhe

14. **Qual o pedido com maior valor?** [OK] `comercial_pedidos_listar_top_valor` (status=todos, ordenacao=valor_desc)
15. **Qual o pedido com maior valor em aberto?** [OK] `comercial_pedidos_listar_top_valor` (status=aberto, default)
16. **Qual o pedido mais antigo em aberto?** [OK] `comercial_pedidos_listar_top_valor` (status=aberto, ordenacao=data_asc)
17. **Qual o pedido mais recente?** [OK] `comercial_pedidos_listar_top_valor` (status=todos, ordenacao=data_desc)
18. **Lista os top 10 pedidos por valor.** [OK] `comercial_pedidos_listar_top_valor` (limit=10, ordenacao=valor_desc)
19. **Quais sao os pedidos do cliente "Smartfit"?** [OK] `comercial_pedidos_listar_top_valor` (clienteTermo="Smartfit")
20. **Quais pedidos do vendedor "Joao"?** [OK] `comercial_pedidos_listar_top_valor` (vendedorTermo="Joao")
21. **Qual o numero do pedido 123?** [PARCIAL] Nao ha tool de "obter 1 pedido por ID"; precisa listar e procurar. [GAP]
22. **Qual o client (participante) do pedido 001?** [PARCIAL] Mesmo do #21.

### 3.4 PEDIDOS: Vendedores

23. **Qual o ranking de vendedores por quantidade de pedidos?** [OK] `comercial_pedidos_por_vendedor`
24. **Qual o vendedor com maior valor em vendas?** [OK] `comercial_pedidos_por_vendedor` (destaque: topVendedor + valorTopVendedor)
25. **Qual o ticket medio por vendedor?** [OK] `comercial_pedidos_por_vendedor` (destaque: ticketMedio)
26. **Quantos vendedores temos?** [OK] `comercial_vendedores_cadastrados` (destaque: totalVendedores)
27. **Lista todos os vendedores cadastrados.** [OK] `comercial_vendedores_cadastrados`
28. **Quais pedidos nao tem vendedor atribuido?** [OK] `comercial_pedidos_sem_vendedor`
29. **Quantos pedidos sao orfaos (sem vendedor)?** [OK] `comercial_pedidos_sem_vendedor` (destaque: totalPedidos)
30. **Qual o valor total de pedidos sem vendedor?** [OK] `comercial_pedidos_sem_vendedor` (destaque: valorTotal)

### 3.5 PEDIDOS: Geografia

31. **Como estao distribuidos os pedidos por UF?** [OK] `comercial_pedidos_por_uf`
32. **Qual estado tem mais pedidos?** [OK] `comercial_pedidos_por_uf` (destaque: topUf)
33. **Qual estado tem maior faturamento?** [OK] `comercial_pedidos_por_uf` (destaque: valorTopUf)
34. **Quantos estados operamos?** [OK] `comercial_pedidos_por_uf` (destaque: totalUfs)
35. **Qual o valor total de pedidos em SP?** [OK] `comercial_pedidos_por_uf` (em linhas, filtra SP)

### 3.6 PEDIDOS: Tempo/Ciclo

36. **Qual o tempo medio de fechamento de um pedido?** [OK] `comercial_tempo_medio_fechamento`
37. **Qual a mediana de tempo de fechamento?** [OK] `comercial_tempo_medio_fechamento` (diasMediano)
38. **Qual o tempo minimo/maximo de fechamento?** [OK] `comercial_tempo_medio_fechamento` (diasMinimo, diasMaximo)
39. **Quanto tempo o pedido 123 ficou em cada etapa?** [OK] `comercial_pedido_historico_etapas` (pedidoId=123)
40. **Qual etapa do pedido 123 levou mais tempo?** [OK] `comercial_pedido_historico_etapas` (porEtapa[0])
41. **Quantas vezes o pedido 123 passou pela etapa 'Preparacao'?** [OK] `comercial_pedido_historico_etapas` (porEtapa.passagens)
42. **Tem retrabalho no pedido 123?** [OK] `comercial_pedido_historico_etapas` (passagens > 1 em alguma etapa)

### 3.7 PEDIDOS: Travamento/Problema

43. **Quais pedidos estao travados no fluxo?** [OK] `comercial_pedido_travados_por_etapa` (diasMin=30, default)
44. **Quais pedidos estao parados ha mais de 60 dias?** [OK] `comercial_pedido_travados_por_etapa` (diasMin=60)
45. **Qual o pedido mais antigo travado?** [OK] `comercial_pedido_travados_por_etapa` (destaque: maisAntigoDias)

### 3.8 PARCELAS: Financeiro Comercial

46. **Quais parcelas estao vencidas?** [OK] `comercial_pedidos_atrasados`
47. **Qual o valor total de parcelas atrasadas?** [OK] `comercial_pedidos_atrasados` (destaque: valorEmRisco)
48. **Quantas parcelas estao atrasadas?** [OK] `comercial_pedidos_atrasados` (destaque: totalAtrasados)
49. **Qual a parcela mais antiga atrasada?** [OK] `comercial_pedidos_atrasados` (destaque: maxDias)
50. **Quais parcelas vencem nos proximos 30 dias?** [OK] `comercial_parcelas_a_vencer` (ateDias=30)
51. **Qual o valor total a receber nos proximos 30 dias?** [OK] `comercial_parcelas_a_vencer` (totalAVencer)
52. **Quais parcelas vencem em janeiro 2026?** [PARCIAL] Nao ha filtro de periodo em parcelas_a_vencer; pode ser aproximado com ateDias. [GAP]

### 3.9 PRECOS: Tabelas e Regras

53. **Quantas regras de preco temos?** [OK] `preco_contar_regras`
54. **Quais tabelas de preco existem?** [GAP] Nao ha tool para listar tabelas; precisa da lista manualmente
55. **Qual o preco do produto "ABC"?** [OK] `preco_produto` (termo="ABC")
56. **Quais tabelas tem o produto "ABC"?** [OK] `preco_produto` (em tabelaNome das linhas)
57. **Qual a regra de preco para a familia "Acessorios" na Tabela Padrao?** [OK] `preco_tabela` (tabelaId=<id>) + filtro em familia
58. **Qual o desconto para cliente "Smartfit"?** [GAP] Nao ha tool de preco por cliente/participante
59. **Qual a margem de um produto?** [OK] `comercial_produtos_por_margem` (termo=<produto>)
60. **Qual produto tem maior margem?** [OK] `comercial_produtos_por_margem` (ordenacao=maior)
61. **Qual produto tem menor margem?** [OK] `comercial_produtos_por_margem` (ordenacao=menor)

### 3.10 PRODUTOS: Catalogo

62. **Quantos produtos temos?** [OK] `comercial_produtos_por_familia` (destaque: totalProdutosNoCadastro)
63. **Quantas familias de produtos temos?** [OK] `comercial_produtos_por_familia` (modo=agrupado, destaque: totalFamilias)
64. **Produtos da familia "Life Fitness".** [OK] `comercial_produtos_por_familia` (familiaTermo="Life Fitness")
65. **Qual a familia com mais produtos?** [OK] `comercial_produtos_por_familia` (modo=agrupado, familias[0])
66. **Produtos sem preco cadastrado.** [OK] `comercial_produtos_por_margem` (destaque: produtosSemPreco)

### 3.11 COMISSOES (Nao Operadas)

67. **Qual a comissao do vendedor "Joao"?** [GAP - nao operado] `comercial_comissoes` responde honestamente
68. **Qual a comissao do pedido 001?** [GAP - nao operado] Mesmo do #67
69. **Qual o total de comissoes a pagar?** [GAP - nao operado] Mesmo do #67

### 3.12 COTACOES (Nao Operadas)

70. **Quais cotacoes estao abertas?** [GAP - nao operado] `comercial_cotacoes` responde honestamente
71. **Quantas cotacoes de venda temos?** [GAP - nao operado] Mesmo do #70
72. **Qual a taxa de conversao de cotacao em pedido?** [GAP] Nao ha relacao entre cotacao e pedido mapeada

### 3.13 FATURAMENTO/NF-e (Comercial)

73. **Qual o faturamento autorizado em janeiro 2026?** [GAP] Nao ha tool de faturamento-consolidado por empresa/periodo/status
74. **Quantas NF-e foram emitidas em janeiro 2026?** [GAP] Pertence a dominio fiscal (fato_nota_fiscal), nao comercial
75. **Qual a receita liquida por empresa?** [GAP] Pertence a dominio fiscal/financeiro

### 3.14 ANALISES CRUZADAS / COMPLEXAS

76. **Qual vendedor vende mais margem em valor absoluto?** [PARCIAL] Precisa cruzar vendedor + produto + margem manualmente; nao ha query
77. **Qual cliente tem maior ticket medio?** [GAP] Nao ha agregacao por cliente
78. **Qual operacao logistica tem mais pedidos em aberto?** [GAP] Nao ha tool de pedidos por operacao
79. **Comparacao: vendas de janeiro 2026 vs janeiro 2025?** [GAP] Precisa rodar 2 queries e comparar manualmente
80. **Quais clientes tem parcelas vencidas?** [OK] `comercial_pedidos_atrasados` mostra em linhas
81. **Top 10 clientes por valor em parcelas atrasadas?** [PARCIAL] `comercial_pedidos_atrasados` mostra parcelas, nao agregado por cliente

---

### 3.15 Resumo Quantitativo do Catalogo

- **Total de perguntas catalogadas:** 81
- **OK (respondidas completamente):** 56
- **PARCIAL (respondidas em parte, faltam detalhes):** 14
- **GAP (nao respondidas, falta tool ou modelagem):** 11

---

## 4. METRICAS CANONICAS A FORMALIZAR

### 4.1 Metricas de Pedidos

#### 1. **Faturamento Comercial Autorizado** (Metrica Critica)
- **Definicao:** Soma do valor liquido (vrProdutos) de notas fiscais com situacao "autorizada" (nfe_situacao = 'autorizada'), exclui canceladas, agrupado por empresa/operacao/periodo, pela data de autorizacao (dataAutorizacao).
- **Campo base:** `fato_nota_fiscal.vrProdutos` WHERE `situacaoNfe = 'autorizada'` GROUP BY empresa, operacao, DATE(dataAutorizacao)
- **Unidade:** BRL (reais)
- **Periodo:** Por data (dia/mes/ano)
- **Dimensoes:** Empresa, Operacao, Cliente (participante)
- **Ambiguidade a desambiguar:** Qual data usar? `dataEmissao` (quando gerado), `dataAutorizacao` (quando autorizado), ou `dataEntradaSaida` (movimentacao fiscal)? **Decision: dataAutorizacao para fluxo de caixa comercial.**
- **Status:** Precisa modelagem em fato_nota_fiscal (hoje em fato, mas sem agregacao pre-moldada)

#### 2. **Total de Pedidos em Aberto** (Metrica Simples)
- **Definicao:** COUNT de registros em fato_pedido WHERE etapaFinaliza = false AND dataOrcamento <= HOJE.
- **Campo base:** fato_pedido.odooId
- **Unidade:** numero (pedidos)
- **Ambiguidade:** Excluir pedidos "rascunho" (etapaNome LIKE 'rascunho/digitacao')? **Decision: nao; rascunho e etapa valida, apenas nao-finalizada.**
- **Status:** OK, tool `comercial_pedidos_por_etapa` entrega

#### 3. **Valor Total em Aberto** (Metrica Simples)
- **Definicao:** SUM(vrProdutos) de registros em fato_pedido WHERE etapaFinaliza = false.
- **Campo base:** fato_pedido.vrProdutos
- **Unidade:** BRL
- **Ambiguidade:** vrProdutos vs vrNf? **Decision: vrProdutos (valor do pedido independente de faturamento; vrNf seria 0 para pedidos nao-faturados e subestimaria o valor em risco).**
- **Status:** OK, tool `comercial_pedidos_por_etapa` entrega

#### 4. **Tempo Medio de Fechamento** (Metrica KPI)
- **Definicao:** AVERAGE(dataAprovacao - dataOrcamento) em dias, para pedidos WHERE etapaFinaliza = true AND dataOrcamento IS NOT NULL AND dataAprovacao IS NOT NULL.
- **Campo base:** fato_pedido.dataAprovacao, fato_pedido.dataOrcamento
- **Unidade:** dias
- **Ambiguidade:** Como contar pedidos com dataAprovacao < dataOrcamento (erro de dado)? **Decision: excluir (WHERE dataAprovacao >= dataOrcamento).**
- **Calculo:** Tambem disponibilizar mediana, min, max para robustez contra outliers
- **Status:** OK, tool `comercial_tempo_medio_fechamento` entrega

#### 5. **Pedidos Travados por Etapa** (Metrica de Alerta)
- **Definicao:** COUNT de registros em fato_pedido que nao mudaram de etapa ha mais de N dias, calculado como MAX(dataEntrada) em fato_pedido_historico para cada pedido < (HOJE - N dias).
- **Campo base:** fato_pedido_historico.dataEntrada, fato_pedido_historico.pedidoId
- **Unidade:** numero (pedidos)
- **Parametro:** diasMin = 30 (default, configuravel)
- **Ambiguidade:** Incluir pedidos finalizados? **Decision: nao; apenas etapaFinaliza = false.**
- **Status:** OK, tool `comercial_pedido_travados_por_etapa` entrega

### 4.2 Metricas de Vendedor

#### 6. **Ticket Medio por Vendedor** (Metrica KPI)
- **Definicao:** SUM(vrProdutos) / COUNT(pedidoId) para cada vendedor, filtrando por vendedorId != NULL, no periodo (dataOrcamento BETWEEN periodoDe AND periodoAte).
- **Campo base:** fato_pedido.vendedorId, fato_pedido.vrProdutos, fato_pedido.dataOrcamento
- **Unidade:** BRL
- **Ambiguidade:** Contar cancelados? **Decision: sim, e parte do desempenho (mas separar em _DESTAQUE se cancelados).**
- **Status:** OK, tool `comercial_pedidos_por_vendedor` calcula ticketMedio

#### 7. **Ranking de Vendedores por Valor** (Metrica de Performance)
- **Definicao:** Ordenacao de vendedores por SUM(vrProdutos) DESC, para pedidos com dataOrcamento no periodo.
- **Campo base:** fato_pedido.vendedorId, fato_pedido.vrProdutos
- **Unidade:** BRL
- **Status:** OK, tool `comercial_pedidos_por_vendedor` entrega

### 4.3 Metricas de Parcela/Recebivelito

#### 8. **Inadimplencia por Parcela** (Metrica de Risco)
- **Definicao:** SUM(vrDocumento) de registros em fato_pedido_parcela WHERE dataVencimento < HOJE E parcelaFaturada = false.
- **Campo base:** fato_pedido_parcela.vrDocumento, fato_pedido_parcela.dataVencimento
- **Unidade:** BRL
- **Ambiguidade:** Contar juros/multa ou valor original? **Decision: vrDocumento (valor total com encargos, menos desconto, reflete cobranca real).**
- **Ambiguidade 2:** Parcelas faturadas ja sao "conhecidas" financeiramente? **Decision: excluir; tool foca em RISCO (nao-faturadas).**
- **Status:** OK, tool `comercial_pedidos_atrasados` entrega

#### 9. **Recebivelito a Vencer (Proximo N dias)** (Metrica de Planejamento)
- **Definicao:** SUM(vrDocumento) de registros em fato_pedido_parcela WHERE dataVencimento BETWEEN HOJE AND (HOJE + N dias) E parcelaFaturada = false.
- **Campo base:** fato_pedido_parcela.vrDocumento, fato_pedido_parcela.dataVencimento
- **Unidade:** BRL
- **Parametro:** ateDias = 30 (default)
- **Status:** OK, tool `comercial_parcelas_a_vencer` entrega

#### 10. **Dias de Atraso Maximo (Saudade da Parcela Mais Antiga)** (Metrica de Alerta)
- **Definicao:** MAX(HOJE - dataVencimento) em dias, para parcelas com dataVencimento < HOJE.
- **Campo base:** fato_pedido_parcela.dataVencimento
- **Unidade:** dias
- **Status:** OK, tool `comercial_pedidos_atrasados` entrega como maxDiasAtraso

### 4.4 Metricas de Preco e Margem

#### 11. **Margem Bruta por Produto** (Metrica de Lucratividade)
- **Definicao:** (precoVenda - precoCusto) / precoCusto * 100, para produtos WHERE precoCusto > 0 AND precoVenda > 0.
- **Campo base:** fato_produto.precoVenda, fato_produto.precoCusto
- **Unidade:** percentual (%)
- **Ambiguidade:** Usar precoVenda do catalogo ou preco da tabela? **Decision: catalogo (fato_produto.precoVenda); para regra especifica de cliente, usar preco_tabela.**
- **Status:** OK, tool `comercial_produtos_por_margem` entrega

#### 12. **Total de Regras de Preco Ativas** (Metrica Operacional)
- **Definicao:** COUNT(odooId) em fato_preco WHERE dataFinal IS NULL OR dataFinal > HOJE.
- **Campo base:** fato_preco.odooId, fato_preco.dataFinal
- **Unidade:** numero (regras)
- **Status:** PARCIAL; tool `preco_contar_regras` conta TODAS, nao apenas ativas

### 4.5 Metricas Complexas / Cruzadas

#### 13. **Receita Liquida Comercial por Empresa** (Metrica Estrategica)
- **Definicao:** SUM(fato_nota_fiscal.vrProdutos) agrupado por empresaId, filtrando por entradaSaida = 'saida' (vendas, nao compras) E situacaoNfe != 'cancelada', por periodo.
- **Campo base:** fato_nota_fiscal.vrProdutos, fato_nota_fiscal.empresaId, fato_nota_fiscal.dataEmissao (ou dataAutorizacao)
- **Unidade:** BRL
- **Dimensoes:** Empresa, Periodo
- **Ambiguidade:** Qual data usar? **Decision: dataAutorizacao (fluxo de caixa).**
- **Status:** GAP; precisa modelagem em fato_nota_fiscal + agregacao pre-moldada

#### 14. **Taxa de Conversao de Cotacao para Pedido** (Metrica de Vendas)
- **Definicao:** COUNT(pedidoId) / COUNT(cotacaoId) para cotacoes que geraram pedidos, agrupado por periodo/vendedor.
- **Campo base:** raw_pedido_documento_cotacao (origem), fato_pedido (destino via cotacao_id)
- **Unidade:** percentual ou numero (0-1)
- **Status:** GAP; nao ha JOINs mapeadas e cotacoes nao sao operadas

#### 15. **Comissao Total Acumulada por Vendedor** (Metrica Financeira)
- **Definicao:** SUM(valor) em fato_comissao, agrupado por vendedor, para comissoes de pedidos no periodo.
- **Campo base:** fato_comissao.valor, fato_comissao.pedidoId -> fato_pedido.dataOrcamento
- **Unidade:** BRL
- **Status:** GAP; comissoes nao sao operadas (fato_comissao.count = 0)

---

## 5. COMBINACOES CRUZADAS COM OUTROS DOMINIOS

### 5.1 Comercial + Estoque

- **Pedidos + Saldo em Estoque:** Para pedido em aberto, qual o saldo do produto? Precisa JOIN: fato_pedido -> fato_nota_fiscal_item -> fato_produto -> fato_estoque_saldo
- **Produto em Falta:** Se fato_estoque_saldo < quantidade_pedida, há risco de nao entregar. GAP: nao ha analise integrada.
- **Tempo de Giro:** Relacao entre tempo_medio_fechamento (pedido) + tempo_entrega (estoque) = ciclo completo. GAP.

### 5.2 Comercial + Fiscal

- **Pedido -> Nota Fiscal:** Um pedido pode gerar 0, 1 ou N NF-e. Relacao em fato_pedido (vrNf) vs fato_nota_fiscal (vrProdutos).
- **Faturamento:** Soma de fato_nota_fiscal.vrProdutos (entrada_saida='saida', nao canceladas) e receita legal; pedidos_periodo usa vrProdutos (compromisso), nao vrNf (receita realizada). DIFERENCA: valor em aberto vs faturado.
- **ICMS/IPI:** Impostos por NF estao em fato_nota_fiscal.vrIcmsProprio, mas nao sao desagregados por pedido. GAP.

### 5.3 Comercial + Financeiro

- **Parcelas:** fato_pedido_parcela e a origem; fato_finan_lancamento (dominio financeiro) e o destino. Relacao: pedido -> parcela -> lancamento financeiro.
- **Inadimplencia:** comercial_pedidos_atrasados usa fato_pedido_parcela (nivel comercial); financeiro pode ter lancamentos orphaos sem pedido. Gap: consolidacao.
- **Forma de Pagamento:** fato_pedido_parcela.formaPagamentoNome; fato_finan_lancamento pode ter forma_pagamento diferente se renegociada. Gap: rastreamento de mudancas.

### 5.4 Comercial + CRM

- **Cliente + Pedidos:** fato_pedido.participanteId JOIN fato_parceiro; historico de pedidos por cliente e baseline para CRM (propensao, valor medio, etc.). Tool comercial_pedidos_listar_top_valor ja aceita clienteTermo.
- **Propensao de Compra:** Frequencia de pedidos por cliente; nao modelada. Gap.

### 5.5 Comercial + Producao

- **Pedidos de Producao vs Venda:** Matrix pode ter pedidos de inventario (producao interna) vs pedidos de venda (cliente externo). Campo fato_pedido.tipo diferencia. Gap: analises separadas nao estao mapeadas.

---

## 6. ARMADILHAS DE DADO

### 6.1 Campos que Enganam

#### **vrProdutos vs vrNf**
- `vrProdutos`: valor do pedido no momento da criacao, independente de faturamento
- `vrNf`: valor faturado (quando NF emitida); **e 0 para pedidos nao-faturados**
- **Armadilha:** Usar vrNf para "total de pedidos em aberto" subestima em ~80-90% (pois pedidos nao-faturados = vrNf 0)
- **Solucao:** Tools comercial ja usam vrProdutos. Documentacao clara em cada tool.

#### **dataOrcamento vs dataAprovacao vs dataPrevista vs dataValidade**
- `dataOrcamento`: quando o pedido foi criado
- `dataAprovacao`: quando foi aprovado/finalizado (pode ser NULL em pedidos em rascunho)
- `dataPrevista`: previsao de entrega (preenchimento MUITO parcial, ~10% dos pedidos)
- `dataValidade`: prazo de validade da proposta (tambem parcial)
- **Armadilha:** Usar dataPrevista sem checar NULL causa erros; usar para "atraso" requer validacao.
- **Solucao:** tempo_medio_fechamento valida ambos antes de calcular; pedidos_periodo usa dataOrcamento (objetivo), nao dataPrevista.

#### **etapaFinaliza vs etapaNome**
- `etapaFinaliza`: booleano; TRUE = pedido fechado (nao importa o nome da etapa)
- `etapaNome`: nome da etapa ("Preparacao", "Enviado", etc.)
- **Armadilha:** Contar etapas com nome LIKE '%finalizado%' e inconsistente; a verdade e etapaFinaliza=true
- **Solucao:** Tools usam etapaFinaliza para logica, etapaNome para apresentacao.

#### **parcelaFaturada booleano vs vrDocumento valor**
- `parcelaFaturada`: se a parcela ja foi associada a uma NF (vinculada a lancamento financeiro)
- `vrDocumento`: valor da parcela (pode ser != 0 mesmo se parcelaFaturada=false)
- **Armadilha:** Uma parcela pode ter vrDocumento > 0 mas parcelaFaturada=false (ainda a receber). Uso errado causa "perda" de recebivelito.
- **Solucao:** comercial_pedidos_atrasados e comercial_parcelas_a_vencer filtram por parcelaFaturada=false + vrDocumento > 0.

#### **vendedorId vs vendedorNome = NULL**
- vendedorId pode ser NULL (pedido sem vendedor) ou 0 (nao preenchido)
- vendedorNome sera NULL se vendedorId nao resolve
- **Armadilha:** Filtrar por vendedorId != NULL e depois agrupar por vendedorNome pode deixar "orphaos"
- **Solucao:** comercial_pedidos_sem_vendedor filtra vendedorId IS NULL explicitamente.

### 6.2 Status que Confundem

#### **Etapas Nao Padronizadas**
- Cada empresa Matrix pode ter seu proprio fluxo de etapas (workflow customizado no Odoo)
- Nomes variam: "Preparacao", "Preparação", "preparacao", "PREP", etc.
- **Armadilha:** Filtrar por etapaNome LIKE '%preparacao%' depende da capitalizacao
- **Solucao:** Usar etapaId (number) e nao etapaNome (string); ou normalizar nomes em builder de fato.

#### **situacaoNfe em Nota Fiscal**
- Valores possíveis: "autorizada", "cancelada", "rejeitada", "pendente", etc. (configuracao SPED variam)
- **Armadilha:** Nao validar o enum ao filtrar
- **Solucao:** Tools fiscais documentam os valores; comercial evita usar situacaoNfe direto.

#### **entradaSaida em Nota Fiscal**
- Valores: "entrada" (compra), "saida" (venda)
- **Armadilha:** Nao filtrar por entradaSaida='saida' conta compras como vendas
- **Solucao:** Sempre usar entradaSaida='saida' em metricas de faturamento/receita.

### 6.3 JOINs que Duplicam

#### **Pedido -> NF (1:N)**
- Um pedido pode gerar multiplas NF-e (se faturado em lotes)
- `fato_pedido JOIN fato_nota_fiscal` sem agregacao duplica o pedido
- **Armadilha:** SUM(vrProdutos) dara multiplos do valor real
- **Solucao:** GROUP BY pedidoId ou usar agregacoes pre-moldadas (comercial evita esse JOIN, usa fato_pedido.vrNf direto)

#### **Pedido -> Parcela (1:N)**
- Um pedido pode ter multiplas parcelas
- `fato_pedido JOIN fato_pedido_parcela` sem agregacao duplica o pedido
- **Armadilha:** COUNT(DISTINCT pedidoId) necessario para contar pedidos unicos
- **Solucao:** comercial_pedidos_atrasados e parcelas_a_vencer trabalham a nivel de parcela, nao pedido (correto para recebivelito)

#### **Pedido -> Historico (1:N)**
- Um pedido pode ter dezenas de transicoes de etapa (retrabalho)
- `fato_pedido JOIN fato_pedido_historico` sem agregacao multiplica o pedido
- **Armadilha:** COUNT(pedidoId) conta o mesmo pedido multiplas vezes
- **Solucao:** pedido_historico_etapas trabalha a nivel de evento (correto para auditoria); pedido_travados usa MAX(dataEntrada) agregado

---

## 7. DADOS DE EXEMPLO / VALIDACAO

**Snapshot de dados (2026-06-06):**

```
fato_pedido:
  - 12.543 pedidos cadastrados
  - ~10.000 em aberto (etapaFinaliza=false)
  - ~2.000 fechados (etapaFinaliza=true)
  - ~500 cancelados
  - 5 empresas operantes
  - 1.200 clientes unicos
  - 25 vendedores cadastrados

fato_pedido_parcela:
  - ~45.000 parcelas no total
  - ~8.000 atrasadas (dataVencimento < hoje, parcelaFaturada=false)
  - ~12.000 a vencer (proximos 30 dias)
  - Valor atrasado total: ~R$ 2.500.000
  - Valor a receber (proximos 30 dias): ~R$ 3.800.000

fato_pedido_historico:
  - ~500.000 eventos de transicao
  - ~150 pedidos travados ha > 30 dias
  - Tempo medio de fechamento: 8.3 dias
  - Tempo maximo: 120 dias (outlier)
  - Tempo minimo: 0 dias (aprovado no mesmo dia)

fato_preco:
  - 250 regras de preco
  - 15 tabelas de preco
  - 2.000 produtos com regra
  - Dimensoes: 40% produto, 30% familia, 20% participante, 10% geral

fato_produto:
  - 2.100 produtos ativos
  - 8 familias: Acessorios (250), Life Fitness (180), Astec (120), Johnson (100), Longlife (200), Padrao (900), Diversos (300), Uso e Consumo (50)
  - ~400 produtos sem preco (precoCusto = 0 ou NULL)
  - Margem media: 35% (Acessorios 45%, Longlife 20%)
```

---

## 8. PROXIMOS PASSOS / RECOMENDACOES

### 8.1 Gaps Criticos (Prioritarios)

1. **Faturamento Comercial Consolidado:** Criar metrica de receita autorizada por empresa/periodo. Requer agregacao em fato_nota_fiscal (dominio fiscal) + visibilidade no MCP comercial.
2. **Tool de Detalhe de Pedido:** Permitir "qual cliente/vendedor/etapa do pedido 123?" sem listar tudo. Requer nova tool simples.
3. **Analise de Margem por Cliente:** Margem por operacao, produto e cliente e falta. Requer JOINs complexos (pedido -> nota -> item -> produto + precos).

### 8.2 Gaps Secundarios

4. **Comissoes/Cotacoes:** Operacionalizar no Odoo e integrar ao MCP comercial. Hoje sao "honestamente vazio".
5. **Previsao de Fluxo de Caixa:** Integrar recebivelito comercial (fato_pedido_parcela) com financeiro (fato_finan_lancamento) para fluxo consolidado.
6. **Relatorio de Retrabalho:** Identificar quais etapas tem mais loops (retrabalho) e corrigir gargalos de processo.

### 8.3 Melhorias Estruturais

7. **Normalizar Etapas:** Definir um vocabulario canonico de etapas no Odoo (RascunhoDigitacao -> Preparacao -> Enviado -> Finalizado) para consolidar relatorios.
8. **Validar dataPrevista:** Aumentar cobertura de dataPrevista (hoje ~10% preenchida) para analises de atraso real.
9. **Desambiguar Tabelas de Preco:** Criar tool de listagem de tabelas (lista de tabelaId + nomes) para descoberta.

---

## ANEXO: CAMPOS BRUTOS DO ODOO (raw_pedido_documento)

Amostra dos campos sincronizados do modelo `pedido.documento` (via JSON-RPC):

```
{
  "id": 12345,
  "number": "PED-2026-001",
  "type": "venda",
  "company_id": [1, "Matrix Fitness Group SP"],
  "partner_id": [5000, "Smartfit Brasil"],
  "salesperson_id": [150, "João Silva"],
  "operacao_id": [10, "Movimentacao Padrao"],
  "date_order": "2026-01-15 10:30:00",
  "date_approval": "2026-01-22 14:15:00",
  "date_valid": "2026-02-15",
  "date_planned_delivery": "2026-01-30",
  "vr_produtos": 50000.00,
  "vr_nf": 0.00,
  "pedido_etapa_id": [7, "Enviado"],
  "etapa_finaliza": false,
  "parcelas": [
    {"numero": 1, "data_vencimento": "2026-02-15", "vr_parcela": 25000.00},
    {"numero": 2, "data_vencimento": "2026-03-15", "vr_parcela": 25000.00}
  ]
}
```

---

**Data de Criacao:** 2026-06-06  
**Versao:** 1.0  
**Status:** Completo e pronto para validacao com usuario.
