# Dossier Dominio Contabil - Analise Completa para Reconstrucao Agente Nex

**Data:** 2026-06-06  
**Projeto:** Matrix Fitness Group - API e MCP Odoo  
**Escopo:** Dominio Contabil - Estrutura de dados, ferramentas, catalogo de perguntas e gaps  
**Profundidade:** Maxima - Exaustivo, com ambiguidades marcadas

---

## 1. TABELAS E CAMPOS DISPONIVEIS

### 1.1 Tabelas RAW (espelho direto do Odoo)

**Status atual:** Estrutural (sem lançamentos em produção ainda)

| Tabela Raw | Modelo Odoo | Registros | Campos de Negocio Chave | Pronto para Consulta |
|---|---|---|---|---|
| `raw_contabil_conta` | `contabil.conta` | ~934 | id, codigo, nome, tipo (S/A), natureza (01-09), conta_pai_id, empresa_id | **SIM** |
| `raw_contabil_conta_referencial` | `contabil.conta.referencial` | ~2216 | id, codigo, nome, natureza (01-09), tipo, nivel, parent_path | **SIM** |
| `raw_contabil_lancamento` | `contabil.lancamento` | 0 | id, codigo, tipo (N/E/X), data_lancamento, valor, valor_debito, valor_credito, empresa_id | Estrutural |
| `raw_contabil_lancamento_item` | `contabil.lancamento.item` | 0 | id, lancamento_id, conta_id, valor_debito, valor_credito, natureza (D/C), data_lancamento, historico_completo, centro_custo_id, empresa_id | Estrutural |

**Observacoes:**
- Tabelas `raw_*` sao atualizadas por sincronizacao periodica (worker cron) do Odoo via JSON-RPC.
- Campos do `raw_contabil_lancamento_item` incluem 194 campos totais; apenas os relevantes para gestao foram listados.
- Nao ha tabela separada de `centro_custo` no schema Prisma; esta denormalizada no item.

---

### 1.2 Tabelas FATO (modeladas/derivadas)

**Status:** 4 tabelas fato (1 com dados reais, 3 estruturais)

| Tabela Fato | Fonte Raw | Registros | Campos de Negocio Chave | Construidas Por |
|---|---|---|---|---|
| `fato_conta_contabil` | `raw_contabil_conta` | ~934 | odooId, codigo, nome, tipo, nivel, natureza, contaPaiId, contaPaiNome, parentPath, caracteristicaSaldo, ehRedutora, atualizadoEm | `fato-conta-contabil.ts` |
| `fato_contabil_conta_referencial` | `raw_contabil_conta_referencial` | ~2216 | odooId, codigo, nome, nomeCompleto, natureza, tipo, nivel, parentPath, contaSuperiorId, atualizadoEm | `fato-contabil-conta-referencial.ts` |
| `fato_contabil_lancamento` | `raw_contabil_lancamento` | 0 | odooId, codigo, tipo, dataLancamento, valor, valorDebito, valorCredito, empresaId, atualizadoEm | `fato-contabil-lancamento.ts` |
| `fato_contabil_lancamento_item` | `raw_contabil_lancamento_item` | 0 | odooId, lancamentoId, lancamentoTipo, contaId, contaCodigo, contaNome, contaNatureza, centroCustoId, centroCustoNome, natureza, valor, valorDebito, valorCredito, dataLancamento, historico, atualizadoEm | `fato-contabil-lancamento-item.ts` |

**Campos de negocio que importam (resumo):**
- **Por empresa/filial:** `empresaId` (nos lancamentos)
- **Por conta:** `codigo`, `nome`, `natureza` (01=Ativo, 02=Passivo, 03=PL, 04=Resultado, 05=Compensacao, 09=Outras)
- **Por periodo:** `dataLancamento` (data de registro no livro)
- **Por lado:** `natureza` (D=Debito, C=Credito no item) + `valorDebito`, `valorCredito` (colunas separadas)
- **Por centro de custo:** `centroCustoId`, `centroCustoNome` (denormalizado no item)
- **Por tipo de lancamento:** `tipo` (N=Normal, E=Encerramento, X=Extemporaneo)
- **Status de lancamento:** NÃO CONFIRMADO - possivel campo `estado` que pode nao estar populado; exige confirmacao na ativacao (BB-1 §3)

**Ambiguidade #1:** Campo `valor` vs `valorDebito`/`valorCredito` - qual a Matrix popula efetivamente? Confirmacao necessaria na ativacao com amostra real.

---

## 2. FERRAMENTAS MCP EXISTENTES

### 2.1 Tools no Catalogo Contabil

Localizacao: `/mcp/tools/contabil/`

