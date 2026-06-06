# DOSSIER ESTOQUE — Mapeamento completo do domínio para agente Nex

**Data:** 2026-06-06  
**Domínio:** Estoque (Inventário, Saldos, Movimentação, Carregamento)  
**Escopo:** Cache Postgres (tabelas raw_ e fato_); tools MCP semânticas; gaps de conhecimento

---

## 1. TABELAS E CAMPOS DISPONÍVEIS (raw_ e fato_)

### 1.1 Tabelas RAW (Espelho do Odoo via JSON-RPC)

Todas as tabelas raw_ armazenam `data` como JSON (Odoo puro, não desserializado).
Metadados: `odooId` (PK), `odooWriteDate`, `syncedAt`, `rawDeleted`.

#### RawEstoqueExtrato
- **Origem Odoo:** `estoque.extrato` (lançamentos de entrada/saída de estoque)
- **Propósito:** fonte bruta de movimentações (transações)
- **Campos-chave (no JSON `data`):**
  - `id` → odooId
  - `produto_id` (M2O) → código e nome do produto
  - `local_id` (M2O) → armazém/local
  - `data` → data da movimentação
  - `quantidade` → unidades movimentadas
  - `local_inverso_id` (M2O) → origem/destino (contrapartida)
  - `origem` → tipo de movimento (compra, devolução, ajuste, etc.)
  - `vr_saldo` → valor a custo
- **Uso:** rebuild de `FatoEstoqueMovimento` (série mensal entrada/saída)

#### RawEstoqueSaldo
- **Origem Odoo:** `estoque.saldo` (histórico de saldos acumulados por período)
- **Propósito:** Série histórica de saldos (snapshots)
- **Campos-chave:**
  - `id`, `produto_id`, `local_id`, `quantidade`, `unidade_id`, `vr_saldo`, `data`
- **Uso:** relatórios históricos (hoje desconsiderado; existe apenas para backward compatibility)

#### RawEstoqueSaldoHoje
- **Origem Odoo:** `estoque.saldo.hoje` (saldo do dia — snapshot atual)
- **Propósito:** saldo real de hoje, ponto de referência para análise
- **Campos-chave:**
  - `id`, `produto_id`, `local_id`, `quantidade`, `unidade_id`, `vr_saldo`
- **Uso:** rebuild de `FatoEstoqueSaldo` (saldo corrente por produto+local)

#### RawEstoqueSaldoHojeDuracaoDias
- **Origem Odoo:** `estoque.saldo.hoje.duracao_dias` (tempo de imobilização do item)
- **Propósito:** Adiciona ao saldo de hoje um cálculo de dias parado (dias desde última movimentação)
- **Campos-chave:**
  - `id`, `saldo_hoje_id` (FK), `duracao_dias` (int)
- **Uso:** Identifica produtos parados; rebuild de `FatoProdutoParado`

#### RawEstoqueLocal
- **Origem Odoo:** `estoque.local` (mestre de armazéns/locais de estoque)
- **Propósito:** Cadastro de locais (warehouse, zona, corredor, prateleira)
- **Campos-chave:**
  - `id`, `nome`, `empresa_id` (M2O), `codigo`
- **Nota:** Hierarquia possível (local_pai para estrutura); não totalmente explorada

#### RawEstoqueExtratoRastreabilidade, RawEstoqueSaldoRastreabilidade, RawEstoqueSaldoRastreabilidadeHoje
- **Origem Odoo:** Modelos `*_rastreabilidade` (rastreamento por lote/série)
- **Propósito:** Saldo/movimento por lote ou série do produto
- **Status hoje:** Pouco explorado; estrutura conhecida mas sem tools específicas
- **Uso futuro:** Rastreabilidade e auditoria de lotes

#### RawEstoqueMinimoMaximo
- **Origem Odoo:** `estoque.minimo.maximo` (parâmetros de reabastecimento)
- **Propósito:** Define limites de saldo mínimo e máximo por produto+local
- **Campos-chave:**
  - `id`, `produto_id`, `local_id`, `unidade_id`, `quantidade_minima`, `quantidade_maxima`
- **Uso:** rebuild de `FatoEstoqueMinMax` (alertas de reabastecimento)

---

### 1.2 Tabelas FATO (Derivadas, modeladas para consulta)

#### FatoEstoqueSaldo
- **PK:** `id` (UUID); **UNIQUE:** `odooSaldoId` (int)
- **Campos de negócio:**
  - `produtoId`, `produtoNome` → identificação do produto
  - `localId`, `localNome` → identificação do armazém/local
  - `quantidade` (Decimal 18,4) → saldo em unidades
  - `vrSaldo` (Decimal 18,2) → valor a preço de custo
  - `unidade` → unidade de medida
  - `familiaId`, `familiaNome` → classificação de família
  - `marcaId`, `marcaNome` → marca do produto
  - `atualizadoEm` (DateTime) → timestamp do último snapshot
