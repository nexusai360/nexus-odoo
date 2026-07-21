## Módulo 2 , Relatório de estoque (ciclos)
> Telas: 03, 04 (ciclo ativo) e 05, 06 (relatório fechado). Prioridade de entrega: 3ª.

> **Como ler esta seção.** Este módulo é o mais denso do escopo. Ele não é uma tela só: são duas
> telas distintas montadas sobre o mesmo motor de ciclo (a camada base B2, ver §8.2 B2 do documento
> principal). A tela do **ciclo ativo** lê o cache vivo e recalcula tudo a cada carregamento. A tela
> do **relatório fechado** lê exclusivamente o snapshot congelado (`ciclo_fechamento`, ver §8.5 B5),
> nunca o cache vivo. Essa distinção é a espinha dorsal do módulo e reaparece em quase toda regra
> abaixo. Antes de implementar, ter lido: §2 (convenções), §3 (glossário, principalmente as linhas de
> Ciclo, Previsão do ciclo, Consumido no ciclo, Previsão restante, Cobertura de previsão, Status do
> ciclo e Acurácia), §6 (regras transversais de dado), §7 (padrões de UI) e §8 inteira (camada base:
> B2 motor de ciclos, B3 importadores, B4 status por produto, B5 snapshot de fechamento). Este
> módulo **consome** o que a §8 constrói; aqui detalhamos o modelo de dado do ciclo (que a §8.2 apenas
> esboça), os cálculos, as duas telas, as regras de negócio, as queries e os critérios de aceite.

---

### 2.1 Objetivo e usuário

**Função de negócio.** Gerenciar a compra de estoque por período fechado (o "ciclo"). O comercial
entrega, no início do ciclo, uma **previsão de venda por produto** (quanto planeja vender de cada
modelo naquele período). O módulo cruza essa previsão com o que já foi faturado, com o que está em
estoque e com o que está em demanda, para responder uma pergunta só: **para cada produto, o estoque
comprado/planejado vai ser suficiente, insuficiente (tende a romper) ou excessivo (comprou demais)
até o fim do ciclo?** Nas palavras da reunião: "isso aqui é para a gente acompanhar se o nosso
estoque tende ou não a romper" e "acertar o timing da previsão".

**As duas telas e por que existem separadas:**

- **Tela 03/04 , Acompanhamento do ciclo ativo.** É o painel ao vivo do ciclo em andamento. Recalcula
  a cada carregamento a partir do cache (`fato_estoque_saldo`, faturamento no período,
  `fato_pedido`). Serve para o gestor agir **durante** o ciclo: ver quais produtos estão prestes a
  romper e comprar a tempo, ou ver o que está acumulando e frear compra. Muda de valor todo dia
  conforme entram vendas e chegam compras.

- **Tela 05/06 , Relatório de ciclos fechado.** É a fotografia imutável do ciclo depois que ele
  encerrou. Ao bater a `dataFim`, o sistema congela todos os números num snapshot (`ciclo_fechamento`,
  B5) e o relatório passa a ler **só** desse snapshot. Serve para **auditar** o ciclo passado (a
  previsão foi boa? comprei demais? quanto rompeu?) e **comparar** ciclos entre si. É estável: abrir o
  relatório hoje ou daqui a um ano devolve exatamente os mesmos números do dia do fechamento, mesmo
  que o estoque tenha mudado depois.

**Usuário.** Diretoria e backstage comercial/compras (perfis com acesso aos painéis de diretoria).
Segue o RBAC existente (§7.7). É um painel de decisão de compra, não operacional de chão de fábrica.

**Fronteira.** Este módulo **não** faz a importação da previsão (isso é B3, ver §8.3), **não** define as
faixas de status (isso é o pop-up B4, ver §8.4) e **não** cria o snapshot diário de estoque (isso é
`fato_estoque_saldo_snapshot`, que já existe). Ele **consome** essas quatro coisas. O que este módulo
constrói de dado novo é a **entidade de ciclo** (tabelas `ciclo`, `ciclo_previsao`,
`ciclo_status_config`, `ciclo_fechamento` e derivadas), os **cálculos centrais** e as **duas telas**.

---

### 2.2 Modelo de dado do ciclo (novo)

Nenhuma entidade de ciclo existe hoje no cache (o "ciclo" que aparece no worker é o ciclo de
sincronização, coisa completamente diferente). Todo o modelo abaixo é **novo** e vive no
`prisma/schema.prisma`. Diferente das tabelas `fato_*` (que são materializações read-only do Odoo,
reescritas pelo worker), estas tabelas são **estado próprio da plataforma** (o usuário cria ciclos,
importa previsão, parametriza status, fecha ciclos). Elas não são reescritas pelo sync; são escritas
por ações do app e pelo job de fechamento (B5).

Convenção de nomes: nome físico `snake_case` via `@@map`, modelo Prisma `PascalCase`. IDs próprios da
plataforma usam `String @id @default(cuid())` (padrão da plataforma para entidades não-Odoo), enquanto
referências a produto/local/empresa usam o `odooId` inteiro correspondente (ex.: `produtoId` casa com
`FatoProduto.odooId`), **sem** relação Prisma formal (os fatos são reescritos pelo sync; usar FK física
para eles quebraria; a junção é lógica, por `produtoId`, exatamente como as demais queries de diretoria
já fazem).

#### 2.2.1 `ciclo` (cabeçalho do ciclo)

Um registro por ciclo criado. É a raiz de tudo.

| Campo | Tipo Prisma | Nulo | Descrição |
|-------|-------------|------|-----------|
| `id` | `String @id @default(cuid())` | não | PK própria da plataforma. |
| `nome` | `String` | não | Rótulo humano do ciclo (ex.: "Ciclo 2 · Maio a Agosto", "Jan–Abr 2026"). Editável. |
| `dataInicio` | `DateTime @db.Date` | não | Primeiro dia do ciclo (inclusive), 00:00 BRT. |
| `dataFim` | `DateTime @db.Date` | não | Último dia do ciclo (inclusive), 23:59 BRT. |
| `duracaoMeses` | `Int` | não | Duração em meses (2, 3, 4...). Redundante com o par de datas, mas materializado porque a coluna de duração aparece no comparativo (RN-2.14) e evita recomputo. Deve ser consistente com `[dataInicio, dataFim]` (validação na criação, RN-2.2). |
| `status` | `CicloStatus` (enum) | não | `ATIVO` ou `FECHADO`. Default `ATIVO`. |
| `empresaId` | `Int?` | sim | `FatoPedido.empresaId` / `dim_empresa_grupo`. Quando preenchido, o ciclo é de uma empresa específica; quando nulo, consolida o grupo. Decisão do cliente pode manter sempre nulo na v1 (ver DEP-2.7). |
| `criadoEm` | `DateTime @default(now())` | não | Auditoria. |
| `atualizadoEm` | `DateTime @updatedAt` | não | Auditoria. |
| `fechadoEm` | `DateTime?` | sim | Timestamp em que o snapshot de fechamento (B5) foi gerado. Nulo enquanto `ATIVO`. |

```prisma
enum CicloStatus {
  ATIVO
  FECHADO
}

model Ciclo {
  id            String       @id @default(cuid())
  nome          String
  dataInicio    DateTime     @db.Date
  dataFim       DateTime     @db.Date
  duracaoMeses  Int
  status        CicloStatus  @default(ATIVO)
  empresaId     Int?
  criadoEm      DateTime     @default(now())
  atualizadoEm  DateTime     @updatedAt
  fechadoEm     DateTime?

  previsoes     CicloPrevisao[]
  statusConfigs CicloStatusConfig[]
  fechamento    CicloFechamento?

  @@index([status])
  @@index([empresaId, status])
  @@index([dataInicio, dataFim])
  @@map("ciclo")
}
```

**Índices.** `status` (a tela do ciclo ativo busca "o ciclo `ATIVO`"), `empresaId + status`
(quando houver ciclo por empresa), `dataInicio + dataFim` (para achar o ciclo que contém uma data e
para ordenar o dropdown de ciclos do relatório fechado).

**Invariante.** No máximo **um** ciclo `ATIVO` por escopo de empresa por vez (RN-2.1). Postgres não
tem "unique parcial" via Prisma direto de forma trivial; garantir por índice único parcial em migration
SQL crua: `CREATE UNIQUE INDEX ciclo_um_ativo_por_empresa ON ciclo (COALESCE(empresa_id, -1)) WHERE
status = 'ATIVO';`.

#### 2.2.2 `ciclo_previsao` (previsão importada por produto)

Um registro por (ciclo, produto). Alimentado pelo importador B3 (§8.3). É a coluna "Previsão do
ciclo" das telas.

| Campo | Tipo Prisma | Nulo | Descrição |
|-------|-------------|------|-----------|
| `id` | `String @id @default(cuid())` | não | PK. |
| `cicloId` | `String` | não | FK → `Ciclo.id`. |
| `produtoId` | `Int` | não | `FatoProduto.odooId`. Junção lógica. |
| `previsaoQtd` | `Decimal @db.Decimal(14,3)` | não | Quantidade que o comercial planeja vender do produto no ciclo. Sempre em unidades. Importada, manual. |
| `origemImport` | `String?` | sim | Rótulo do lote de importação (nome do arquivo / id do job B3), para trilha. |
| `criadoEm` | `DateTime @default(now())` | não | Auditoria. |
| `atualizadoEm` | `DateTime @updatedAt` | não | Reimportação sobrescreve. |

```prisma
model CicloPrevisao {
  id           String   @id @default(cuid())
  cicloId      String
  produtoId    Int
  previsaoQtd  Decimal  @db.Decimal(14, 3)
  origemImport String?
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  ciclo        Ciclo    @relation(fields: [cicloId], references: [id], onDelete: Cascade)

  @@unique([cicloId, produtoId])
  @@index([cicloId])
  @@index([produtoId])
  @@map("ciclo_previsao")
}
```

**Índices.** Único em `(cicloId, produtoId)` (uma previsão por produto por ciclo; reimportar faz
`upsert`). Índices em `cicloId` (montar a tabela do ciclo) e `produtoId`.

**Regra de conjunto de produtos.** O "conjunto de produtos do ciclo" (48 produtos na tela 03/04, 26 na
tela 05/06) é definido pela **presença de previsão**: um produto entra no ciclo se tem linha em
`ciclo_previsao`. Produto sem previsão importada não aparece na tabela do ciclo (ver RN-2.6 para o
caso de produto que vendeu no período mas não foi previsto).

#### 2.2.3 `ciclo_status_config` (faixas de status por produto)

Parametrização das faixas de status por produto (B4, §8.4). Um registro por (ciclo, produto). Só os 3
status configuráveis (risco / saudável / acumulado); ruptura prevista é regra fixa e **não** vem
daqui (RN-2.9).

| Campo | Tipo Prisma | Nulo | Descrição |
|-------|-------------|------|-----------|
| `id` | `String @id @default(cuid())` | não | PK. |
| `cicloId` | `String` | não | FK → `Ciclo.id`. As faixas são por ciclo (o cliente pode revisar de opinião entre ciclos; RN-2.10). |
| `produtoId` | `Int` | não | `FatoProduto.odooId`. |
| `unidadeBase` | `CicloFaixaUnidade` (enum) | não | `UN` ou `PCT`. Como o usuário digitou as faixas. O sistema converte um no outro (RN-2.11). |
| `riscoAte` | `Decimal @db.Decimal(14,3)` | não | Limite superior da faixa "risco de ruptura", medido na cobertura. Faixa risco = `0 < cobertura <= riscoAte`. |
| `saudavelAte` | `Decimal @db.Decimal(14,3)` | não | Limite superior da faixa "saudável". Faixa saudável = `riscoAte < cobertura <= saudavelAte`. Acima disso é acumulado/excesso. |
| `pctBase` | `Decimal? @db.Decimal(14,3)` | sim | Quando `unidadeBase = PCT`, guarda os limites como percentual e este campo registra a base de conversão usada (a `previsaoQtd` do produto no ciclo). `riscoAte`/`saudavelAte` guardam sempre o **valor em unidade já convertido** (fonte da verdade do cálculo), e o percentual original fica em `riscoAtePct`/`saudavelAtePct` para reexibir no pop-up. |
| `riscoAtePct` | `Decimal? @db.Decimal(9,3)` | sim | Percentual original digitado (quando `PCT`). |
| `saudavelAtePct` | `Decimal? @db.Decimal(9,3)` | sim | Percentual original digitado (quando `PCT`). |
| `atualizadoEm` | `DateTime @updatedAt` | não | Auditoria. |

