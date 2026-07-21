## Módulo 3 , Vendas

> Telas: 07,08,09 (painel), 10,11 (comparativos), 12 (comparação geral). Prioridade de entrega: 2ª.

> Este documento é a Parte II do escopo técnico e assume a Parte I lida. Referencie sempre,
> sem repetir: convenções e identificadores (§2), glossário de negócio (§3), fontes de dado
> canônicas (§5), regras transversais de dado (§6, com corte de dados §6.1, comparação vs.
> período anterior §6.2, pílula de período §6.3, filtro de empresa/CNPJ §6.4, valoração §6.5),
> padrões de UI (§7) e a camada base compartilhada (§8, com B3 importadores: meta mensal e
> mapeamento de grupos de CNPJ). Onde este módulo diz "já existe", trata-se de código em
> `src/lib/diretoria/queries/vendas.ts` (511 linhas) e `src/lib/reports/queries/comercial.ts`
> (932 linhas); onde diz "tela nova", trata-se de Comparativos e Comparação geral, que não
> existem hoje.

---

### 3.1 Objetivo e usuário

**Objetivo.** Dar à diretoria comercial a leitura completa do resultado de vendas do grupo:
quanto foi faturado (nota fiscal emitida), com que margem bruta, contra que meta, com que
condição de pagamento, concentrado em quais produtos, distribuído por quais estados e
vendedores, e o quanto disso ainda está em carteira (vendido e não faturado). O módulo
substitui a tela atual de `diretoria/vendas`, que já entrega parte dos indicadores e das
composições, por uma versão com os ângulos que faltavam (linha, segmento, forma de pagamento,
empresa emissora), a curva ABC, as condições de pagamento (PMR, entrada) e duas telas novas de
comparação entre estados.

**Usuário.** Diretoria e gestão comercial (perfis com acesso ao grupo de dashboards da
diretoria), respeitando o RBAC existente (§7.7). Um usuário restrito por UF vê apenas os
estados a que tem acesso: o recorte geográfico já é aplicado nas queries de vendas via
`filtros.ufs` (ver `queryVendasPorUf`, `queryIndicadoresVendas`), e as telas novas herdam a
mesma regra.

**Três telas, um seletor de modo.** O topo de todas as telas tem o mesmo seletor de modo
(pílula com três abas, canto superior esquerdo dos protótipos 07 a 12):

1. **Painel de vendas** (telas 07, 08, 09): a análise completa de um recorte único.
2. **Comparativos** (telas 10, 11): estado A × estado B, com períodos independentes.
3. **Comparação geral de estados** (tela 12): a tabela mestre de todas as UFs.

O rótulo "MODO DA TELA" no canto superior direito espelha a aba ativa. A troca de aba não
recarrega a página inteira; troca a área de conteúdo mantendo o cabeçalho.

**Fronteiras (herdadas da Parte I §1.2).** Ficam **fora** deste módulo: taxa de conversão de
vendas (depende de orçamentos que vivem no Mercos, fora do Odoo); margem líquida (só margem
bruta nesta fase); composição da receita por plano de contas. Comparativos além dos três desta
fase (o cliente disse na reunião "depois a gente vai fazer outros dois, três comparativos")
são incrementos futuros; esta entrega cobre apenas os três acima.

---

### 3.2 Pré-requisitos de dado (tabelas, campos, gaps)

As fontes canônicas do módulo são as tabelas comerciais da Parte I §5.3. Abaixo, cada
dependência de dado com o estado real conferido no `prisma/schema.prisma` e no código.

**Tabelas base (já existem e já são lidas):**

| Tabela (Prisma / físico) | Uso no módulo | Campos-chave conferidos |
|---|---|---|
| `FatoNotaFiscal` / `fato_nota_fiscal` | Faturamento = nota emitida | `isVendaExterna` (coluna materializada), `dataEmissao`, `vrNf`, `vrProdutos`, `participanteId`, `empresaId`/`empresaNome`, `operacaoId`/`operacaoNome`, `situacaoNfe` |
| `FatoNotaFiscalItem` / `fato_nota_fiscal_item` | Itens faturados: produto, quantidade, receita, base de margem | `documentoId`, `produtoId`, `quantidade`, `vrProdutos`, `vrUnitario` |
| `FatoPedido` / `fato_pedido` | Pedidos fechados, vendedor, empresa, carteira a faturar | `categoriaOperacao` (`'venda'`), `dataOrcamento`, `dataAprovacao`, `etapaFinaliza`, `vendedorId`/`vendedorNome`, `empresaId`/`empresaNome`, `participanteId`, `vrProdutos`, `vrNf` |
| `FatoPedidoItem` / `fato_pedido_item` | Itens do pedido (custo, quantidade) | `pedidoId`, `produtoId`, `marcaNome`, `familiaNome`, `quantidade`, `vrProdutos`, `vrCusto` |
| `FatoPedidoParcela` / `fato_pedido_parcela` | PMR, entrada, nº de parcelas, forma de pagamento por pedido | `pedidoId`, `dataVencimento`, `valor`, `vrDocumento`, `formaPagamentoNome`, `parcelaFaturada` |
| `FatoFinanceiroTitulo` / `fato_financeiro_titulo` | Forma de pagamento confiável (99,98% preenchida) | `tipo` (`'a_receber'`), `dataDocumento`, `vrDocumento`, `formaPagamentoNome`, `notaFiscalId`, `participanteId`, `empresaId`, `provisorio` |
| `FatoParceiro` / `fato_parceiro` | UF do cliente, razão social, documento (CNPJ) para grupos | `odooId`, `uf`, `nome`, `nomeCompleto`, `documento`, `documentoDigits` |
| `FatoProduto` / `fato_produto` | Custo de catálogo (margem estimada), marca, família, tipo | `precoCusto`, `marcaNome`, `familiaNome`, `tipo`; **falta `linha`** |
| `DimEmpresaGrupo` / `dim_empresa_grupo` | Nome/CNPJ/UF por empresa emissora | `odooId`, `nome`, `cnpj`, `tipo`, `uf` |

**Gaps de dado (bloqueiam parte dos números; cada um vira uma DEP):**

**DEP-3.1 , Meta mensal de vendas [MUST para o card "Meta atingida"].** Não nasce do Odoo. É
definida mês a mês pela diretoria (na reunião: "provavelmente pelo meu pai, o Daniel Miranda").
Fonte única: o importador de meta mensal da camada base B3 (§8.3, item 2). Modelo mínimo a
criar: `meta_venda_mensal` (`id`, `mesRef` no formato `YYYY-MM`, `empresaId?` (nulo = meta do
grupo consolidado), `grupoNome?` (opcional, se a meta for por recorte grupo/Smart/Aztec),
`vendedorId?` (nulo = meta agregada de grupo/empresa; preenchido = meta individual do vendedor,
para alimentar a coluna "meta atingida" do ranking C4, RF-3.7/M-3.6), `valorMeta` decimal,
timestamps). O importador de B3 (§8.3, item 2) precisa aceitar a coluna opcional de vendedor
(por `vendedorId` ou nome resolvido para `vendedorId`) além de mês/empresa/grupo. Sem meta
cadastrada para o mês, o card "Meta atingida" mostra "Sem meta definida" (não zera nem inventa). A janela do card é **mensal** por natureza (a meta
é mensal): quando a pílula estiver em janela diferente de um mês fechado, o card usa o mês
corrente da janela e sinaliza a base ("meta de Julho/2026").

**DEP-3.2 , Mapeamento de CNPJs em grupos [MUST para o recorte grupo/Smart/Aztec e busca por
construtora].** Não existe no cache. A tabela `cliente_grupo` (B3 §8.3, item 5) mapeia
`documentoDigits` (ou `participanteId`) → `grupoNome`. Um mesmo `grupoNome` reúne vários CNPJs
(caso Smart Fit, Aztec, e cada construtora que tem várias razões sociais). A chave de junção é
`FatoParceiro.documentoDigits` (CNPJ só com dígitos, já indexado) ou `participanteId`. Sem esse
mapeamento, a "chavinha" grupo/Smart/Aztec e a busca por construtora não filtram nada e devem
aparecer desabilitadas com dica ("mapeamento de grupos ainda não cadastrado").

**DEP-3.3 , Nome do vendedor no pedido [MUST para o ranking por vendedor; degradação
graciosa].** O campo existe (`FatoPedido.vendedorNome` / `vendedorId`, com índice em
`vendedorId`), e `queryPedidosPorVendedor` em `comercial.ts` já o consome. O problema é de
**processo, não de schema**: hoje os pedidos são lançados no Odoo por uma pessoa que transcreve
o PDF do Mercos, e o nome do vendedor real vinha em branco. O cliente confirmou na reunião que
fará "uma alteração em lote" para preencher o vendedor "daqui para frente" e que o histórico
incompleto será tratado como está (premissa Parte I §1.3 item 3). Consequência para a UI:
pedidos sem vendedor caem no balde "Sem vendedor" (nunca somem do total), e o ranking mostra
esse balde explicitamente. Ver RN-3.9.

**DEP-3.4 , Atributo "linha" do produto [MUST para composição por linha e coluna "linha" da
tabela de produtos; degradação graciosa].** É a camada base B1 (§8.1). Hoje `FatoProduto` tem
`marcaNome`, `familiaNome`, `tipo`, mas **não tem `linha`**. Depende de o cliente criar o
atributo no Odoo e de B1 propagar o campo para `FatoProduto` (e, se necessário, para
`FatoPedidoItem`/`FatoNotaFiscalItem`, que hoje só carregam `marcaNome`/`familiaNome`). Sem o
atributo, a composição por linha e a coluna "linha" ficam no balde "Sem linha". A UI tolera
`linha` nula.

