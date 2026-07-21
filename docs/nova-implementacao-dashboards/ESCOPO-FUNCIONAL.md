# Escopo funcional , Nova implementação de dashboards (Matrix Fitness Group)

> **Origem:** reunião de 2026-07-20 (transcrição em `docs/transcricoes-reunioes/2026-07-20-reuniao-dashboards-matrix-transcricao-BRUTA.md`) cruzada com os 18 protótipos de tela em `referencias-telas/`.
> **Natureza:** camada nova de produto sobre a plataforma existente (dashboard Next.js lendo do cache Postgres/Prisma alimentado pelo worker de sync do Odoo via JSON-RPC).
> **Documento irmão:** `ESTIMATIVA-PRECIFICACAO.md` (horas, complexidade e custo).

São **6 frentes**: 5 módulos que vivem dentro da plataforma como dashboards analíticos e **1 aplicação operacional** (Conferência de estoque), que é mais que um dashboard, tem fluxo de trabalho, captura de hardware e persistência de sessão.

| # | Frente | Tipo | Prioridade (cliente) | Origem no código |
|---|--------|------|----------------------|------------------|
| 1 | Estoque atual | Dashboard | 1ª (máxima) | Evolução de `diretoria/estoque` |
| 5 | Conferência de estoque | Aplicação | 2ª | Nova (dado `fato_serial` existe) |
| 3 | Vendas (+ comparativos + comparação geral) | Dashboard (3 telas) | 3ª | Evolução de `diretoria/vendas` + 2 telas novas |
| 2 | Relatório de estoque (ciclo ativo + relatório fechado) | Dashboard (2 telas) | 4ª | Nova (não existe tela de ciclo) |
| 4 | Financeiro por CNPJ | Dashboard | 5ª (menor) | Nova (query existe, tela não) |
| 6 | Demandas | Dashboard | Próxima (a refinar) | Evolução de `diretoria/pedidos` |

Antes dos módulos existe a **camada base compartilhada** (seção 0), que não é tela mas habilita metade dos números pedidos.

---

## 0. Camada base compartilhada

Cinco frentes de dado que servem a vários módulos. O mapeamento do código mostrou que **parte já existe** (o que reduz muito o custo), e parte precisa ser construída.

### 0.1 O que JÁ existe e será reusado (custo baixo/zero)
- **Snapshot histórico diário de estoque:** `fato_estoque_saldo_snapshot` + job `src/worker/fatos/snapshot-estoque-diario.ts`. É exatamente a base que o cliente pediu ("alimentar de uma data de início para frente") para os comparativos. **Já está pronta.**
- **Comparação "vs. período anterior":** `src/lib/reports/builder/janela-anterior.ts` calcula a janela anterior de mesmo tamanho e o delta. **Já está pronta.**
- **Corte de dados configurável** (`src/lib/corte-dados.ts`): janela de leitura das análises, já implementada.
- **Atributos de produto marca, família e tipo:** já existem em `fato_produto` (`marcaNome`, `familiaNome`, `tipo`) e já são propagados para os fatos de estoque.

### 0.2 O que precisa ser CONSTRUÍDO
- **B1 , Atributo "linha" do produto.** A composição por linha (Magnum, Ultra, Versa, Aura) não existe no cache. Exige criar o atributo no Odoo, novo `raw_*`, campo `linha` em `fato_produto` e propagação. (Marca/família/tipo já existem, então este é o único atributo realmente novo.)
- **B2 , Motor de ciclos configurável.** Não existe hoje (só há "ciclo" de sincronização no worker, que é outra coisa). Precisa: entidade de ciclo com duração e período configuráveis, conjunto de produtos, previsão importada, e o cálculo de consumido / previsão restante / cobertura. Base dos módulos 1 e 2.
- **B3 , Importadores de dado manual.** Telas/rotinas de importação + validação para: previsão do ciclo por produto, meta mensal de vendas, categorias do plano de contas, UF nas contas a pagar, e mapeamento de CNPJs em grupos (grupo / Smart / Aztec / construtoras). Nenhum desses dados nasce automático do Odoo.
- **B4 , Parametrização de status por produto.** Pop-up (3 pontinhos) para definir, por produto, as faixas de status saudável / risco / acumulado em unidade ou percentual, com persistência. Regra de negócio configurável, não fixa no código.
- **B5 , Snapshot de fechamento de ciclo.** Ao bater o último dia do ciclo, congelar o recorte num relatório imutável e arquivado. Reusa o snapshot diário existente como fonte.