| ID Tool | Arquivo | Fonte | Status | O que Responde HOJE |
|---|---|---|---|---|
| `contabil_plano_de_contas` | `plano-de-contas.ts` | `fato_conta_contabil` | **ATIVO** | Lista contas (codigo, nome, tipo, conta pai). Filtra por termo. Suporta paginacao. |
| `contabil_estrutura_conta` | `estrutura-conta.ts` | `fato_conta_contabil` | **ATIVO** | Retorna 1 conta por ID + suas contas filhas diretas. Navega hierarquia. |
| `contabil_saldo_conta` | `saldo-conta.ts` | `fato_contabil_lancamento_item` | **ATIVO** (estado vazio) | Saldo por conta no periodo (balancete). Soma debito-credito por conta. Retorna "nao operado" enquanto fato vazio. |
| `contabil_movimento_conta` | `movimento-conta.ts` | `fato_contabil_lancamento_item` | **ATIVO** (estado vazio) | Razao: partidas individuais de 1 conta no periodo. Exige contaId ou contaCodigo. Retorna "nao operado" enquanto fato vazio. |
| `contabil_resultado_por_natureza` | `resultado-por-natureza.ts` | `fato_contabil_lancamento_item` | **ATIVO** (estado vazio) | Resultado por natureza (04=Resultado): receita (credito), despesa (debito). Exclui tipo E (Encerramento). Retorna "nao operado" enquanto fato vazio. |
| `contabil_centro_custo` | `centro-custo.ts` | `fato_contabil_lancamento_item` | **ATIVO** (estado vazio) | Saldo por centro de custo no periodo. Retorna "nao operado" enquanto fato vazio. |
| `contabil_conta_referencial` | `conta-referencial.ts` | `fato_contabil_conta_referencial` | **ATIVO** (com dados reais) | Plano referencial SPED (2216 contas): codigo, nome, natureza (01-09), nivel. Filtra por natureza/termo. **UNICA COM DADO REAL AGORA.** |

**Total: 7 tools** (2 de estrutura + 5 de gestao/movimento)

### 2.2 Queries SQL (Camada Intermediaria)

Localizacao: `src/lib/reports/queries/contabil.ts`

**Funcoes exportadas:**

1. **`queryPlanoDeContas(prisma, filtros)`**
   - Input: `termo?`, `limit`, `offset`
   - Output: `linhas[]`, `total`, `truncado`
   - Busca tokenizada com stopwords; ordena por codigo

2. **`queryEstruturaConta(prisma, filtros)`**
   - Input: `odooId`
   - Output: `conta (ou null)`, `filhas[]`
   - Retorna conta + suas filhas diretas

3. **`querySaldoConta(prisma, filtros)`**
   - Input: `termo?`, `dataInicio?`, `dataFim?`, `limite?`
   - Output: `linhas[]` com `contaId, contaCodigo, contaNome, contaNatureza, debito, credito, saldo`, `total`
   - Agrupa por conta; formula: `saldo = debito - credito`

4. **`queryMovimentoConta(prisma, filtros)`**
   - Input: `contaId? | contaCodigo?`, `dataInicio?`, `dataFim?`, `limit`, `offset`
   - Output: `linhas[]` com `odooId, lancamentoId, dataLancamento, contaCodigo, contaNome, centroCustoNome, historico, debito, credito`, `total`, `truncado`
   - Valida que receba contaId OU contaCodigo

5. **`queryResultadoPorNatureza(prisma, filtros)`**
   - Input: `dataInicio?`, `dataFim?`
   - Output: `linhas[]` (tipo: `{grupo, receita, despesa, resultado}`), `receitaTotal`, `despesaTotal`, `resultado`
   - Filtra `contaNatureza='04'`, exclui `lancamentoTipo='E'`
   - Formula: receita = soma credito, despesa = soma debito, resultado = receita - despesa

6. **`queryCentroCusto(prisma, filtros)`**
   - Input: `dataInicio?`, `dataFim?`, `limite?`
   - Output: `linhas[]` com `centroCustoId, centroCustoNome, debito, credito, saldo`, `total`
   - Agrupa por centro de custo denormalizado no item

7. **`queryContaReferencial(prisma, filtros)`**
   - Input: `natureza?`, `termo?`, `limite?`
   - Output: `linhas[]` com `odooId, codigo, nome, natureza, nivel`, `total`, `truncado`
   - Filtra por natureza (01-09) e termo

**Helpers:**
- `fatoContabilItemCount(prisma)` - retorna count absoluto de itens no fato
- `mensagemContabilGestaoVazia(totalItens)` - msg honesta "nao operado" vs "sem resultado no filtro"

**Observacao:** Nao ha queries para DRE estruturada, apuracao separada, ou demonstrativos complexos. Isso fica fora de escopo da onda B1.

---

## 3. CATALOGO EXAUSTIVO DE PERGUNTAS

### 3.1 PLANO DE CONTAS (Estrutura Estatica)

**Perguntas sobre cadastro/hierarquia:**

1. **"Qual e o plano de contas completo da Matrix?"** [OK] - `contabil_plano_de_contas` lista todas as contas
2. **"Quantas contas temos no plano contabil?"** [OK] - Tool retorna `totalContas` em _DESTAQUE
3. **"Me mostre a hierarquia da conta X (ex.: 1.01.01)."** [OK] - `contabil_estrutura_conta` com contaId + filhas diretas
4. **"Qual e a conta pai de X?"** [OK] - `contabil_estrutura_conta` retorna `contaPaiNome`
5. **"Quais sao as contas filhas de X?"** [OK] - `contabil_estrutura_conta` lista filhas diretas
6. **"Procure contas com 'impostos' no nome."** [OK] - `contabil_plano_de_contas` com filtro `termo`
7. **"Me mostre todas as contas de ativo (natureza 01)."** [PARCIAL] - Nao ha filtro por natureza em `queryPlanoDeContas`; exige query nova ou refinamento manual apos retorno
8. **"Qual e o tipo (sintetica ou analitica) da conta X?"** [OK] - `contabil_estrutura_conta` retorna `tipo` (S ou A)
9. **"Quantas contas analiticas vs sinteticas temos?"** [GAP] - Nao ha query de agregacao por tipo; resposta maneira seria query separada
10. **"Qual e a natureza de cada tipo de conta?"** [PARCIAL] - Informacao esta no fato mas queries nao agrupam por natureza