- **Índices:** `produtoId`, `localId`, `familiaId`, `marcaId`
- **Semântica:** Um registro = **um produto em um local**. Saldo + valor a custo. É o snapshot atual do inventário.
- **Frequência de atualização:** Rebuild completo 3-5 vezes por dia (cron)
- **Garantias:**
  - Sem registros duplicados (UNIQUE odooSaldoId)
  - Sem registros com `produtoId = NULL` (filtro no builder)
  - `quantidade` pode ser 0 (saldo zero com linha = produto cadastrado) ou NULL (dados Odoo incompletos)
  - `vrSaldo < 0` é válido (produto em débito no local)

#### FatoEstoqueMovimento
- **PK:** `odooId` (int)
- **Campos de negócio:**
  - `produtoId`, `produtoNome` → qual produto se movimentou
  - `localId`, `localNome` → para qual local
  - `data` (DateTime) → quando aconteceu
  - `mes` (String "YYYY-MM") → bucket mensal agregado
  - `quantidade` (Decimal 18,4) → unidades (positivo = entrada, negativo = saída)
  - `sentido` (String: "entrada", "saída", "neutro") → classificação do movimento
  - `localInversoId` → local de origem/destino (contrapartida)
  - `origem` → tipo do movimento (compra, devolução, ajuste, transf. inter-armazém, etc.)
- **Índices:** `mes`, `produtoId`, `localId`, `sentido`
- **Semântica:** Um registro = **um lançamento** de entrada ou saída. Série histórica de movimentações.
- **Frequência de atualização:** Rebuild completo (recria tabela inteira) quando raw_estoque_extrato muda
- **Garantias:**
  - Apenas registros com `quantidade != 0` são inclusos (filtro `temEfeito()`)
  - Data inválida → linha descartada (IM-02: descarta `NaN-NaN` de bucket)
  - `sentido = "neutro"` é mantido no raw mas filtrado no fato

#### FatoEstoqueMinMax
- **PK:** `odooId` (int)
- **Campos de negócio:**
  - `produtoId`, `produtoNome` → qual produto
  - `localId`, `localNome` → em qual local
  - `unidadeNome` → unidade do mínimo/máximo
  - `quantidadeMinima`, `quantidadeMaxima` (Decimal 18,3) → limites de reabastecimento
  - `atualizadoEm` → timestamp
- **Índices:** `produtoId`, `localId`
- **Semântica:** Define os limiares de reabastecimento. Atualmente **0 registros** (não operado no Odoo).
- **Frequência:** Rebuild quando raw_estoque_minimo_maximo muda
- **Aviso:** Com 0 linhas, tool correspondente é honesta ("mín/máx não cadastrado")

#### FatoProdutoParado (Derivado de raw_estoque_saldo_hoje_duracao_dias + join)
- **PK:** `saldoHojeId` (int FK)
- **Campos de negócio:**
  - `produtoId`, `produtoNome`, `localId`, `localNome`
  - `saldo` (Decimal 18,4) → unidades paradas
  - `dias` (int) → dias sem movimento
  - `vrSaldo` (Decimal 18,2) → capital imobilizado em R$
  - `unidade` → unidade de medida
- **Semântica:** Produto com saldo > 0 e sem movimento por `dias`. Identifica imobilizações.
- **Critério:** `dias >= X` (threshold a ser definido; hoje pode ser 30, 60, 90)
- **Nota:** Builder não está no código visto; precisa ser validado se é construído automaticamente ou sob demanda

---

## 2. TOOLS EXISTENTES E O QUE CADA UMA RESPONDE HOJE

### 2.1 Catálogo de 9 tools semânticas (F4 Onda 1, B-waves)

| ID | Nome amigável | O que responde | Filtros principais | Status |
|---|---|---|---|---|
| `estoque_saldo_produto` | Saldo por produto | Quantidade e valor por produto em estoque hoje | `armazemId`, `familiaId`, `termo` (busca por nome/código) | [OK] |
| `estoque_valor_armazem` | Valor por armazém | Valor total de estoque (custo) quebrado por armazém | Sem filtros (snapshot) | [OK] |
| `estoque_entradas_saidas` | Série mensal | Total de entrada/saída por mês (série histórica) | `periodoDe`, `periodoAte`, `armazemId` | [OK] |
| `estoque_top_movimentados` | Top 20 movimentados | Produtos com maior volume/valor movimentado em período | `periodoDe`, `periodoAte`, `armazemId` | [OK] |
| `estoque_produtos_parados` | Parados (saldo > 0, sem movimento) | Produtos com saldo positivo e imobilizados há X dias | `dias` (threshold), `armazemId`, `familiaId` | [OK] |
| `estoque_concentracao` | Concentração A/B/C | % do valor de estoque concentrado em família/marca (Pareto) | `armazemId`, `tipo` (familia\|marca) | [OK] |
| `estoque_produtos_saldo_zero` | Saldo zero | Produtos que estão zerados (quantidade=0) hoje | `armazemId`, `familiaId` | [OK] |
| `estoque_locais_por_produto` | Localizações de um produto | Quantos armazéns/locais possuem um produto; saldos por local | `produtoId`, `produtoTermo` (busca) | [OK] |
| `estoque_minimo_maximo` | Mín/máx cadastrados | Lista parâmetros mín/máx de reabastecimento (hoje count=0) | Sem filtros | [OK] honesta (0 reg) |

