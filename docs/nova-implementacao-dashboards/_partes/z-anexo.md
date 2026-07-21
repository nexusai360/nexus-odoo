# Parte III , Anexos

> Referência técnica extraída literalmente do código (`prisma/schema.prisma`, `src/lib/**`) em 2026-07-20. Use como fonte de verdade dos nomes de campo, assinaturas de query e helpers ao implementar os módulos da Parte II.

## Anexo A , Mapa de campos das tabelas de fato

Campos relevantes por modelo Prisma (nome Prisma → coluna física). Tipos `Decimal` são `@db.Decimal(p,s)`. Campos "(derivado)" são materializados por builders, não vêm crus do Odoo.

### A.1 Estoque

**`FatoEstoqueSaldo`** (`fato_estoque_saldo`) , saldo por produto/local (estado "agora"):
`odooSaldoId` (unique), `produtoId`, `produtoNome`, `localId`, `localNome`, `quantidade` (Decimal 18,4), `unidade`, `vrSaldo` (`vr_saldo`, Decimal 18,2, valor calculado pelo Odoo; **não** é a base de valoração da plataforma: o KPI de valor usa `quantidade × preco_custo ÷ índice`, ver Módulo 1 RN-1.2), `familiaId`, `familiaNome`, `marcaId`, `marcaNome`, `atualizadoEm`.
> Falta `linha`/`linhaNome` (a criar, B1). `tipo` NÃO existe neste fato (vive em `FatoProduto`); para compor por tipo, juntar com `FatoProduto` por `produtoId`.

**`FatoEstoqueLocal`** (`fato_estoque_local`) , cadastro de local:
`odooId` (id), `nome`, `nomeCompleto`, `tipo` ('S' sintético | 'A' analítico), `nivel`, `localSuperiorId`, `estoqueEmMaos`, `calculaExtratoSaldo`, `temProprietario`, `classificacao` (`fisico` | `demonstracao` | `fora`), `atualizadoEm`.
> Use `classificacao = 'fisico'` para o estoque próprio vendável; `demonstracao` é estoque em cliente.

**`FatoEstoqueSaldoSnapshot`** (`fato_estoque_saldo_snapshot`) , foto diária (base dos comparativos temporais):
`id`, `dataRef` (`data_ref`, Date), `produtoId`, `produtoNome`, `localId`, `localNome`, `quantidade` (18,4), `vrSaldo` (18,2), `familiaId`, `familiaNome`, `marcaId`, `marcaNome`, `capturadoEm`.
> Consultar por `dataRef` para pegar a foto de um dia (ex.: hoje vs. hoje-30, primeiro/último dia do mês do ciclo).

**`FatoProduto`** (`fato_produto`) , cadastro do produto:
`odooId` (id), `nome`, `codigo`, `codigoUnico`, `codigoBarras`, `ativo`, `tipo`, `marcaId`, `marcaNome`, `familiaId`, `familiaNome`, `unidadeNome`, `ncmCodigo`, `controlaEstoque`, `permiteVenda`, `permiteCompra`, `precoCusto` (`preco_custo`, 14,4), `precoVenda` (`preco_venda`, 14,4), `pesoLiquido`, `pesoBruto`, `criadoEm`, `atualizadoEmOdoo`, `atualizadoEm`.
> `tipo` já existe (seletorizada/peso livre/cardio/acessório). `linha` NÃO existe (B1). Marca/família já existem.

### A.2 Comercial

**`FatoPedido`** (`fato_pedido`):
`odooId` (id), `numero`, `tipo`, `etapaId`, `etapaNome`, `etapaFinaliza`, `operacaoId`, `operacaoNome`, `modalidadeFrete`, `numeroMercos`, `participanteId`, `participanteNome`, `vendedorId`, `vendedorNome`, `empresaId`, `empresaNome`, `dataOrcamento`, `dataAprovacao`, `dataValidade`, `dataPrevista`, `vrProdutos` (18,2), `vrNf` (18,2), `categoriaOperacao` (derivado), `bucketDemanda` (`bucket_demanda`, derivado: classifica demanda em aberto), `pendenciaEtapa` (derivado), `atualizadoEm`.
> `vendedorNome` é a fonte do ranking por vendedor (incompleto no histórico; ver DEP-3.x). `empresaId` = recorte por empresa do grupo (não CNPJ). `bucketDemanda` já materializa a whitelist de demanda (Anexo D).

