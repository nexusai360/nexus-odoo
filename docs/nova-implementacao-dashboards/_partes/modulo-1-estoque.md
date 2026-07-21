## Módulo 1 , Estoque atual
> Telas: 01, 02. Prioridade de entrega: 1ª (máxima).

> Este documento é a Parte II do escopo técnico. Ele **estende** e **referencia** a Parte I
> (convenções §2, glossário §3, arquitetura §4, fontes §5, regras transversais §6, padrões de
> UI §7, camada base §8), nunca a redefine. Toda regra de corte, comparação, valoração,
> frescor e RBAC citada aqui vale exatamente como escrita lá; aqui só se diz como o Módulo 1
> a aplica. Toda menção a arquivo, tabela, campo ou função usa o nome real do código
> (confirmado no cache de produção e no `prisma/schema.prisma`); onde um campo ainda não
> existe, o texto diz "confirmar no schema" ou abre uma dependência (DEP).

---

### 1.1 Objetivo e usuário

O Módulo 1 é a **foto objetiva do estoque físico de agora**: quanto valor e quantas unidades
estão em casa, quanto disso já está comprometido com cliente (demanda a entregar), quanto
sobra livre para vender (disponível) e o que ainda vai chegar (ordens de compra em trânsito).
É o painel de **prioridade nº 1** declarada pelo cliente na reunião (ver §1 do
ESCOPO-FUNCIONAL) e não depende de nenhuma configuração nova de negócio (ciclo, previsão,
meta): lê o que o cache já tem hoje, com uma única dependência de dado a criar (o atributo
`linha`, DEP-1.1).

**Usuário:** diretoria e gestão de estoque/compras. Perfil de leitura (RBAC herdado, §7.7). A
leitura responde a três perguntas de operação:
1. Quanto vale e quanto tem o estoque agora, e onde ele está (por local).
2. Do que tem, quanto já está vendido (demanda) e quanto sobra (disponível), em quantidade e
   em valor de custo.
3. Como o estoque se compõe (por marca, linha e tipo) e quais produtos concentram saldo,
   demanda e falta.

