## Módulo 4 , Financeiro por CNPJ
> Tela: 13. Prioridade de entrega: 5ª (menor).

Referência visual: `referencias-telas/13-financeiro-por-cnpj.png`.
Referência funcional: `ESCOPO-FUNCIONAL.md` seção "4. Módulo Financeiro por CNPJ".
Convenções, glossário, regras transversais, padrões de UI e camada base: `ESCOPO-TECNICO-DETALHADO.md` Parte I (§2 identificadores e MoSCoW, §3 glossário, §5.4 fontes financeiras, §6 regras transversais, §7 padrões de UI, §8.3 B3 importadores de dado manual). Este módulo apenas REFERENCIA essas seções, não as repete.

Este é o único módulo cujo eixo primário de leitura é a **empresa (CNPJ)** e não o período. A pílula de período continua valendo (recorta faturamento e gastos), mas a tela é estruturada como um bloco por empresa do grupo, mais um consolidado no topo (§6.4: "no módulo Financeiro o recorte por empresa é estrutural").

---

### 4.1 Objetivo e usuário

**Objetivo.** Dar à diretoria uma leitura de resultado (lucro) por empresa do grupo e do grupo consolidado, no período selecionado, respondendo três perguntas por CNPJ: quanto faturou, quanto gastou, e quanto sobrou (faturamento menos gastos). Sobre os gastos, abrir a composição por categoria do plano de contas e, dentro de cada categoria, o detalhamento por despesa/fornecedor. Sobre o grupo, apontar qual empresa mais faturou, qual mais gastou e qual teve o melhor resultado.

**Usuário.** Diretoria e sócios (perfis `admin` / `super_admin`), que hoje já têm "bom controle" do financeiro por fora da plataforma (transcrição: "menor prioridade, já há bom controle hoje"). A tela consolida numa leitura só o que hoje eles cruzam manualmente entre relatórios.

**Estado atual.** As queries de núcleo financeiro já existem em `src/lib/reports/queries/financeiro.ts` (463 linhas: saldo, caixa, fluxo, contas a receber, contas a pagar, títulos vencidos) e a métrica de faturamento por empresa já existe em `src/lib/metrics/fiscal/faturamento-por-empresa.ts`. **A página de diretoria financeira não existe** , é construção nova. Nenhuma tela de financeiro por CNPJ está publicada hoje na diretoria.

**Fronteira firme.** A **composição da receita** fica **fora de escopo** nesta entrega. Motivo (transcrição): o plano de contas que classifica os lançamentos controla hoje apenas a **despesa**; "tem que ter um plano também pra receita" e ele ainda não existe. Faturamento entra apenas como número agregado por empresa (fonte fiscal), nunca decomposto por categoria. Ver §4.6 RN-4.9.

---

### 4.2 Pré-requisitos de dado (tabelas, campos, gaps)

Fontes canônicas (§5.4):

- **`dim_empresa_grupo`** (`prisma/schema.prisma`, model `DimEmpresaGrupo`): `odooId`, `nome`, `cnpj`, `tipo` ('matriz' | 'filial'), `uf`, `ativo`. É a dimensão das 6 empresas do grupo e a fonte do rótulo (nome + CNPJ) de cada bloco e do recorte de UF da própria empresa.
- **`fato_nota_fiscal`** (model `FatoNotaFiscal`) e seus itens de venda (base canônica F2.5): origem do **faturamento por empresa**, via `empresaId`, `dataEmissao`, receita determinada por CFOP (`ehReceita`). Não é lida diretamente aqui: é consumida pela métrica existente `faturamentoPorEmpresa` (ver Q-4.1).
- **`fato_financeiro_titulo`** (model `FatoFinanceiroTitulo`): títulos a pagar/receber. Campos usados: `tipo` ('a_pagar' | 'a_receber'), `empresaId`, `participanteId`, `participanteNome` (fornecedor), `contaId`, `contaNome`, `dataDocumento`, `dataVencimento`, `dataPagamento`, `vrTotal`, `vrDocumento`, `vrSaldo`. É a base do **gasto por empresa** (soma de a_pagar por competência).
- **`fato_financeiro_lancamento_item`** (model `FatoFinanceiroLancamentoItem`): itens do lançamento financeiro (rateio por conta gerencial). Campos: `odooId`, `lancamentoId`, `tipo` (herdado do lançamento pai), `contaId`, `contaNome`, `centroResultadoId`, `centroResultadoNome`, `descricao`, `pedidoId`, `vrDocumento`, `vrTotal`, `vrSaldo`, `dataDocumento`. É a **base da composição de despesa por categoria** (§5.4: "base da composição de despesa por categoria"). O vínculo com o fornecedor sai de `lancamentoId` → `fato_financeiro_titulo.odooId` (o `finan.lancamento` é o mesmo id nas duas tabelas).
- **`fato_conta_contabil`** (model `FatoContaContabil`): plano de contas da empresa. Campos: `odooId`, `codigo`, `nome`, `tipo`, `nivel`, `natureza`, `contaPaiId`, `contaPaiNome`, `parentPath`, `caracteristicaSaldo`, `ehRedutora`. É o dicionário que dá **nome e agrupamento (categoria)** a cada `contaId` das despesas. A categoria de topo da rosca (Supply, Logística, Impostos, Folha, Marketing, Tecnologia...) é a **conta pai** (ou um nível do `parentPath`), não a conta folha.

**Gaps de dado (dependências de cadastro no Odoo, resolvidos na camada base , §8.3 B3):**