```prisma
enum CicloFaixaUnidade {
  UN
  PCT
}

model CicloStatusConfig {
  id             String            @id @default(cuid())
  cicloId        String
  produtoId      Int
  unidadeBase    CicloFaixaUnidade
  riscoAte       Decimal           @db.Decimal(14, 3)
  saudavelAte    Decimal           @db.Decimal(14, 3)
  pctBase        Decimal?          @db.Decimal(14, 3)
  riscoAtePct    Decimal?          @db.Decimal(9, 3)
  saudavelAtePct Decimal?          @db.Decimal(9, 3)
  atualizadoEm   DateTime          @updatedAt

  ciclo          Ciclo             @relation(fields: [cicloId], references: [id], onDelete: Cascade)

  @@unique([cicloId, produtoId])
  @@index([cicloId])
  @@map("ciclo_status_config")
}
```

**Invariante de faixa.** `0 < riscoAte <= saudavelAte` (validação B4). Se violado, a tela do ciclo cai
no fallback de status (RN-2.12) e sinaliza "sem parametrização válida".

#### 2.2.4 `ciclo_fechamento` (snapshot imutável , cabeçalho agregado)

Gerado pelo job de fechamento (B5). Um registro por ciclo fechado. Guarda **todos os indicadores
agregados** da tela 05 já calculados. O relatório fechado lê daqui, nunca recalcula.

| Campo | Tipo Prisma | Nulo | Descrição / origem no dia do fechamento |
|-------|-------------|------|------------------------------------------|
| `id` | `String @id @default(cuid())` | não | PK. |
| `cicloId` | `String @unique` | não | FK 1:1 → `Ciclo.id`. |
| `geradoEm` | `DateTime @default(now())` | não | Momento do congelamento (aparece como "Última atualização" na tela 05). |
| `nome` | `String` | não | Cópia congelada de `Ciclo.nome`. |
| `dataInicio` | `DateTime @db.Date` | não | Cópia congelada. |
| `dataFim` | `DateTime @db.Date` | não | Cópia congelada. |
| `duracaoMeses` | `Int` | não | Cópia congelada (coluna de duração no comparativo). |
| `locaisConsiderados` | `Int` | não | Chip "5 locais considerados". |
| `produtosAnalisados` | `Int` | não | Chip "26 produtos analisados". |
| `valorMedioEstoque` | `Decimal @db.Decimal(16,2)` | não | Card "Valor médio do estoque". Média (por fotografia diária/mensal) do valor de custo do estoque no ciclo. |
| `maiorValorCiclo` | `Decimal @db.Decimal(16,2)` | não | Card "Maior valor no ciclo". Pico do valor de custo entre as fotografias. |
| `menorValorCiclo` | `Decimal @db.Decimal(16,2)` | não | Card "Menor valor no ciclo". Vale mínimo. |
| `variacaoInicioFim` | `Decimal @db.Decimal(16,2)` | não | Card "Variação início x fim". `valor(último dia) − valor(primeiro dia)`. Pode ser negativo. |
| `valorAcumuladoExcesso` | `Decimal @db.Decimal(16,2)` | não | Card "Valor acumulado em excesso". Σ (unidades acima do limite saudável × precoCusto) dos produtos acumulados no fechamento. |
| `valorEstimadoRuptura` | `Decimal @db.Decimal(16,2)` | não | Card "Valor estimado em ruptura". Σ (unidades faltantes × precoCusto) dos produtos que romperam. |
| `quantidadeMediaEstoque` | `Decimal @db.Decimal(14,3)` | não | Card "Quantidade média em estoque". Média de unidades no ciclo. |
| `demandaPrevistaTotal` | `Decimal @db.Decimal(14,3)` | não | Card "Demanda prevista total". Σ `previsaoQtd` do ciclo. |
| `consumoDemandaReal` | `Decimal @db.Decimal(14,3)` | não | Card "Consumo/Demanda real". Σ consumido (faturado) no ciclo. |
| `acuraciaPrevisao` | `Decimal @db.Decimal(6,3)` | não | Card "Acurácia da previsão", em % (ex.: 90.1). Fórmula em §2.5. |
| `pctRompeu` | `Decimal @db.Decimal(6,3)` | não | Card "% estoque que rompeu". |
| `pctRisco` | `Decimal @db.Decimal(6,3)` | não | Card "% em risco de ruptura". |
| `pctSaudavel` | `Decimal @db.Decimal(6,3)` | não | Card "% estoque saudável". |
| `pctAcumulado` | `Decimal @db.Decimal(6,3)` | não | Card "% estoque acumulado". |
| `qtdRompeu` | `Int` | não | Contagem de produtos que romperam (legenda "4 produtos"). |
| `qtdRisco` | `Int` | não | Contagem em risco. |
| `qtdSaudavel` | `Int` | não | Contagem saudáveis. |
| `qtdAcumulado` | `Int` | não | Contagem acumulados. |
| `cicloAnteriorId` | `String?` | sim | Ponteiro para o **`CicloFechamento.id`** (não o `Ciclo.id`) do ciclo imediatamente anterior de mesmo escopo, para o comparativo (RN-2.14). "Anterior" é resolvido por **data** (o `CicloFechamento` de maior `dataFim` estritamente menor que o `dataInicio` deste, mesmo escopo), **não** por ordem de fechamento (fechar ciclos fora de ordem cronológica não pode embaralhar o comparativo). Indexado (`@@index([cicloAnteriorId])`). Nulo se não houver anterior fechado. |

```prisma
model CicloFechamento {
  id                     String   @id @default(cuid())
  cicloId                String   @unique
  geradoEm               DateTime @default(now())
  nome                   String
  dataInicio             DateTime @db.Date
  dataFim                DateTime @db.Date
  duracaoMeses           Int
  locaisConsiderados     Int
  produtosAnalisados     Int
  valorMedioEstoque      Decimal  @db.Decimal(16, 2)
  maiorValorCiclo        Decimal  @db.Decimal(16, 2)
  menorValorCiclo        Decimal  @db.Decimal(16, 2)
  variacaoInicioFim      Decimal  @db.Decimal(16, 2)
  valorAcumuladoExcesso  Decimal  @db.Decimal(16, 2)
  valorEstimadoRuptura   Decimal  @db.Decimal(16, 2)
  quantidadeMediaEstoque Decimal  @db.Decimal(14, 3)
  demandaPrevistaTotal   Decimal  @db.Decimal(14, 3)
  consumoDemandaReal     Decimal  @db.Decimal(14, 3)
  acuraciaPrevisao       Decimal  @db.Decimal(6, 3)
  pctRompeu              Decimal  @db.Decimal(6, 3)
  pctRisco               Decimal  @db.Decimal(6, 3)
  pctSaudavel            Decimal  @db.Decimal(6, 3)
  pctAcumulado           Decimal  @db.Decimal(6, 3)
  qtdRompeu              Int
  qtdRisco               Int
  qtdSaudavel            Int
  qtdAcumulado           Int
  cicloAnteriorId        String?

  ciclo                  Ciclo                    @relation(fields: [cicloId], references: [id], onDelete: Cascade)
  produtos               CicloFechamentoProduto[]
  meses                  CicloFechamentoMes[]

  @@index([dataInicio, dataFim])
  @@index([cicloAnteriorId])
  @@map("ciclo_fechamento")
}
```

#### 2.2.5 `ciclo_fechamento_produto` (snapshot imutável , linha por produto)

Uma linha por produto do ciclo fechado. Alimenta a tabela "Produtos da fatia", a "Acurácia por
produto" e a "Mudança entre ciclos". Todos os números são **congelados**.

| Campo | Tipo Prisma | Nulo | Descrição |
|-------|-------------|------|-----------|
| `id` | `String @id @default(cuid())` | não | PK. |
| `fechamentoId` | `String` | não | FK → `CicloFechamento.id`. |
| `produtoId` | `Int` | não | `FatoProduto.odooId`. |
| `produtoNome` | `String` | não | Cópia congelada do nome (o produto pode ser renomeado depois). |
| `marcaNome` | `String?` | sim | Congelado, para os filtros do relatório. |
| `linhaNome` | `String?` | sim | Congelado (B1). |
| `tipo` | `String?` | sim | Congelado. |
| `estoqueInicial` | `Decimal @db.Decimal(14,3)` | não | Saldo no primeiro dia do ciclo (`fato_estoque_saldo_snapshot` em `dataInicio`). |
| `entradasNoCiclo` | `Decimal @db.Decimal(14,3)` | não | Unidades que **entraram** no estoque durante o ciclo. Fonte: `fato_estoque_movimento` com sentido = entrada, somado no período `[dataInicio, dataFim]` por produto (DEP-2.14). Não é "a chegar recebido" (termo vago): é o movimento de entrada real. |
| `previsaoCiclo` | `Decimal @db.Decimal(14,3)` | não | `ciclo_previsao.previsaoQtd` congelada. |
| `consumidoReal` | `Decimal @db.Decimal(14,3)` | não | Faturado no ciclo (§2.5). É o "Consumido/Demanda" da tabela. |
| `saldoCiclo` | `Decimal @db.Decimal(14,3)` | não | **Saldo real no último dia do ciclo**, lido de `fato_estoque_saldo_snapshot` em `dataFim` (fonte da verdade, já reconcilia transferências, ajustes e devoluções). A fórmula `estoqueInicial + entradasNoCiclo − consumidoReal` é só **conferência**, não a fonte: ela ignora transferências/ajustes/devoluções e não fecha sozinha (ver §2.7.3). Coluna "Saldo do ciclo". |
| `statusFinal` | `CicloStatusProduto` (enum) | não | Status congelado no fechamento: `ROMPEU`, `RISCO`, `SAUDAVEL`, `ACUMULADO`. |
| `acuracia` | `Decimal @db.Decimal(6,3)` | não | Acurácia previsto x real do produto, em % (§2.5). |
| `diferencaPrevReal` | `Decimal @db.Decimal(14,3)` | não | `consumidoReal − previsaoCiclo` (negativo = superestimado). Coluna "Diferença". |
| `statusPrevisao` | `String` | não | Rótulo textual: "Superestimado", "Aderente" ou "Subestimado" (RN-2.16). |
| `valorCustoUnit` | `Decimal? @db.Decimal(16,2)` | sim | `precoCusto` congelado, para recompor valores em filtros sem tocar o cache vivo. |

```prisma
enum CicloStatusProduto {
  ROMPEU
  RISCO
  SAUDAVEL
  ACUMULADO
}

model CicloFechamentoProduto {
  id               String             @id @default(cuid())
  fechamentoId     String
  produtoId        Int
  produtoNome      String
  marcaNome        String?
  linhaNome        String?
  tipo             String?
  estoqueInicial   Decimal            @db.Decimal(14, 3)
  entradasNoCiclo  Decimal            @db.Decimal(14, 3)
  previsaoCiclo    Decimal            @db.Decimal(14, 3)
  consumidoReal    Decimal            @db.Decimal(14, 3)
  saldoCiclo       Decimal            @db.Decimal(14, 3)
  statusFinal      CicloStatusProduto
  acuracia         Decimal            @db.Decimal(6, 3)
  diferencaPrevReal Decimal           @db.Decimal(14, 3)
  statusPrevisao   String
  valorCustoUnit   Decimal?           @db.Decimal(16, 2)

  fechamento       CicloFechamento    @relation(fields: [fechamentoId], references: [id], onDelete: Cascade)

  @@index([fechamentoId, statusFinal])
  @@index([fechamentoId, produtoId])
  @@map("ciclo_fechamento_produto")
}
```

**Índice** `(fechamentoId, statusFinal)` porque o drill da rosca filtra por status; `(fechamentoId,
produtoId)` para a junção do comparativo entre ciclos (mudança de status casa produto do ciclo atual
com o mesmo produto no ciclo anterior).

#### 2.2.6 `ciclo_fechamento_mes` (snapshot imutável , abertura/fechamento mensal)

Uma linha por mês do ciclo. Alimenta a tabela "Abertura e fechamento mensal" (tela 05). Fonte:
`fato_estoque_saldo_snapshot` no primeiro e no último dia de cada mês.