**Fronteiras (o que este módulo NÃO faz):** não mostra compras detalhadas por fornecedor,
não mostra financeiro externo, não mostra logística/entrega e **não** usa dados de ciclo ou
previsão (isso é o Módulo 2, Relatório de estoque/ciclos). O texto de topo da tela deixa isso
explícito ("Visão objetiva do estoque físico atual, sem dados de compras detalhadas,
financeiro externo ou logística." e, no rodapé da tabela, "Sem previsão ou dados de ciclo.").

**Base de código a estender (não criar do zero):**
- `src/lib/diretoria/queries/estoque.ts` (arquivo com ~1.243 linhas), que já tem
  `queryIndicadoresEstoque`, `agrupaSaldo`, `queryEstoqueGranular`,
  `queryEstoqueDisponivelDiretoria`, `queryComprasAtivas` e os helpers de índice/local. É o
  lar canônico das novas consultas Q-1.x.
- `src/lib/reports/queries/estoque.ts`, referência do comparativo por snapshot: a exportada
  `queryEstoqueComparativo`. **`pontoEstoqueNaData` é privada (sem `export`) e NÃO serve a este
  módulo** (agrega o snapshot sem filtro de local físico, sem `quantidade>0`, em `vrSaldo` e só
  no total, ver RN-1.3). A variação de 30 dias deste módulo é uma **consulta nova** que aplica o
  mesmo filtro físico + positivo e a valoração a custo do card de hoje.
- `src/lib/diretoria/periodo.ts` (`resolverPeriodoDir`, `resolverJanelaDemanda`,
  `DIRETORIA_PERIODO_PRESETS`) para a pílula de período que rege só a demanda.
- `src/lib/corte-dados.ts` (`corteAtualDate`, `clampDateAoCorte`, `janelaClampada`,
  `janelaDemandaAberta`, `PISO_DEMANDA_ABERTA`) para o corte de leitura e a exceção de
  demanda (§6.1).

---

### 1.2 Pré-requisitos de dado (tabelas, campos, gaps)

Fontes canônicas herdadas de §5.1/§5.2. Campos reais confirmados em `prisma/schema.prisma`.

**Tabelas que já existem e o módulo usa direto:**

- **`fato_estoque_saldo`** (model `FatoEstoqueSaldo`) , saldo vivo por produto/local, a foto
  do agora. Campos usados: `odooSaldoId`, `produtoId` (`produto_id`), `produtoNome`
  (`produto_nome`), `localId` (`local_id`), `localNome` (`local_nome`), `quantidade`
  (Decimal 18,4), `vrSaldo` (`vr_saldo`, o valor que o Odoo devolve, **não** é o usado no
  KPI), `familiaId`/`familiaNome`, `marcaId`/`marcaNome`, `atualizadoEm` (`atualizado_em`).
  **Não tem** coluna de tipo de produto nem de empresa (`empresa_id`) , ver DEP-1.2 e RN-1.9.
- **`fato_estoque_local`** (model `FatoEstoqueLocal`) , dimensão do armazém. Campos:
  `odooId`, `nome`, `nomeCompleto` (`nome_completo`), `tipo` ('S' sintético | 'A' analítico),
  `nivel`, `localSuperiorId`, `estoqueEmMaos`, `classificacao` ('fisico' | 'demonstracao' |
  'fora'). O módulo filtra por `classificacao='fisico'` via
  `localIdsPorClassificacao(prisma, "fisico")` + `whereLocal(...)`.
- **`fato_produto`** (model `FatoProduto`) , catálogo. Campos usados: `odooId`, `nome`,
  `tipo` (String?, ex.: "seletorizada"/"peso livre"/"cardio"/"acessório"), `marcaId`/
  `marcaNome`, `familiaId`/`familiaNome`, `precoCusto` (`preco_custo`, Decimal 14,4, base da
  valoração), `ativo`, `controlaEstoque`. **Não tem** campo `linha` , ver DEP-1.1.
- **`fato_estoque_saldo_snapshot`** (model `FatoEstoqueSaldoSnapshot`) , foto diária do
  saldo, gravada pelo job `capturarSnapshotEstoqueDiario` (idempotente por `dataRef`). Campos:
  `dataRef` (`data_ref`, Date), `produtoId`, `localId`, `quantidade`, `vrSaldo`,
  `familiaId`/`familiaNome`, `marcaId`/`marcaNome`. É a única fonte da comparação de 30 dias
  (RN-1.3). **Não** guarda demanda nem ordem de compra , ver DEP-1.4.
- **`fato_compra`** (model `FatoCompra`) , ordens de compra. Usada por `queryComprasAtivas`
  (`recebida=false`, `cancelada=false`) para "valor a chegar". Tem só valores (`vrProdutos`,
  `vrNf`, `vrPago`, `vrSaldo`), datas (`dataOrcamento`, `dataPrevista`, `dataAprovacao`) e
  `empresaId`. **Confirmado no schema: não tem coluna de quantidade** e **não existe fato de
  itens de compra**, logo "quantidade a chegar" é indisponível sem um novo fato a criar , ver
  DEP-1.3.
- **`fato_pedido`** / itens de pedido , demanda a entregar (bucket `ABERTA`). Já consumidos
  por `queryEstoqueDisponivelDiretoria`: o comprometido é a quantidade **a atender**
  (`quantidadeAAtender`), com piso em zero, não a quantidade pedida.

**Dependências de dado (DEP):**

- **DEP-1.1 , atributo `linha` do produto (bloqueia composição e filtro por linha).**
  `fato_produto` não tem `linha`; `fato_estoque_saldo` também não. É o gap B1 da camada base
  (§8.1). Enquanto a camada base não entregar o campo e o cliente não cadastrar no Odoo, a
  **composição por linha vem vazia** e o **filtro por linha da tabela** não tem valores. A UI
  tolera `linha` nula com o balde "Sem linha". Assim que B1 propagar `linha` (e `linhaId`)
  para `fato_produto` e para `fato_estoque_saldo`/`_snapshot` espelhando `marcaNome`, as
  consultas Q-1.3 e Q-1.5 passam a agrupar/filtrar por ela sem mudança de contrato. Prioridade
  do módulo: entregar marca e tipo já; linha entra quando B1 fechar.
- **DEP-1.2 , `tipo` de produto não está em `fato_estoque_saldo`.** O tipo existe em
  `fato_produto.tipo`, mas o saldo não o carrega (carrega só marca e família). A composição
  por tipo (1.4.3) e o filtro por tipo (1.4.5) precisam **juntar** `fato_estoque_saldo.produtoId`
  a `fato_produto.tipo` na query (via um `Map<produtoId, tipo>` análogo ao `custoPorProduto`),
  **ou** propagar `tipo`/`tipoNome` para `fato_estoque_saldo` no builder (espelhando
  `marcaNome`, exatamente o passo 4 de B1). Recomendação: propagar no builder para a
  composição por tipo custar o mesmo que por marca; enquanto não propaga, resolver por join em
  memória (o catálogo é pequeno). **Sem gold-plating:** não criar dimensão nova de tipo.
- **DEP-1.3 , "quantidade a chegar" indisponível sem um novo fato de itens de compra
  (confirmado).** `queryComprasAtivas` agrega `vrNf` por OC (serve a "valor a chegar"), mas não
  devolve unidades, e `fato_compra` **não tem** coluna de quantidade (só valores, conferido no
  schema); **não existe** fato de itens de compra. Portanto o card "Quantidade a chegar" (4 un.
  no protótipo, mock) é **irreconstruível hoje**: só passa a existir quando a camada base criar
  um fato de itens de OC não recebidas. Até lá o card #11 fica **`null`** ("Sem dado de
  quantidade"), enquanto "Valor a chegar" (#6) segue normal por `vrNf`.
- **DEP-1.4 , comparação de 30 dias da demanda e do a chegar.** O snapshot
  (`fato_estoque_saldo_snapshot`) fotografa **saldo** (quantidade e valor), não demanda nem
  ordem de compra. Logo, a variação de 30 dias é reconstruível só para os KPIs de saldo (valor
  total, quantidade total, valor/quantidade média por local, ticket médio). Os KPIs de
  **demanda, disponível e a chegar** não têm base histórica: ou exibem "Sem base de
  comparação" (§7.1), ou dependem de um snapshot de demanda/OC a criar. Decisão default deste
  escopo: **"Sem base de comparação" nesses cards** até existir snapshot próprio (RN-1.4). O
  protótipo mostra percentuais nesses cards, mas eles são mock; a entrega honesta é o rótulo
  de ausência de base.

**Gaps que NÃO são deste módulo:** ciclo, previsão, status por produto (Módulo 2) e meta
(Módulo de Vendas). O rodapé da tabela ("Sem previsão ou dados de ciclo.") é a marca dessa
fronteira.

---

### 1.3 Requisitos funcionais

Prioridade MoSCoW por §2.2.

- **RF-1.1 [MUST]** Exibir os **12 indicadores gerais** no topo (1.4.1), cada um como card de
  KPI no padrão §7.1 (rótulo, valor mono, variação, legenda de base).
- **RF-1.2 [MUST]** Valoração **sempre a custo** (`fato_produto.preco_custo`), nunca a preço
  de venda, coerente com §6.5 ("o estoque é custo"). O mesmo critério de valoração vale para
  os 12 KPIs, os cards por local, as composições e o bloco Demanda x Disponível , as partes
  têm que somar o todo (RN-1.5).
- **RF-1.3 [MUST]** Considerar **só o saldo positivo** (`quantidade > 0`) e **só locais
  físicos** (`classificacao='fisico'`) em todo agregado de saldo, replicando a regra já
  provada em `queryIndicadoresEstoque` (linhas zeradas não são estoque; negativas são furo e
  saem do valor, devolvidas à parte como `linhasNegativas`).
- **RF-1.4 [MUST]** Variação vs. período anterior **fixa em 30 dias** (não segue a pílula),
  via `fato_estoque_saldo_snapshot`, só nos KPIs de saldo (RF-1.1 + RN-1.3/RN-1.4).
- **RF-1.5 [MUST]** **Distribuição por local** (1.4.2): um card por local ativo com valor, %
  do valor total, quantidade, % da quantidade total e ticket local.
- **RF-1.6 [MUST]** **Composição** por marca e por tipo (1.4.3) num único gráfico com
  **seletor de ângulo** (§7.3), participação por valor com quantidade no detalhe. Por linha é
  **[SHOULD]**, gated por DEP-1.1.
- **RF-1.7 [MUST]** **Seletor Geral × local específico** que recalcula composições e Demanda x
  Disponível para um único local, sem tocar nos 12 KPIs de topo (que são sempre do grupo).
- **RF-1.8 [MUST]** **Demanda x Disponível** (1.4.4) em duas visões (quantidade e valor),
  barra 100% empilhada, sempre a custo.
- **RF-1.9 [MUST]** **Tabela por produto** (1.4.5) com produto (marca/linha/tipo no subtítulo),
  quantidade, quantidade em demanda e disponível (`saldo − demanda`), com **busca**,
  **filtros** (local, marca, linha, tipo, status) e **ordenação por coluna** (§7.2).
- **RF-1.10 [MUST]** **Demanda segue a pílula de período** (D8/RF-A5, §6.3), com a **exceção
  de janela** (§6.1): a demanda a entregar **não** é recortada pelo corte de leitura, usa
  `janelaDemandaAberta`. Saldo e composição não seguem a pílula (foto do agora).
- **RF-1.11 [MUST]** **Filtro de empresa/CNPJ desativado nesta tela**, com aviso: o estoque é
  do grupo inteiro porque `fato_estoque_saldo` não tem `empresa_id` (RN-1.9, §6.4).
- **RF-1.12 [SHOULD]** Opção de **tipo de gráfico** na composição (pizza padrão, barra
  opcional), §7.3.
- **RF-1.13 [SHOULD]** Expor `produtosSemCusto` e `linhasNegativas` como aviso de qualidade de
  dado (não como erro), para o gap ficar visível e não silencioso.
- **RF-1.14 [COULD]** Drill: clicar num card de local seleciona aquele local no seletor
  Geral × local (atalho para RF-1.7).
- **RF-1.15 [COULD]** Exportar a tabela por produto (CSV) respeitando filtros e ordenação.

---

### 1.4 Especificação da tela por seção

Layout confirmado nas referências `01-estoque-atual-indicadores-e-composicao.png` e
`02-estoque-atual-composicao-local-e-tabela.png`, de cima para baixo: (A) faixa de 12
indicadores; (B) distribuição por local; (C) três composições com seletor Geral × local; (D)
Demanda x Disponível; (E) tabela por produto com busca e filtros. Tema escuro, cards com
borda sutil, números em fonte mono/tabular.

#### 1.4.1 Indicadores gerais (os 12 cards)

Grade de 6 colunas × 2 linhas (protótipo). Grupo rotulado "INDICADORES GERAIS , SALDO, VALOR,
DEMANDA, DISPONIBILIDADE E ITENS A CHEGAR". Cada card segue §7.1. Valores de referência entre
parênteses são os do protótipo (mock), servem só para conferir a fórmula.

Convenções da tabela: `índice` = índice de estoque de `getIndiceEstoque`/`aplicarIndice`
(padrão 0,95; o valor a custo é DIVIDIDO por ele para virar o número do KPI, exatamente como
em `queryIndicadoresEstoque`). `custo(p)` = `fato_produto.preco_custo` do produto p, via
`custoPorProduto`. `Σsaldo` = soma sobre linhas de `fato_estoque_saldo` com `quantidade>0` em
locais físicos. `Σdemanda` = soma da quantidade a atender dos itens de pedido bucket `ABERTA`
na janela da pílula (RF-1.10).

| # | Rótulo | Fórmula | Fonte (tabela.campo) | Formato | Variação |
|---|--------|---------|----------------------|---------|----------|
| 1 | VALOR TOTAL | `Σ(quantidade × custo(p)) ÷ índice` (R$ 22.202.830,00) | `fato_estoque_saldo.quantidade` × `fato_produto.preco_custo`, índice de `indice-estoque` | R$ #.###.##0,00 | 30 dias fixo (RN-1.3), verde/vermelho + % |
| 2 | VALOR MÉDIO POR LOCAL | `valorTotal ÷ nº locais ativos` (R$ 4.440.566,00; "5 locais ativo(s)") | derivado do #1 e de `locais` distintos (`fato_estoque_saldo.localId`) | R$ #.###.##0,00 | 30 dias fixo |
| 3 | TICKET MÉDIO DOS PRODUTOS | `valorTotal ÷ quantidadeTotal` (R$ 2.364,52) | derivado de #1 e #7 | R$ #.##0,00 | 30 dias fixo |
| 4 | VALOR EM DEMANDA | `Σ(demanda(p) × custo(p)) ÷ índice` (R$ 9.173.900,00; "41,3% do valor total") | demanda a atender de itens de pedido `ABERTA` × `fato_produto.preco_custo` | R$ #.###.##0,00 | Sem base de comparação (DEP-1.4/RN-1.4) |
| 5 | VALOR DISPONÍVEL | `valorTotal − valorEmDemanda` (R$ 13.028.930,00; "58,7% do valor total") | derivado de #1 e #4 | R$ #.###.##0,00 | Sem base de comparação |
| 6 | VALOR A CHEGAR | `Σ vrNf` das OCs não recebidas (R$ 12.660,00; "Itens em trânsito ainda fora do estoque") | `fato_compra.vrNf` onde `recebida=false, cancelada=false` (`queryComprasAtivas`) | R$ #.###.##0,00 | Sem base de comparação |
| 7 | QUANTIDADE TOTAL | `Σ quantidade` (9.390 un.; "Todas as unidades físicas") | `fato_estoque_saldo.quantidade` (>0, físico) = `itens` | #.##0 un. | 30 dias fixo |
| 8 | QUANTIDADE MÉDIA POR LOCAL | `quantidadeTotal ÷ nº locais ativos` (1.878,0 un.) | derivado de #7 e `locais` | #.##0,0 un. | 30 dias fixo |
| 9 | QUANTIDADE EM DEMANDA | `Σ demanda(p)` (3.984 un.; "42,4% da quantidade total") | quantidade a atender de itens `ABERTA` | #.##0 un. | Sem base de comparação |
| 10 | QUANTIDADE DISPONÍVEL | `quantidadeTotal − quantidadeEmDemanda` (5.406 un.; "57,6% da quantidade total") | derivado de #7 e #9 | #.##0 un. | Sem base de comparação |
| 11 | QUANTIDADE A CHEGAR | **Indisponível**: `fato_compra` não tem quantidade e não há fato de itens de compra (DEP-1.3); card fica `null` até esse fato existir (protótipo mostra 4 un., mock) | sem fonte de quantidade de OC | #.##0 un. (quando existir) / "Sem dado" | Sem base de comparação |
| 12 | ÚLTIMA ATUALIZAÇÃO | timestamp da última sync do fato (20/07/2026 · 14:49) | `max(fato_estoque_saldo.atualizadoEm)` (§6.6) | dd/MM/aaaa · HH:mm | Sem base de comparação (rótulo fixo) |

Observações de cálculo (ver RN para o detalhe):
- **Partes somam o todo.** `valorEmDemanda + valorDisponivel = valorTotal` e
  `quantidadeEmDemanda + quantidadeDisponivel = quantidadeTotal`. O disponível é definido por
  subtração no agregado (não pela soma de disponíveis por produto), para não herdar os
  negativos por produto (RN-1.6).
- **Percentuais das legendas** (41,3% / 58,7% / 42,4% / 57,6%) são `valorEmDemanda ÷ valorTotal`
  e `quantidadeEmDemanda ÷ quantidadeTotal`, calculados na própria query e devolvidos prontos.
- **Card 12** é o único sem número financeiro e sem variação: legenda "Sem base de
  comparação". Usar o frescor do fato (§6.6), não o horário de renderização; o protótipo
  escreve "Data e hora de renderização da tela", mas a regra herdada é a última sync (decisão
  de perícia, RN-1.10).

#### 1.4.2 Distribuição por local de estoque

Grupo "DISTRIBUIÇÃO POR LOCAL DE ESTOQUE , VALOR, QUANTIDADE E TICKET MÉDIO POR LOCAL". Uma
fileira de cards, um por local físico ativo, ordenados por valor decrescente. Cada card
(confirmado no protótipo):

- Título: nome do local (JARINU, VALINHOS, CEILÂNDIA, VICENTE PIRES, SERGIPE...).
- Badge no canto superior direito: **% do valor total** (ex.: 24,7%).
- Valor principal (mono): valor a custo do local (R$ 5.492.418,00).
- Quatro métricas em grade 2×2: **QUANTIDADE** (2.346 un.), **% QUANTIDADE** (25,0% = qtd
  local ÷ qtd total), **TICKET LOCAL** (R$ 2.341,18 = valor local ÷ qtd local), **% VALOR**
  (24,7% = valor local ÷ valor total).

Regras:
- Agrupar por **`localId`**, não pelo texto do nome: existem dois locais com nome idêntico
  ("Próprio / INATIVO") e agrupar por texto os fundiria numa linha só. O rótulo continua sendo
  `localNome`; a identidade é o `localId`. Essa regra já está implementada em `agrupaSaldo` e
  deve ser preservada.
- Só locais `classificacao='fisico'` e só `quantidade>0` (RF-1.3). Um "local ativo" é um local
  físico com pelo menos uma linha de saldo positivo; é esse conjunto que define o "nº locais
  ativos" dos KPIs #2 e #8.
- Valor do local usa a **mesma valoração dos KPIs** (a custo, com índice aplicado), para a
  soma dos cards bater com o card "Valor total" (RN-1.5).
- Estado vazio: se um local perdeu todo o saldo, ele some da fileira (não renderiza card
  zerado).

#### 1.4.3 Gráficos de composição (marca / linha / tipo) com seletor

Grupo "GRÁFICOS DE COMPOSIÇÃO E DISPONIBILIDADE , MARCA, LINHA, TIPO E DEMANDA X DISPONÍVEL".
Dois seletores independentes governam esta seção e a 1.4.4:

1. **Seletor de ângulo** (§7.3, [MUST]): alterna a composição entre **Marca**, **Linha** e
   **Tipo de produto** no **mesmo espaço** (um gráfico, botões/abas em cima), não N gráficos
   fixos lado a lado. O protótipo desenha as três composições simultaneamente como barras
   horizontais (para referência do dado); a entrega segue o padrão canônico §7.3 (um gráfico,
   pizza/rosca por padrão, barra opcional via RF-1.12), com o ângulo trocado pelo seletor. Se
   a diretoria preferir ver as três de uma vez, isso é decisão de UI a validar na perícia; o
   contrato de dado (Q-1.3) atende os dois arranjos.
2. **Seletor Geral × local** (dropdown "Geral" no canto direito, [MUST], RF-1.7): recalcula a
   composição (e o bloco 1.4.4) para **um único local**. Em "Geral", agrega o grupo inteiro;
   num local, filtra `localId`. O subtítulo dos gráficos reflete o escopo: "Estoque geral ·
   participação calculada por valor, com quantidade no detalhe" vira "Local: CEILÂNDIA · ..."
   (comparar imagem 01, Geral, com imagem 02, Ceilândia).

Conteúdo de cada composição:
- Participação **por valor** (a custo, com índice) por padrão, **quantidade no detalhe** (§7.3).
  Cada fatia/barra: rótulo, % do valor, e a quantidade em unidades embaixo (ex.: "BODY JOY
  53,1% , 4.800 un.").
- **Composição por marca:** agrupa `fato_estoque_saldo.marcaNome` (já pronto; reusa
  `agrupaSaldo(campo="marcaNome")`). Balde "Sem marca" para nulo.
- **Composição por tipo:** agrupa por `fato_produto.tipo` (DEP-1.2: join `produtoId → tipo`
  ou propagação no builder). Balde "Sem tipo" para nulo.
- **Composição por linha:** agrupa por `linha` (DEP-1.1). Enquanto B1 não entregar, a
  composição por linha vem vazia com aviso "Atributo linha ainda não cadastrado" e o ângulo
  "Linha" pode ficar desabilitado; nunca quebra a tela.
- Ordenação das fatias: valor decrescente. Fatias muito pequenas podem agrupar em "Outros"
  conforme o padrão de gráfico do design system (§7.3), sem inventar categoria.

#### 1.4.4 Demanda x Disponível (quantidade e valor)

Grupo "DEMANDA X DISPONÍVEL", subtítulo "Estoque geral · duas visões: quantidade e valor" (ou
"Local: CEILÂNDIA · ..." quando um local está selecionado, RF-1.7). Dois blocos lado a lado,
cada um uma **barra 100% empilhada** com duas fatias (amarelo = demanda, verde = disponível) e
a legenda embaixo com % e valor absoluto:

- **POR QUANTIDADE:** Demanda (amarelo) "42,4% · 797 un." | Disponível (verde) "57,6% · 1.081
  un.". Soma = quantidade total do escopo (no exemplo, Ceilândia: 797+1.081 = 1.878 un.).
- **POR VALOR:** Demanda "41,3% · R$ 1.835.429,50" | Disponível "58,7% · R$ 2.605.136,50".
  Soma = valor total do escopo. Valor sempre a custo (§6.5).

Regras:
- É o mesmo par demanda/disponível dos KPIs #4/#5/#9/#10, mas **recortado pelo seletor de
  local** (os KPIs de topo são sempre do grupo; este bloco acompanha Geral × local).
- Demanda segue a pílula de período com a exceção de janela (RF-1.10). Disponível =
  saldo do escopo − demanda do escopo (subtração no agregado, RN-1.6).
- Se o local não tem demanda, a barra fica 100% verde (disponível) com legenda "0% · 0 un.";
  se não tem saldo mas tem demanda (furo), tratar como RN-1.7 (não desenhar barra > 100%).

#### 1.4.5 Tabela de estoque por produto (busca, filtros, ordenação)

Grupo "TABELA DE ESTOQUE POR PRODUTO , SALDO ATUAL, DEMANDA E DISPONIBILIDADE". Cabeçalho de
resumo dinâmico (conforme filtros): "48 produto(s) · 9.390 un. físicas · 1.183 un. em demanda
· 8.207 un. disponíveis. Sem previsão ou dados de ciclo." (os números do resumo refletem o
conjunto filtrado, não o grupo inteiro).

**Linha de controles** (esquerda → direita, confirmado no protótipo):
- **Busca textual** "Buscar por produto..." , casa em `produtoNome` (e, quando útil, código),
  reusando o helper de busca canônica do módulo de relatórios quando aplicável.
- **Dropdown "Todos os locais"** , `localId`/`localNome` (físicos).
- **Dropdown "Todas as marcas"** , `marcaNome`.
- **Dropdown "Todas as linhas"** , `linha` (DEP-1.1; opções vazias, com "Sem linha", até B1).
- **Dropdown "Todos os tipos"** , `fato_produto.tipo` (DEP-1.2).
- **Dropdown "Todos"** (status) , zerado / negativo / positivo, calculado sobre o **saldo**
  do produto (RN-1.8): positivo = saldo > 0, zerado = saldo = 0, negativo = saldo < 0.

**Colunas** (protótipo):
- **PRODUTO** , nome do modelo (ex.: "Modelo catálogo 001") com subtítulo
  "MARCA · LINHA · TIPO" (ex.: "LONG LIFE · FORÇA · Equipamento"; linha exibida só quando
  DEP-1.1 resolver).
- **QUANTIDADE** , saldo físico do produto (soma de `fato_estoque_saldo.quantidade` sobre os
  locais físicos, ou o local filtrado), "35 un.", alinhado à direita, `tabular-nums`.
- **QTDE EM DEMANDA** , demanda a atender do produto (bucket `ABERTA`, janela da pílula), "3
  un.".
- **QTDE DISPONÍVEL** , `saldo − demanda`, "32 un.", colorida (verde positivo; vermelho quando
  negativa = vendido mais do que há, sinal de necessidade de compra).

**Ordenação** (§7.2, [MUST]): por qualquer coluna, asc/desc. Numérico maior↔menor (quantidade,
demanda, disponível), texto A↔Z (produto). Ordenação default: disponível crescente (o mais
negativo primeiro, maior urgência de compra), espelhando `queryEstoqueDisponivelDiretoria`
(que ordena do mais negativo para o mais positivo). Desempate estável por `produtoId` para não
repetir/pular linha entre páginas.

**Rolagem/densidade:** contêiner com `overflow-x`/`overflow-y` próprio; a página nunca rola na
horizontal (§7.2). Paginação ou virtual-scroll conforme o volume (o protótipo mostra scroll
vertical interno da tabela).

---

### 1.5 Regras de negócio e edge cases

- **RN-1.1 , Só estoque de verdade.** Todo agregado de saldo (KPIs, cards por local,
  composições, coluna quantidade) considera **apenas `quantidade > 0`** e **locais
  físicos** (`classificacao='fisico'` via `localIdsPorClassificacao`). Linhas zeradas (produto
  que já saiu) e negativas (furo de inventário) ficam fora do valor. Sem esse filtro o KPI
  somaria estoque Virtual (~R$ 10,2 mi) e de Terceiros (~R$ 6,1 mi), e as negativas
  subtraíam ~R$ 10,5 mi (219 linhas no cache real). Regressão conhecida, já corrigida em
  `queryIndicadoresEstoque`; não reintroduzir.
- **RN-1.2 , Valoração a custo com índice, produto a produto.** Valor = `quantidade ×
  fato_produto.preco_custo`, depois dividido pelo índice de `getIndiceEstoque` (padrão 0,95).
  Produto sem custo cadastrado entra com zero e é contado em `produtosSemCusto` (RF-1.13).
  Nunca usar `fato_estoque_saldo.vrSaldo` (o valor do Odoo) para o KPI, ou o card e o donut da
  mesma tela contariam o estoque por critérios diferentes.
- **RN-1.3 , Comparação fixa em 30 dias por snapshot, na MESMA base do card de hoje.** A
  variação dos KPIs de saldo compara o valor/quantidade de agora com o de 30 dias atrás, lidos
  de `fato_estoque_saldo_snapshot`. **Não reusar `pontoEstoqueNaData`** (função privada de
  `src/lib/reports/queries/estoque.ts`): ela agrega o snapshot **sem filtro de local físico**,
  **sem `quantidade>0`**, devolve **só a quantidade agregada** (não por produto) e usa
  `vrSaldo` , três incompatibilidades com o card de hoje. A base de 30 dias exige uma
  **consulta nova** sobre `fato_estoque_saldo_snapshot` que aplique **o mesmo filtro físico +
  positivo do card de hoje** (RN-1.1): (1) resolve os locais físicos por join de
  `snapshot.localId` a `fato_estoque_local` com `classificacao='fisico'` e mantém só
  `quantidade > 0`; (2) agrega **por produto** e revaloriza a custo como
  `Σ(snapshot.quantidade × preco_custo atual ÷ índice)` , a mesma regra dos KPIs de hoje
  (RN-1.1/RN-1.2), **nunca** `vrSaldo` (valor Odoo). Sem esse alinhamento a variação % fica
  incoerente: compararia um total sem filtro físico/positivo e valorado pelo Odoo (passado) com
  o total físico/positivo a custo (presente), gerando um % falso. Fallback: quando não há foto
  no intervalo (data anterior à 1ª foto), cair no aviso honesto de reconstrução, no mesmo padrão
  da exportada `queryEstoqueComparativo`. **Validação (contra o cache real):** conferir que o
  valor de 30 dias atrás recomputado pela consulta nova bate com o card de hoje na mesma foto
  (índice e filtros idênticos), ver CA-1.6.
- **RN-1.4 , Sem comparação para demanda, disponível e a chegar.** O snapshot fotografa saldo,
  não pedido nem OC (DEP-1.4). Esses cards exibem "Sem base de comparação" (§7.1), nunca um %
  inventado, até existir um snapshot de demanda/OC. Não emular a comparação por reconstrução:
  demanda a entregar muda de escopo com a pílula, e reconstruir 30 dias atrás daria número sem
  lastro.
- **RN-1.5 , Partes somam o todo.** Cards por local, composições e Demanda x Disponível usam
  exatamente a valoração dos KPIs (a custo, com índice). A soma dos valores dos cards por local
  tem que ser igual ao card "Valor total". Hoje `agrupaSaldo` valora a custo **sem** o índice;
  ao estender para esta tela, aplicar o índice (ou expor `valorGeral` já com índice) para
  fechar com o KPI. Verificar no cache real que Σ(cards por local) = card Valor total (é um CA,
  ver CA-1.4).
- **RN-1.6 , Disponível por subtração no agregado.** `quantidadeDisponivel = quantidadeTotal −
  quantidadeEmDemanda` e `valorDisponivel = valorTotal − valorEmDemanda`, calculados sobre os
  totais, não somando os disponíveis por produto. Motivo: por produto o disponível pode ser
  negativo (vendeu mais do que há), e somar negativos rebaixaria o disponível agregado; no
  agregado o disponível é o saldo total livre.
- **RN-1.7 , Demanda maior que saldo (furo/venda a descoberto).** Por produto, disponível
  negativo é legítimo e informativo (urgência de compra), mostrado em vermelho na tabela. Na
  barra 100% empilhada de Demanda x Disponível, se a demanda do escopo passar do saldo, **não**
  desenhar barra acima de 100%: exibir disponível 0% e um aviso "demanda acima do saldo" (a
  barra representa a composição do saldo, não a dívida). A quantidade a atender já vem com piso
  em zero por item (o Odoo devolve "a atender" negativo quando entregou mais que o pedido; o
  piso evita crédito de estoque fantasma).
- **RN-1.8 , Status do produto na tabela.** zerado/negativo/positivo é sobre o **saldo** do
  produto no escopo do filtro de local (não sobre o disponível). O filtro de status opera após
  os demais filtros. Atenção: a regra RN-1.1 (só `quantidade>0`) vale para os **agregados**;
  a tabela, para poder oferecer o filtro "zerado" e "negativo", precisa **incluir** produtos
  com saldo 0 ou < 0. Logo a query da tabela (Q-1.5) não pode herdar o `quantidade>0` cego,
  ela traz todo o saldo por produto e o filtro de status recorta. Isso é intencional e
  diferente dos KPIs; documentar para não "consertar" achando que é bug.
- **RN-1.9 , Estoque é do grupo inteiro (sem empresa).** `fato_estoque_saldo` não tem
  `empresa_id` (conferido em produção). Todos os números de saldo/valor/composição são do
  grupo. Onde a conta mistura saldo com pedido (demanda, disponível), o recorte por empresa
  também fica de fora de propósito: filtrar só a demanda por empresa e subtrair do saldo do
  grupo fabricaria disponibilidade que não existe. Portanto o filtro global de empresa (§6.4)
  **não** aparece nesta tela, ou aparece desabilitado com o aviso (RF-1.11).
- **RN-1.10 , Frescor do dado no card "Última atualização".** Usar a última sync do fato
  (`max(fato_estoque_saldo.atualizadoEm)`), no padrão "atualizado há Xs"/timestamp de §6.6, e
  não o horário de renderização da página. O protótipo escreve "renderização", mas isso
  enganaria: dois usuários veriam horas diferentes para o mesmo dado.
- **RN-1.11 , Demanda com política de venda futura (engatilhado).** Se
  `VENDA_FUTURA.RESERVA_ESTOQUE_ATE_REMESSA` estiver ligada, a demanda inclui também o
  `simples_faturamento` (venda futura já faturada, reservada até a remessa), como já faz
  `queryEstoqueDisponivelDiretoria`. Manter o mesmo predicado (`OR bucketDemanda='ABERTA' /
  categoriaOperacao='simples_faturamento'`) para o card, a tabela e o bloco Demanda x
  Disponível falarem o mesmo número (invariante INV1: card == relatório para a mesma pílula).
- **RN-1.12 , Kits/BOM na demanda.** A demanda a entregar pode conter kits que consomem
  componentes; `queryEstoqueDisponivelDiretoria` já usa `desmembrarDemanda`/`montarBomPorPai`.
  Se a tabela por produto reusar essa base, a demanda por componente já vem desmembrada;
  garantir que o número da coluna "Qtde em demanda" case com o card #9 (mesma fonte).
- **RN-1.13 , Nomes nulos viram balde nomeado.** `Sem marca`, `Sem linha`, `Sem tipo`,
  `Sem local`, `Sem nome` , nunca fatia/linha com rótulo vazio.
- **Edge case , sem snapshot no intervalo:** data de 30 dias atrás anterior à 1ª foto → a
  comparação cai em reconstrução com aviso (mesmo padrão de `queryEstoqueComparativo`); os KPIs
  de saldo exibem o valor de hoje e a variação com o aviso, não um número travestido de exato.
- **Edge case , índice não configurado:** cair no default 0,95 de `getIndiceEstoque`, nunca
  dividir por zero.
- **Edge case , produto sem custo:** entra com valor zero e some do agregado de valor, mas
  aparece na quantidade e é contado em `produtosSemCusto`; o gap fica visível (RF-1.13).

---

### 1.6 Consultas (queries)

Todas em `src/lib/diretoria/queries/estoque.ts` (estendendo o arquivo existente), recebendo
`prisma: PrismaClient` e devolvendo dado de agregação puro (sem shaping de gráfico, sem
`estado`/`freshness`, que ficam no wrapper). `hoje: Date` sempre injetado (nunca `Date.now()`)
para testabilidade. Filtros de período resolvidos por `resolverJanelaDemanda`
(`src/lib/diretoria/periodo.ts`).

**Tipos compartilhados propostos:**

```ts
export interface FiltrosEstoqueModulo {
  periodo?: string;        // preset da pílula (afeta só a demanda, RF-1.10)
  de?: string;             // custom
  ate?: string;
  localId?: number;        // seletor Geral × local (composição e demanda x disponível)
  // A tela NÃO passa empresaId (RN-1.9).
}
```

**Q-1.1 , `queryIndicadoresEstoqueModulo` (os 12 cards).**

```ts
export interface IndicadoresEstoqueModulo {
  valorTotal: number;              // a custo ÷ índice (#1)
  valorACusto: number;             // sem índice (conferência)
  indice: number;
  valorMedioPorLocal: number;      // #2
  ticketMedioProdutos: number;     // #3
  valorEmDemanda: number;          // #4
  valorDisponivel: number;         // #5
  valorAChegar: number;            // #6
  quantidadeTotal: number;         // #7 (= itens)
  quantidadeMediaPorLocal: number; // #8
  quantidadeEmDemanda: number;     // #9
  quantidadeDisponivel: number;    // #10
  quantidadeAChegar: number | null;// #11 (null até DEP-1.3)
  locaisAtivos: number;
  pctValorEmDemanda: number;       // valorEmDemanda ÷ valorTotal
  pctValorDisponivel: number;
  pctQtdEmDemanda: number;
  pctQtdDisponivel: number;
  ultimaAtualizacao: Date | null;  // max(atualizadoEm)
  produtosSemCusto: number;
  linhasNegativas: number;
  // Variação 30 dias (só saldo): null quando sem base (RN-1.4)
  varValorTotal30d: number | null;
  varQuantidadeTotal30d: number | null;
  varValorMedioLocal30d: number | null;
  varQtdMediaLocal30d: number | null;
  varTicketMedio30d: number | null;
  avisoComparacao?: string;        // aviso de reconstrução, se houver
}

export async function queryIndicadoresEstoqueModulo(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosEstoqueModulo = {},
): Promise<IndicadoresEstoqueModulo>;
```

Composição interna (reuso, não reescrita):
- Saldo: reusa a lógica de `queryIndicadoresEstoque` (índice, `quantidade>0`, físico,
  `custoPorProduto`, `linhasNegativas`, `produtosSemCusto`, `locais`).
- Demanda: reusa `queryEstoqueDisponivelDiretoria` (ou extrai o núcleo comum) para obter
  `Σ demanda(p)` e, juntando `custoPorProduto`, `Σ demanda(p) × custo(p)`.
- A chegar: `queryComprasAtivas(prisma, hoje, ∞, {})` → `valorTotal` vira `valorAChegar`;
  `quantidadeAChegar` fica `null` (DEP-1.3: `fato_compra` não tem quantidade e não há fato de
  itens de compra).
- Comparação 30d: **consulta nova** sobre `fato_estoque_saldo_snapshot`, **não**
  `pontoEstoqueNaData` (privada, sem `export`, sem filtro físico/positivo, agregada e em
  `vrSaldo`). A consulta nova aplica o filtro físico + `quantidade>0` e revaloriza **por
  produto** a custo ÷ índice, na base do card de hoje (RN-1.3). Para o fallback "sem foto no
  intervalo" (aviso de reconstrução), reusar a exportada `queryEstoqueComparativo`
  (ou, se preferir chamar `pontoEstoqueNaData` direto, ela **precisa ser exportada** antes).

Pseudo-SQL do núcleo de saldo (agregação já feita em memória sobre linhas cruas, como no
código atual):

```sql
-- Linhas base (uma varredura), agregada no app:
SELECT s.produto_id, s.local_id, s.quantidade
FROM fato_estoque_saldo s
WHERE s.quantidade > 0
  AND s.local_id IN (:locais_fisicos);
-- valorACusto = Σ quantidade * preco_custo[produto_id]
-- valorTotal  = valorACusto / :indice
-- itens       = Σ quantidade
-- locaisAtivos= COUNT(DISTINCT local_id com quantidade>0)
```

Pseudo-SQL da demanda (itens de pedido a atender, bucket ABERTA, janela da pílula sem corte):

```sql
SELECT i.produto_id, SUM(GREATEST(i.quantidade_a_atender, 0)) AS demanda
FROM fato_pedido p
JOIN fato_pedido_item i ON i.pedido_id = p.odoo_id  -- FatoPedidoItem.pedidoId (pedido_id) -> FatoPedido.odooId
WHERE p.data_orcamento >= :janela_demanda_gte  -- janelaDemandaAberta (piso 2000, sem corte)
  AND p.data_orcamento <  :janela_demanda_lt
  AND ( p.bucket_demanda = 'ABERTA'
        OR (:reserva_venda_futura AND p.categoria_operacao = 'simples_faturamento') )
GROUP BY i.produto_id;
-- quantidadeEmDemanda = Σ demanda
-- valorEmDemanda      = (Σ demanda * preco_custo[produto_id]) / :indice
```

**Q-1.2 , `queryDistribuicaoPorLocal` (cards por local).**

```ts
export interface LocalEstoqueCard {
  localId: number;
  local: string;          // rótulo (localNome)
  valor: number;          // a custo, com índice
  quantidade: number;
  ticketLocal: number;    // valor ÷ quantidade
  pctValor: number;       // valor ÷ valorTotalGrupo
  pctQuantidade: number;  // quantidade ÷ quantidadeTotalGrupo
}

export async function queryDistribuicaoPorLocal(
  prisma: PrismaClient,
): Promise<{ cards: LocalEstoqueCard[]; valorTotal: number; quantidadeTotal: number }>;
```

Base: estender `agrupaSaldo(prisma, "localNome", "Sem local", "fisico")`, que já agrupa por
`localId` (não por texto) e devolve `{linhas, valorGeral}`. Adicionar `quantidade` por local,
o `ticketLocal`, e aplicar o índice no valor (RN-1.5). Ordenar por `valor` desc.

Pseudo-SQL:

```sql
SELECT s.local_id, s.local_nome, s.produto_id, s.quantidade
FROM fato_estoque_saldo s
WHERE s.quantidade > 0 AND s.local_id IN (:locais_fisicos);
-- por local_id: valor = Σ quantidade * preco_custo / :indice; quantidade = Σ quantidade
-- ticketLocal = valor / quantidade; pctValor = valor / Σvalor; pctQtd = qtd / Σqtd
```

**Q-1.3 , `queryComposicaoEstoque` (marca / linha / tipo, Geral × local).**

```ts
export type AnguloComposicao = "marca" | "linha" | "tipo";

export interface FatiaComposicao {
  chave: string;      // rótulo (marcaNome | linha | tipo | balde "Sem ...")
  valor: number;      // a custo, com índice
  quantidade: number;
  pctValor: number;   // participação por valor (padrão §7.3)
}

export async function queryComposicaoEstoque(
  prisma: PrismaClient,
  angulo: AnguloComposicao,
  opts: { localId?: number } = {},
): Promise<{ fatias: FatiaComposicao[]; valorTotal: number; disponivel: boolean }>;
```

- `angulo="marca"`: reusa `agrupaSaldo(campo="marcaNome")` + índice. `disponivel=true`.
- `angulo="tipo"`: junta `produtoId → fato_produto.tipo` (DEP-1.2). `disponivel=true`.
- `angulo="linha"`: agrupa por `linha` (DEP-1.1). Enquanto o campo não existe,
  `disponivel=false` e `fatias=[]` (a UI mostra o aviso, RF-1.6/1.12).
- `localId` presente: acrescenta `AND local_id = :localId` ao `where`.

Pseudo-SQL (ângulo tipo, com join ao catálogo):

```sql
SELECT s.produto_id, s.quantidade
FROM fato_estoque_saldo s
WHERE s.quantidade > 0
  AND s.local_id IN (:locais_fisicos)
  AND (:localId IS NULL OR s.local_id = :localId);
-- em memória: tipo = catalogoTipo[produto_id]; agrupa por tipo
-- valor = Σ quantidade * preco_custo / :indice; pctValor = valor / Σvalor
```

**Q-1.4 , `queryDemandaVsDisponivel` (quantidade e valor, Geral × local).**

```ts
export interface DemandaVsDisponivel {
  quantidade: { demanda: number; disponivel: number; total: number;
                pctDemanda: number; pctDisponivel: number };
  valor:      { demanda: number; disponivel: number; total: number;
                pctDemanda: number; pctDisponivel: number };
}

export async function queryDemandaVsDisponivel(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosEstoqueModulo = {},
): Promise<DemandaVsDisponivel>;
```

Saldo do escopo (grupo ou `localId`) menos demanda do escopo (janela da pílula, RF-1.10).
`disponivel = total − demanda` por subtração (RN-1.6), com o guard de RN-1.7 (demanda > saldo
não gera barra > 100%). Valor a custo com índice. Reaproveita os núcleos de saldo e demanda de
Q-1.1 para não divergir dos KPIs.

**Q-1.5 , `queryEstoquePorProduto` (tabela).**

```ts
export interface LinhaEstoqueProduto {
  produtoId: number | null;
  produto: string;
  marca: string;      // ou "Sem marca"
  linha: string;      // "Sem linha" até DEP-1.1
  tipo: string;       // "Sem tipo" (DEP-1.2)
  saldo: number;      // pode ser 0 ou < 0 (RN-1.8)
  demanda: number;    // a atender, bucket ABERTA, janela da pílula
  disponivel: number; // saldo − demanda
  status: "positivo" | "zerado" | "negativo";
}

export async function queryEstoquePorProduto(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosEstoqueModulo & {
    busca?: string; marca?: string; linha?: string; tipo?: string;
    status?: "positivo" | "zerado" | "negativo";
    ordenarPor?: "produto" | "saldo" | "demanda" | "disponivel";
    dir?: "asc" | "desc";
  } = {},
): Promise<{
  linhas: LinhaEstoqueProduto[];
  resumo: { produtos: number; unidades: number; emDemanda: number; disponiveis: number };
}>;
```

Base: cruza o saldo por produto (como `queryEstoqueGranular`, mas **sem** o `quantidade>0` cego
, RN-1.8) com a demanda por produto (como `queryEstoqueDisponivelDiretoria`) e o catálogo
(`fato_produto` para tipo/linha). Aplica busca/filtros/ordenação. `resumo` alimenta o cabeçalho
dinâmico da seção. Marca/tipo/linha para o subtítulo e para os filtros vêm de `fato_produto`
(tipo/linha) e `fato_estoque_saldo`/`fato_produto` (marca).

Pseudo-SQL (saldo por produto, sem filtro de sinal, com filtro de local opcional):

```sql
SELECT s.produto_id, s.produto_nome, s.marca_nome, SUM(s.quantidade) AS saldo
FROM fato_estoque_saldo s
WHERE s.local_id IN (:locais_fisicos)
  AND (:localId IS NULL OR s.local_id = :localId)
GROUP BY s.produto_id, s.produto_nome, s.marca_nome;
-- juntar demanda[produto_id] (Q-1.1) e catálogo (tipo, linha);
-- disponivel = saldo - demanda; status por sinal do saldo;
-- filtrar por busca/marca/linha/tipo/status; ordenar por :ordenarPor :dir,
-- desempate por produto_id.
```

**Wrapper de página:** compõe Q-1.1..Q-1.5, injeta `estado`/`freshness` (§6.6) e os textos de
aviso (índice, produtos sem custo, linhas negativas, empresa não aplicável, linha ausente).
Vive na página `src/app/(protected)/diretoria/*` do módulo (§4.3), reusando os componentes de
`src/components/ui/**` (§7).

---

### 1.7 Filtros e parâmetros

- **Pílula de período (§6.3):** presets de `DIRETORIA_PERIODO_PRESETS` (Hoje, Esta semana,
  Este mês, Este ano, Tudo, Personalizado). Resolvida por `resolverJanelaDemanda(params,
  hoje)`, **não** por `resolverPeriodoDir`, porque nesta tela o período rege **só a demanda**,
  com a exceção de janela: `janelaDemandaAberta` (piso `PISO_DEMANDA_ABERTA = "2000-01-01"`),
  sem grampear no corte de leitura. "Tudo" abre a janela inteira (do primeiro pedido em
  diante). Saldo, valor, distribuição por local e composições **ignoram** a pílula (foto do
  agora).
- **Seletor de ângulo da composição (§7.3):** `marca` | `linha` | `tipo`. Estado de UI, não
  vai à URL obrigatoriamente; Q-1.3 recebe `angulo`.
- **Seletor Geral × local (RF-1.7):** `localId?`. Afeta 1.4.3 e 1.4.4; **não** afeta os 12
  KPIs. Só locais físicos com saldo aparecem como opção.
- **Filtros da tabela (1.4.5):** `busca`, `localId`, `marca`, `linha` (DEP-1.1), `tipo`
  (DEP-1.2), `status` (positivo/zerado/negativo), `ordenarPor`, `dir`.
- **Filtro de empresa (§6.4):** **não se aplica** (RN-1.9). Se houver barra global de empresa
  na diretoria, esta tela a ignora e mostra um aviso "Estoque é do grupo inteiro (sem
  empresa)". Não passar `empresaId` a nenhuma query deste módulo.
