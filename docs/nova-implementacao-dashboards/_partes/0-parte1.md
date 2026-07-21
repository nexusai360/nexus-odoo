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