#### Detalhes das tools por categoria

**Saldo / Posição:**
- `estoque_saldo_produto`: Lista todos produtos com saldo >0 ou com linha de saldo. KPIs: total produtos, valor total, produtos negativos. Paginação. Ambiguidade para buscas (>1 match).
- `estoque_valor_armazem`: Agregação por local de armazenagem. KPIs: valor total, número de armazéns. Sem paginação.
- `estoque_locais_por_produto`: Detalhe por local para um produto. Permite drill-down.

**Movimentação / Dinâmica:**
- `estoque_entradas_saidas`: Série mensal. Entrada total vs saída total por mês. Para análise de fluxo.
- `estoque_top_movimentados`: Top 20 produtos mais movimentados (volume ou valor).

**Inteligência / Alertas:**
- `estoque_produtos_parados`: Produtos "vivos" (saldo >0) mas imobilizados. Capex em risco.
- `estoque_concentracao`: Curva A/B/C (80/20). Identifica produtos que dominam valor.
- `estoque_produtos_saldo_zero`: Exatos zerados hoje.

**Reabastecimento (Estrutural):**
- `estoque_minimo_maximo`: Mínimos e máximos cadastrados (hoje 0, sem operação).

---

### 2.2 Enriquecimento de respostas (Onda 1.C/1.D)

Todas as tools aplicam:
- **Envelope canônico:** estado (preparando/ok/vazio), dados, atualizadoEm, atualizadoHa, fonteStatus
- **KPIs de topo:** Resumo executivo (total, contagem, alertas)
- **Ambiguidade:** Quando busca por termo retorna >1 candidato, sinaliza ao agente para perguntar
- **Desambiguação numérica (A9):** Códigos longos (>=7 dígitos) exigem match exato (evita "Você quer este similar?")
- **Humanização:** Nomes de produtos convertidos de CAIXA ALTA para Title Case
- **Paginação (Alavanca 2b):** Quando dataset >10k linhas, pagina com offset/limit (KPIs e ambiguidade sobre o conjunto todo)
- **Topiques secundários:** Quando não há filtro, gera "topMaiores" (ex: top 10 produtos por saldo)

---

## 3. CATÁLOGO EXAUSTIVO DE PERGUNTAS (25+)

### Convenção de marcação
- **[OK]** = Tool existente responde completamente
- **[PARCIAL]** = Tool responde em parte; falta X
- **[GAP]** = Não há tool; precisaria Y

---

### 3.1 SALDO E POSIÇÃO

**Pergunta 1:** "Qual o saldo total de estoque hoje (em unidades e valor R$)?"  
**Status:** [OK] — `estoque_valor_armazem` retorna `kpis.valorTotal`; saldo unitário agregado em `estoque_saldo_produto` (sem filtro)

**Pergunta 2:** "Qual o saldo do produto X hoje?"  
**Status:** [OK] — `estoque_saldo_produto` com `termo=X`; retorna quantidade total, valor, número de locais

**Pergunta 3:** "Qual o saldo de um produto em um armazém específico (Armazém A / Zona B / etc.)?"  
**Status:** [OK] — `estoque_saldo_produto` com `armazemId=X` + `termo=Y` (duplo filtro); alternativa: `estoque_locais_por_produto` com `produtoId`

**Pergunta 4:** "Qual produtos estão em mais de um armazém?"  
**Status:** [GAP] — Não há tool. Semântica: `SELECT produtoId WHERE COUNT(DISTINCT localId) > 1`. Precisaria de nova tool `estoque_produtos_multi_local` ou aceitar que o agente use `estoque_saldo_produto` (sem filtro) e analisa numLocais na resposta (workaround).

**Pergunta 5:** "Qual a concentração de valor do estoque (80% do valor vem de quantos produtos)?"  
**Status:** [OK] — `estoque_concentracao` com `tipo=familia` (ou marca); retorna % acumulado