**DEP-3.5 , Segmento (tipo de cliente) materializado [CONDICIONAL, confiança baixa , investigar
antes de prometer].** Este é um gap sutil e de **alto risco**: pode não haver dado nenhum de
vínculo participante→segmento no cache. O `FatoParceiro` **não tem** campo `segmento`. Existe a
tabela `raw_sped_participante_segmento` (modelo `RawSpedParticipanteSegmento`, campo `data`
Json), mas há forte indício de que ela seja apenas o **catálogo de segmentos** (a lista de
nomes possíveis), sem o vínculo de qual segmento está atribuído a cada parceiro , tanto que o
próprio Agente Nex do projeto trata "segmento" como dimensão que **não existe / não está
cadastrada**. **Prova obrigatória ANTES de codar (regra Parte I "investigar até a certeza"),
sem ela nada de segmento é MUST:** (a) provar, com `SELECT` no cache real, que existe o segmento
**atribuído por parceiro** (uma coluna/relação participante→segmento populada), não só o
catálogo; (b) confirmar que o nome do segmento é o esperado pelo negócio (academia, condomínio,
hotel, estúdio, residência, time, pessoa física/jurídica). **Bifurcação:**
- Se a prova (a) **passar**: builder que materialize `segmentoNome` (e `segmentoId`) em
  `FatoParceiro` (ou `dim_segmento` + FK), espelhando `marcaNome` em `FatoProduto`; aí sim as
  RF de segmento sobem para MUST.
- Se a prova (a) **falhar** (só catálogo, sem atribuição por parceiro): segmento vira
  **dependência de PROCESSO do cliente** (cadastrar o segmento de cada parceiro no Odoo), no
  mesmo espírito de DEP-3.3, e **não** "só materializar". Enquanto o cliente não cadastrar, os
  eixos/filtros de "tipo de cliente" ficam desabilitados ou no balde "Sem segmento", e as RF
  ligadas a segmento permanecem [SHOULD]/condicionais (RF-3.2, RF-3.4, RF-3.16, RF-3.22).

**Atenção ao erro do protótipo (RN-3.2):** o mock da tela 07 mistura "Cliente novo/Cliente
recorrente/Pessoa física/Pessoa jurídica/Revenda" com "Academia/Condomínio" no mesmo eixo. O
cliente foi explícito: segmento é academia/condomínio/hotel/estúdio/etc., e "cliente
novo/recorrente" **não é segmento**. O eixo "tipo de cliente" usa apenas o segmento cadastrado.
Sem segmento resolvido, o parceiro cai em "Sem segmento".

**DEP-3.6 , Forma de pagamento: escolher a fonte confiável.** Há duas fontes: a parcela do
pedido (`FatoPedidoParcela.formaPagamentoNome`, ~76% preenchida) e o título financeiro
(`FatoFinanceiroTitulo.formaPagamentoNome`, 99,98% preenchida). A query existente
`queryFormasPagamento` (`vendas.ts`) **já usa o título** (decisão documentada no próprio
arquivo: a parcela deixava um balde "Não informado" de R$ 23 mi que era fonte errada, não
problema de negócio). Toda composição "por forma de pagamento" e o card "forma mais usada"
devem usar o título a receber; as métricas que dependem do **cronograma** de parcelas (PMR,
entrada, nº de parcelas) usam `FatoPedidoParcela`, que é onde vive o calendário de vencimentos.

**DEP-3.7 , Empresa/CNPJ emissor [MUST para composição por CNPJ e filtro de empresa].**
Resolvido: `FatoNotaFiscal.empresaId`/`empresaNome` e `FatoPedido.empresaId`/`empresaNome`
identificam a empresa emissora; `DimEmpresaGrupo` dá nome/CNPJ/UF. O helper
`buildEmpresaWhere(empresaId)` (importado de `@/lib/metrics/_shared/empresa`) já é usado nas
queries de vendas para filtrar por empresa. A composição por CNPJ agrupa por `empresaId`.

---

### 3.3 Requisitos funcionais

Identificadores `RF-3.x`, prioridade MoSCoW (Parte I §2.2). Agrupados por tela.

#### 3.3.a Painel de vendas (telas 07, 08, 09)

- **RF-3.1 [MUST]** Faixa de 6 indicadores principais (C1): valor vendido, pedidos fechados,
  produtos vendidos, ticket médio geral, margem média geral (bruta, ponderada) e meta atingida.
  Cada um com variação vs. período anterior (§6.2) e legenda com a base do cálculo. Meta
  atingida traz barra de progresso além do %.
- **RF-3.2 [MUST]** Composição e margem das vendas (C2) com **seletor único de ângulo** (§7.3)
  que troca os dados no mesmo espaço: **Linha, Marca, Forma de pagamento, Empresa emissora**. O
  ângulo **Tipo de cliente (segmento)** é **[SHOULD] condicional** à prova de DEP-3.5 (só vira
  MUST se existir segmento atribuído por parceiro; senão fica no balde "Sem segmento" ou oculto).
  Cada linha da composição traz valor vendido, % do total (barra) e margem média praticada da
  categoria.
- **RF-3.3 [MUST]** Produtos vendidos por item (C3): tabela com produto, linha, marca,
  quantidade vendida, valor vendido e % do faturamento. Busca textual (produto/linha/marca) e
  ordenação por coluna (ordenação inicial: maior quantidade vendida).
- **RF-3.4 [MUST]** Condições de pagamento (C5): cards de forma mais usada, PMR, entrada média
  em R$ e entrada média em %. A **quebra por tipo de cliente** (distribuição percentual das
  formas de pagamento por segmento, barras empilhadas) é **[SHOULD] condicional** à prova de
  DEP-3.5; sem segmento atribuído por parceiro, os cards permanecem (visão geral) e a barra
  empilhada por segmento fica indisponível/"Sem segmento".
- **RF-3.5 [SHOULD]** No bloco C5, exibir também o **% de pedidos com entrada × sem entrada**
  (o cliente citou explicitamente na reunião; sumiu do protótipo mas "é bom ter").
- **RF-3.6 [MUST]** Ranking de vendas por estado (C4 esquerdo): estado, valor vendido, % do
  total, pedidos, produtos vendidos, ticket médio, margem média praticada. Ordenável.
- **RF-3.7 [MUST]** Ranking de vendas e margem por vendedor (C4 direito): vendedor, valor
  vendido, % do total, pedidos, produtos vendidos, ticket médio, margem média praticada e meta
  atingida individual (pílula). Todos os números por vendedor saem da base de **pedido**
  (RN-3.17), pois a nota não tem vendedor. Ordenável (dropdown "Maior valor vendido" default).
- **RF-3.8 [MUST]** Curva ABC / Pareto de vendas (C6): cards de contagem por classe A/B/C, %
  do faturamento concentrado na classe A e produto de maior participação; gráfico de Pareto
  (barras de valor + linha de % acumulado com faixas 80% e 95%); tabela com produto, valor
  vendido, % do total, % acumulado e classe, filtrável por classe (Todos/A/B/C).
- **RF-3.9 [MUST]** Valor a faturar / pedidos em carteira: vendido ainda não faturado, em
  quantidade de máquinas, quantidade de pedidos e R$. (Card citado na reunião como "sumiu do
  protótipo, preciso colocar de volta".) O **R$** reusa a visão "carteira" de
  `queryFormasPagamento` (`ResumoVisaoPagamento`), mas **máquinas e nº de pedidos exigem
  agregação extra** (essa visão não os traz) e a base (título × pedido) e o tratamento de corte
  precisam ser fixados (M-3.12).
- **RF-3.10 [MUST]** Recorte por grupo de cliente: "chavinha" grupo × Smart × Aztec que
  restringe todos os números do painel ao conjunto de CNPJs daquele grupo (DEP-3.2).
- **RF-3.11 [MUST]** Busca por construtora: campo que, dado um nome de grupo/construtora,
  reúne todos os CNPJs/razões sociais mapeados e filtra o painel por eles (DEP-3.2).
- **RF-3.12 [MUST]** Filtro de período (pílula, §6.3) e de empresa/CNPJ (§6.4) valendo para
  todo o painel. Toda leitura respeita o corte de dados (§6.1).
- **RF-3.13 [COULD]** Seletor de tipo de gráfico na composição (pizza/rosca padrão, barra
  opcional), conforme §7.3. O protótipo usa tabela com barras; a evolução para rosca é opcional.

#### 3.3.b Comparativos estado A × B (telas 10, 11)

- **RF-3.14 [MUST]** Seleção de **dois recortes** (A e B) com **períodos independentes**: campo
  "Comparar por" (Estado nesta fase), "Comparativo A" + "Período A", "Comparativo B" + "Período
  B". Cada período é uma pílula/seleção própria (o protótipo mostra "Janeiro/2026" nos dois,
  mas eles são independentes).
- **RF-3.15 [MUST]** Indicadores espelhados A e B, lado a lado, cada um com a **variação
  relativa vs. o outro** (verde = A melhor que B naquele quesito; §6.2): valor vendido,
  pedidos, ticket médio, itens vendidos, média de itens por pedido, margem média e prazo médio
  praticado (prazo de entrega, não PMR; ver RN-3.6).
- **RF-3.16 [MUST]** Composição espelhada por marca, com valor, % do total e a variação de cada
  categoria vs. o outro recorte. Categoria presente em um recorte e ausente no outro é marcada
  "Sem equivalente" (RN-3.10). A composição espelhada **por tipo de cliente (segmento)** é
  **[SHOULD] condicional** à prova de DEP-3.5.
- **RF-3.17 [MUST]** Ranking de vendedores por recorte (só os vendedores que venderam naquele
  estado): vendedor, valor vendido, % do total, pedidos, margem média.
- **RF-3.18 [MUST]** Itens vendidos por recorte: produto, quantidade, valor vendido, % do
  total, com variação e "Sem equivalente".
- **RF-3.19 [MUST]** Condições de pagamento do recorte, espelhadas: prazo médio de parcelas
  geral (nº médio de parcelas), PMR geral, composição do faturamento por forma de pagamento,
  tabela detalhada por forma de pagamento (qtde de pedidos, qtde média de parcelas, % média de
  entrada, PMR) e composição das formas de pagamento por tipo de cliente.
- **RF-3.20 [SHOULD]** Cada composição de comparativo mostra a variação em p.p. da participação
  (o protótipo mostra, ex.: "+27,7 p.p." ao lado do % do total).

#### 3.3.c Comparação geral de estados (tela 12)

