# Inventário de telas, relatórios e aplicações a desenvolver , Matrix Fitness Group

> **O que é este documento:** o levantamento, item por item, de **tudo que precisa ser construído** para entregar o que foi pedido na reunião de 20/07 e apresentado no protótipo HTML. Não é só "quatro módulos": cada módulo tem vários **relatórios** (as telas de análise), várias **telas de apoio/gestão** e várias **telas de parametrização** (onde se cadastra e se define a regra que o relatório usa). Além dos módulos, há uma **aplicação operacional de controle de estoque** (conferência com bipador), que é um sistema à parte.
> **Objetivo:** dimensionar o volume real de desenvolvimento.
> **Data:** 2026-07-21. **Fontes:** transcrição da reunião + protótipo HTML navegável.

---

## Quadro-resumo (o tamanho da obra)

### Parte A , Módulos de dashboard (a plataforma analítica)

| Módulo | Relatórios (telas de análise) | Telas de apoio / gestão | Telas de parametrização | Motores/estruturas de dados |
|---|---:|---:|---:|---:|
| 1 · Estoque (+ relatório de estoque/ciclos) | 3 | 1 | 3 | 4 |
| 2 · Vendas | 3 | 1 | 3 | 2 |
| 3 · Financeiro por CNPJ | 1 | 1 | 2 | 1 |
| 4 · Demandas | 1 (com 8 blocos) | 1 | 1 | 2 |
| **Subtotal módulos** | **8** | **4** | **9** | **9** |

**Parte A soma: 8 relatórios + 13 telas de apoio/parametrização + 9 estruturas de dados = 30 itens** (fora os 8 blocos internos de Demandas e os 2 relatórios opcionais de fase futura).

### Parte B , Aplicação de controle de estoque (conferência com bipador)

| Bloco | Telas da aplicação | Integrações / regras técnicas |
|---|---:|---:|
| Conferência / inventário | 9 | 7 |

**Parte B soma: 9 telas + 7 integrações/regras = 16 itens.**

### Total geral: **46 itens** de desenvolvimento (relatórios + telas + parametrizações + integrações), fora os opcionais.

---

# PARTE A , MÓDULOS DE DASHBOARD

---

## Módulo 1 , ESTOQUE (inclui o relatório de estoque / ciclos)

> Como você definiu: o estoque atual **e** os relatórios de estoque por ciclo vivem no mesmo módulo.

### Relatórios (telas de análise)
1. **Painel de Estoque Atual** , 12 indicadores gerais (valor total, valor médio por local, ticket médio, valor em demanda, valor disponível, valor a chegar, quantidades correspondentes e última atualização), distribuição por local, composição por marca/linha/tipo (seletor único), demanda × disponível (por quantidade e por valor) e tabela de produtos com busca, filtros e ordenação.
2. **Relatório de Ciclo Ativo** , acompanhamento ao vivo do ciclo: 8 indicadores (ruptura prevista, risco, saudáveis, acumulados, previsto no ciclo, previsão restante, valor em risco, valor em excesso), rosca de distribuição por status e tabela de 10 colunas (previsão, consumido, previsão restante, cobertura, status).
3. **Relatório de Ciclos Fechado / Comparativo** , o ciclo encerrado e congelado: 14 indicadores, abertura/fechamento mês a mês, rosca por status com drill, comparativo ciclo atual × anterior, acurácia previsto × real por produto e quadro de mudança de status entre ciclos.

### Telas de apoio / gestão
4. **Gestão e arquivo de Ciclos Fechados** , lista dos ciclos já congelados, abrir qualquer um a qualquer momento (a "gaveta" dos relatórios de ciclo).

### Telas de parametrização
5. **Cadastro e Definição de Ciclos** , criar um ciclo, definir **duração configurável** (2, 3, 4 meses...), data de início/fim e os produtos considerados. É o que o dono chamou de "esse poder tem que estar com a gente".
6. **Importação da Previsão do Ciclo** , tela para imputar/importar a previsão de compra por produto (dado manual, não vem do Odoo).
7. **Parametrização de Status por Produto** , o pop-up dos "3 pontinhos": define, por produto, as faixas de **risco de ruptura**, **saudável** e **acumulado em excesso** (em unidade ou %). A ruptura (cobertura ≤ 0) é automática. É aqui que se define "demanda estourada / reprimida / comprado em excesso / saudável".