| Campo | Tipo Prisma | Nulo | Descrição |
|-------|-------------|------|-----------|
| `id` | `String @id @default(cuid())` | não | PK. |
| `fechamentoId` | `String` | não | FK → `CicloFechamento.id`. |
| `mesRef` | `String` | não | `YYYY-MM` do mês do ciclo (ex.: "2026-01"). |
| `mesLabel` | `String` | não | Rótulo humano ("Janeiro"). |
| `estoquePrimeiroDia` | `Decimal @db.Decimal(14,3)` | não | Unidades no 1º dia do mês. |
| `estoqueUltimoDia` | `Decimal @db.Decimal(14,3)` | não | Unidades no último dia do mês. |
| `variacaoQtd` | `Decimal @db.Decimal(14,3)` | não | `estoqueUltimoDia − estoquePrimeiroDia` (pode ser negativa). |
| `valorPrimeiroDia` | `Decimal @db.Decimal(16,2)` | não | Valor de custo no 1º dia. |
| `valorUltimoDia` | `Decimal @db.Decimal(16,2)` | não | Valor de custo no último dia. |
| `variacaoValor` | `Decimal @db.Decimal(16,2)` | não | `valorUltimoDia − valorPrimeiroDia`. |
| `demandaPrimeiroDia` | `Decimal? @db.Decimal(14,3)` | sim | Demanda a entregar no 1º dia do mês. **Só preenchido** para meses cobertos por um snapshot diário de demanda/OC (DEP-2.13); `null` para meses anteriores ao início desse snapshot (não é reconstruível, RN-2.24). |
| `demandaUltimoDia` | `Decimal? @db.Decimal(14,3)` | sim | Demanda a entregar no último dia. Mesma restrição de disponibilidade (DEP-2.13 / RN-2.24). |
| `disponivelPrimeiroDia` | `Decimal? @db.Decimal(14,3)` | sim | Disponível no 1º dia (`saldo − demanda`). `null` quando a demanda do 1º dia é indisponível (RN-2.24). |
| `disponivelUltimoDia` | `Decimal? @db.Decimal(14,3)` | sim | Disponível no último dia. `null` quando a demanda é indisponível (RN-2.24). |
| `aChegarNoMes` | `Decimal? @db.Decimal(14,3)` | sim | Quantidade comprada não recebida no mês (OC em trânsito). **Só preenchido** com snapshot de OC (DEP-2.13); `null` para meses anteriores (RN-2.24). |
| `consumoDoMes` | `Decimal @db.Decimal(14,3)` | não | Faturado no mês (regra de venda §2.5.1). Sempre disponível (vem das notas, não depende de snapshot). |

```prisma
model CicloFechamentoMes {
  id                    String          @id @default(cuid())
  fechamentoId          String
  mesRef                String
  mesLabel              String
  estoquePrimeiroDia    Decimal         @db.Decimal(14, 3)
  estoqueUltimoDia      Decimal         @db.Decimal(14, 3)
  variacaoQtd           Decimal         @db.Decimal(14, 3)
  valorPrimeiroDia      Decimal         @db.Decimal(16, 2)
  valorUltimoDia        Decimal         @db.Decimal(16, 2)
  variacaoValor         Decimal         @db.Decimal(16, 2)
  demandaPrimeiroDia    Decimal?        @db.Decimal(14, 3)
  demandaUltimoDia      Decimal?        @db.Decimal(14, 3)
  disponivelPrimeiroDia Decimal?        @db.Decimal(14, 3)
  disponivelUltimoDia   Decimal?        @db.Decimal(14, 3)
  aChegarNoMes          Decimal?        @db.Decimal(14, 3)
  consumoDoMes          Decimal         @db.Decimal(14, 3)

  fechamento            CicloFechamento @relation(fields: [fechamentoId], references: [id], onDelete: Cascade)

  @@unique([fechamentoId, mesRef])
  @@map("ciclo_fechamento_mes")
}
```

**Grandezas sem snapshot histórico (demanda, disponível, a chegar).** O `fato_estoque_saldo_snapshot`
guarda **só saldo** (`quantidade`, `vrSaldo`), não demanda a entregar nem ordem de compra. Logo, para
um mês já passado, `demandaPrimeiroDia`/`demandaUltimoDia`, `disponivelPrimeiroDia`/`disponivelUltimoDia`
e `aChegarNoMes` **não são reconstruíveis** a partir do que existe hoje (é a mesma limitação pela qual
o Módulo 1 não reconstrói demanda histórica, DEP-1.4/RN-1.4). Por isso essas colunas são anuláveis e só
recebem valor a partir do dia em que passar a existir um **snapshot diário próprio de demanda e de OC**
(DEP-2.13). Para meses anteriores a esse marco ficam `null` e a tela mostra "sem histórico" (RN-2.24),
nunca um número inventado. Quantidade e valor (que vêm do snapshot de saldo) e `consumoDoMes` (que vem
das notas de venda, §2.5.1) continuam sempre disponíveis. Alternativa aceita, se o cliente preferir:
remover essas colunas do fechamento mensal em vez de deixá-las anuláveis. O que **não** se faz é
prometer o dado sem fonte.

#### 2.2.7 Migrations

- **Migration 1 , `ciclos_base`:** cria os enums (`CicloStatus`, `CicloFaixaUnidade`,
  `CicloStatusProduto`) e as tabelas `ciclo`, `ciclo_previsao`, `ciclo_status_config`. Inclui o índice
  único parcial "um ativo por empresa" via SQL cru após o `CREATE TABLE` (Prisma gera o `CREATE TABLE`;
  o índice parcial entra como statement manual no arquivo de migration).
- **Migration 2 , `ciclos_fechamento`:** cria `ciclo_fechamento`, `ciclo_fechamento_produto`,
  `ciclo_fechamento_mes`. Separada da 1 para permitir entregar o ciclo ativo (telas 03/04) antes do
  fechamento (telas 05/06) sem migration morta.
- **Protocolo de schema compartilhado.** O Postgres é compartilhado entre worktrees; seguir o
  protocolo de aviso de schema (rodar `agente schema-changed` após aplicar, avisar as outras branches).
  Como nenhum container `worker`/`mcp` lê estas tabelas na v1 (só o `app`), o rebuild obrigatório é do
  `app` (ver a tabela de impacto código→container do CLAUDE.md do projeto).
- **Nenhuma tabela `fato_*` é alterada por este módulo**, exceto o campo `linha`/`linhaNome` que B1
  (§8.1) já adiciona a `FatoProduto` e aos fatos de estoque. Este módulo apenas **consome** `linhaNome`.

---

### 2.3 Pré-requisitos de dado (tabelas, campos, gaps)

Dependências de dado deste módulo. As `DEP-2.x` referenciam a camada base (§8) e cadastros do cliente.

- **DEP-2.1 (B2, §8.2) , Motor de ciclos.** As tabelas de §2.2 acima. É o coração; sem elas nenhuma
  tela existe. Construídas por este módulo (o modelo detalhado é o desta seção; a §8.2 só o esboça).
- **DEP-2.2 (B3, §8.3) , Previsão do ciclo importada.** O importador que popula `ciclo_previsao`. Sem
  ele a coluna "Previsão do ciclo" vem vazia e todos os cálculos derivados (restante, cobertura,
  status) ficam indefinidos. O importador valida: produto existe em `FatoProduto`? quantidade numérica
  e ≥ 0? ciclo válido e `ATIVO`? Linhas rejeitadas reportadas de forma acionável.
- **DEP-2.3 (B4, §8.4) , Faixas de status por produto.** O pop-up (3 pontinhos) que popula
  `ciclo_status_config`. Sem config, o produto cai no fallback de status (RN-2.12). Só afeta os 3
  status configuráveis; "ruptura prevista" nunca depende disto.
- **DEP-2.4 , `fato_estoque_saldo`.** Saldo atual por produto (coluna "Quantidade" da tela do ciclo
  ativo e o "estoque de hoje" da cobertura). Já existe. Campos: `produtoId`, `quantidade`, `localId`,
  `marcaNome`, `familiaNome`, `vrSaldo`.
- **DEP-2.5 , Faturamento por produto por período.** Fonte do "Consumido no ciclo". Vem de
  `fato_nota_fiscal_item` (`FatoNotaFiscalItem`) filtrado pela **mesma regra de venda do faturamento**
  (§2.5.1: `SO_VENDA_NOTA = { isVendaExterna: true }` da nota-mãe, `finalidadeNfe` normal, `situacaoNfe`
  autorizada, sem devolução), no período `[dataInicio, dataFim]`, agregado por `produtoId`
  (`SUM(quantidade)`). A regra de venda está em `src/lib/diretoria/queries/vendas.ts`. **Correção de
  premissa:** a `queryEntradasSaidas` de `src/lib/reports/queries/estoque.ts` **não** serve de padrão
  aqui, ela lê `fato_estoque_movimento` (`groupBy` mês/sentido), **não** `fato_nota_fiscal_item where
  entradaSaida = "1"`; é outra fonte e outro propósito (movimento de estoque, não faturamento). Já
  existe o dado; falta a query dedicada por ciclo (Q-2.2).
- **DEP-2.6 , Demanda a entregar por produto.** Coluna "Demanda" da tabela do ciclo ativo. Reusa a
  lógica de `queryDemandaPorProduto` / `queryDemandaEmAberta` de
  `src/lib/reports/queries/comercial.ts` (pedido em etapa "a entregar", `bucketDemanda`). **Exceção do
  corte (§6.1):** demanda a entregar **não** é recortada pelo corte de leitura; usa
  `janelaDemandaAberta` / `PISO_DEMANDA_ABERTA`. Ver RN-2.20.
- **DEP-2.7 , `a chegar` por produto.** Coluna "A chegar". Quantidade comprada (ordem de compra) ainda
  não recebida. Reusa a lógica de compras em trânsito de `diretoria/queries/estoque.ts`
  (`queryComprasAtivas`/`queryNecessidadeCompra`). Se o dado de "a chegar" por produto não estiver
  materializado, é gap a resolver junto (nas telas de exemplo a coluna aparece "0 un." em todas as
  linhas, indicando que na demo não havia compras em trânsito; a coluna precisa existir mesmo assim).
- **DEP-2.8 , `fato_estoque_saldo_snapshot`.** Foto diária do saldo por `dataRef`. **Já existe e é
  populada por job diário** (`src/worker/fatos/snapshot-estoque-diario.ts`). Base de: abertura/fechamento
  mensal, maior/menor/médio valor do ciclo, variação início x fim, e do estoque inicial por produto.
  Campos: `dataRef`, `produtoId`, `quantidade`, `vrSaldo`, `marcaNome`, `familiaNome`, `localId`.
- **DEP-2.9 (B5, §8.5) , Snapshot de fechamento.** O job que congela o ciclo em `ciclo_fechamento*`.
  Construído por este módulo (telas 05/06). Reusa DEP-2.8 como fonte da fotografia.
- **DEP-2.10 , `precoCusto` do produto.** `FatoProduto.precoCusto`. Valoração de "valor em risco",
  "valor em excesso" e dos valores do relatório fechado (estoque é custo, §6.5). Congelado em
  `valorCustoUnit` no fechamento.
- **DEP-2.11 (B1, §8.1) , Atributo `linha`.** Coluna e filtro "Linha" nas duas telas. Se o cliente não
  cadastrar, o filtro fica vazio e a UI tolera "Sem linha".
- **DEP-2.12 , Corte de dados (§6.1).** As leituras de histórico do ciclo ativo respeitam o corte via
  `src/lib/corte-dados.ts`. **Cuidado:** o consumido do ciclo é grampeado ao **período do ciclo**
  `[dataInicio, dataFim]`, que por definição é a janela de interesse; se o `dataInicio` do ciclo for
  anterior ao corte, o consumido só computa a partir do corte (usar `clampIsoAoCorte(dataInicio)`).
  Ver RN-2.21.

- **DEP-2.13 (NOVO gap, pré-requisito) , Snapshot diário de demanda e de ordem de compra (a chegar).**
  O `fato_estoque_saldo_snapshot` só fotografa **saldo**, não demanda a entregar nem OC em trânsito.
  Sem um snapshot diário próprio dessas duas grandezas, as colunas de demanda/disponível/a-chegar da
  tabela mensal (§2.2.6, §2.7.2) **não são reconstruíveis** para meses passados (mesma limitação do
  Módulo 1, DEP-1.4/RN-1.4). **Pré-requisito** para preencher essas colunas: criar um fato de snapshot
  diário de demanda por produto e de OC por produto (análogo ao `fato_estoque_saldo_snapshot`, populado
  por job diário). Enquanto não existir, essas colunas ficam `null` para o passado e a tela mostra "sem
  histórico" (RN-2.24). Não bloqueia a entrega das telas (estoque/valor/consumo mensal funcionam), mas
  é o que impede prometer demanda/disponível/a-chegar mensal históricos.
- **DEP-2.14 , `fato_estoque_movimento`.** Fonte das "Entradas no ciclo" (§2.2.5): movimentos de
  **entrada** por produto no período `[dataInicio, dataFim]`. É a mesma tabela que `queryEntradasSaidas`
  (`src/lib/reports/queries/estoque.ts`) lê com `groupBy` mês/sentido. **Assunção a validar contra o
  cache:** confirmar o campo de sentido (entrada vs saída) e que devoluções/transferências não são
  contadas como entrada de compra (senão o `entradasNoCiclo` infla). E2E com `SELECT` antes de fechar.

**Gaps que travam a entrega (bloqueiam se não resolvidos):** DEP-2.1, DEP-2.2, DEP-2.3 (só afeta os 3
status configuráveis). **Gaps que degradam mas não travam:** DEP-2.7 (a chegar), DEP-2.11 (linha),
DEP-2.13 (demanda/disponível/a-chegar mensal histórico do fechamento) e DEP-2.14 (entradas no ciclo).

---

### 2.4 Requisitos funcionais

MoSCoW conforme §2.2 do documento principal. Separados em 2.4.a (ciclo ativo, telas 03/04) e 2.4.b
(relatório fechado, telas 05/06).

#### 2.4.a Ciclo ativo (telas 03/04)