- **RF-3.21 [MUST]** Tabela mestre com todas as UFs que tiveram venda no recorte: UF, nº de
  vendedores, faturamento, margem, PMR, % da receita geral, ticket médio e nº de pedidos.
  Ordenável por qualquer coluna (dropdowns "Ordenar por" + "Direção").
- **RF-3.22 [MUST]** Faixa de filtros: período, linha, marca, vendedor e forma de pagamento
  (todos "Todos" por padrão), afetando toda a tabela e os cards. O filtro **tipo de cliente
  (segmento)** é **[SHOULD] condicional** à prova de DEP-3.5; sem segmento atribuído por parceiro,
  o dropdown fica indisponível (não filtra nada).
- **RF-3.23 [MUST]** Cards de destaque: faturamento total (com nº de UFs com venda), estado com
  maior faturamento, estado com maior margem, estado com maior ticket médio, estado com menor
  prazo médio (PMR) e total de pedidos.
- **RF-3.24 [SHOULD]** "Clique para comparar" em cada linha de UF: leva à tela de Comparativos
  (10/11) com aquela UF pré-selecionada no lado A.

---

### 3.4 Métricas e fórmulas

Toda métrica de receita usa **faturamento = nota fiscal emitida** (§6.5, RN-3.3). Custo, quando
citado, é o custo de catálogo (`FatoProduto.precoCusto`), pois não há COGS por lote no cache
(margem é **estimada**; ver RN-3.4). Todos os recortes respeitam o corte de dados (§6.1) e os
filtros de período/empresa/UF/grupo.

**M-3.1 , Valor vendido (faturamento).** Soma de `vrNf` das notas de saída externas do
período (por `dataEmissao`). Fonte: `FatoNotaFiscal` com `isVendaExterna = true`. Já
implementado em `queryIndicadoresVendas.faturamento`.

```
valorVendido = Σ nota.vrNf,  nota ∈ FatoNotaFiscal, isVendaExterna=true, dataEmissao ∈ janela
```

**M-3.2 , Pedidos fechados.** Contagem de pedidos de venda do período. Base:
`FatoPedido` com `categoriaOperacao = 'venda'`, por `dataOrcamento`. Já implementado
(`queryIndicadoresVendas.numPedidos`). **Refinamento (RN-3.7):** o rótulo do protótipo é
"pedidos comerciais concluídos". Se "fechado/concluído" exigir etapa que finaliza, filtrar
`etapaFinaliza = true`; hoje `queryIndicadoresVendas` conta todos os pedidos de venda no
período. Decidir a definição de "fechado" com o cliente e aplicar de forma única.

**M-3.3 , Produtos vendidos (unidades).** Soma de `quantidade` dos itens das notas de saída
externas do período. Fonte: `FatoNotaFiscalItem.quantidade` filtrado pelos `documentoId` das
notas de M-3.1. (`queryMargemEstimada` já carrega `quantidade`; extrair o total.) **Recorte por
vendedor (RN-3.17):** como a nota não tem vendedor, o total de unidades por vendedor vem dos
**itens de pedido** (Σ `FatoPedidoItem.quantidade` dos pedidos daquele vendedor), não dos itens
de nota. Só o total geral e os recortes com dimensão presente na nota (marca, linha, estado do
cliente, empresa emissora) usam `FatoNotaFiscalItem`.

```
produtosVendidos = Σ item.quantidade,  item.documentoId ∈ idsNotasVendaExterna(janela)
```

**M-3.4 , Ticket médio.** `valorVendido ÷ pedidosFechados`. Já implementado
(`queryIndicadoresVendas.ticketMedio`). Por vendedor/estado, o ticket é o valor vendido daquele
recorte dividido pelos pedidos daquele recorte.

**M-3.5 , Margem bruta ponderada (margem média praticada).** A margem geral e a margem por
categoria são **ponderadas pelo valor**, não a média aritmética das margens de cada pedido.
Fórmula:

```
receita   = Σ item.vrProdutos                       (itens de NF de saída externa do recorte)
custoEst  = Σ (produto.precoCusto × item.quantidade)
margemR$  = receita − custoEst
margemPct = margemR$ ÷ receita × 100                 (0 se receita = 0)
```

Ponderar pelo valor cai naturalmente da fórmula: somam-se receitas e custos de todos os itens
do grupo antes de dividir, então categorias/pedidos maiores pesam mais. Já implementado para o
período inteiro em `queryMargemEstimada` (retorna `receita`, `custoEstimado`, `margem`,
`margemPct`). **Extensão necessária:** calcular a mesma fórmula **por categoria** (marca, linha,
segmento, forma de pagamento, empresa emissora, estado) para a coluna "margem média praticada".
Rótulo obrigatório "estimada" onde couber (o protótipo diz "margem média praticada"; manter o
aviso de que é margem sobre custo de catálogo).

**Margem por vendedor usa base de PEDIDO, não de nota (RN-3.17).** A nota fiscal não carrega
vendedor (`FatoNotaFiscal` não tem `vendedorId`), então a margem por vendedor não pode sair dos
itens de nota. Ela sai dos **itens de pedido** do recorte: receita = Σ `FatoPedidoItem.vrProdutos`
e custo = Σ `FatoPedidoItem.vrCusto` (ou `FatoProduto.precoCusto × FatoPedidoItem.quantidade`
quando `vrCusto` faltar), agregados pelo `FatoPedido.vendedorNome`/`vendedorId` dos pedidos de
venda daquele vendedor, como já faz `queryPedidosPorVendedor` (que agrega `vrProdutos` do
pedido). Consequência: o total do ranking de vendedor bate com o **subtotal de pedidos** do
recorte, não com o card de faturamento (nota) (ver CA-3.5).

**M-3.6 , Meta atingida.** `valorVendido no mês ÷ metaMensal × 100`. Meta de DEP-3.1. A
variação do card é em p.p. vs. o mês anterior (protótipo: "+9,2 p.p."). Sem meta cadastrada,
"Sem meta definida". Meta individual do vendedor (coluna "meta atingida" do ranking C4) usa a
meta por vendedor, isto é, a linha de `meta_venda_mensal` com `vendedorId` preenchido para o mês
(campo adicionado ao modelo por DEP-3.1); nesse caso o numerador é o **valor vendido do vendedor
por base de pedido** (RN-3.17), não o faturamento por nota. Se não houver meta com `vendedorId`
para o vendedor no mês (só meta de grupo/empresa cadastrada), a coluna fica "Sem meta".

**M-3.7 , PMR (Prazo Médio de Recebimento).** Métrica de dois níveis, conforme a reunião
("média das médias") e o glossário (§3). Base: `FatoPedidoParcela` (calendário de vencimentos),
junto ao pedido pai para a data-base.

- **PMR do pedido** = média **ponderada pelo valor de cada parcela** dos prazos das parcelas,
  onde o prazo de uma parcela é `dias(parcela.dataVencimento − dataBasePedido)`. A data-base do
  pedido é a data do documento, `COALESCE(dataOrcamento, dataAprovacao)` (mesma expressão no
  pseudo-SQL de Q-3.4). Parcela com `dataVencimento` nula **fica de fora da média** (não dá para
  medir o prazo) e a legenda do card avisa a cobertura (quantas parcelas/pedidos entraram no
  cálculo). Quando as parcelas têm valor igual, a ponderação reduz-se à média simples,
  reproduzindo o exemplo do cliente (parcelas em 30/60/90 dias → PMR 60 dias).

  ```
  PMR_pedido = Σ (prazoDias_i × valor_i) ÷ Σ valor_i
  prazoDias_i = (parcela_i.dataVencimento − dataBasePedido) em dias, piso 0
  ```

- **PMR geral** = média dos PMRs dos pedidos ("média das médias"). O protótipo rotula o card
  como "ponderado pelo valor vendido" (C5 e comparativos): há uma divergência entre a reunião
  (média simples das médias) e o protótipo (ponderado pelo valor do pedido). **Resolver com o
  cliente e aplicar de forma única (RN-3.5).** Recomenda-se implementar as duas agregações atrás
  de uma flag e default no que o cliente confirmar; documentar a escolha em `docs/kpis-diretoria.md`.

  ```
  PMR_geral_simples    = média( PMR_pedido )                          (média das médias)
  PMR_geral_ponderado  = Σ (PMR_pedido × valorPedido) ÷ Σ valorPedido (ponderado pelo valor)
  ```

**M-3.8 , Prazo médio praticado (prazo de entrega).** Diferente do PMR: é o prazo de **entrega**
que o vendedor colocou no pedido, não o de recebimento. Aparece nos indicadores dos comparativos
(protótipo tela 10: "Prazo médio praticado 19,4 dias"). Fonte candidata:
`dias(FatoPedido.dataPrevista − FatoPedido.dataOrcamento)`, média sobre os pedidos do recorte
(confirmar contra o dado real qual campo representa a promessa de entrega; `dataPrevista` é o
candidato natural). Piso 0; pedidos sem data prevista ficam fora da média (e a legenda avisa a
cobertura). Ver RN-3.6.

**M-3.9 , Nº médio de parcelas.** `Σ parcelas do recorte ÷ nº de pedidos com parcela`. Aparece
nos comparativos ("3,5 parcelas", "7,5 parcelas"). Fonte: contagem de `FatoPedidoParcela` por
pedido.

**M-3.10 , Entrada média.** "Entrada" é a parcela paga no ato (prazo 0). Como não há flag
explícita de entrada, a regra operacional (a confirmar contra o dado, RN-3.8): a entrada de um
pedido é a soma das parcelas cujo prazo relativo é 0 dias (`dataVencimento ≤ dataBasePedido`);
se nenhuma parcela tem prazo 0, o pedido é "sem entrada". Duas métricas:

```
entradaPct_pedido = valorEntrada_pedido ÷ valorTotalPedido × 100      (só p/ pedidos com entrada)
entradaMediaPct   = média( entradaPct_pedido )                        (pedidos com entrada)
entradaMediaR$    = média( valorEntrada_pedido )                      (pedidos com entrada)
pctPedidosComEntrada = nº pedidos com entrada ÷ nº pedidos × 100
```

