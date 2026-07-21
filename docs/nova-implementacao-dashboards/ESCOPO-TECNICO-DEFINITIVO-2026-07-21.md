# Escopo Técnico Definitivo , Dashboards Analíticos Matrix Fitness Group

| | |
|---|---|
| **Cliente** | Matrix Fitness Group (grupo Icaro / JHT) |
| **Projeto** | nexus-odoo , camada de dashboards analíticos sobre o cache do Odoo |
| **Versão** | v4 (definitiva, pós-perícia do protótipo HTML) |
| **Data** | 2026-07-21 |
| **Base de origem** | Reunião de 20/07/2026 + protótipo HTML navegável + perícia do código/cache real |
| **Valor/hora de referência** | R$ 60 |
| **Âncora de esforço** | 520 h (faixa 420 , 640 h) , detalhamento na seção 12 |
| **Fora deste documento** | Conferência de estoque (aplicação operacional, proposta e escopo próprios) |

> **Como ler:** este é o contrato técnico que o desenvolvedor implementa. Cada indicador tem **fórmula**, **fonte no cache** (`Tabela.campo`) e **status** (existe / estender / construir). Cada tela tem **requisitos funcionais (RF)**, **regras de negócio (RN)**, **critérios de aceite (CA)** e **dependências (DEP)**. Convenções na seção 3.

---

## 1. Sumário executivo

Entrega de **4 módulos de dashboard** sobre a plataforma existente (Next.js + cache Postgres/Prisma alimentado pelo worker de sync do Odoo via JSON-RPC):

| # | Módulo | Telas | Origem | Prioridade do cliente |
|---|--------|-------|--------|-----------------------|
| 1 | **Estoque** (atual + relatório de ciclos) | 3 | evolui `diretoria/estoque` + 2 telas novas de ciclo | 1ª (máxima) |
| 2 | **Vendas** | 3 (painel + comparativo A×B + comparação geral) | evolui `diretoria/vendas` + 2 telas novas | 2ª |
| 3 | **Financeiro por CNPJ** | 1 | tela nova (query base existe) | 4ª |
| 4 | **Demandas** | 1 (8 blocos) | evolui `diretoria/pedidos` | 5ª (a refinar) |

Antes dos módulos existe a **camada base compartilhada** (seção 4): dados e motores que servem a mais de um módulo e que hoje **não existem** no cache (motor de ciclos, atributo linha, importadores manuais, thresholds por produto, snapshots novos).

**Princípio de reuso comprovado na perícia:** a fundação (app, auth, RBAC, cache, sync, camada de fatos, snapshot diário de estoque, comparação vs período anterior, corte de dados) já existe e é reaproveitada. O custo desta demanda concentra-se em: (a) a camada base nova, (b) a camada de apresentação de cada módulo, (c) as agregações/queries novas por ângulo.

---

## 2. Arquitetura e contexto técnico

```
Odoo (Tauga, JSON-RPC)  ──►  Worker BullMQ (sync incremental + snapshot)  ──►  Postgres cache
                                                                                   │
                                        raw_*  (espelho cru, jsonb)  ──builders──► fato_* / dim_*  (tipado)
                                                                                   │
                                                    ┌──────────────────────────────┴───────────────┐
                                                    ▼                                                ▼
                                          Dashboard (Next.js "app")                        MCP semântico
```

**Fatos relevantes da perícia do código:**
- **52 models `Fato*`/`Dim*`** já existem e são populados; 4 dos 5 domínios (Estoque, Vendas, Financeiro, Pedidos/Demandas) têm cobertura madura. **Ciclos é greenfield total.**
- Cada `raw_*` guarda o registro Odoo inteiro num `data Json` (jsonb). Os builders em `src/worker/fatos/*.ts` projetam colunas tipadas nos `fato_*`. **Consequência de custo:** adicionar um campo de um modelo Odoo já sincronizado a um `fato_*` é BAIXO; adicionar um modelo novo é MÉDIO; um campo que **não existe no Odoo** (ex.: atributo "linha") é ALTO (depende do cliente cadastrar no Odoo).
- Catálogo de sync: `src/worker/catalog/model-catalog.ts` (127 modelos Odoo mapeados).
- Infra transversal pronta: `src/lib/corte-dados.ts` (janela de leitura), `src/lib/reports/builder/janela-anterior.ts` (`janelaAnterior()` + `calcularDeltaKpi()`), `src/worker/fatos/snapshot-estoque-diario.ts` (`capturarSnapshotEstoqueDiario`).

---

## 3. Convenções, premissas e definição de pronto

