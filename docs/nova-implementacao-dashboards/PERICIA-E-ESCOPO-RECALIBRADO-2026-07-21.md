# Perícia cruzada e escopo técnico recalibrado , Dashboards Matrix Fitness Group

> **Data:** 2026-07-21
> **O que é:** laudo de perícia que cruza, pela primeira vez, as TRÊS fontes de verdade desta demanda: (1) a transcrição da reunião de 20/07, (2) o protótipo HTML navegável entregue pelo dono (`referencias-telas/plataforma-estoque-icaro-DESBLOQUEADO.html`, 28.861 linhas) e (3) a realidade do código/cache do projeto (schema Prisma, queries, worker de sync). A partir do cruzamento, recalibra complexidade e horas, e amarra cada painel às tabelas reais do Odoo.
> **Documentos que ele revisa:** `ESCOPO-TECNICO-DETALHADO.md` (v3, 5.185 linhas) e `ESTIMATIVA-PRECIFICACAO.md` (âncora anterior 420 h). Não os substitui: aponta onde subestimaram e por quê, e fixa a nova âncora.
> **Fronteira desta versão:** a **Conferência de estoque saiu deste orçamento** (aplicação operacional feita por fora, proposta separada, por decisão do dono). O **Estoque atual + Relatório de ciclos são um único módulo "Estoque"**.

---

## 1. Sumário executivo

O protótipo HTML mudou o jogo: ele é muito mais denso do que os prints sozinhos deixavam ver, e revelou que a estimativa anterior (340 h sem Conferência) **estava subdimensionada**. Ao mesmo tempo, a leitura do código real derrubou três premissas que inflavam a estimativa (vendedor, UF do cliente e entrega parcial já existem prontos). O saldo dos dois movimentos é uma âncora **maior e mais confiável**.

| | Anterior (sem Conferência) | **Recalibrado (perícia)** |
|---|---|---|
| Horas (âncora, realista) | ~340 h | **~520 h** |
| Custo a R$ 60/h | ~R$ 20.300 | **~R$ 31.200** |
| Faixa realista | 260 , 450 h | **420 , 640 h** (R$ 25.200 , R$ 38.400) |
| Valor de reposição (do zero) | ~R$ 60.000 | **~R$ 66.000** (referência p/ o cliente) |

**Por que subiu (evidência da perícia):**
- A **camada base** estava subdimensionada. Faltavam como linha de horas: o fato de **itens de compra** (a "quantidade a chegar" é irreconstruível hoje), o **snapshot diário de demanda/ordens de compra** (as colunas mensais do relatório de ciclo fechado e as variações de 30 dias dependem dele), as **3 tabelas imutáveis** do fechamento de ciclo (não é "reusar o snapshot diário em 10 h") e o **motor de status único parametrizável** (a maior peça de lógica, e o protótipo não a tem pronta: usa três regras divergentes e código morto).
- **Vendas é maior do que o escrito.** O protótipo tem 5 telas (as 3 previstas + comparativo de vendedores e de marcas como extras), e o comparativo A×B do protótipo está *enxuto*: a versão que o escopo exige (7 indicadores espelhados + composições + rankings + itens + condições) é mais reconstrução, não menos. Curva ABC/Pareto, PMR ponderado e o recorte grupo/Smart/Aztec pesam.
- **Ciclos entrega mais do que o previsto:** o relatório fechado tem visões por local/produto/grupo, acurácia previsto×real por produto e quadro de mudança de status entre ciclos, tudo confirmado no protótipo.
- **Financeiro** tem UI de baixo risco (protótipo funcional), mas o custo real é **dado e dependência de terceiros** (plano de contas classificado e UF na despesa ainda não existem) e agregações novas que a query atual não cobre.

**Por que não subiu ainda mais (reuso confirmado no código):**
- **Vendedor no pedido já existe e é populado** (`FatoPedido.vendedorId/vendedorNome`). O escopo antigo tratava como lacuna; não é. Economia direta no ranking de vendedores.
- **UF do cliente já existe** (`FatoParceiro.uf`) com `queryVendasPorUf`, `queryDemandasPorUf`, `ufPorParticipante` prontas. A lacuna de UF é **só em despesas**.
- **Entrega parcial já modelada e calculada** (`FatoPedidoItem.quantidadeAAtender/quantidadeAtendida` + `queryEntregasParciais`). Base do módulo Demandas pronta.
- **Infra transversal pronta:** corte de dados (`corte-dados.ts`), comparação vs período anterior com delta (`janela-anterior.ts`), snapshot diário idempotente (molde para o de ciclo).