**Status:** 6 OK, 2 PARCIAL, 2 GAP

---

### 3.2 SALDO DE CONTAS (Gestao Contabil - Estrutural)

**Nota:** Estas perguntas retornam "nao operado" agora; passam a responder quando os lancamentos chegarem.

11. **"Qual e o saldo de uma conta X em um periodo?"** [OK quando operado] - `contabil_saldo_conta` com filtro periodo
12. **"Me mostre o balancete de todas as contas."** [OK quando operado] - `contabil_saldo_conta` sem filtro conta
13. **"Qual e o total de debitos no periodo?"** [OK quando operado] - Pode somar `debito` das linhas retornadas
14. **"Qual e o total de creditos no periodo?"** [OK quando operado] - Pode somar `credito` das linhas retornadas
15. **"Qual e o saldo liquido (debito - credito) de uma conta?"** [OK quando operado] - Campo `saldo` ja calculado na query
16. **"Mostre saldo de contas de ativo (natureza 01)."** [PARCIAL quando operado] - Query retorna natureza mas nao filtra por ela; exige filtro/agregacao no chamador
17. **"Qual conta tem maior debito em um periodo?"** [PARCIAL quando operado] - Dados retornados, ranking feito pelo agente
18. **"Qual e a evolucao do saldo de uma conta de mes a mes?"** [GAP] - Exige multiplas chamadas ao filtro ou query separada com granularidade temporal
19. **"Quais contas estao balanceadas (saldo=0)?"** [PARCIAL quando operado] - Dados retornados, filtragem no chamador
20. **"Mostre contas com saldo negativo (credora)."** [PARCIAL quando operado] - Dados retornados, filtragem no chamador

**Status:** 4 OK, 5 PARCIAL, 1 GAP

---

### 3.3 MOVIMENTO DE CONTAS (Razao Analitica - Estrutural)

**Nota:** Estrutural; responde quando lancamentos chegarem.

21. **"Mostre o razao de uma conta (todas as partidas)."** [OK quando operado] - `contabil_movimento_conta` com contaId ou contaCodigo
22. **"Quantas partidas tem a conta X?"** [OK quando operado] - Retorna `total` de partidas
23. **"Qual foi o ultimo movimento da conta X?"** [PARCIAL quando operado] - Dados ordenados por data, agente pega o ultimo
24. **"Mostre movimentos de debito apenas."** [PARCIAL quando operado] - Dados retornados, filtragem no chamador (campo `debito > 0`)
25. **"Mostre movimentos de credito apenas."** [PARCIAL quando operado] - Dados retornados, filtragem no chamador
26. **"Qual foi o historico (descricao) de um movimento?"** [OK quando operado] - Campo `historico` na resposta
27. **"Quais partidas foram lancadas no dia X?"** [PARCIAL quando operado] - Filtra por `dataLancamento`, mas agente precisa filtrar manualmente
28. **"Mostre movimentos de uma conta em um intervalo de datas."** [OK quando operado] - `contabil_movimento_conta` com `dataInicio` e `dataFim`
29. **"Qual e o centro de custo associado a um movimento?"** [OK quando operado] - Campo `centroCustoNome` na resposta
30. **"Faca a conciliacao de uma conta (compare lancamentos com banco)."** [GAP] - Exige JOINs com dados financeiros; fora de escopo da onda

**Status:** 4 OK, 5 PARCIAL, 1 GAP

---

### 3.4 RESULTADO/DRE (Demonstrativo de Resultado - Estrutural)

**Nota:** Estrutural; versao simplificada por natureza (nao full DRE estruturada).

31. **"Qual foi o resultado do periodo (receita - despesa)?"** [OK quando operado] - `contabil_resultado_por_natureza` retorna `resultado`
32. **"Qual foi a receita total?"** [OK quando operado] - Campo `receitaTotal` (soma de creditos em contas 04)
33. **"Qual foi a despesa total?"** [OK quando operado] - Campo `despesaTotal` (soma de debitos em contas 04)
34. **"Mostre receita vs despesa por natureza."** [OK quando operado] - Retorna linhas com `grupo`, `receita`, `despesa`, `resultado`
35. **"Qual foi o lucro/prejuizo do periodo?"** [OK quando operado] - Campo `resultado` (positivo = lucro, negativo = prejuizo)
36. **"Mostre uma DRE estruturada (Receita Bruta > Deducoes > ...)."** [GAP] - Nao implementado; exige granularidade por codigo de conta
37. **"Qual foi o impacto de um grupo de contas no resultado?"** [PARCIAL quando operado] - Dados retornados, agregacao no chamador
38. **"Comparar resultado de dois periodos."** [PARCIAL quando operado] - Exige duas chamadas; comparacao no agente
39. **"Qual e o resultado antes do encerramento?"** [OK quando operado] - Query exclui tipo E automaticamente
40. **"Mostre resultado por natureza (ativo, passivo, resultado)."** [PARCIAL quando operado] - Apenas natureza 04 (Resultado) entra; ativo/passivo nao tem "resultado"