**`FatoPedidoItem`** (`fato_pedido_item`):
`odooId` (id), `pedidoId`, `produtoId`, `produtoNome`, `familiaNome`, `marcaNome`, `quantidade` (18,4), `cfopId`, `localReservaId`, `vrProdutos` (18,2), `vrCusto` (`vr_custo`, 18,2), `quantidadeAAtender` (`quantidade_a_atender`, 18,4), `quantidadeAtendida` (`quantidade_atendida`, 18,4), `atualizadoEm`.
> `quantidadeAAtender` é a base da demanda a entregar (entregas parciais). `vrCusto` no item permite margem por item.

**`FatoPedidoParcela`** (`fato_pedido_parcela`) , base de PMR/entrada/forma de pagamento:
`odooId` (id), `pedidoId`, `numero`, `participanteId`, `participanteNome`, `dataVencimento`, `valor` (18,2), `vrJuros`, `vrMulta`, `vrDesconto`, `vrDocumento` (18,2), `formaPagamentoNome` (`forma_pagamento_nome`), `parcelaFaturada`, `finanLancamentoId`, `atualizadoEm`.
> PMR = função de `dataVencimento` das parcelas vs. data-base do pedido; forma de pagamento vem daqui e/ou de `fato_financeiro_titulo`.

**`FatoNotaFiscal`** (`fato_nota_fiscal`) , faturamento real:
`odooId`, `numero`, `serie`, `modelo`, `entradaSaida`, `tipoMovimento`, `situacaoNfe`, `finalidadeNfe`, `chave`, `participanteId`, `participanteNome`, `naturezaOperacaoId/Nome`, `operacaoId/Nome`, `empresaId`, `empresaNome`, `dataEmissao`, `dataEntradaSaida`, `dataAutorizacao`, `vrNf` (18,2), `vrProdutos` (18,2), `vrFatura`, `vrIbpt`, `vrIcmsProprio`, `vrDesconto`, `isVendaExterna` (`is_venda_externa`, derivado , a flag que a plataforma lê para "é venda"), `vendaPorNatureza` (sombra), `classificacaoDivergente`, `naturezaDesconhecida`, `atualizadoEm`.
> Faturamento = notas com `isVendaExterna = true`, filtrando por `dataEmissao`. "Consumido no ciclo" (Módulo 2) usa esta tabela.

**`FatoNotaFiscalItem`** (`fato_nota_fiscal_item`):
`odooId`, `documentoId`, `produtoId`, `produtoNome`, `cfopId/Nome`, `quantidade` (18,2), `vrUnitario`, `vrProdutos` (18,2), `vrNf`, impostos (`vrIcmsProprio`, `vrPisProprio`, `vrCofinsProprio`), e desnormalizados da nota-mãe: `dataEmissao`, `entradaSaida`, `empresaId`, `situacaoNfe`, `operacaoId/Nome`, `finalidadeNfe`, `atualizadoEm`.
> Base de "produtos vendidos por item" e da curva ABC (agregar `vrProdutos` por `produtoId`).

**`FatoParceiro`** (`fato_parceiro`) , cliente:
`odooId`, `nome`, `nomeCompleto`, `documento` (CNPJ/CPF), `documentoDigits`, `ehCliente`, `ehFornecedor`, `ehEmpresa`, `cidade`, `uf`, `pais`, `cep`, `email`, `telefone`, `ativo`, `partnerId`, `dataCriacao`, `atualizadoEm`.
> `uf` do cliente alimenta rankings/mapa por estado. `documento`/`documentoDigits` é a chave do agrupamento por construtora/grupo (B3). Segmento/tipo de cliente NÃO consta aqui: confirmar origem (campo Odoo a mapear) , ver DEP-3.x.

### A.3 Financeiro

**`FatoFinanceiroTitulo`** (`fato_financeiro_titulo`) , títulos a pagar/receber:
`odooId`, `tipo` (`a_receber` | `a_pagar`), `participanteId/Nome`, `contaId`, `contaNome`, `numeroDocumento`, `pedidoId`, `notaFiscalId`, `pedidoFaturado`, `dataDocumento`, `dataVencimento`, `dataPagamento`, `situacao`, `situacaoSimples`, `formaPagamentoNome`, `provisorio`, `empresaId`, `vrDocumento` (18,2), `vrSaldo` (18,2), `vrTotal` (18,2), `vrJuros`, `vrMulta`, `vrDesconto`, `atualizadoEm`.

**`FatoFinanceiroMovimento`** (`fato_financeiro_movimento`):
`odooId`, `data`, `contaId/Nome`, `centroResultadoId/Nome`, `entrada` (18,2), `saida` (18,2), `valor` (18,2), `entradaPrevista`, `saidaPrevista`, `valorPrevisto`, `atualizadoEm`.