- **Corte de dados (§6.1):** saldo e composição não clampam (foto do agora). A comparação de
  30 dias clampa o piso ao corte (`corteAtualDate()`) dentro da consulta nova de snapshot
  (RN-1.3), o mesmo piso que `queryEstoqueComparativo` aplica. A demanda usa
  a exceção (`janelaDemandaAberta`). Compras/OC seguem o corte (`janelaClampada`) dentro de
  `queryComprasAtivas`.
- **Parâmetro `hoje`:** injetado em Q-1.1, Q-1.4, Q-1.5 e no comparativo; nunca ler o relógio
  dentro da query.

---

### 1.8 Estados e validações

- **Carregando:** skeleton dos 12 cards, dos cards por local, dos gráficos e da tabela (§7.5).
- **Vazio (sem estoque físico):** se `quantidadeTotal = 0`, exibir mensagem acionável
  ("Nenhum saldo físico positivo no cache. Verifique a última sincronização.") em vez de zeros
  mudos; ainda assim mostrar o card 12 (última atualização) para o usuário saber o frescor.
- **Vazio por filtro (tabela):** "Nenhum produto para os filtros aplicados" + botão limpar
  filtros; o cabeçalho de resumo mostra "0 produto(s)".
- **Composição por linha indisponível (DEP-1.1):** o ângulo "Linha" mostra estado informativo
  ("Atributo linha ainda não cadastrado no Odoo") e não quebra; marca e tipo seguem normais.