**Pergunta 6:** "Qual o estoque de matéria-prima vs produto acabado?"  
**Status:** [PARCIAL] — Fato não tem coluna de `tipo_produto` (matéria-prima/acabado/etc.). Teria que usar `familiaId` como proxy. **GAP:** precisa coluna categoria de produto no fato.

**Pergunta 7:** "Qual é o valor do estoque parado (não movimentado há 60 dias)?"  
**Status:** [OK] — `estoque_produtos_parados` com `dias=60` retorna saldo + valor por produto

**Pergunta 8:** "Produtos com saldo negativo?"  
**Status:** [PARCIAL] — `estoque_saldo_produto` retorna `kpis.produtosNegativos` (count). Detalhes? Fato permite vrSaldo < 0, mas não há filtro específico. **GAP:** precisaria de `estoque_saldo_negativo` ou filtro de saldo <0.

**Pergunta 9:** "Qual produto é mais caro em custo (maior VR por unidade)?"  
**Status:** [PARCIAL] — Fato tem `vrSaldo` (valor total) mas não `custo_unitario`. Precisaria de JOIN com fato_produto (se tiver custo). **GAP:** calcular custo unitário e adicionar ao fato.

---

### 3.2 MOVIMENTAÇÃO

**Pergunta 10:** "Qual foi a entrada e saída totais de estoque no mês de X?"  
**Status:** [OK] — `estoque_entradas_saidas` com `periodoDe` e `periodoAte`; retorna série mensal com entrada/saída por mês

**Pergunta 11:** "Qual a série de entradas/saídas dos últimos 12 meses?"  
**Status:** [OK] — `estoque_entradas_saidas` sem filtro (ou com período customizado); retorna série de 12 meses

**Pergunta 12:** "Qual produto foi mais movimentado em volume (unidades) no período X-Y?"  
**Status:** [OK] — `estoque_top_movimentados` retorna top 20 por volume; filtro por período e armazém

**Pergunta 13:** "Qual produto foi mais movimentado em valor (R$) no período X-Y?"  
**Status:** [OK] — `estoque_top_movimentados` retorna top 20 também por valor (ambos no output)

**Pergunta 14:** "Qual foi a saída de produto X no mês Y?"  
**Status:** [GAP] — Não há tool por produto específico. `estoque_entradas_saidas` e `estoque_top_movimentados` são agregadas. Precisaria de `estoque_movimento_produto` que detalha entradas/saídas de um produto ao longo do tempo.

**Pergunta 15:** "Qual o nível de rotação de estoque (turnover) por produto ou categoria?"  
**Status:** [PARCIAL] — Fato tem movimento e saldo, mas não há cálculo de turnover (saída anual / saldo médio). Precisaria de builder+tool nova.

**Pergunta 16:** "Qual produto entrou mais vezes no período (frequência de entradas)?"  
**Status:** [GAP] — Fato não marca número de transações por produto, apenas quantidades. Precisaria de `COUNT(DISTINCT data)` por produto.

---

### 3.3 CARREGAMENTO / EXPEDIÇÃO

**Pergunta 17:** "Qual é o status de carregamento de um pedido / remessa?"  
**Status:** [GAP] — Domínio Estoque não cobre remessas ou pedidos. Isso é **Comercial** (pedido_documento) ou **Fiscal** (sped_documento). Precisaria de cross-domain.

**Pergunta 18:** "Quantos itens já foram carregados no caminhão X?"  
**Status:** [GAP] — Precisaria de modelo WMS (wms.operacao, wms.documento). Modelo existe no Odoo mas tem 0 registros. Estrutural (não operado).

**Pergunta 19:** "Qual é o peso/volume total de estoque?"  
**Status:** [GAP] — Fato não tem dimensões (peso, volume). Precisaria de coluna nova em fato_estoque_saldo derivada de fato_produto.

---

### 3.4 ALERTAS E OTIMIZAÇÃO

**Pergunta 20:** "Produtos com saldo abaixo do mínimo cadastrado?"  
**Status:** [PARCIAL] — Existe `estoque_minimo_maximo` que lista os mínimos. Mas com 0 linhas cadastradas, não há o que comparar. Quando min/max for operado: cruzamento de saldo (fato_estoque_saldo) vs mín/máx (fato_estoque_minmax). Precisaria de nova tool `estoque_abaixo_minimo` que faz o JOIN.

**Pergunta 21:** "Produtos com saldo acima do máximo?"  
**Status:** [PARCIAL] — Mesmo que pergunta 20. Tool nova: `estoque_acima_maximo`.

**Pergunta 22:** "Produtos sem movimento há 90 dias?"  
**Status:** [OK] — `estoque_produtos_parados` com `dias=90`

**Pergunta 23:** "Qual é o estoque em risco (antiga, baixo giro, grande capex)?"  
**Status:** [PARCIAL] — Combinação de `estoque_produtos_parados` + `estoque_concentracao`. Não há métrica única; agente tem que sintetizar.