O protótipo (tela 08) mostra "Entrada média geral R$ 43.346" e "Entrada média % geral 46,7%",
ambas restritas aos pedidos que tiveram entrada, como o cliente descreveu.

**M-3.11 , Curva ABC / Pareto.** Classificação de produtos por concentração do valor vendido.
Algoritmo:

```
1. Para cada produto, valorProduto = Σ item.vrProdutos (itens de NF de saída externa do recorte).
2. Ordenar produtos por valorProduto desc.
3. faturamentoTotal = Σ valorProduto.
4. Acumular: pctAcum_k = (Σ_{i=1..k} valorProduto_i) ÷ faturamentoTotal × 100.
5. Classe de cada produto pelo pctAcum **ANTERIOR** ao item (acumulado dos itens ANTES dele,
   `pctAcumAnterior_k = pctAcum_{k-1}`, sendo `pctAcum_0 = 0`):
     - Classe A: pctAcumAnterior < 80%   (inclui o item que CRUZA os 80%; o 1º item é sempre A)
     - Classe B: 80% ≤ pctAcumAnterior < 95%
     - Classe C: pctAcumAnterior ≥ 95%
6. Cards: contagem por classe; % do faturamento da classe A; produto de maior participação.
```

Regra de borda (evita classe A vazia): a classe é decidida pelo acumulado **anterior** ao item,
não pelo acumulado que o inclui. Assim o item que **cruza** os 80% ainda entra em A, e o 1º item
é sempre A mesmo quando um único produto domina o faturamento (>80%). Sem essa convenção, usar o
`pctAcum` inclusivo deixaria a classe A vazia nesse caso (o único produto já passa de 80%).
Faixas 80/95 são fixas nesta entrega (o cliente disse que o "95+" é "só marcação de
gráfico", não regra de negócio crítica); um campo para parametrizar o corte (10/20/30...) é
**[COULD]** (o cliente mencionou "aquele campo de preencher a curva"). O gráfico (§7.3, tipo
Pareto) traça barras de `valorProduto` (desc) e a linha de `pctAcum`, com linhas de referência
tracejadas em 80% e 95%.

**M-3.12 , Valor a faturar (carteira).** Vendido cujo faturamento (nota) ainda não saiu. O valor
em R$ já vem da visão `carteira` de `queryFormasPagamento` (`ResumoVisaoPagamento`), **mas é
preciso saber de onde ele deriva:** essa visão soma **títulos a receber** (`FatoFinanceiroTitulo`,
`tipo='a_receber'`) clampados ao corte por `dataDocumento`, não "pedidos fechados sem nota".
Duas decisões a fixar (confirmar contra o dado real e documentar em `docs/kpis-diretoria.md`):
- **Base da carteira: título × pedido.** Se a diretoria quer "pedido fechado sem nota", a base
  natural é o **pedido** (`FatoPedido` por etapa/`etapaFinaliza` ou `bucketDemanda`), não o
  título. Se "a receber ainda não faturado", a base é o **título**. Escolher uma e usar de forma
  única; não somar as duas.
- **Corte para backlog antigo.** Carteira costuma incluir pedido/título antigo que ainda pende;
  se o clamp por `dataDocumento` ao corte esconder esse backlog, avaliar a **exceção de corte**
  como já se faz na demanda (§6.1), para a carteira não "sumir" com o histórico anterior ao corte.
- **Máquinas (quantidade).** `ResumoVisaoPagamento` **não traz** quantidade de itens nem contagem
  de pedidos. Para o card RF-3.9 (máquinas, pedidos, R$), Q-3.10 precisa de **agregação extra**:
  as máquinas vêm dos itens dos pedidos em carteira, via `FatoFinanceiroTitulo.pedidoId →
  FatoPedidoItem.quantidade` (ou direto de `FatoPedido`/`FatoPedidoItem` se a base for pedido),
  e a contagem de pedidos é o distinct de `pedidoId`.

**M-3.13 , Participação (% do total).** Em toda tabela/composição: `valorCategoria ÷
valorGeralDoRecorte × 100`. Já implementado no padrão das queries de `vendas.ts` (retornam
`valorGeral` junto das linhas).

---

### 3.5 Especificação da tela , Painel de vendas (07/08/09)

Layout de cima para baixo, na ordem dos protótipos. Cabeçalho comum: seletor de modo (3 abas) +
pílula de período + filtro de empresa/CNPJ + a "chavinha" grupo/Smart/Aztec + busca por
construtora. Todo card exibe frescor do dado (§6.6).

**C1 , Indicadores principais (tela 07, topo).** Seis cards de KPI (§7.1). Legenda "Vendas
fechadas do período" no canto. Cada card: rótulo (uppercase), valor mono/tabular, variação
vs. período anterior (verde/vermelho + %/p.p.) e legenda da base.

| Card | Valor (demo) | Base / legenda | Métrica |
|---|---|---|---|
| Valor vendido | R$ 927.510 | total de vendas fechadas | M-3.1 |
| Pedidos fechados | 10 | pedidos comerciais concluídos | M-3.2 |
| Produtos vendidos | 149 | unidades vendidas no período | M-3.3 |
| Ticket médio geral | R$ 92.751 | valor médio por pedido fechado | M-3.4 |
| Margem média geral | 37% | ponderada pelo valor vendido | M-3.5 |
| Meta atingida | 48,8% da meta | R$ 927.510 de 1.900.000 (+ barra) | M-3.6 |

**C2 , Composição e margem das vendas (tela 07).** Bloco com seletor de ângulo (§7.3): pílulas
**Linha · Marca · Tipo de cliente · Forma de pagamento · Empresa emissora**. A troca de pílula
recalcula a tabela no mesmo espaço. Colunas: **Categoria · Valor vendido · % do total (barra) ·
Margem média praticada**. Ordenação por valor desc. Cada ângulo:

- **Linha:** agrupa por `FatoProduto.linha` (DEP-3.4). Balde "Sem linha" enquanto o atributo não
  vier. (Q-3.2, extensão de `queryVendasPorMarca` trocando a chave.)
- **Marca:** `queryVendasPorMarca` (já existe). Balde "Sem marca".
- **Tipo de cliente (segmento):** agrupa por `segmentoNome` do cliente (DEP-3.5), via
  `participanteId → FatoParceiro.segmentoNome`. Balde "Sem segmento". **Não** usar
  novo/recorrente (RN-3.2).
- **Forma de pagamento:** usa o título financeiro (DEP-3.6), reusando a lógica de
  `queryFormasPagamento` (visão que reflete o faturamento). Balde residual mínimo (99,98%
  preenchido).
- **Empresa emissora (CNPJ emissor):** agrupa por `empresaId` (nota/pedido) →
  `DimEmpresaGrupo.nome`/`cnpj`. É a empresa **que emitiu** a nota, não o CNPJ do cliente; não
  confundir com o recorte por grupo de CLIENTE (grupo/Smart/Aztec/construtora, RF-3.10/3.11),
  que agrupa por `participanteId`/`documentoDigits` do comprador.

Cada linha traz a margem média praticada da categoria (M-3.5 aplicada só aos itens daquela
categoria). Participação por valor (§7.3).

**C3 , Produtos vendidos por item (tela 07, base).** Busca ("Buscar produto, linha ou marca...")
+ dropdown de ordenação (default "Maior quantidade vendida"). Colunas: **Produto · Linha · Marca
· Quantidade vendida · Valor vendido · % do total (barra)**. Uma linha por produto, somando os
itens de NF de saída externa do recorte. Ordenação por qualquer coluna (§7.2). (Q-3.3.)

**C5 , Condições de pagamento por tipo de cliente (telas 07 base / 08 topo).** Quatro cards +
um gráfico:

- **Forma mais usada:** a forma de pagamento com mais pedidos fechados, com "% dos pedidos
  fechados" e variação p.p. (fonte: título, DEP-3.6). Demo: "Boleto · 20% dos pedidos".
- **Prazo médio de recebimento (PMR):** M-3.7, com a legenda da agregação escolhida (RN-3.5).
  Demo: "47 dias".
- **Entrada média geral (R$):** M-3.10, "entrada média por pedido". Demo: "R$ 43.346".
- **Entrada média % geral:** M-3.10, "do valor total do pedido". Demo: "46,7%".
- **[SHOULD] % de pedidos com/sem entrada** (RF-3.5), no lugar ou ao lado dos cards de entrada.
- **Distribuição percentual das formas de pagamento por tipo de cliente:** uma barra empilhada
  100% por segmento (Academia, Condomínio, ...), cada fatia uma forma de pagamento, com legenda
  (Cartão de crédito, PIX, À vista, Boleto, Cheque, Cartão de débito, Financiamento). Para cada
  segmento, `% = pedidos do segmento fechados com a forma ÷ pedidos do segmento`. (Q-3.5.)

**C4 , Rankings (tela 08/09).** Dois blocos lado a lado:

- **Ranking de vendas por estado:** Estado · Valor vendido · % do total (barra) · Pedidos ·
  Produtos vendidos · Ticket médio · Margem média praticada. Base: `queryVendasPorUf` estendida
  com pedidos/ticket/margem por UF. Ordenável. Respeita UF-scoping.
- **Ranking de vendas e margem por vendedor:** Vendedor · Valor vendido · % do total · Pedidos ·
  Produtos vendidos · Ticket médio · Margem média praticada · Meta atingida (pílula). Base de
  **PEDIDO**, não de nota (RN-3.17): valor vendido = Σ `FatoPedido.vrProdutos`, unidades = Σ
  `FatoPedidoItem.quantidade`, margem sobre `FatoPedidoItem.vrCusto`, via
  `queryPedidosPorVendedor` (`comercial.ts`) estendida com margem/ticket/meta. O "% do total"
  é sobre o total de pedidos do recorte (não sobre o faturamento por nota). Dropdown de
  ordenação. Balde "Sem vendedor" (DEP-3.3, RN-3.9).

**C6 , Curva ABC de vendas (tela 09).** Cinco cards (Produtos classe A/B/C, % faturamento classe
A, maior participação) + gráfico de Pareto (barras de valor desc + linha de % acumulado, faixas
80/95 tracejadas) + tabela filtrável (Todos/A/B/C, dropdown de ordenação): Produto · Valor
vendido · % do total · % acumulado · Classe ABC (badge A/B/C). Métrica M-3.11. (Q-3.6.)

**Card de carteira (RF-3.9).** Onde a reunião pediu ("quanto foi vendido e ainda não faturou"):
um card/bloco com valor a faturar em máquinas, pedidos e R$ (M-3.12), reusando a visão
`carteira` de `queryFormasPagamento`.

**Recorte grupo/Smart/Aztec e busca por construtora (RF-3.10/3.11).** Controles no cabeçalho.
Ao selecionar um grupo, todas as queries do painel recebem o conjunto de `participanteId`
(ou `documentoDigits`) daquele grupo (DEP-3.2) e passam a filtrar por ele. A busca por
construtora é um autocomplete sobre `cliente_grupo.grupoNome`; ao escolher, o painel filtra
pelos CNPJs mapeados. Sem mapeamento cadastrado, controles desabilitados com dica.

---

### 3.6 Especificação da tela , Comparativos estado A × B (10/11)

Tela **nova** (não existe hoje). Modo "Comparativos".

**Cabeçalho de seleção (tela 10, topo).** Cinco controles em linha:

1. **Comparar por:** dropdown com "Estado" (única opção nesta fase; arquitetar para aceitar
   futuramente vendedor, CNPJ, etc.).
2. **Comparativo A:** dropdown de UF (lista das UFs com venda no corte).
3. **Período A:** seletor de período independente (mês/personalizado), clampado ao corte.
4. **Comparativo B:** dropdown de UF.
5. **Período B:** seletor de período independente.

**Dois painéis espelhados (A à esquerda, B à direita).** Cada painel tem título "Comparativo A
, SP" com badge do tipo ("ESTADO") e subtítulo "Estado · Janeiro/2026 · N pedido(s)".

**Indicadores espelhados (RF-3.15).** Cada painel: Valor vendido · Pedidos · Ticket médio ·
Itens vendidos · Média de itens/pedido · Margem média · Prazo médio praticado. Sob cada valor, a
variação **relativa ao outro recorte** ("+12% vs MG", "-10,7% vs SP"), verde quando A é melhor
naquele quesito (§6.2). Atenção: a comparação é entre A e B (não vs. período anterior). "Média de
itens/pedido" = produtos vendidos ÷ pedidos do recorte. "Prazo médio praticado" = M-3.8 (entrega,
não PMR).