- **DEP-4.1 (plano de contas de despesa classificado , BLOQUEANTE da composição).** A composição de gastos por categoria só existe se os lançamentos a pagar estiverem **classificados** no plano de contas. Transcrição: "isso aqui tá vinculado com o plano de contas, que a gente vai colocar em prática ainda" e "vai depender de vocês fecharem aquele plano de contas". Enquanto o cliente não lançar/fechar o plano de contas, `fato_financeiro_lancamento_item.contaId` vem vazio ou aponta para contas genéricas, e a rosca de composição fica sem substância. As categorias da tela-referência (Supply, Logística, Impostos, Folha, Marketing) são **fictícias** ("são categorias fictícias"). B3 item 3 cobre este dado (categorias do plano de contas + mapeamento categoria → grupo de despesa) via Odoo ou importador auxiliar.
- **DEP-4.2 (campo UF na conta a pagar , BLOQUEANTE do recorte por UF).** O recorte de despesa por estado depende de um **campo de UF lançado na conta a pagar**. Transcrição: "a gente vai separar estado dentro da hora de lançar um contas a pagar, a gente vai ter o campo lá de UF", "vai selecionar a empresa, a categoria e o estado". Hoje esse campo **não existe** em `fato_financeiro_titulo` nem em `fato_financeiro_lancamento_item`. Depende de (a) o Odoo passar a lançar a UF na conta a pagar (frente em desenvolvimento pelo lado do cliente, "não sei se o Thiago já está desenvolvendo") e (b) a F2 mapear esse campo para uma coluna `uf` no fato. B3 item 4 cobre este dado. Ver RN-4.8.
- **DEP-4.3 (mapeamento empresa ↔ CNPJ estável).** O bloco por empresa precisa casar `empresaId` (que vem no fato de faturamento e no título) com `dim_empresa_grupo` para exibir nome + CNPJ. **Cuidado documentado:** `faturamentoPorEmpresa` hoje **não** usa `dim_empresa_grupo` para o nome porque o `odooId` da dimensão está "deslocado" em relação ao `empresaId` da nota (ver comentário no código da métrica, linhas 24-27), e por isso rotula pelo `empresaNome` da própria nota. O bloco por CNPJ deste módulo **precisa** do CNPJ formatado, que só existe em `dim_empresa_grupo`. É obrigatório sanar o de-para antes de exibir CNPJ: cruzar por `cnpj` ou por um de-para explícito, nunca assumir `empresaId == dim.odooId`. Ver RN-4.7.
- **DEP-4.4 (categoria de topo).** Definir com o cliente qual nível do plano de contas é a "categoria" da rosca (conta pai imediata, um nível fixo do `parentPath`, ou um mapeamento manual conta → grupo de despesa). B3 item 3 prevê o mapeamento categoria → grupo. Sem essa definição, a rosca pode nascer com dezenas de fatias (uma por conta folha) em vez das ~6 categorias do protótipo.

**Fora de escopo de dado:** composição da receita por plano de contas (não há plano de contas de receita , DEP não aberta nesta fase). Ver `ESCOPO-FUNCIONAL.md` "Fora de escopo".

---

### 4.3 Requisitos funcionais

MoSCoW conforme §2.2.