**3.1 Convenções de notação**
- `RF-x.y` requisito funcional · `RN-x.y` regra de negócio · `CA-x.y` critério de aceite · `DEP-x.y` dependência (bloqueia entrega).
- **Status de dado:** `[EXISTE]` já no cache · `[ESTENDER]` reusa base + agregação nova · `[CONSTRUIR]` do zero · `[CLIENTE]` depende de cadastro no Odoo.
- Fonte sempre citada como `FatoNome.campo` (nome do model Prisma).

**3.2 Premissas fixas**
1. Plataforma-base (app, auth, RBAC, design system, cache, worker) já existe e é reutilizada.
2. Leitura **sempre do cache**, nunca do Odoo ao vivo. Toda tela exibe o frescor (`max(atualizadoEm)`).
3. O cliente cadastra no Odoo os dados de origem inexistentes: **linha**, **tipo**, **meta mensal**, **previsão de ciclo**, **plano de contas gerencial**, **UF na despesa**, **segmento do cliente**, **nome do vendedor**.
4. Histórico incompleto tratado **"daqui para frente"**; sem reprocessamento retroativo.
5. Acesso ao Odoo **exclusivamente via JSON-RPC**.
6. Toda leitura de histórico respeita a data de corte (`src/lib/corte-dados.ts`), exceto a demanda em aberto (janela própria).

**3.3 Definição de pronto (por painel)**
- `tsc` + `eslint` + testes verdes.
- **Reconciliação E2E contra dado real** obrigatória: subir o serviço, popular os fatos, conferir os números contra o Odoo/cache. Review de código não substitui isso.
- Paridade com números canônicos já existentes (ex.: faturamento do Agente Nex, Relatório de Entregas Parciais).
- Estados vazio/carregando/erro presentes e acionáveis.
- Dark/light conferidos; responsivo a 375px; acessibilidade (alvo ≥44px, foco visível, `aria-label` em botão só-ícone).

**3.4 Fora de escopo (fases futuras)**
WMS/endereçamento por prateleira; taxa de conversão (orçamentos vivem no Mercos); margem líquida e composição da receita (não há plano de contas de receita); integração Mercos→Odoo; Conferência de estoque (proposta à parte); comparativos de vendedores e de marcas (catálogo opcional, seção 11).

---

## 4. Camada base compartilhada , modelo de dados novo

Nada aqui é tela; é o alicerce de dados. **Tudo `[CONSTRUIR]`** salvo indicação.

### 4.1 Atributo "linha" do produto `[CLIENTE]` + `[CONSTRUIR]`
Composição por linha (Magnum, Ultra, Versa, Aura) não existe no cache. `FatoProduto` já tem `marcaId/Nome`, `familiaId/Nome`, `tipo`; falta `linha`.
- **Passos:** (a) cliente cria o atributo no Odoo e cadastra por produto; (b) field-selection no sync; (c) builder `fato-produto.ts` mapeia `linhaId/linhaNome`; (d) coluna + migration em `FatoProduto`; (e) propagação para `FatoEstoqueSaldo`, `FatoEstoqueSaldoSnapshot` (espelhando o padrão de `marcaNome`).
- **Fallback:** produto sem linha cai em "Sem linha". Alternativa se o cliente não modelar no Odoo: tabela de-para local (mantida à mão).
- **Idem `tipo`:** propagar `FatoProduto.tipo` para `FatoEstoqueSaldo` (join/builder) para composição e filtro por tipo.

### 4.2 Motor de ciclos + motor de status único `[CONSTRUIR]` , peça central
Greenfield. Modelo de dados (Prisma):

| Tabela nova | Campos-chave | Papel |
|---|---|---|
| `ciclo` | `id`, `nome`, `dataInicio`, `dataFim`, `duracaoMeses`, `status` (ativo/fechado) | Definição do ciclo, duração **configurável** |
| `ciclo_previsao` | `cicloId`, `produtoId`, `quantidadePrevista` | Previsão importada por produto (B3) |
| `ciclo_status_config` | `produtoId` (ou `cicloId`+`produtoId`), `riscoDe/Ate`, `saudavelDe/Ate`, `acumuladoDe`, `unidade` (un/%) | Faixas de status **por produto** (B4) |
| `ciclo_fechamento` | `cicloId`, `dataCongelamento`, imutável | Cabeçalho do relatório congelado |
| `ciclo_fechamento_produto` | `cicloId`, `produtoId`, `estoqueInicial`, `entradas`, `previsto`, `consumido`, `saldo`, `statusFinal` | Recorte por produto congelado |
| `ciclo_fechamento_mes` | `cicloId`, `mes`, `estoque1o/UltimoDia`, `valor...`, `demanda...`, `disponivel...`, `aChegar`, `consumo` | Abertura/fechamento mensal |