### Motores e estruturas de dados (não são tela, mas têm que ser construídos)
8. **Motor de ciclos** , a engine que calcula consumido, previsão restante e cobertura por produto.
9. **Motor de status único** , a regra de status (fonte única) que os relatórios ativo e fechado consomem.
10. **Estrutura de "quantidade a chegar"** , hoje irreconstruível; precisa de um novo registro de itens de compra.
11. **Foto diária de estoque/demanda** , a série histórica que alimenta as variações e as colunas mês a mês (começa a existir "daqui pra frente").

---

## Módulo 2 , VENDAS

### Relatórios (telas de análise)
1. **Painel de Vendas** , 6 indicadores com meta atingida, composição e margem em 5 ângulos (linha, marca, tipo de cliente, forma de pagamento, CNPJ), produtos vendidos, condições de pagamento (forma mais usada, PMR, entrada média), rankings por estado e por vendedor, curva ABC/Pareto e carteira a faturar.
2. **Comparação Geral de Estados** , tabela de todas as UFs (vendedores, faturamento, margem, PMR, % da receita, ticket, pedidos) com cards de destaque.
3. **Comparativo Estado A × B** , dois estados lado a lado, com períodos independentes e variação relativa (verde = melhor).

### Telas de apoio / gestão
4. **Busca por Construtora / Grupo** , campo que reúne múltiplos CNPJs e razões sociais de um mesmo cliente e traz todos os pedidos.

### Telas de parametrização
5. **Definição de Metas de Faturamento** , imputar a meta mensal (por empresa e por vendedor) que o painel usa no indicador "meta atingida".
6. **Parametrização da Curva ABC / Pareto** , definir a faixa da curva (o 80/20, ou 10/20/30% do acumulado).
7. **Mapeamento de CNPJs em Grupos / Segmentos** , de-para para os recortes "Grupo", "Smart", "Aztec" e construtoras, usado para isolar ou incluir clientes nos cálculos.

### Motores e estruturas de dados
8. **Agregações de margem por ângulo** , cálculo de margem bruta por marca/linha/segmento/forma/empresa/estado.
9. **Estrutura de meta** , tabela que guarda as metas mensais importadas.

### Opcionais (fase futura, citados na reunião como "virão depois")
- **Comparativo de Vendedores** (tela espelhada A×B por vendedor).
- **Comparativo de Marcas** (tela espelhada A×B por marca).

---

## Módulo 3 , FINANCEIRO por CNPJ

### Relatórios (telas de análise)
1. **Painel Financeiro por CNPJ** , resumo consolidado do grupo (6 cards), um bloco por empresa (6 CNPJs) com faturamento/gastos/resultado/%, composição das despesas por categoria (rosca) com **drill lateral** por fornecedor, e recorte por UF.

### Telas de apoio / gestão
2. **De-para Empresa ↔ CNPJ** , resolver o vínculo (hoje deslocado) para exibir o CNPJ real de cada empresa.

### Telas de parametrização
3. **Parametrização do Plano de Contas Gerencial** , mapear as contas do Odoo para as **categorias de despesa** (supply, logística, impostos, folha, marketing...) e definir o nível que vira "categoria" na rosca.
4. **Imputação de UF na Despesa** , cadastrar/associar o estado (UF) a cada lançamento de conta a pagar, para o recorte por estado.

### Motores e estruturas de dados
5. **Agregações por empresa + categoria** , a query financeira atual não cobre a tela; precisa de somatórios novos por CNPJ e por categoria, reconciliados ao centavo.

---

## Módulo 4 , DEMANDAS

### Relatório (uma tela, com 8 blocos , cada bloco é um mini-relatório)
1. **Painel de Demandas** , considerando só pedidos ativos ainda não entregues, com os blocos:
   - B1 · Resumo (valor pendente, pedidos abertos, atrasados, itens pendentes, ticket, % coberto, valor descoberto, valor atrasado)
   - B2 · Lista de pedidos pendentes (agrupada por pedido, com filtros e busca)
   - B4 · Mapa de demandas por estado (heatmap clicável que filtra a lista)
   - B5 · Indicadores do pedido selecionado (drill: entregue × pendente)
   - B6 · Visão geral (ativos, atrasados × no prazo)
   - B7 · Máquinas em estoque × demanda
   - B8 · Itens em pedidos ativos (entregues/a entregar/atrasados) , **a refinar com o dono**
   - B9 · Concentração de atrasos por produto (ranking + Top 3)