- **RF-4.1 (Must).** Consolidado do grupo no topo: cards de Faturamento total do grupo, Gastos totais do grupo e Resultado consolidado (faturamento − gastos), somando as 6 empresas no período selecionado.
- **RF-4.2 (Must).** Cards de destaque do grupo: Maior faturamento (empresa), Maior gasto (empresa) e Melhor resultado (empresa), cada um mostrando o nome da empresa e o valor.
- **RF-4.3 (Must).** Um bloco por empresa do grupo (6 CNPJs), cada bloco com título (nome + CNPJ formatado) e quatro cards: Faturamento, Gastos, Resultado (faturamento − gastos) e % Gastos/Faturamento.
- **RF-4.4 (Must).** Badge de resultado no cabeçalho de cada bloco: "Resultado positivo · R$ X" (verde) ou "Resultado negativo · R$ X" (vermelho), conforme o sinal do resultado da empresa.
- **RF-4.5 (Must).** Por empresa, gráfico de rosca "Composição das despesas" por categoria do plano de contas, com legenda ordenada por valor decrescente, mostrando por categoria o valor e o % dos gastos da empresa. **Depende de DEP-4.1.**
- **RF-4.6 (Must).** Drill lateral por categoria: ao clicar numa fatia/linha da rosca, o painel lateral "Detalhamento de <categoria>" mostra Total da categoria, % dos gastos da empresa e nº de lançamentos, mais a lista por despesa/fornecedor com valor e % da categoria. **Depende de DEP-4.1.**
- **RF-4.7 (Should).** Recorte por UF das despesas: por empresa, e por empresa + UF, saber quanto cada estado gastou (transcrição: "por CNPJ e por UF"). **Depende de DEP-4.2.** Enquanto a UF não é lançada, este recorte fica oculto/desabilitado com aviso, não quebra a tela.
- **RF-4.8 (Should).** Pílula de período (§6.3) recorta faturamento e gastos de todos os blocos e do consolidado simultaneamente.
- **RF-4.9 (Could).** Comparação vs. período anterior (§6.2) nos cards de faturamento, gastos e resultado por empresa (verde melhora / vermelho piora). Entra só depois da tela base validada.
- **RF-4.10 (Won't, nesta fase).** Composição da receita por categoria (não há plano de contas de receita). Registrado para frente futura.

---

### 4.4 Métricas e fórmulas

Notação de dado conforme §2.3; moeda/percentual conforme §2.4. Todos os valores monetários vêm de `Decimal` no Prisma e são convertidos com `Number()` no shaping (padrão do `financeiro.ts`, linha 11).

- **M-4.1 , Faturamento por empresa.**
  Fonte: métrica canônica `faturamentoPorEmpresa` (`src/lib/metrics/fiscal/faturamento-por-empresa.ts`), que soma `valorProdutos` dos **itens de venda com `ehReceita = true`** (receita por CFOP), agrupados por `empresaId`, na janela `{ periodoDe, periodoAte }`.
  Fórmula: `faturamentoEmpresa = Σ item.valorProdutos onde item.ehReceita e item.empresaId = E`.
  Observação: essa base é a mesma do `faturamento_periodo` da diretoria (reconciliada ao centavo, ver comentário do código), então o consolidado deste módulo bate com o faturamento do grupo em outras telas. Elimina intragrupo por CFOP (transferência interna não é `ehReceita`).

- **M-4.2 , Gasto por empresa.**
  Fonte: `fato_financeiro_titulo` com `tipo = 'a_pagar'`, `empresaId = E`, `dataDocumento` na janela clampada ao corte.
  Fórmula: `gastoEmpresa = Σ titulo.vrDocumento onde titulo.tipo='a_pagar' e titulo.empresaId=E e dataDocumento ∈ janela`.
  Critério: **competência** (pelo `dataDocumento`), não caixa; inclui título pago e não pago do período (o gasto é o custo incorrido, não o desembolso). Ver RN-4.2 (definição de gasto) e RN-4.3 (intragrupo).
  **Base do valor (vrDocumento vs vrTotal).** O card usa `vrDocumento` (principal do título), não `vrTotal`. Motivo: em `fato_financeiro_titulo`, `vrJuros`, `vrMulta` e `vrDesconto` são colunas próprias do título, e `vrTotal` já as embute (principal ± encargos). O rateio por conta gerencial em `fato_financeiro_lancamento_item` (base da composição, M-4.7) tende a cobrir só o **principal**, então `Σ item.vrTotal` por lançamento raramente igualaria `titulo.vrTotal` (o resíduo seria exatamente juros/multa/desconto). Para o card "Gastos" e a rosca (M-4.7) reconciliarem limpo, **os dois lados usam a mesma base de principal**: card = `Σ titulo.vrDocumento`; composição = `Σ item.vrDocumento` por categoria. Encargos financeiros (juros/multa/desconto) são evento de caixa, não custo de competência da operação, e ficam fora deste card (podem virar recorte próprio numa frente futura). Ver RN-4.5 (reconciliação e passo de validação) e RN-4.3 (intragrupo).

- **M-4.3 , Resultado por empresa.**
  Fórmula: `resultadoEmpresa = faturamentoEmpresa − gastoEmpresa` (M-4.1 − M-4.2). Positivo = lucro, negativo = prejuízo. É o "lucro, um menos o outro" da transcrição.

- **M-4.4 , % Gastos/Faturamento por empresa.**
  Fórmula: `pctGastos = faturamentoEmpresa > 0 ? gastoEmpresa / faturamentoEmpresa : null`. Exibido em % com 1 casa (ex.: 44,2%). Quando faturamento = 0, exibir "," (traço/indisponível), nunca dividir por zero. Ver RN-4.4.

- **M-4.5 , Consolidado do grupo.**
  `faturamentoGrupo = Σ faturamentoEmpresa`; `gastoGrupo = Σ gastoEmpresa`; `resultadoGrupo = faturamentoGrupo − gastoGrupo`. Ver RN-4.3 sobre intragrupo no gasto consolidado.

- **M-4.6 , Destaques do grupo.**
  `maiorFaturamento = argmax_E faturamentoEmpresa`; `maiorGasto = argmax_E gastoEmpresa`; `melhorResultado = argmax_E resultadoEmpresa`. Cada um devolve `{ empresaNome, valor }`. Empate: desempate determinístico por `empresaId` ascendente.

- **M-4.7 , Composição de despesa por categoria (por empresa).**
  Fonte: `fato_financeiro_lancamento_item` (despesa) agrupado pela **categoria** derivada de `fato_conta_contabil` (conta pai / nível de `parentPath`, DEP-4.4), escopado à empresa via join ao título.
  Fórmula por categoria C: `gastoCategoria = Σ item.vrDocumento onde categoria(item.contaId)=C e empresa(item)=E e dataDocumento ∈ janela`.
  **Mesma base de principal do card (M-4.2):** a composição soma `vrDocumento` do item, não `vrTotal`, para reconciliar com o card "Gastos" (que também soma `vrDocumento` do título). Usar `vrTotal` dos dois lados deixaria o resíduo de juros/multa/desconto (colunas próprias do título, ausentes no rateio) preso permanentemente em "Não classificado" (RN-4.5), mesmo com o plano de contas 100% lançado.
  `pctCategoriaDoGasto = gastoCategoria / gastoEmpresa` (% dos gastos da empresa; o "32,3% dos gastos" da tela). Ver RN-4.5 (reconciliação com M-4.2 e passo de validação) e RN-4.6.

- **M-4.8 , Detalhe por despesa/fornecedor dentro da categoria.**
  Fonte: os itens da categoria C da empresa E, agrupados por **fornecedor** (`participanteNome` via join `item.lancamentoId → titulo.odooId`) ou por `descricao` do item quando não houver fornecedor.
  Por linha: `valor = Σ item.vrDocumento do fornecedor` (principal, RN-4.5); `pctDaCategoria = valor / gastoCategoria`; `numLancamentos = count(item)`. Total da categoria e nº de lançamentos são os cabeçalhos do painel lateral.

- **M-4.9 , Gasto por UF (por empresa e por empresa+UF).**
  Fonte: mesmos itens/títulos de despesa, agrupados pela **UF lançada na conta a pagar** (campo de DEP-4.2, ainda inexistente).
  Fórmula: `gastoUf = Σ vrDocumento onde uf(despesa)=U e empresa=E ∈ janela` (principal, RN-4.5). Enquanto o campo não existe, M-4.9 não é calculável (RF-4.7 desabilitado). Ver RN-4.8.

---

### 4.5 Especificação da tela por seção

Layout geral (referência `13-financeiro-por-cnpj.png`): cabeçalho "FINANCEIRO / Faturamento, gastos e resultado por CNPJ" com subtítulo; faixa de cards consolidados do grupo; abaixo, uma sequência vertical de blocos, um por empresa, cada um com seus quatro cards + a área de composição/detalhamento. Fundo escuro (tema do design system). Seguir §7 (padrões de UI): cards de KPI (§7.1), tabela de dados (§7.2), rosca de composição (§7.3/§7.4), estados (§7.5), acessibilidade e tema (§7.6), RBAC (§7.7). **Reuso antes de criação.**

#### 4.5.1 Consolidado do grupo (cards de topo)

Faixa horizontal de 6 cards (na referência, alinhados no topo):

1. **Faturamento total do grupo** , valor M-4.5 `faturamentoGrupo`. Legenda: "Soma dos 6 CNPJs".
2. **Gastos totais do grupo** , valor M-4.5 `gastoGrupo`. Legenda: "Despesas consolidadas".
3. **Resultado consolidado** , valor M-4.5 `resultadoGrupo`. Legenda: "Faturamento menos gastos". Cor do valor: verde se positivo, vermelho se negativo.
4. **Maior faturamento** , M-4.6: nome da empresa em destaque + valor abaixo.
5. **Maior gasto** , M-4.6: nome da empresa + valor.
6. **Melhor resultado** , M-4.6: nome da empresa + valor.

Cards 1-3 são "número + legenda" (§7.1). Cards 4-6 são "nome da empresa + valor" (destaque textual). Todos respondem à pílula de período. Exibir frescor do dado (§6.6) no rodapé da faixa ("atualizado há Xs", timestamp da última sync que alimentou `fato_financeiro_titulo` / faturamento).

#### 4.5.2 Bloco por empresa (por CNPJ)

Um bloco por empresa do grupo, na ordem: matriz primeiro, depois filiais por faturamento decrescente (desempate por `empresaId`). Cada bloco:

- **Cabeçalho:** nome da empresa (ex.: "Icaro Fit Corp LTDA") + CNPJ formatado (ex.: "CNPJ 12.345.678/0001-90") vindo de `dim_empresa_grupo`. À direita, badge de resultado (RF-4.4): "Resultado positivo · R$ 938.000" (verde) ou "Resultado negativo · R$ X" (vermelho).
- **Quatro cards (§7.1):**
  - **Faturamento** , M-4.1. Legenda "Total faturado no período".
  - **Gastos** , M-4.2, valor em cor de alerta (âmbar na referência). Legenda "Despesas vinculadas ao CNPJ".
  - **Resultado** , M-4.3, verde/vermelho conforme sinal. Legenda "Faturamento menos gastos".
  - **% Gastos/Faturamento** , M-4.4. Legenda "Gastos sobre faturamento". Quando faturamento = 0, exibir "," e tooltip explicando (RN-4.4).
- **Área de composição/detalhamento:** ver 4.5.3 (rosca à esquerda, painel lateral à direita).

Todos os 6 blocos usam o **mesmo componente** parametrizado por `empresaId` (reuso). Nada de componente novo por empresa.

#### 4.5.3 Composição das despesas (rosca) + drill lateral por categoria

Duas colunas dentro do bloco da empresa:

**Coluna esquerda , "Composição das despesas" (rosca):**
- Rosca (donut) com centro "100,0% / GASTOS" (§7.4), uma fatia por categoria (M-4.7), cores do design system.
- Ao lado da rosca, legenda em lista: por categoria, nome + "% dos gastos" (ex.: "Supply , 32,3% dos gastos") + valor à direita (ex.: "R$ 240.000"). Ordenada por valor decrescente.
- Texto de ajuda: "Clique em uma fatia para detalhar a categoria ao lado."
- Interação: clicar numa fatia OU numa linha da legenda seleciona a categoria e atualiza a coluna direita. Categoria selecionada fica destacada (a referência mostra a linha "Supply" realçada). Estado inicial: primeira categoria (maior valor) pré-selecionada.

**Coluna direita , "Detalhamento de <categoria>" (painel lateral, M-4.8):**
- Subtítulo dinâmico: "R$ 240.000 , 32,3% dos gastos da empresa" (total da categoria + % dos gastos).
- Três mini-cards no topo: **Total categoria** (`gastoCategoria`), **% dos gastos** (`pctCategoriaDoGasto`), **Lançamentos** (`numLancamentos`).
- Barras horizontais por despesa/fornecedor (top N), com valor à direita (visão rápida por magnitude).
- Tabela "DESPESA / FORNECEDOR | VALOR | % CATEGORIA": uma linha por fornecedor/descrição, valor e % da categoria (M-4.8). Ordenada por valor decrescente. Tabela conforme §7.2 (ordenação determinística, maiores primeiro).

Toda esta seção depende de DEP-4.1 (plano de contas classificado). Sem ela, exibir o estado vazio de 4.9 no lugar da rosca.

#### 4.5.4 Recorte por UF (por CNPJ + UF)

Depende de DEP-4.2 (campo UF na conta a pagar). Quando o dado existir:
- Dentro do bloco da empresa, um seletor/aba adicional "Por estado" que reagrupa a composição de despesa pela UF (M-4.9), respondendo "qual estado está gastando" (transcrição).
- Visão dupla: por empresa (todas as UFs daquela empresa) e por empresa + UF (drill numa UF mostra as categorias/fornecedores daquele estado naquela empresa).
- Enquanto o campo UF não é lançado no Odoo: a aba fica **desabilitada** com aviso "Recorte por estado disponível quando a UF for lançada nas contas a pagar", nunca em branco nem quebrada. A tela base (4.5.1-4.5.3) funciona sem este recorte.

---

### 4.6 Regras de negócio e edge cases

- **RN-4.1 , Escopo de empresas.** Os blocos cobrem as empresas de `dim_empresa_grupo` com `ativo = true`. Empresa inativa não gera bloco. A ordem é matriz primeiro (`tipo = 'matriz'`), depois filiais por faturamento decrescente.
- **RN-4.2 , Definição de "gasto".** Gasto = despesa por **competência**: soma de `fato_financeiro_titulo.vrTotal` com `tipo='a_pagar'` cujo `dataDocumento` cai no período, pago ou não. Não é o desembolso de caixa (`fato_financeiro_movimento`), nem a dívida em aberto (`vrSaldo > 0`) das telas de contas a pagar. Justificativa: o card "Gastos" da tela mede o custo incorrido no período para casar com o faturamento do mesmo período (regime de competência), coerente com "resultado = faturamento − gastos".
- **RN-4.3 , Intragrupo no gasto (decisão a confirmar com o cliente).** No **bloco por empresa**, o gasto **inclui** títulos a pagar contra outra empresa do grupo, porque para aquele CNPJ isolado é despesa real (diferente da regra de dívida das telas de contas a pagar, que elimina intragrupo via `filtrarTitulosExternos`). No **consolidado do grupo**, um título a pagar intragrupo entra **uma vez** como gasto da empresa A (o lado da empresa B é um `a_receber`, não um gasto, logo não aparece em M-4.2). O problema não é dobra, é **assimetria com o faturamento**: o faturamento consolidado já é limpo de interno (M-4.1 exclui a receita intragrupo por CFOP), então incluir a despesa intragrupo uma vez, sem a receita correspondente do outro lado, **infla o gasto consolidado** e **subestima o `resultadoGrupo`**. Para os dois lados da conta (receita e despesa) ficarem no mesmo critério, o consolidado precisa eliminar a despesa intragrupo. Portanto: ou (a) exibir o gasto consolidado como a soma bruta dos blocos (aceitando que reflete a soma das visões individuais, mas com resultado subestimado) ou (b) eliminar intragrupo só no consolidado via `filtrarTitulosExternos`. **Decisão pendente (DEP de produto):** default proposto = (b), gasto consolidado elimina intragrupo, e cada bloco mantém o seu; documentar a diferença na tela ("consolidado elimina transações entre empresas do grupo"). Não deixar o número ambíguo.
- **RN-4.4 , Divisão por zero em % Gastos/Faturamento.** Se `faturamentoEmpresa = 0` (empresa que não faturou no período mas teve gasto), `pctGastos = null`, exibido como "," com tooltip "Sem faturamento no período". O resultado (M-4.3) ainda é calculado (fica negativo, = −gasto).
- **RN-4.5 , Reconciliação composição ↔ card de gastos.** A soma das categorias da rosca (Σ M-4.7) **deve** igualar o card "Gastos" da empresa (M-4.2). Para que isso feche limpo, **os dois lados somam a mesma base de principal (`vrDocumento`)**: card = `Σ titulo.vrDocumento`; rosca = `Σ item.vrDocumento` por categoria (ver M-4.2 e M-4.7). Somar `vrTotal` dos dois lados quebraria a reconciliação de forma **permanente**, porque `vrJuros`/`vrMulta`/`vrDesconto` são colunas próprias do título e `vrTotal` as embute, mas o rateio de `fato_financeiro_lancamento_item` cobre só o principal, então `Σ item.vrTotal ≠ titulo.vrTotal` mesmo com o plano de contas 100% lançado, e o resíduo de encargos ficaria eternamente colado em "Não classificado".
  **Passo de validação (contra o cache, obrigatório antes de declarar pronto).** Rodar, no cache real, a conferência por lançamento `Σ item.vrDocumento == titulo.vrDocumento` (agrupando itens por `lancamento_id` e comparando com o título correspondente por `titulo.odoo_id`). O esperado é fechar ao centavo na base de principal; qualquer diferença sistemática que sobre é o resíduo de juros/multa/desconto (que **não** deve estar em `vrDocumento`) e precisa ser investigada, não mascarada.
  **"Não classificado" = falta de plano de contas, não encargo.** A categoria explícita **"Não classificado"** na rosca cobre apenas o gasto de principal cujo item não tem `contaId` (ou cujo título não tem item de rateio), tornando visível o quanto do plano de contas ainda falta lançar (DEP-4.1). O resíduo de juros/multa/desconto **não** cai em "Não classificado": ele fica fora do card "Gastos" por construção (base `vrDocumento`), como registrado em M-4.2. Nunca esconder diferença: se após o passo de validação sobrar diferença de principal, ela aparece como "Não classificado".
- **RN-4.6 , Categoria = conta pai.** A categoria da rosca é o agrupamento de contas (conta pai / nível de `parentPath` definido em DEP-4.4), não a conta folha. Conta redutora (`ehRedutora = true`) subtrai dentro da sua categoria (respeitar `caracteristicaSaldo`), não vira fatia positiva.
- **RN-4.7 , De-para empresa ↔ CNPJ.** Nunca assumir `empresaId == dim_empresa_grupo.odooId` (o id da dimensão está deslocado , ver comentário em `faturamento-por-empresa.ts` linhas 24-27). O CNPJ e o nome oficial do bloco saem de `dim_empresa_grupo`, cruzando por um de-para explícito (por `cnpj` ou tabela de-para), com fallback ao `empresaNome` do fato quando não resolver, sinalizando "empresa não mapeada".
- **RN-4.8 , UF ausente.** Sem o campo UF (DEP-4.2), o recorte por estado é omitido/desabilitado; a tela base não depende dele. Quando existir, despesa sem UF lançada cai num balde "Sem UF" explícito (mesmo padrão do mapa por UF da diretoria), nunca é distribuída ou escondida.
- **RN-4.9 , Receita não é decomposta.** Faturamento entra só como agregado por empresa (M-4.1). Não existe rosca/composição de receita nesta fase (sem plano de contas de receita). Não inventar categorias de receita.
- **RN-4.10 , Corte de dados.** Toda janela de faturamento e de gasto é clampada ao corte de dados (§6.1) pelos helpers de `corte-dados.ts` (`janelaClampada`). Faturamento e gasto de documento anterior ao corte não entram. Sem período selecionado, o piso é o corte (nunca varre o histórico inteiro).
- **RN-4.11 , Empresa sem movimento.** Empresa ativa sem faturamento nem gasto no período ainda exibe o bloco, com zeros e estado vazio na composição ("Sem despesas no período"), para o usuário saber que a empresa existe e está zerada, não sumir.

---

### 4.7 Consultas (queries)

Arquivo-alvo: **estender `src/lib/reports/queries/financeiro.ts`** (framework-neutro, sem shaping/estado/freshness , esses vivem no handler/página, conforme o cabeçalho do arquivo, linhas 4-9). Reusar os helpers já presentes: `janelaClampada`/`clampIsoAoCorte`/`corteAtualDate` de `@/lib/corte-dados`, e `filtrarTitulosExternos` (linha 458) para o caso de eliminação intragrupo. Faturamento reusa a métrica fiscal existente.

**Rebuild após mudança:** `src/lib/reports/queries/**` é consumido pela tool MCP → rebuildar o container `mcp` (mapa de impacto do CLAUDE.md do projeto). Se novos campos forem lidos de fatos, também `worker`/`app` conforme o mapa.

- **Q-4.1 , Faturamento por empresa (REUSO, sem código novo).**
  Assinatura existente:
  ```ts
  faturamentoPorEmpresa(
    prisma: PrismaClient,
    input: FaturamentoInput,            // { periodoDe?, periodoAte? }
  ): Promise<FaturamentoPorEmpresaResultado>
  // { linhas: { empresaId, empresaNome, totalNotas, valor }[],
  //   totalGrupo, empresasComFaturamento, valorSemEmpresa, totalNotasSemEmpresa }
  ```
  Arquivo: `src/lib/metrics/fiscal/faturamento-por-empresa.ts`. Já entrega faturamento por `empresaId` reconciliado com o `faturamento_periodo`. A página cruza `linhas[].empresaId` com `dim_empresa_grupo` (RN-4.7) para nome + CNPJ. Não reescrever esta lógica.

- **Q-4.2 , Gasto por empresa (NOVO em `financeiro.ts`).**
  ```ts
  export async function queryGastoPorEmpresa(
    prisma: PrismaClient,
    filtros: { periodoDe?: string; periodoAte?: string; eliminarIntragrupo?: boolean },
  ): Promise<{ porEmpresa: { empresaId: number | null; gasto: number }[]; totalGrupo: number }>
  ```
  Pseudo-SQL:
  ```
  SELECT empresa_id, SUM(vr_documento) AS gasto   -- principal (RN-4.5); NÃO vr_total
  FROM fato_financeiro_titulo
  WHERE tipo = 'a_pagar'
    AND data_documento >= :corte
    AND data_documento >= :gte AND data_documento < :lt   -- janelaClampada
  GROUP BY empresa_id;
  ```
  `eliminarIntragrupo` (RN-4.3): quando true, buscar as linhas e passar por `filtrarTitulosExternos` antes de agregar (uso no consolidado); quando false (default), soma tudo (uso no bloco por empresa). A janela vem de `janelaClampada(periodoDe, periodoAte)`; o piso `data_documento >= corteAtualDate()` reforça o corte na coluna de data real (mesmo padrão das queries existentes, linhas 240/332). Base `vr_documento` (principal), coerente com M-4.7/Q-4.3 para a rosca reconciliar (RN-4.5).

- **Q-4.3 , Composição de despesa por categoria, por empresa (NOVO).**
  ```ts
  export async function queryComposicaoDespesaPorEmpresa(
    prisma: PrismaClient,
    filtros: { empresaId: number; periodoDe?: string; periodoAte?: string },
  ): Promise<{
    categorias: { categoriaId: number | null; categoriaNome: string; gasto: number; pctDoGasto: number; numLancamentos: number }[];
    gastoEmpresa: number;
    naoClassificado: number;   // RN-4.5
  }>
  ```
  Pseudo-SQL (item de lançamento, escopado por empresa via título, categorizado por conta pai):
  ```
  SELECT COALESCE(cc.conta_pai_id, li.conta_id) AS categoria_id,
         COALESCE(cc.conta_pai_nome, li.conta_nome, 'Não classificado') AS categoria_nome,
         SUM(li.vr_documento) AS gasto,   -- principal (RN-4.5); NÃO vr_total
         COUNT(*) AS n
  FROM fato_financeiro_lancamento_item li
  JOIN fato_financeiro_titulo t  ON t.odoo_id = li.lancamento_id
  LEFT JOIN fato_conta_contabil cc ON cc.odoo_id = li.conta_id
  WHERE li.tipo = 'a_pagar'
    AND t.empresa_id = :empresaId
    AND li.data_documento >= :corte
    AND li.data_documento >= :gte AND li.data_documento < :lt
  GROUP BY 1, 2
  ORDER BY gasto DESC;
  ```
  Pós-processo: `pctDoGasto = gasto / gastoEmpresa`; a diferença entre `gastoEmpresa` (Q-4.2 da mesma empresa, mesma base `vr_documento`) e a soma das categorias vira a linha "Não classificado" (RN-4.5). Antes de declarar pronto, rodar o passo de validação da RN-4.5 (`Σ item.vr_documento == titulo.vr_documento` por lançamento) no cache real, garantindo que o resíduo não seja juros/multa/desconto mascarado. O nível de agrupamento (conta pai vs. `parentPath`) é parametrizado por DEP-4.4.

- **Q-4.4 , Detalhe de uma categoria por fornecedor/despesa (NOVO).**
  ```ts
  export async function queryDetalheCategoriaDespesa(
    prisma: PrismaClient,
    filtros: { empresaId: number; categoriaId: number | null; periodoDe?: string; periodoAte?: string },
  ): Promise<{
    linhas: { fornecedorNome: string | null; valor: number; pctDaCategoria: number; numLancamentos: number }[];
    totalCategoria: number;
    numLancamentos: number;
  }>
  ```
  Pseudo-SQL (fornecedor via join item → título; fallback na descrição do item):
  ```
  SELECT COALESCE(t.participante_nome, li.descricao) AS fornecedor_nome,
         SUM(li.vr_documento) AS valor,   -- principal (RN-4.5); NÃO vr_total
         COUNT(*) AS n
  FROM fato_financeiro_lancamento_item li
  JOIN fato_financeiro_titulo t ON t.odoo_id = li.lancamento_id
  LEFT JOIN fato_conta_contabil cc ON cc.odoo_id = li.conta_id
  WHERE li.tipo = 'a_pagar'
    AND t.empresa_id = :empresaId
    AND COALESCE(cc.conta_pai_id, li.conta_id) = :categoriaId
    AND li.data_documento >= :corte
    AND li.data_documento >= :gte AND li.data_documento < :lt
  GROUP BY 1
  ORDER BY valor DESC;
  ```
  Pós-processo: `totalCategoria = Σ valor`; `pctDaCategoria = valor / totalCategoria`; `numLancamentos` total = Σ n. Alimenta os três mini-cards + tabela do painel lateral (4.5.3).

- **Q-4.5 , Gasto por UF, por empresa (NOVO, BLOQUEADO por DEP-4.2).**
  ```ts
  export async function queryGastoPorUfEmpresa(
    prisma: PrismaClient,
    filtros: { empresaId: number; periodoDe?: string; periodoAte?: string },
  ): Promise<{ porUf: { uf: string | null; gasto: number; numLancamentos: number }[]; totalEmpresa: number }>
  ```
  Pseudo-SQL (depende da coluna `uf` a ser criada no fato de despesa por DEP-4.2):
  ```
  SELECT COALESCE(t.uf, 'Sem UF') AS uf, SUM(li.vr_documento) AS gasto, COUNT(*) AS n   -- principal (RN-4.5)
  FROM fato_financeiro_lancamento_item li
  JOIN fato_financeiro_titulo t ON t.odoo_id = li.lancamento_id
  WHERE li.tipo = 'a_pagar' AND t.empresa_id = :empresaId
    AND li.data_documento >= :corte
    AND li.data_documento >= :gte AND li.data_documento < :lt
  GROUP BY 1 ORDER BY gasto DESC;
  ```
  Não implementar até a coluna `uf` existir (RN-4.8). Balde "Sem UF" explícito.

- **Q-4.6 , Resumo consolidado do grupo (NOVO, orquestrador , pode viver no data-loader da página, não no `financeiro.ts`).**
  ```ts
  export async function queryResumoFinanceiroGrupo(
    prisma: PrismaClient,
    filtros: { periodoDe?: string; periodoAte?: string },
  ): Promise<{
    faturamentoGrupo: number; gastoGrupo: number; resultadoGrupo: number;
    maiorFaturamento: { empresaId: number; empresaNome: string; valor: number } | null;
    maiorGasto: { empresaId: number; empresaNome: string; valor: number } | null;
    melhorResultado: { empresaId: number; empresaNome: string; valor: number } | null;
    porEmpresa: { empresaId: number; empresaNome: string; cnpj: string | null;
                  faturamento: number; gasto: number; resultado: number; pctGastos: number | null }[];
  }>
  ```
  Composição: chama Q-4.1 + Q-4.2 (com `eliminarIntragrupo: true` para o consolidado, RN-4.3), cruza com `dim_empresa_grupo` (RN-4.7), calcula M-4.3/M-4.4/M-4.5/M-4.6. É o payload único da tela; cada bloco depois pede Q-4.3/Q-4.4 sob demanda (lazy no drill).

**Contrato de lista (Fase B):** toda query com lista (`categorias`, `linhas`, `porEmpresa`, `porUf`) usa ordenação determinística `valor DESC` com desempate por id, igual ao padrão já aplicado nas queries de título do arquivo (linhas 260, 347, 431), para o consumidor poder rotular "maiores" sem ambiguidade.

---

### 4.8 Filtros e parâmetros

- **Período (pílula, §6.3, RF-4.8).** `{ periodo | de, ate }` resolvido por `src/lib/diretoria/periodo.ts` (`resolverPeriodoDir`), que grampeia o início ao corte. Presets: hoje / esta semana / este mês / este ano / tudo / personalizado. A janela `{ de, ate }` recorta faturamento (Q-4.1) e gasto (Q-4.2/4.3/4.4/4.5) simultaneamente em todos os blocos e no consolidado.
- **Empresa (CNPJ).** Não é um filtro opcional aqui: é o eixo estrutural (§6.4). A tela renderiza todas as empresas ativas. Um parâmetro de URL `empresa=<empresaId>` pode ancorar/rolar até um bloco, mas não filtra os demais para fora.
- **Categoria selecionada (drill).** Estado de UI por bloco: `categoriaId` selecionada dispara Q-4.4. Default = categoria de maior valor. Não vai para a URL (estado efêmero por bloco), salvo se o time decidir deep-link.
- **UF (RF-4.7).** Parâmetro futuro `uf=<sigla>` para o recorte por estado, ativo só quando DEP-4.2 estiver resolvida.
- **Corte de dados.** Não é filtro de tela: é a configuração global (§6.1), aplicada em toda query via `janelaClampada`. Mudar o corte reparametriza a tela sem deploy.

---

### 4.9 Estados e validações

Seguir §7.5 (estados) e §6.6 (frescor). Por card, bloco e painel:

- **Carregando.** Skeletons nos cards do consolidado e por bloco; skeleton na rosca e no painel lateral durante o drill.
- **Vazio , empresa sem movimento (RN-4.11).** Bloco com cards zerados e a área de composição exibindo "Sem despesas no período para esta empresa".
- **Vazio , composição bloqueada por dado (DEP-4.1).** Quando não há `fato_financeiro_lancamento_item` classificado, a rosca é substituída por um aviso acionável: "Composição de despesas disponível quando o plano de contas for classificado no Odoo." (não é erro; é dado pendente). Se houver gasto total (Q-4.2) mas nenhuma classificação, o gasto aparece 100% em "Não classificado" (RN-4.5).
- **Recorte por UF indisponível (DEP-4.2, RN-4.8).** Aba/seletor de estado desabilitado com tooltip explicativo.
- **% Gastos/Faturamento sem base (RN-4.4).** Card exibe "," e tooltip "Sem faturamento no período".
- **Empresa não mapeada (RN-4.7).** Bloco renderiza com nome do fato e badge "empresa não mapeada" quando o de-para com `dim_empresa_grupo` falha; CNPJ fica oculto.
- **Erro de query.** Estado de erro por seção (não derruba a página inteira): a falha na composição de um bloco não deve impedir os demais blocos e o consolidado de renderizar.
- **Frescor.** Cada faixa/bloco exibe "atualizado há Xs" com o timestamp da última sync que alimentou `fato_financeiro_titulo` / `fato_nota_fiscal` (§6.6).
- **Validação de entrada.** Período validado/clampado por `periodo.ts` + `corte-dados.ts` (nunca interpolar data crua do usuário em SQL; usar `j.deIso`/`j.ateIso` como parâmetros, conforme o comentário de `corte-dados.ts` linhas 136-137). `empresaId`/`categoriaId` validados como inteiros antes da query (Zod na borda, padrão RBAC §7.7).

---

### 4.10 Critérios de aceite

Números da referência `13-financeiro-por-cnpj.png` são **fictícios** (categorias e valores de protótipo); os CAs exigem conferência contra o **cache real** (regra de raiz do projeto: E2E contra dado real, não só tsc/jest).

- **CA-4.1.** Faixa consolidada mostra Faturamento total do grupo, Gastos totais e Resultado consolidado, e `resultadoGrupo == faturamentoGrupo − gastoGrupo` ao centavo.
- **CA-4.2.** `faturamentoGrupo` deste módulo bate, ao centavo, com o `faturamento_periodo`/faturamento da diretoria no mesmo período (mesma base canônica, Q-4.1).
- **CA-4.3.** Cards Maior faturamento / Maior gasto / Melhor resultado apontam a empresa correta (argmax) e batem com o maior valor entre os blocos individuais.
- **CA-4.4.** Existe exatamente um bloco por empresa ativa de `dim_empresa_grupo`; cada bloco mostra nome + CNPJ formatado corretos (RN-4.7), sem assumir `empresaId == dim.odooId`.
- **CA-4.5.** Em cada bloco, `Resultado == Faturamento − Gastos` e `% Gastos/Faturamento == Gastos / Faturamento` (ou "," quando faturamento = 0, RN-4.4), conferidos contra o cache.
- **CA-4.6.** A soma das categorias da rosca (incluindo "Não classificado") **iguala** o card "Gastos" da empresa (RN-4.5), com os dois lados na mesma base de principal (`vrDocumento`, M-4.2/M-4.7). O passo de validação da RN-4.5 (`Σ item.vr_documento == titulo.vr_documento` por lançamento, conferido no cache real) fecha ao centavo; o card "Gastos" **não** embute juros/multa/desconto (esses ficam fora por construção, não viram "Não classificado"). Nenhuma diferença fica escondida: o que sobra em "Não classificado" é só principal sem plano de contas (DEP-4.1).
- **CA-4.7.** Clicar numa categoria atualiza o painel lateral com Total da categoria, % dos gastos e nº de lançamentos corretos, e a soma dos `% da categoria` dos fornecedores fecha em 100% (tolerância de arredondamento).
- **CA-4.8.** Trocar a pílula de período recalcula consolidado e todos os blocos de forma consistente (períodos maiores não produzem faturamento/gasto menor que subperíodos contidos, monotonicidade).
- **CA-4.9.** Faturamento/gasto de documento anterior ao corte de dados não entram; mover o corte reparametriza a tela sem re-sync (RN-4.10).
- **CA-4.10.** Sem plano de contas classificado (DEP-4.1), a tela não quebra: cards de faturamento/gastos/resultado funcionam e a composição mostra o estado vazio acionável (ou 100% "Não classificado").
- **CA-4.11.** Sem campo UF (DEP-4.2), o recorte por estado fica desabilitado com aviso e a tela base funciona normalmente.
- **CA-4.12.** Frescor ("atualizado há Xs") visível e correto; todos os valores monetários formatados em BRL conforme §2.4 (sem travessão em nenhum texto).

---

### 4.11 Dependências

**De dado / cadastro (bloqueiam funcionalidade, não a tela toda):**
- **DEP-4.1** , plano de contas de despesa classificado no Odoo (B3 item 3). Bloqueia RF-4.5/RF-4.6 (composição e drill). Sem ele: gasto total funciona, composição fica vazia ou 100% "Não classificado".
- **DEP-4.2** , campo UF na conta a pagar (B3 item 4; frente do cliente/Thiago). Bloqueia RF-4.7 (recorte por UF).
- **DEP-4.3** , de-para estável `empresaId` (fato) ↔ `dim_empresa_grupo` (CNPJ/nome). Bloqueia a rotulagem correta dos blocos (RN-4.7).
- **DEP-4.4** , definição do nível de agrupamento "categoria" no plano de contas (conta pai / `parentPath` / mapeamento manual). Necessária para a rosca ter ~6 categorias e não dezenas.

**De frente / código (reuso):**
- `src/lib/metrics/fiscal/faturamento-por-empresa.ts` (Q-4.1, faturamento por empresa).
- `src/lib/reports/queries/financeiro.ts` (Q-4.2 a Q-4.5 novas; reuso de `filtrarTitulosExternos` e do padrão de janela/corte).
- `src/lib/corte-dados.ts` (`janelaClampada`, `clampIsoAoCorte`, `corteAtualDate`) e `src/lib/diretoria/periodo.ts` (`resolverPeriodoDir`) para período/corte.
- Camada base B3 (§8.3): importadores de categorias do plano de contas e de UF quando o cliente não lançar no Odoo.
- Design system `src/components/ui/**` e padrões §7 (cards, tabela, rosca, estados). Reuso antes de criação.

**De schema / performance (índices):**
- `FatoFinanceiroTitulo` hoje indexa só `dataVencimento`, `tipo` e `pedidoId`. As queries novas Q-4.2/Q-4.3 (e Q-4.4/Q-4.5, que fazem join por `t.empresa_id`) filtram por `empresaId` + `dataDocumento`, campos **sem índice** hoje. Antes de rodar em produção com o volume real, adicionar `@@index([empresaId])` e/ou `@@index([empresaId, dataDocumento])` (ou ao menos `@@index([dataDocumento])`) em `FatoFinanceiroTitulo` no `prisma/schema.prisma`, para o `GROUP BY empresa_id` filtrado por janela não varrer a tabela inteira. É migration de índice (não altera dado): segue o protocolo de schema entre worktrees. Validar o plano (`EXPLAIN`) contra o cache real após criar o índice.

**De produto (decisões pendentes):**
- RN-4.3 , tratamento do intragrupo no gasto consolidado (default proposto: eliminar só no consolidado). Confirmar com o cliente.
- DEP-4.4 , nível de categoria. Confirmar com o cliente / contadora.

**Fora de escopo (registrado para frentes futuras):** composição da receita por plano de contas (RF-4.10/RN-4.9), margem líquida, comparação vs. período anterior nos blocos (RF-4.9 fica como Could).
