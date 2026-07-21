# Escopo Técnico Detalhado , 5 Módulos de Dashboard Analítico (Matrix Fitness Group)

> **Versão:** v3 (final). Passou por review de estrutura e por review adversarial linha a linha (3 revisores em paralelo contra o código real), com todas as correções aplicadas (ver "Nota de review" abaixo).
> **Projeto:** nexus-odoo (dashboard analítico sobre o ERP Odoo Tauga via cache Postgres).
> **Origem do escopo:** reunião de 2026-07-20 (`docs/transcricoes-reunioes/2026-07-20-reuniao-dashboards-matrix-transcricao-BRUTA.md`) cruzada com 18 protótipos de tela (`referencias-telas/`).
> **Cobertura deste documento:** os **5 módulos de dashboard** , Estoque atual, Relatório de estoque (ciclos), Vendas, Financeiro e Demandas. A aplicação de **Conferência de estoque** (leitor de serial + inventário) é tratada em documento próprio por ser aplicação operacional, não dashboard.
> **Público-alvo:** desenvolvedor(a) full-stack que vai implementar. O documento assume familiaridade com Next.js, TypeScript, Prisma e SQL, mas explica toda regra de negócio.

---

## Nota de review (v2 → v3 final)

Esta versão consolida a Parte I (fundamentos), as 5 seções de módulo e a Parte III (anexos) num arquivo único. Foi submetida a:

- **Estrutura:** Partes I, II e III presentes; os 5 módulos na ordem correta; template aplicado em todos (10 a 13 subseções por módulo: objetivo, pré-requisitos, requisitos, especificação por tela, regras, consultas, filtros, estados, critérios de aceite, dependências). Sem seções truncadas.
- **Consistência de escrita:** zero caractere travessão (1 ocorrência corrigida no módulo 2); numeração de identificadores coesa (140 RF, 211 RN, 102 Q, 75 CA, 148 DEP).
- **Aterramento no código real:** 125 citações de campos reais de tabela e 31 de funções de query existentes; as regras transversais (corte de dados, exceção de demanda, comparação vs. período anterior) são referenciadas pelos módulos (via §6.1 e Anexos), não redefinidas.
- **Amostragem de conteúdo:** verificados o modelo de dado novo do ciclo (Módulo 2: 6 modelos Prisma + cálculos de cobertura/consumido/previsão) e o Módulo 4 (o mais enxuto; completo, e sinaliza corretamente o de-para `empresaId` ↔ `dim_empresa_grupo.odooId`).

**Review adversarial executada (v3):** três revisores independentes (Opus) confrontaram os 5 módulos, a Parte I e os Anexos contra `prisma/schema.prisma` e `src/lib/**`, caçando erro material. Foram levantados cerca de 33 achados verificados (vários de severidade alta) e **todos foram aplicados** nesta v3. Os mais críticos:

- **Consumido no ciclo (M2):** a definição contava qualquer saída (transferência, devolução, remessa, até nota cancelada). Corrigido para a regra de venda da plataforma (`isVendaExterna`, finalidade normal, situação autorizada, no grão de item), com passo de validação de que o consumido bate com o faturamento do Módulo 3.
- **Ranking por vendedor (M3):** era insatisfazível sob "faturamento = nota" (a nota não carrega vendedor). Migrado para base de pedido, com correção do critério de aceite (bate com o subtotal de pedidos, não com o card de faturamento) e do escopo por UF (era um furo de acesso).
- **De-para empresa ↔ CNPJ (M4 e Anexos):** o `odooId` da dimensão de empresa está deslocado em relação ao `empresaId` dos fatos. Anexos corrigidos para não assumir igualdade (evita exibir CNPJ errado nos 6 blocos).
- **Comparação de 30 dias (M1):** a base histórica foi reespecificada para o mesmo filtro físico e positivo e a mesma revaloração a custo do KPI de hoje, em vez de reusar uma função privada que agregava sem esses filtros.
- **Colunas mensais de demanda e ordem de compra (M2):** não têm fonte no snapshot (que só guarda saldo). Marcadas como dependentes de um novo fato de snapshot diário de demanda/OC, não prometidas sem fonte.
- **Split de itens ativos e cobertura por empresa (M5), reconciliação de gastos (M4), curva ABC e joins de composição (M3):** fórmulas, bases percentuais e fontes corrigidas.

Os achados de baixa severidade (rótulos ambíguos, invariantes de sanidade, precedência de status, índices de banco faltantes, baldes "sem prazo") também foram aplicados. O documento está consistente e implementável; os pontos legitimamente em aberto (ex.: existência do vínculo de segmento por cliente no Odoo; desenho final do Módulo Demandas) estão sinalizados como dependências ou itens a refinar dentro de cada módulo.

---

## Sumário