- **Sem base de comparação:** cards de demanda/disponível/a chegar (e o card 12) exibem "Sem
  base de comparação" no lugar do delta (§7.1, RN-1.4).
- **Aviso de reconstrução (30 dias):** quando não há foto no intervalo, o delta dos KPIs de
  saldo vem com o aviso (mesmo padrão de `queryEstoqueComparativo`; comparação exata só a partir
  da 1ª foto).
- **Avisos de qualidade de dado:** `produtosSemCusto > 0` → nota "N produtos sem custo
  cadastrado (fora do valor)"; `linhasNegativas > 0` → nota "N linhas de saldo negativo (furo,
  fora do valor)". Informativos, cor de aviso, não erro (RF-1.13).
- **Erro de query:** mensagem que explica e sugere ação (§7.5), nunca "Erro" seco. O núcleo de
  agregação não captura exceção (deixa propagar para o wrapper, padrão do arquivo de queries).
- **Validações de entrada:** `localId` inexistente → tratar como "Geral" (ignorar filtro
  inválido, não estourar); `status`/`ordenarPor`/`dir` fora do enum → cair no default;
  `periodo` inválido → cair em "Tudo" (janela aberta da demanda).
- **Tema e acessibilidade (§7.6):** contraste AA em claro e escuro; cores da barra Demanda x
  Disponível (amarelo/verde) não podem ser o único portador de significado , legenda textual
  com % e valor sempre presente; alvo de toque ≥44px nos seletores e dropdowns; `tabular-nums`
  nos números.