**Pergunta 24:** "Qual é o valor de estoque obsoleto?"  
**Status:** [GAP] — Fato não tem status de obsolescência. Precisaria de coluna em fato_produto ou novo campo em fato_estoque_saldo.

**Pergunta 25:** "Estoque por empresa (quando há múltiplas empresas)"  
**Status:** [PARCIAL] — Fato não tem `empresaId`. Mas `localNome` pode conter identificador de empresa. Precisaria de desnormalização (de `raw_res_company` + `raw_estoque_local`).

---

### 3.5 CROSS-DOMAIN (Não responde só estoque)

**Pergunta 26:** "Qual é o custo médio do estoque em relação ao faturamento?"  
**Status:** [GAP, cross-domain] — Estoque (valor de custo) vs Financeiro (faturamento). Precisaria de tool que agrega dois domínios.

**Pergunta 27:** "Qual é o período médio de estoque (quanto tempo um produto fica parado)?"  
**Status:** [PARCIAL] — `estoque_produtos_parados` dá dias; seria uma agregação (média/mediana dos dias).

---

### 3.6 SUMÁRIO DE GAPS PRINCIPAIS

**Total de perguntas catalogadas:** 27  
**[OK] (tool completa):** 12  
**[PARCIAL] (workaround ou parcial):** 12  
**[GAP] (nenhuma resposta):** 3  

---

## 4. MÉTRICAS CANÔNICAS A FORMALIZAR

Cada métrica precisa de **definição exata, fonte, agregação, períodos suportados, ambiguidades**.

### 4.1 SALDO

**Métrica:** `SALDO_TOTAL_UNIDADES`  
**Definição:** Soma de todas as quantidades em `fato_estoque_saldo` para uma seleção de produtos+locais.  
**Fórmula:** `SUM(quantidade)` onde `rawDeleted=false` (builder)  
**Agregação:**
- Por nada (global): soma todos produtos + todos locais
- Por local: `GROUP BY localId`
- Por produto: `GROUP BY produtoId`
- Por família: `GROUP BY familiaId`
- Por marca: `GROUP BY marcaId`

**Período:** Não aplica (é snapshot). Mas pode-se marcar timestamp de quando foi calculado (`atualizadoEm`).  
**Ambiguidades:**
- Produtos com `quantidade = NULL` (dados incompletos Odoo) → excluir ou contar como 0?
- Produtos com quantidade 0 → incluir na contagem de produtos? (Sim: "cadastrado, saldo zero".)
- Produtos em múltiplos locais → agrupar tudo? (Sim: conceito de "saldo total" é soma de todos os locais.)

---

**Métrica:** `SALDO_TOTAL_VALOR`  
**Definição:** Soma de `vrSaldo` (valor a preço de custo).  
**Fórmula:** `SUM(vrSaldo)` onde `rawDeleted=false`  
**Agregação:** Mesmas que SALDO_TOTAL_UNIDADES  
**Período:** Snapshot (`atualizadoEm`).  
**Ambiguidades:**
- `vrSaldo < 0` é válido (débito)? Sim, produto em "débito" no local. Mantém no cálculo de soma.
- Qual moeda? Sempre R$ (BRL), não há multimoeda no Odoo dessa Matrix.

---

**Métrica:** `SALDO_PRODUTO_X_LOCAL_Y`  
**Definição:** Quantidade de um produto específico em um local específico.  
**Fórmula:** `SELECT quantidade FROM fato_estoque_saldo WHERE produtoId = X AND localId = Y`  
**Período:** Snapshot.  
**Ambiguidades:**
- Produto não existe no local → retorna `NULL` (ausência de linha) ou 0? (Hoje: ausência de linha; é exato.)

---

**Métrica:** `PRODUTOS_NEGATIVOS_COUNT`  
**Definição:** Quantidade de produtos com saldo < 0 (débito).  
**Fórmula:** `COUNT(DISTINCT produtoId) WHERE quantidade < 0`  
**Período:** Snapshot.

---

### 4.2 MOVIMENTAÇÃO

**Métrica:** `ENTRADAS_PERIODO`  
**Definição:** Total de unidades que entraram no estoque em um período [de, até].  
**Fórmula:** `SUM(quantidade) WHERE sentido='entrada' AND data BETWEEN de AND até`  
**Agregação:**
- Global (todas as entradas)
- Por mês: `GROUP BY mes` (string "YYYY-MM")
- Por local: `GROUP BY localId`
- Por produto: `GROUP BY produtoId`

**Período:** Requerido [periodoDe, periodoAte]. Padrão: últimos 12 meses.  
**Ambiguidades:**
- Qual é a hora de corte? Meia-noite? (Padrão: 00:00 UTC no banco).
- Entradas de ajuste ou transferência inter-local contam? Sim, se `origem` disser algo.