**Regra de honestidade da recalibração:** os *extras* que o protótipo mostra mas o dono **não pediu para esta fase** (comparativo de vendedores, comparativo de marcas, dashboard de compras detalhado por OC, lead time/giro por número de série) **não entram no número âncora**. Ficam num catálogo opcional de fase futura (seção 9), com horas próprias, para o dono escolher.

---

## 2. Metodologia (como a perícia foi feita)

Seis frentes de análise em paralelo, cada uma sobre uma fonte, depois sintetizadas:

1. **Transcrição 20/07** , extração painel a painel do que o dono pediu, com as regras de negócio ditas e as ressalvas de dado.
2. **HTML , Estoque + Ciclos** , inventário das 3 telas vivas (motor `v180` + IIFE do relatório fechado), separando o que renderiza do código morto.
3. **HTML , Vendas** , 5 telas, duas gerações de código (`sales-` antiga e `salesx-` boa), comparativos espelhados.
4. **HTML , Financeiro + Demandas** , confirmou que o Financeiro EXISTE (injetado por JS, funcional) e mapeou os 8 blocos de Demandas.
5. **Código/Odoo** , schema Prisma (52 `Fato*`/`Dim*`), queries existentes, catálogo de sync (127 modelos Odoo), o que existe e o que falta.
6. **Auditoria do escopo/estimativa atuais** , o que reaproveitar, onde subestimaram, inconsistências.

Complemento: leitura visual direta dos prints 02, 06, 09, 13 e 18 (âncora independente, não confiar só nos relatórios).

---

## 3. Achados estruturais (valem para todos os módulos)

**3.1 O HTML tem 6+ gerações de código sobrepostas (`v168`→`v180`, `sales-`→`salesx-`).** Em JS a última definição vence, então boa parte do arquivo é **código morto**. Reconstruir "portando o HTML" seria portar lixo. O correto é reconstruir só o comportamento das telas vivas e usar o design system do projeto. Isso adiciona uma atividade de **triagem do que está vivo** (não porte cego) e torna os gráficos SVG feitos à mão (donuts, Pareto, mapa do Brasil) **reescrita**, não cópia.

**3.2 Toda parametrização do protótipo vive em `localStorage`.** Na plataforma real vira **estado de servidor** (tabelas novas, migrations, RBAC, validação Zod). O custo migra do front para o backend, mas não desaparece: é o que sustenta status por produto, previsão importada, meta e mapeamentos.

**3.3 Existe um motor de status divergente em cada tela do protótipo** (Estoque atual usa faixas vs "ideal"; Ciclo ativo deriva risco/excesso automaticamente em 10%/75%; Ciclo fechado usa 0/5/10 fixos). O que a reunião pede (e o escopo formaliza) é um **motor de status ÚNICO, parametrizável por produto**, que o protótipo **não tem**. Construí-lo é a maior peça de lógica de backend da demanda.

**3.4 Reuso confirmado maior que o creditado, gaps de dado maiores que o creditado.** Ver seção 1. Os dois se compensam parcialmente; o líquido é o aumento da âncora com muito mais confiança.

---

## 4. Camada base compartilhada , recalibrada e parametrizada

Pré-requisito de vários módulos. Cada item traz o vínculo real com o cache/Odoo.