**Composições espelhadas (RF-3.16).** Composição por marca e por tipo de cliente, cada uma com
Marca/Segmento · Valor vendido (com variação) · % do total (barra) + variação em p.p. da
participação. Categoria presente em A e ausente em B (ou vice-versa) mostra "Sem equivalente" no
lugar da variação (RN-3.10).

**Ranking de vendedores (RF-3.17).** Por painel: Vendedor · Valor vendido · % do total · Pedidos
· Margem média, só os vendedores que venderam naquele estado.

**Itens vendidos (RF-3.18).** Por painel: Produto · Quantidade (com variação) · Valor vendido ·
% do total. "Sem equivalente" para itens sem par no outro recorte.

**Condições de pagamento do estado (RF-3.19, tela 11).** Por painel:

- Cards: **Prazo médio de parcelas geral** (M-3.9, "3,5 parcelas") e **PMR geral** (M-3.7, "19
  dias"), cada um com variação vs. o outro recorte.
- **Composição do faturamento por forma de pagamento:** Forma · Valor vendido · % do faturamento
  do estado.
- **Tabela detalhada por forma de pagamento:** Forma · Qtde de pedidos · Qtde média de parcelas
  · % média de entrada · PMR.
- **Composição das formas de pagamento por tipo de cliente:** Tipo de cliente · Forma de
  pagamento · Valor vendido · % dentro do tipo de cliente · % do faturamento do estado.

**Implementação.** As duas colunas chamam **a mesma família de queries** do painel (3.5), cada
uma com seu próprio `FiltrosVendas` (uma UF em `ufs`, seu período em `periodoDe/periodoAte`).
A camada de comparação (variação relativa e "sem equivalente") é montada no servidor/componente
alinhando as chaves de A e B. Reusar `calcularDeltaKpi` de
`src/lib/reports/builder/janela-anterior.ts` para o sinal/cor do delta, passando B como
"anterior" de A.

---

### 3.7 Especificação da tela , Comparação geral de estados (12)

Tela **nova**. Modo "Comparação Geral de Estados". Visão panorâmica: uma linha por UF.

**Faixa de filtros (RF-3.22).** Seis dropdowns (todos default "Todos/Todas"): Período · Linha ·
Marca · Tipo de cliente · Vendedor · Forma de pagamento. Mais dois de ordenação: "Ordenar por"
(Faturamento default) e "Direção" (Maior para menor). Todo filtro afeta a tabela e os cards.

**Cards de destaque (RF-3.23).** Seis cards derivados da tabela:

| Card | Conteúdo (demo) | Derivação |
|---|---|---|
| Faturamento total | R$ 1.275.940 (9 UFs com venda) | Σ faturamento das UFs |
| Estado com maior faturamento | MG · R$ 280.010 (21,9% da receita) | argmax faturamento |
| Estado com maior margem | BA · 38,6% | argmax margem ponderada |
| Estado com maior ticket médio | RJ · R$ 134.400 | argmax ticket |
| Menor prazo médio | ES · 10 dias | argmin PMR |
| Total de pedidos | 15 | Σ pedidos únicos no recorte |

**Tabela principal , Performance comercial por UF (RF-3.21).** Colunas: **UF · Nº de vendedores
· Faturamento (barra) · Margem (barra) · Prazo médio de recebimento · % da receita geral (barra)
· Ticket médio (barra) · Nº de pedidos**. Uma linha por UF com venda no recorte. Ordenável por
qualquer coluna (via os dropdowns e/ou clique no cabeçalho, §7.2). Sob a sigla da UF, o texto
"Clique para comparar" (RF-3.24) navega para a tela 10 com aquela UF no lado A.

- **Nº de vendedores** = distintos `vendedorId` com venda naquela UF no recorte.
- **PMR por UF** = M-3.7 restrito aos pedidos daquela UF.
- **% da receita geral** = faturamento da UF ÷ faturamento total do recorte.

**Implementação.** Uma query dedicada (Q-3.7) que agrega por UF em uma passada, reusando as
resoluções de UF do cliente (`FatoParceiro.uf` via `participanteId`, com `siglaDeUf`) já feitas
em `queryVendasPorUf`.

---

### 3.8 Regras de negócio e edge cases

- **RN-3.1 , Faturamento é venda externa, não intragrupo.** Usar sempre
  `FatoNotaFiscal.isVendaExterna = true` (constante `SO_VENDA_NOTA` em `vendas.ts`) e, para
  pedidos, `categoriaOperacao = 'venda'` (`SO_VENDA_PEDIDO`). O filtro antigo por natureza/CFOP
  "%venda%" inflava ~74% (R$ 167,6M vs R$ 96,2M reais) por incluir transferências entre empresas
  do grupo. Nunca reintroduzir esse filtro.
- **RN-3.2 , Segmento ≠ novo/recorrente.** Tipo de cliente é o **segmento** (academia,
  condomínio, hotel, estúdio, residência, time, pessoa física/jurídica). "Cliente novo/cliente
  recorrente" **não** é segmento e não entra no eixo "tipo de cliente" (o protótipo os mistura;
  é erro de mock). Se houver demanda por novo/recorrente, é outro eixo, fora desta fase.
- **RN-3.3 , Faturamento = nota emitida.** Receita só é reconhecida na nota fiscal emitida, não
  no pedido colocado. Pedido fechado sem nota é **carteira** (M-3.12), não faturamento.
- **RN-3.4 , Margem é estimada.** Sem COGS por lote no cache, a margem usa custo de catálogo
  (`FatoProduto.precoCusto × quantidade`). Rotular "estimada"/"praticada" e nunca vender como
  margem contábil exata. É margem **bruta** (faturado − custo), nunca líquida nesta fase.
- **RN-3.5 , PMR: fixar a agregação geral.** Reunião diz "média das médias" (simples); protótipo
  diz "ponderado pelo valor vendido". Divergência a resolver com o cliente; implementar as duas
  atrás de flag, default no confirmado, documentar em `docs/kpis-diretoria.md`. O PMR **do
  pedido** é a média ponderada dos prazos das parcelas pelo valor de cada parcela.
- **RN-3.6 , PMR ≠ prazo médio praticado.** PMR é prazo de **recebimento** (parcelas, dias até
  receber). "Prazo médio praticado" é prazo de **entrega** que o vendedor pôs no pedido. São
  cards diferentes; nunca confundir a fonte (`FatoPedidoParcela` vs. `FatoPedido.dataPrevista`).
- **RN-3.7 , "Pedido fechado" precisa de definição única.** Se "fechado/concluído" exige etapa
  que finaliza (`etapaFinaliza = true`), aplicar em M-3.2 e em todo card que conta "pedidos
  fechados". Não deixar duas definições no mesmo painel.
- **RN-3.8 , Entrada = parcela de prazo 0.** Sem flag explícita, entrada é a(s) parcela(s) cujo
  vencimento é ≤ data-base do pedido (prazo 0). Confirmar contra o dado real se essa heurística
  bate com o "entrada" do negócio antes de cravar. Pedido sem parcela de prazo 0 é "sem entrada".
- **RN-3.9 , Vendedor incompleto tratado daqui pra frente.** Pedidos sem `vendedorNome` caem no
  balde "Sem vendedor" (nunca somem do total nem do faturamento). Não há reprocessamento
  retroativo (premissa Parte I §1.3). O ranking de vendedor mostra "Sem vendedor" como linha
  quando houver valor sem atribuição, para o número bater com o total do painel.