- **Motor de status único (fonte única, backend):** `status(cobertura, config)` onde `cobertura ≤ 0 → ruptura` (RN fixa, nunca configurável); demais faixas de `ciclo_status_config`. A UI **pergunta** ao domínio, não reimplementa.
- **Cálculos canônicos:** `consumido` = faturado no período do ciclo (nota emitida, grão de item); `previsaoRestante = previsto − consumido` (**pode ser negativa**, sem piso); `cobertura = quantidade − previsaoRestante`; `acuracia = max(0, 100 − |real − previsto| / previsto × 100)`.

### 4.3 Importadores manuais (5) `[CONSTRUIR]` + `[CLIENTE]`
Cada um: tabela editável + tela de upload/edição + validação + log de linhas rejeitadas.
1. **Previsão de ciclo** → `ciclo_previsao`.
2. **Meta mensal de vendas** → `meta_venda_mensal` (`mes`, `empresaId?`, `vendedorId?`, `valor`).
3. **Plano de contas gerencial** → mapeamento de conta contábil → categoria gerencial de despesa.
4. **UF na despesa** → de-para/campo de UF por lançamento (ver DEP-3 do Financeiro).
5. **De-para CNPJ → grupo/construtora** → `cliente_grupo` (`documento`, `grupoNome`, `tipoRecorte`: grupo/Smart/Aztec/construtora).

### 4.4 Thresholds de status por produto `[CONSTRUIR]`
Pop-up "3 pontinhos" → `ciclo_status_config`. Input em unidade **ou** %, com conversão automática. Fonte única aplicada em ciclo ativo e no congelamento. Fallback: default global "a definir" ou reuso do estoque mínimo.

### 4.5 Snapshots novos `[CONSTRUIR]`
- **Fato de itens de compra:** "quantidade a chegar" é irreconstruível hoje (`fato_compra` só tem valores). Novo fato de itens de OC (`produtoId`, `quantidade`, `quantidadeEntregue`, `dataPrevista`).
- **Snapshot diário de demanda/OC:** o `FatoEstoqueSaldoSnapshot` só fotografa saldo. As colunas mensais do relatório fechado e a variação de 30 dias de demanda exigem novo snapshot diário de demanda/OC, populado por job (molde: `snapshot-estoque-diario.ts`).

### 4.6 Segmento do cliente `[ESTENDER]` + `[CLIENTE]`
`raw_sped_participante_segmento` existe como RAW; falta builder + coluna `segmento` em `FatoParceiro`. Confirmar por `SELECT` se vem preenchido antes de prometer composições por segmento (RN de risco).

---

## 5. Módulo 1 , ESTOQUE (atual + relatório de ciclos)

**Objetivo:** foto objetiva do estoque físico e a gestão por ciclos. Prioridade nº 1. Três telas sobre a mesma base de dados de estoque.

### 5.1 Tela , Estoque atual

**Base de query:** `diretoria/queries/estoque.ts` (1.243 linhas) `[ESTENDER]`.

**RF-1.1 , 12 indicadores de topo** (cada um com variação vs período anterior, **fixa em 30 dias** , RN-1.1):

| # | Indicador | Fórmula | Fonte | Status |
|---|-----------|---------|-------|--------|
| 1 | Valor total | Σ `quantidade × precoCusto` | `FatoEstoqueSaldo` × `FatoProduto.precoCusto` | [EXISTE] |
| 2 | Valor médio por local | valor total ÷ nº de locais | `FatoEstoqueLocal` | [EXISTE] |
| 3 | Ticket médio dos produtos | valor total ÷ nº de produtos | idem | [EXISTE] |
| 4 | Valor em demanda | Σ demanda × custo | `FatoPedidoItem.quantidadeAAtender` × custo | [ESTENDER] |
| 5 | Valor disponível | (saldo − demanda) × custo | idem | [ESTENDER] |
| 6 | Valor a chegar | Σ qtd a chegar × custo | **fato de itens de compra (4.5)** | [CONSTRUIR] |
| 7 | Quantidade total | Σ `quantidade` | `FatoEstoqueSaldo` | [EXISTE] |
| 8 | Quantidade média por local | qtd total ÷ nº locais | idem | [EXISTE] |
| 9 | Quantidade em demanda | Σ `quantidadeAAtender` | `FatoPedidoItem` | [EXISTE] |
| 10 | Quantidade disponível | saldo − demanda | idem | [ESTENDER] |
| 11 | Quantidade a chegar | Σ qtd OC pendente | **fato de itens de compra** | [CONSTRUIR] |
| 12 | Última atualização | `max(atualizadoEm)` | `FatoEstoqueSaldo.atualizadoEm` | [EXISTE] |