---

### 1.9 Critérios de aceite

- **CA-1.1** Os 12 cards renderizam com rótulo, valor no formato correto (R$ com milhar e
  centavos; unidades com "un."), legenda de base e variação conforme a tabela 1.4.1. O card 12
  mostra data/hora da última sync do fato e "Sem base de comparação".
- **CA-1.2** No cache real, por caminho **independente** (espelhando o CA-1.4 dos locais):
  `valorEmDemanda` recomputado como `Σ` por produto de `demanda(p) × preco_custo(p) ÷ índice`
  (varredura direta dos itens de pedido `ABERTA` na janela da pílula) bate com o card #4
  (tolerância de 1 centavo), e a mesma prova em quantidade (`Σ demanda(p)` = card #9). Isso
  valida `valorEmDemanda`/`valorDisponivel` por uma soma independente, e **não** pela
  identidade `demanda + disponível = total`, que é verdadeira por construção (o disponível é
  definido por subtração, RN-1.6, então aquela igualdade nunca falharia e não prova nada).
- **CA-1.3** `valorTotal = valorACusto ÷ índice` com o índice de `getIndiceEstoque`; alterar o
  índice na Configuração muda o card na mesma proporção; `valorACusto` puro fica disponível
  para conferência.
- **CA-1.4** A soma dos valores dos cards por local (1.4.2) é igual ao card "Valor total"
  (mesma base de valoração, RN-1.5); a soma das quantidades por local é igual à "Quantidade
  total"; `pctValor` e `pctQuantidade` de cada local somam ~100%.
- **CA-1.5** Só saldo positivo e locais físicos entram nos agregados: um produto com saldo 0
  ou negativo não altera valor/quantidade dos KPIs, e o negativo aparece no aviso
  `linhasNegativas` (verificado contra as ~219 linhas negativas do cache).
- **CA-1.6** A variação dos KPIs de saldo compara com a foto de 30 dias atrás do
  `fato_estoque_saldo_snapshot`, com o **mesmo filtro físico + `quantidade>0`** e a **valoração
  a custo por produto ÷ índice** do card de hoje (não `vrSaldo`, não o agregado sem filtro de
  `pontoEstoqueNaData`); sem foto no intervalo, o aviso de reconstrução aparece e nenhum % falso
  é exibido.
- **CA-1.7** O seletor de ângulo troca a composição (marca/tipo) no mesmo espaço; participação
  por valor com quantidade no detalhe; fatias ordenadas por valor desc; nulos no balde "Sem
  ...". O ângulo "Linha" fica indisponível com aviso enquanto DEP-1.1 não fechar.
- **CA-1.8** O seletor Geral × local recalcula composição e Demanda x Disponível só para o
  local escolhido (subtítulo muda para "Local: X"), sem alterar os 12 KPIs de topo.
- **CA-1.9** Demanda x Disponível: as duas barras somam 100%; a visão quantidade fecha com a
  quantidade total do escopo e a visão valor com o valor total do escopo; demanda a custo.
- **CA-1.10** A tabela: busca por nome filtra as linhas; cada dropdown (local/marca/linha/tipo/
  status) recorta corretamente; a ordenação por coluna funciona asc/desc; a coluna disponível
  = saldo − demanda e fica vermelha quando negativa; o cabeçalho de resumo reflete o conjunto
  filtrado.
- **CA-1.11** O filtro de status "zerado" e "negativo" retorna produtos com saldo 0 e < 0
  (prova de que a query da tabela não herdou o `quantidade>0` dos agregados, RN-1.8).
- **CA-1.12** A pílula de período altera apenas os números de demanda/disponível (cards, bloco
  e coluna da tabela), nunca o saldo/valor/composição; "Tudo" abre a janela inteira da demanda;
  a demanda não é cortada pela data de início das análises (exceção de janela).
- **CA-1.13** O filtro de empresa não aparece (ou está desabilitado com aviso) e nenhuma query
  do módulo recebe `empresaId`.
- **CA-1.14** Estados vazio/carregando/erro seguem §7.5; avisos de `produtosSemCusto`/
  `linhasNegativas` aparecem quando > 0.
- **CA-1.15** `tsc` + `jest` verdes para as novas queries (testes com `hoje` fixo e dado
  semeado, incluindo o caso de saldo negativo, produto sem custo, demanda > saldo e ausência
  de snapshot) e teste end-to-end contra o cache real conferindo que os 12 números batem com o
  esperado (§9, teste E2E obrigatório).

---

### 1.10 Dependências

- **DEP-1.1 (bloqueante para linha):** atributo `linha` em `fato_produto` (+ propagação para
  `fato_estoque_saldo`/`_snapshot`), da camada base B1 (§8.1). Sem ela: composição e filtro por
  linha ficam vazios com aviso; o resto do módulo entrega normal. Depende do cliente cadastrar
  a linha no Odoo.
- **DEP-1.2 (join ou propagação):** `tipo` de produto não está em `fato_estoque_saldo`;
  resolver por join `produtoId → fato_produto.tipo` (imediato) ou propagando no builder
  (preferível). Não bloqueia a entrega, mas define o custo da composição por tipo.
- **DEP-1.3 (novo fato de itens de compra, confirmado):** `fato_compra` **não tem** coluna de
  quantidade (conferido no schema) e **não existe** fato de itens de compra, então a "quantidade
  a chegar" é indisponível hoje. Só passa a existir com um novo fato de itens de OC não
  recebidas na camada base. Até lá o card #11 fica `null`; "valor a chegar" (#6) não é afetado.
- **DEP-1.4 (comparação demanda/OC):** ausência de snapshot de demanda e de OC impede a
  variação de 30 dias desses KPIs; default é "Sem base de comparação".
- **Camada base §8:** motor de ciclos (B2), importadores (B3), status por produto (B4) e
  snapshot de fechamento (B5) **não** são requisitos deste módulo (são do Módulo 2). Só B1 o
  toca.
- **Herdado da plataforma:** RBAC de leitura (§7.7), design system `src/components/ui/**`,
  ThemeProvider, helpers de corte (`corte-dados.ts`), índice de estoque (`indice-estoque.ts`),
  classificação de local (`locais-por-classificacao.ts`), período da diretoria (`periodo.ts`)
  e o snapshot diário já gravado pelo worker (`capturarSnapshotEstoqueDiario`). Nenhum deles a
  criar; todos a reusar.
- **Rebuild de container:** as novas queries vivem em `src/lib/diretoria/queries/estoque.ts`
  (consumido pelo `app`); mudanças exigem rebuild do `app` em dev local (§2.1). Se DEP-1.1/1.2
  tocarem builder/schema de estoque, rebuildar `worker` (via `app`) e `mcp` conforme o mapa de
  impacto.