- **RN-3.10 , "Sem equivalente" nos comparativos.** Nos comparativos A × B, categoria/produto/
  vendedor presente em um recorte e ausente no outro exibe "Sem equivalente" no lugar da
  variação (não "0%", que implicaria comparação real). Regra visível nos protótipos 10/11.
- **RN-3.11 , Recorte por grupo/Smart/Aztec.** O recorte é por **conjunto de CNPJs do cliente**
  (não do emissor): filtra os pedidos/notas cujo `participanteId` pertence ao grupo mapeado em
  `cliente_grupo` (DEP-3.2). "Tirar a Smart da conta" = excluir os `participanteId` do grupo
  Smart. A "chavinha" é aditiva/exclusiva conforme o cliente definir (na reunião: selecionar a
  caixinha inclui só aquele grupo; a necessidade também inclui "tudo menos cliente X").
- **RN-3.12 , Construtora agrupa múltiplos CNPJs.** Uma construtora tem várias razões sociais/
  CNPJs; a busca por nome reúne todos os `participanteId`/`documentoDigits` mapeados sob o mesmo
  `grupoNome` e filtra por eles. É o mesmo mecanismo do RN-3.11, acionado por busca textual.
- **RN-3.13 , Corte de dados em toda leitura.** Toda query de histórico clampa a janela ao corte
  (§6.1) via `janelaClampada`/`periodoWhere`. Sem período informado, o piso é o corte, nunca o
  histórico inteiro (regra já implementada em `periodoWhere` de `vendas.ts` e em `comercial.ts`).
- **RN-3.14 , UF do cliente, normalizada.** A UF vem de `FatoParceiro.uf`, que guarda o **nome**
  do estado ("São Paulo (BR)"); normalizar para sigla com `siglaDeUf` (já feito em
  `queryVendasPorUf`). Nota sem UF resolvida cai em "??" (mostrar "Sem UF").
- **RN-3.15 , Forma de pagamento pela fonte confiável.** Composição/forma mais usada usam o
  título (`FatoFinanceiroTitulo`, 99,98%), não a parcela (DEP-3.6). PMR/entrada/nº de parcelas
  usam a parcela (calendário). Não trocar as fontes.
- **RN-3.16 , Vazio ≠ erro.** Recorte sem venda (ex.: UF sem pedido no período) mostra estado
  vazio acionável (§7.5), não tela em branco nem "0" mudo.
- **RN-3.17 , Recorte por vendedor usa base de PEDIDO.** A nota fiscal não tem vendedor
  (`FatoNotaFiscal` sem `vendedorId`), então todo número por vendedor (valor vendido, unidades,
  margem, ticket, meta individual) vem do **pedido**: `FatoPedido.vrProdutos`,
  `FatoPedidoItem.quantidade`/`vrCusto`, agregados por `FatoPedido.vendedorNome`/`vendedorId`
  (como `queryPedidosPorVendedor`). Por isso o total do ranking de vendedor bate com o subtotal
  de pedidos do recorte, e não com o card de faturamento (nota). Faturamento, curva ABC,
  composição por marca/linha/estado e produtos vendidos (visão geral) continuam por nota
  (RN-3.3). Não misturar as duas bases numa mesma soma.

---

### 3.9 Consultas (queries)

Convenção do arquivo (herdada de `vendas.ts`): `async function query...(prisma, filtros)`,
agrega em memória, retorna linhas ordenadas; `FiltrosVendas = { periodoDe?, periodoAte?, ufs?,
empresaId? }`. **Estender** `FiltrosVendas` com `grupoParticipanteIds?: number[]` (recorte grupo/
construtora, DEP-3.2) e `linha?`/`marca?`/`segmento?`/`vendedorId?`/`formaPagamento?` (filtros da
comparação geral). Todas as queries novas ficam em `src/lib/diretoria/queries/vendas.ts`
(mesmo arquivo, para não tocar compartilhados), reusando helpers de `comercial.ts` quando útil.
Pseudo-SQL ilustrativo (a implementação real é Prisma + agregação em memória, como o arquivo já
faz).

**Q-3.1 , queryIndicadoresVendas (estender , JÁ EXISTE).** Adicionar `produtosVendidos` (M-3.3),
`margemPct` (M-3.5, hoje separada em `queryMargemEstimada`) e `metaAtingida` (M-3.6) ao retorno,
para alimentar os 6 cards de C1 num payload só.

```ts
export async function queryIndicadoresVendas(
  prisma: PrismaClient, filtros: FiltrosVendas,
): Promise<IndicadoresVendas>  // { faturamento, numPedidos, ticketMedio, produtosVendidos, margemPct, meta? }
```
```sql
-- faturamento
SELECT sum(vr_nf) FROM fato_nota_fiscal
 WHERE is_venda_externa AND data_emissao >= :corteOuDe AND data_emissao < :ate
   AND (:empresaId IS NULL OR empresa_id = :empresaId);
-- produtos vendidos (unidades)
SELECT sum(i.quantidade) FROM fato_nota_fiscal_item i
 JOIN fato_nota_fiscal n ON n.odoo_id = i.documento_id
 WHERE n.is_venda_externa AND n.data_emissao >= :de AND n.data_emissao < :ate;
-- pedidos fechados
SELECT count(*) FROM fato_pedido
 WHERE categoria_operacao = 'venda' AND data_orcamento >= :de AND data_orcamento < :ate
   AND (:soFechados IS FALSE OR etapa_finaliza);   -- RN-3.7
```
Arquivo: `src/lib/diretoria/queries/vendas.ts`.

**Q-3.2 , queryComposicaoVendas (nova, generaliza `queryVendasPorMarca`).** Um só ponto de
entrada que recebe o ângulo e devolve linhas com valor, participação e **margem por categoria**.
`angulo ∈ {linha, marca, segmento, forma_pagamento, cnpj}`.

```ts
type AnguloComposicao = "linha" | "marca" | "segmento" | "forma_pagamento" | "cnpj";
export async function queryComposicaoVendas(
  prisma: PrismaClient, filtros: FiltrosVendas, angulo: AnguloComposicao,
): Promise<{ linhas: { categoria: string; valorTotal: number; participacao: number; margemPct: number }[]; valorGeral: number }>
```
```sql
-- base: itens de NF de saída externa do recorte + custo de catálogo p/ margem
SELECT chave_do_angulo AS categoria,
       sum(i.vr_produtos)                              AS valor,
       sum(p.preco_custo * i.quantidade)              AS custo
  FROM fato_nota_fiscal_item i
  JOIN fato_nota_fiscal n ON n.odoo_id = i.documento_id AND n.is_venda_externa
  JOIN fato_produto      p ON p.odoo_id = i.produto_id
  -- chave_do_angulo: p.linha | p.marca_nome | parceiro.segmento_nome | n.empresa_id
 WHERE n.data_emissao >= :de AND n.data_emissao < :ate
 GROUP BY chave_do_angulo;   -- margemPct = (valor - custo)/valor*100 por linha
```
Reaproveitar `queryVendasPorMarca` como o caso `angulo='marca'`. **O ângulo `forma_pagamento` é
um caso à parte, não cabe neste `FROM`:** a forma de pagamento vive no título financeiro, não no
item de nota, então o SQL acima (que parte de `fato_nota_fiscal_item`) não tem a coluna
`titulo.forma_pagamento_nome`. Para esse ângulo, agregar **pelo título** (RN-3.15), reusando
`queryFormasPagamento`: o vínculo é `FatoFinanceiroTitulo.notaFiscalId → FatoNotaFiscal.odooId`.
Como uma nota pode ter mais de uma forma (vários títulos), a **coluna "margem média praticada"
NÃO se aplica** a esse ângulo (não há custo por forma sem ratear o item entre títulos): exibir a
margem como "n/a" para `forma_pagamento`, ou, se a margem por forma for exigida, definir e
documentar a regra de rateio do valor da nota entre suas formas. Arquivo: `vendas.ts`.

**Q-3.3 , queryProdutosVendidos (nova).** Uma linha por produto para C3.

```ts
export async function queryProdutosVendidos(
  prisma: PrismaClient, filtros: FiltrosVendas,
): Promise<{ linhas: { produtoId: number; produto: string; linha: string; marca: string; quantidade: number; valorTotal: number; participacao: number }[]; valorGeral: number }>
```
```sql
SELECT i.produto_id, p.nome, p.linha, p.marca_nome,
       sum(i.quantidade) AS qtd, sum(i.vr_produtos) AS valor
  FROM fato_nota_fiscal_item i
  JOIN fato_nota_fiscal n ON n.odoo_id = i.documento_id AND n.is_venda_externa
  JOIN fato_produto      p ON p.odoo_id = i.produto_id
 WHERE n.data_emissao >= :de AND n.data_emissao < :ate
 GROUP BY i.produto_id, p.nome, p.linha, p.marca_nome
 ORDER BY qtd DESC;   -- participacao = valor / valorGeral
```
Arquivo: `vendas.ts`.

**Q-3.4 , queryCondicoesPagamento (nova).** Cards de C5: forma mais usada, PMR, entrada média R$
e %, % com/sem entrada. Combina título (forma, RN-3.15) + parcela (PMR/entrada, M-3.7/M-3.10).