---

**Métrica:** `SAIDAS_PERIODO`  
**Definição:** Total de unidades que saíram em um período (negativo em quantidade).  
**Fórmula:** `SUM(ABS(quantidade)) WHERE sentido='saida' AND data BETWEEN de AND até` (ou `SUM(quantidade * -1)`)  
**Agregação:** Mesmas que ENTRADAS_PERIODO.  
**Período:** Requerido.

---

**Métrica:** `SALDO_LIQUIDO_PERIODO`  
**Definição:** Mudança líquida no estoque = Entradas - Saídas em [de, até].  
**Fórmula:** `ENTRADAS_PERIODO - SAIDAS_PERIODO`  
**Período:** Requerido.

---

**Métrica:** `TURNOVER_ANUAL` (Opcional, derivada)  
**Definição:** Quantas vezes o estoque "virou" em um ano. = Custo de Mercadorias Vendidas (COGS) / Saldo Médio.  
**Status:** GAP — Fato não tem COGS; seria cross-domain com Financeiro.

---

### 4.3 CONCENTRAÇÃO

**Métrica:** `CONCENTRACAO_A_B_C_FAMILIA`  
**Definição:** Curva de Pareto da família. Qual % de produtos concentra qual % do valor.  
**Fórmula:**
1. `SELECT familiaId, SUM(vrSaldo) as valor FROM fato_estoque_saldo GROUP BY familiaId ORDER BY valor DESC`
2. Calcula valor acumulado % para cada família.
3. Classifica: A = Top X% (ex: 80%), B = próximo Y% (ex: 15%), C = resto (ex: 5%).

**Período:** Snapshot.  
**Ambiguidades:**
- Qual é o limiar exato de A/B/C? (Padrão: 80-15-5, mas pode variar. Deve ser parametrizável.)
- Produtos com `vrSaldo = 0` contam? Sim, vão para "C" (baixo valor).

---

### 4.4 ALERTAS

**Métrica:** `PRODUTOS_PARADOS_DIAS_X`  
**Definição:** Produtos com saldo > 0 e sem movimento há >= X dias.  
**Fórmula:** 
```
SELECT produtoId, saldo, dias, vrSaldo 
FROM fato_produto_parado 
WHERE dias >= X AND saldo > 0
```

**Período:** Snapshot (hoje). Histórico via série de snapshots.  
**Ambiguidades:**
- Como se calcula "dias"? (Data de hoje - data do último movimento em `raw_estoque_saldo_hoje_duracao_dias`.)
- Um produto é "parado" mesmo que tenha saldo 0? (Não; parado = saldo >0 + sem movimento.)

---

**Métrica:** `SALDO_ABAIXO_MINIMO_OPERACAO` (Futuro, quando min/max for operado)  
**Definição:** Produtos com `saldo < quantidade_minima` em um local.  
**Fórmula:**
```
SELECT s.produtoId, s.localId, s.quantidade, m.quantidadeMinima 
FROM fato_estoque_saldo s 
LEFT JOIN fato_estoque_minmax m ON s.produtoId = m.produtoId AND s.localId = m.localId
WHERE s.quantidade < m.quantidadeMinima
```

**Período:** Snapshot.  
**Operação:** Não há dados hoje (0 linhas em fato_estoque_minmax).

---

### 4.5 SUMÁRIO DE MÉTRICAS

**Métricas operacionais (implementadas):**
1. SALDO_TOTAL_UNIDADES
2. SALDO_TOTAL_VALOR
3. SALDO_PRODUTO_X_LOCAL_Y
4. PRODUTOS_NEGATIVOS_COUNT
5. ENTRADAS_PERIODO
6. SAIDAS_PERIODO
7. SALDO_LIQUIDO_PERIODO
8. CONCENTRACAO_A_B_C_FAMILIA
9. CONCENTRACAO_A_B_C_MARCA
10. PRODUTOS_PARADOS_DIAS_X

**Métricas futuras (estruturais/GAPs):**
11. TURNOVER_ANUAL (cross-domain)
12. SALDO_ABAIXO_MINIMO (quando min/max operado)
13. SALDO_ACIMA_MAXIMO (quando min/max operado)
14. VALOR_ESTOQUE_OBSOLETO (precisa coluna status)
15. PESO_TOTAL_ESTOQUE (precisa dimensões em fato_produto)

---

## 5. COMBINAÇÕES CRUZADAS COM OUTROS DOMÍNIOS

### Domínios relacionados:
1. **Comercial** (Pedidos): `pedido_documento` com items de pedido. Relação: um item de pedido pode reservar estoque. **GAP:** fato de estoque não marca reservas/promessas.

