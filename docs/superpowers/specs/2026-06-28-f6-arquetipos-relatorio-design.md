# F6 , Arquétipos de relatório (chegar no nível do dashboard de Consumo)

> Spec de design (v1, entra em 2 reviews antes do plano). Branch `feat/nex-reconstrucao`.
> **F6 SÓ LOCAL.** Data: 2026-06-28.

## 1. Alvo (a meta do usuário)

O padrão de qualidade é o **dashboard de Consumo do Agente Nex**. O relatório do
construtor tem que chegar nesse nível:

- **Filtros em pílula, NÃO fixos** no topo: pílulas de período (hoje, este mês,
  etc.) + **intervalo personalizado de data** (date range que começa em
  2026-05-22, quando passou a haver dado).
- **Gráficos INTERATIVOS:** navegação por setinha (mudar o dia / o mês conforme a
  pílula de período), **tooltip no hover** mostrando o valor exato, datas sem
  abreviação tosca.
- **KPIs inteligentes:** rótulos certos (conversas, chamadas, tokens, custo),
  **abreviação correta** (MI / BI / TRI), descrição embaixo (ex.: valor em dólar
  no custo total). KPIs DISTINTOS, nada de repetir o mesmo número.
- **Pizza/donut** por dimensão (ex.: distribuição por provedor).
- **Tabela com drilldown** (abrir os detalhes da linha), colunas bem definidas,
  **paginação** + **resultados por página**.
- Tudo muito bem diagramado, posicionado, pensado. Animações com PROPÓSITO.

## 2. Diagnóstico honesto (por que o de hoje é Frankenstein)

1. **O agente de runtime NÃO usa skill nenhuma** (Superpowers/ui-ux-pro-max são
   ferramentas de DEV, minhas). Ele é um LLM com prompt + tools. Não tem
   conhecimento de design embutido.
2. **Ele free-forma seção por seção:** despeja uma seção por dimensão coletada,
   sem curadoria, sem layout pensado. Daí a salada.
3. **Os componentes bons JÁ EXISTEM** no código (o renderer já foi reescrito para
   usar os componentes reais do Consumo: `KpiCard`, `InteractiveBarChart`,
   `InteractiveAreaChart`, `DonutWithCenter`, `ReportDataTable`). O problema NÃO é
   falta de componente , é falta de **curadoria/orquestração** e de
   **interatividade/filtros** no relatório montado.
4. **Sem filtros interativos:** hoje os "filtros" eram uma barra fixa feia (já
   removida). Não há o conceito de filtro-pílula que muda o gráfico ao vivo.

## 3. A arquitetura (a garantia de coerência, sem time de agentes)

> Princípio: a inteligência de design é embutida no BUILD (por mim, com
> ui-ux-pro-max, usando os componentes reais do Consumo). O agente só **ESCOLHE +
> PARAMETRIZA**. Coerência por construção. Custo: UMA chamada LLM.

### 3.1 Arquétipos de relatório (curados)

Um **arquétipo** é um layout de relatório completo, profissionalmente desenhado,
montado com os componentes reais do Consumo, com slots parametrizáveis. Não é o
LLM que inventa o arranjo , ele escolhe um arquétipo e preenche os dados.

Arquétipos da onda 1 (estoque), cada um coerente e com história:

1. **Panorama de estoque por armazém** , KPIs de saúde (itens, produtos, valor
   total, armazéns) → gráfico de valor por armazém (interativo) → tabela de
   detalhe por armazém com drilldown.
2. **Risco e rupturas** , KPIs de risco (negativos, parados, valor parado) →
   ranking de itens negativos (barras interativas) → tabela dos itens críticos.
3. **Análise por marca / família** , KPIs do recorte → donut de composição por
   marca/família → ranking → tabela com drilldown.

Cada arquétipo define: quais KPIs (curados, distintos, com abreviação e
descrição), quais gráficos (tipo + interatividade), quais filtros-pílula, e a
tabela com drilldown. Tudo desenhado com ui-ux-pro-max e os tokens reais.

### 3.2 O papel do agente (uma chamada de raciocínio alto)

O agente recebe o entendimento + o catálogo de arquétipos disponíveis e, **numa
chamada**, devolve: `{ arquetipo: "...", parametros: { fato, recorte, filtros,
periodo, ... } }`. Ele NÃO monta seções soltas. Validação determinística garante
que o arquétipo existe e que os parâmetros são viáveis no catálogo.

### 3.3 Filtros-pílula interativos (novo)

O relatório renderiza, no topo (não-fixo, rolando junto), as **pílulas de
filtro** definidas pelo arquétipo: período (com intervalo personalizado de data) +
os recortes (armazém/marca/família). Mudar o filtro **re-resolve os dados e
atualiza os gráficos ao vivo** (como o Consumo faz). Reusar o máximo possível da
infra de filtros/resolução que já existe.

### 3.4 Renderer no nível do Consumo

- KPIs: `KpiCard` com abreviação MI/BI/TRI + descrição (já existe; usar direito).
- Gráficos: os interativos do Consumo (área/barra com tooltip + navegação de
  período onde fizer sentido).
- Tabela: `ReportDataTable` com drilldown + paginação + resultados por página.

## 4. Escopo / não-objetivos

- Onda 1: estoque, ~3 arquétipos. Outros domínios em ondas seguintes.
- NÃO usar time de agentes (mais chamadas = contradiz o pedido de eficiência).
- F6 SÓ LOCAL.

## 5. Pendências de decisão (para o brainstorm/reviews)

- Quantos arquétipos na onda 1 e exatamente quais KPIs/gráficos por arquétipo.
- Quanto da infra de filtros do Consumo dá para reusar direto.
- Como o agente escolhe entre arquétipos quando o pedido cruza dois.
- Interatividade de período: quais fatos têm série temporal real para a setinha.

> **Status:** v1. Próximo: brainstorm para fechar as decisões da §5, depois 2
> reviews adversariais → spec v3 → plano. Construção dos arquétipos com
> ui-ux-pro-max + componentes reais do Consumo. F6 não sobe sem aprovação.