```ts
export async function queryCondicoesPagamento(
  prisma: PrismaClient, filtros: FiltrosVendas,
): Promise<{ formaMaisUsada: { nome: string; pctPedidos: number }; pmrDias: number; entradaMediaValor: number; entradaMediaPct: number; pctComEntrada: number }>
```
```sql
-- PMR por pedido (parcelas) e depois média das médias (RN-3.5)
-- data-base do pedido = COALESCE(data_orcamento, data_aprovacao), alinhado a M-3.7
-- parcela sem data_vencimento é EXCLUIDA da média (não dá para medir prazo); a legenda avisa a cobertura
WITH prazos AS (
  SELECT par.pedido_id,
         sum( GREATEST(0, (par.data_vencimento::date - COALESCE(ped.data_orcamento, ped.data_aprovacao)::date)) * par.valor)
           / NULLIF(sum(par.valor),0) AS pmr_pedido,      -- ponderado por valor da parcela
         sum(CASE WHEN par.data_vencimento::date <= COALESCE(ped.data_orcamento, ped.data_aprovacao)::date THEN par.valor ELSE 0 END) AS entrada,
         sum(par.valor) AS total_pedido
    FROM fato_pedido_parcela par
    JOIN fato_pedido ped ON ped.odoo_id = par.pedido_id
   WHERE ped.categoria_operacao = 'venda' AND ped.data_orcamento >= :de AND ped.data_orcamento < :ate
     AND par.data_vencimento IS NOT NULL                  -- exclui parcela sem vencimento da média
   GROUP BY par.pedido_id, ped.data_orcamento, ped.data_aprovacao
)
SELECT avg(pmr_pedido)                                        AS pmr_geral,
       avg(entrada/NULLIF(total_pedido,0)*100) FILTER (WHERE entrada>0) AS entrada_media_pct,
       avg(entrada)                            FILTER (WHERE entrada>0) AS entrada_media_valor,
       count(*) FILTER (WHERE entrada>0)::float / count(*) * 100        AS pct_com_entrada
  FROM prazos;
-- forma mais usada: maior contagem de pedidos por titulo.forma_pagamento_nome (a_receber)
```
Arquivo: `vendas.ts` (reusa `queryFormasPagamento` para a parte de forma/título).

**Q-3.5 , queryFormaPagamentoPorSegmento (nova).** Barras empilhadas de C5: para cada segmento,
o % de pedidos por forma de pagamento.

```ts
export async function queryFormaPagamentoPorSegmento(
  prisma: PrismaClient, filtros: FiltrosVendas,
): Promise<{ segmentos: { segmento: string; formas: { forma: string; pct: number; pedidos: number }[] }[] }>
```
```sql
SELECT parc.segmento_nome AS segmento, t.forma_pagamento_nome AS forma, count(DISTINCT ped.odoo_id) AS pedidos
  FROM fato_pedido ped
  JOIN fato_parceiro parc ON parc.odoo_id = ped.participante_id
  LEFT JOIN fato_financeiro_titulo t ON t.pedido_id = ped.odoo_id AND t.tipo='a_receber'  -- ver DEP-3.6
 WHERE ped.categoria_operacao='venda' AND ped.data_orcamento >= :de AND ped.data_orcamento < :ate
 GROUP BY segmento, forma;   -- pct = pedidos_forma / pedidos_do_segmento * 100
```
**Cuidado com o cartesiano:** juntar título e pedido por `participante_id` cruzaria **todos** os
pedidos do cliente com **todos** os seus títulos, inflando a contagem. A junção correta é
`t.pedido_id = ped.odoo_id` (o título financeiro carrega `pedidoId`), um título por pedido.
Arquivo: `vendas.ts`. (Confirmar a junção pedido→título/forma contra o dado real.)

**Q-3.6 , queryCurvaAbc (nova).** Classifica produtos por concentração (M-3.11).

```ts
export async function queryCurvaAbc(
  prisma: PrismaClient, filtros: FiltrosVendas,
): Promise<{ linhas: { produtoId: number; produto: string; valorTotal: number; pctTotal: number; pctAcumulado: number; classe: "A"|"B"|"C" }[]; resumo: { classeA: number; classeB: number; classeC: number; pctFaturamentoA: number; maiorParticipacao: { produto: string; pct: number } } }>
```
```sql
-- 1) valor por produto (reusa Q-3.3), 2) ordena desc, 3) acumula em memória,
-- 4) classe pelo acumulado ANTERIOR ao item: A<80, B 80..95, C>=95 (1o item sempre A; A nunca vazia)
```
Cálculo do acumulado e das classes em memória (o arquivo já agrega assim). Arquivo: `vendas.ts`.

**Q-3.7 , queryComparacaoGeralEstados (nova).** Uma linha por UF para a tela 12; aceita os
filtros extras (linha, marca, segmento, vendedor, forma).

```ts
export async function queryComparacaoGeralEstados(
  prisma: PrismaClient, filtros: FiltrosVendas & { linha?: string; marca?: string; segmento?: string; vendedorId?: number; formaPagamento?: string },
): Promise<{ linhas: { uf: string; numVendedores: number; faturamento: number; margemPct: number; pmrDias: number; pctReceita: number; ticketMedio: number; pedidos: number }[]; totais: { faturamento: number; ufsComVenda: number; pedidos: number }; destaques: { maiorFaturamento; maiorMargem; maiorTicket; menorPmr } }>
```
```sql
-- agrega notas por UF do cliente (fato_parceiro.uf -> sigla), com pedidos/ticket/margem/PMR por UF
-- % receita = faturamento_uf / faturamento_total; destaques = argmax/argmin sobre as linhas
```
Arquivo: `vendas.ts`.

**Q-3.8 , queryRankingVendedores (estender , base em `comercial.ts`).** `queryPedidosPorVendedor`
já retorna `{ vendedorNome, quantidade, valorTotal }` a partir de `FatoPedido`/`FatoPedidoItem`
(base de pedido, RN-3.17). **Requisito de SEGURANÇA, não reuso direto:** hoje
`queryPedidosPorVendedor` só aceita `{ periodoDe, periodoAte }` e **ignora `ufs` e `empresaId`**;
usá-la como está no ranking do painel abriria um furo de acesso (usuário restrito a UF veria
vendedores de estados fora do seu escopo, contrariando RF-3.17 e CA-3.11). O wrapper novo em
`vendas.ts` **tem que**: (a) adicionar `ufs`/`empresaId` ao filtro; (b) para o recorte por UF,
fazer o join `FatoPedido.participanteId → FatoParceiro.odooId` e filtrar por
`siglaDeUf(FatoParceiro.uf) ∈ ufs` (mesma resolução de UF de `queryVendasPorUf`); (c) aplicar
`buildEmpresaWhere(empresaId)` sobre `FatoPedido.empresaId`. Só então estender para produtos
vendidos, ticket, margem e meta individual (M-3.5/M-3.6 na base de pedido), preservando a
ordenação estável (valorTotal desc + desempate por nome) e o balde "Sem vendedor" (RN-3.9).
**Validação:** um usuário restrito a uma UF nunca vê vendedor de outra UF no ranking (E2E contra
o cache real). Arquivo: novo wrapper em `vendas.ts` que chama/estende a função de `comercial.ts`.

**Q-3.9 , queryComparativoEstado (nova, orquestra 3.6).** Recebe `{ ufA, periodoA, ufB, periodoB
}`, chama a família de queries do painel duas vezes (uma por lado) e devolve os dois lados +
os deltas relativos e as flags "sem equivalente". Reusa `calcularDeltaKpi`
(`reports/builder/janela-anterior.ts`). Arquivo: `vendas.ts`.

**Q-3.10 , queryCarteiraAFaturar (reusa parcial + agregação extra).** `queryFormasPagamento(...).
carteira` dá **só o valor R$** (`ResumoVisaoPagamento` não traz quantidade nem contagem de
pedidos). Máquinas e nº de pedidos precisam de uma **agregação extra**: a partir dos títulos da
carteira, juntar `FatoFinanceiroTitulo.pedidoId → FatoPedidoItem.quantidade` (Σ quantidade =
máquinas) e `count(distinct pedidoId)` (nº de pedidos); se a base escolhida for pedido (M-3.12),
agregar direto de `FatoPedido`/`FatoPedidoItem`. Fixar antes a base (título × pedido) e o
tratamento de corte para backlog antigo (M-3.12, §6.1). Arquivo: `vendas.ts`.

**Reuso confirmado (não reimplementar):** `queryVendasPorMarca`, `queryVendasPorUf`,
`queryIndicadoresVendas`, `queryMargemEstimada`, `queryFormasPagamento`,
`queryModalidadesEMaiorPedido` (todos em `vendas.ts`); `queryPedidosPorVendedor`,
`queryPedidosPeriodo`, `idsPedidosNoCorte` (em `comercial.ts`); helpers de corte
(`janelaClampada`, `clampIsoAoCorte`, `corteAtualDate` de `corte-dados.ts`), período
(`resolverPeriodoDir` de `diretoria/periodo.ts`), UF (`siglaDeUf`, `ufPorParticipante`),
empresa (`buildEmpresaWhere`) e delta (`calcularDeltaKpi`, `janelaAnterior`).

---

### 3.10 Filtros e parâmetros

Todos passados às queries via `FiltrosVendas` estendido. Clampagem ao corte é automática em
`periodoWhere`/`janelaClampada`.

| Filtro | Onde aparece | Parâmetro | Fonte / helper |
|---|---|---|---|
| **Período (pílula)** | Painel, Comparação geral | `periodoDe`, `periodoAte` (ISO) | `resolverPeriodoDir` (`diretoria/periodo.ts`), presets hoje/semana/este mês/este ano/tudo/personalizado |
| **Períodos independentes A e B** | Comparativos | `periodoA`, `periodoB` | dois seletores próprios (mês/personalizado) |
| **Empresa / CNPJ** | Painel (todos os blocos) | `empresaId` | `buildEmpresaWhere`; `DimEmpresaGrupo` para o rótulo |
| **Grupo de cliente (grupo/Smart/Aztec)** | Painel (chavinha) | `grupoParticipanteIds` | `cliente_grupo` (DEP-3.2) → conjunto de `participanteId` |
| **Construtora (busca)** | Painel | `grupoParticipanteIds` | autocomplete sobre `cliente_grupo.grupoNome` (DEP-3.2) |
| **Estado (UF)** | Painel (scoping/RBAC), Comparativos (A/B), Comparação geral | `ufs` | `FatoParceiro.uf` + `siglaDeUf`; `queryVendasPorUf` |
| **Vendedor** | Comparação geral, ranking | `vendedorId` | `FatoPedido.vendedorId`/`vendedorNome` |
| **Marca** | Composição, Comparação geral | `marca` | `FatoProduto.marcaNome` |
| **Linha** | Composição, produtos, Comparação geral | `linha` | `FatoProduto.linha` (DEP-3.4) |
| **Tipo (produto)** | Composição (opcional) | `tipo` | `FatoProduto.tipo` (já existe) |
| **Tipo de cliente (segmento)** | Composição, distribuição, Comparação geral | `segmento` | `FatoParceiro.segmentoNome` (DEP-3.5) |
| **Forma de pagamento** | Composição, Comparação geral | `formaPagamento` | `FatoFinanceiroTitulo.formaPagamentoNome` (RN-3.15) |
| **Classe ABC** | C6 (filtro local da tabela) | client-side | resultado de `queryCurvaAbc` |
| **Ordenação de tabela** | todas as tabelas | client-side / `orderBy` | §7.2 |