- [Parte I , Fundamentos](#parte-i--fundamentos)
  - [1. Objetivo e escopo](#1-objetivo-e-escopo)
  - [2. Convenções do documento](#2-convenções-do-documento)
  - [3. Glossário de negócio](#3-glossário-de-negócio)
  - [4. Arquitetura e stack](#4-arquitetura-e-stack)
  - [5. Fontes de dado canônicas](#5-fontes-de-dado-canônicas)
  - [6. Regras transversais de dado](#6-regras-transversais-de-dado)
  - [7. Padrões transversais de UI](#7-padrões-transversais-de-ui)
  - [8. Camada base compartilhada](#8-camada-base-compartilhada)
- [Parte II , Módulos](#parte-ii--módulos)
  - [Módulo 1 , Estoque atual](#módulo-1--estoque-atual)
  - [Módulo 2 , Relatório de estoque (ciclos)](#módulo-2--relatório-de-estoque-ciclos)
  - [Módulo 3 , Vendas](#módulo-3--vendas)
  - [Módulo 4 , Financeiro por CNPJ](#módulo-4--financeiro-por-cnpj)
  - [Módulo 5 , Demandas](#módulo-5--demandas)
- [Parte III , Anexos](#parte-iii--anexos)

---

# Parte I , Fundamentos

## 1. Objetivo e escopo

### 1.1 O que está sendo construído

Cinco painéis analíticos novos (ou evoluções profundas de painéis existentes) que leem do **cache Postgres** alimentado pela sincronização do Odoo. Nenhum painel consulta o Odoo ao vivo: toda leitura vem das tabelas `fato_*` do cache, e todo dado carrega o carimbo da última sincronização.

Os cinco módulos, na ordem de prioridade declarada pelo cliente:

| Ordem | Módulo | Natureza | Telas |
|-------|--------|----------|-------|
| 1 | Estoque atual | Foto do estoque físico | 1 |
| 2 | Vendas | Análise comercial | 3 (painel, comparativos, comparação geral) |
| 3 | Relatório de estoque (ciclos) | Gestão de compra por ciclo | 2 (ciclo ativo, relatório fechado) |
| 4 | Financeiro por CNPJ | Resultado por empresa do grupo | 1 |
| 5 | Demandas | Pedidos em carteira | 1 (com múltiplos blocos) |

> Nota: a numeração de módulo neste documento segue a organização temática (1 Estoque, 2 Ciclos, 3 Vendas, 4 Financeiro, 5 Demandas). A ordem de **entrega** é a da coluna "Ordem" acima.

### 1.2 O que NÃO está no escopo deste documento

- **Aplicação de Conferência de estoque** (bipagem de serial, inventário): documento próprio.
- **WMS / endereçamento por prateleira**: não existe no Odoo hoje; dashboard futuro.
- **Taxa de conversão de vendas**: depende de orçamentos que hoje vivem no Mercos, fora do Odoo.
- **Margem líquida** e **composição da receita por plano de contas**: só margem bruta e composição de despesas nesta fase.
- **Integração Mercos → Odoo**.

### 1.3 Premissas

1. A plataforma-base (app Next.js, autenticação, RBAC, design system, cache, worker de sync) já existe e é reutilizada.
2. O cliente é responsável por cadastrar no Odoo os dados de origem que hoje não existem: atributo **linha** do produto, **meta mensal** de vendas, **previsão do ciclo**, **plano de contas** de despesas, **UF** nas contas a pagar e **nome do vendedor** no pedido.
3. Dados históricos incompletos (ex.: pedidos sem vendedor) são tratados "daqui para frente"; não há reprocessamento retroativo.
4. O acesso ao Odoo é exclusivamente via API JSON-RPC (sem acesso ao banco do ERP).

---

## 2. Convenções do documento

### 2.1 Identificadores

- **RF-\<M\>.\<n\>** , Requisito Funcional do módulo M, item n. Ex.: `RF-1.4`.
- **RN-\<M\>.\<n\>** , Regra de Negócio.
- **Q-\<M\>.\<n\>** , Consulta (query) a implementar/estender.
- **CA-\<M\>.\<n\>** , Critério de Aceite.
- **DEP-\<M\>.\<n\>** , Dependência (de dado, cadastro ou outra frente).

### 2.2 Prioridade de requisito (MoSCoW)

- **[MUST]** , obrigatório para a entrega do módulo.
- **[SHOULD]** , importante, mas pode ir em incremento imediato.
- **[COULD]** , desejável; entra se couber.

### 2.3 Notação de dado

- Tabelas do cache: `fato_estoque_saldo` (nome físico) / `FatoEstoqueSaldo` (modelo Prisma).
- Campos citados como `campo` são a intenção semântica; nomes exatos de coluna devem ser confirmados no `prisma/schema.prisma` no momento da implementação (a Parte III lista o mapeamento conhecido).
- Pseudo-SQL é ilustrativo da agregação pretendida, não SQL final.

### 2.4 Moeda e formatação

- Valores monetários em BRL, `R$ 1.234.567,89`, sempre a **valor de custo** quando o contexto for estoque, e a **valor de nota** (faturado) quando o contexto for venda/receita. Cada card explicita sua base.
- Percentuais com uma casa decimal (`42,4%`), salvo indicação.
- Datas em horário de Brasília (BRT); toda janela de análise respeita o corte de dados (seção 6.1).

---

## 3. Glossário de negócio

Termos usados no restante do documento, com a definição operacional acordada na reunião.

| Termo | Definição |
|-------|-----------|
| **Saldo / quantidade em estoque** | Unidades físicas presentes no estoque, por produto e por local. Fonte: `fato_estoque_saldo`. |
| **Demanda** | Quantidade já vendida/comprometida com cliente (pedido em etapa "em aberto/a entregar"), ainda não entregue. É o que "sai" da disponibilidade. |
| **Disponível** | `Disponível = Saldo − Demanda`. O que pode ser vendido/entregue livremente. |
| **A chegar** | Quantidade comprada (ordem de compra) ainda não recebida no estoque (em trânsito). |
| **Valor de custo** | Base de valoração do estoque. "O estoque é custo" (reunião). Fonte: `precoCusto` do produto × quantidade. |
| **Faturamento** | Nota fiscal **emitida** (venda de fato realizada), não pedido colocado. Fonte: `fato_nota_fiscal`. |
| **Valor a faturar / carteira** | Vendido (pedido fechado) que ainda não virou nota fiscal. |
| **Ciclo** | Período de gestão de compra (ex.: 4 meses), configurável em duração e datas. Ao fim, "zera e começa de novo". |
| **Previsão do ciclo** | Quantidade que o comercial planeja vender de cada produto no ciclo. Dado **manual importado**, não vem do Odoo. |
| **Consumido no ciclo** | Faturado no período do ciclo (venda realizada). |
| **Previsão restante** | `Previsão do ciclo − Consumido no ciclo`. Quanto ainda se espera vender. |
| **Cobertura de previsão** | `Quantidade em estoque − Previsão restante`. Se ≤ 0, o produto tende a romper. |
| **Status do ciclo** | 4 estados por produto: **Ruptura prevista** (cobertura ≤ 0, regra fixa), **Risco de ruptura**, **Saudável**, **Acumulado/Excesso** (os 3 últimos por faixas configuráveis por produto). |
| **Acurácia da previsão** | `Demanda real ÷ Demanda prevista × 100`. Mede o quão perto a previsão chegou da realidade. |
| **Ticket médio** | Valor médio por pedido (`valor total ÷ nº de pedidos`) ou por produto, conforme o contexto do card. |
| **Margem (bruta) média** | `(valor faturado − custo) ÷ valor faturado`, ponderada pelo valor vendido quando "média geral". |
| **Meta atingida** | `valor vendido no mês ÷ meta mensal × 100`. Meta é dado **manual importado**, definida mês a mês. |
| **PMR (Prazo Médio de Recebimento)** | Média ponderada dos prazos das parcelas de um pedido; a métrica geral é a média dos PMRs de todos os pedidos. Mede o quanto se está parcelando. |
| **Prazo médio praticado** | Prazo de **entrega** que o vendedor colocou no pedido (não confundir com PMR). |
| **Entrada média** | Percentual/valor de entrada dos pedidos que tiveram entrada. |
| **Curva ABC / Pareto** | Classificação de produtos por concentração de faturamento: classe A (até 80% acumulado), B (80,95%), C (acima de 95%). Objetivo: achar os 20% de produtos que fazem 80% do faturamento ("o pão francês que não pode faltar"). |
| **Segmento / tipo de cliente** | Categoria do cliente: academia, condomínio, hotel, estúdio, residência, time, etc. **Não** confundir com "cliente novo/recorrente". |
| **Grupo de cliente / recorte** | Agrupamento estratégico para isolar faturamento: Grupo (interno), Smart (Smart Fit), Aztec (assistência técnica), ou uma **construtora** (que tem vários CNPJs/razões sociais). |
| **CNPJ / empresa do grupo** | O faturamento sai por várias empresas do grupo (JHSP, JHDF, JDS, JHT Brasília...). Análise por CNPJ = por empresa emissora. |
| **Local de estoque** | Armazém físico (Jarinu, Valinhos, Ceilândia, Vicente Pires, Sergipe...). |
| **Marca / Linha / Tipo** | Atributos do produto. Marca (Matrix, Vision, Panatta...), Linha (Magnum, Ultra, Versa, Aura...), Tipo (seletorizada, peso livre, cardio, acessório...). Marca e Tipo já existem no cache; **Linha não existe** (a criar). |

---

## 4. Arquitetura e stack

### 4.1 Camadas

```
[ Odoo Tauga ] --JSON-RPC--> [ worker (BullMQ) ] --escreve--> [ Postgres cache ]
                                                                     |
                                              raw_*  ->  fato_*  (materialização)
                                                                     |
                     [ Next.js app (App Router) ] --lê--> queries (Prisma/SQL) --> páginas /diretoria/*
```

- **Cache Postgres (Prisma):** ~126 tabelas `raw_*` (espelho do Odoo), ~50 tabelas `fato_*` (materializadas para leitura), 2 `dim_*`. Os dashboards leem **sempre** de `fato_*`, nunca de `raw_*`.
- **Worker de sincronização:** `src/worker/**`. Catálogo declarativo `src/worker/catalog/model-catalog.ts` (~128 modelos Odoo). Builders de fato em `src/worker/fatos/*` registrados em `registry.ts`. Ciclos: incremental (~3 min) + snapshot/reconcile (~24 h).
- **App:** Next.js (App Router) + TypeScript + Tailwind v4 + base-ui. Páginas da diretoria em `src/app/(protected)/diretoria/*`.
- **Queries:** dois diretórios , `src/lib/diretoria/queries/*` (dashboards da diretoria) e `src/lib/reports/queries/*` (relatórios/agente/MCP). Este escopo estende principalmente o primeiro, reusando lógica do segundo.

### 4.2 Regra de ouro da leitura

Toda nova consulta que lê histórico **tem que** respeitar a data de corte das análises (seção 6.1) usando os helpers de `src/lib/corte-dados.ts`. Nunca amarrar o domínio do Odoo (sync) à data da tela.

### 4.3 Onde cada módulo mora (arquivos)

| Módulo | Página (app) | Query (lib) | Situação |
|--------|--------------|-------------|----------|
| Estoque atual | `diretoria/estoque/page.tsx` | `diretoria/queries/estoque.ts` | evoluir |
| Ciclos | `diretoria/ciclos/page.tsx` (novo) | `diretoria/queries/ciclos.ts` (novo) | criar |
| Vendas | `diretoria/vendas/page.tsx` | `diretoria/queries/vendas.ts` | evoluir + 2 telas novas |
| Financeiro | `diretoria/financeiro/page.tsx` (novo) | `diretoria/queries/financeiro.ts` (novo, reusa `reports/queries/financeiro.ts`) | criar |
| Demandas | `diretoria/pedidos/page.tsx` | `diretoria/queries/pedidos.ts` + `entregas-parciais.ts` | evoluir |

---

## 5. Fontes de dado canônicas

Tabelas `fato_*` que os cinco módulos consomem. Os campos citados são os principais; a lista completa por modelo está na Parte III (Anexo A).

### 5.1 Estoque
- **`fato_estoque_saldo`** , saldo por produto (e por local). Base do módulo Estoque e da coluna "quantidade" dos ciclos e demandas.
- **`fato_estoque_local`** , cadastro dos locais de estoque (armazéns) e sua classificação (físico, demonstração, trânsito).
- **`fato_estoque_saldo_snapshot`** , foto diária do saldo (`dataRef`). Base de todo comparativo temporal (variação vs. 30 dias, abertura/fechamento mensal, relatório de ciclo). **Já existe e é populada por job diário.**
- **`fato_estoque_saldo_historico`** , trilha append-por-mudança de saldo (auxiliar).

### 5.2 Produto
- **`fato_produto`** , cadastro do produto: `marcaNome`, `familiaNome`, `tipo`, `precoCusto`, `precoVenda`, `codigo`, `codigoBarras`, unidade. **Falta o campo `linha`** (a criar , seção 8.1).

### 5.3 Comercial
- **`fato_pedido`** , cabeçalho do pedido (cliente, vendedor, empresa/CNPJ, etapa, datas, UF, forma de pagamento, valores).
- **`fato_pedido_item`** , itens do pedido (produto, quantidade, valor, custo).
- **`fato_pedido_parcela`** , parcelas do pedido (para PMR, entrada, condição de pagamento).
- **`fato_nota_fiscal`** / **`fato_nota_fiscal_item`** , notas emitidas (faturamento real).
- **`fato_parceiro`** , cadastro de clientes (segmento, CNPJ, razão social; base do agrupamento por grupo/construtora).

### 5.4 Financeiro
- **`fato_financeiro_titulo`** , títulos a pagar/receber.
- **`fato_financeiro_movimento`** , movimentações financeiras.
- **`fato_financeiro_lancamento_item`** , itens de lançamento (base da composição de despesa por categoria).
- **`fato_conta_contabil`** , plano de contas (categorias de despesa).
- **`dim_empresa_grupo`** , dimensão das empresas do grupo (mapeia CNPJ → empresa).

### 5.5 O que falta (gap de dado, resolvido na camada base , seção 8)
- Atributo **`linha`** do produto.
- Entidade de **ciclo** e **previsão do ciclo** por produto.
- **Meta mensal** de vendas.
- **Categorias do plano de contas** de despesa mapeadas + **UF** na conta a pagar.
- **Mapeamento de CNPJs em grupos** (grupo/Smart/Aztec/construtora).
- **Faixas de status** por produto (thresholds do ciclo).

---

## 6. Regras transversais de dado

Regras que **todos** os módulos seguem. Implementadas uma vez, aplicadas em toda query.

### 6.1 Corte de dados (janela de análise)

- Existe uma configuração global **"Analisar dados a partir de"** (`AppSetting sync.corte_dados`), fonte única em `src/lib/corte-dados.ts`.
- Ela **filtra a leitura**, não apaga nada. Mover a data para trás faz o histórico reaparecer; para frente, estreita a janela.
- Toda consulta de histórico **deve** clampar sua janela ao corte via os helpers (`janelaClampada`, `whereData`, `clampIsoAoCorte`). Ver assinaturas na Parte III.
- **Exceção , Demanda em aberto:** a métrica "demanda a entregar" **não** é recortada pelo corte (usa `janelaDemandaAberta` / piso `PISO_DEMANDA_ABERTA`), porque pedidos antigos ainda não entregues precisam aparecer. Esta exceção vale para os módulos Estoque (demanda), Ciclos (demanda) e Demandas.

### 6.2 Comparação vs. período anterior

- Helper existente `src/lib/reports/builder/janela-anterior.ts`: dada a janela atual, calcula a janela imediatamente anterior de mesmo tamanho e o delta.
- Regra: se a janela anterior termina antes do corte, retorna sem delta (não inventa comparação); se cruza o corte, clampa o início.
- **No módulo Estoque** a comparação é sempre fixa em **30 dias** (não segue a pílula de período): compara o dia atual com 30 dias antes, via `fato_estoque_saldo_snapshot`.
- **Nos demais módulos** a comparação segue a janela selecionada pela pílula de período.
- Apresentação: número em **verde** (melhora) ou **vermelho** (piora), com o `%` de variação. Em comparativos entre entidades (ex.: estado A × B), verde = "A melhor que B naquele quesito".

### 6.3 Filtro de período (pílula)

- Componente de período reutilizável (hoje / semana / mês / este ano / personalizado). Passa às queries uma janela `{ de, ate }` (ISO), já clampada ao corte.
- Todos os módulos **exceto** os cards de foto instantânea do Estoque (que são "agora") respondem à pílula.

### 6.4 Filtro de empresa / CNPJ

- As queries aceitam um filtro opcional de **empresa (CNPJ)** via `dim_empresa_grupo`. Quando ausente, consolida o grupo.
- No módulo Financeiro o recorte por empresa é estrutural (um bloco por CNPJ).

### 6.5 Valoração

- **Estoque** sempre a **valor de custo** (`precoCusto`).
- **Vendas / receita** sempre a **valor faturado** (nota fiscal emitida). "Valor a faturar" usa o valor do pedido ainda não faturado.
- **Margem** = bruta (`faturado − custo`), ponderada pelo valor quando "média".

### 6.6 Frescor do dado

- Todo painel exibe a **última atualização** (timestamp da última sync que alimentou aquele fato). Regra herdada da plataforma ("atualizado há Xs").

---

## 7. Padrões transversais de UI

Componentes e comportamentos reutilizados por todos os módulos. Seguir o design system existente (`src/components/ui/**`) e a skill de UI do projeto. **Reuso antes de criação.**

### 7.1 Card de KPI (indicador)
- Estrutura: rótulo (uppercase, muted) · valor principal (mono, tabular) · variação vs. período anterior (verde/vermelho + %) · legenda curta (base do cálculo).
- Estado sem base de comparação: exibir "Sem base de comparação" em vez de um delta inventado.

### 7.2 Tabela de dados
- **[MUST]** ordenação por coluna (asc/desc; numérico maior↔menor, texto A↔Z).
- **[MUST]** filtros por coluna quando indicado (dropdowns de local/marca/linha/tipo/status; busca textual).
- Números alinhados à direita, `tabular-nums`.
- Drill: clique na linha abre detalhe/seleciona (quando o módulo pedir).
- Densidade e rolagem: contêiner com `overflow-x` próprio; a página nunca rola horizontalmente.

### 7.3 Gráfico de composição (pizza/rosca ↔ barra)
- **[MUST]** seletor de ângulo (marca / linha / tipo / segmento / forma de pagamento / CNPJ) que troca os dados **no mesmo espaço** da tela (um gráfico, botões em cima), em vez de N gráficos lado a lado.
- **[SHOULD]** seletor de tipo de gráfico (pizza padrão; barra opcional). Composição usa pizza/rosca por padrão.
- Participação calculada por **valor** por padrão, com quantidade no detalhe.

### 7.4 Rosca de status (donut)
- Usada nos ciclos: fatia por status (ruptura/risco/saudável/acumulado), com total no centro, legenda com contagem e %, e **drill por fatia** (clicar filtra a tabela pelos produtos daquele status).

### 7.5 Estados
- **Vazio:** mensagem acionável ("Nenhum pedido no período" + o que fazer), nunca tela em branco.
- **Carregando:** skeleton dos cards/tabelas.
- **Erro:** mensagem que explica e sugere ação, nunca "Erro".

### 7.6 Acessibilidade e tema
- Suporte a tema claro/escuro (o design system já provê). Contraste AA nos dois. Ícones só da biblioteca do projeto (Lucide), zero emoji.

### 7.7 RBAC
- Todos os painéis da diretoria respeitam o RBAC existente (visível conforme perfil). Nenhum dado sensível exposto fora do perfil autorizado.

---

## 8. Camada base compartilhada

Cinco frentes de dado que **não são tela** mas habilitam os módulos. Devem ser construídas (ou concluídas) antes ou junto ao primeiro módulo que as consome. Cada uma tem seção própria abaixo.

### 8.1 B1 , Atributo "linha" do produto

**Problema:** a composição por linha (Magnum, Ultra, Versa, Aura) é pedida nos módulos Estoque e Vendas, mas o cache só tem marca, família e tipo. Não há `linha`.

**Solução:**
1. Cliente cria o atributo **linha** no Odoo (campo/atributo de produto) e cadastra por produto.
2. Ingerir a nova origem: entrada no `model-catalog.ts` (se vier de tabela nova) ou `extraFields` (se for campo do produto já sincronizado).
3. Adicionar campo `linha` (e `linhaId` se aplicável) em `FatoProduto` + migration.
4. Propagar `linha` para os fatos de estoque que já carregam marca/família (`fato_estoque_saldo`, `_snapshot`, `_historico`), espelhando o padrão de `marcaNome`.
5. Atualizar o builder `fato-produto.ts` (e os de estoque) + testes.

**DEP:** cadastro no Odoo pelo cliente (sem ele, a coluna vem nula e a composição por linha fica vazia). A UI deve tolerar `linha` nula ("Sem linha").

**CA:** composição por linha no Estoque e em Vendas retorna agrupamento correto; produto sem linha cai no balde "Sem linha".

### 8.2 B2 , Motor de ciclos configurável

**Problema:** não existe entidade de ciclo. Os módulos de Relatório de estoque (ativo e fechado) dependem dela.

**Modelo de dado (novo):**
- **`ciclo`** , `id`, `nome`, `dataInicio`, `dataFim`, `duracaoMeses`, `status` (`ativo` | `fechado`), `empresaId?` (se ciclo por empresa), timestamps.
- **`ciclo_previsao`** , `cicloId`, `produtoId`, `previsaoQtd` (previsão do ciclo por produto, importada , B3).
- **`ciclo_status_config`** , faixas de status por produto (B4).
- **`ciclo_fechamento`** , snapshot congelado do ciclo ao fechar (B5).

**Regras:**
- Duração configurável (2, 3, 4 meses...). Início/fim definidos na criação.
- "Consumido no ciclo" = faturado (nota emitida) dentro de `[dataInicio, dataFim]`.
- Ao trocar de ciclo, o novo começa zerado (nova previsão importada). Ciclos não precisam se "conversar" historicamente, mas o relatório fechado permite comparar dois ciclos (com coluna de **duração** para explicar diferenças de tamanho).

**Cálculos centrais (fonte única, reusável por ativo e fechado):**
- `consumidoNoCiclo(produto, ciclo)` = soma faturada no período.
- `previsaoRestante = previsaoQtd − consumidoNoCiclo` (piso 0? decisão: pode ficar negativo se vendeu mais que previu; ver RN-2.x).
- `cobertura = quantidadeEmEstoque − previsaoRestante`.
- `status` = função de `cobertura` + faixas do produto (B4).

**CA:** dado um ciclo com previsão importada, a tabela do ciclo ativo calcula consumido, restante, cobertura e status corretos e batendo com o faturamento real do período.

### 8.3 B3 , Importadores de dado manual

**Problema:** vários números não nascem do Odoo. Precisam de rotina de importação + validação.

**Importadores (cada um: upload/planilha ou tela de input, validação, persistência, log):**
1. **Previsão do ciclo** por produto (alimenta `ciclo_previsao`).
2. **Meta mensal de vendas** (valor por mês; alimenta o card "Meta atingida" do módulo Vendas).
3. **Categorias do plano de contas** de despesa (se não vierem completas do Odoo) e o mapeamento categoria → grupo de despesa.
4. **UF nas contas a pagar** (se o cliente lançar no Odoo, sincroniza; se não, importador auxiliar).
5. **Mapeamento de CNPJs em grupos** (grupo/Smart/Aztec/construtora) , tabela `cliente_grupo` (`cnpj`/`parceiroId` → `grupoNome`), alimentando o recorte do módulo Vendas.

**Regra:** todo importador valida (produto/CNPJ existe? valor numérico? período válido?) e reporta linhas rejeitadas de forma acionável.

**DEP:** definição do cliente sobre onde cada dado é lançado (Odoo vs. importador). Decisão da reunião: **concentrar a parametrização de previsão/status em um só lugar** para facilitar manutenção.

### 8.4 B4 , Parametrização de status por produto

**Problema:** os status Risco/Saudável/Acumulado são "opinião" e variam por produto (uma máquina de alto giro tolera mais sobra que uma de baixo giro). Só "Ruptura prevista" é regra fixa (cobertura ≤ 0).

**Solução:**
- Pop-up (acionado por "3 pontinhos" na tela do ciclo) para definir, **por produto**, as faixas de cada status, em **unidade ou percentual** (o sistema converte um no outro).
- Persistir em `ciclo_status_config` (`produtoId`, `faixaRiscoDe/Ate`, `faixaSaudavelDe/Ate`, `faixaAcumuladoDe`, unidade/percentual).
- Fallback: se um produto não tem config, usar um default global (a definir com o cliente) ou o estoque mínimo do cadastro, sinalizando "sem parametrização".

**RN:** Ruptura prevista nunca é configurável (`cobertura ≤ 0`).

### 8.5 B5 , Snapshot de fechamento de ciclo

**Problema:** o relatório de ciclo fechado tem que ser imutável (a foto do ciclo no dia em que fechou), independente do estado atual do cache.

**Solução:**
- Job/rotina que, na `dataFim` do ciclo (ou por ação manual), congela em `ciclo_fechamento` todos os números do relatório (por produto e agregados): estoque inicial/final, entradas, previsão, consumido, saldo, status final, acurácia, valores.
- Reusa `fato_estoque_saldo_snapshot` como fonte da fotografia diária (abertura/fechamento mensal).
- O relatório fechado lê **de `ciclo_fechamento`**, nunca recalcula do cache vivo.

**CA:** ao fechar um ciclo, o relatório abre a qualquer momento no futuro com os mesmos números do dia do fechamento, mesmo que o estoque tenha mudado depois.



# Parte II , Módulos

> Cada módulo segue o mesmo template (objetivo, pré-requisitos, requisitos funcionais, especificação por tela, regras de negócio, consultas, filtros, estados, critérios de aceite, dependências). As convenções, o glossário, as regras transversais de dado/UI e a camada base estão na Parte I; os campos de tabela, assinaturas de query e helpers estão na Parte III.

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

---

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

---

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

---

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

---

## Módulo 5 , Demandas
> Telas: 16, 17, 18. Prioridade de entrega: por último (escopo a refinar, cliente vai revisar).

> **Aviso de maturidade (ler antes de planejar).** Este foi o módulo **menos detalhado** na
> reunião de escopo (2026-07-20). O próprio dono declarou, ao apresentá-lo, que "vou refazer
> com calma", e ele aparece em **último** na ordem de prioridade que ele mesmo ditou no fim da
> reunião (1 Estoque, 2 Conferência, 3 Vendas, 4 Ciclos, 5 Financeiro, 6 Demandas). Portanto:
> este documento **congela o que já existe hoje** (a tela `diretoria/pedidos/page.tsx` já
> entrega boa parte disto) e **descreve o alvo dos protótipos 16/17/18**, mas todo requisito
> marcado `COULD` ou com a etiqueta **[A REFINAR]** depende de uma segunda passada de escopo
> com o cliente antes de virar plano de execução. Não tratar `COULD`/`[A REFINAR]` como
> contrato fechado. Ver seção 5.12.

> **Reaproveitamento é a regra aqui.** Diferente dos módulos novos, o Demandas é uma
> **evolução** de uma tela que já roda em produção. A maioria das consultas já existe
> (`queryIndicadoresDemandas`, `queryDemandasPendentes`, `queryDemandasPorUf`,
> `queryEntregasParciais`, `queryEstoqueDisponivel`, `queryDemandaPorProduto`,
> `queryPedidoSituacao`). Cada bloco abaixo marca explicitamente **[REUSO]** (a consulta já
> serve, no máximo um campo a mais) ou **[NOVO]** (métrica/bloco que não existe). Quem
> executar deve começar por ler o arquivo citado, nunca reescrever do zero.

---

### 5.1 Objetivo e usuário

O Módulo Demandas responde uma pergunta operacional única: **o que a empresa vendeu e ainda
não entregou, quanto disso está atrasado, e se há estoque para cobrir**. Não é um painel de
vendas (isso é o Módulo Comercial) nem de estoque parado (isso é o Módulo Estoque): o recorte
é o **pedido em carteira / ativo ainda não entregue**, do primeiro pedido em aberto até hoje.

- **Usuário primário:** diretoria e gestão de operações/logística. Quer saber onde estão os
  gargalos de entrega (qual cliente, qual UF, qual produto), quanto de receita está travada em
  pedido não entregue e quanto disso já venceu o prazo prometido.
- **Usuário secundário:** comercial e compras. O bloco "Máquinas em estoque × demanda" e a
  "concentração de atrasos por produto" alimentam decisão de compra e de priorização de
  produção/remessa.
- **Perguntas que a tela precisa responder de relance:**
  1. Quanto vale o que ainda tenho para entregar? (`valor pendente`)
  2. Quantos pedidos estão abertos e quantos já atrasaram? (`pedidos abertos`, `pedidos atrasados`)
  3. Quantas unidades faltam sair e quanto disso já tem estoque reservado/coberto? (`itens
     pendentes`, `demandas cobertas %`, `valor descoberto`)
  4. Qual produto concentra os atrasos e quanto isso representa em dinheiro? (bloco B9)
  5. Onde (UF) e para quem (cliente) está a demanda? (mapa B4, lista B2)

- **Recorte de dado (não negociável):** só entram pedidos em **demanda em aberta**
  (`fato_pedido.bucket_demanda = 'ABERTA'`), definição na seção 5.2. Pedido já entregue,
  faturado, concluído ou cancelado **não** aparece neste módulo.

- **RBAC:** módulo de diretoria. Capability `diretoria.comercial.view` (ou a área que o
  catálogo de componentes já usa para os blocos de pedido; conferir `catalogo` de componentes,
  onde `G-03 Mapa de demandas por estado` já está registrado no domínio `G`). Segue o padrão
  transversal da seção 7.7 da Parte I. Sem capability, o item de menu não aparece.

---

### 5.2 Definição de demanda em aberto (whitelist de etapas)

Esta é a regra **central** do módulo. Errar aqui contamina todos os oito blocos.

**Fonte única do bucket:** a coluna materializada `fato_pedido.bucket_demanda` (valores
`ABERTA` / `FECHADA` / `null`). Ela é calculada pelo builder do worker
(`src/worker/fatos/fato-pedido-classificacao.ts`), não em tempo de leitura. Toda consulta
deste módulo filtra por `bucket_demanda = 'ABERTA'` e **nunca** reimplementa a classificação.

**Como o bucket é decidido (ordem exata do builder):**

1. **Whitelist autoritativa de etapas.** A constante
   `ETAPAS_DEMANDA_ABERTA` (arquivo `src/lib/fiscal/regras/etapas-demanda-aberta.ts`,
   reexportada por `src/lib/fiscal/regras/index.ts`) é um `ReadonlySet<number>` com **27 IDs de
   etapa** curados a dedo pelo dono, reproduzindo o `pd.etapa_id IN (...)` do relatório oficial
   de Entregas Parciais do Odoo (relatório ID 28). Conteúdo atual (27 itens):

   ```ts
   export const ETAPAS_DEMANDA_ABERTA: ReadonlySet<number> = new Set<number>([
     130, 94, 95, 5, 132, 86, 133, 4, 129, 124, 120, 171, 121, 103, 87, 167,
     202, 203, 204, 205, 179, 180, 185, 186, 187, 183, 226,
   ]);
   ```

   No builder (`fato-pedido-classificacao.ts`): `if (input.etapaId != null &&
   ETAPAS_DEMANDA_ABERTA.has(input.etapaId)) return "ABERTA";`. **Pertencer ao conjunto VENCE**
   os gatilhos dinâmicos da etapa.

2. **Gatilhos dinâmicos (papel secundário).** A função pura
   `classificaEtapaDemanda(gatilhos)` em `src/lib/fiscal/regras/classifica-etapa-demanda.ts`
   ainda existe e classifica o **estágio** da etapa (`ABERTA` / `FECHADA` / `IGNORAR`) pelos
   gatilhos `finalizaFaturamento`, `finalizaPedidoConfirmando`, `finalizaPedidoCancelando`
   (ordem: cancelamento > conclusão/emissão > fallback ABERTA). **Atenção:** desde a Fase 1A
   esta função **não é mais a fonte do bucket**; quem manda é a whitelist. Ela continua útil
   como leitura de estágio e para a coluna `pendencia_etapa`. A exceção antiga por nome ("Nota
   emitida e não entregue") **saiu**: a etapa 226 é mantida na demanda pela whitelist, não por
   nome.

3. **Cruzamento com operação e aprovação** (no builder, não neste módulo): só operações de
   **venda ao cliente** entram, e o gate de aprovação (`data_aprovacao`) é aplicado lá. O
   módulo Demandas confia no `bucket_demanda` já materializado.

**Exceção de janela (seção 6.1 da Parte I) , OBRIGATÓRIA neste módulo:**

A métrica "demanda a entregar" **NÃO** é recortada pelo corte de dados de leitura
(`AppSetting sync.corte_dados`). Um pedido feito em 2025 e ainda não entregue precisa aparecer
hoje. Portanto:

- Toda consulta de demanda usa `janelaDemandaAberta(periodoDe, periodoAte)` de
  `src/lib/corte-dados.ts`, **não** `janelaClampada`. O piso é `PISO_DEMANDA_ABERTA =
  "2000-01-01"` (na prática, o primeiro pedido; "abre tudo").
- A janela vem **só da pílula de período** do topo. Sem período informado, a janela é "Tudo"
  (piso 2000 até o futuro). Com período, recorta pela pílula, mas **nunca** grampeia no corte.
- O campo de data usado para posicionar o pedido na janela é `fato_pedido.data_orcamento`
  (documento com data). Pedido sem `data_orcamento` fica **de fora** (não há data que prove a
  que janela ele pertence).
- Esta exceção vale para os módulos Estoque (demanda), Ciclos (demanda) **e** Demandas. As
  **outras** métricas do sistema seguem `janelaClampada` (piso no corte); só a demanda a
  entregar não.

> **Invariante de paridade (não quebrar):** o card "Demandas a entregar" da diretoria e o
> Relatório de Entregas Parciais somam **exatamente o mesmo número** no mesmo período e mesma
> empresa, porque os dois usam a mesma peça `aAtenderDoItem`
> (`src/lib/diretoria/atendimento-item.ts`). Se divergirem no mesmo escopo, é bug. Ver RN-5.6.

> **Pendência herdada (D7 / P1):** ao adotar os 27 IDs, **peças** e **venda a consumidor
> final** saíram da demanda (some o comprometido dessas famílias na necessidade de compra). O
> dono autorizou remover "por ora" mas **exige a decisão final**. Enquanto não decide, o
> módulo herda esse recorte. Ver `etapas-demanda-aberta.ts` (TODO do dono) e a pesquisa mestre
> 2026-07-20. Rastreado em DEP-5.7 / seção 5.12.

---

### 5.3 Pré-requisitos de dado (tabelas, campos, gaps)

Fontes canônicas (detalhe na seção 5 da Parte I). Campos citados são do schema Prisma
(`prisma/schema.prisma`), com o nome de coluna do banco entre parênteses.

**DEP-5.1 , `FatoPedido` (`fato_pedido`) , cabeçalho do pedido. [existe]**
Campos usados por este módulo:
- `odooId` (PK), `numero`, `tipo`, `etapaId` / `etapaNome`, `operacaoId` / `operacaoNome`.
- `modalidadeFrete` (`modalidade_frete`) , código NF-e modFrete; rótulo via
  `src/lib/diretoria/modalidade-frete.ts`.
- `participanteId` / `participanteNome`, `vendedorId` / `vendedorNome`, `empresaId` /
  `empresaNome`.
- Datas: `dataOrcamento` (janela da demanda), `dataAprovacao`, `dataValidade`, `dataPrevista`
  (**prazo de entrega**, base do "atrasado").
- Valores: `vrProdutos` (valor cheio de produtos), `vrNf`.
- Colunas derivadas (materializadas pelo builder): `categoriaOperacao` (`categoria_operacao`),
  **`bucketDemanda`** (`bucket_demanda`, indexado), `pendenciaEtapa` (`pendencia_etapa`).
- Índices já existentes relevantes: `@@index([dataOrcamento])`, `@@index([etapaId])`,
  `@@index([bucketDemanda])`, `@@index([categoriaOperacao])`.

**DEP-5.2 , `FatoPedidoItem` (`fato_pedido_item`) , linhas de produto do pedido. [existe]**
- `odooId` (PK), `pedidoId` (`pedido_id`, indexado), `produtoId` / `produtoNome`,
  `familiaNome`, `marcaNome`.
- `quantidade` (Decimal 18,4 , quantidade cheia da linha).
- `cfopId`, `localReservaId` (`local_reserva_id`) , **base candidata da coluna "reserva"** do
  B2 (ver DEP-5.6, é gap de definição, não de dado).
- `vrProdutos` (valor de venda da linha), `vrCusto`.
- `quantidadeAAtender` (`quantidade_a_atender`, **nullable**) e `quantidadeAtendida`
  (`quantidade_atendida`, **nullable**) , campos COMPUTADOS do Odoo, mantidos pelo job de
  atendimento (`src/worker/sync/atendimento.ts`). **Nulo de propósito** enquanto o job não
  rodou (nulo = "ainda não sei"; zero significaria "nada a entregar"). Ver DEP-5.5.
- Índices: `@@index([pedidoId])`, `@@index([produtoId])`.

**DEP-5.3 , `FatoEstoqueSaldo` (`fato_estoque_saldo`) , saldo de estoque por produto/local.
[existe]**
- `produtoId` / `produtoNome`, `localId` / `localNome`, `quantidade` (Decimal 18,4),
  `vrSaldo`, `familiaId` / `familiaNome`, `marcaId` / `marcaNome`.
- Usado no lado do SALDO de B7 (máquinas em estoque) e no cálculo de cobertura (`demandas
  cobertas %`, `valor descoberto`). Regra do saldo: **só `quantidade > 0`** (linha negativa é
  furo de inventário e não vira "disponível"), e só o **estoque físico da casa** (escopo
  `fisico` via `whereLocalDoEscopo`), como já faz `queryEstoqueDisponivel`.

**DEP-5.4 , `FatoParceiro` (`fato_parceiro`) , cliente e UF. [existe]**
- `uf` (indexado) , base do mapa B4 e da coluna UF do B2, normalizada por `siglaDeUf`
  (`src/lib/diretoria/uf.ts`). `nome`, `cidade`.
- **Gap conhecido:** parte dos pedidos não resolve UF do cliente (participante sem UF). Isso
  gera o balde **"Sem UF"** já tratado nos KPIs de diretoria (ver `docs/kpis-diretoria.md`). O
  mapa não deve somar "Sem UF" a nenhum estado; é uma linha à parte.

**DEP-5.5 , Job de atendimento (frescor do "a atender"). [existe, condicional]**
- Fonte da verdade de "quanto falta entregar por linha". Estado lido por
  `atendimentoSincronizado(prisma)` (`src/lib/diretoria/atendimento-status.ts`), que devolve
  `{ ok, em }`. Quando `ok=false` (job nunca rodou ou está velho), **toda** métrica de "a
  entregar" cai na **quantidade cheia** com aviso na UI ("valores provisórios"). Regra
  encapsulada em `aAtenderDoItem` (piso em zero; o Odoo devolve negativo quando entregou a
  mais). **Nenhuma consulta deste módulo pode ignorar esse flag.**

**DEP-5.6 , Coluna "reserva" do B2. [GAP DE DEFINIÇÃO , A REFINAR]**
O protótipo 16 mostra uma coluna **RESERVA** com um checkbox por linha. Não há, hoje, um
conceito fechado de "reserva" no cache. Candidatos:
- (a) `FatoPedidoItem.localReservaId` preenchido = item tem local de reserva definido no Odoo;
- (b) existência de saldo de estoque reservado para aquele produto;
- (c) um flag operacional que o cliente ainda vai definir.
Marcado como **pendência de escopo** (o cliente vai refinar). Até lá, a coluna pode ser
renderizada como "indefinida" ou omitida. Ver seção 5.12 / RN-5.9.

**DEP-5.7 , Whitelist de etapas (peças / consumidor final). [decisão pendente do dono]**
Ver seção 5.2 (D7 / P1). Não bloqueia a tela; muda **o conjunto** de pedidos considerados
demanda quando o dono decidir. Qualquer número deste módulo se move se a whitelist mudar.

**DEP-5.8 , Atributo "linha" e "tipo" do produto. [GAP , camada base B1/B4 da Parte I]**
Os protótipos de outros módulos falam de agrupar por **linha** (Magnum/Ultra/Versa/Aura) e
**tipo** (seletorizada/peso livre/cardio/acessório). Hoje o cadastro só tem **marca** e
**família**. O B7 (máquinas em estoque) e o B8 (itens ativos) do protótipo já exibem
subtítulos tipo "ACESSÓRIOS · BODY JOY" (família · marca), então **não dependem** de linha
para a v1. Se o cliente pedir recorte por linha/tipo aqui, isso reusa o gap já resolvido na
camada base (seção 8 da Parte I), não é trabalho deste módulo.

---

### 5.4 Requisitos funcionais [MoSCoW]

Prioridade conforme seção 2.2 da Parte I (MUST / SHOULD / COULD / WON'T). Como o módulo é o
último e "a refinar", o núcleo já entregue hoje é `MUST`; o que é novidade dos protótipos é
majoritariamente `SHOULD`/`COULD`.

| ID | Requisito | Prioridade |
|---|---|---|
| RF-5.1 | Exibir o **resumo** (8 cards): valor pendente, pedidos abertos, pedidos atrasados, itens pendentes, ticket médio, demandas cobertas %, valor descoberto, valor atrasado. | MUST |
| RF-5.2 | Listar **pedidos pendentes** em tabela, **uma linha por unidade de item**, agrupada por pedido (rótulo "unidade X de Y"), com cliente, modelo, UF, prazo, status, reserva e valor pendente. | MUST |
| RF-5.3 | Filtros da lista B2: **Abertos / Atrasados / Todos** + busca livre por cliente, modelo, UF ou status. | MUST |
| RF-5.4 | Bloco **Máquinas em estoque × demanda** (B7): por modelo, disponível, demanda e % em demanda, com busca. | MUST |
| RF-5.5 | **Drill do pedido selecionado** (B5): clicar numa linha do B2 abre os indicadores detalhados do pedido (trilha de etapas, itens, saldo de estoque, pendência). Estado vazio quando nada selecionado. | SHOULD |
| RF-5.6 | **Visão geral** (B6): valor total em pedidos ativos, quantidade de pedidos ativos, valor médio, "quando mais caro" (maior pedido) e rosca **atrasados × no prazo × sem prazo** (três baldes disjuntos, ver 5.6.5). | SHOULD |
| RF-5.7 | **Mapa de demandas por estado** (B4): heatmap do Brasil, colorido pela intensidade da demanda por UF, **clicável para filtrar** o módulo por estado. | SHOULD |
| RF-5.8 | **Itens vendidos em pedidos ativos** (B8): por modelo, split entregues × a entregar × atrasados, gráfico de quantidade vendida (barras, top N), com card de indicadores do modelo selecionado e toggle de período. | SHOULD |
| RF-5.9 | **Concentração de atrasos por produto** (B9): ranking dos produtos com mais itens atrasados (barras + valor + % dos atrasos) e cards agregados (total de itens atrasados, valor total atrasado, produto com mais atraso, Top 3 concentra %). | SHOULD |
| RF-5.10 | Todas as métricas respeitam a **pílula de período** (janela da demanda, não o corte) e o **filtro de empresa**. **Exceção:** cobertura % (M-5.6) e valor descoberto (M-5.7) usam saldo físico que **não é escopável por empresa/UF**; sob filtro de empresa/UF ficam travados ao grupo ou avisam (RN-5.8). | MUST |
| RF-5.11 | Selecionar um modelo no B8 recorta os indicadores do modelo; "Limpar seleção" volta ao agregado ("Todos os modelos"). | COULD |
| RF-5.12 | Selecionar um estado no B4 filtra **B2/B6/B8/B9** (blocos demand-side) por aquela UF; **B7 não é afetado** (saldo físico não é escopável por UF, RN-5.8), assim como B4 (o próprio mapa) e B5 (drill de um pedido). Lista canônica dos blocos afetados: seção 5.9. Clicar de novo limpa. | COULD |
| RF-5.13 | Coluna/flag **Reserva** com semântica fechada de negócio. | COULD (bloqueado por DEP-5.6) |
| RF-5.14 | Recorte por **linha** / **tipo** de produto neste módulo. | WON'T (v1) , depende da camada base B1/B4 |
| RF-5.15 | Aviso de **frescor** ("atualizado há Xs") e de **valores provisórios** quando o job de atendimento não rodou. | MUST |

---

### 5.5 Métricas e fórmulas

Convenções: `Σ` = soma sobre o universo filtrado (bucket ABERTA + janela da demanda + empresa
+ UF opcional). `aAtender(linha)` = `aAtenderDoItem(...)` (piso 0; cheia quando job off).
Todos os valores monetários em BRL, 2 casas.

**M-5.1 , Valor pendente.**
Valor de venda do que ainda falta entregar, somado sobre todas as linhas de item dos pedidos
abertos:
```
valorPendente = Σ_linha ( aAtender(linha) × precoUnitVenda(linha) )
precoUnitVenda(linha) = linha.vrProdutos / linha.quantidade   (0 se quantidade = 0)
```
O card VALOR PENDENTE usa o `aAtenderVenda` de `IndicadoresEntregasParciais`
(`queryEntregasParciais`) no mesmo escopo , **é venda**. **Não** usar o `valorAEntregar` de
`queryIndicadoresDemandas`, que soma **a custo** e serve só à paridade interna (RN-5.6), não ao
card. Card mostra o total. (Ver RN-5.4 para a base venda/custo por card.)

**M-5.2 , Pedidos abertos.**
`pedidosAbertos = COUNT(DISTINCT pedidoId)` no universo (bucket ABERTA + janela + empresa/UF).
No protótipo: 42.

**M-5.3 , Pedidos atrasados.**
`pedidosAtrasados = COUNT(DISTINCT pedidoId WHERE dataPrevista != null AND dataPrevista <
hoje)`. "Atrasado" = **prazo de entrega (`data_prevista`) já venceu**. Pedido sem
`data_prevista` **não** conta como atrasado (é "sem prazo"). No protótipo: 41.

**M-5.4 , Itens pendentes.**
`itensPendentes = Σ_linha aAtender(linha)` (unidades, não linhas). No protótipo: 105.

**M-5.5 , Ticket médio.**
`ticketMedio = valorPendente / pedidosAbertos` (guardar divisão por zero → 0). Confere no
protótipo: 2.148.900,00 / 42 = 51.164,29.

**M-5.6 , Demandas cobertas (%).**
Fração das unidades pendentes que **têm estoque disponível** para cobrir. Cruza demanda ×
saldo por produto (mesma lógica de `queryEstoqueDisponivel`):
```
Para cada produto p:
  demanda(p)      = Σ aAtender das linhas de p          (unidades pendentes)
  disponivel(p)   = saldoFisicoPositivo(p) − demanda(p) (pode ser negativo)
  cobertas(p)     = min(demanda(p), max(0, saldoFisicoPositivo(p)))
demandasCobertas% = Σ_p cobertas(p) / Σ_p demanda(p)
```
No protótipo: "22,9% , 24 de 105 unidades pendentes cobertas". **[A REFINAR]** confirmar com o
cliente se cobertura é "há saldo hoje" (o cálculo acima) ou "há reserva vinculada" (depende de
DEP-5.6).

> **Escopo do saldo (assunção A-5.6, validar contra o cache):** `fato_estoque_saldo` **não tem
> `empresaId`** , o saldo é físico da casa inteira (grupo). Logo a cobertura só é **íntegra no
> nível GRUPO**. Com filtro de empresa/UF ativo, a **demanda** encolhe para o CNPJ/UF mas o
> **saldo** continua o do grupo inteiro, o que **infla** a cobertura (estoque do grupo "cobre" a
> demanda de um CNPJ). Regra: quando houver filtro de empresa ou UF, **travar cobertura % e
> valor descoberto ao escopo global** (calcular sempre no grupo) **ou** exibir aviso de que
> "saldo não é escopável por empresa/UF" e a cobertura é do grupo. Ver RN-5.8. **Passo de
> validação:** confirmar no schema/`SELECT` que `fato_estoque_saldo` não tem coluna de empresa
> antes de implementar; se passar a ter, esta restrição cai.

**M-5.7 , Valor descoberto.**
Valor de venda das unidades pendentes **sem** cobertura de estoque:
```
descobertas(p)  = max(0, demanda(p) − max(0, saldoFisicoPositivo(p)))
valorDescoberto = Σ_p ( descobertas(p) × precoUnitVendaMedio(p) )
```
No protótipo: R$ 1.502.800,00 , "81 unidades sem cobertura confirmada" (105 − 24 = 81).
Mesma restrição de escopo da M-5.6 (assunção A-5.6): como o saldo não é escopável por
empresa/UF, o valor descoberto só é íntegro no nível GRUPO; com filtro de empresa/UF, travar ao
escopo global ou avisar (ver RN-5.8).

**M-5.8 , Valor atrasado.**
Valor pendente dos pedidos com prazo vencido:
```
valorAtrasado = Σ_linha∈pedidosAtrasados ( aAtender(linha) × precoUnitVenda(linha) )
```
No protótipo: R$ 2.135.300,00 , "41 pedidos com prazo vencido". (Note que casa com o total do
B9 "103 itens atrasados · R$ 2.135.300,00": a mesma base, um agregada por valor, a outra por
produto.)

**M-5.9 , % em demanda (por modelo, B7).**
`percEmDemanda(p) = demanda(p) / (saldoFisicoPositivo(p) + demanda(p))` **[A REFINAR]** , o
denominador pode ser `disponível + demanda` ou só `saldo`. Definição do denominador vai com o
cliente. No protótipo, todos os modelos aparecem com 0% porque o mock está com demanda = 0 em
todos (dado sintético; ver RN-5.10).

**M-5.10 , Split do modelo (B8): entregues × a entregar no prazo × atrasados. [A REFINAR]**
Por modelo `p`, sobre os itens em pedidos ativos, em **três baldes DISJUNTOS** (não se
sobrepõem), para que os percentuais somem 100%:
```
aEntregar(p)      = Σ aAtender das linhas de p              (total ainda pendente)
entregues(p)      = Σ quantidadeAtendida das linhas de p    (unidades já saídas)
atrasados(p)      = Σ aAtender das linhas de p em pedidos com data_prevista < hoje
aEntregarPrazo(p) = aEntregar(p) − atrasados(p)             ("a entregar no prazo", disjunto)
```
Os três baldes exibidos são `entregues`, `aEntregarPrazo` e `atrasados`. **Atenção:**
`atrasados` **não** é subconjunto do balde "a entregar" mostrado; o que aparece como "a
entregar" é o `aEntregarPrazo` (a entregar menos atrasados). O denominador dos percentuais é
fixo em `entregues + aEntregar` (o "total" do modelo naquele recorte, que é igual a
`entregues + aEntregarPrazo + atrasados`). No protótipo agregado (B8 "Todos os modelos"):
entregues 0, a entregar no prazo 271 (72,5%), atrasados 103 (27,5%), base 374 (= 0 + 271 +
103). **Nota:** "entregues 0" no protótipo é artefato do mock (job de atendimento não
populado); em produção `quantidadeAtendida` traz o real. **[A REFINAR]:** este split é um ponto
do desenho que o cliente ainda vai revisar (ver seção 5.12).

**M-5.11 , Concentração de atrasos (B9).**
```
Para cada produto p com itens atrasados:
  itensAtrasados(p) = Σ aAtender das linhas de p em pedidos atrasados
  valorAtrasado(p)  = Σ ( aAtender × precoUnitVenda ) dessas linhas
  %dosAtrasos(p)    = valorAtrasado(p) / Σ_q valorAtrasado(q)
totalItensAtrasados = Σ_p itensAtrasados(p)                 (protótipo: 103)
valorTotalAtrasado  = Σ_p valorAtrasado(p)                  (protótipo: R$ 2.135.300,00)
produtoComMaisAtraso = argmax_p itensAtrasados(p)           (protótipo: Leg Press 45° Titanium)
top3Concentra%      = Σ top3 valorAtrasado(p) / valorTotalAtrasado   (protótipo: 60,2%)
```

**Regra de valoração transversal (seção 6.5 da Parte I):** os cards de resumo do protótipo
estão a **preço de venda** (o `valorPendente` de 2,14M bate com venda). O painel legado da
diretoria usa **custo** em alguns lugares. Ao consolidar, decidir por card e **rotular**
(venda/custo), como o Relatório de Entregas Parciais já faz. Ver RN-5.4.

---

### 5.6 Especificação da tela por bloco

Layout dos protótipos (16/17/18), de cima para baixo, duas colunas na maior parte:
- Faixa de topo: **Resumo das demandas** (8 cards).
- Linha: **B2 Lista de pedidos pendentes** (esquerda) | **B7 Máquinas em estoque** (direita).
- Linha: **B5 Indicadores do pedido selecionado** (esquerda) | **B4 Mapa por estado** (direita).
- **B6 Visão geral das demandas** (esquerda, ao lado do mapa em 18).
- **B8 Itens vendidos em pedidos ativos** (faixa larga).
- **B9 Concentração de atrasos por produto** (faixa larga).

Todos os blocos herdam os padrões de UI da seção 7 da Parte I (card de KPI 7.1, tabela 7.2,
rosca de status 7.4, estados 7.5, tema/acessibilidade 7.6). Cor primária violet `#7c3aed`;
tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`); ícones Lucide; zero
emoji.

#### 5.6.1 Resumo das demandas (cards)

Cabeçalho: título "RESUMO DAS DEMANDAS", subtítulo "Pedidos ativos, pendências, atrasos,
cobertura e valor descoberto", canto direito "N pedidos abertos no filtro".

Oito cards de KPI (padrão 7.1), em duas linhas de quatro:

| Card | Valor (fonte) | Legenda | Cor de destaque |
|---|---|---|---|
| VALOR PENDENTE | M-5.1 | "em pedidos ativos ainda não entregues" | neutro/branco |
| PEDIDOS ABERTOS | M-5.2 | "N abertos na base total" | azul |
| PEDIDOS ATRASADOS | M-5.3 | "Há prazos vencidos no filtro" | vermelho |
| ITENS PENDENTES | M-5.4 | "Unidades ainda não entregues" | azul claro |
| TICKET MÉDIO | M-5.5 | "Média por pedido aberto filtrado" | verde |
| DEMANDAS COBERTAS | M-5.6 (%) | "X de Y unidades pendentes cobertas" | verde/âmbar por faixa |
| VALOR DESCOBERTO | M-5.7 | "Z unidades sem cobertura confirmada" | vermelho |
| VALOR ATRASADO | M-5.8 | "N pedidos com prazo vencido" | vermelho |

Regras de UI:
- Cores por **semântica**, não hardcode: "atrasado"/"descoberto" em vermelho semântico;
  "ticket"/"cobertas" em positivo. Contraste AA nos dois temas.
- Card com valor 0 e universo vazio: mostrar 0 formatado, não travar (ver 5.10).
- Frescor: rodapé/badge do bloco mostra "atualizado há Xs" (última sync) e, se o job de
  atendimento estiver off, aviso "valores provisórios (quantidade cheia)".

[REUSO parcial] `queryIndicadoresDemandas` já entrega `totalPendentes` e `atrasadas`
(contagens) e `valorAEntregar` **a custo**. Atenção: os oito cards do resumo são **a venda**, e
o `valorAEntregar` a custo **não** alimenta o card VALOR PENDENTE , ele é insumo da paridade
interna a custo (RN-5.6), que é invariante interno, não card. O card VALOR PENDENTE (M-5.1) vem
do `aAtenderVenda` de `queryEntregasParciais`. [NOVO] itens pendentes (unidades), ticket médio,
demandas cobertas %, valor descoberto, valor atrasado. Consolidar numa consulta única (Q-5.1)
para os oito virem coesos.

#### 5.6.2 Lista de pedidos pendentes (B2)

Cabeçalho: "B2 , LISTA DE PEDIDOS PENDENTES", canto direito "N pedidos · M linhas unitárias ·
K em demandas". Busca: "Buscar cliente, modelo, UF ou status...". Abas: **ABERTOS |
ATRASADOS | TODOS**.

**Grão: uma linha por UNIDADE de item, agrupada por pedido.** No protótipo, "Cross Station
Funcional" de "Arena Fitness Fortaleza" aparece em 4 linhas: "UNIDADE 1 DE 4" ... "UNIDADE 4
DE 4", todas com mesmo cliente, UF, prazo e status. Ou seja, cada unidade **ainda pendente** de
uma linha de item vira uma linha visual. Isso é **evolução**: a consulta atual
`queryDemandasPendentes` devolve **uma linha por pedido**; `queryEntregasParciais` devolve
**uma linha por item** (com `qtdAAtender` agregada), mas nenhuma das duas explode por unidade.

Colunas:
- **CLIENTE** , `fato_parceiro.nome` (via `participanteId`).
- **MODELO** , `fato_pedido_item.produtoNome` + subtítulo "UNIDADE i DE n" (n = `aAtender` da
  linha, arredondado para inteiro; i = índice da unidade).
- **UF** , `siglaDeUf(fato_parceiro.uf)`; "Sem UF" quando nulo.
- **PRAZO** , `fato_pedido.dataPrevista` (dd/mm/aaaa); vazio quando sem prazo.
- **STATUS** , badge "ATRASADO" (vermelho) quando `dataPrevista < hoje`; "ABERTO" (neutro)
  caso contrário.
- **RESERVA** , checkbox. **[A REFINAR / DEP-5.6]** semântica pendente; até definir, renderizar
  desabilitado/indefinido.
- **VALOR PENDENTE** , valor de venda da **unidade** = `precoUnitVenda(linha)` (por unidade) ou
  o valor da linha rateado por unidade. No protótipo cada unidade de "Cross Station" = R$
  31.200,00.

Comportamento:
- **Abas** filtram o conjunto: ABERTOS (todas as unidades pendentes), ATRASADOS (só de pedidos
  com prazo vencido), TODOS (inclui as já entregues? , **[A REFINAR]**: como o universo é só
  bucket ABERTA, "TODOS" provavelmente = abertos + atrasados sem o filtro de aba; confirmar).
- **Busca** casa cliente, modelo, UF ou status, case-insensitive, substring.
- **Clique numa linha** seleciona o pedido e alimenta o B5 (drill). Linha selecionada com
  realce (borda violet).
- Ordenação default: por valor pendente desc (como `queryDemandasPendentes` já faz), com
  agrupamento visual por pedido preservado.
- Rodapé conta "N pedidos · M linhas unitárias" (M = Σ `aAtender` inteiro).

[REUSO base] `queryDemandasPendentes` (universo, UF, valor) + `queryEntregasParciais`
(grão-item, `qtdAAtender`, cor de etapa, status financeiro). [NOVO] explosão por unidade e a
coluna reserva. Ver Q-5.2.

#### 5.6.3 Máquinas em estoque × demanda (B7)

Cabeçalho: "B7 , MÁQUINAS EM ESTOQUE", canto direito "N modelos · M disponíveis · K em
demanda". Busca: "Buscar por letras ou números do modelo...".

Tabela por **modelo** (produto), ordenada por menor disponibilidade primeiro (quem precisa de
compra no topo, como `queryEstoqueDisponivel` já faz):
- **MODELO** , `produtoNome` + subtítulo "FAMÍLIA · MARCA" (ex.: "ACESSÓRIOS · BODY JOY").
- **DISPONÍVEL** , `disponivel = saldoFisicoPositivo − demanda` (verde quando ≥ 0; vermelho
  quando negativo = precisa comprar).
- **DEMANDA** , unidades pendentes do modelo (`demanda(p)`, Σ `aAtender`).
- **% EM DEMANDA** , M-5.9, com barra de progresso.

Regras:
- Lado do saldo: só `quantidade > 0` e só estoque **físico da casa** (escopo `fisico`), idêntico
  a `queryEstoqueDisponivel` (não contar demonstração/terceiros; senão fabrica "disponível"
  onde não há mercadoria).
- Lado da demanda: `janelaDemandaAberta` (segue a pílula, não o corte). O saldo é foto de hoje
  (sem data), então a janela **não** se aplica ao saldo.
- Busca por nome/código do produto (substring, case-insensitive).

[REUSO direto] `queryEstoqueDisponivel` já entrega `saldo`, `demanda`, `disponivel` por
produto. [NOVO] só o campo **% em demanda** (M-5.9) e o subtítulo família·marca. Ver Q-5.3.

#### 5.6.4 Indicadores do pedido selecionado (B5 , drill)

Cabeçalho: "B5 , INDICADORES DO PEDIDO SELECIONADO", canto direito "Selecione uma linha no
B2". **Estado vazio** (default): "Clique em um pedido na tabela B2 para visualizar os
indicadores detalhados do pedido." (padrão 7.5).

Ao selecionar um pedido no B2, exibir o detalhe do pedido:
- Cabeçalho do pedido: número (`fato_pedido.numero`), cliente, UF/cidade, etapa atual
  (`etapaNome` + cor da etapa), valor cheio e valor pendente, prazo (`dataPrevista`), status
  atrasado/no prazo, dias parado na etapa atual.
- **Trilha de etapas**: por onde o pedido passou e há quanto tempo está na etapa atual (dias
  parado), o que `queryPedidoSituacao` já devolve (`trilha`, `tempoEtapaDias`).
- **Itens do pedido**: por linha, produto, quantidade, valor de produtos, **saldo em estoque**
  do produto, **faltando** e `temEstoque` (também de `queryPedidoSituacao`).
- **Pendência**: o que falta para o pedido avançar, derivado dos gatilhos da etapa atual
  (`pendencia`, campo `pendenciaEtapa`).

[REUSO direto] `queryPedidoSituacao(prisma, { numero })` já entrega trilha, itens com
saldo/faltando, pendência e o caso `multiplosMercos`. Nenhuma consulta nova; só ligar o clique
do B2 ao número do pedido. Ver Q-5.4.

#### 5.6.5 Visão geral (B6 , atrasados × no prazo)

Cabeçalho: "B6 , VISÃO GERAL DAS DEMANDAS", canto direito "Brasil inteiro · N pedidos ativos"
(muda para "UF X · ..." quando o mapa filtra).

Quatro cards + uma rosca:
- **VALOR TOTAL EM PEDIDOS ATIVOS** , M-5.1 (ou valor cheio dos pedidos, **[A REFINAR]**: o
  protótipo mostra 2.148.900,00 = valor pendente; confirmar se é pendente ou cheio).
- **QUANTIDADE DE PEDIDOS ATIVOS** , M-5.2.
- **VALOR MÉDIO DOS PEDIDOS** , M-5.5 (ticket médio, verde).
- **QUANDO MAIS CARO** , maior pedido do universo, com valor + cliente + modelo (protótipo: R$
  124.800,00 · Arena Fitness Fortaleza · Cross Station Funcional). **[NOVO]** métrica "top 1
  pedido por valor".
- **Rosca de status** (padrão 7.4), **três baldes disjuntos** para não jogar "sem prazo" dentro
  de "no prazo": "Atrasados X% · n" (`data_prevista != null AND data_prevista < hoje`), "No
  prazo Y% · m" (`data_prevista != null AND data_prevista >= hoje`) e "Sem prazo Z% · k"
  (`data_prevista IS NULL`, nunca atrasado por RN-5.3). Centro mostra o % de atrasados. Base:
  pedidos ativos; os três baldes somam 100%. No protótipo: 97,6% atrasados · 41; no prazo 2,4%
  · 1; sem prazo 0 (o mock não tem pedido sem prazo). Se optar por rosca binária, "No prazo"
  **tem que** declarar na legenda que inclui os "sem prazo".

[REUSO parcial] `queryIndicadoresDemandas` dá `totalPendentes` / `valorAEntregar` /
`atrasadas` para a rosca e os cards de contagem. [NOVO] "quando mais caro" e "valor médio".
Consolidar em Q-5.5 (ou reaproveitar a Q-5.1 do resumo, que já calcula quase tudo).

#### 5.6.6 Mapa de demandas por estado (B4 , heatmap clicável)

Cabeçalho: "B4 , MAPA DE DEMANDAS POR ESTADO", canto direito "N estados com pendências ·
clique para filtrar".

- Mapa do Brasil (SVG por UF), cor por intensidade da demanda (heatmap): estado com mais
  demanda em vermelho forte, sem demanda em cinza/neutro. Escala relativa ao máximo do
  conjunto.
- Métrica de intensidade **[A REFINAR]**: valor pendente por UF (default) ou quantidade de
  pedidos por UF. O protótipo colore por intensidade; confirmar a métrica com o cliente.
- Tooltip por estado: UF, nº de pedidos, valor pendente.
- **Clicável**: clicar num estado filtra os blocos demand-side **B2/B6/B8/B9** por aquela UF
  (RF-5.12; lista canônica em 5.9); **B7 não muda** (saldo do grupo, não escopável por UF,
  RN-5.8) e B5 (drill) também não; clicar de novo limpa. Estado selecionado com contorno
  destacado.
- **"Sem UF"** não entra no mapa (não há estado); vira uma linha/legenda à parte, ou é omitido
  com nota. Nunca somado a um estado.

[REUSO direto] `queryDemandasPorUf(prisma, filtros)` já devolve `{ linhas: [{ uf, quantidade,
valorTotal }], valorGeral }`. Só ligar a renderização SVG e o clique. Componente `G-03 Mapa de
demandas por estado` já existe no catálogo (domínio G). Ver Q-5.6.

#### 5.6.7 Itens vendidos em pedidos ativos (B8) [A REFINAR]

Cabeçalho: "B8 , ITENS VENDIDOS EM PEDIDOS ATIVOS", toggle central "TODOS OS PERÍODOS", canto
direito "X unidades vendidas · Y modelos · <período> · top N de Y · selecionado: <modelo> ·
pedidos ativos".

Duas partes:
1. **Indicadores do modelo** (cards, padrão 7.1): título "<modelo> · <período>" ou "Todos os
   modelos · Todos os períodos"; botão "LIMPAR SELEÇÃO". Três cards:
   - ITENS ENTREGUES , M-5.10 `entregues`, com "X% do total · N pedidos".
   - ITENS A SEREM ENTREGUES , M-5.10 `aEntregarPrazo` (a entregar **menos** atrasados), com
     "X% do total · no prazo".
   - ITENS ATRASADOS , M-5.10 `atrasados`, com "X% do total · prazo vencido".

   Os três baldes são **disjuntos** e o percentual de cada um é sobre o denominador fixo
   `entregues + aEntregar` (ver M-5.10); somam 100%.
2. **Gráfico "QUANTIDADE VENDIDA"** (barras verticais), um por modelo, valor = unidades no
   recorte, ordenado desc, top N (protótipo: top 28 de 37). Barra do modelo **selecionado**
   destacada (contorno). Clicar numa barra seleciona o modelo e recorta os três cards acima
   (RF-5.11).

Toggle de período: "Todos os períodos" vs. a pílula do topo (**[A REFINAR]**: confirmar se o
toggle é independente da pílula global ou apenas a espelha; nome sugere um "abrir tudo" local).

[REUSO parcial] `queryDemandaPorProduto` já entrega `linhas: [{ produtoId, produtoNome,
familiaNome, quantidade (a atender), valorProdutos, valorCusto }]` ordenado por quantidade
desc , serve para o gráfico e o "a entregar". [A REFINAR] o split em três baldes disjuntos
(entregues × a entregar no prazo × atrasados) por modelo é desenho a revisar com o cliente:
precisa somar `quantidadeAtendida`, aplicar o recorte de pedido atrasado e derivar
`aEntregarPrazo = aEntregar − atrasados`. Ver Q-5.7 e M-5.10.

#### 5.6.8 Concentração de atrasos por produto (B9 , ranking + Top 3)

Cabeçalho: "CONCENTRAÇÃO DE ATRASOS POR PRODUTO", canto direito "N itens atrasados · R$
<valorTotalAtrasado>".

Duas colunas:
1. **Cards agregados** (esquerda):
   - TOTAL DE ITENS ATRASADOS , M-5.11 `totalItensAtrasados` + "K modelos com atraso"
     (protótipo: 103 · 8 modelos).
   - VALOR TOTAL ATRASADO , M-5.11 `valorTotalAtrasado` + "valor pendente vencido" (protótipo:
     R$ 2.135.300,00).
   - PRODUTO COM MAIS ATRASO , `produtoComMaisAtraso` + "N itens · R$ ..." (protótipo: Leg Press
     45° Titanium · 24 itens · R$ 646.100,00).
   - TOP 3 CONCENTRA , `top3Concentra%` + "dos itens atrasados" (protótipo: 60,2%).
2. **Ranking** (direita): lista ordenada por valor atrasado desc, cada linha com posição, nome
   do produto, "R$ <valor> · X% dos atrasos", barra de progresso (largura = % do maior) e "N
   ITENS" à direita (protótipo: "1. Leg Press 45° Titanium , R$ 646.100,00 · 23,3% dos atrasos ,
   24 ITENS").

Regras:
- Universo: só linhas de item em **pedidos atrasados** (`dataPrevista < hoje`) do bucket ABERTA,
  na janela da demanda + empresa/UF.
- Barra de cada produto: gradiente vermelho, largura relativa ao produto do topo.
- "% dos atrasos" é sobre **valor** (não sobre itens), a menos que o cliente peça o contrário
  (**[A REFINAR]**: o card diz "% dos atrasos" e a legenda do TOP 3 diz "dos itens atrasados";
  padronizar a base do %).

[NOVO] Consulta dedicada (Q-5.8): agrega por produto o que está atrasado. Reaproveita
`aAtenderDoItem` e o predicado de atraso (pedido com `dataPrevista < hoje`).

---

### 5.7 Regras de negócio e edge cases

**RN-5.1 , Universo é sempre `bucket_demanda = 'ABERTA'`.** Nenhum bloco lê pedido fora desse
bucket. FECHADA/null nunca entram. A classificação é a materializada pelo builder (seção 5.2);
o módulo não reclassifica.

**RN-5.2 , Janela da demanda não é cortada pelo corte de leitura.** Usar
`janelaDemandaAberta` (piso 2000), **nunca** `janelaClampada`, em toda consulta de demanda. A
janela vem só da pílula. Sem período = "Tudo" (do primeiro pedido). Campo de posicionamento:
`data_orcamento`. Pedido sem `data_orcamento` fica de fora. (Seção 6.1 da Parte I.)

**RN-5.3 , Definição de "atrasado".** Um pedido/linha está atrasado quando
`fato_pedido.data_prevista != null` **e** `data_prevista < hoje` (data de Brasília, início do
dia). Sem `data_prevista` = "sem prazo", nunca atrasado. "Hoje" é o `hoje: Date` passado às
consultas (não `now()` inline), para testabilidade , como as consultas atuais já fazem.

**RN-5.4 , Venda vs. custo, sempre rotulado.** O resumo do protótipo está a **preço de
venda**. O painel legado usa **custo** em partes. Cada card declara a base e a UI rotula. Não
misturar num mesmo número. A paridade com o Relatório de Entregas Parciais é sobre o **custo**
(`aAtenderCusto`); a paridade dos cards de venda é sobre `aAtenderVenda`. (Seção 6.5 Parte I.)

**RN-5.5 , "A atender" com piso zero e fallback de quantidade cheia.** Toda soma de "falta
entregar" passa por `aAtenderDoItem`: `aAtender = max(0, jobOk ? quantidadeAAtender :
quantidade)`. Quando o job de atendimento não rodou (`atendimentoSincronizado().ok = false`),
cai na quantidade cheia **uniformemente** e a UI avisa "valores provisórios". O piso zero
impede que um pedido entregue a mais (Odoo devolve negativo) abata a falta de outro.

**RN-5.6 , Paridade card == relatório.** No mesmo período + mesma empresa (+ mesma UF), o
"valor pendente a custo" do resumo tem que bater com o `aAtenderCusto` do Relatório de
Entregas Parciais e com o card "Demandas a entregar" da diretoria. Divergência no mesmo escopo
é bug. Fonte única: `aAtenderDoItem`.

**RN-5.7 , Agrupamento por pedido no B2.** As linhas unitárias da lista são agrupadas
visualmente por pedido (mesmo cliente + mesmo pedido). A explosão "unidade i de n" usa
`n = round(aAtender(linha))`. Se `aAtender` não for inteiro (raro, unidade fracionada), tratar
como 1 linha com a quantidade exibida, não fabricar unidades fracionadas.

**RN-5.8 , Saldo de estoque: só positivo, só físico e NÃO escopável por empresa/UF.** No
cálculo de cobertura (M-5.6/M-5.7) e no B7, o saldo por produto soma **apenas** `quantidade > 0`
de locais do escopo **físico da casa** (`whereLocalDoEscopo(..., "fisico")`). Não contar
demonstração nem terceiros. Regra já provada em `queryEstoqueDisponivel` (senão a tela diverge
do painel A-12 e do KPI de estoque). **Além disso (assunção A-5.6):** `fato_estoque_saldo`
**não carrega `empresaId`** , o saldo é do grupo inteiro. Portanto **cobertura % e valor
descoberto só são íntegros no nível GRUPO**: com filtro de empresa ou UF ativo, a demanda
encolhe mas o saldo não, inflando a cobertura. Nesses casos, **travar cobertura % e valor
descoberto ao escopo global** (calcular no grupo) **ou** exibir aviso explícito de que o saldo
não é escopável por empresa/UF. O B7 herda a mesma ressalva no lado do saldo. **Validar** que
`fato_estoque_saldo` não tem coluna de empresa (schema/`SELECT`) antes de implementar; se
passar a ter, a ressalva cai.

**RN-5.9 , Coluna "reserva" indefinida até o cliente fechar.** Enquanto DEP-5.6 estiver aberta,
a coluna não computa regra de negócio; renderiza estado neutro. Não inventar semântica (ex.:
não assumir `localReservaId != null = reservado` sem o aval do cliente).

**RN-5.10 , Dado do protótipo é sintético.** No protótipo, B7 mostra demanda 0 / % 0 em todos
os modelos e B8 mostra "entregues 0"; isso é mock, não é a regra. Em produção, `demanda(p)` e
`quantidadeAtendida` trazem valores reais. Não copiar zeros do protótipo como comportamento
esperado.

**RN-5.11 , "Sem UF" fora do mapa.** Pedidos sem UF do cliente vão para o balde "Sem UF" (como
os KPIs de diretoria já tratam), que **não** entra em nenhum estado do heatmap. É linha/legenda
à parte ou omitido com nota. Nunca somado a um estado.

**RN-5.12 , Filtros combinam (pílula + empresa + UF do mapa + aba + busca).** Todos os
recortes são compostos: a pílula de período define a janela da demanda; o filtro de empresa
recorta por `empresa_id`; o clique no mapa adiciona `uf` **apenas aos blocos demand-side
listados na seção 5.9 (B2/B6/B8/B9), nunca ao B7/B4/B5**; a aba do B2 (abertos/atrasados/todos)
e a busca recortam a lista. Um recorte não anula o outro. A lista de blocos afetados pela UF é
única, definida na seção 5.9 (alinhada com RF-5.12 e 5.6.6).

**RN-5.13 , Divisões seguras.** Ticket médio, %, cobertura, concentração: toda divisão guarda
denominador zero → 0 (universo vazio não pode lançar exceção nem exibir NaN).

**RN-5.14 , Kits/BOM não são desmembrados aqui.** A demanda deste módulo é do **item vendido**
(a máquina), não dos componentes. O desmembramento por lista de material
(`FatoListaMaterialItem`) é análise de compra do módulo Estoque; o Demandas conta a unidade do
produto vendido.

**Edge cases a cobrir em teste:**
- Pedido em aberta sem `data_prevista` (aparece, nunca atrasado).
- Pedido sem `data_orcamento` (não aparece).
- Produto com saldo negativo isolado (não vira "disponível"; não conta cobertura).
- Job de atendimento off (tudo cai na quantidade cheia + aviso; números batem entre si mesmo
  provisórios).
- Cliente sem UF (balde "Sem UF"; fora do mapa).
- Modelo com demanda mas sem saldo (100% descoberto; card valor descoberto sobe).
- Modelo totalmente entregue (sai do ranking B8/B9; `HAVING Σ aAtender > 0`).
- Filtro de empresa/UF ativo com cobertura/valor descoberto (RN-5.8): o saldo continua o do
  grupo (não é escopável), então esses dois cards ficam travados ao grupo ou exibem aviso; não
  deixar a cobertura passar de 100% nem "inflar" pelo estoque do grupo cobrindo um só CNPJ/UF.

---

### 5.8 Consultas (queries)

Todas em `PrismaClient`, recebem `hoje: Date` quando dependem de atraso, e `filtros`
compartilhando o shape `FiltrosDemandas` (`ufs?`, `periodoDe?`, `periodoAte?`, `empresaId?`).
Janela sempre por `janelaDemandaAberta(...)`. Arquivos-alvo: `src/lib/diretoria/queries/`
(pedidos.ts, entregas-parciais.ts) e `src/lib/reports/queries/comercial.ts`.

> **Impacto de container (seção 2.1 do CLAUDE.md):** `src/lib/reports/queries/**` é importado
> pela tool MCP → rebuildar `mcp`. Mudança no restante de `src/**` → rebuildar `app`.

**Q-5.1 , Resumo consolidado (8 cards). [NOVO, estende `queryIndicadoresDemandas`]**
```ts
// src/lib/diretoria/queries/pedidos.ts
export interface ResumoDemandas {
  valorPendente: number;      // M-5.1 (venda)
  pedidosAbertos: number;     // M-5.2
  pedidosAtrasados: number;   // M-5.3
  itensPendentes: number;     // M-5.4 (unidades)
  ticketMedio: number;        // M-5.5
  demandasCobertasPct: number;// M-5.6
  unidadesCobertas: number;   // suporte da legenda
  valorDescoberto: number;    // M-5.7
  unidadesDescobertas: number;
  valorAtrasado: number;      // M-5.8
  atendimentoSincronizadoEm: string | null;
  parcial: boolean;           // job off => true (aviso na UI)
}
export async function queryResumoDemandas(
  prisma: PrismaClient, hoje: Date, filtros: FiltrosDemandas = {},
): Promise<ResumoDemandas>;
```
Pseudo-SQL (duas partes: demanda por linha + saldo por produto, cruzadas em memória, como
`queryEstoqueDisponivel` já faz):
```sql
-- lado DEMANDA (linhas de item dos pedidos abertos, valor a atender):
WITH linha AS (
  SELECT it.pedido_id, it.produto_id,
         GREATEST(0, CASE WHEN :jobOk THEN COALESCE(it.quantidade_a_atender,0)
                          ELSE it.quantidade END) AS a_atender,
         CASE WHEN it.quantidade>0 THEN it.vr_produtos/it.quantidade ELSE 0 END AS preco_unit,
         (f.data_prevista IS NOT NULL AND f.data_prevista < :hoje) AS atrasado
  FROM fato_pedido_item it
  JOIN fato_pedido f ON f.odoo_id = it.pedido_id
  WHERE f.bucket_demanda = 'ABERTA'
    AND f.data_orcamento >= :gte AND f.data_orcamento < :lt
    AND (:empresaId IS NULL OR f.empresa_id = :empresaId)
)
SELECT
  SUM(a_atender*preco_unit)                                   AS valor_pendente,
  COUNT(DISTINCT pedido_id)                                   AS pedidos_abertos,
  COUNT(DISTINCT pedido_id) FILTER (WHERE atrasado)           AS pedidos_atrasados,
  SUM(a_atender)                                              AS itens_pendentes,
  SUM(a_atender*preco_unit) FILTER (WHERE atrasado)           AS valor_atrasado
FROM linha;
-- lado SALDO (fato_estoque_saldo, quantidade>0, escopo fisico) somado por produto e cruzado
-- com SUM(a_atender) por produto para cobertas/descobertas (M-5.6/M-5.7).
```

**Q-5.2 , Lista de pedidos pendentes por unidade (B2). [NOVO, funde
`queryDemandasPendentes` + `queryEntregasParciais`]**
```ts
export interface LinhaPedidoPendente {
  pedidoId: number; numero: string | null; cliente: string | null;
  produtoNome: string | null; unidadeIndice: number; unidadeTotal: number;
  uf: string; prazo: string | null; atrasado: boolean;
  reservaDefinida: boolean | null;   // DEP-5.6: null enquanto sem regra
  valorPendenteUnidade: number;
}
export interface ListaPedidosPendentes {
  linhas: LinhaPedidoPendente[];
  totalPedidos: number; totalLinhasUnitarias: number;
  atendimentoSincronizadoEm: string | null; parcial: boolean;
}
export async function queryPedidosPendentesPorUnidade(
  prisma: PrismaClient, hoje: Date,
  filtros: FiltrosDemandas & { aba?: "abertos"|"atrasados"|"todos"; busca?: string } = {},
): Promise<ListaPedidosPendentes>;
```
Pseudo-SQL: mesma `linha AS (...)` de Q-5.1 (grão-item, com `a_atender`), depois **explodir em
memória** cada linha em `round(a_atender)` unidades (RN-5.7), aplicar aba (filtro `atrasado`) e
busca (substring em cliente/modelo/uf/status), ordenar por valor desc mantendo agrupamento por
pedido. UF via `ufMapDe` (já existe em pedidos.ts). Cor da etapa e status financeiro reusam
`queryEntregasParciais` se o cliente quiser essas colunas.

**Q-5.3 , Máquinas em estoque × demanda (B7). [REUSO `queryEstoqueDisponivel`]**
```ts
// src/lib/reports/queries/comercial.ts  (já existe)
export async function queryEstoqueDisponivel(prisma, filtros): Promise<{
  linhas: { produtoId, produtoNome, saldo, demanda, demandaValorVenda,
            demandaValorCusto, disponivel }[];
  total: number; negativos: number; atendimentoSincronizadoEm: string|null; parcial: boolean;
}>;
```
Já entrega saldo/demanda/disponível por produto (pseudo-SQL real: `WITH linha AS (SELECT
it.produto_id, GREATEST(0, CASE WHEN :jobOk THEN quantidade_a_atender ELSE quantidade END)...)`
sobre `bucket_demanda='ABERTA'` + `data_orcamento IN janela`, cruzado com `fato_estoque_saldo`
filtrado por `quantidade>0` e escopo físico). **[NOVO]** só derivar `percEmDemanda` (M-5.9) e o
subtítulo família·marca na camada de apresentação (ou adicionar campo ao retorno). Ordenação
"menor disponível primeiro" já existe.

**Q-5.4 , Drill do pedido (B5). [REUSO `queryPedidoSituacao`]**
```ts
// src/lib/reports/queries/comercial.ts  (já existe)
export async function queryPedidoSituacao(prisma, { numero }): Promise<{
  encontrado: boolean; /* cabeçalho, etapa, dias parado */
  trilha: { etapa, tempoEtapaDias }[];
  itens: { produtoId, produtoNome, quantidade, valorProdutos, saldoEstoque,
           faltando, temEstoque }[];
  pendencia: string | null;
  multiplosMercos: { numeroMercos: string; pedidos: string[] } | null;
}>;
```
Sem consulta nova; ligar o `pedidoId`/`numero` selecionado no B2 a esta função.

**Q-5.5 , Visão geral (B6). [REUSO `queryIndicadoresDemandas` + campo novo]**
```ts
export async function queryIndicadoresDemandas(prisma, hoje, filtros): Promise<{
  totalPendentes: number; valorAEntregar: number; atrasadas: number;
}>;  // já existe
// [NOVO] "quando mais caro": top 1 pedido por valor pendente
export interface PedidoMaisCaro { numero: string|null; cliente: string|null;
  produtoNome: string|null; valor: number; }
```
A rosca atrasados × no prazo usa `atrasadas` vs `totalPendentes − atrasadas`. Reaproveitar a
Q-5.1 (que já calcula pedidos_abertos, pedidos_atrasados, valor_pendente, ticket) evita
consulta duplicada; adicionar só o "mais caro" (`ORDER BY a_atender*preco_unit por pedido DESC
LIMIT 1`).

**Q-5.6 , Mapa por UF (B4). [REUSO `queryDemandasPorUf`]**
```ts
// src/lib/diretoria/queries/pedidos.ts  (já existe)
export async function queryDemandasPorUf(prisma, filtros): Promise<{
  linhas: { uf: string; quantidade: number; valorTotal: number }[];
  valorGeral: number;
}>;
```
Sem consulta nova; alimentar o heatmap e o clique (publicar `uf` no estado do módulo).
`siglaDeUf` normaliza; "Sem UF" fora do mapa (RN-5.11).

**Q-5.7 , Itens vendidos em pedidos ativos (B8). [REUSO `queryDemandaPorProduto` + split, A REFINAR]**
```ts
// src/lib/reports/queries/comercial.ts  (já existe, base)
export async function queryDemandaPorProduto(prisma, filtros): Promise<{
  totalProdutos: number;
  linhas: { produtoId, produtoNome, familiaNome, quantidade /*a atender*/,
            valorProdutos, valorCusto }[];
  atendimentoSincronizadoEm: string|null; parcial: boolean;
}>;
// [A REFINAR] estender por modelo com o split em TRÊS baldes disjuntos:
export interface ItemAtivoPorModelo {
  produtoId: number|null; produtoNome: string|null; familiaNome: string|null;
  aEntregar: number;       // total pendente (= aEntregarPrazo + atrasados)
  aEntregarPrazo: number;  // a entregar no prazo = aEntregar − atrasados (balde disjunto)
  entregues: number; atrasados: number; valorAEntregar: number;
}
```
Pseudo-SQL do split (por produto): `SUM(a_atender) AS a_entregar`,
`SUM(COALESCE(quantidade_atendida,0)) AS entregues`,
`SUM(a_atender) FILTER (WHERE f.data_prevista < :hoje) AS atrasados`, `GROUP BY produto_id
HAVING SUM(a_atender) > 0 ORDER BY a_entregar DESC`. Derivar em memória
`aEntregarPrazo = a_entregar − atrasados` (o balde "no prazo", disjunto de `atrasados`). Os três
baldes exibidos (`entregues`, `aEntregarPrazo`, `atrasados`) são disjuntos e o percentual é
sobre `entregues + a_entregar`. Gráfico usa `quantidade`; cards do modelo selecionado usam o
split. **[A REFINAR]:** este split é desenho a confirmar com o cliente (ver M-5.10 / seção 5.12).

**Q-5.8 , Concentração de atrasos por produto (B9). [NOVO]**
```ts
export interface ConcentracaoAtrasoProduto {
  produtoId: number|null; produtoNome: string|null;
  itensAtrasados: number; valorAtrasado: number; pctDosAtrasos: number;
}
export interface ConcentracaoAtrasos {
  ranking: ConcentracaoAtrasoProduto[];
  totalItensAtrasados: number; modelosComAtraso: number;
  valorTotalAtrasado: number;
  produtoComMaisAtraso: ConcentracaoAtrasoProduto | null;
  top3ConcentraPct: number;
  atendimentoSincronizadoEm: string | null; parcial: boolean;
}
export async function queryConcentracaoAtrasos(
  prisma: PrismaClient, hoje: Date, filtros: FiltrosDemandas = {},
): Promise<ConcentracaoAtrasos>;
```
Pseudo-SQL:
```sql
WITH linha AS (
  SELECT it.produto_id, it.produto_nome,
         GREATEST(0, CASE WHEN :jobOk THEN COALESCE(it.quantidade_a_atender,0)
                          ELSE it.quantidade END) AS a_atender,
         CASE WHEN it.quantidade>0 THEN it.vr_produtos/it.quantidade ELSE 0 END AS preco_unit
  FROM fato_pedido_item it
  JOIN fato_pedido f ON f.odoo_id = it.pedido_id
  WHERE f.bucket_demanda='ABERTA'
    AND f.data_prevista IS NOT NULL AND f.data_prevista < :hoje   -- só atrasados
    AND f.data_orcamento >= :gte AND f.data_orcamento < :lt
    AND (:empresaId IS NULL OR f.empresa_id = :empresaId)
)
SELECT produto_id, produto_nome,
       SUM(a_atender)              AS itens_atrasados,
       SUM(a_atender*preco_unit)  AS valor_atrasado
FROM linha
GROUP BY produto_id, produto_nome
HAVING SUM(a_atender) > 0
ORDER BY valor_atrasado DESC;
-- agregados (total, modelos, produtoComMaisAtraso, top3ConcentraPct) em memória.
```

**Resumo do reuso vs. novo:**
- **Reuso direto** (sem tocar SQL): Q-5.3 (`queryEstoqueDisponivel`), Q-5.4
  (`queryPedidoSituacao`), Q-5.6 (`queryDemandasPorUf`).
- **Reuso + campo/adaptação:** Q-5.1/Q-5.5 (estende `queryIndicadoresDemandas`), Q-5.2 (funde
  `queryDemandasPendentes` + `queryEntregasParciais`, adiciona explosão por unidade), Q-5.7
  (estende `queryDemandaPorProduto` com split).
- **Novo:** Q-5.8 (concentração de atrasos).

---

### 5.9 Filtros e parâmetros

- **Pílula de período (topo, global):** define `periodoDe` / `periodoAte`. Traduzida em
  `janelaDemandaAberta(periodoDe, periodoAte)` (piso 2000). Sem período = "Tudo" (do primeiro
  pedido). **Nunca** clampar no corte de dados aqui (RN-5.2). Seção 6.3 da Parte I.
- **Filtro de empresa / CNPJ (topo, global):** `empresaId` → `buildEmpresaWhere(empresaId)` /
  `f.empresa_id = :empresaId`. `undefined` = grupo inteiro. Seção 6.4 da Parte I.
- **UF (via clique no mapa B4):** `ufs: string[]` (ou uma UF). Normalizado por `siglaDeUf`.
  Clique repetido limpa. "Sem UF" não é selecionável no mapa. **Lista canônica dos blocos
  afetados pela UF (fonte única, referenciada por RF-5.12, 5.6.6 e RN-5.12):**
  - **Afetados:** **B2** (lista), **B6** (visão geral), **B8** (itens vendidos) e **B9**
    (concentração de atrasos) , todos demand-side, escopáveis pela UF do cliente.
  - **Não afetados:** **B7** (o lado do saldo é do grupo, `fato_estoque_saldo` sem UF, RN-5.8;
    filtrar por UF inflaria a coluna disponível), **B4** (o próprio mapa) e **B5** (drill de um
    pedido já selecionado).
- **Aba do B2:** `"abertos" | "atrasados" | "todos"` (default abertos). Recorta só a lista B2.
- **Busca do B2:** string livre, substring case-insensitive em cliente/modelo/UF/status.
- **Busca do B7:** string livre sobre nome/código do modelo.
- **Modelo selecionado (B8):** `produtoId` opcional; recorta os três cards do modelo; "Limpar
  seleção" volta a "Todos os modelos".
- **Pedido selecionado (B5):** `pedidoId` / `numero` do clique no B2.
- **Toggle de período do B8:** `"todos" | "pilula"` **[A REFINAR]**.

Composição: pílula e empresa são globais (afetam todos os blocos); UF, aba, busca e seleções
são locais e **compõem** com os globais (RN-5.12).

---

### 5.10 Estados e validações

Seguir o padrão 7.5 da Parte I. Por bloco:

- **Carregando:** skeleton dos cards/tabelas/gráficos; nunca layout que "pula".
- **Vazio (universo sem pedidos no filtro):** cada bloco mostra estado vazio acionável:
  - Resumo: cards em 0 formatado ("R$ 0,00", "0"), sem NaN.
  - B2: "Nenhum pedido pendente no filtro atual" + sugestão de alargar o período/limpar UF.
  - B7: "Sem modelos com saldo/demanda no filtro".
  - B5: "Clique em um pedido na tabela B2 para ver os detalhes" (estado inicial padrão).
  - B4: mapa todo neutro + "Nenhum estado com pendências".
  - B8/B9: "Sem itens ativos/atrasados no filtro".
- **Erro:** mensagem acionável ("Não foi possível carregar as demandas. Tente novamente."),
  nunca "Erro" seco; botão de retry.
- **Parcial (job de atendimento off):** banner/badge "Valores provisórios , o cálculo de
  entregas ainda não sincronizou; mostrando a quantidade cheia." Vale para todos os blocos que
  usam `aAtender` (todos, menos o lado puro de saldo do B7).
- **Frescor:** "atualizado há Xs" (última sync do cache) no cabeçalho do módulo (RF-5.15,
  seção 6.6 da Parte I).
- **Validações de cálculo:** divisões seguras (RN-5.13); percentuais grampeados em [0, 100];
  cobertura nunca > 100%; contadores inteiros não negativos.
- **Acessibilidade:** rosca e mapa não dependem só de cor (legenda com valor/rótulo); botão
  só-ícone com `aria-label`; alvo de toque ≥ 44px; foco visível; conferir contraste AA em
  dark e light (padrão 7.6).

---

### 5.11 Critérios de aceite

- **CA-5.1** , Todos os oito cards do resumo exibem os valores de M-5.1 a M-5.8 e o ticket
  médio confere `valorPendente / pedidosAbertos` (ex.: 2.148.900 / 42 = 51.164,29).
- **CA-5.2** , A paridade **a custo** (RN-5.6) é **invariante interno, não um card**: no mesmo
  período + empresa, o `aAtenderCusto` calculado bate com o Relatório de Entregas Parciais e com
  o card "Demandas a entregar" da diretoria. O card VALOR PENDENTE do resumo, por sua vez, exibe
  **venda** (`aAtenderVenda`, M-5.1), não o custo , os dois números não precisam ser iguais.
  Ambos verificados contra o cache real (não só teste com mock).
- **CA-5.3** , A janela da demanda **não** muda quando o corte de dados muda; muda quando a
  pílula muda. Teste: alterar `sync.corte_dados` para frente → os números do módulo permanecem;
  mover a pílula → mudam.
- **CA-5.4** , B2 lista uma linha por unidade pendente, agrupada por pedido, com "unidade i de
  n" coerente (Σ linhas unitárias = Σ `round(aAtender)`), e as abas Abertos/Atrasados/Todos +
  busca recortam corretamente.
- **CA-5.5** , "Pedidos atrasados" conta só pedidos com `data_prevista < hoje`; pedido sem
  prazo nunca aparece como atrasado.
- **CA-5.6** , B7 mostra disponível = saldo(positivo, físico) − demanda por modelo, com
  negativos no topo, e o % em demanda calculado (M-5.9); os totais do cabeçalho batem com a
  soma das linhas.
- **CA-5.7** , Clicar numa linha do B2 preenche o B5 com trilha, itens (saldo/faltando) e
  pendência via `queryPedidoSituacao`; sem seleção, B5 mostra o estado vazio.
- **CA-5.8** , B6: rosca atrasados × no prazo × **sem prazo** soma 100%; o balde atrasados bate
  com pedidos_atrasados / pedidos_abertos e o balde "sem prazo" conta os pedidos sem
  `data_prevista` (nunca em "no prazo"); "quando mais caro" aponta o maior pedido do universo.
  (Se a rosca for binária, a legenda de "no prazo" declara que inclui os "sem prazo".)
- **CA-5.9** , B4: heatmap colore por UF, clique filtra B2/B6/B8, clique repetido limpa; "Sem
  UF" não aparece como estado; a soma das UFs + "Sem UF" fecha com o universo.
- **CA-5.10** , B8: gráfico ordenado desc por quantidade, top N, barra selecionada destacada;
  cards do modelo mostram entregues/a entregar/atrasados coerentes (percentuais sobre entregues
  + a entregar).
- **CA-5.11** , B9: ranking ordenado por valor atrasado desc, cards agregados (total itens,
  valor total, produto com mais atraso, Top 3 concentra %) coerentes; o valor total do B9 bate
  com o card "valor atrasado" do resumo (M-5.8 == Σ B9).
- **CA-5.12** , Job de atendimento off: todos os blocos caem na quantidade cheia com aviso
  "valores provisórios", e ainda assim os números batem entre si.
- **CA-5.13** , Universo vazio no filtro: nenhum bloco lança exceção; todos mostram estado
  vazio com 0 formatado.
- **CA-5.14** , `tsc` + `jest` verdes; E2E contra o cache real conferindo que os totais do
  módulo fecham com o painel legado de pedidos no mesmo escopo.
- **CA-5.15** , UI conferida em dark e light, 375px sem scroll horizontal, tabelas/mapa/gráfico
  rolando no próprio contêiner; reuso dos componentes do design system (sem card/tabela/rosca
  novos fora do padrão).

---

### 5.12 Dependências e pontos em aberto

> **Este módulo será revisado pelo cliente antes de fechar.** O dono declarou "vou refazer com
> calma" e o colocou por último na prioridade. Tudo abaixo marcado **[A REFINAR]** precisa de
> uma segunda passada de escopo com ele. Não iniciar execução dos itens `[A REFINAR]` sem esse
> alinhamento; o núcleo já existente (`MUST`) pode avançar antes.

**Dependências de dado/frente:**
- **DEP-5.5 (job de atendimento):** frescor de `quantidade_a_atender` / `quantidade_atendida`.
  Se o job não roda, todo o módulo fica provisório. Precondição operacional de produção.
- **DEP-5.6 (coluna "reserva"):** sem semântica de negócio fechada. Bloqueia RF-5.13. Candidatos
  em 5.3; decisão do cliente.
- **DEP-5.7 (whitelist de etapas , peças/consumidor final, D7/P1):** decisão pendente do dono.
  Muda o conjunto de pedidos considerados demanda. Rastreado em `etapas-demanda-aberta.ts`.
- **DEP-5.8 (linha/tipo de produto):** gap de cadastro resolvido na camada base (B1/B4 da Parte
  I). Não bloqueia a v1 (o módulo usa família·marca), mas habilita recortes futuros.

**Pontos em aberto [A REFINAR] (levar ao cliente):**
1. **Base da valoração por card** (venda vs. custo) , RN-5.4. O protótipo está a venda; o
   legado usa custo em partes. Padronizar e rotular.
2. **Definição de cobertura** (M-5.6): "há saldo hoje" vs. "há reserva vinculada" (liga em
   DEP-5.6).
3. **Denominador de "% em demanda"** (M-5.9): `saldo` vs. `disponível + demanda`.
4. **Métrica do heatmap** (B4): valor pendente por UF vs. quantidade de pedidos.
5. **Semântica da aba "Todos"** (B2): abertos + atrasados sem filtro de aba, ou algo mais amplo.
6. **Toggle "Todos os períodos" do B8**: independente da pílula global ou espelho dela.
7. **Base do "% dos atrasos"** (B9): por valor (default aqui) vs. por itens , unificar o rótulo.
8. **"Valor total em pedidos ativos" do B6** (M-5.1): valor pendente (default, bate o protótipo)
   vs. valor cheio dos pedidos.
9. **Coluna "reserva"** (B2): render final depende de DEP-5.6.

**Premissa de execução:** por ser evolução de uma tela viva, começar por **auditar o que já
existe** em `diretoria/pedidos/page.tsx` e nas queries citadas, mapear o que já cobre cada
bloco, e só então implementar o delta (explosão por unidade no B2, split do B8, concentração
B9, % em demanda no B7, "quando mais caro" no B6). Não reescrever o que já funciona e já tem
paridade provada com o Relatório de Entregas Parciais.

---

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