2. **Fiscal** (SPED): `sped_documento` (notas fiscais). Relação: nota de saída consome estoque. **Possível:** cruzar nota fiscal emitida (data) com movimento de saída (data) para validar consistência.

3. **Financeiro**: `finan_lancamento` (títulos) + `finan_fluxo_caixa`. Relação: recebimento/pagamento vs estoque (COGS, compra de insumos). **GAP, complexo:** calcular valor de estoque em termos de fluxo de caixa.

4. **Cadastros**: `res_company` (empresas) + `res_partner` (fornecedores/clientes). Relação: em qual empresa está o estoque? Quem é o fornecedor de um produto? **PARCIAL:** fato não tem `empresaId` ou `fornecedorId`.

---

### Exemplos de perguntas cross-domain:

**P28:** "Qual é o valor de estoque comprometido com pedidos em aberto?"  
**Cross:** Comercial (pedido_documento) × Estoque (saldo)  
**Status:** [GAP] — Precisaria de novo campo em pedido ou novo fato de "reservas".

**P29:** "Qual é o estoque de um fornecedor X?"  
**Cross:** Cadastro (res_partner como fornecedor) × Estoque (produtoId) × Comercial (origem da compra)  
**Status:** [GAP] — fato_estoque_saldo não marca fornecedor de origem.

**P30:** "Qual é a data esperada de saída de um produto em um pedido?"  
**Cross:** Comercial (pedido_documento + data prometida) × Estoque (disponibilidade)  
**Status:** [GAP] — Domínio Comercial, não estoque.

---

## 6. ARMADILHAS DE DADO

### 6.1 Campos que enganam

**Armadilha A1: `vrSaldo` pode ser negativo e isso é correto**  
- Significa que o produto "deve" quantidade ao local (débito de estoque).
- Em uma soma global, pode haver compensação (alguns locais devem, outros têm).
- Não é "erro", é operação normal de ajuste.

**Armadilha A2: `quantidade = NULL` vs `quantidade = 0`**  
- `NULL` = Odoo não preencheu (dados incompletos).
- `0` = Saldo real é zero (produto cadastrado, sem unidades).
- Builder filtra linhas com `produtoId = NULL` mas mantém `quantidade = 0`.

**Armadilha A3: Produto existe em fato_produto mas não em fato_estoque_saldo**  
- Significa: cadastro de produtos (fato_produto) ≠ produtos com saldo (fato_estoque_saldo).
- Pode acontecer se o produto foi criado mas nunca recebeu estoque ou o saldo foi zerado.
- Tool `estoque_saldo_produto` com `termo=X` pode retornar "semEstoqueCadastrado: true" para esses.

**Armadilha A4: `mes` como bucket "YYYY-MM" ignora dias**  
- Agregação por mês esconde padrões dentro do mês (picos no início, cauda lenta).
- Para análise diária, precisaria decompor a série (hoje não há tool de granularidade diária).

**Armadilha A5: `localId` pode ser zona, prateleira, ou pallet (hierarquia não clara)**  
- `raw_estoque_local` tem conceito de `local_pai` (hierarquia), mas fato não desnormaliza.
- Limpar nome com `limparNomeLocal()` ajuda, mas não substitui estrutura clara.

---

### 6.2 Status que confundem

**Confusão C1: `sentido` de movimento é "entrada/saída/neutro", não natureza de origem**  
- "Entrada" = quantidade > 0 (compra, devolução, ajuste positivo, transf. de outro local — tudo isso é "+")
- "Saída" = quantidade < 0 (venda, perda, ajuste negativo)
- "Origem" diferencia (compra vs ajuste) mas não é separado; é campo de contexto.
- **Consequência:** "Qual foi a entrada de compra?" requer analisar `origem`, não só `sentido`.

**Confusão C2: `atualizadoEm` vs `syncedAt` vs `data`**  
- `atualizadoEm` = quando o fato foi recalculado (timestamp do build).
- `syncedAt` = quando a linha foi sincronizada do Odoo.
- `data` (em movimento) = quando a movimentação de verdade aconteceu no negócio.
- Para histórico, usar `data`; para "quando temos resposta mais fresca", usar `atualizadoEm`.

**Confusão C3: Saldo "hoje" vs saldo histórico**  
- Tabelas:
  - `raw_estoque_saldo` = série histórica (snapshots de períodos passados).
  - `raw_estoque_saldo_hoje` = snapshot **de hoje** (atualizado 3-5× por dia).
  - `fato_estoque_saldo` = derivado de `raw_estoque_saldo_hoje` (sempre "hoje").
- Se pergunta "Qual era o saldo em 2026-05-15?", não há resposta (tabela histórica descontinuada).

---

### 6.3 JOINs que duplicam