**RF-1.2 , Distribuição por local:** um card por local (Jarinu, Valinhos, Ceilândia, Vicente Pires, Sergipe): valor, % do valor total, % da quantidade total, ticket local, quantidade presente. Fonte `FatoEstoqueLocal` + `FatoEstoqueSaldo`.
**RF-1.3 , Composição** por **marca / linha / tipo** com **seletor único** que troca o ângulo no mesmo espaço; pizza preferencial, barra opcional. Fonte `FatoProduto` (marca/família/tipo `[EXISTE]`; **linha `[CONSTRUIR]`**).
**RF-1.4 , Seletor Geral × local específico:** recalcula composições e tabela só daquele local.
**RF-1.5 , Demanda × Disponível** em duas visões (quantidade e valor), sempre a **custo** (RN-1.2: estoque é custo).
**RF-1.6 , Tabela por produto:** colunas modelo, quantidade, quantidade em demanda, disponível (= saldo − demanda). Busca; filtros por local/marca/linha/tipo/status (zerado/negativo/positivo); **ordenação por clique de coluna** (asc/desc, A-Z).

**Regras:** RN-1.1 variação sempre 30 dias (via `FatoEstoqueSaldoSnapshot`); RN-1.2 valoração a custo; RN-1.3 `disponível = saldo − demanda`; RN-1.4 saldo negativo/zero fora dos agregados de valor mas visível na tabela.

**Critérios de aceite:** CA-1.1 soma de valor bate com a diretoria ao centavo; CA-1.2 as ~219 linhas negativas do cache aparecem no filtro "negativo"; CA-1.3 variação de 30 dias usa o mesmo filtro físico; CA-1.4 card 6/11 mostra "sem base" enquanto o fato de itens de compra não existir.

**Dependências:** DEP-1.1 atributo linha `[CLIENTE]`; DEP-1.2 fato de itens de compra `[CONSTRUIR]`; DEP-1.3 snapshot para variação de demanda `[CONSTRUIR]`.

**Delta do protótipo:** mostra a mais um mapa do Brasil por UF e card "% comprometido"; ordenação por coluna e variação real por snapshot ainda não existem no protótipo (mock).

### 5.2 Tela , Ciclo ativo

**Base:** motor de ciclos (4.2) + previsão (4.3) + thresholds (4.4).

**RF-1.7 , 8 indicadores:** ruptura prevista (nº), risco (nº), saudáveis (nº), acumulados (nº), previsto no ciclo (Σ `quantidadePrevista`), previsão restante (Σ), valor em risco (R$), valor em excesso (R$).
**RF-1.8 , Rosca de distribuição por status** com filtros local/marca/linha/tipo.
**RF-1.9 , Tabela de 10 colunas:** produto, quantidade, demanda, disponível, a chegar, previsão do ciclo, consumido no ciclo, previsão restante, cobertura de previsão, status.
**RF-1.10 , Drill:** clicar na fatia da rosca filtra a tabela para aquele status.
**RF-1.11 , Toggle** Estoque atual ↔ Ciclo ativo.

**Regras (motor de status único, 4.2):** RN-1.5 `ruptura ⟺ cobertura ≤ 0` (automático, não configurável); RN-1.6 risco/saudável/acumulado por `ciclo_status_config` **por produto**; RN-1.7 `consumido` = faturado no período (nota emitida); RN-1.8 `previsaoRestante = previsto − consumido` (pode ser negativa); RN-1.9 `cobertura = quantidade − previsaoRestante`.

**Vínculo do consumido:** `FatoNotaFiscal` + `FatoNotaFiscalItem` (nota emitida) cruzado com `FatoPedidoItem`, no intervalo `[ciclo.dataInicio, ciclo.dataFim]`.

**CA:** CA-1.5 produto com `cobertura ≤ 0` sempre "ruptura", independentemente da config; CA-1.6 soma dos status = total de produtos do ciclo; CA-1.7 `valorEmExcesso ≤ valorTotalEstoque` (invariante de sanidade).

**Delta do protótipo:** o protótipo **não** implementa faixas por produto (deriva risco/excesso em 10%/75%), consumido é mock, previsão restante tem piso 0 (errado), drill na fatia ausente. Tudo a construir de verdade.

### 5.3 Tela , Relatório de ciclos fechado

**Base:** `ciclo_fechamento*` (4.2, imutável) + snapshot diário de demanda/OC (4.5).

**RF-1.12 , 14 indicadores:** valor médio do estoque, maior/menor valor e variação, valor acumulado em excesso, valor em ruptura, quantidade média, demanda prevista total, demanda real, **acurácia da previsão** (= real/prevista), % em cada status (rompeu/risco/saudável/acumulado).
**RF-1.13 , Abertura/fechamento mês a mês:** 1º e último dia de cada mês do ciclo, com variação em quantidade, valor, demanda, disponível, a chegar e consumo. Fonte `ciclo_fechamento_mes`.
**RF-1.14 , Rosca por status com drill:** clicar lista os produtos daquele status com estoque inicial, entradas, previsão, consumido, saldo (RN-1.10: `saldo = estoqueInicial + entradas − consumido`).
**RF-1.15 , Comparativo ciclo atual × anterior** com **coluna de duração** (ciclos podem ter tamanhos diferentes).
**RF-1.16 , Acurácia previsto × real por produto.**
**RF-1.17 , Quadro de mudança de status entre ciclos** (melhorou/piorou/manteve).