| Item | O que é / vínculo no cache | Existe hoje? | Complex. | Horas |
|---|---|---|---|---|
| **Atributo "linha"** | Novo campo `linha`/`linhaId` em `FatoProduto`, propagado a `FatoEstoqueSaldo`/`_snapshot`. `marca/familia/tipo` já existem em `FatoProduto` | NÃO (campo não existe no Odoo; depende de o cliente criar e cadastrar) | Média | 10 |
| **Motor de ciclos + motor de status único** | 6 tabelas novas (`ciclo`, `ciclo_previsao`, `ciclo_status_config`, `ciclo_fechamento`, `_produto`, `_mes`) + cálculo consumido/cobertura/acurácia + status parametrizável por produto (fonte única) | NÃO (greenfield; não há nada de ciclo de negócio) | Muito alta | 42 |
| **Importadores manuais (5)** | Tabelas editáveis + telas de upload/validação/log: previsão de ciclo, meta mensal (`meta_venda_mensal`), plano de contas gerencial, UF na despesa, de-para CNPJ→grupo/construtora (`cliente_grupo`) | NÃO (nenhum nasce do Odoo) | Média-alta | 38 |
| **Thresholds de status por produto** | Tabela `ciclo_status_config` (produto → faixas risco/saudável/acumulado, un. ou %), pop-up "3 pontinhos", aplicado como fonte única nas queries | NÃO | Média | 16 |
| **Snapshot de fechamento de ciclo** | 3 tabelas imutáveis + job de congelamento na `dataFim` + caminho de leitura só-do-congelado. Reusa o padrão de `snapshot-estoque-diario.ts` como molde | NÃO (só há snapshot diário de estoque) | Média-alta | 18 |
| **Fato de itens de compra** (novo) | "Quantidade a chegar" é **irreconstruível hoje**: `fato_compra` só tem valores, não quantidade de item. Precisa novo fato de itens de OC | NÃO | Média | 12 |
| **Snapshot diário de demanda/OC** (novo) | O snapshot atual só fotografa saldo. As colunas mensais do relatório fechado e a variação de 30 dias de demanda dependem de um snapshot diário de demanda/OC | NÃO | Média | 14 |
| **Propagação de `tipo` + `segmento` do cliente** | `tipo` para `FatoEstoqueSaldo` (join/builder); `segmento` do parceiro: `raw_sped_participante_segmento` existe como RAW, falta builder + coluna em `FatoParceiro` | Parcial | Baixa-média | 10 |
| **Subtotal base** | | | | **160** |

> Antes: 86 h. A diferença (+74 h) é exatamente o que a auditoria apontou como subestimado: os dois fatos de snapshot novos, as 3 tabelas de fechamento e o motor de status único.

---

## 5. Módulo 1 , ESTOQUE (atual + relatório de ciclos)

Unificado por decisão do dono: os painéis de estoque pedidos **mais** o relatório de ciclos comparativo. São 3 telas.

### 5.1 Estoque atual
**Blocos (confirmados no HTML + transcrição):** 12 indicadores de topo com variação vs período anterior (no estoque, **fixa em 30 dias**, regra do dono); distribuição por local (um card por local: valor, % do valor, % da quantidade, ticket local, quantidade); composição por **marca / linha / tipo** com seletor único que troca o ângulo no mesmo espaço (pizza preferencial, barra opcional); seletor Geral × local; Demanda × Disponível em duas visões (quantidade e valor), sempre a **custo**; tabela por produto (modelo, quantidade, em demanda, disponível = saldo − demanda) com busca, filtros (local/marca/linha/tipo/status = zerado/negativo/positivo) e **ordenação por coluna**.

**Vínculo Odoo:** `FatoEstoqueSaldo` (saldo, vrSaldo, marca/família), `FatoEstoqueLocal` (locais, classificação), `FatoProduto` (custo, marca/família/tipo; **linha a criar**), `FatoEstoqueSaldoSnapshot` (variação 30 dias). Valoração canônica a custo: `quantidade × precoCusto`. Base de query: `diretoria/queries/estoque.ts` (1.243 linhas) + `queryEstoquePorLocal/PorMarca/PorFamilia/Granular` prontas.

**Delta do protótipo:** entrega A MAIS um mapa do Brasil por UF e um card "% comprometido" (13º); tem A MENOS a ordenação por clique de coluna e a variação por snapshot real (mock). "A chegar" depende do fato de itens de compra (base).

### 5.2 Ciclo ativo
**Blocos:** 8 indicadores (ruptura prevista, risco, saudáveis, acumulados; previsto no ciclo; previsão restante; valor em risco; valor em excesso); rosca de distribuição por status; tabela de 10 colunas (quantidade, demanda, disponível, a chegar, previsão do ciclo [importada], consumido [faturado no período], previsão restante = previsão − consumido, cobertura = quantidade − previsão restante, status). **4 status:** ruptura (`cobertura ≤ 0`, **automático, não configurável**) + risco/saudável/acumulado (**faixas configuráveis por produto**, un. ou %).

**Vínculo Odoo:** motor de ciclos (base), previsão importada (base), thresholds por produto (base); consumido = faturado, de `FatoNotaFiscal`/`FatoNotaFiscalItem` cruzado com `FatoPedido`/`FatoPedidoItem` no período do ciclo.