**`FatoFinanceiroLancamentoItem`** (`fato_financeiro_lancamento_item`) , base da composição de despesa por categoria:
`odooId`, `lancamentoId`, `tipo`, `contaId`, `contaNome`, `centroResultadoId/Nome`, `descricao`, `pedidoId`, `vrDocumento` (18,2), `vrTotal` (18,2), `vrSaldo`, `vrPagoTotal`, `dataDocumento`, `atualizadoEm`.
> A categoria de despesa vem de `contaId`/`contaNome`, resolvida no plano de contas (`FatoContaContabil`).

**`FatoContaContabil`** (`fato_conta_contabil`) , plano de contas:
`odooId`, `codigo`, `nome`, `tipo`, `nivel`, `natureza`, `contaPaiId`, `contaPaiNome`, `parentPath`, `caracteristicaSaldo`, `ehRedutora`, `atualizadoEm`.
> `parentPath`/`contaPaiId` permitem agrupar despesas por categoria-pai (as "categorias" do gráfico do módulo Financeiro).

**`DimEmpresaGrupo`** (`dim_empresa_grupo`) , empresas do grupo:
`odooId` (= `empresaId` gravado nos fatos), `nome`, `cnpj`, `tipo` (`matriz` | `filial`), `uf`, `ativo`, `atualizadoEm`.
> **Atenção (de-para deslocado):** NÃO assuma `empresaId dos fatos == DimEmpresaGrupo.odooId`. O `odooId` da dimensão está deslocado em relação ao `empresaId` gravado nas notas/títulos (ver `src/lib/metrics/fiscal/faturamento-por-empresa.ts`, que por isso rotula pelo `empresaNome` da própria nota). Para exibir CNPJ/nome oficial (Módulo 4), cruze por `cnpj` ou por um de-para explícito, com fallback ao `empresaNome` do fato. Ver Módulo 4 RN-4.7/DEP-4.3. O recorte de empresa nas queries continua sendo pelo `empresaId` numérico do fato.

> **Gap de UF nas despesas:** não há campo de UF em `FatoFinanceiroLancamentoItem`/`FatoFinanceiroTitulo`. O recorte "despesa por UF" (Módulo 4) depende do cliente lançar UF na conta a pagar no Odoo e desse campo ser sincronizado (DEP-4.x).

---

## Anexo B , Assinaturas de query existentes (reuso)

Funções já implementadas que os módulos estendem/reusam. Padrão comum: recebem `prisma: PrismaClient` e `filtros` com `{ periodoDe?, periodoAte?, empresaId? }` (ISO `AAAA-MM-DD`).

### B.1 `src/lib/diretoria/queries/estoque.ts`
Tipo-base `FiltrosEstoque { periodoDe?, periodoAte?, empresaId? }`.
- `queryIndicadoresEstoque(prisma) → IndicadoresEstoque { valorTotal, valorACusto, indice, itens, produtos, locais, produtosSemCusto, linhasNegativas }`
- `queryEstoquePorLocal(prisma)`
- `queryEstoquePorFamilia(prisma)`, `queryEstoquePorMarca(prisma)`
- `queryEstoqueDemonstracao(prisma) → { valorGeral, nossos, cliente }`
- `queryCatalogoEstoque(prisma, limit=100) → { linhas, total, valorGeral }`
- `queryEstoqueDisponivelDiretoria(prisma, {periodoDe?, periodoAte?, limite?}) → { linhas, produtos, negativos, unidadesAComprar }`
- `queryNecessidadeCompra(prisma, limite=100, {periodoDe?, periodoAte?}) → { linhas, produtosEmFalta, unidadesAComprar, custoTotalEstimado, atendimentoSincronizado }`
- `queryComprasSerie`, `queryComprasPorFornecedor`, `queryResumoCompras`, `queryComprasAtivas`, `queryIndicadoresAvancadosEstoque`, `queryEstoqueGranular`, `querySeriais`.

### B.2 `src/lib/reports/queries/estoque.ts`
- `querySaldoProduto(prisma, {armazemId?, familiaId?, termo?, classificacao?}) → SaldoProdutoData`
- `queryValorArmazem(prisma, {prefixosArvore?, classificacao?})`
- `queryEntradasSaidas(prisma, {periodoDe?, periodoAte?, armazemId?})`
- `queryConcentracao(prisma, {classificacao?}) → { familiasBruto, marcasBruto }`
- `queryEstoqueComparativo(prisma, {dataInicial, dataFinal})` , usa snapshot; retorna pontos `{ dataAlvo, dataUsada, fonte: "snapshot"|"reconstrucao", valor, quantidade, aviso? }`. **Base direta do comparativo temporal do Módulo 1 e da abertura/fechamento mensal do Módulo 2.**
- `queryProdutosParados`, `queryTopMovimentados`.