**Regras:** RN-1.11 relatório **imutável** após congelamento na `dataFim`; RN-1.12 leitura sempre do congelado, nunca recalculada; RN-1.13 comparação entre ciclos de tamanhos diferentes sempre exibe a duração.

**CA:** CA-1.8 abrir um ciclo fechado dá sempre os mesmos números (imutabilidade); CA-1.9 acurácia geral = média ponderada das acurácias por produto; CA-1.10 paridade ativo↔fechado no instante do congelamento.

**Delta do protótipo:** entrega a mais visões "Por local / Por produto / Comparativo" e tabela "por grupo" (marca/linha/tipo); confirma toda a estrutura.

**Horas do módulo:** Estoque atual 32 + Ciclo ativo 30 + Ciclo fechado 40 = **102 h**.

---

## 6. Módulo 2 , VENDAS

**Objetivo:** painel comercial completo + comparação entre estados. Prioridade nº 2. Três telas.
**Base de query:** `diretoria/queries/vendas.ts` (511 linhas) + `reports/queries/comercial.ts` (932 linhas) `[ESTENDER]`.

### 6.1 Tela , Painel de vendas

**RF-2.1 , 6 indicadores de topo** (cada um com delta vs período anterior; filtro de período: hoje/semana/mês/ano/personalizado):

| # | Indicador | Fórmula | Fonte | Status |
|---|-----------|---------|-------|--------|
| 1 | Valor vendido | Σ `vrNf` de notas de venda externa | `FatoNotaFiscal` (`isVendaExterna=true`) | [EXISTE] |
| 2 | Pedidos fechados | contagem de pedidos concluídos | `FatoPedido` | [EXISTE] |
| 3 | Produtos vendidos | Σ `quantidade` | `FatoNotaFiscalItem` | [EXISTE] |
| 4 | Ticket médio geral | valor vendido ÷ pedidos | derivado | [EXISTE] |
| 5 | Margem média (ponderada) | Σ((faturado − custo))/Σ faturado | `FatoNotaFiscalItem` × `FatoProduto.precoCusto` | [ESTENDER] |
| 6 | Meta atingida | vendido ÷ meta do mês | `meta_venda_mensal` (4.3) | [CONSTRUIR] |

**RF-2.2 , Composição e margem (C2)** em **5 ângulos** com seletor único: linha, marca, tipo de cliente (segmento), forma de pagamento, CNPJ. Cada ângulo: valor, % do total, margem média praticada. Fonte `FatoNotaFiscalItem` + `FatoProduto` + `FatoParceiro` (segmento/CNPJ).
**RF-2.3 , Produtos vendidos por item:** modelo, linha, marca, quantidade, valor, % do faturamento; busca + ordenação.
**RF-2.4 , Condições de pagamento:** forma mais usada; **PMR** (prazo médio de recebimento); entrada média R$ e %; % com/sem entrada; distribuição de forma por tipo de cliente (stack). Fonte `FatoPedidoParcela`.
**RF-2.5 , Rankings:** por **estado** e por **vendedor** (UF/vendedor, valor, % do total, pedidos, produtos, ticket, margem, meta individual). Vendedor: `FatoPedido.vendedorId/vendedorNome` **[EXISTE]**.
**RF-2.6 , Curva ABC / Pareto:** classes A/B/C, faixas 80%/95% (configurável , RF-2.9), barras + linha acumulada, tabela por classe.
**RF-2.7 , Carteira a faturar:** vendido ainda não faturado, em unidades, pedidos e R$. Fonte `FatoPedido` sem nota vinculada.
**RF-2.8 , Recorte grupo/Smart/Aztec/construtora:** chaves que recalculam o painel; busca por construtora que reúne vários CNPJs. Fonte `cliente_grupo` (4.3).
**RF-2.9 , Curva ABC configurável** (10/20/30% do acumulado).

**Regras:** RN-2.1 faturamento = **nota emitida**, não pedido; RN-2.2 faturamento = venda externa (filtro `isVendaExterna`, não CFOP genérico , evita inflar ~74%); RN-2.3 margem = **bruta** (faturado − custo de catálogo), rotulada "praticada", nunca líquida; RN-2.4 meta importada mensal; RN-2.5 PMR = decidir entre "média das médias" (reunião) e "ponderado por valor" (protótipo) , **implementar as duas atrás de flag** (DEP-2.4); RN-2.6 segmento ≠ novo/recorrente.