**Delta do protótipo:** o protótipo **não implementa** faixas por produto (deriva risco/excesso em 10%/75% automático), o consumido é mock (`hash`), a previsão restante tem piso 0 (o escopo exige que possa ser negativa), e o drill na fatia da rosca não existe (só dropdown). Tudo isso é trabalho a construir de verdade, não a portar.

### 5.3 Relatório de ciclos fechado
**Blocos:** 14 indicadores (valor médio, maior/menor e variação, valor acumulado em excesso, valor em ruptura, quantidade média, demanda prevista e real, **acurácia da previsão** = real/prevista, % por status); abertura/fechamento mês a mês (1º e último dia de cada mês: quantidade, valor, demanda, disponível, a chegar, consumo); rosca por status **com drill** (clicar lista os produtos daquele status: estoque inicial, entradas, previsão, consumido, saldo); comparativo ciclo atual × anterior (com coluna de **duração**, pois ciclos podem ter tamanhos diferentes); **acurácia previsto × real por produto**; **quadro de mudança de status entre ciclos** (melhorou/piorou/manteve).

**Vínculo Odoo:** consome o snapshot de fechamento (base, imutável), o snapshot diário de demanda/OC (base, para as colunas mensais), o motor de ciclos e os thresholds. Congelamento na `dataFim`.

**Delta do protótipo:** entrega A MAIS visões "Por local / Por produto / Comparativo" e uma tabela "por grupo" (marca/linha/tipo com % por status e erro de previsão). Confirma toda a estrutura pedida.

**Horas do módulo (recalibrado):** Estoque atual **32** + Ciclo ativo **30** + Ciclo fechado **40** = **102 h** (antes 80 h).

---

## 6. Módulo 2 , VENDAS (painel + comparativo A×B + comparação geral)

3 telas do escopo (os extras de vendedores e marcas vão para a seção 9).

**6.1 Painel:** 6 KPIs com delta (valor vendido, pedidos fechados, produtos vendidos, ticket médio, margem média **ponderada**, meta atingida com barra de progresso); C2 composição e margem em 5 ângulos com seletor único (linha, marca, tipo de cliente/segmento, forma de pagamento, CNPJ); C3 produtos vendidos (busca + ordenação); C5 condições de pagamento (forma mais usada, **PMR**, entrada média R$ e %, stack de formas por tipo de cliente); C4 dois rankings (por estado e por vendedor, este com meta individual); C6 **curva ABC/Pareto** (SVG custom, faixas 80%/95%, tabela por classe); carteira a faturar (un/pedidos/R$).

**6.2 Comparação geral de estados:** tabela de todas as UFs (nº de vendedores, faturamento, margem, PMR, % da receita, ticket, pedidos) com ordenação + 6 cards de destaque; cada linha abre o comparativo A×B.

**6.3 Comparativo A×B:** dois estados com períodos independentes, todos os indicadores espelhados com variação relativa (verde = melhor), composições, rankings e condições espelhadas. **O protótipo entrega isto enxuto** (só 3 métricas + pizza) , a versão completa é reconstrução.

**Regras (código + reunião):** faturamento = **nota fiscal emitida** (`FatoNotaFiscal`, `isVendaExterna=true`), não pedido; margem = **bruta** (faturado − custo de catálogo `FatoProduto.precoCusto`); meta **importada** (`meta_venda_mensal`, base); PMR por parcelas (`FatoPedidoParcela`) , divergência aberta: reunião pediu "média das médias", protótipo faz "ponderado por valor" (implementar as duas atrás de flag).

**Vínculo Odoo:** `FatoNotaFiscal`/`FatoNotaFiscalItem` (faturado), `FatoPedido`/`FatoPedidoItem`/`FatoPedidoParcela` (carteira, PMR, vendedor), `FatoParceiro` (UF, segmento, CNPJ/grupo). Base: `comercial.ts` (932 linhas) + `diretoria/queries/vendas.ts` (511). **Vendedor já populado** (`FatoPedido.vendedorId`) , sem custo de cadastro do nosso lado (a alteração em lote no Odoo é do cliente).

**Riscos:** segmento do cliente pode não ter vínculo parceiro→segmento (bifurcação: materializar vs virar processo do cliente); recorte grupo/Smart/Aztec depende do de-para CNPJ (base, importador).