Combinação de filtros é **E lógico** (interseção). O UF-scoping do RBAC é aplicado por cima e
não é burlável pelo filtro de UF (usuário restrito nunca vê UF fora do seu escopo).

---

### 3.11 Estados e validações

- **Carregando:** skeleton dos cards e das tabelas (§7.5). Cada bloco carrega independente; o
  painel não bloqueia inteiro por uma query lenta.
- **Vazio:** recorte sem venda mostra mensagem acionável ("Nenhuma venda faturada neste período/
  recorte", com dica de ampliar o período ou revisar o filtro), nunca tela branca (RN-3.16). A
  curva ABC com < 1 produto some o gráfico e mostra o vazio.
- **Erro:** mensagem que explica e sugere ação (§7.5), nunca "Erro".
- **Sem base de comparação:** quando a janela anterior termina antes do corte (§6.2), os cards
  mostram "Sem base de comparação" em vez de um delta inventado. Nos comparativos, quando um dos
  lados não tem venda, o outro ainda aparece e os deltas viram "Sem equivalente".
- **Gaps de dado sinalizados na UI, não escondidos:**
  - Sem meta cadastrada (DEP-3.1): card "Meta atingida" e coluna de meta individual mostram "Sem
    meta definida".
  - Sem mapeamento de grupos (DEP-3.2): chavinha e busca por construtora desabilitadas com dica.
  - Sem atributo linha (DEP-3.4): composição por linha e coluna "linha" no balde "Sem linha".
  - Sem segmento materializado (DEP-3.5): eixo "tipo de cliente" no balde "Sem segmento".
  - Sem vendedor (DEP-3.3): linha "Sem vendedor" no ranking, para o total bater.
- **Frescor:** todo painel exibe "atualizado há Xs" (§6.6) do fato que o alimenta.
- **Validações de parâmetro:** `periodoDe ≤ periodoAte`; datas clampadas ao corte
  automaticamente; `empresaId`/`vendedorId` inexistentes retornam recorte vazio (não erro);
  período ausente = "do corte em diante" (nunca varre o histórico inteiro).
- **Números:** monetário em BRL `R$ 1.234.567,89`; percentual com uma casa (`42,7%`); variação
  em % ou **p.p.** conforme a métrica (margem e participação em p.p.; valores em %); alinhamento
  à direita com `tabular-nums` (§2.4, §7.2).

---

### 3.12 Critérios de aceite

- **CA-3.1** Os 6 cards de C1 batem com o cache real do período: `valorVendido` = Σ `vrNf` de
  notas `isVendaExterna` do período; `margemPct` = margem ponderada (M-3.5); `metaAtingida` =
  valor/meta quando há meta, "Sem meta definida" quando não há. Conferido por E2E contra o cache
  (regra §9 da Parte I: subir o serviço e exercer o dado real, não só tsc/jest).
- **CA-3.2** A composição C2 troca de ângulo (linha/marca/segmento/forma/empresa emissora) no mesmo espaço,
  e cada linha mostra valor, % do total (que soma ~100%) e margem da categoria. Produto/cliente
  sem atributo cai no balde "Sem X".
- **CA-3.3** A curva ABC classifica corretamente: soma dos % = 100%, `pctAcumulado` monotônico
  crescente, classe pelo acumulado **anterior** ao item (A: <80%, B: 80-95%, C: ≥95%), de modo
  que o 1º produto é sempre A e **a classe A nunca fica vazia**, inclusive quando um único
  produto passa de 80% do faturamento; os cards de contagem e "% faturamento classe A" batem com
  a tabela; filtro Todos/A/B/C funciona.
- **CA-3.4** PMR: para um pedido de parcelas 30/60/90 dias de valor igual, o PMR do pedido é 60
  dias; o PMR geral segue a agregação confirmada (RN-3.5) e o card documenta qual é. Entrada
  média considera só pedidos com entrada; % com/sem entrada soma 100%.
- **CA-3.5** Ranking por estado e por vendedor: ordenável por qualquer coluna; ticket e margem
  por linha usam só os pedidos daquele estado/vendedor; "Sem vendedor" aparece quando há valor
  sem atribuição. O ranking de vendedor é base de PEDIDO (RN-3.17): o total do ranking bate com o
  **subtotal de pedidos** do recorte (não com o card de faturamento por nota), e o "% do total"
  de cada vendedor é sobre esse total de pedidos. O ranking por estado, esse sim, bate com o
  valor vendido (nota) do painel.
- **CA-3.6** Comparativos A × B: períodos independentes funcionam; cada indicador mostra a
  variação relativa ao outro recorte (verde = A melhor); "Sem equivalente" aparece onde não há
  par; trocar A/B inverte os sinais coerentemente.
- **CA-3.7** Comparação geral: a tabela lista todas as UFs com venda no recorte; ordenação e os
  6 filtros afetam tabela e cards; os cards de destaque batem com o argmax/argmin da tabela;
  "% da receita geral" soma ~100%; "Clique para comparar" leva à tela 10 com a UF no lado A.
- **CA-3.8** Recorte grupo/Smart/Aztec e busca por construtora restringem **todos** os números
  do painel ao conjunto de CNPJs mapeado; "tirar a Smart" remove exatamente os pedidos/notas dos
  `participanteId` do grupo Smart; sem mapeamento, controles desabilitados com dica.
- **CA-3.9** Faturamento nunca inclui venda intragrupo (RN-3.1): o total do painel bate com o
  número canônico do Agente Nex/KPIs (mesma fonte `isVendaExterna`), não com o valor inflado do
  filtro antigo.
- **CA-3.10** Toda leitura respeita o corte (§6.1): mover a data de corte para trás faz o
  histórico reaparecer nas telas sem re-sync; período ausente nunca varre antes do corte.
- **CA-3.11** RBAC/UF-scoping: usuário restrito a UF(s) vê apenas seus estados em todos os
  blocos (indicadores, composições, rankings, comparação geral), inclusive no faturamento total.
- **CA-3.12** Estados de vazio/carregando/erro presentes e acionáveis; frescor do dado exibido;
  dark/light com contraste AA; ícones só Lucide, zero emoji (perícia de UI da Parte I §7).

---

### 3.13 Dependências

**De camada base (Parte I §8, precisam existir antes ou junto):**
- **B1 (§8.1) , atributo linha** → DEP-3.4 (composição por linha, coluna "linha", filtro linha).
- **B3 (§8.3) , importadores manuais** → DEP-3.1 (meta mensal, item 2) e DEP-3.2 (mapeamento de
  CNPJs em grupos, item 5). Sem eles, "Meta atingida" e o recorte grupo/construtora ficam
  inativos com dica.

**De dado a materializar (novo builder/migration, dentro deste módulo ou como pré-requisito):**
- **DEP-3.5 , segmento (confiança baixa, condicional)** → **primeiro** provar, com `SELECT` no
  cache real, que existe segmento **atribuído por parceiro** (não só o catálogo em
  `raw_sped_participante_segmento`; §3.2). Se existir: builder que materialize `segmentoNome` em
  `FatoParceiro` e as RF de segmento sobem para MUST. Se **não** existir: vira dependência de
  **processo do cliente** (cadastrar o segmento por parceiro no Odoo), como DEP-3.3, e as RF de
  segmento ficam [SHOULD] até o cadastro; enquanto isso, "tipo de cliente" fica em "Sem segmento".
- **DEP-3.3 , vendedor no pedido** → ação de processo do cliente (preencher `vendedorNome` "daqui
  pra frente"); não bloqueia o código, mas o ranking fica com "Sem vendedor" no histórico.

**De regras transversais (Parte I §6, já implementadas):**
- Corte de dados (§6.1, `corte-dados.ts`), comparação vs. período anterior (§6.2,
  `janela-anterior.ts`), pílula de período (§6.3, `diretoria/periodo.ts`), filtro de empresa
  (§6.4, `buildEmpresaWhere`), valoração (§6.5).

**De UI (Parte I §7):** card de KPI (§7.1), tabela ordenável/filtrável (§7.2), gráfico de
composição com seletor de ângulo (§7.3), estados (§7.5), acessibilidade/tema (§7.6), RBAC (§7.7).
Skill `ui-ux-pro-max` obrigatória antes de tocar qualquer arquivo de UI; layout sempre inline na
sessão principal.

**De decisão do cliente (resolver antes de cravar):**
- RN-3.5 (agregação do PMR geral: média das médias × ponderado pelo valor).
- RN-3.7 (definição de "pedido fechado": todos os pedidos de venda × só etapa que finaliza).
- RN-3.8 (regra de "entrada": parcela de prazo 0 confirmada contra o dado real).

**Arquivos que este módulo toca:**
- `src/lib/diretoria/queries/vendas.ts` (estender: Q-3.1..Q-3.10; único arquivo de query
  compartilhado que este módulo edita).
- `src/app/(protected)/diretoria/vendas/page.tsx` e componentes da tela (evoluir o painel;
  criar as sub-telas Comparativos e Comparação geral sob o mesmo seletor de modo).
- Migration + builder para `segmentoNome` em `FatoParceiro` (DEP-3.5) e para `linha` (B1,
  DEP-3.4, se não entregue antes).
- Modelos novos da camada base consumidos aqui: `meta_venda_mensal` (DEP-3.1), `cliente_grupo`
  (DEP-3.2), ambos entregues por B3.
- `docs/kpis-diretoria.md`: registrar as fórmulas de valor vendido, margem ponderada, meta
  atingida, PMR e curva ABC no mesmo commit em que a regra for implementada (regra do CLAUDE.md
  do projeto).