---

## 1. Módulo Estoque atual
> Referências: `01-estoque-atual-*.png`, `02-estoque-atual-*.png`

**Função:** foto objetiva do estoque físico atual (sem compras detalhadas, financeiro externo ou logística). Prioridade nº 1 do cliente.

**O que o painel precisa ter:**
- **12 indicadores gerais** no topo: valor total, valor médio por local, ticket médio dos produtos, valor em demanda, valor disponível, valor a chegar, quantidade total, quantidade média por local, quantidade em demanda, quantidade disponível, quantidade a chegar e última atualização.
- **Variação vs. período anterior** (verde/vermelho, %) em cada indicador; no estoque, sempre fixada em 30 dias.
- **Distribuição por local de estoque:** um card por local (Jarinu, Valinhos, Ceilândia, Vicente Pires, Sergipe...) com valor, % do valor total, % da quantidade total, ticket local e quantidade presente.
- **Composição do estoque** por marca, por linha e por tipo de produto, com **seletor único** que troca o ângulo no mesmo espaço e opção de gráfico (pizza preferencial, barra opcional).
- **Seletor Geral × local específico** recalculando as composições só daquele local.
- **Demanda × Disponível** em duas visões (por quantidade e por valor), sempre a valor de custo (estoque é custo).
- **Tabela de estoque por produto:** modelo, quantidade, quantidade em demanda, disponível (= saldo − demanda), com **busca**, **filtros** por local/marca/linha/tipo/status e **ordenação por coluna** (maior↔menor, A↔Z). Filtro de status = zerado / negativo / positivo.

**Integração com tabelas:** lê `fato_estoque_saldo` e `fato_estoque_local`; composições por `fato_produto` (marca/família/tipo já prontos; **linha a criar**); comparativo via `fato_estoque_saldo_snapshot` (pronto). Base de query: `diretoria/queries/estoque.ts` (1.243 linhas) já existente, a estender.

---

## 2. Módulo Relatório de estoque (ciclos)
> Referências: `03-ciclo-ativo-*.png`, `04-ciclo-ativo-*.png`, `05-relatorio-ciclos-*.png`, `06-relatorio-ciclos-*.png`

Duas telas sobre o mesmo motor de ciclo (B2): acompanhamento ao vivo e relatório fechado. Frente mais densa de regra de negócio do estoque. **Nenhuma tela de ciclo existe hoje** (só o dado bruto).

### 2a , Acompanhamento do ciclo ativo
- **Indicadores do ciclo:** nº de produtos em ruptura prevista, risco de ruptura, saudáveis, acumulados; previsto no ciclo; previsão restante; valor em risco; valor em excesso.
- **Tabela por produto:** quantidade, demanda, disponível, a chegar, **previsão do ciclo** (importada, B3), **consumido no ciclo** (faturado no período), **previsão restante** = previsão − consumido, **cobertura** = quantidade − previsão restante, e **status**.
- **4 status:** ruptura prevista (cobertura ≤ 0, regra fixa, não configurável) + risco / saudável / acumulado (faixas **configuráveis por produto** em un. ou %, B4).
- **Rosca de distribuição por status** com filtros de local/marca/linha/tipo.

### 2b , Relatório de ciclos fechado
- **Congelamento automático** do ciclo na data de fechamento (B5), gerando relatório imutável e arquivado, abrível a qualquer momento.
- **Indicadores:** valor médio do estoque, maior/menor valor e variação, valor acumulado em excesso, valor em ruptura, quantidade média, % do estoque em cada status, **acurácia da previsão** (demanda real ÷ prevista), demanda real e prevista total.
- **Abertura e fechamento mensal:** primeiro e último dia de cada mês do ciclo, com variação em quantidade, valor, demanda, disponível, a chegar e consumo.
- **Rosca por status com drill:** clicar na fatia lista os produtos daquele status com estoque inicial, entradas, previsão, consumido e saldo do ciclo.
- **Comparativo ciclo atual × anterior** (com coluna de duração, pois ciclos podem ter tamanhos diferentes).
- **Acurácia previsto × real por produto** e **mudança de status entre ciclos** (melhorou / piorou / manteve).