**Horas do módulo (recalibrado):** Painel **34** + Comparação geral **16** + Comparativo A×B completo **22** + recorte grupo/construtora (UI, dado vem da base) **6** = **78 h** (antes 50 h).

---

## 7. Módulo 3 , FINANCEIRO por CNPJ

**Blocos (protótipo funcional confirmado):** resumo consolidado do grupo (6 cards: faturamento, gastos, resultado, maior faturamento, maior gasto, melhor resultado); um bloco por empresa (6 CNPJs) com faturamento, gastos, resultado e % gasto/faturamento; composição das despesas por categoria (rosca) **com drill lateral** (ao clicar: total da categoria, % dos gastos, nº de lançamentos, barras por fornecedor, tabela despesa/fornecedor); recorte por UF.

**Vínculo Odoo:** `FatoFinanceiroTitulo` (a pagar/receber, `vrDocumento`), `FatoFinanceiroMovimento`/`FatoFinanceiroLancamentoItem` (rateio por centro de resultado), `FatoContaContabil` (plano de contas contábil), `DimEmpresaGrupo` (empresas). Query base `financeiro.ts` (463 linhas) , **mas** precisa de agregações novas por `empresaId` + categoria (a query atual não cobre a tela).

**Riscos/dependências (o custo real do módulo):**
- **Bloqueante:** o **plano de contas de despesa classificado** ainda não existe (as categorias do protótipo são fictícias). Sem o cliente lançar, a rosca/drill caem em estado vazio.
- **Bloqueante do recorte por UF:** o **campo UF na conta a pagar** não existe no Odoo (frente do cliente).
- **De-para empresa↔CNPJ deslocado** (`empresaId ≠ DimEmpresaGrupo.odooId`): sanar antes de exibir CNPJ real.
- Reconciliação ao centavo (soma das fatias = card "Gastos"; usar `vrDocumento` nos dois lados para não deixar resíduo de juros/multa).
- Composição da **receita fica fora** (não há plano de contas de receita).

**Horas do módulo (recalibrado):** **36 h** (antes 32 h). UI de baixo risco, mas agregações novas + reconciliação + de-para puxam.

---

## 8. Módulo 4 , DEMANDAS

**Blocos (8, confirmados no HTML , B1, B2, B4, B5, B6, B7, B8, B9):** resumo (valor pendente, pedidos abertos, atrasados, itens pendentes, ticket, demandas cobertas %, valor descoberto, valor atrasado); lista de pedidos pendentes agrupada por pedido (cliente, modelo, UF, prazo, status, reserva, valor pendente) com filtros abertos/atrasados/todos e busca; máquinas em estoque × demanda; drill do pedido selecionado (entregue × pendente , entregas parciais na UI); visão geral (ativos, atrasados × no prazo); **mapa de demandas por estado** (heatmap clicável que filtra a lista); itens em pedidos ativos (entregues/a entregar/atrasados, com período próprio); concentração de atrasos por produto (ranking + Top 3).

**Vínculo Odoo:** `FatoPedido` (whitelist `bucket_demanda = 'ABERTA'`, 27 etapas curadas materializadas no worker), `FatoPedidoItem` (a atender/atendida , entrega parcial já pronta), `FatoEstoqueSaldo` (cobertura, não escopável por empresa/UF), `FatoParceiro` (UF). Reuso forte: `queryEntregasParciais`, `queryDemandasPorUf`, `queryIndicadoresDemandas`, `queryDemandasPendentes` já existem.

**Riscos:** whitelist de 27 etapas é regra central (erro contamina os 8 blocos); janela especial `janelaDemandaAberta` (piso 2000, imune ao corte de leitura); dupla base venda/custo com paridade obrigatória contra o Relatório de Entregas Parciais; B8 marcado **[A REFINAR]** pelo próprio dono ("vou refazer com calma").

**Horas do módulo (recalibrado):** **40 h** (antes 28 h). Muito reuso de query compensa parte da complexidade dos 8 blocos + heatmap + filtro cruzado.

---

## 9. Extras do protótipo , fase futura (FORA do número âncora)

O protótipo mostra features que o dono **não pediu para esta fase** (ou marcou como futuras). Ficam disponíveis como catálogo, para o dono decidir incluir:

| Extra | O que é | Horas est. |
|---|---|---|
| Comparativo de vendedores | Tela espelhada A×B por vendedor, KPIs próprios, tabela de pedidos | 18 |
| Comparativo de marcas | Tela espelhada A×B por marca, 5 KPIs, público principal | 14 |
| Dashboard de compras detalhado | Lista de OCs por fornecedor (frete, valor pago, entregue×pedido) , o escopo atual exclui isso do Estoque | 22 |
| Lead time / idade / giro por série | A partir de `FatoSerial` (data compra/chegada, custo por série) | 16 |
| Curva ABC configurável (10/20/30%) | Faixa da curva parametrizável, como o dono citou | 6 |
| **Subtotal extras (opcional)** | | **76** |

---

## 10. Estimativa recalibrada , consolidada

**Cenário B , realista (a praticar), R$ 60/h**

| Grupo | Horas | Custo |
|---|---|---|
| Camada base compartilhada | 160 | R$ 9.600 |
| Módulo 1 · Estoque (atual + ciclos) | 102 | R$ 6.120 |
| Módulo 2 · Vendas (3 telas) | 78 | R$ 4.680 |
| Módulo 3 · Financeiro por CNPJ | 36 | R$ 2.160 |
| Módulo 4 · Demandas | 40 | R$ 2.400 |
| Transversais (QA + reconciliação E2E: 60; gestão + parametrização + homologação: 44) | 104 | R$ 6.240 |
| **Total âncora** | **520** | **R$ 31.200** |
| Faixa otimista (dependências do cliente prontas, segmento existe) | 420 | R$ 25.200 |
| Faixa conservadora (segmento vira processo, plano de contas atrasa, comparação de ciclos complexa) | 640 | R$ 38.400 |
| Extras opcionais (seção 9) | +76 | +R$ 4.560 |

**Cenário A , do zero (valor de reposição, referência para o cliente):** ~1.100 h ≈ **R$ 66.000** (fundação de ~420 h que já existe e não se paga de novo, + base + módulos construídos sem reuso + transversais). Serve para o cliente dimensionar o tamanho real da obra.

---

## 11. Riscos e dependências do cliente (o que trava horas e prazo)

Tudo abaixo depende de terceiros (cliente/implantador do Odoo), não só de nós, e é a maior fonte de variação da faixa:
- **Série temporal de estoque só "daqui pra frente"** , sem histórico retroativo; comparativos e colunas mensais começam a existir a partir da data de início.
- **Atributos "linha" e "tipo"** não existem no Odoo , exigem criação + **recadastro massivo do catálogo** pelo cliente.
- **Previsão de ciclo, meta mensal, plano de contas gerencial, UF na despesa, de-para CNPJ→grupo** , todos cadastro/importação manual do cliente.
- **Nome do vendedor** existe no cache mas vem incompleto historicamente , ranking confiável só "daqui pra frente".
- **Segmento do cliente** , pode não ter vínculo parceiro→segmento; confirmar por `SELECT` antes de prometer as composições por segmento.
- **Financeiro** , plano de contas de despesa e UF na conta a pagar são bloqueantes; receita fica fora (sem plano de contas de receita).
- **Conferência de estoque** , fora deste orçamento (proposta separada).

---

## 12. Lista de atividades (plano de execução recomendado)

Ordem pela prioridade do dono, entrega incremental painel a painel:

1. **Base , parte 1 (habilita Estoque):** atributo linha + propagação, fato de itens de compra, snapshot diário de demanda/OC, motor de status único (esqueleto).
2. **Módulo Estoque atual** (prioridade nº 1) , entrega isolada assim que pronto.
3. **Base , parte 2 (habilita Ciclos):** motor de ciclos completo, importador de previsão, thresholds por produto, snapshot de fechamento.
4. **Módulo Estoque , ciclo ativo e relatório fechado.**
5. **Módulo Vendas** , painel, depois comparação geral, depois comparativo A×B; importador de meta e de-para CNPJ→grupo.
6. **Módulo Financeiro** , quando o cliente tiver plano de contas classificado e UF na despesa.
7. **Módulo Demandas** , por último (escopo a refinar com o dono, B8 aberto).
8. **Transversais em paralelo:** reconciliação E2E contra dado real a cada painel; reuniões de parametrização (status por produto, plano de contas, mapeamentos); homologação.

> Conferência de estoque: proposta e cronograma à parte.