### B.3 `src/lib/diretoria/queries/vendas.ts`
Tipo-base `FiltrosVendas { periodoDe?, periodoAte?, ufs?, empresaId? }`; `VisaoPagamento = "pago" | "a_receber" | "carteira"`.
- `queryIndicadoresVendas(prisma, filtros) → { faturamento, numPedidos, ticketMedio }`
- `queryMargemEstimada(prisma, filtros) → { receita, custoEstimado, margem, margemPct }`
- `queryVendasPorMarca`, `queryVendasPorUf`, `queryModalidadesEMaiorPedido`, `queryFormasPagamento` (retorna por `VisaoPagamento`, inclui "carteira" = a faturar).

### B.4 `src/lib/reports/queries/comercial.ts` (demanda/pedidos)
- `queryDemandaEmAberta(prisma, {empresaId?, etapa?, limite?, ordenacao?, periodoDe?, periodoAte?}) → { totalPedidos, valorTotal, valorCusto, porEtapa[], lista[], ordenadoPor, atendimentoSincronizadoEm, parcial }`
- `queryDemandaPorProduto(prisma, {limite?, empresaId?, periodoDe?, periodoAte?})`
- `queryEstoqueDisponivel(prisma, {produto?, apenasNegativos?, limite?, classificacao?, periodoDe?, periodoAte?}) → linhas { saldo, demanda, demandaValorVenda, demandaValorCusto, disponivel }`
- `queryPedidoSituacao(prisma, {numero})` , drill de um pedido (trilha de etapas, itens, pendência).
- `queryPedidosPorVendedor`, `queryPedidosAtrasados`, `queryParcelasAVencer`, `queryPedidosPorEtapa`.

### B.5 `src/lib/diretoria/queries/pedidos.ts` (demanda diretoria)
Tipo-base `FiltrosDemandas { ufs?, periodoDe?, periodoAte?, empresaId? }`.
- `queryIndicadoresDemandas(prisma, hoje, filtros) → { totalPendentes, valorAEntregar, atrasadas }`
- `queryDemandasPorUf(prisma, filtros) → { linhas, valorGeral }` , base do mapa por estado.
- `queryDemandasPendentes(prisma, hoje, filtros) → { linhas }` , lista de pedidos pendentes.
- `queryDemandaPorEtapa`, `queryDemandasMaisParadas`, `ufPorParticipante`.

### B.6 `src/lib/diretoria/queries/entregas-parciais.ts`
- `queryEntregasParciais(prisma, hoje, filtros) → { indicadores { qtdPedidos, totalPedido, aAtenderVenda, aAtenderCusto }, linhas[], atendimentoSincronizado }` , itens a entregar por pedido (uma linha por item), com `statusFinanceiro` (liberado/bloqueado).

### B.7 `src/lib/reports/queries/financeiro.ts`
- `querySaldoContas(prisma)`, `queryCaixaPeriodo(prisma, {periodoDe?, periodoAte?})`, `queryFluxoCaixa(prisma, {periodoDe?, periodoAte?})`
- `queryContasAReceber(prisma, filtros, hoje)`, `queryContasAPagar(prisma, filtros, hoje) → { titulos, totalAPagar, quebra }`, `queryTitulosVencidos(prisma, hoje)`
- `filtrarTitulosExternos(prisma, titulos)` , remove títulos intragrupo.
> O Módulo 4 (Financeiro por CNPJ) precisa de novas agregações por `empresaId` + categoria de despesa (plano de contas), reusando o padrão destas funções.

---

## Anexo C , Helpers de corte, janela e período

### C.1 `src/lib/corte-dados.ts` (janela de análise)
Constantes: `CORTE_DADOS_KEY = "sync.corte_dados"`, `CORTE_DADOS_PADRAO = "2026-03-16"`, `CORTE_DADOS_MINIMO = "2026-01-01"`, `PISO_DEMANDA_ABERTA = "2000-01-01"`.
Tipo `Janela { gte: Date; lt: Date; deIso: string; ateIso?: string; cortado: boolean }` (`lt` é fim EXCLUSIVO = ate + 1 dia).
Funções: `corteAtual()`, `corteAtualDate()`, `getCorteDados(prisma)` (lê AppSetting, cache 60s), `clampIsoAoCorte(iso, corte?)`, `clampDateAoCorte(d, corte?)`, `pedeAntesDoCorte(deIso?, corte?)`, `janelaClampada(de?, ate?, corte?)`, `janelaDemandaAberta(de?, ate?)` (= `janelaClampada` com piso 2000), `clampMesAoCorte(mes, corte?)`, `whereData(campo, de?, ate?, corte?)`.
Regra: métricas normais usam `janelaClampada` (piso no corte); **demanda a entregar** usa `janelaDemandaAberta` (piso 2000, ignora o corte).