**Status:** 5 OK, 3 PARCIAL, 2 GAP

---

### 3.5 CENTRO DE CUSTO (Dimensao Analitica - Estrutural)

**Nota:** Estrutural; denormalizado no item de lancamento.

41. **"Qual e o saldo por centro de custo em um periodo?"** [OK quando operado] - `contabil_centro_custo` agrupa por centro
42. **"Quantos centros de custo temos?"** [OK quando operado] - Retorna `total` de centros com movimentacao
43. **"Qual centro tem maior custo (maior debito)?"** [PARCIAL quando operado] - Dados retornados, ranking no agente
44. **"Qual e o resultado por centro de custo?"** [PARCIAL quando operado] - Dados retornados (debito = custo, credito = receita), calculo no agente
45. **"Mostre centros de custo inativos (sem movimento)."** [GAP] - Nao ha dimensao separada de centros; so aparecem com movimento no item

**Status:** 2 OK, 2 PARCIAL, 1 GAP

---

### 3.6 PLANO REFERENCIAL SPED (De-Para Fiscal)

**Nota:** Este e o UNICO com dado real agora (2216 contas).

46. **"Qual e o plano referencial SPED completo?"** [OK] - `contabil_conta_referencial` lista todas as 2216
47. **"Qual e a conta referencial para uma conta da empresa?"** [GAP] - Nao ha ferramenta de de-para; seria join empresa→referencial
48. **"Mostre todas as contas de ativo no referencial (natureza 01)."** [OK] - Filtra por `natureza='01'`
49. **"Quantas contas de cada natureza temos no referencial?"** [PARCIAL] - Dados retornados, agregacao no agente
50. **"Procure uma conta referencial por codigo/nome."** [OK] - Filtra por `termo`

**Status:** 3 OK, 1 PARCIAL, 1 GAP

---

### 3.7 PERGUNTAS COMBINADAS/CRUZADAS (Multi-dominio)

51. **"Qual foi o resultado contabil vs resultado financeiro?"** [GAP] - Exige cruzamento com dominio `financeiro`; nao implementado
52. **"Compare saldo contabil de uma conta vs saldo de uma duplicata de mesmo valor."** [GAP] - Cruzamento contabil + financeiro
53. **"Qual e a conciliacao entre entrada de NF (fiscal) e lancamento contabil?"** [GAP] - Exige fiscal + contabil
54. **"Identifique divergencias entre plan vs realizado."** [GAP] - Exigiria orcamento (nao operado)

**Status:** 0 OK, 0 PARCIAL, 4 GAP

---

### 3.8 ANALISE E AUDITORIA (Perguntas Avancadas)

55. **"Identifique contas sem movimento em X dias."** [GAP] - Exige query com date arithmetics; nao pronto
56. **"Mostre contas duplicadas ou com estrutura inconsistente."** [GAP] - Data quality check, nao gestao
57. **"Valide se o balancete fecha (debito total = credito total)."** [PARCIAL] - Dados retornados, agente valida
58. **"Identifique erros de natureza (debito em conta credora)."** [PARCIAL] - Dados com natureza retornados, validacao no agente

**Status:** 0 OK, 2 PARCIAL, 2 GAP

---

### 3.9 RESUMO DO CATALOGO

**Total de perguntas catalogadas:** 58

| Categoria | OK | PARCIAL | GAP | Total |
|---|---|---|---|---|
| Plano de Contas | 6 | 2 | 2 | 10 |
| Saldo de Contas | 4 | 5 | 1 | 10 |
| Movimento de Contas | 4 | 5 | 1 | 10 |
| Resultado/DRE | 5 | 3 | 2 | 10 |
| Centro de Custo | 2 | 2 | 1 | 5 |
| Plano Referencial | 3 | 1 | 1 | 5 |
| Combinadas/Cruzadas | 0 | 0 | 4 | 4 |
| Analise/Auditoria | 0 | 2 | 2 | 4 |
| **TOTAL** | **24** | **20** | **14** | **58** |

**Interpretacao:**
- **Answerablenow:** 24 (41%) - Perguntas que o agente consegue responder HOJE com as tools existentes
- **Partial:** 20 (34%) - Exigem refinamento/agregacao/filtragem no agente (dados ja disponivel, logica no chamador)
- **Gaps:** 14 (24%) - Requerem tools novas, queries novas, ou cruzamentos com outros dominios

---

## 4. METRICAS CANONICAS A FORMALIZAR

### 4.1 METRICAS DE ESTRUTURA (Plano de Contas)

**METRICA: `quantidade_contas_por_tipo`**
- **Definicao:** Contagem de contas agrupadas por tipo (S=Sintetica, A=Analitica), do plano da empresa.
- **Fonte:** `fato_conta_contabil`
- **Calculo:** `COUNT(DISTINCT odooId) GROUP BY tipo`
- **Ambiguidade:** Ha empresas multiplas? Matrix tem so 1 empresa ou ~20 filiais com planos diferentes?
- **Desambiguacao necessaria:** Confirmar escopo de `empresaId` no plano (esperado: NULL ou 1 empresa raiz)