**CA:** CA-2.1 valor vendido bate ao centavo com o número canônico do Agente Nex; CA-2.2 curva ABC nunca gera classe A vazia; CA-2.3 ranking por vendedor só conta pedidos com vendedor preenchido (com aviso do % coberto); CA-2.4 RBAC/UF-scoping respeitado.

**Dependências:** DEP-2.1 meta mensal `[CLIENTE]`; DEP-2.2 de-para CNPJ→grupo `[CONSTRUIR/CLIENTE]`; DEP-2.3 segmento do cliente `[ESTENDER/CLIENTE]` (bifurcação de risco); DEP-2.4 definição de PMR e de "pedido fechado" (`etapaFinaliza`).

### 6.2 Tela , Comparação geral de estados

**RF-2.10 , Tabela de todas as UFs:** UF, nº de vendedores, faturamento, margem, PMR, % da receita, ticket, nº de pedidos; ordenação por coluna; barras horizontais. Cada linha abre o comparativo A×B com aquela UF.
**RF-2.11 , 6 cards de destaque:** faturamento total, maior faturamento, maior margem, maior ticket, menor PMR, total de pedidos.
Fonte: `queryVendasPorUf` + `FatoParceiro.uf` **[EXISTE]** + agregações novas.

### 6.3 Tela , Comparativo estado A × B

**RF-2.12 , Dois estados, períodos independentes**, todos os indicadores espelhados com variação relativa (verde = melhor), composições, rankings de vendedor, itens vendidos e condições de pagamento espelhadas.
**Nota de esforço:** o protótipo entrega isto **enxuto** (3 métricas + pizza). A versão completa (7 indicadores + composições + rankings + itens + condições) é reconstrução, não porte.

**Horas do módulo:** Painel 34 + Comparação geral 16 + Comparativo A×B 22 + recorte grupo/construtora 6 = **78 h**.

---

## 7. Módulo 3 , FINANCEIRO por CNPJ

**Objetivo:** faturamento, gastos e resultado por empresa do grupo, com composição de despesas. Prioridade nº 4.
**Base de query:** `reports/queries/financeiro.ts` (463 linhas) `[ESTENDER]` , precisa de agregações novas por `empresaId` + categoria.

**RF-3.1 , Resumo consolidado (6 cards):** faturamento total do grupo, gastos totais, resultado consolidado, maior faturamento, maior gasto, melhor resultado.
**RF-3.2 , Bloco por empresa (6 CNPJs):** faturamento, gastos, resultado (= faturamento − gastos), % gasto/faturamento.
**RF-3.3 , Composição das despesas por categoria (rosca) com drill lateral:** ao clicar na categoria: total, % dos gastos, nº de lançamentos, barras por fornecedor, tabela despesa/fornecedor.
**RF-3.4 , Recorte por UF** das despesas; visão por CNPJ + UF.

| Métrica | Fórmula | Fonte | Status |
|---|---|---|---|
| Faturamento por empresa | Σ `vrNf` por `empresaId` | `FatoNotaFiscal` | [EXISTE] |
| Gasto por empresa | Σ `vrDocumento` a pagar por competência | `FatoFinanceiroTitulo` (tipo=pagar) | [EXISTE] |
| Composição por categoria | Σ despesa agrupada por categoria gerencial | `FatoFinanceiroLancamentoItem` + plano de contas | [CONSTRUIR] |
| Detalhe por fornecedor | Σ por `participanteId` dentro da categoria | `FatoFinanceiroLancamentoItem` + `FatoParceiro` | [ESTENDER] |
| Recorte por UF | despesa por UF | **UF na despesa (4.3)** | [CLIENTE] |

**Regras:** RN-3.1 usar `vrDocumento` (principal) nos dois lados card↔rosca (não deixar resíduo de juros/multa/desconto em "Não classificado"); RN-3.2 `empresaId ≠ DimEmpresaGrupo.odooId` (de-para deslocado , sanar antes de exibir CNPJ); RN-3.3 soma das fatias = card "Gastos" ao centavo (incluir balde "Não classificado"); RN-3.4 composição da **receita fica fora** (não há plano de contas de receita).

**CA:** CA-3.1 faturamento por empresa bate com a diretoria; CA-3.2 Σ categorias = card Gastos ao centavo; CA-3.3 CNPJ exibido é o real (de-para resolvido).

**Dependências (bloqueantes):** DEP-3.1 **plano de contas de despesa classificado** `[CLIENTE]` , sem ele, a rosca/drill caem em vazio; DEP-3.2 **campo UF na conta a pagar** `[CLIENTE]`; DEP-3.3 definição de qual nível do plano de contas é a "categoria" (evitar dezenas de fatias); DEP-3.4 decisão de intragrupo no consolidado (soma bruta vs eliminar intragrupo).