**Armadilha J1: fato_estoque_saldo × fato_estoque_movimento (sem normalizar chaves)**  
- `fato_estoque_saldo` tem `(produtoId, localId)` como grain (uma linha por produto×local).
- `fato_estoque_movimento` tem `odooId` como PK e `(produtoId, localId)` como FK lógico.
- Se juntar sem `DISTINCT`, uma linha de saldo vira N linhas (N = número de movimentos nesse local).
- **Caso de uso comum:** "Qual o saldo de produto X hoje vs entradas/saídas de X no mês?"
  - Solução: subquery/agregação em separado, não JOIN direto.

**Armadilha J2: fato_estoque_minmax × fato_estoque_saldo (m:1 ou m:0)**  
- Min/max é opcional (hoje 0 linhas).
- Se fizer LEFT JOIN saldo → minmax, >90% de linhas de saldo terão NULL minmax (0 registros cadastrados).
- Pode parecer que "maioria dos produtos está acima/abaixo do mínimo" quando na verdade "minmax não está operado".

---

### 6.4 Comportamentos counterintuitive

**Comportamento B1: "Estoque parado" com saldo positivo pode estar rodando (não é lixo)**  
- Produto com saldo >0 e 180 dias sem movimento pode ser: item de grande valor que vende 1× ao ano, ou é imobilização real.
- Sem contexto de demanda/venda, não é alertável automaticamente.

**Comportamento B2: Produtos zerados com movimentos recentes**  
- Produto com saldo = 0 mas último movimento foi hoje → saiu na hora (venda).
- Não é "parado"; é "dinâmico, zerado".

**Comportamento B3: Valor total pode ser <0 (global) em caso de devoluções massivas**  
- Se houve devolução de produto com VR > 0 registrada negativamente no saldo.
- Raro, mas possível em dados de Odoo bugados.

---

## 7. RESUMO EXECUTIVO DE GAPS E PRÓXIMOS PASSOS

### 7.1 Top 5 Gaps de maior impacto

1. **[GAP-1] Fato sem `empresaId`**: Estoque é compartilhado entre 20 empresas; fato não marca qual empresa. Corrige com desnormalização de `raw_estoque_local` (FK para company).

2. **[GAP-2] Sem detalhe de origem de movimento**: `sentido` é só entrada/saída; `origem` é string solta no JSON. Precisaria de enum normalizado (compra, venda, ajuste, devolução, transferência) + coluna em fato.

3. **[GAP-3] Sem rastreabilidade de lote/série**: Tabelas `*_rastreabilidade` existem (raw) mas não há fato derivado nem tool. Importante para auditoria.

4. **[GAP-4] Min/máx não operado**: 0 linhas. Alertas de reabastecimento (pergunta 20-21) ficam estruturais até Odoo ser preenchido.

5. **[GAP-5] Sem visão de reservas/promessas**: Pedidos podem reservar estoque. Não há fato de reserva. Compromete análise de "estoque disponível vs alocado".

### 7.2 Roadmap de evolução

**B-waves (corrente):**
- [OK] 9 tools de saldo/movimento/alertas básicos
- [OK] Fato mín/máx estrutural (0 linhas, tool honesta)
- [PARCIAL] Rastreabilidade (raw existe, sem fato/tool)

**Onda seguinte (quando operado):**
- [ ] Tool de "abaixo do mínimo" quando min/máx for usado
- [ ] Tool de movimento por produto (detalhe, não só agregado)
- [ ] Desnormalizar `empresaId` e `categoriaOrigem` para melhorar agregações

**Médio prazo (multi-domínio):**
- [ ] Fato de reservas/promessas (comercial + estoque)
- [ ] Custo unitário derivado (financeiro + estoque)
- [ ] Turnover por categoria (financeiro + estoque)

---

## 8. METADADOS DO DOSSIER

| Item | Valor |
|---|---|
| **Tabelas raw mapeadas** | 9 (Extrato, Saldo, Saldo-Hoje, Saldo-Hoje-Duração, Local, Extrato-Rastreabilidade, Saldo-Rastreabilidade, Saldo-Rastreabilidade-Hoje, Mínimo-Máximo) |
| **Tabelas fato mapeadas** | 3 (Saldo, Movimento, MinMax); +1 estrutural (ProdutoParado) |
| **Tools existentes** | 9 (todas em "OK" ou "honesta com 0 linhas") |
| **Perguntas catologadas** | 30 (12 OK, 12 PARCIAL, 3+ GAP, 3 cross-domain) |
| **Métricas canônicas definidas** | 10 operacionais + 5 futuras |
| **Gaps críticos** | 5 (empresaId, origem de movimento, rastreabilidade com fato, min/máx, reservas) |
| **Armadilhas documentadas** | 11 (campos, status, JOINs, comportamentos) |
| **Data de mapeamento** | 2026-06-06 |
| **Versão deste dossier** | v1 |