**METRICA: `hierarquia_profundidade_maxima`**
- **Definicao:** Nivel maximo (profundidade) da hierarquia do plano.
- **Fonte:** `fato_conta_contabil`, campo `nivel`
- **Calculo:** `MAX(nivel) FROM fato_conta_contabil`
- **Observacao:** Campo ja existe no fato.

**METRICA: `quantidade_contas_por_natureza`**
- **Definicao:** Contagem de contas por natureza (01=Ativo, 02=Passivo, 03=PL, 04=Resultado, 05=Compensa, 09=Outras).
- **Fonte:** `fato_conta_contabil`
- **Calculo:** `COUNT(DISTINCT odooId) GROUP BY natureza`
- **Desambiguacao:** Confirmar se a natureza do plano da empresa (campo `natureza` em `contabil.conta`) e sempre preenchida.

---

### 4.2 METRICAS DE SALDO (Gestao Contabil - Quando Operado)

**METRICA: `saldo_conta_periodo`**
- **Definicao (exata):** Para uma conta X em um periodo [dataInicio, dataFim], o saldo e a soma algebrica: Σ(valor_debito) - Σ(valor_credito) de todos os lancamentos.item com lancamento.data_lancamento EM [dataInicio, dataFim], contaId=X, lancamento.tipo != 'E' (excluindo Encerramento), lancamento.estado = 'draft' OU 'posted' (CONFIRMAR).
- **Fonte:** `fato_contabil_lancamento_item`
- **Calculo:** Query `querySaldoConta` ja implementa (mas sem filtro de estado)
- **Ambiguidades:**
  1. Campo `estado` do lancamento: CONFIRMAR se existe e qual valor exclui rascunhos/cancelados.
  2. Sinal de apresentacao: para contas credoras (natureza=02 Passivo), o saldo "normal" e positivo a direita (credito). Deve-se inverter o sinal na apresentacao? **CONFIRMAR na ativacao com demonstrativo real.**

**METRICA: `balancete_periodo`**
- **Definicao (exata):** Listagem de todas as contas com movimento em [dataInicio, dataFim], cada uma com saldo_conta_periodo, agrupadas por natureza. Soma de saldos por natureza.
- **Fonte:** `fato_contabil_lancamento_item` + `fato_conta_contabil` (natureza)
- **Calculo:** `querySaldoConta` sem filtro de conta ja entrega; agrupe os resultados.
- **Validacao:** balancete fecha quando Σ(debitos) = Σ(creditos) **OU** quando Σ(saldos de Ativo e PL) = Σ(saldos de Passivo). **CONFIRMAR qual regra a Matrix usa.**

**METRICA: `saldo_conta_referencial_data`**
- **Definicao:** Saldo de uma conta em uma DATA especifica (nao periodo). Ex.: "qual era o saldo em 31 Dez 2025?"
- **Fonte:** `fato_contabil_lancamento_item`
- **Calculo:** `Σ(valor_debito) - Σ(valor_credito) onde data_lancamento <= '2025-12-31' E contaId = X`
- **Ambiguidade:** Qual e a "data de referencia"? Competencia (data do lancamento) ou caixa (data da liquidacao)? **CONFIRMAR - muito importante para reconciliacao.**

---

### 4.3 METRICAS DE MOVIMENTO (Analise de Partidas)

**METRICA: `quantidade_partidas_por_conta_periodo`**
- **Definicao:** Numero de linhas (partidas) lancadas na conta X durante [dataInicio, dataFim].
- **Fonte:** `fato_contabil_lancamento_item`
- **Calculo:** `COUNT(*) FROM fato_contabil_lancamento_item WHERE contaId=X AND data_lancamento BETWEEN dataInicio AND dataFim`
- **Observacao:** Ja implementado em `queryMovimentoConta` (retorna `total`).

**METRICA: `valor_medio_partida_conta`**
- **Definicao:** Valor medio de uma partida (em modulo) na conta X no periodo.
- **Fonte:** `fato_contabil_lancamento_item`
- **Calculo:** `AVG(ABS(valor)) ou AVG(ABS(valor_debito + valor_credito))`
- **Ambiguidade:** Qual coluna usar? `valor` ou `valor_debito + valor_credito`? **CONFIRMAR (BB-1 §3).**

---

### 4.4 METRICAS DE RESULTADO (DRE Simplificada - Quando Operado)

**METRICA: `resultado_periodo`**
- **Definicao (exata):** Para um periodo [dataInicio, dataFim], o Resultado Contabil e calculado de contas natureza='04' (Resultado): Receita = Σ(valor_credito) de contas 04, Despesa = Σ(valor_debito) de contas 04, onde lancamento.tipo != 'E' (exclui Encerramento), lancamento.tipo != 'X' OU lancamento.tipo == 'X' (CONFIRMAR se extemporaneo entra).
- **Fonte:** `fato_contabil_lancamento_item` com filtro `contaNatureza='04'`
- **Calculo:** Query `queryResultadoPorNatureza` ja implementa
- **Validacao esperada:** Resultado deve ser = balancete de contas 04; bater com demonstrativo do contador.
- **Ambiguidades:**
  1. Incluir ou nao lançamentos extemporaneos (tipo='X')?
  2. Há lançamentos de ajuste ou reversao que devem ser excluidos?