- **RF-2.1 [MUST]** , Selecionar o ciclo `ATIVO` do escopo e exibir seu cabeçalho (nome, período,
  duração). Se não houver ciclo ativo, estado vazio acionável ("Nenhum ciclo ativo. Crie um ciclo e
  importe a previsão.").
- **RF-2.2 [MUST]** , Exibir 8 indicadores do ciclo ativo no topo (§2.6.1): ruptura prevista, risco de
  ruptura, saudáveis, acumulados (contagens), previsto no ciclo, previsão restante (quantidades), valor
  em risco, valor em excesso (R$ a custo).
- **RF-2.3 [MUST]** , Rosca "Distribuição por status do ciclo" com total de produtos no centro e
  legenda com contagem e % por status (§2.6.2), **drill por fatia** filtrando a tabela.
- **RF-2.4 [MUST]** , Tabela por produto com as colunas: Produto (nome + linha · tipo · categoria),
  Quantidade, Demanda, Disponível, A chegar, Previsão do ciclo, Consumido no ciclo, Previsão restante,
  Cobertura de previsão, Status (§2.6.3).
- **RF-2.5 [MUST]** , Calcular, por produto, `consumidoNoCiclo`, `previsaoRestante`, `cobertura` e
  `status` conforme §2.5, a partir do cache vivo, respeitando o período do ciclo.
- **RF-2.6 [MUST]** , Classificar cada produto em um dos 4 status (§2.5.4): ruptura prevista (fixo,
  cobertura ≤ 0), risco / saudável / acumulado (faixas de `ciclo_status_config`).
- **RF-2.7 [MUST]** , Filtros da tabela: busca textual por produto, e dropdowns Local, Marca, Linha,
  Tipo e Status. Ordenação por qualquer coluna numérica (maior↔menor) e por texto (A↔Z).
- **RF-2.8 [MUST]** , Botão "3 pontinhos" no cabeçalho da tabela abre o pop-up de parametrização de
  status por produto (B4, §8.4). Este módulo apenas **aciona**; a UI/persistência do pop-up é B4. Ao
  salvar, a tabela e a rosca recalculam.
- **RF-2.9 [SHOULD]** , Subtítulo-resumo da tabela: "Ciclo X · <período> · N produto(s) · consumido
  <Σ> un. · previsão restante <Σ> un. · cobertura total <Σ> un." (linha vista na tela 04).
- **RF-2.10 [SHOULD]** , Hints das fórmulas visíveis no cabeçalho da tabela: "Previsão restante =
  Previsão do ciclo − Consumido no ciclo" e "Cobertura = Quantidade − Previsão restante" (vistos nas
  telas 03/04).
- **RF-2.11 [COULD]** , Toggle "Estoque ↔ Ciclo ativo" no topo (visto na tela 03) para alternar entre
  o módulo Estoque atual e o ciclo. Navegação, não cálculo.
- **RF-2.12 [MUST]** , Toda leitura carrega o carimbo de última atualização do cache (§6.6).

#### 2.4.b Relatório fechado (telas 05/06)

- **RF-2.13 [MUST]** , Fechamento: ao bater `dataFim` (job diário) ou por ação manual de "fechar
  ciclo", congelar o ciclo em `ciclo_fechamento*` (B5) e marcar `Ciclo.status = FECHADO`,
  `fechadoEm = now()`. Idempotente (RN-2.13).
- **RF-2.14 [MUST]** , Selecionar um ciclo fechado num dropdown e exibir o relatório **lendo de
  `ciclo_fechamento*`**, nunca recalculando do cache vivo (RN-2.15).