**Horas do módulo:** **36 h** (UI de baixo risco , protótipo funcional; custo real em dado/dependência e agregações novas).

---

## 8. Módulo 4 , DEMANDAS

**Objetivo:** carteira de pedidos ativos ainda não entregues, para organizar a entrega. Prioridade nº 5, escopo a refinar (B8 aberto).
**Base:** `diretoria/queries/pedidos.ts` + `diretoria/queries/entregas-parciais.ts` + `comercial.ts` `[ESTENDER]`. Reuso forte.

**RF-4.1 , B1 Resumo (8 indicadores):** valor pendente, pedidos abertos, pedidos atrasados, itens pendentes, ticket médio, demandas cobertas %, valor descoberto, valor atrasado.
**RF-4.2 , B2 Lista de pedidos pendentes:** agrupada por pedido , cliente, modelo, UF, prazo, status (aberto/atrasado), reserva, valor pendente; filtros abertos/atrasados/todos + busca.
**RF-4.3 , B7 Máquinas em estoque × demanda:** modelo, disponível, demanda, % em demanda.
**RF-4.4 , B5 Drill do pedido selecionado:** valor total, quantidade, % entregue (barra), % não entregue, prazo. É a entrega parcial na UI.
**RF-4.5 , B6 Visão geral:** valor total em pedidos ativos, quantidade, valor médio, pedido mais caro, rosca atrasados × no prazo.
**RF-4.6 , B4 Mapa de demandas por estado:** heatmap do Brasil clicável que filtra o B2.
**RF-4.7 , B8 Itens em pedidos ativos:** por modelo, entregues × a entregar × atrasados, com período próprio. **[A REFINAR]**.
**RF-4.8 , B9 Concentração de atrasos por produto:** ranking + Top 3 + % de concentração.

| Métrica | Fonte | Status |
|---|---|---|
| Whitelist de demanda em aberto | `FatoPedido.bucketDemanda = 'ABERTA'` (27 etapas curadas) | [EXISTE] |
| Entrega parcial (a atender/atendida) | `FatoPedidoItem.quantidadeAAtender/quantidadeAtendida` | [EXISTE] |
| Demanda por UF | `queryDemandasPorUf` + `FatoParceiro.uf` | [EXISTE] |
| Cobertura (estoque × demanda) | `FatoEstoqueSaldo` (não escopável por empresa/UF) | [EXISTE] |

**Regras:** RN-4.1 fonte única `FatoPedido.bucketDemanda` (whitelist de 27 etapas materializada no worker , erro contamina os 8 blocos); RN-4.2 janela especial `janelaDemandaAberta` (piso 2000, **imune ao corte de leitura**); RN-4.3 declarar a base (venda ou custo) com paridade obrigatória contra o Relatório de Entregas Parciais (Odoo relatório ID 28); RN-4.4 cobertura só íntegra no nível grupo (saldo sem `empresaId`).

**CA:** CA-4.1 números batem com o Relatório de Entregas Parciais; CA-4.2 clique no mapa filtra o B2 corretamente; CA-4.3 fallback de `quantidade` cheia quando o job de classificação está off.

**Dependências:** DEP-4.1 refinamento do B8 com o dono; DEP-4.2 semântica da "reserva" (persistir em banco por usuário?); DEP-4.3 whitelist de peças/consumidor final.

**Horas do módulo:** **40 h** (8 blocos + heatmap + filtro cruzado, com muito reuso de query).

---

## 9. Camada transversal (aplica a todos os módulos)

- **RBAC:** cada módulo/tela respeita perfil; UF-scoping onde aplicável.
- **Corte de dados:** toda query de histórico usa `getCorteDados`/`clampIsoAoCorte` (`src/lib/corte-dados.ts`), exceto demanda em aberto.
- **Comparação vs período anterior:** `janelaAnterior()` + `calcularDeltaKpi()` (delta up/down/flat) reusados em todos os KPIs com variação.
- **Frescor:** cada tela exibe `atualizado há Xs` (`max(atualizadoEm)`).
- **Design system:** reescrever os gráficos SVG do protótipo (donuts, Pareto, mapa do Brasil) nos componentes do projeto (violet `#7c3aed`, tokens semânticos, Lucide, zero emoji), não portar.
- **Performance:** agregações pesadas no servidor; busca no servidor (não fuzzy client-side como o protótipo).
- **Reconciliação E2E:** obrigatória por painel (seção 3.3).

---

## 10. Matriz de dependências do cliente (bloqueia entrega)