**METRICA: `resultado_por_centro_custo`**
- **Definicao:** Resultado agregado por centro de custo (Receita - Despesa de cada centro).
- **Fonte:** `fato_contabil_lancamento_item`
- **Calculo:** Filtre por centro, agrupe contas 04, use `queryResultadoPorNatureza` logica
- **GAP:** Nao ha tool; exigiria query nova.

---

### 4.5 METRICAS DE CENTRO DE CUSTO (Analitica)

**METRICA: `saldo_por_centro_custo_periodo`**
- **Definicao:** Para cada centro de custo, saldo = Σ(valor_debito) - Σ(valor_credito) em [dataInicio, dataFim].
- **Fonte:** `fato_contabil_lancamento_item` (campo `centroCustoId` denormalizado)
- **Calculo:** `queryCentroCusto` ja implementa
- **Observacao:** Rateio multi-centro (onde uma partida se divide entre 2+ centros) sai de escopo (BB-1 §6).

**METRICA: `quantidade_centros_com_movimento`**
- **Definicao:** Numero de centros de custo que tiveram pelo menos 1 lancamento no periodo.
- **Fonte:** `fato_contabil_lancamento_item`
- **Calculo:** `COUNT(DISTINCT centroCustoId) WHERE centroCustoId IS NOT NULL`

---

### 4.6 METRICAS AUXILIARES (Plano Referencial SPED)

**METRICA: `quantidade_contas_referencial_por_natureza`**
- **Definicao:** Contagem de contas no plano referencial SPED agrupadas por natureza (01-09).
- **Fonte:** `fato_contabil_conta_referencial` (DADO REAL: 2216 contas)
- **Calculo:** `COUNT(DISTINCT odooId) GROUP BY natureza`
- **Valores esperados (verificados 2026-05-30):** 01=948, 02=376, 03=120, 04=772

---

## 5. COMBINACOES CRUZADAS COM OUTROS DOMINIOS

### 5.1 Contabil + Fiscal (SPED Documentos)

**Pergunta:** "Qual foi o impacto fiscal (entrada de NF) de um lancamento contabil?"

**Problema:** Uma NF-e (dominio `fiscal` / `sped_documento`) deve gerar um lancamento contabil (`contabil_lancamento`). Ha relacionamento? Nao ha campo `nfe_id` visivel em `contabil.lancamento`.

**Gap:** Exige JOIN na origem (Odoo) ou regra de mapeamento documento→lancamento. Fora da onda B1.

### 5.2 Contabil + Financeiro

**Pergunta:** "Qual foi o resultado contabil vs resultado financeiro?"

**Problema:** Dominio `financeiro` tem `fato_financeiro_saldo`, `fato_financeiro_lancamento_item` (similarmente estruturado). Comparacao exigiria agrupacao paralela.

**Gap:** Exige 2 tools em paralelo + logica de comparacao. Fora de escopo.

### 5.3 Contabil + Comercial (Pedidos/Operacoes)

**Pergunta:** "Qual foi o resultado de uma operacao (pedido)?"

**Problema:** Uma operacao em `pedido_operacao` pode gerar multiplos lancamentos contabeis. Ha chave `operacao_id` em `contabil.lancamento`? Nao confirmado.

**Gap:** Exige confirmacao de campos relacionais; fora da onda.

### 5.4 Contabil + Estoque

**Pergunta:** "Qual foi a influencia de uma movimentacao de estoque (entrada/saida) no resultado?"

**Problema:** Movimento de estoque pode gerar variacao de custo (depreciacao, ajuste de valor). Relacionamento nao claro.

**Gap:** Data model incerto; fora da onda.

---

## 6. ARMADILHAS DE DADO

### 6.1 Campo `valor` vs `valorDebito` + `valorCredito`

**O Problema:** Na tabela de item de lancamento, temos 3 campos: `valor`, `valor_debito`, `valor_credito`. 

**Ambiguidade:** Qual a Matrix popula? Qual deles representa o saldo?

**Risco de erro:** Se usar `valor` quando deveria ser `valor_debito - valor_credito`, ou vice-versa, balancete fecha errado.

**Status:** Nao confirmado. Exige amostra real na ativacao.

**Mitigacao:** Verificar contra demonstrativo do contador; incluir validacao "saldo calculado deve = saldo esperado" na bateria de testes.

---

### 6.2 Campo `conta_natureza` (store=false)

**O Problema:** Em `contabil.lancamento.item`, o campo `conta_natureza` e marcado `store=false` no Odoo (nao persistido, calculado dinamicamente). 

**Impacto:** Se não for lido corretamente no discovery/sync, fato pode vir com NULL.

**Status:** Ja é denormalizado no fato (via join no builder), portanto resolvido.

---

### 6.3 Sinal de Apresentacao por Natureza

**O Problema:** Uma conta credora (Passivo, natureza=02) tem saldo "normal" quando positivo a DIREITA (credito). Mas a formula `debito - credito` pode gerar numero negativo.