### Telas de apoio / gestão
2. **Lista/agenda de organização de entrega** , a leitura da carteira pensada para "organizar a entrega".

### Telas de parametrização
3. **Configuração das Etapas de Demanda** , definir quais etapas do pedido no Odoo contam como "demanda em aberto" (a whitelist que rege todos os 8 blocos).

### Motores e estruturas de dados
4. **Classificação de demanda em aberto** , a regra materializada que marca o pedido como ativo.
5. **Regra de reserva de unidade** , semântica de reserva por item na lista.

---

# PARTE B , APLICAÇÃO DE CONTROLE DE ESTOQUE (conferência com bipador)

> **Isto NÃO é um dashboard.** É uma **aplicação operacional** com fluxo de trabalho, captura de hardware (leitor de código de barras), sessão de inventário persistida, trilha de quem fez o quê e regras de alerta. Escopo, proposta e cronograma próprios, separada dos módulos acima.

### Telas da aplicação
1. **Seleção do Local de Conferência** , escolher o estoque (ex.: Ceilândia) antes de iniciar; o sistema carrega todos os seriais que o Odoo aponta naquele local.
2. **Sessão de Bipagem / Conferência** (o coração da aplicação) , seriais pendentes em vermelho que viram confirmados ao bipar; captura por **leitor de código de barras** e por **digitação manual** (código apagado); registra o **tipo** (escaneado × digitado), **quem** registrou, **horário** e a **ordem** do registro (1º, 2º, 3º... para localizar a peça depois).
3. **Painel de Indicadores ao Vivo** , total de seriais, escaneados (% e qtd), digitados (% e qtd), pendentes (% e qtd) e rosca escaneado × não escaneado, atualizando conforme a bipagem.
4. **Detalhe do Serial + Observações** , modal por item para registrar observação (caixa arrebentada, máquina desmontada, peça faltando); sem observação, infere-se "tudo normal".
5. **Contagem de Volumes sem Número de Série** , itens sem serial (bateria de peso, ferragem, estofado): contador incremental estilo "+" que soma sem recontar, com editar/apagar.
6. **Quadro de Divergências** , duas regras de alerta separadas: (a) serial bipado que **pertence a outro local** (está no estoque errado); (b) serial que já está **vinculado/reservado a outro pedido** e não deveria entrar nesta contagem. Aparecem destacados como alerta.
7. **Finalização com Dupla Confirmação** , "tem certeza?" e "tem certeza mesmo?"; ao confirmar, o inventário é congelado.
8. **Histórico de Conferências ("gaveta")** , os inventários finalizados, arquivados e consultáveis a qualquer momento, com quem fez e quando.
9. **Trilha de Auditoria / Quem bipou** , registro de cada ação (usuário, item, tipo, horário, ordem) para auditar a contagem depois.

### Integrações e regras técnicas a construir
1. **Integração com o leitor de código de barras** , captura via hardware (entrada de teclado/USB HID) sincronizada com a tela de bipagem.
2. **Sincronização de seriais esperados por local** , puxar do cache (dados de série já existentes) a lista do que deveria estar naquele estoque.
3. **Regra de "já bipado ou não"** , marcar em tempo real o que foi conferido e o que falta.
4. **Regra de divergência de localização** , detectar serial que está fisicamente num local diferente do que o sistema aponta.
5. **Regra de serial vinculado a outro pedido** , cruzar o serial com os pedidos/reservas e alertar quando um item contado já está comprometido com outra venda.
6. **Persistência da sessão de inventário** , nova estrutura de dados que guarda linhas conferidas, volumes manuais, observações e divergências de cada conferência.
7. **Controle de acesso e alertas** , quem pode conferir, e os avisos/alertas ao operador (pendências, divergências, conclusão).

---

## Leitura final para a apresentação

- **Plataforma analítica (Parte A):** 4 módulos, mas **30 itens** de desenvolvimento , 8 relatórios, 13 telas de apoio e de parametrização, 9 motores/estruturas de dados. As telas de parametrização são o ponto que costuma passar despercebido: cada relatório de ciclo, de curva ABC, de meta ou de despesa **só funciona depois** de uma tela onde alguém cadastra e define as regras.
- **Aplicação de conferência (Parte B):** um sistema à parte, **16 itens** , 9 telas + 7 integrações/regras, com hardware, trilha de auditoria e regras de divergência.
- **Total: 46 itens** a construir, fora os 2 comparativos opcionais de vendas.