### C.2 `src/lib/reports/builder/janela-anterior.ts` (comparação vs. período anterior)
- `janelaAnterior(de?, ate?, corte?) → { de, ate } | null` , janela imediatamente anterior de mesmo tamanho; `null` se cair inteira antes do corte; grampeia o início se cruzar.
- `calcularDeltaKpi(atual, anterior) → { direction: "up"|"down"|"flat", percent } | null` , delta percentual; `null` quando base 0/inválida.

### C.3 `src/lib/diretoria/periodo.ts` (resolvedor da pílula)
- `DiretoriaPeriodoPreset = "hoje" | "semana" | "este_mes" | "ano_atual" | "ano_anterior" | "ultimos_7" | "ultimos_30" | "ultimos_90" | "tudo" | "custom"`.
- `PeriodoDirParams { periodo?, de?, ate? }` (forma vinda da URL).
- `resolverPeriodoDir(params, hoje) → { de: Date, ate: Date, preset }` , grampeia início ao corte.
- `resolverJanelaDemanda(params, hoje) → { periodoDe?, periodoAte? }` , mesma pílula SEM grampear no corte (preset "tudo" retorna `{}`). Use este para demanda.

### C.4 Formas literais da janela (atenção ao integrar)
- `{ de, ate }` (ISO) , params de URL/UI.
- `{ periodoDe, periodoAte }` (ISO) , o que as queries recebem em `filtros`.
- `{ start, end }` (ISO) , interno do `DiretoriaRangePicker`.

### C.5 Filtro de empresa
Sempre por `empresaId` numérico (não por CNPJ). `undefined` = grupo inteiro. Componente `DiretoriaEmpresaSelect` (`src/components/diretoria/diretoria-empresa-select.tsx`) escreve o param `empresa` na URL; `EMPRESA_TODAS = "todas"` remove o filtro. Opções por `opcoesDeEmpresa()` (`src/lib/diretoria/empresa-opcoes.ts`). **Cuidado:** o `odooId` de `DimEmpresaGrupo` está deslocado em relação ao `empresaId` dos fatos (ver nota em A.3 e Módulo 4 RN-4.7); use a dimensão só para nome/CNPJ via de-para explícito, nunca como igualdade direta com `empresaId`.

---

## Anexo D , Whitelist de demanda em aberto

Constante `ETAPAS_DEMANDA_ABERTA` (`ReadonlySet<number>`) em `src/lib/fiscal/regras/etapas-demanda-aberta.ts` (reexportada por `src/lib/fiscal/regras/index.ts`). Curada do relatório oficial de Entregas Parciais do Odoo (ID 28); pertencer ao conjunto vence os flags dinâmicos da etapa. Os 27 valores:

```
130, 94, 95, 5, 132, 86, 133, 4, 129, 124, 120, 171, 121, 103,
87, 167, 202, 203, 204, 205, 179, 180, 185, 186, 187, 183, 226
```

Classificador `classificaEtapaDemanda(g: GatilhosEtapa) → "ABERTA" | "FECHADA" | "IGNORAR"` (`src/lib/fiscal/regras/classifica-etapa-demanda.ts`), ordem: cancela → IGNORAR; finaliza faturamento ou confirma → FECHADA; senão ABERTA. O bucket "ABERTA" é materializado em `fato_pedido.bucketDemanda` pelo builder `src/worker/fatos/fato-pedido-classificacao.ts` (`bucketDoPedido`), aplicando a whitelist. Os módulos leem `bucketDemanda` em vez de reclassificar.

---

## Anexo E , Checklist de rebuild de container (dev local)

Ao mexer no código, rebuildar o container afetado (regra de raiz do projeto):

| Mudou em… | Rebuilda |
|---|---|
| `src/lib/reports/queries/**` | `mcp` |
| `prisma/schema.prisma` ou generated | todos (app + mcp + worker) |
| `src/worker/**` ou clientes Odoo | `worker` (via `docker compose build app`, pois o worker reusa a imagem do app) |
| `src/**` (telas/queries diretoria) | `app` |

Após migration de schema (novos modelos de ciclo, campo `linha`), rodar `npx prisma generate` e rebuildar. Ver a regra completa no `CLAUDE.md` do projeto (seção 2.1).