**Integração com tabelas:** consome o motor de ciclos (B2, novo), a previsão importada (B3), thresholds por produto (B4), o snapshot diário (pronto) e o snapshot de fechamento (B5). Faturado no ciclo vem de `fato_pedido` / `fato_pedido_item` / `fato_nota_fiscal`.

---

## 3. Módulo Vendas
> Referências: `07-vendas-*.png` a `12-vendas-*.png`. Três telas.

Parte já existe (`diretoria/vendas/page.tsx` + `diretoria/queries/vendas.ts`, 511 linhas). O esforço concentra-se nos ângulos novos e nas duas telas de comparativo.

### 3a , Painel de vendas
- **Indicadores:** valor vendido, pedidos fechados, produtos vendidos, ticket médio, margem média (bruta, ponderada pelo valor) e **meta atingida** (meta mensal importada, B3); todos com variação e filtro de período (hoje / semana / ano / personalizado).
- **Composição e margem** por linha, marca, tipo de cliente (segmento: academia, condomínio, hotel, estúdio...), forma de pagamento e CNPJ; cada ângulo com valor, % do total e margem média praticada.
- **Recorte por grupo de cliente** (grupo × Smart × Aztec) e **busca por construtora** que reúne múltiplos CNPJs/razões sociais num mesmo cliente (B3, mapeamento).
- **Produtos vendidos por item:** quantidade, valor, % do faturamento, ordenável.
- **Condições de pagamento:** forma mais usada, **PMR (prazo médio de recebimento)**, entrada média em R$ e %, % de pedidos com/sem entrada, e distribuição de forma de pagamento por tipo de cliente.
- **Rankings** por estado e por vendedor (valor, participação, pedidos, ticket, margem, meta individual).
- **Curva ABC / Pareto:** classes A/B/C, % de faturamento concentrado, barras + linha acumulada com faixas 80%/95%.
- **Valor a faturar / pedidos em carteira** (vendido ainda não faturado) em un., pedidos e R$.

Faturamento = nota fiscal emitida (não pedido colocado). Margem = margem bruta (valor faturado − custo).

### 3b , Comparativos + 3c , Comparação geral de estados
- **Comparativo A × B** de dois estados com períodos independentes: todos os indicadores lado a lado com variação relativa (verde = melhor), composições, rankings de vendedor, itens vendidos e condições de pagamento espelhadas.
- **Comparação geral de estados:** tabela de todas as UFs (nº de vendedores, faturamento, margem, PMR, % da receita, ticket, pedidos), com filtros (linha, marca, tipo de cliente, vendedor, forma de pagamento) e ordenação, mais cards de destaque (maior faturamento, maior margem, maior ticket, menor prazo).

**Integração com tabelas:** `fato_pedido`, `fato_pedido_item`, `fato_pedido_parcela` (PMR), `fato_nota_fiscal` (faturado), `fato_parceiro` (segmento/CNPJ/grupo). Base: `comercial.ts` (932 linhas) + `diretoria/queries/vendas.ts`.

**Dependência de processo:** ranking por vendedor depende do nome do vendedor no pedido do Odoo (hoje incompleto; será corrigido "daqui para frente"). Taxa de conversão fica fora (orçamentos vivem no Mercos).

---

## 4. Módulo Financeiro por CNPJ
> Referência: `13-financeiro-por-cnpj.png`

Query financeira existe (`financeiro.ts`, 463 linhas), mas **não há tela de diretoria financeira**. Menor prioridade do cliente.

**O que o painel precisa ter:**
- **Resumo consolidado do grupo:** faturamento total, gastos totais, resultado, maior faturamento, maior gasto e melhor resultado entre as empresas.
- **Um bloco por empresa** (6 CNPJs): faturamento, gastos, resultado (faturamento − gastos) e % gasto/faturamento.
- **Composição das despesas** por categoria do plano de contas (rosca) com **drill lateral**: ao clicar na categoria, detalhamento por despesa/fornecedor com valor, % da categoria e nº de lançamentos.
- **Recorte por UF** das despesas (campo de estado nas contas a pagar) e visão por CNPJ + UF.

**Integração com tabelas:** `fato_financeiro_titulo`, `fato_financeiro_movimento`, `fato_financeiro_lancamento_item`, `fato_conta_contabil` + `dim_empresa_grupo`. Depende do **plano de contas** e do **campo de UF nas despesas** serem lançados no Odoo (B3). Composição da **receita** fica fora por ora (não há plano de contas de receita).