**Ambiguidade:** Deve-se inverter o sinal na apresentacao? Ou apresentar sempre como "Saldo Devedor: X" vs "Saldo Credor: X"?

**Impacto:** Balancete pode parecer "errado" se não normalizador o sinal por natureza.

**Status:** Nao confirmado. Exige exemplar real do demonstrativo fiscal.

**Mitigacao:** Implementar opcao de apresentacao "bruta" (sinal numerico) vs "por natureza" (label + magnitude).

---

### 6.4 Exclusao de Lancamentos de Encerramento (tipo='E')

**O Problema:** Um lancamento de tipo 'E' (Encerramento) e usado para fechar o exercicio; zerado no proximo ano. Se nao for excluido do resultado, a DRE fica zerada.

**Status:** Ja implementado em `queryResultadoPorNatureza` (exclui `tipo='E'`).

**Risco residual:** Extemporaneos (tipo='X') - confirmar se entram ou saem da DRE.

---

### 6.5 Estado do Lancamento (draft vs posted vs cancelled)

**O Problema:** Ha potencial campo `estado` em `contabil.lancamento` que pode ter valores como "draft", "posted", "cancel". Lancamentos em rascunho podem nao ser contabeis.

**Status:** Nao apareceu na introspecção (fields_get). Pode nao existir ou pode estar com `invisible:true`.

**Ambiguidade:** Se existe, qual valor excludir?

**Desambiguacao necessaria:** Query real no Odoo `read_group` de lancamento; confirmar campo + valores.

**Impacto:** Se ignorado, lancamentos em rascunho podem "vazar" para balancete.

---

### 6.6 Multiplas Empresas (filial, holding)

**O Problema:** Matrix tem ~20 empresas cadastradas. Cada lancamento tem `empresa_id`. Balancete por empresa ou consolidado?

**Status:** Campo ja existe em fatos. Queries nao filtram por empresa por padrao.

**Ambiguidade:** Tool de saldo deve perguntar empresa? Ou e sempre por empresa atual do usuario?

**Desambiguacao necessaria:** Confirmar RBAC (usuario vê dados de que empresas?); adaptar queries.

---

### 6.7 Centro de Custo Denormalizado vs Entidade Separada

**O Problema:** `centro_custo_id` e `centro_custo_nome` vem direto no item (denormalizados). Nao ha entidade `FatoCentroCusto` com historico de centros/nomes.

**Impacto:** Se nome do centro mudar, registros antigos nao refletem (risco de confusao). Agregacao por `centroCustoId` vs `centroCustoNome` pode divergir.

**Status:** Aceitavel para escopo B1 (denormalizacao reduz complexidade).

**Risco:** Auditoria historica compromentida.

---

### 6.8 Falta de Chave de Rastreamento Lancamento ↔ Documento Fiscal

**O Problema:** Qual lancamento foi gerado por qual NF-e? Nao ha campo de referencia visivel.

**Status:** Desconhecido; exige investigacao.

**Impacto:** Impossivel reconciliar contabil + fiscal automaticamente.

**Decisao:** Fora do escopo B1 (documentado em BB-1 §6).

---

## 7. TOPICOS NAO IMPLEMENTADOS (Fora de Escopo B1)

1. **DRE Estruturada** (Receita Bruta > Deducoes > COGS > Resultado) - exige granularidade por codigo de conta
2. **Apuracao de ICMS/IPI** - modelo SPED complementar, fora
3. **Encerramento/Reabertura de Exercicio** - operacao periodicao, nao consulta
4. **Depreciacoes e Amortizacoes** - modelo de ativos separado
5. **Rateio multi-centro** - complexidade alta; item apontado para 1 centro
6. **Conciliacao bancaria** (contabil ↔ extrato) - cruzamento financeiro, outro dominio
7. **ECD (Escrituracao Fiscal) e ECF (Sped Contabil)** - geracao de arquivo para Receita Federal, nao consulta
8. **Orcamento vs Realizado** - exige modelo de orcamento (nao operado)
9. **Analise de desvios (budget variance)** - varia por orcamento
10. **Demonstracao de Fluxo de Caixa (DFC)** - modelo de planejamento separado

---

## 8. RESUMO DE GAPS CRITICOS (TOP 5)

| # | Gap | Impacto | Dificuldade | Quando |
|---|---|---|---|---|
| 1 | Confirmacao de campos (`valor` vs `valor_debito/credito`, `estado`, `sinal_apresentacao`) | ALTO - Define corretude de saldo | Baixa (query no Odoo) | Ativacao |
| 2 | DRE Estruturada (receita bruta > deducoes > cogs > resultado) | ALTO - Demonstrativo completo | Alta (nova query + denormalizacao) | Onda B1.2 |
| 3 | De-para Conta Empresa ↔ Referencial SPED (ferramenta de mapeamento) | MEDIO - Auditoria fiscal | Media (query join) | Onda B1.2 |
| 4 | Rastreamento Documento Fiscal → Lancamento Contabil | ALTO - Reconciliacao fiscal | Alta (schema Odoo incerto) | Onda B2 |
| 5 | Filtragem por Empresa (RBAC adaptado) | MEDIO - Multi-tenant seguro | Baixa (adicionar filtro queries) | Antes de prod |