- **RF-2.15 [MUST]** , Exibir o cabeçalho do relatório (ciclo, período, duração, última atualização) e
  os chips (período, N locais considerados, N produtos analisados, "Status por faixa esperada de
  fechamento").
- **RF-2.16 [MUST]** , Exibir 14 indicadores (§2.7.1): valor médio, maior valor, menor valor, variação
  início x fim, valor acumulado em excesso, valor estimado em ruptura, quantidade média (linha 1);
  demanda prevista total, consumo/demanda real, acurácia da previsão, % que rompeu, % em risco, %
  saudável, % acumulado (linha 2). Cada um com variação vs. ciclo anterior (verde/vermelho) ou "Sem
  base de comparação".
- **RF-2.17 [MUST]** , Tabela "Abertura e fechamento mensal" (§2.7.2): uma linha por mês com estoque no
  1º/último dia, variação, valor 1º/último dia, variação em valor, demanda 1º/último dia, disponível
  1º/último dia, a chegar no mês, consumo do mês.
- **RF-2.18 [MUST]** , Rosca "Distribuição do ciclo" com legenda (Rompeu, Risco de ruptura, Saudável,
  Acumulou) e **drill por fatia** que lista os "Produtos da fatia" com Estoque inicial, Entradas no
  ciclo, Previsão ciclo, Consumido/Demanda, Saldo do ciclo, Status (§2.7.3).
- **RF-2.19 [MUST]** , Comparativo "Ciclo atual x ciclo anterior" (§2.7.4): tabela de indicadores lado
  a lado com variação, incluindo **coluna/linha de duração** para explicar ciclos de tamanhos
  diferentes (RN-2.14).
- **RF-2.20 [MUST]** , "Acurácia da previsão , Previsto x real por produto" (§2.7.5): Produto, Previsto,
  Real, Diferença, Acurácia (%), Status da previsão (Superestimado/Aderente/Subestimado).
- **RF-2.21 [MUST]** , "Mudança entre ciclos , Produtos que melhoraram ou pioraram" (§2.7.6): Produto,
  Status ciclo anterior, Status ciclo atual, Mudança (Permaneceu.../Mudou de faixa/Melhorou/Piorou).
- **RF-2.22 [MUST]** , Filtros do relatório fechado: Ciclo, Local de estoque, Marca, Linha, Tipo de
  produto, Visão (Geral). Os filtros operam **sobre o snapshot** (recortam/reagregam os dados
  congelados), não recalculam do cache vivo.
- **RF-2.23 [SHOULD]** , Estado do relatório para ciclo sem anterior fechado: indicadores comparativos
  mostram "Sem base de comparação" e a seção de comparativo/mudança-de-status fica com placeholder
  acionável.

---

### 2.5 Cálculos centrais do ciclo

Fonte única, reusável pelo ciclo ativo (recálculo do cache) e pelo fechamento (congela o resultado).
Todas as quantidades em unidades; valores em R$ a **custo** (§6.5). A implementação vive em
`src/lib/diretoria/queries/ciclos.ts` como funções puras testáveis (uma "calculadora de ciclo" separada
das queries de I/O), para o mesmo código produzir os números do ativo e do fechamento.

#### 2.5.1 `consumidoNoCiclo(produtoId, ciclo)`

> **Definição canônica:** consumido no ciclo = **venda faturada no período do ciclo**, pela **mesma
> regra de venda da plataforma** (a que o Módulo 3 usa para faturamento), no grão de item de
> `fato_nota_fiscal_item`. Não é pedido colocado, nem qualquer saída de estoque: é venda faturada de
> fato. **Não basta `entradaSaida = "1"`**: esse filtro conta qualquer saída (transferência,
> devolução, remessa, bonificação) e até nota cancelada (porque não olha `situacaoNfe`), o que infla o
> consumido. O consumido tem que aplicar o mesmo recorte de venda usado no faturamento.

```
consumidoNoCiclo = Σ FatoNotaFiscalItem.quantidade
  onde a nota-mãe é VENDA                        -- isVendaExterna = true (regra SO_VENDA_NOTA)
    e finalidadeNfe é normal                     -- exclui complemento/ajuste/devolução por finalidade
    e situacaoNfe é autorizada                   -- exclui cancelada/denegada
    e não é devolução
    e produtoId = <produto>
    e dataEmissao ∈ [clampIsoAoCorte(ciclo.dataInicio), ciclo.dataFim]
```

- A regra de venda é a **mesma** de `src/lib/diretoria/queries/vendas.ts` (`SO_VENDA_NOTA =
  { isVendaExterna: true }`, mais `finalidadeNfe` normal, `situacaoNfe` autorizada, sem devolução), só
  que aplicada no grão de **item** (`fato_nota_fiscal_item`) para agregar por `produtoId`. Reusar essa
  definição de venda, não reescrevê-la, para o consumido bater com o faturamento.
- **Passo de validação obrigatório (E2E, §9 do CLAUDE.md):** o consumido de um produto no período tem
  que **bater com o faturamento do Módulo 3** para o mesmo produto e o mesmo período. Se divergir, a
  regra de venda do consumido está diferente da do faturamento, é bug (CA-2.2). Conferir com `SELECT`
  nas notas antes de declarar pronto.
- O início é grampeado ao corte de dados (§6.1): se o ciclo começou antes do corte, o consumido só
  conta do corte para frente (RN-2.21). Na prática, ciclos são configurados a partir do corte, então o
  clamp raramente muda o resultado, mas é obrigatório.
- Se houver filtro de empresa (`ciclo.empresaId`), adicionar `empresaId = <empresa>` na nota.

#### 2.5.2 `previsaoRestante`

```
previsaoRestante = previsaoQtd − consumidoNoCiclo
```

- `previsaoQtd` vem de `ciclo_previsao` (importada, B3).
- **Pode ficar negativa** (decisão da reunião e do glossário §3): se o produto vendeu mais do que foi
  previsto, `consumidoNoCiclo > previsaoQtd` e o restante é negativo. **Não** aplicar piso 0
  (RN-2.5). Um restante negativo significa "já vendi tudo que previa e mais um pouco", e isso empurra a
  cobertura para cima (mais folga aparente), o que é semanticamente correto: se vendi além do previsto,
  sobra mais estoque livre da obrigação prevista.

#### 2.5.3 `cobertura`

```
cobertura = quantidadeEmEstoque − previsaoRestante
```

- `quantidadeEmEstoque` = saldo atual do produto em `fato_estoque_saldo` (somado nos locais do filtro,
  ou todos se "Todos os locais"). É o estoque de **hoje**, foto instantânea (não segue a pílula de
  período; é "agora", como no módulo Estoque).
- Interpretação (exemplo da reunião): previsão 25, consumido 10 → restante 15; estoque 35 → cobertura
  = 35 − 15 = +20. "Você ainda tem 15 para vender segundo a previsão, mas tem 35 no estoque, logo está
  positivo em 20 unidades." Cobertura positiva = folga; ≤ 0 = tende a romper.

#### 2.5.4 `status` (os 4 estados)

Ordem de avaliação (a ruptura vence tudo):

```
se cobertura <= 0:                         status = RUPTURA_PREVISTA     (fixo, RN-2.9)
senão, com faixas de ciclo_status_config (em unidade; se PCT, já convertido):
  se cobertura <= riscoAte:                status = RISCO_DE_RUPTURA
  senão se cobertura <= saudavelAte:       status = SAUDAVEL
  senão (cobertura > saudavelAte):         status = ACUMULADO_EXCESSO
```

- **Ruptura prevista é regra fixa e nunca configurável** (`cobertura ≤ 0`). "É fato, não é opinião"
  (reunião). Os outros 3 são "opinião" e variam por produto.
- As faixas são medidas **sobre a cobertura** (unidades de folga acima de zero). Exemplo da reunião: 1
  a 5 positivo = risco; 6 a 15 = saudável; acima de 20 = acumulado. Note que pode haver uma "zona
  morta" entre `saudavelAte` e o início conceitual do acumulado se o cliente digitar faixas não
  contíguas; a regra acima **não** deixa buraco: tudo acima de `saudavelAte` é acumulado.
- **Percentual (RN-2.11):** se `unidadeBase = PCT`, os limites foram digitados como % da `previsaoQtd`
  do produto e convertidos para unidade no salvamento: `riscoAte = riscoAtePct% × previsaoQtd`. A regra
  usa sempre o valor em unidade.

#### 2.5.5 Valor em risco e valor em excesso (cards agregados do ciclo ativo)

Valorados a custo (`FatoProduto.precoCusto`):

```
valorEmRisco   = Σ [ produtos com cobertura < 0 ]  (−cobertura) × precoCusto     -- unidades faltantes
valorEmExcesso = Σ [ produtos ACUMULADO_EXCESSO ]  (cobertura − saudavelAte) × precoCusto  -- unidades acima do saudável
```

- "Valor em risco" (card R$ 0 na demo): estimativa monetária do que vai faltar. Só produtos com
  cobertura negativa contribuem (unidades faltantes × custo). Na demo é R$ 0 porque nenhum produto
  rompeu.
- "Valor em excesso" (card R$ 71.453.942 na demo): estimativa do capital parado em compra excessiva.
  Só produtos acumulados, e só a parte **acima do limite saudável** (não a cobertura inteira),
  multiplicada pelo custo.
- Reunião: "esse valor é calculado com o valor de compra" e "tudo que tiver acumulado acima do
  saudável, soma e mostra o valor que a gente comprou demais".
- **Invariante de sanidade (CA-2.17):** `valorEmExcesso ≤ valorTotalEstoque` (o excesso é uma parcela
  do estoque a custo, jamais maior que o estoque inteiro). O número da demo (R$ 71.453.942) **viola**
  isso: excede o valor total do estoque do próprio painel (~R$ 22 mi), logo está errado, provável erro
  de fórmula (somar a cobertura inteira em vez de só a parte acima do saudável, e/ou multiplicar por
  preço de venda em vez de custo, e/ou a cobertura inflada por `previsaoRestante` negativa, §2.5.7). A
  implementação valida `valorEmExcesso ≤ valorTotalEstoque` e trata violação como bug (não exibe o
  número). Rever a fórmula e o número da demo antes de usar como referência.

#### 2.5.6 Acurácia da previsão (relatório fechado)

Por produto e geral. Definição operacional que casa com os números das telas (previsto 35, real 30 →
85,7%; geral previsto 1.484, real 1.337 → 90,1%):

```
erroPct   = |consumidoReal − previsaoCiclo| / previsaoCiclo × 100
acuracia  = max(0, 100 − erroPct)            -- em %, clampada em [0, 100]
```

- Legenda do card: "100% − erro percentual absoluto". Quando `consumidoReal ≤ previsaoCiclo` (caso
  comum, superestimou), isso equivale a `consumidoReal / previsaoCiclo × 100` (30/35 = 85,7%). Quando
  vendeu mais que previu, o erro também penaliza a acurácia (simétrico). O glossário §3 escreve "demanda
  real ÷ demanda prevista × 100"; adotamos a forma `100 − |erro|%` porque é a única que não estoura de
  100% quando `real > previsto` e reproduz exatamente os números das telas.
- **Acurácia geral** = `100 − |Σreal − Σprevisto| / Σprevisto × 100` (sobre os totais, não a média das
  acurácias por produto). Confirmado pela reunião: "está fazendo pelo total do que estava previsto e do
  que foi de demanda real".
- Borda `previsaoCiclo = 0`: acurácia indefinida; exibir ", /, " textual (sem travessão em dado; usar
  "sem previsão") e **não** contar o produto no denominador da acurácia geral (RN-2.6).

#### 2.5.7 Casos de borda dos cálculos

- **Vendeu mais que previu** (`consumido > previsao`): `previsaoRestante < 0` (sem piso), cobertura
  sobe. Status tende a saudável/acumulado. Acurácia penaliza pelo erro.
- **Alerta de negócio , campeão de vendas caindo em "acumulado/excesso" (rótulo invertido).** Um
  produto de **alto giro** que vende **mais** do que o previsto tem `previsaoRestante` muito negativa, o
  que **infla artificialmente a cobertura** (`cobertura = estoque − previsaoRestante`) e pode
  empurrá-lo para ACUMULADO_EXCESSO, cujo rótulo "comprou demais" fica **semanticamente invertido**:
  quem mais vendeu vira "excesso". A causa é a previsão ter subestimado o produto, não sobra real de
  estoque (e isso ainda contamina `valorEmExcesso`, §2.5.5/CA-2.17). Mitigação na UI: quando
  `previsaoRestante < 0`, sinalizar o card/linha com um aviso ("vendeu acima da previsão, cobertura
  inflada pela previsão estourada") em vez de tratar o excesso como compra equivocada; e considerar,
  como COULD, não classificar como ACUMULADO_EXCESSO um produto cujo excesso venha só de
  `previsaoRestante` negativa. Levar ao cliente para decidir a regra (a previsão do próximo ciclo desse
  produto deveria subir).
- **Produto novo / sem previsão** (`ciclo_previsao` ausente): não entra na tabela do ciclo ativo
  (RN-2.6). No fechado, se vendeu no período mas não foi previsto, aparece numa seção "vendidos sem
  previsão" opcional (COULD) ou é omitido da acurácia; nunca divide por zero.
- **Sem estoque e sem previsão restante** (`quantidade = 0`, `restante = 0`): cobertura = 0 → ruptura
  prevista (fato).
- **Sem `ciclo_status_config`**: fallback RN-2.12 (status "saudável" acima de zero + flag "sem
  parametrização", ou default global a definir).
- **Cobertura exatamente igual a `riscoAte`/`saudavelAte`**: fronteiras são inclusivas no limite
  inferior do status seguinte conforme §2.5.4 (`<=`); documentar para não gerar off-by-one entre a
  tela e o pop-up.

---

### 2.6 Especificação da tela , Ciclo ativo (telas 03/04)

Página nova `src/app/(protected)/diretoria/ciclos/page.tsx`. Modo "Acompanhamento do Ciclo Ativo".
Layout de cima para baixo: barra de modo → cards de indicadores → rosca de status → tabela detalhada.

#### 2.6.1 Barra de modo e indicadores (tela 03, topo)

- **Barra superior:** toggle "Estoque ↔ Ciclo Ativo" (RF-2.11), título "Acompanhamento do Ciclo
  Ativo", e à direita o rótulo do enfoque "Previsão, cobertura e risco".
- **8 cards de KPI** (padrão §7.1), em duas linhas (5 + 3 na tela 03):
  1. **Ruptura prevista** , contagem de produtos com cobertura ≤ 0. Legenda: "Produtos com cobertura
     menor ou igual a zero." (demo: 0)
  2. **Risco de ruptura** , contagem em faixa de risco. Legenda: "Cobertura positiva, mas pequena: até
     o limite de risco." (demo: 0)
  3. **Saudáveis** , contagem saudável. Legenda: "Cobertura dentro dos limites manuais." (demo: 6)
  4. **Acumulados** , contagem acumulado/excesso. Legenda: "Cobertura acima do limite de excesso."
     (demo: 42)
  5. **Previsto no ciclo** , Σ `previsaoQtd` do ciclo, em unidades. Legenda: "Quantidade prevista para
     o ciclo." (demo: 6.447 un.)
  6. **Previsão restante** , Σ `previsaoRestante`, em unidades. Legenda: "Previsão ainda não
     realizada." (demo: 4.123 un.)
  7. **Valor em risco** , R$ a custo (§2.5.5). Legenda: "Estimativa visual de ruptura." (demo: R$ 0)
  8. **Valor em excesso** , R$ a custo (§2.5.5). Legenda: "Estimativa visual acumulada." (demo: R$
     71.453.942, **número suspeito**: excede o estoque total do painel (~R$ 22 mi) e viola a invariante
     `valorEmExcesso ≤ valorTotalEstoque` (§2.5.5, CA-2.17), a rever antes de usar como referência)
- Os 4 primeiros cards de contagem batem, somados, com o total de produtos da rosca (48 = 0+0+6+42).
  Invariante de consistência (CA-2.4).

#### 2.6.2 Rosca "Distribuição por status do ciclo" (telas 03/04)

- Donut (§7.4) com **total de produtos no centro** ("TOTAL 48 produtos").
- Legenda em lista, uma linha por status, com **contagem** e **%** do total: Ruptura prevista (0 · 0,0%),
  Risco de ruptura (0 · 0,0%), Saudável (6 · 12,5%), Acumulado / Excesso (42 · 87,5%). Cores: vermelho
  (ruptura), amarelo (risco), verde (saudável), azul (acumulado).
- **Drill por fatia (RF-2.3):** clicar numa fatia (ou na linha da legenda) filtra a tabela detalhada
  pelos produtos daquele status. Hint da tela: "Passe o mouse sobre uma fatia para ver o status, a
  quantidade de produtos e o percentual do total analisado."
- Os filtros da tabela (local/marca/linha/tipo) recortam também a rosca (a rosca reflete o subconjunto
  filtrado, RN-2.19).

#### 2.6.3 Tabela "Acompanhamento do ciclo ativo" (tela 04)

- **Cabeçalho da tabela:** rótulo "Ciclo X · <período>", botão "3 pontinhos" (abre pop-up B4, RF-2.8),
  subtítulo-resumo (RF-2.9) e os dois hints de fórmula (RF-2.10).
- **Filtros (RF-2.7):** busca "Buscar por produto...", dropdowns "Todos os locais", "Todas as marcas",
  "Todas as linhas", "Todos os tipos", "Todos" (status). A busca é textual sobre nome/código.
- **Colunas** (cada linha = um produto do ciclo):
  | Coluna | Fonte / cálculo | Formato |
  |--------|-----------------|---------|
  | **Produto** | `FatoProduto.nome` + subrótulo "Linha · Marca · Tipo" (ex.: "LONG LIFE · FORÇA · Equipamento") | texto, 2 linhas |
  | **Quantidade** | `fato_estoque_saldo` (saldo atual, filtrado por local) | "N un.", tabular |
  | **Demanda** | demanda a entregar por produto (DEP-2.6) | "N un." |
  | **Disponível** | `Quantidade − Demanda` | "N un.", verde |
  | **A chegar** | comprado não recebido (DEP-2.7) | "N un." |
  | **Previsão do ciclo** | `ciclo_previsao.previsaoQtd` | "N un." |
  | **Consumido no ciclo** | `consumidoNoCiclo` (§2.5.1) | "N un." |
  | **Previsão restante** | `previsaoRestante` (§2.5.2) | "N un." (pode ser negativa) |
  | **Cobertura de previsão** | `cobertura` (§2.5.3) | "+N un." verde / "−N un." vermelho |
  | **Status** | badge do status (§2.5.4) | pill colorida |
- Ordenação por coluna (§7.2). Números à direita, `tabular-nums`. Contêiner com `overflow-x` próprio.
- **Estado vazio:** "Nenhum produto neste ciclo. Importe a previsão do ciclo." Se há ciclo mas filtro
  zera resultado: "Nenhum produto para os filtros aplicados."
- **Nota de exclusividade (visto na tela 04):** "Modo exclusivo para ciclo ativo. Risco calculado por
  margem de segurança sobre a previsão restante; cobertura alta não entra como risco." Isto reforça
  RN-2.9: cobertura alta nunca vira risco (só ≤ 0 vira ruptura; faixas positivas separam risco de
  saudável/acumulado).

---

### 2.7 Especificação da tela , Relatório fechado (telas 05/06)

Mesma página `diretoria/ciclos/page.tsx` em modo "Relatório de Ciclos de Estoque", **quando um ciclo
`FECHADO` está selecionado** (ou rota/aba dedicada `?modo=fechado`). Tudo lê de `ciclo_fechamento*`.
Layout: cabeçalho + filtros → 14 KPIs → abertura/fechamento mensal → rosca com drill → comparativo +
acurácia → mudança entre ciclos.

#### 2.7.1 Cabeçalho, filtros e indicadores (tela 05, topo)

- **Cabeçalho** "Relatório de Ciclos de Estoque" com subtítulo "Análise visual para verificar se o
  estoque comprado/planejado foi suficiente, insuficiente ou excessivo no ciclo selecionado." Cards:
  Ciclo ("Jan–Abr 2026"), Período ("01/01/2026 a 30/04/2026"), Duração ("4 meses"), Última atualização
  ("30/04/2026 às 18:42" = `ciclo_fechamento.geradoEm`).
- **Filtros (RF-2.22):** Ciclo (dropdown dos fechados), Local de estoque, Marca, Linha, Tipo de
  produto, Visão (Geral). Chips informativos: "Jan–Abr 2026", "5 locais considerados", "26 produtos
  analisados", "Status por faixa esperada de fechamento".
- **14 indicadores** (padrão §7.1), duas linhas de 7:
  - Linha 1: **Valor médio do estoque** (R$ 16.157.500, +2,1% vs ciclo anterior, "Média do valor no
    ciclo") · **Maior valor no ciclo** (R$ 18.300.000, "Sem base de comparação", "Pico registrado") ·
    **Menor valor no ciclo** (R$ 14.440.000, "Menor fotografia mensal") · **Variação início x fim**
    (−R$ 3.860.000, "Diferença entre abertura e fechamento") · **Valor acumulado em excesso** (R$
    756.490, −60%, "Produtos acima do esperado") · **Valor estimado em ruptura** (R$ 208.800, −77,8%,
    "Falta estimada no ciclo") · **Quantidade média em estoque** (1.494, −1,6%, "Média em unidades").
  - Linha 2: **Demanda prevista total** (1.484, +15,9%, "Soma prevista no ciclo") · **Consumo/Demanda
    real** (1.337, −3%, "Consumo/demanda observado") · **Acurácia da previsão** (90,1%, +18,5%, "100% −
    erro percentual absoluto") · **% estoque que rompeu** (15,4%, −30,1%, "4 produtos") · **% em risco
    de ruptura** (23,1%, +44,2%, "6 produtos dentro do limite de risco") · **% estoque saudável**
    (23,1%, −49,8%, "6 produtos") · **% estoque acumulado** (38,5%, +92,3%, "10 produtos").
- Cada card lê o campo homônimo de `ciclo_fechamento`; a variação vs. ciclo anterior lê o
  `ciclo_fechamento` apontado por `cicloAnteriorId` (ou "Sem base de comparação" se nulo).

#### 2.7.2 Abertura e fechamento mensal (tela 05, meio)

- Título "Primeiro e último dia de cada mês", subtítulo "Fotografia visual do ciclo com variação em
  quantidade, valor, demanda, disponibilidade, a chegar e consumo."
- Tabela com uma linha por mês do ciclo (`ciclo_fechamento_mes`). Colunas: Mês, Estoque no 1º dia,
  Estoque no último dia, Variação, Valor no 1º dia, Valor no último dia, Variação em valor, Demanda 1º
  dia, Demanda último dia, Disponível 1º dia, Disponível último dia, A chegar no mês, Consumo do mês.
  Demo (Janeiro): 1.720 → 1.584 (−136), R$ 18.300.000 → R$ 17.180.000 (−R$ 1.120.000), demanda 284 →
  318, disponível 1.436 → 1.266, a chegar 186, consumo 322. Linhas Janeiro a Abril.
- Variações negativas em vermelho; "a chegar" e "consumo" em destaque (amarelo/neutro). Origem de
  estoque e valor: `fato_estoque_saldo_snapshot` no 1º e último dia de cada mês, congelado no
  fechamento. Origem do consumo do mês: notas de venda (§2.5.1).
- **Demanda, disponível e a chegar (1º/último dia) só aparecem se houver snapshot de demanda/OC do mês
  (DEP-2.13).** Para meses anteriores ao início desse snapshot, essas células mostram "sem histórico"
  (célula vazia com hint), não um número reconstruído (RN-2.24), porque o snapshot de saldo não guarda
  demanda nem OC. Estoque, valor e consumo do mês são sempre exibidos. Os números de
  demanda/disponível/a-chegar da demo (284→318, 1.436→1.266, 186) pressupõem que o snapshot de
  demanda/OC já cobria aqueles meses; sem ele, aparecem como "sem histórico".

#### 2.7.3 Rosca com drill "Distribuição do ciclo" (tela 05, base + tela 06 topo)

- Donut "Pizza de status com produtos da fatia", subtítulo "Clique em uma fatia para ver quais produtos
  pertencem àquele status e como performaram contra o previsto." Legenda com contagem e %: Rompeu (4 ·
  15,4%), Risco de ruptura (6 · 23,1%), Saudável (6 · 23,1%), Acumulou (10 · 38,5%). Centro mostra o %
  da fatia selecionada.
- **Drill (RF-2.18):** clicar numa fatia mostra "Produtos da fatia · <status>" (ex.: "Rompeu"),
  cabeçalho "Exibindo N de 26 produtos. Filtro aplicado pela pizza: <status>." com filtros próprios
  (Buscar produto, Todas as marcas, Todas as linhas, Todos os tipos, Todos os locais, seletor de status,
  ordenação "Maior ruptura"). Colunas: Produto, Estoque inicial, Entradas no ciclo, Previsão ciclo,
  Consumido/Demanda, Saldo do ciclo, Status.
- **Saldo do ciclo** (coluna) = **saldo real no último dia** (`fato_estoque_saldo_snapshot` em
  `dataFim`), congelado em `ciclo_fechamento_produto.saldoCiclo`. A identidade `estoqueInicial +
  entradasNoCiclo − consumidoReal` serve só de **conferência**: se ela não reproduz o saldo real, a
  diferença são transferências, ajustes e devoluções que entradas/consumido não capturam, e o valor
  exibido é sempre o saldo real do snapshot, não a fórmula. Exemplo da reunião (Anilha Olímpica):
  inicial 240, entradas 20, previsão 263, consumido 255, e o saldo real do último dia (5) casa com 240
  + 20 − 255 = 5 → risco de ruptura. As linhas "Rompeu" têm saldo real 0 (Esteira Pro 900: 30 + 5 − 35
  = 0). Quando a conta bate, os dois coincidem; quando não bate, vale o snapshot. Tudo lido do snapshot
  congelado.

#### 2.7.4 Comparativo "Ciclo atual x ciclo anterior" (tela 06)

- Tabela Indicador × Ciclo anterior × Ciclo atual × Variação. Linhas (da demo): % em risco de ruptura
  (16% → 23,1%, +7,1%), % saudável (46% → 23,1%, −22,9%), % acumulado (20% → 38,5%, +18,5%), Valor
  acumulado em excesso (R$ 1.890.000 → R$ 756.490, −R$ 1.133.510), Valor estimado em ruptura (R$
  940.000 → R$ 208.800, −R$ 731.200), Produtos que romperam (8 → 4, −4), Produtos em risco (5 → 6, +1),
  Produtos saudáveis (15 → 6, −9), Produtos acumulados (7 → 10, +3).
- **Coluna/linha de duração (RN-2.14):** incluir a duração de cada ciclo (ex.: "4 meses" vs "3 meses")
  para explicar diferenças de tamanho. Sem ela, comparar totais de ciclos de tamanhos diferentes
  engana. Reunião: "uma dessas colunas pode ser a coluna de duração... está explicado porque as
  comparações são diferentes."
- Variação verde/vermelho pela semântica do indicador (§6.2): para "% saudável" e "produtos saudáveis",
  aumento é bom (verde); para "% em risco", "valor em ruptura", "produtos que romperam", aumento é ruim
  (vermelho). A polaridade por indicador precisa ser explícita no código (mapa
  `indicador → melhorQuando: 'sobe' | 'desce'`).
- Ambos os lados vêm de `ciclo_fechamento` (atual e o apontado por `cicloAnteriorId`). **Nunca** do
  cache vivo.

#### 2.7.5 Acurácia previsto x real por produto (tela 06)

- Tabela Produto × Previsto × Real × Diferença × Acurácia × Status da previsão. Demo: Leg Press 45º
  (35, 30, −5, 85,7%, Superestimado); Step Profissional (105, 96, −9, 91,4%, Aderente); etc. Lê de
  `ciclo_fechamento_produto` (`previsaoCiclo`, `consumidoReal`, `diferencaPrevReal`, `acuracia`,
  `statusPrevisao`).
- **Status da previsão (RN-2.16, precedência fixa):** primeiro testa **Aderente** (`acuracia ≥ limiar`,
  ex.: ≥ 90%, vence mesmo quando `real > previsto`); só se **não** for Aderente é que se rotula pelo
  sinal da diferença: `real < previsto` → **Superestimado**, `real > previsto` → **Subestimado**. Isso
  evita a sobreposição entre "Subestimado" (real > previsto) e "Aderente" (acurácia alta). Limiar
  configurável; reunião marca ~90% como fronteira Aderente. Ordenável por acurácia.

#### 2.7.6 Mudança de status entre ciclos (tela 06, base)

- Tabela Produto × Status ciclo anterior × Status ciclo atual × Mudança. Demo: Voador Peitoral VP1
  (Rompeu → Rompeu, "Permaneceu em ruptura"); Bike Speed X (Saudável → Saudável, "Permaneceu
  saudável"); Remada Baixa R2 (Saudável → Risco de ruptura, "Mudou de faixa"). Junta
  `ciclo_fechamento_produto` do ciclo atual com o do anterior por `produtoId`.
- **Rótulo de mudança (RN-2.17):** derivado de `(statusAnterior, statusAtual)`. Igual → "Permaneceu
  <status>" (ruptura/risco→"em atenção"/saudável/acumulado). Diferente → classificar melhora vs piora
  numa ordem de severidade `ROMPEU(0) < RISCO(1) < SAUDAVEL(2) < ACUMULADO(3)`? Não: acumulado não é
  "melhor" que saudável (é comprar demais). A ordem de "saúde" é `ROMPEU(pior) < RISCO < ACUMULADO <
  SAUDAVEL(melhor)`, com acumulado levemente melhor que risco mas pior que saudável. A demo usa
  linguagem neutra "Mudou de faixa" quando muda; adotar "Mudou de faixa" como rótulo padrão de
  transição e reservar "Melhorou"/"Piorou" como COULD se o cliente confirmar a ordem de severidade. Só
  produtos presentes nos dois ciclos entram; produto novo ou descontinuado é omitido (ou marcado
  "Sem base").

---

### 2.8 Regras de negócio e edge cases

- **RN-2.1 , Um ciclo ativo por escopo.** No máximo um `Ciclo` com `status = ATIVO` por escopo de
  empresa (índice único parcial, §2.2.1). Criar um novo ciclo ativo exige fechar o anterior.
- **RN-2.2 , Consistência de duração.** `duracaoMeses` deve bater com `[dataInicio, dataFim]` (número
  de meses corridos). Validar na criação; recusar datas invertidas (`dataFim < dataInicio`).
- **RN-2.3 , Duração configurável.** O ciclo pode ter 2, 3, 4... meses (reunião: "a duração do ciclo
  precisa ser configurável"). Nada no código fixa 4 meses.
- **RN-2.4 , Troca de ciclo zera.** Ao trocar de ciclo, o novo começa zerado com nova previsão
  importada (reunião: "zera e começa de novo"). Ciclos não precisam se "conversar" historicamente; a
  comparação entre ciclos é feita só no relatório fechado.
- **RN-2.5 , Previsão restante sem piso.** `previsaoRestante` pode ser negativa (vendeu mais que
  previu). Não aplicar piso 0. Isto é decisão explícita (§8.2 B2, glossário §3).
- **RN-2.6 , Produto sem previsão.** Só entra na tabela do ciclo quem tem `ciclo_previsao`. Produto sem
  previsão não aparece no ciclo ativo. No fechado, produto vendido sem previsão não divide a acurácia
  por zero: é excluído do cálculo de acurácia (ou listado à parte, COULD).
- **RN-2.7 , Consumido = venda faturada (mesma regra do faturamento).** "Consumido no ciclo" é **venda
  faturada** no período pela **mesma regra de venda da plataforma** (a do Módulo 3 / `SO_VENDA_NOTA` em
  `vendas.ts`: `isVendaExterna = true`, `finalidadeNfe` normal, `situacaoNfe` autorizada, sem
  devolução), aplicada no grão de item de `fato_nota_fiscal_item` (§2.5.1). **Não** é qualquer saída de
  estoque: `entradaSaida = "1"` sozinho contaria transferência, devolução, remessa, bonificação e nota
  cancelada, o que infla o consumido. Nunca é pedido colocado (reunião: "consumido, entenda como
  faturado"). Distinto de "Demanda" (que é o vendido ainda não entregue). O consumido tem que bater com
  o faturamento do Módulo 3 (validado em CA-2.2).
- **RN-2.8 , Demanda vs consumido.** Ao faturar para o cliente, debita da Demanda e da Quantidade e
  soma no Consumido no ciclo (reunião). São colunas independentes: Demanda (a entregar) e Consumido
  (faturado) medem coisas diferentes.
- **RN-2.9 , Ruptura prevista é fixa.** `cobertura ≤ 0` ⇒ ruptura prevista, sempre, não configurável.
  "É fato, não opinião." Os outros 3 status são configuráveis por produto.
- **RN-2.10 , Faixas por produto e por ciclo.** As faixas de status são por produto (uma máquina de
  alto giro tolera mais sobra que uma de baixo giro) e por ciclo (o cliente pode revisar de opinião).
  Persistidas em `ciclo_status_config` com `(cicloId, produtoId)` único.
- **RN-2.11 , Unidade ou percentual.** As faixas podem ser digitadas em unidade **ou** percentual; o
  sistema converte (percentual sobre a `previsaoQtd` do produto). Guarda ambos para reexibir. O cálculo
  usa sempre o valor em unidade.
- **RN-2.12 , Fallback sem parametrização.** Produto sem `ciclo_status_config` válida: acima de zero,
  status "Saudável" com flag "sem parametrização" (ou default global a combinar com o cliente, ou
  estoque mínimo do cadastro como semente). Nunca deixar o produto sem status.
- **RN-2.13 , Fechamento idempotente.** O job de fechamento não pode duplicar. Se `Ciclo.status` já é
  `FECHADO` e existe `ciclo_fechamento`, não regera. Refechar exige ação explícita que apaga o snapshot
  antigo (cascade) e recria (uso raro, auditar).
- **RN-2.14 , Comparar ciclos de tamanhos diferentes.** O comparativo mostra a duração de cada ciclo
  (coluna/linha de duração) porque ciclos podem ter tamanhos diferentes (4 vs 3 meses) e comparar
  totais sem isso engana.
- **RN-2.15 , Fechado nunca recalcula.** O relatório fechado lê **exclusivamente** de
  `ciclo_fechamento*`. Mesmo que o estoque, as notas ou a previsão mudem no cache depois do fechamento,
  o relatório não muda. Congelamento imutável (§8.5 B5, CA-2.8).
- **RN-2.16 , Status da previsão (precedência fixa).** Rótulo por produto: Aderente / Superestimado /
  Subestimado, derivado da diferença previsto x real **e** do limiar de acurácia, nesta **ordem de
  precedência** (para "Aderente" e "Subestimado" não se sobreporem): **(1)** se `acuracia ≥ limiar`
  (ex.: 90%) → **Aderente** (vence sempre, mesmo com `real > previsto`); **(2)** senão, pelo sinal de
  `consumidoReal − previsaoCiclo`: `real < previsto` → **Superestimado** (previu demais), `real >
  previsto` → **Subestimado** (previu de menos); diferença zero com acurácia abaixo do limiar não
  ocorre (acurácia seria 100%), mas por segurança a fronteira `≥` classifica como Aderente. Limiar
  configurável. Congelado em `statusPrevisao`.
- **RN-2.17 , Rótulo de mudança de status.** Derivado do par (status anterior, status atual). Igual →
  "Permaneceu <faixa>"; diferente → "Mudou de faixa". Só produtos nos dois ciclos.
- **RN-2.18 , Cobertura usa estoque de hoje.** No ciclo ativo, `quantidadeEmEstoque` é a foto atual
  (`fato_estoque_saldo`), não segue a pílula de período; muda a cada sync.
- **RN-2.19 , Rosca reflete o filtro.** Os filtros de local/marca/linha/tipo recortam tabela **e** rosca
  **e** os cards de contagem juntos (consistência: os 4 números batem com o total da rosca sempre).
- **RN-2.20 , Demanda não é cortada pelo corte.** A coluna "Demanda" segue a exceção §6.1: usa
  `janelaDemandaAberta` / `PISO_DEMANDA_ABERTA`, não o corte de leitura (pedidos antigos a entregar
  precisam aparecer).
- **RN-2.21 , Consumido grampeado ao corte.** O consumido do ciclo respeita o corte de leitura: se
  `dataInicio < corte`, começa do corte (`clampIsoAoCorte`). Regra de ouro §4.2.
- **RN-2.22 , Valores a custo.** "Valor em risco", "valor em excesso" e todos os valores do relatório
  fechado são a **custo** (`precoCusto`), porque estoque é custo (§6.5).
- **RN-2.23 , Empresa opcional.** Se o ciclo tem `empresaId`, consumido e demanda filtram por empresa;
  se nulo, consolida o grupo. Na v1 pode ser sempre nulo (DEP-2.7 / decisão do cliente).
- **RN-2.24 , Sem histórico de demanda/disponível/a-chegar mensal.** A tabela mensal do fechamento
  (§2.2.6/§2.7.2) só preenche `demanda*`, `disponivel*` e `aChegarNoMes` para meses cobertos por um
  snapshot diário de demanda/OC (DEP-2.13). Para meses anteriores ao início desse snapshot, essas
  células ficam `null` e a UI mostra "sem histórico", nunca um valor reconstruído (o
  `fato_estoque_saldo_snapshot` só guarda saldo, não demanda nem OC). Coerente com o Módulo 1
  (DEP-1.4/RN-1.4). Estoque, valor e consumo do mês não têm essa limitação.
- **RN-2.25 , Saldo do ciclo é saldo real, não fórmula.** O `saldoCiclo` congelado (§2.2.5) é o saldo
  do último dia lido de `fato_estoque_saldo_snapshot` em `dataFim` (já reconcilia transferências,
  ajustes e devoluções). A identidade `estoqueInicial + entradasNoCiclo − consumidoReal` é só
  conferência; quando diverge do snapshot, prevalece o snapshot (§2.7.3, CA-2.19).

---

### 2.9 Consultas (queries)

Arquivo novo `src/lib/diretoria/queries/ciclos.ts`. As funções de **leitura do ciclo ativo** operam no
cache vivo (Prisma + SQL cru quando a agregação exige); as de **leitura do fechado** leem
`ciclo_fechamento*`. As de **fechamento** (B5) escrevem o snapshot. A "calculadora" (§2.5) é função
pura importada por ativo e fechamento, garantindo que o número do fechado seja o mesmo que o ativo
mostrava no dia do fechamento (CA-2.9).

Todas respeitam corte (§6.1) e recebem `PrismaClient` como primeiro argumento, no padrão das queries
existentes de `comercial.ts`/`estoque.ts`.

#### Leitura do ciclo ativo (cache vivo)

- **Q-2.1 , `queryCicloAtivo`** , resolve o ciclo `ATIVO` do escopo e seu cabeçalho.
  ```ts
  export async function queryCicloAtivo(
    prisma: PrismaClient,
    filtros: { empresaId?: number } = {},
  ): Promise<CicloCabecalho | null>
  ```
  Pseudo-SQL: `SELECT * FROM ciclo WHERE status='ATIVO' AND (empresa_id = $1 OR $1 IS NULL) ORDER BY
  data_inicio DESC LIMIT 1`.

- **Q-2.2 , `queryConsumidoNoCiclo`** , consumido (faturado) por produto no período do ciclo.
  ```ts
  export async function queryConsumidoNoCiclo(
    prisma: PrismaClient,
    args: { dataInicio: string; dataFim: string; empresaId?: number; produtoIds?: number[] },
  ): Promise<Map<number, number>>  // produtoId -> unidades consumidas
  ```
  Pseudo-SQL (regra de venda da nota-mãe, a mesma do faturamento, §2.5.1):
  ```sql
  SELECT nfi.produto_id, SUM(nfi.quantidade) AS consumido
  FROM fato_nota_fiscal_item nfi
  JOIN fato_nota_fiscal nf ON nf.id = nfi.nota_id          -- nota-mãe (chave lógica a confirmar)
  WHERE nf.is_venda_externa = true                          -- SO_VENDA_NOTA (vendas.ts)
    AND nf.finalidade_nfe = <normal>                         -- exclui devolução/ajuste por finalidade
    AND nf.situacao_nfe = <autorizada>                       -- exclui cancelada/denegada
    AND nfi.data_emissao >= GREATEST($dataInicio, $corte)    -- clampIsoAoCorte
    AND nfi.data_emissao <= $dataFim
    AND ($empresaId IS NULL OR nf.empresa_id = $empresaId)
    AND ($produtoIds IS NULL OR nfi.produto_id = ANY($produtoIds))
  GROUP BY nfi.produto_id
  ```
  Reusa a **regra de venda** de `src/lib/diretoria/queries/vendas.ts` (`SO_VENDA_NOTA =
  { isVendaExterna: true }`, `finalidadeNfe` normal, `situacaoNfe` autorizada, sem devolução), aplicada
  no grão de item. **Não** usar `entradaSaida = "1"` (conta qualquer saída, §2.5.1). **Assunção a
  validar contra o cache:** os campos `is_venda_externa` / `finalidade_nfe` / `situacao_nfe` podem estar
  na nota-mãe (exige o join) ou já denormalizados no item (dispensa o join), e a chave da junção
  (`nota_id` / `data_emissao` / `empresa_id`) precisa ser confirmada por `SELECT`; o consumido
  resultante **tem que bater** com o faturamento do Módulo 3 para o mesmo produto/período (CA-2.2).

- **Q-2.3 , `queryTabelaCicloAtivo`** , monta a tabela detalhada (uma linha por produto do ciclo).
  ```ts
  export async function queryTabelaCicloAtivo(
    prisma: PrismaClient,
    args: { cicloId: string; localIds?: number[]; marca?: string; linha?: string;
            tipo?: string; status?: CicloStatusProduto; busca?: string;
            ordenarPor?: string; ordem?: 'asc' | 'desc' },
  ): Promise<LinhaCicloAtivo[]>
  ```
  Passos: (1) lê `ciclo_previsao` do ciclo → conjunto de produtos e `previsaoQtd`; (2) lê saldo atual
  por produto de `fato_estoque_saldo` (somando locais do filtro); (3) `queryConsumidoNoCiclo`
  (Q-2.2); (4) demanda por produto (DEP-2.6, reusa `queryDemandaPorProduto` de `comercial.ts`); (5) a
  chegar por produto (DEP-2.7); (6) lê `ciclo_status_config`; (7) aplica a calculadora §2.5 (restante,
  cobertura, status); (8) junta `FatoProduto` (nome, marca, linha, tipo); (9) filtra por
  status/busca/local/marca/linha/tipo; (10) ordena. Retorna também os agregados para os cards e a
  rosca (ou expor `queryIndicadoresCicloAtivo` separada, Q-2.4).

- **Q-2.4 , `queryIndicadoresCicloAtivo`** , os 8 KPIs + as 4 contagens/percentuais da rosca.
  ```ts
  export async function queryIndicadoresCicloAtivo(
    prisma: PrismaClient,
    args: { cicloId: string; /* mesmos filtros de Q-2.3 */ },
  ): Promise<IndicadoresCicloAtivo>
  ```
  Deriva de Q-2.3 (mesma base filtrada, para os números baterem com a tabela e a rosca, RN-2.19).
  Inclui `valorEmRisco` e `valorEmExcesso` (§2.5.5) com `precoCusto` de `FatoProduto`.

#### Escrita do fechamento (B5)

- **Q-2.5 , `fecharCiclo`** , gera o snapshot imutável.
  ```ts
  export async function fecharCiclo(
    prisma: PrismaClient,
    args: { cicloId: string; geradoEm?: Date; forcar?: boolean },
  ): Promise<CicloFechamento>
  ```
  Passos (transação): (1) valida `status` e idempotência (RN-2.13); (2) roda a mesma calculadora do
  ativo para todos os produtos → `ciclo_fechamento_produto` (estoque inicial via
  `fato_estoque_saldo_snapshot` em `dataInicio`; **entradas no ciclo via `fato_estoque_movimento`**
  sentido = entrada no período, DEP-2.14; previsão; consumido pela **regra de venda §2.5.1**; **saldo
  do ciclo lido do `fato_estoque_saldo_snapshot` em `dataFim`** (saldo real, a fórmula `inicial +
  entradas − consumido` só confere, §2.2.5/§2.7.3); status final, acurácia, diferença, status da
  previsão); (3) para cada mês do ciclo, lê `fato_estoque_saldo_snapshot` no 1º e último dia (estoque e
  valor) e, **quando existir**, o snapshot diário de demanda/OC (DEP-2.13) para
  `demanda*`/`disponivel*`/`aChegarNoMes`; para meses sem esse snapshot, grava `null` nessas colunas
  (RN-2.24, não reconstrói) → `ciclo_fechamento_mes`; (4) agrega os KPIs → `ciclo_fechamento` (valor
  médio/maior/menor a partir das fotografias, variação início x fim, valor acumulado/ruptura, acurácia
  geral, %/contagens por status); (5) resolve `cicloAnteriorId` por **data** (o `CicloFechamento` de
  maior `dataFim` estritamente anterior ao `dataInicio` deste, mesmo escopo, RN-2.14/§2.2.4), **não**
  pela ordem em que os ciclos foram fechados; (6) `Ciclo.status = FECHADO`, `fechadoEm = geradoEm`.
  Chamado pelo job diário (worker) na `dataFim` e por ação manual "fechar ciclo".

#### Leitura do fechado (só `ciclo_fechamento*`, nunca cache vivo , RN-2.15)

- **Q-2.6 , `queryCiclosFechados`** , dropdown dos ciclos fechados.
  ```ts
  export async function queryCiclosFechados(prisma, { empresaId? }): Promise<CicloFechadoOpcao[]>
  ```
  `SELECT c.id, cf.nome, cf.data_inicio, cf.data_fim FROM ciclo_fechamento cf JOIN ciclo c ... ORDER BY
  cf.data_inicio DESC`.

- **Q-2.7 , `queryRelatorioFechadoCabecalhoEKpis`** , cabeçalho + 14 indicadores + variação vs anterior.
  ```ts
  export async function queryRelatorioFechadoCabecalhoEKpis(
    prisma: PrismaClient,
    args: { cicloId: string },
  ): Promise<RelatorioFechadoKpis>
  ```
  Lê `ciclo_fechamento` do ciclo e o apontado por `cicloAnteriorId` (para os deltas). Sem anterior →
  "Sem base de comparação".

- **Q-2.8 , `queryFechamentoMensal`** , tabela abertura/fechamento mensal.
  ```ts
  export async function queryFechamentoMensal(prisma, { cicloId }): Promise<LinhaMes[]>
  ```
  `SELECT * FROM ciclo_fechamento_mes WHERE fechamento_id = $f ORDER BY mes_ref`.

- **Q-2.9 , `queryProdutosPorStatusFechado`** , drill da rosca (produtos da fatia).
  ```ts
  export async function queryProdutosPorStatusFechado(
    prisma: PrismaClient,
    args: { cicloId: string; status?: CicloStatusProduto; localIds?: number[];
            marca?: string; linha?: string; tipo?: string; busca?: string;
            ordenarPor?: string; ordem?: 'asc' | 'desc' },
  ): Promise<LinhaProdutoFechado[]>
  ```
  `SELECT ... FROM ciclo_fechamento_produto WHERE fechamento_id=$f AND ($status IS NULL OR
  status_final=$status) AND <filtros congelados> ORDER BY ...`. Os filtros operam sobre colunas
  congeladas (`marca_nome`, `linha_nome`, `tipo`), sem tocar `FatoProduto`.

- **Q-2.10 , `queryComparativoCiclos`** , tabela ciclo atual x anterior (com duração).
  ```ts
  export async function queryComparativoCiclos(prisma, { cicloId }): Promise<ComparativoCiclos>
  ```
  Lê os dois `ciclo_fechamento` e monta linhas indicador × anterior × atual × variação + duração de
  cada. Sem anterior → estado "Sem base de comparação".

- **Q-2.11 , `queryAcuraciaPorProduto`** , previsto x real por produto.
  ```ts
  export async function queryAcuraciaPorProduto(prisma, { cicloId, ordenarPor?, ordem? }): Promise<LinhaAcuracia[]>
  ```
  `SELECT produto_nome, previsao_ciclo, consumido_real, diferenca_prev_real, acuracia, status_previsao
  FROM ciclo_fechamento_produto WHERE fechamento_id=$f ORDER BY acuracia`.

- **Q-2.12 , `queryMudancaStatusEntreCiclos`** , melhorou/piorou/manteve.
  ```ts
  export async function queryMudancaStatusEntreCiclos(prisma, { cicloId }): Promise<LinhaMudanca[]>
  ```
  Junta `ciclo_fechamento_produto` do ciclo atual com o do `cicloAnteriorId` por `produto_id`; deriva o
  rótulo de mudança (RN-2.17). Só produtos presentes nos dois.

#### Escrita de configuração e importação (delegadas à camada base)

- **Q-2.13 (B3) , `importarPrevisaoCiclo`** , upsert em `ciclo_previsao`. Detalhe em §8.3; aqui o
  módulo apenas consome o resultado.
- **Q-2.14 (B4) , `salvarStatusConfig`** , upsert em `ciclo_status_config` (pop-up 3 pontinhos).
  Detalhe em §8.4; ao salvar, invalida o cache da tela e recalcula.

---

### 2.10 Filtros e parâmetros

- **Ciclo ativo:** o ciclo é implícito (o `ATIVO`); filtros da tabela/rosca: busca textual, Local
  (multiseleção via `fato_estoque_local`), Marca, Linha (B1), Tipo, Status (os 4). O drill da rosca é
  um filtro de status adicional. Empresa opcional (RN-2.23). **Sem pílula de período** aqui: o período
  é o do ciclo, não o da pílula (o estoque é "agora", o consumido é o do ciclo).
- **Relatório fechado:** Ciclo (dropdown dos fechados, obrigatório), Local, Marca, Linha, Tipo, Visão
  (Geral; reservado para futuras visões). Os filtros recortam **o snapshot** (colunas congeladas), não
  o cache vivo. O drill da rosca adiciona o filtro de status. Ordenações: "Maior ruptura", acurácia,
  etc.
- **Parâmetros de query comuns:** `{ cicloId, localIds?, marca?, linha?, tipo?, status?, busca?,
  empresaId?, ordenarPor?, ordem? }`. Datas nunca vêm do cliente para o fechado (vêm do snapshot);
  para o ativo, vêm do `Ciclo` (`dataInicio`/`dataFim`), já clampadas ao corte.
- **Corte (§6.1):** aplicado ao consumido (grampeia início) e à demanda (exceção: `janelaDemandaAberta`).
  O snapshot de fechamento já nasceu clampado; releitura não reaplica corte.

---

### 2.11 Estados e validações

- **Sem ciclo ativo:** tela do ciclo ativo em estado vazio acionável ("Nenhum ciclo ativo. Crie um
  ciclo e importe a previsão para começar o acompanhamento.").
- **Ciclo ativo sem previsão importada:** cards e tabela vazios com CTA "Importe a previsão do ciclo"
  (aponta para o importador B3). Não renderizar números "0" que pareçam dado real.
- **Produto sem `ciclo_status_config`:** badge de status com o fallback (RN-2.12) e um indicador visual
  discreto de "sem parametrização" (ex.: badge outline em vez de sólido), sem quebrar a rosca.
- **Nenhum ciclo fechado:** dropdown do relatório fechado vazio → estado "Ainda não há ciclos fechados.
  O relatório é gerado automaticamente quando um ciclo encerra."
- **Ciclo fechado sem anterior:** cards comparativos exibem "Sem base de comparação"; seções de
  comparativo e mudança-de-status com placeholder acionável (RF-2.23).
- **Filtro sem resultado:** "Nenhum produto para os filtros aplicados." (tabela e drill).
- **Carregando:** skeleton dos cards, da rosca e das tabelas (§7.5).
- **Erro:** mensagem que explica e sugere ação (§7.5), nunca "Erro".
- **Validações de escrita:** criação de ciclo (datas coerentes, `duracaoMeses` consistente, sem outro
  ativo no escopo, RN-2.1/2.2); importação de previsão (B3: produto existe, qtd ≥ 0); faixas de status
  (B4: `0 < riscoAte ≤ saudavelAte`); fechamento (idempotência, RN-2.13).
- **Consistência exibida:** os 4 cards de contagem somados = total da rosca = nº de linhas da tabela
  (com os mesmos filtros). Se divergir, é bug (CA-2.4).
- **Frescor:** carimbo de última atualização do cache no ativo; `geradoEm` do snapshot no fechado.

---

### 2.12 Critérios de aceite

- **CA-2.1** , Dado um ciclo ativo com previsão importada, a tabela do ciclo ativo calcula, por
  produto, `consumidoNoCiclo`, `previsaoRestante`, `cobertura` e `status` corretos e batendo com o
  faturamento real do período (validação E2E contra o cache real, §9 do CLAUDE.md; conferir alguns
  produtos com `SELECT` nas notas fiscais).
- **CA-2.2** , `consumidoNoCiclo` conta **venda faturada no período pela mesma regra do faturamento**
  (`SO_VENDA_NOTA`: `isVendaExterna`, `finalidadeNfe` normal, `situacaoNfe` autorizada, sem devolução),
  no grão de item, e não qualquer saída: transferência, devolução, remessa, bonificação e nota
  cancelada **não** entram; e um pedido colocado mas não faturado no ciclo não aparece no consumido
  (aparece na Demanda). Validação: o consumido por produto/período **bate** com o faturamento do Módulo
  3 para o mesmo produto/período (conferir com `SELECT` nas notas).
- **CA-2.3** , `cobertura ≤ 0` sempre classifica "ruptura prevista", independentemente de qualquer
  `ciclo_status_config`; nenhuma configuração consegue tirar um produto de ruptura quando a cobertura é
  ≤ 0.
- **CA-2.4** , Consistência: soma das 4 contagens de status = total no centro da rosca = nº de linhas
  da tabela, para qualquer combinação de filtros. Os filtros recortam os três juntos.
- **CA-2.5** , `previsaoRestante` fica negativa quando o consumido supera a previsão (sem piso), e a
  cobertura reflete isso corretamente.
- **CA-2.6** , As faixas de status respeitam `ciclo_status_config` por produto; mudar a faixa no
  pop-up (B4) e salvar reclassifica o produto na tabela e na rosca sem recarregar a página inteira.
- **CA-2.7** , Faixa em percentual converte corretamente para unidade sobre a `previsaoQtd` do produto,
  e o inverso, mantendo o cálculo em unidade.
- **CA-2.8** , Ao fechar um ciclo, o relatório fechado abre a qualquer momento no futuro com os mesmos
  números do dia do fechamento, mesmo que estoque, notas ou previsão mudem no cache depois (imutável,
  §8.5 B5).
- **CA-2.9** , O número que o relatório fechado mostra para um produto (estoque inicial, entradas,
  previsão, consumido, saldo, status) é idêntico ao que a tabela do ciclo ativo mostrava para o mesmo
  produto no dia do fechamento (mesma calculadora §2.5).
- **CA-2.10** , A acurácia geral (90,1% na demo) é calculada sobre os totais (Σ real, Σ previsto), não
  como média das acurácias por produto, e a acurácia por produto reproduz os valores das telas (35/30
  → 85,7%).
- **CA-2.11** , A abertura/fechamento mensal lê do `fato_estoque_saldo_snapshot` no 1º e último dia de
  cada mês do ciclo e as variações batem (último − primeiro).
- **CA-2.12** , O comparativo ciclo atual x anterior exibe a duração de cada ciclo e as variações têm a
  polaridade correta por indicador (subir "% saudável" é verde; subir "% em risco" é vermelho).
- **CA-2.13** , O relatório fechado **não** dispara nenhuma leitura do cache vivo (`fato_*`); todo o
  dado vem de `ciclo_fechamento*` (verificável por inspeção das queries: nenhuma query da tela 05/06 lê
  `fato_estoque_saldo`, `fato_nota_fiscal*`, etc.).
- **CA-2.14** , Corte de dados respeitado: o consumido do ciclo é grampeado ao corte quando
  `dataInicio < corte`; a demanda usa `janelaDemandaAberta` (não é cortada). Mover o corte não corrompe
  um relatório já fechado (imutável).
- **CA-2.15** , Estados vazios/carregando/erro presentes e acionáveis nas duas telas (sem ciclo ativo,
  sem previsão, sem ciclo fechado, sem anterior, filtro sem resultado).
- **CA-2.16** , Filtros e ordenação funcionam nas duas telas (Local, Marca, Linha, Tipo, Status, busca)
  e a rosca reflete o filtro.
- **CA-2.17** , `valorEmExcesso ≤ valorTotalEstoque` sempre (o excesso é parte do estoque a custo, não
  pode superá-lo). Um resultado que viole isso (como a R$ 71.453.942 da demo contra ~R$ 22 mi de
  estoque) é bug de fórmula (cobertura inteira em vez da parte acima do saudável, preço de venda em vez
  de custo, ou cobertura inflada por `previsaoRestante` negativa) e não é exibido.
- **CA-2.18** , A tabela mensal do fechamento (§2.7.2) só exibe demanda/disponível/a-chegar para meses
  cobertos por snapshot de demanda/OC (DEP-2.13); meses anteriores mostram "sem histórico" (colunas
  `null`, RN-2.24), nunca um valor reconstruído. Estoque, valor e consumo do mês aparecem sempre.
- **CA-2.19** , O `saldoCiclo` congelado é o **saldo real** do `fato_estoque_saldo_snapshot` em
  `dataFim`; quando `estoqueInicial + entradasNoCiclo − consumidoReal` diverge dele, prevalece o
  snapshot (a fórmula é só conferência, §2.2.5/§2.7.3).

---

### 2.13 Dependências

**Da camada base (§8):**
- **B2 (§8.2)** , motor de ciclos: o modelo de dado de §2.2 (construído por este módulo, detalhando o
  esboço da §8.2) e a calculadora §2.5. **Bloqueante.**
- **B3 (§8.3)** , importador de previsão do ciclo → `ciclo_previsao`. **Bloqueante** (sem previsão, sem
  ciclo).
- **B4 (§8.4)** , pop-up de faixas de status → `ciclo_status_config`. Bloqueante só para os 3 status
  configuráveis (ruptura funciona sem ele).
- **B5 (§8.5)** , job de fechamento → `ciclo_fechamento*`. **Bloqueante** para a tela 05/06 (o ciclo
  ativo, 03/04, não depende dele).
- **B1 (§8.1)** , atributo `linha`: coluna e filtro "Linha". Degrada sem travar (UI tolera "Sem
  linha").

**De dado já existente (cache):**
- `fato_estoque_saldo` (quantidade atual), `fato_estoque_saldo_snapshot` (fotografia diária, base do
  fechado, **já populada**), `fato_nota_fiscal_item` (consumido/faturado), `fato_pedido` /
  `fato_pedido_item` (demanda a entregar), `FatoProduto` (`precoCusto`, marca, tipo, linha).

**De código já existente (reuso):**
- `src/lib/corte-dados.ts` (`getCorteDados`, `corteAtual`, `clampIsoAoCorte`, `janelaClampada`,
  `janelaDemandaAberta`, `PISO_DEMANDA_ABERTA`).
- `src/lib/reports/queries/comercial.ts` (`queryDemandaPorProduto`, `queryDemandaEmAberta` para a
  coluna Demanda; padrão de janela de demanda em aberto).
- `src/lib/diretoria/queries/estoque.ts` (padrão `fatoNotaFiscalItem where entradaSaida:"1",
  dataEmissao between` para o consumido; `queryComprasAtivas`/`queryNecessidadeCompra` para "a chegar").
- Padrões de UI: card de KPI (§7.1), tabela (§7.2), rosca de status (§7.4), estados (§7.5).

**De cadastro do cliente (fora do nosso controle):**
- Previsão do ciclo por produto (input do comercial), faixas de status por produto (definidas em
  reunião interna deles), atributo `linha` no Odoo (B1). Sem esses, as colunas/telas correspondentes
  ficam vazias, mas a estrutura funciona.

**Ordem de construção sugerida:** B2 (modelo + calculadora) → telas 03/04 (ciclo ativo) com B3 e B4 →
B5 (fechamento) → telas 05/06 (relatório fechado). O ciclo ativo é entregável antes do fechado.