---

## 5. Aplicação Conferência de estoque
> Referências: `14-conferencia-modal-*.png`, `15-conferencia-estoque-*.png`

**Não é dashboard: é uma aplicação operacional.** Tem fluxo de trabalho, captura de leitor de código de barras, persistência de sessão de inventário e regras de reconciliação. É o item mais complexo do pacote. O dado de origem (`fato_serial`, `fato_serial_saldo`) já existe; **a aplicação inteira é nova**.

**O que a aplicação precisa ter:**
- **Seleção do local** de conferência antes de iniciar; carrega todos os seriais que o Odoo aponta naquele local (saldo por lote/série).
- **Bipagem por leitor de código de barras** + **digitação manual** (código apagado/ilegível), registrando o **tipo** (escaneado × digitado), quem registrou, horário e **ordem** do registro (1º, 2º...) para localizar a peça depois.
- **Seriais pendentes em vermelho**; ao bipar, viram confirmados. Indicadores ao vivo: total, escaneados, digitados, pendentes (% e quantidade) e rosca escaneado × não escaneado.
- **Observações por item** (caixa arrebentada, máquina desmontada, peça faltando...) e detalhe do serial em modal.
- **Volumes sem número de série** (bateria de peso, carenagem, estofado...): contagem manual incremental estilo "+" (adiciona e soma), com edição/apagar.
- **Divergências:** serial bipado que pertence a outro local aparece destacado (alerta) em quadro separado.
- **Finalização com dupla confirmação**, gravando o inventário numa "gaveta" consultável depois, com histórico de conferências.

**Integração com tabelas:** lê `fato_serial` / `fato_serial_saldo`; escreve uma nova entidade de sessão de inventário (linhas conferidas, volumes manuais, observações, divergências). Integra com o leitor de código de barras (entrada de teclado/USB HID).

---

## 6. Módulo Demandas
> Referências: `16-demandas-*.png`, `17-demandas-*.png`, `18-demandas-*.png`

Evolução de `diretoria/pedidos/page.tsx` (que já tem indicadores de demanda, demanda por UF, pendentes e entregas parciais). Considera só **pedidos ativos ainda não entregues**. Foi a tela menos detalhada na reunião ("vou refazer com calma"), escopo a refinar.

**O que o painel precisa ter:**
- **Resumo:** valor pendente, pedidos abertos, pedidos atrasados, itens pendentes, ticket médio, demandas cobertas %, valor descoberto e valor atrasado.
- **Lista de pedidos pendentes** (uma linha por item, agrupada por pedido): cliente, modelo, UF, prazo, status (aberto/atrasado), reserva e valor pendente; filtros abertos/atrasados/todos e busca.
- **Máquinas em estoque × demanda** lado a lado (disponível, demanda, % em demanda).
- **Indicadores do pedido selecionado** (drill ao clicar numa linha).
- **Visão geral** (valor total em pedidos ativos, quantidade, atrasados × no prazo) e **mapa de demandas por estado** (heatmap do Brasil, clicável para filtrar).
- **Itens vendidos em pedidos ativos:** por modelo, entregues × a entregar × atrasados, gráfico de quantidade e **concentração de atrasos por produto** (ranking + Top 3).

**Integração com tabelas:** `fato_pedido`, `fato_pedido_item`, `fato_estoque_saldo` (cobertura). Reusa `queryIndicadoresDemandas`, `queryDemandasPorUf`, `queryDemandasPendentes`, `queryEntregasParciais` já existentes em `comercial.ts` / `diretoria/queries/pedidos.ts`. Métrica "demanda a entregar" já tem tratamento próprio de janela (não recortada pelo corte).

---

## Premissas e fronteiras

**Premissas:** plataforma-base pronta e reutilizada; o cliente cadastra no Odoo os dados de origem (linha, meta, previsão de ciclo, plano de contas, UF nas despesas, nome do vendedor); histórico incompleto tratado "daqui para frente"; acesso só via API JSON-RPC.

**Fora de escopo (frentes futuras):** WMS / endereçamento por prateleira; taxa de conversão de vendas (Mercos); margem líquida e composição da receita por plano de contas; integração Mercos→Odoo; comparativos de vendas além dos três desta fase.