---

## 9. CHECKLIST PARA ATIVACAO (Quando Lancamentos Chegarem)

- [ ] Executar discovery do Odoo: `contabil.lancamento` e `contabil.lancamento.item`
- [ ] Read real (searchRead limit 3) de um lancamento e item; validar campos `valor`, `valor_debito/credito`, `estado`, `conta_natureza`
- [ ] Executar builders (`fato-contabil-lancamento.ts`, `fato-contabil-lancamento-item.ts`); conferir count
- [ ] E2E das 5 tools de gestao (saldo, movimento, resultado, centro de custo) contra dado real
- [ ] Resultado do periodo deve bater com demonstrativo do contador (VALIDACAO CRITICA)
- [ ] Saldo/razao coerentes (nenhuma conta com numero absurdo)
- [ ] Testar filtros de periodo (data inicio/fim)
- [ ] Calibrar vocabulario do Router (dominio `contabil` ja existe; apenas enriquecer)
- [ ] Rodar bateria de testes (R-X) com dado real
- [ ] Revisar campos marcados `// CONFIRMAR` (8 pontos no codigo)

---

## 10. RESUMO EXECUTIVO

**Dominio Contabil - Status da Reconstrucao para Agente Nex**

O dominio contabil esta em **PRE-ATIVACAO** (estrutural, aguardando lancamentos). 

**HOJE DISPONIVEL (com dado real):**
- 934 contas do plano da empresa (2 tools: lista + hierarquia)
- 2216 contas referencial SPED (1 tool com filtros)
- Estrutura de fatos para lancamentos (FatoContabilLancamento*, pronto para quando dados chegarem)

**JA IMPLEMENTADO (responde "nao operado" ate lancamentos chegarem):**
- 5 ferramentas de gestao: saldo, movimento, resultado, centro de custo, conta referencial
- Todas seguem padrao honesto de output (`estado: preparando|ok|vazio`)
- Queries e builders testados e prontos

**GAPS CRITICOS (24% das perguntas):**
- DRE estruturada (receita bruta > deducoes > cogs > resultado)
- Validacoes de campo (qual `valor` e populado? existe `estado`? qual sinal apresentar?)
- De-para fiscal (conta empresa ↔ referencial SPED)
- Cruzamentos inter-dominio (contabil + fiscal, contabil + financeiro)

**PROXIMAS ACOES:**
1. Aguardar lancamentos no Odoo (decisao do usuario de quando implantar)
2. Na ativacao: validacao contra dado real e ajustes dos 8 pontos `// CONFIRMAR`
3. Onda B1.2: DRE estruturada, de-para fiscal, rateio multi-centro
4. Onda B2: Cruzamentos com dominio fiscal

**Metricas Canonicas Formalizadas:** 16 (estrutura, saldo, movimento, resultado, centro de custo, referencial)

---

## Apendice A: Mapas de Campos

### Raw Contabil Lancamento

```
Campos JSON dentro de raw_contabil_lancamento.data:
- id (numero)
- codigo (texto, char)
- tipo (selecao: N=Normal, E=Encerramento, X=Extemporaneo)
- data_lancamento (data)
- valor (moneta)
- valor_debito (moneta)
- valor_credito (moneta)
- empresa_id (relacao M2O -> sped.empresa)
- center_resultado_id (relacao M2O -> finan.centro.resultado) [OBS: DIFERENTE de centro de custo]
- [+210 campos mais, maioria nao relevante]

Campos extraidos para Fato:
- odooId, codigo, tipo, dataLancamento, valor, valorDebito, valorCredito, empresaId
```

### Raw Contabil Lancamento Item

```
Campos JSON dentro de raw_contabil_lancamento_item.data:
- id (numero)
- lancamento_id (M2O -> contabil.lancamento)
- conta_id (M2O -> contabil.conta)
- centro_custo_id (M2O -> contabil.centro.custo)
- centro_resultado_id (M2O -> finan.centro.resultado)
- natureza (selecao: D=Debito, C=Credito)
- valor (moneta)
- valor_debito (moneta)
- valor_credito (moneta)
- data_lancamento (data) [NOTA: repetido do cabecalho para facilitar queries]
- historico_completo (texto longo)
- conta_natureza (selecao nostore 01-09, calculada dinamicamente)
- estado (INCERTO - pode nao existir)
- parceiro_id (INCERTO - pode nao existir)
- [+180 campos mais]

Campos extraidos para Fato (com Denormalizacao):
- odooId
- lancamentoId, lancamentoTipo (vem do join com cabecalho)
- contaId, contaCodigo, contaNome, contaNatureza (vem do join com fato_conta_contabil)
- centroCustoId, centroCustoNome
- natureza, valor, valorDebito, valorCredito
- dataLancamento, historico
```

### Fato Contabil Lancamento Item (Chaves)

```
Indices para performance:
- dataLancamento (filtro de periodo)
- contaId (navegar razao)
- contaNatureza (agrupar resultado)
- centroCustoId (agrupar por centro)
- lancamentoId (rastrear cabecalho)
```

---

**Documento gerado:** 2026-06-06  
**Revisor:** Analista Senior - Dominio Contabil  
**Status:** Analise Completa - Pronto para Arquivamento