| Dependência | Módulo afetado | Sem ela… |
|---|---|---|
| Atributo **linha** cadastrado no Odoo | Estoque, Vendas | composição por linha cai em "Sem linha" |
| Atributo **tipo** cadastrado | Estoque, Vendas | composição por tipo indisponível |
| **Meta mensal** importada | Vendas | card "Meta atingida" vazio |
| **Previsão de ciclo** importada | Estoque/Ciclos | ciclo não calcula cobertura/status |
| **Plano de contas** de despesa classificado | Financeiro | rosca/drill de despesas vazios |
| **UF na conta a pagar** | Financeiro | recorte por UF indisponível |
| **Segmento** do cliente | Vendas | composição por segmento indisponível |
| **Nome do vendedor** no pedido | Vendas | ranking de vendedor confiável só "daqui pra frente" |
| **De-para CNPJ→grupo** | Vendas | recorte grupo/Smart/Aztec e busca por construtora indisponíveis |
| **Série temporal** (data de início) | Estoque, Ciclos | comparativos e colunas mensais só "daqui pra frente" |

---

## 11. Escopo opcional , fase futura (fora do âncora)

Features presentes no protótipo mas não pedidas para esta fase: comparativo de vendedores (18 h), comparativo de marcas (14 h), dashboard de compras detalhado por OC (22 h), lead time/giro por número de série (16 h), curva ABC configurável (6 h). Subtotal opcional **76 h**.

---

## 12. Estimativa e faseamento

**Cenário B , realista (a praticar), R$ 60/h:**

| Grupo | Horas | Custo |
|---|---:|---:|
| Camada base compartilhada | 160 | R$ 9.600 |
| Módulo 1 · Estoque (atual + ciclos) | 102 | R$ 6.120 |
| Módulo 2 · Vendas | 78 | R$ 4.680 |
| Módulo 3 · Financeiro | 36 | R$ 2.160 |
| Módulo 4 · Demandas | 40 | R$ 2.400 |
| Transversais (QA/E2E 60 + gestão/parametrização 44) | 104 | R$ 6.240 |
| **Total âncora** | **520** | **R$ 31.200** |
| Faixa otimista / conservadora | 420 / 640 | R$ 25.200 / R$ 38.400 |

**Cenário A , do zero (referência de reposição para o cliente):** ~1.100 h ≈ **R$ 66.000**.

**Ordem de entrega (incremental, painel a painel):**
1. Base parte 1 (linha, itens de compra, snapshot de demanda, esqueleto do motor de status).
2. **Estoque atual** (prioridade nº 1) , entrega isolada.
3. Base parte 2 (motor de ciclos, previsão, thresholds, snapshot de fechamento).
4. **Estoque , ciclo ativo + relatório fechado.**
5. **Vendas** (painel → comparação geral → A×B); importador de meta e de-para CNPJ.
6. **Financeiro** (quando plano de contas + UF na despesa existirem).
7. **Demandas** (por último; refinar B8 com o dono).
8. Transversais em paralelo: reconciliação E2E por painel, reuniões de parametrização, homologação.

---

## 13. Anexo , mapa de tabelas do cache por módulo

| Tabela (model Prisma) | Módulos que usam | Papel |
|---|---|---|
| `FatoEstoqueSaldo` | Estoque, Demandas | saldo atual, valor, marca/família |
| `FatoEstoqueLocal` | Estoque | hierarquia/classificação de locais |
| `FatoEstoqueSaldoSnapshot` | Estoque | série histórica diária (variação 30 dias) |
| `FatoProduto` | todos | catálogo, custo, marca/família/tipo (**linha a criar**) |
| `FatoNotaFiscal` / `FatoNotaFiscalItem` | Vendas, Ciclos, Financeiro | faturamento (nota emitida) |
| `FatoPedido` / `FatoPedidoItem` / `FatoPedidoParcela` | Vendas, Demandas, Ciclos | carteira, demanda, entrega parcial, PMR, vendedor |
| `FatoParceiro` | Vendas, Demandas, Financeiro | UF, segmento, CNPJ/grupo |
| `FatoFinanceiroTitulo` / `FatoFinanceiroMovimento` / `FatoFinanceiroLancamentoItem` | Financeiro | a pagar/receber, rateio, detalhe por conta |
| `FatoContaContabil` | Financeiro | plano de contas (contábil; gerencial a mapear) |
| `DimEmpresaGrupo` | Financeiro | empresas do grupo |
| **Tabelas novas** (`ciclo*`, `meta_venda_mensal`, `cliente_grupo`, fato de itens de compra, snapshot de demanda) | Base/Ciclos/Vendas | ver seção 4 |

---

*Fim do escopo técnico definitivo. Fonte única de engenharia para os 4 módulos. Conferência de estoque em documento próprio.*
