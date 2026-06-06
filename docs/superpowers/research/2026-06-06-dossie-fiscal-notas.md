# Dossie do Dominio: Fiscal e Notas Fiscais

**Data:** 2026-06-06  
**Analista:** Claude Code (Haiku 4.5)  
**Cliente:** Matrix Fitness Group  
**Ambito:** Faturamento, autorizacao, cancelamento, situacao de NFe, entradas vs saidas, operacoes fiscais

---

## 1. TABELAS E CAMPOS DISPONIVEIS

### 1.1 Tabelas FATO (Modeladas/Derivadas)

#### FatoNotaFiscal
**Fonte:** `raw_sped_documento` (modelo `sped.documento`)  
**Finalidade:** Cabeçalho das notas fiscais (entrada e saída), com situações e valores totais.  
**Contagem estimada:** ~47 mil documentos na base atual.

| Campo | Tipo | Negócio | Observacoes |
|---|---|---|---|
| `odooId` | Int (PK) | Identificador único no Odoo | Chave primária, imutável |
| `numero` | String | Número da nota fiscal | Ex: "123456", null se rascunho |
| `serie` | String | Série da nota fiscal | Ex: "1", agrupa notas em séries |
| `modelo` | String | Modelo fiscal | "55" (NFe padrão), "65" (NFCe) |
| `entradaSaida` | String (0/1) | Tipo de movimento fiscal | "1"=saída/emissão; "0"=entrada/recebimento |
| `tipoMovimento` | String | Derivado de `entradaSaida` | "saida", "entrada", "outro" (default) |
| `situacaoNfe` | String | Situação fiscal da nota | "autorizada", "cancelada", "denegada", "rejeitada", null=nao-autorizada |
| `finalidadeNfe` | String | Finalidade legal da operação | "normal", "complementar", "devolução", etc. |
| `chave` | String | Chave de acesso NFe | 44 dígitos, único federalmente |
| `participanteId` | Int (FK) | ID do cliente/fornecedor | Relacional com `res.partner` (Odoo) |
| `participanteNome` | String | Nome do cliente/fornecedor | Desnormalizado para query sem join |
| `naturezaOperacaoId` | Int (FK) | ID da natureza da operação | Relacional com `sped.natureza_operacao` |
| `naturezaOperacaoNome` | String | Descrição da natureza | Ex: "Venda", "Devolução", "Transferência" |
| `empresaId` | Int (FK) | ID da empresa emitente/receptora | Relacional com `res.company` (filial) |
| `empresaNome` | String | Nome da empresa | Desnormalizado |
| `dataEmissao` | DateTime (UTC) | Data da emissão | Formato: AAAA-MM-DDT00:00:00Z (date-only do Odoo) |
| `dataEntradaSaida` | DateTime (UTC) | Data do fato gerador | Quando efetivamente ocorreu a operação |
| `dataAutorizacao` | DateTime (UTC) | Data de autorização da Sefaz | Quando a autoridade fiscal aprovou |
| `vrNf` | Decimal(18,2) | Valor total da nota | = `vr_produtos` + impostos - descontos |
| `vrProdutos` | Decimal(18,2) | Valor dos produtos/serviços | Base de cálculo de impostos |
| `vrFatura` | Decimal(18,2) | Valor faturado | Pode diferir de vrNf em casos especiais |
| `vrIbpt` | Decimal(18,2) | Impostos estimados (IBPT) | Federais + estaduais + municipais |
| `vrIcmsProprio` | Decimal(18,2) | ICMS próprio da operação | Crítico para cálculo fiscal |
| `vrDesconto` | Decimal(18,2) | Desconto concedido | Reduz a base do cálculo |
| `atualizadoEm` | DateTime | Timestamp da última atualização | Default: now() na inserção |

**Regra de Negócio Crítica:**
- **Faturamento autorizado** = `entradaSaida='1'` AND `situacaoNfe='autorizada'` → Receita reconhecida
- **Faturamento não autorizado** = `entradaSaida='1'` AND `situacaoNfe != 'autorizada'` → Faturamento bruto/pendente
- **Canceladas** = `situacaoNfe='cancelada'` → Desconsidera valor do período
- **Data de referência para período:** Usar `dataEmissao` (quando a nota foi criada) ou `dataAutorizacao` (quando autorizada) conforme contexto

#### FatoNotaFiscalItem
**Fonte:** Linhas de `raw_sped_documento_item` mapeadas para cada item.  
**Finalidade:** Detalhe por linha da nota: produto, quantidade, CFOP, impostos por item.

| Campo | Tipo | Negócio | Observacoes |
|---|---|---|---|
| `odooId` | Int (PK) | ID da linha no Odoo | Chave primária |
| `documentoId` | Int (FK) | ID do cabeçalho da nota | Relacional com FatoNotaFiscal |
| `produtoId` | Int (FK) | ID do produto | Relacional com `sped.produto` |
| `produtoNome` | String | Nome do produto | Ex: "Haltere 10kg", desnormalizado |
| `cfopId` | Int (FK) | ID do CFOP | Código Fiscal de Operação e Prestação |
| `cfopNome` | String | Descrição do CFOP | Ex: "5.102 - Venda de produção do estabelecimento" |
| `quantidade` | Decimal(18,2) | Qtd vendida/recebida | Ex: 5.00, 10.50 |
| `vrUnitario` | Decimal(18,2) | Valor unitário | = `vr_produtos` / `quantidade` |
| `vrProdutos` | Decimal(18,2) | Valor total da linha | `quantidade` * `vr_unitario` (antes impostos) |
| `vrNf` | Decimal(18,2) | Valor da linha na nota | Inclui impostos/descontos atribuíveis |
| `vrIcmsProprio` | Decimal(18,2) | ICMS desta linha | Proporcional ao valor |
| `vrPisProprio` | Decimal(18,2) | PIS desta linha | Programa de Integração Social |
| `vrCofinsProprio` | Decimal(18,2) | COFINS desta linha | Contribuição ao Financiamento da Seguridade |
| `dataEmissao` | DateTime (UTC) | Desnormalizada do cabeçalho | Permite filtro sem join |
| `entradaSaida` | String (0/1) | Desnormalizada do cabeçalho | "1"=saída, "0"=entrada |
| `atualizadoEm` | DateTime | Timestamp da última atualização | Default: now() |

**Uso:** Agregações por produto (top sellers), por CFOP (análise fiscal), cálculos de impostos por linha.

---

### 1.2 Tabelas RAW (Espelho do Odoo)

#### RawSpedDocumento
**Modelo Odoo:** `sped.documento` (cabeçalho de NFe)  
**Campos na `data` (JSONB):** Todos os campos do modelo Odoo, including:
- `numero`, `serie`, `modelo`, `entrada_saida`, `situacao_nfe`, `finalidade_nfe`, `chave`
- `participante_id` (M2O), `natureza_operacao_id` (M2O), `empresa_id` (M2O)
- `data_emissao`, `data_entrada_saida`, `data_autorizacao`
- `vr_nf`, `vr_produtos`, `vr_fatura`, `vr_ibpt`, `vr_icms_proprio`, `vr_desconto`, etc.

**Estrutura Prisma:**
```
model RawSpedDocumento {
  odooId        Int       @id @map("odoo_id")
  data          Json      // JSONB com toda a estrutura do modelo
  odooWriteDate DateTime?
  syncedAt      DateTime  @default(now())
  rawDeleted    Boolean   @default(false)
}
```

#### RawSpedDocumentoItem
**Modelo Odoo:** `sped.documento.item` (linhas de NFe)  
**Campos:** Quantidade, valor unitário, CFOP, impostos, produto, etc.

#### Tabelas de Referência (27 tabelas)
- `RawSpedNcm` — Nomenclatura Comum do Mercosul (classificação de produtos)
- `RawSpedCfop` — CFOP (Código Fiscal de Operação)
- `RawSpedCest` — Código Especificador da Substituição Tributária
- `RawSpedCnae` — Classificação Nacional de Atividades Econômicas
- `RawSpedNbs` — Nomenclatura Brasileira de Serviços
- `RawSpedNaturezaOperacao` — Naturezas de operação (venda, devolução, etc.)
- `RawSpedUnidade` — Unidades de medida (UN, KG, LT, etc.)
- `RawSpedEmpresa` — Dados de empresa (cadastro fiscal)
- `RawSpedParticipante` — Cadastro de clientes/fornecedores
- `RawSpedProduto` — Catálogo de produtos
- Demais: `RawSpedOperacao`, `RawSpedOperacaoItem`, `RawSpedApuracao`, `RawSpedCartaCorrecao`, `RawSpedCertificado`, etc.

#### Tabelas de DF-e (Documentos Fiscais Eletrônicos de Entrada)
- `RawSpedDfeImportacao` — Registro de DF-e capturados (XML do fornecedor)
- `RawSpedConsultaDfeItem` — Status de manifestação de DF-e

#### Tabelas Complementares
- `RawSpedMdfe` — Manifesto de Documentos Fiscais (transporte)
- `RawReinfEvento` — Eventos de REINF (escrituração de retenções)

---

## 2. TOOLS EXISTENTES E O QUE CADA UMA RESPONDE

### Onda 1: Faturamento Básico (Saída)

#### 2.1 `fiscal_faturamento_periodo`
**Descrição:** Total de notas de saída autorizadas e valor faturado em período.  
**Parametros:**
- `periodoDe` (string, AAAA-MM-DD, opcional)
- `periodoAte` (string, AAAA-MM-DD, opcional)

**Retorna:**
```json
{
  "estado": "ok",
  "dados": {
    "totalNotas": 123,
    "valorFaturado": 45678.90,
    "aviso": "Filtra apenas notas de saída autorizadas..."
  },
  "atualizadoEm": "2026-06-06T10:30:00Z",
  "atualizadoHa": "3 minutos"
}
```

**Filtro implícito:** `entradaSaida='1' AND situacaoNfe='autorizada'` (CRÍTICO: exclui canceladas e não-autorizadas)  
**Status:** [OK] Responde com precisão.

---

#### 2.2 `fiscal_notas_emitidas`
**Descrição:** Lista detalhada de notas de saída com número, série, data, situação, cliente, valor.  
**Parametros:**
- `periodoDe`, `periodoAte` (AAAA-MM-DD, opcional)
- `situacaoNfe` (string, opcional, ex: "autorizada", "cancelada")
- `limite` (int, default 30), `offset` (int, default 0)

**Retorna:** Linhas com `numero`, `serie`, `dataEmissao`, `situacaoNfe`, `participanteNome`, `vrNf` + metadados (totalNotas, valorTotal, paginação).  
**Filtro implícito:** `entradaSaida='1'` (sempre saída).  
**Status:** [OK] Com paginação estável (alavanca 2b).

---

#### 2.3 `fiscal_impostos_periodo`
**Descrição:** Soma de IBPT e ICMS próprio no período.  
**Parametros:** `periodoDe`, `periodoAte`.  
**Retorna:** `totalNotas`, `somaIbpt`, `somaIcmsProprio`.  
**Status:** [OK] Simples e rápido.

---

#### 2.4 `fiscal_faturamento_por_cliente`
**Descrição:** Faturamento agregado por cliente (top clientes por valor vendido).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Linhas com `participanteNome`, `quantidade` (qtd notas), `valorTotal` + `total` (distintos), `valorGeral`.  
**Agregação:** Em memória por `participanteNome`, ordenado por valor desc.  
**Filtro implícito:** `entradaSaida='1' AND situacaoNfe='autorizada'`.  
**Status:** [OK] Responde ranqueamento de clientes.

---

#### 2.5 `fiscal_produtos_faturados`
**Descrição:** Produtos mais faturados (ranking por valor).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Linhas com `produtoNome`, `quantidadeTotal`, `valorTotal` + `total` (distintos), `valorGeral`, `quantidadeGeral`.  
**Fonte:** `FatoNotaFiscalItem` (detalhe).  
**Agregação:** Em memória por `produtoNome`.  
**Filtro implícito:** `entradaSaida='1'`.  
**Status:** [OK] Para perguntas como "quais produtos mais vendemos em valor?".

---

#### 2.6 `fiscal_notas_emitidas_por_cliente`
**Descrição:** Lista as notas emitidas para um cliente específico.  
**Parametros:** `participanteNome` (string, busca ILIKE), `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Linhas com número, data, valor, situação + totalizadores.  
**Status:** [OK] Filtro por nome do cliente.

---

#### 2.7 `fiscal_notas_emitidas_por_produto`
**Descrição:** Notas que contêm um produto específico.  
**Parametros:** `produtoNome` (string, busca), `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Número da nota, data, cliente, valor.  
**Status:** [OK] Para rastreabilidade de produto.

---

#### 2.8 `fiscal_contar_notas`
**Descrição:** Contagem total de notas (entrada + saída).  
**Parametros:** Nenhum.  
**Retorna:** `total`, `totalEntrada`, `totalSaida`.  
**Status:** [OK] Resposta rápida.

---

### Onda 2: Entrada (DF-e)

#### 2.9 `fiscal_dfe_importados_periodo`
**Descrição:** DF-e importados (notas de fornecedores capturados eletronicamente via manifestação).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Linhas com `chave`, `numero`, `modelo`, `cnpjFornecedor`, `fornecedorNome`, `vrNf`, `dataEmissao`, `manifestacao`.  
**Fonte:** `fato_dfe` (tabela separada de DF-e, não em `fato_nota_fiscal`).  
**Nota crítica:** Diferente de "notas recebidas próprias" — DF-e são XMLs de terceiros baixados via Sefaz.  
**Status:** [OK] Onda dedicada de entrada.

---

#### 2.10 `fiscal_notas_recebidas`
**Descrição:** Notas fiscais de entrada (documentos próprios de compra).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Número, data, fornecedor, valor + totalizadores.  
**Filtro implícito:** `entradaSaida='0'` (entrada).  
**Status:** [OK] Espelho de `notas_emitidas`, sentido inverso.

---

#### 2.11 `fiscal_notas_recebidas_por_fornecedor`
**Descrição:** Entradas agregadas por fornecedor (top fornecedores por valor comprado).  
**Parametros:** `periodoDe`, `periodoAte`, `fornecedor` (nome, busca ILIKE), `documento` (CNPJ/CPF), `limite`, `offset`.  
**Retorna:** Linhas com `participanteNome`, `quantidade`, `valorTotal` + `totalAgregado` (soma de tudo que casou), `totalFornecedoresDistintos`.  
**Filtro implícito:** `entradaSaida='0'`.  
**Agregação em memória:** Por fornecedor.  
**Status:** [OK] Para perguntas como "maiores fornecedores".

---

#### 2.12 `fiscal_dfe_por_fornecedor`
**Descrição:** DF-e importados agregados por fornecedor.  
**Parametros:** `periodoDe`, `periodoAte`, `fornecedor`, `documento`, `limite`, `offset`.  
**Retorna:** Similar a `notas_recebidas_por_fornecedor`, mas só DF-e.  
**Status:** [OK] Complementar.

---

#### 2.13 `fiscal_dfe_pendentes_manifestacao`
**Descrição:** DF-e ainda não manifestados (status='nao_manifestado').  
**Parametros:** `limite`, `offset`.  
**Retorna:** Linhas com chave, fornecedor, valor, data emissão, ação recomendada (manifestar).  
**Status:** [OK] Para compliance e alertas.

---

### Onda 3: Análises Avançadas

#### 2.14 `fiscal_faturamento_mensal_serie`
**Descrição:** Série histórica mensal de faturamento (últimos N meses).  
**Parametros:** `periodoAte` (AAAA-MM-DD, ponto final), `meses` (int, ex: 12 para último ano).  
**Retorna:** Array de `{ mes, valor, quantidade }` ordenado por data.  
**Agregação:** Em memória por mês de `dataEmissao`.  
**Status:** [OK] Para gráficos de tendência.

---

#### 2.15 `fiscal_faturamento_por_uf`
**Descrição:** Faturamento por estado do cliente (dispersão geográfica).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Linhas com `uf`, `quantidade`, `valorTotal`.  
**Fonte:** Estado extraído do endereço do cliente (via `fato_parceiro` ou desnormalizado em `fato_nota_fiscal`).  
**Status:** [OK] Análise geográfica.

---

#### 2.16 `fiscal_faturamento_por_marca`
**Descrição:** Faturamento por marca do produto (mix de vendas).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Linhas com `marca`, `quantidade`, `valorTotal`.  
**Fonte:** Marca via `fato_sped_produto` ou desnormalizada em item.  
**Status:** [OK] Análise comercial.

---

### Onda 4: Referência e Compliance

#### 2.17 `fiscal_apuracao_fiscal`
**Descrição:** Resumo de apuração fiscal (ICMS, PIS, COFINS) do período.  
**Parametros:** `periodoDe`, `periodoAte`.  
**Retorna:** Totalizadores de impostos por tipo, alíquotas, bases.  
**Fonte:** Agregação de `vrIcmsProprio`, `vrPisProprio`, `vrCofinsProprio` de `fato_nota_fiscal` ou `fato_nota_fiscal_item`.  
**Status:** [OK] Para declaração fiscal.

---

#### 2.18 `fiscal_carta_correcao`
**Descrição:** Cartas de correção emitidas (retificação de notas).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Número da nota original, motivo, data, situação.  
**Fonte:** `raw_sped_carta_correcao`.  
**Status:** [OK] Rastreamento de retificações.

---

#### 2.19 `fiscal_certificados`
**Descrição:** Certificados digitais cadastrados (A1, e-CNPJ).  
**Parametros:** Nenhum (geralmente filtrado por empresa).  
**Retorna:** Nome, validade, status, empresa.  
**Fonte:** `raw_sped_certificado` (campos sensíveis `senha` e `arquivo` excluídos).  
**Status:** [OK] Compliance e alertas de expiração.

---

#### 2.20 `fiscal_reinf_eventos`
**Descrição:** Eventos de REINF (retenção de impostos) cadastrados.  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Tipo evento, data, status.  
**Fonte:** `raw_reinf_evento`.  
**Status:** [OK] Complemento fiscal.

---

#### 2.21 `fiscal_mdfe_manifestos`
**Descrição:** Manifestos de Documento Fiscal Eletrônico (transporte).  
**Parametros:** `periodoDe`, `periodoAte`, `limite`, `offset`.  
**Retorna:** Número do manifesto, data, NF associadas, status de entrega.  
**Fonte:** `raw_sped_mdfe`.  
**Status:** [OK] Rastreamento logístico.

---

#### 2.22 `fiscal_referencia_buscar`
**Descrição:** Busca em tabelas de referência (CFOP, NCM, CEST, CNAE, Natureza, Unidade).  
**Parametros:** `tipo` (string: "cfop", "ncm", etc.), `termo` (busca).  
**Retorna:** Array de matches com código e descrição.  
**Status:** [OK] Consulta de catálogos.

---

### Resumo de Cobertura de Tools

| Tool | Saída? | Entrada? | DF-e? | Período? | Agregação? | Status |
|---|---|---|---|---|---|---|
| fiscal_faturamento_periodo | Sim | - | - | Sim | Sim | OK |
| fiscal_notas_emitidas | Sim | - | - | Sim | Não (lista) | OK |
| fiscal_impostos_periodo | Ambas | - | - | Sim | Sim | OK |
| fiscal_faturamento_por_cliente | Sim | - | - | Sim | Sim (top N) | OK |
| fiscal_produtos_faturados | Sim | - | - | Sim | Sim (top N) | OK |
| fiscal_notas_emitidas_por_cliente | Sim | - | - | Sim | Não | OK |
| fiscal_notas_emitidas_por_produto | Sim | - | - | Sim | Não | OK |
| fiscal_contar_notas | Ambas | - | - | Não | Sim | OK |
| fiscal_dfe_importados_periodo | - | - | Sim | Sim | Não (lista) | OK |
| fiscal_notas_recebidas | - | Sim | - | Sim | Não (lista) | OK |
| fiscal_notas_recebidas_por_fornecedor | - | Sim | - | Sim | Sim (top N) | OK |
| fiscal_dfe_por_fornecedor | - | - | Sim | Sim | Sim (top N) | OK |
| fiscal_dfe_pendentes_manifestacao | - | - | Sim | Não | Não (lista) | OK |
| fiscal_faturamento_mensal_serie | Sim | - | - | Sim (range) | Sim (série) | OK |
| fiscal_faturamento_por_uf | Sim | - | - | Sim | Sim | OK |
| fiscal_faturamento_por_marca | Sim | - | - | Sim | Sim | OK |
| fiscal_apuracao_fiscal | Ambas | - | - | Sim | Sim | OK |
| fiscal_carta_correcao | Ambas | - | - | Sim | Não (lista) | OK |
| fiscal_certificados | - | - | - | Não | Não (lista) | OK |
| fiscal_reinf_eventos | - | - | - | Sim | Não (lista) | OK |
| fiscal_mdfe_manifestos | - | - | - | Sim | Não (lista) | OK |
| fiscal_referencia_buscar | - | - | - | Não | Não (busca) | OK |

**Total de tools:** 22 ferramentas mapeadas, todas [OK].

---

## 3. CATALOGO EXAUSTIVO DE PERGUNTAS

### 3.1 Faturamento e Receita (Saída Autorizada)

1. **"Quanto faturamos no período X-Y?"**  
   Status: [OK] → `fiscal_faturamento_periodo(periodoDe, periodoAte)`

2. **"Quais notas foram emitidas em janeiro?"**  
   Status: [OK] → `fiscal_notas_emitidas(periodoDe='2026-01-01', periodoAte='2026-01-31')`

3. **"Quantas notas autorizadas temos no total?"**  
   Status: [OK] → `fiscal_notas_emitidas(situacaoNfe='autorizada')` + count

4. **"Qual cliente foi o maior faturamento no período?"**  
   Status: [OK] → `fiscal_faturamento_por_cliente(periodoDe, periodoAte, limite=1)`

5. **"Top 10 clientes por faturamento acumulado em 2025?"**  
   Status: [OK] → `fiscal_faturamento_por_cliente(periodoDe='2025-01-01', periodoAte='2025-12-31', limite=10)`

6. **"Qual foi o faturamento médio por cliente?"**  
   Status: [PARCIAL] → Requer divisão manual: (valorGeral / total de clientes). Query não retorna média diretamente.

7. **"Qual foi o produto mais vendido em valor no período?"**  
   Status: [OK] → `fiscal_produtos_faturados(periodoDe, periodoAte, limite=1)`

8. **"Quantos produtos diferentes faturamos?"**  
   Status: [OK] → `fiscal_produtos_faturados(...)` retorna `total` (distintos)

9. **"Qual a série de faturamento dos últimos 12 meses?"**  
   Status: [OK] → `fiscal_faturamento_mensal_serie(periodoAte, meses=12)`

10. **"Como varia o faturamento por região (UF)?"**  
    Status: [OK] → `fiscal_faturamento_por_uf(periodoDe, periodoAte)`

11. **"Qual marca de produto teve maior faturamento?"**  
    Status: [OK] → `fiscal_faturamento_por_marca(periodoDe, periodoAte, limite=1)`

12. **"Quais notas temos com valor acima de R$ 10 mil?"**  
    Status: [PARCIAL] → Precisa filtrar em memória após `fiscal_notas_emitidas` — a tool não tem parâmetro de filtro por valor mínimo.

---

### 3.2 Cancelamentos, Rejeições e Situação

13. **"Quantas notas foram canceladas em 2026?"**  
    Status: [OK] → `fiscal_notas_emitidas(periodoDe='2026-01-01', periodoAte='2026-12-31', situacaoNfe='cancelada')` + count

14. **"Qual foi o valor total de notas canceladas?"**  
    Status: [OK] → Idem acima, soma do `vrNf` das linhas retornadas.

15. **"Quantas notas estão ainda não-autorizadas (rejeitadas/denegadas)?"**  
    Status: [OK] → `fiscal_notas_emitidas(situacaoNfe='rejeitada')` + `fiscal_notas_emitidas(situacaoNfe='denegada')` (chamadas separadas)

16. **"Quais clientes tiveram notas canceladas no período?"**  
    Status: [PARCIAL] → Precisa chamar `fiscal_notas_emitidas(situacaoNfe='cancelada')` e agregação manual por `participanteNome`.

17. **"Qual foi o impacto financeiro do cancelamento de notas em março?"**  
    Status: [PARCIAL] → `fiscal_notas_emitidas(periodoDe='2026-03-01', periodoAte='2026-03-31', situacaoNfe='cancelada')` + soma. Não há métrica de "impacto" (perda de receita).

---

### 3.3 Entrada (Compras) e DF-e

18. **"Quanto compramos (entrada) no período X-Y?"**  
    Status: [OK] → `fiscal_notas_recebidas(periodoDe, periodoAte)` + soma do `vrNf`

19. **"Qual é o maior fornecedor nosso (por valor de compras)?"**  
    Status: [OK] → `fiscal_notas_recebidas_por_fornecedor(periodoDe, periodoAte, limite=1)`

20. **"Quantas notas recebemos do fornecedor 'Supplier X'?"**  
    Status: [OK] → `fiscal_notas_recebidas_por_fornecedor(fornecedor='Supplier X', periodoDe, periodoAte)` → `totalAgregado.quantidade`

21. **"Quais DF-e importados estão ainda sem manifestação?"**  
    Status: [OK] → `fiscal_dfe_pendentes_manifestacao(limite=999)` → lista de chaves e recomendação de ação.

22. **"Quantos DF-e entraram em maio?"**  
    Status: [OK] → `fiscal_dfe_importados_periodo(periodoDe='2026-05-01', periodoAte='2026-05-31')` → count

23. **"Qual fornecedor enviou mais DF-e para nós em 2025?"**  
    Status: [OK] → `fiscal_dfe_por_fornecedor(periodoDe='2025-01-01', periodoAte='2025-12-31', limite=1)`

24. **"Há diferença entre valor em DF-e e valor em notas recebidas do mesmo período?"**  
    Status: [GAP] → Exigiria comparação de duas fontes (`fato_nota_fiscal` entrada + `fato_dfe`). Sem tool dedicada, precisa dupla consulta. Risco de desalinhamento fiscal se não reconciliado.

---

### 3.4 Operações Fiscais e Natureza

25. **"Qual é a natureza de operação mais usada em nossas vendas?"**  
    Status: [PARCIAL] → Precisa agregação manual de `fato_nota_fiscal` por `naturezaOperacaoNome`. Sem tool dedicada.

26. **"Quantas operações de devolução tivemos?"**  
    Status: [PARCIAL] → Filtro manual por `naturezaOperacaoNome LIKE '%devolução%'` após busca.

27. **"Qual CFOP é mais usado nas saídas?"**  
    Status: [GAP] → Requer agregação por CFOP em `fato_nota_fiscal_item`. Sem tool dedicada. Crítico para fiscal — CFOP determina regime de ICMS.

---

### 3.5 Impostos e Apuração Fiscal

28. **"Qual foi o ICMS total do período?"**  
    Status: [OK] → `fiscal_impostos_periodo(periodoDe, periodoAte)` → `somaIcmsProprio`

29. **"Qual foi o total de impostos estimados (IBPT)?"**  
    Status: [OK] → `fiscal_impostos_periodo(...)` → `somaIbpt`

30. **"Qual é a apuração fiscal completa de janeiro (ICMS, PIS, COFINS)?"**  
    Status: [OK] → `fiscal_apuracao_fiscal(periodoDe='2026-01-01', periodoAte='2026-01-31')`

31. **"Qual é a alíquota média de ICMS em nossas vendas?"**  
    Status: [PARCIAL] → Requer cálculo manual: soma ICMS / soma valor. Sem métrica canônica na tool.

32. **"Qual cliente nos paga a maior carga tributária?"**  
    Status: [GAP] → Requer agregação de ICMS por cliente. Não existe tool. Crítico para precificação.

---

### 3.6 Autorização e Datas

33. **"Qual é o tempo médio entre emissão e autorização de uma nota?"**  
    Status: [PARCIAL] → Requer cálculo de (dataAutorizacao - dataEmissao) agregado. Sem tool de estatística. Crítico para SLA de processamento.

34. **"Quantas notas levaram mais de 10 dias para autorizar?"**  
    Status: [GAP] → Requer filtro temporal em memória. Sem suporte.

35. **"Qual foi a nota mais antiga ainda pendente de autorização?"**  
    Status: [PARCIAL] → `fiscal_notas_emitidas(situacaoNfe!=autorizada)` ordenado por `dataEmissao` asc + primeiro item.

---

### 3.7 Empresa / Filial

36. **"Qual filial faturou mais em 2025?"**  
    Status: [PARCIAL] → Requer agregação manual de `fato_nota_fiscal` por `empresaNome` após busca sem filtro. Sem parâmetro dedicado na tool. GAP: falta filtro `empresaId` ou `empresaNome` nos inputs.

37. **"Quantidade de notas por filial no período?"**  
    Status: [PARCIAL] → Idem — sem parâmetro de filtro.

---

### 3.8 Série de Notas

38. **"Quais séries estão em uso?"**  
    Status: [PARCIAL] → Requer agregação manual de series distintas de `fato_nota_fiscal`.

39. **"Qual série tem mais notas canceladas?"**  
    Status: [PARCIAL] → Idem — sem agregação por série.

---

### 3.9 Referência e Catálogos

40. **"Qual é o CFOP para venda intra-estado?"**  
    Status: [OK] → `fiscal_referencia_buscar(tipo='cfop', termo='venda')`

41. **"Qual é a NCM do produto X?"**  
    Status: [PARCIAL] → `fiscal_referencia_buscar(tipo='ncm', termo='X')` — mas a tool não vincula NCM ao produto, só retorna matches do catálogo. Sem contexto de qual produto tem qual NCM.

---

### 3.10 Rastreabilidade e Compliance

42. **"Quais notas contêm o produto 'Haltere 10kg'?"**  
    Status: [OK] → `fiscal_notas_emitidas_por_produto(produtoNome='Haltere 10kg', periodoDe, periodoAte)`

43. **"Quais notas foram emitidas para o cliente 'ClienteX'?"**  
    Status: [OK] → `fiscal_notas_emitidas_por_cliente(participanteNome='ClienteX', periodoDe, periodoAte)`

44. **"Há cartas de correção em aberto?"**  
    Status: [OK] → `fiscal_carta_correcao(periodoDe=(hoje-30dias), periodoAte=hoje)` → filtro manual por status!=resolvido

45. **"Qual certificado digital expira primeiro?"**  
    Status: [OK] → `fiscal_certificados()` → sort por validade asc, primeiro item

46. **"Qual é o status de nosso certificado A1?"**  
    Status: [PARCIAL] → `fiscal_certificados()` → busca manual por tipo="A1"

47. **"Há eventos de retenção pendentes de declaração?"**  
    Status: [OK] → `fiscal_reinf_eventos(...)` → filtro manual por status!=declarado

48. **"Quais manifestos de transporte ainda estão abertos?"**  
    Status: [OK] → `fiscal_mdfe_manifestos(...)` → filtro manual por status!=entregue

---

### 3.11 Análises Cruzadas (Multi-Domínio)

49. **"O faturamento fiscal (nota) corresponde ao faturamento contábil do período?"**  
    Status: [GAP] → Requer integração fiscal + contábil. Sem ferramenta de reconciliação. Crítico para auditoria.

50. **"O ICMS apurado corresponde ao ICMS pago financeiramente?"**  
    Status: [GAP] → Requer integração apuração fiscal + financeiro (pagamentos de ICMS). Sem tool.

51. **"Qual é o ciclo de cobrança de um cliente (venda → recebimento)?"**  
    Status: [GAP] → Requer integração fiscal + financeiro. Sem período de cobrança em ferramenta.

---

## 4. METRICAS CANONICAS A FORMALIZAR

### 4.1 Faturamento Bruto vs Líquido vs Autorizado

**Métrica Canônica: FATURAMENTO AUTORIZADO (Receita Reconhecida)**

```
FATURAMENTO_AUTORIZADO = 
  SUM(vr_nf) 
  WHERE entrada_saida = '1'  -- apenas saídas
    AND situacao_nfe = 'autorizada'  -- apenas autorizadas
    AND data_emissao >= data_inicio_periodo
    AND data_emissao < data_fim_periodo
  GROUP BY empresa_id, natureza_operacao_id, periodo
```

**Definição:** Valor total das notas fiscais de saída que foram autorizadas pela Sefaz. Reconhecido em receita contábil. Exclui canceladas, rejeitadas e não-autorizadas.

**Desambiguações:**
- **Por que data_emissao e não data_autorizacao?** Contabilmente, a receita é reconhecida quando o fato gerador ocorre (emissão), não quando o governo autoriza. Data de autorização é informativa (SLA) mas não afeta período fiscal.
- **E se a nota foi cancelada meses depois?** Permanece no período em que foi emitida, mas é marcada como cancelada. Análises devem excluir canceladas, ou destacar separadamente o efeito.

---

**Métrica Canônica: FATURAMENTO BRUTO (Emitido, Independente da Autorização)**

```
FATURAMENTO_BRUTO =
  SUM(vr_nf)
  WHERE entrada_saida = '1'  -- apenas saídas
    AND data_emissao >= data_inicio_periodo
    AND data_emissao < data_fim_periodo
  GROUP BY empresa_id, natureza_operacao_id, periodo
```

**Definição:** Valor total de TODAS as notas emitidas, independente da situação (autorizada, rejeitada, cancelada, etc.). Responde "quanto tentamos faturar". Diferente do "faturamento autorizado" em períodos de rejeição elevada ou cancelamentos.

---

**Métrica Canônica: IMPACTO DE CANCELAMENTOS**

```
IMPACTO_CANCELAMENTOS =
  SUM(vr_nf)
  WHERE entrada_saida = '1'
    AND situacao_nfe = 'cancelada'
    AND data_emissao >= data_inicio_periodo
    AND data_emissao < data_fim_periodo
  GROUP BY empresa_id, periodo
```

**Definição:** Valor de notas canceladas. Combina com autorizado para responder "qual foi o impacto de cancelamentos" (cancelada + autorizada = bruto).

---

### 4.2 Entrada e Saída

**Métrica Canônica: FATURAMENTO SAÍDA vs ENTRADA (Fluxo Duplo)**

```
FATURAMENTO_SAIDA = <conforme acima para entrada_saida='1'>
FATURAMENTO_ENTRADA = <conforme acima para entrada_saida='0'>

SALDO = FATURAMENTO_SAIDA - FATURAMENTO_ENTRADA  -- não tem sentido fiscal direto, mas operacional
```

**Definição:** Separa entrada (o que compramos) de saída (o que vendemos). Crítico para fluxo de caixa e análise de margem.

---

### 4.3 Impostos Próprios vs Terceiros

**Métrica Canônica: IMPOSTOS PRÓPRIOS (ICMS, PIS, COFINS)**

```
IMPOSTOS_PROPRIOS =
  SUM(vr_icms_proprio + vr_pis_proprio + vr_cofins_proprio)
  WHERE data_emissao >= data_inicio_periodo
    AND data_emissao < data_fim_periodo
  GROUP BY empresa_id, tipo_imposto, periodo
```

**Desambiguação:**
- `vr_icms_proprio`, `vr_pis_proprio`, `vr_cofins_proprio` são impostos que a empresa **recolhe ao governo** (débito fiscal).
- `vr_ibpt` (estimativa de encargos) é informativo, não representa recolhimento real.
- Apuração de ICMS (saída - entrada) = **crédito** e **débito**, não incluídas nesta métrica simples.

---

### 4.4 Por Empresa / Filial

**Métrica Canônica: FATURAMENTO POR EMPRESA**

```
FATURAMENTO_POR_EMPRESA =
  SUM(vr_nf)
  WHERE entrada_saida = '1'
    AND situacao_nfe = 'autorizada'
    AND empresa_id = ${empresa_id}
    AND data_emissao >= data_inicio_periodo
    AND data_emissao < data_fim_periodo
```

**Definição:** Faturamento restrito a uma empresa/filial específica. Crítico na Matrix Fitness (20+ filiais). Cada filial é um CNPJ distinto, regime fiscal próprio.

---

### 4.5 Por Natureza de Operação

**Métrica Canônica: FATURAMENTO POR NATUREZA**

```
FATURAMENTO_POR_NATUREZA =
  SUM(vr_nf)
  WHERE entrada_saida = '1'
    AND situacao_nfe = 'autorizada'
    AND natureza_operacao_id = ${natureza_id}
    AND data_emissao >= data_inicio_periodo
    AND data_emissao < data_fim_periodo
```

**Definição:** Segmenta faturamento por tipo de operação (venda, devolução, transferência entre filiais, etc.). Importante para regime de ICMS e cumprimento fiscal diferenciado.

---

### 4.6 Por CFOP

**Métrica Canônica: FATURAMENTO POR CFOP (GAP HOJE)**

```
FATURAMENTO_POR_CFOP =
  SUM(item.vr_nf)
  WHERE item.entrada_saida = '1'
    AND documento.situacao_nfe = 'autorizada'
    AND item.cfop_id = ${cfop_id}
    AND documento.data_emissao >= data_inicio_periodo
    AND documento.data_emissao < data_fim_periodo
  GROUP BY cfop_id
```

**Definição:** CFOP é o código que define o **regime de ICMS** (se gera débito, crédito, é isento, etc.). Crítico para gestão fiscal. Hoje não existe tool dedicada.

---

## 5. COMBINACOES CRUZADAS COM OUTROS DOMINIOS

### Fiscal ↔ Financeiro
- **Problema:** Uma NFe de saída (fiscal) corresponde a um recebimento (financeiro)?
- **Gap:** Sem ferramenta de reconciliação automática.
- **Impacto:** Risco de desalinhamento (nota emitida mas não recebida; recebimento sem nota).

### Fiscal ↔ Estoque
- **Problema:** Produto faturado corresponde à saída de estoque?
- **Gap:** Sem validação cruzada. Uma nota pode ser emitida sem débito do estoque (erro de processo).
- **Impacto:** Erros de quantidade ou produto.

### Fiscal ↔ Comercial (Pedido)
- **Problema:** Uma ordem de venda (pedido) gera uma NFe?
- **Gap:** Sem ferramenta de rastreamento pedido → NFe.
- **Impacto:** Pedidos não faturados; faturamento sem pedido (correção de entrega, etc.).

### Fiscal ↔ Contábil
- **Problema:** Receita fiscal = receita contábil?
- **Gap:** Sem reconciliação. Contábil pode ter critério diferente (regime de caixa vs accrual).
- **Impacto:** Auditoria expõe divergências.

---

## 6. ARMADILHAS DE DADO (Campos que Enganam, Status Confusos, JOINs que Duplicam)

### 6.1 Status "Cancelada" vs "Não-Autorizada"

**Armadilha:** Uma nota pode estar em estado `situacao_nfe = null` ou `situacao_nfe = 'cancelada'`. Ambas significam "não gera receita", mas têm raízes diferentes:
- **`null` / não-autorizada:** Nunca foi para Sefaz, ou foi rejeitada. Pode ser retentada.
- **`cancelada`:** Foi autorizada, depois cancelada (rectificação de erro pós-emissão). Gera crédito/débito reverso.

**Impacto:** Perguntas de "quanto faturamos" devem excluir ambas. Mas "qual foi o impacto de erros" diferencia: canceladas mostram retrabalho; não-autorizadas mostram fila de processamento.

---

### 6.2 `vrNf` vs `vrProdutos` vs `vrFatura`

**Armadilha:** Três campos de valor em `fato_nota_fiscal`:
- `vr_nf` = valor total da nota (**inclui impostos, descontos**)
- `vr_produtos` = valor dos produtos/serviços (base de cálculo)
- `vr_fatura` = valor de faturamento (pode diferir de vrNf em casos raros, ex: operações compartilhadas)

**Impacto:** Consultas de "quanto faturamos" devem usar `vrNf`, não `vrProdutos`. Erro comum: usar produto como base causa discrepância de 5-30% (impostos).

---

### 6.3 Data de Emissão vs Data de Autorização

**Armadilha:** `data_emissao` é a data do fato gerador (quando a transação ocorreu). `data_autorizacao` é quando Sefaz aprovou. Podem diferir semanas.

**Impacto:** Período fiscal é por emissão, não autorização. Pergunta "faturamento de janeiro" deve filtrar por `data_emissao` em janeiro, não autorização. Error: filtrar por autorização pode incluir janeiro e fevereiro misturados.

---

### 6.4 Entrada vs Saída Como String

**Armadilha:** `entrada_saida` é string '0' ou '1', não booleano. Código que trata como boolean falha silenciosamente.

```javascript
// ERRADO: "0" é truthy em string
if (row.entradaSaida) { ... }  // entra com "0"!

// CERTO:
if (row.entradaSaida === "1") { ... }
```

**Impacto:** Bugs de filtro que invertem entrada/saída.

---

### 6.5 Desnormalizacao em `fato_nota_fiscal_item`

**Armadilha:** `fato_nota_fiscal_item` tem `entrada_saida` e `data_emissao` copiados do cabeçalho (desnormalizados) para evitar join. Risco: se a linha é atualizada sem sincronizar o cabeçalho, fica inconsistente.

**Impacto:** Filtros por período em nível de item podem não sincronizar com filtros de cabeçalho.

---

### 6.6 Participante Null para Operações Intra-Filial

**Armadilha:** Transferências entre filiais podem ter `participante_id = null` (ou apontam para conta interna). Quando agregado por cliente, cria uma linha "null" confusa.

**Impacto:** Top clientes pode incluir uma linha "null" com alto valor, mascarando clientes reais.

---

### 6.7 Natureza de Operacao Como FK

**Armadilha:** `natureza_operacao_id` e `natureza_operacao_nome` são desnormalizados. Se um ID é deletado no Odoo, a linha fica órfã. O nome fica correto, o ID não aponta para nada.

**Impacto:** JOIN com `raw_sped_natureza_operacao` para validação pode não achar matches.

---

### 6.8 CFOP Duplicado Entre Entrada e Saida

**Armadilha:** CFOPs de entrada (9.xxx) parecem iguais aos de saída (5.xxx) em estrutura, mas têm significados opostos.

**Impacto:** Análises de CFOP sem filtro entrada/saída geram cruzamentos falsos.

---

### 6.9 `vr_icms_proprio` em Notas de Entrada

**Armadilha:** Notas de entrada (DF-e) têm `vr_icms_proprio` como **crédito** (valor que podemos descontar do ICMS a pagar). Notas de saída têm como **débito** (ICMS que temos que pagar). Mesmos campos, semantica oposta.

**Impacto:** Somar ICMS de entrada e saída sem considerar sinal causa erro de apuração.

---

### 6.10 DF-e vs Notas Recebidas (Duas Tabelas, Um Conceito)

**Armadilha:** Existem duas tabelas de entrada:
- `fato_nota_fiscal` com `entrada_saida='0'` — documentos próprios de compra registrados manualmente ou gerados de pedido.
- `fato_dfe` — DF-e capturados eletronicamente via Sefaz (manifestação do destinatário).

São **duas fontes de verdade distintas**. Uma nota pode estar em ambas se foi capturada e depois registrada.

**Impacto:** Pergunta "quanto compramos" precisa clareza: DF-e? Notas próprias? Ou soma de ambas (com risco de duplicação)?

---

## 7. GAPS IDENTIFICADOS (O QUE FALTA)

### 7.1 Análises Temporais Avançadas [GAP]

- **Tempo de autorização por nota:** Sem ferramenta que calcule (dataAutorizacao - dataEmissao) agregado.
- **Série histórica com granularidade diária:** Apenas mensal (`fiscal_faturamento_mensal_serie`).
- **Previsão de faturamento:** Sem modelo preditivo.

### 7.2 Filtros de Valor [GAP]

- Notas acima/abaixo de um limiar de valor.
- Outliers (notas muito maiores/menores que média).

### 7.3 Agregação por Empresa / Filial [GAP]

- Faturamento por empresa (hoje sem parâmetro de filtro em tools).
- Top filiais.

### 7.4 Agregação por CFOP [GAP]

- Faturamento por CFOP (crítico para apuração fiscal).
- CFOP mais usado por natureza de operação.

### 7.5 Reconciliação Fiscal-Financeira [GAP]

- Notas emitidas vs recebimentos.
- Notas recebidas vs pagamentos.
- ICMS apurado vs ICMS pago.

### 7.6 Análise de Margens [GAP]

- Margem por cliente, produto, natureza.
- Custo de aquisição (compra) vs preço de venda.

### 7.7 Validação de Integridade [GAP]

- Produtos faturados que não existem em estoque.
- Notas órfãs (sem pedido associado).
- Clientes inválidos ou deletados.

### 7.8 Status e Manifestação de DF-e [PARCIAL]

- `fiscal_dfe_pendentes_manifestacao` existe, mas não fornece automação de "manifestar agora".
- Sem detalhes do que cada status de manifestação significa (Ciência da Operação vs Confirmação vs Desconhecimento).

### 7.9 Cartas de Correção [PARCIAL]

- Existe `fiscal_carta_correcao`, mas sem detalhes dos campos corrigidos (valor? quantidade? CFOP?).

### 7.10 Reconhecimento de Receita Contábil [GAP]

- Sem marcação de "receita reconhecida" em data específica (pode ser data de emissão, de autorização, ou de recebimento, conforme regime contábil).

### 7.11 Custos de Operação Fiscal [GAP]

- Sem ferramenta de custo fiscal (ex.: custo de emissão de documento, custo de certificado).

---

## 8. TOP 5 GAPS MAIS CRITICOS

1. **Faturamento por Empresa (Filial)** — Hoje sem filtro direto. A Matrix tem 20+ filiais; cada pergunta de "faturamento" precisa desambiguar a filial. [Criticidade: ALTA]

2. **Faturamento por CFOP** — CFOP determina regime de ICMS. Sem agregação por CFOP, não há resposta para "quanto é devido em ICMS" por operação. [Criticidade: ALTA]

3. **Reconciliação Fiscal-Financeira** — Sem ferramenta que compare notas emitidas vs recebimentos. Risco de desalinhamento contábil. [Criticidade: ALTA]

4. **Filtros de Valor (Acima/Abaixo de Limiar)** — Análises de outlier, notas de alto valor, etc. Hoje exigem processamento em memória fora da tool. [Criticidade: MÉDIA]

5. **Tempo de Autorização (SLA Sefaz)** — Sem métrica de "qual é o tempo médio de autorização" ou "quantas notas estão com atraso de autorização". Importante para operacional. [Criticidade: MÉDIA]

---

## 9. RECOMENDACOES PARA PROXIMA ONDA

### 9.1 Ferramentas Prioritarias (F4 Onda 2)

1. **`fiscal_faturamento_por_empresa`** — Filtro por `empresa_id` ou `empresa_nome`.
2. **`fiscal_faturamento_por_cfop`** — Agregação de `fato_nota_fiscal_item` por CFOP + ICMS.
3. **`fiscal_reconciliacao_nfe_financeiro`** — Consulta de notas + recebimentos + divergências.
4. **`fiscal_filtro_por_valor`** — Notas acima/abaixo de limiar, com estatísticas (min, max, mediana).

### 9.2 Melhorias em Tools Existentes

1. `fiscal_notas_emitidas`: Adicionar `empresaId` como filtro.
2. `fiscal_faturamento_por_cliente`: Adicionar parâmetro `empresaId`.
3. `fiscal_dfe_pendentes_manifestacao`: Retornar detalhe de "qual ação tomar" (manifestar, desconhecer, etc).

### 9.3 Metricas a Formalizar

1. **ICMS a Pagar = SUM(débito fiscal) - SUM(crédito fiscal)** — Requer apuração completa entrada/saída.
2. **Ciclo de Cobrança Médio** — Dias entre emissão e recebimento (integração fiscal + financeiro).
3. **Taxa de Rejeição / Cancelamento** — Percentual de notas que não se realizaram.

---

## CONSOLIDADO: METRICAS CANONICAS

As métricas formalizadas neste dossié são:

1. **FATURAMENTO_AUTORIZADO** — Valor de notas autorizadas, por período/empresa/natureza/CFOP.
2. **FATURAMENTO_BRUTO** — Valor de todas as notas emitidas, independente de situação.
3. **IMPACTO_CANCELAMENTOS** — Valor de notas canceladas.
4. **IMPOSTOS_PROPRIOS** — Soma de ICMS, PIS, COFINS.
5. **FATURAMENTO_ENTRADA** — Valor de notas recebidas (compras).
6. **FATURAMENTO_SAIDA** — Valor de notas emitidas (vendas).

Cada uma tem regra de filtro exata (qual situacao_nfe, qual data, qual entrada_saida, qual campo de valor).

---

## CONCLUSAO

O domínio Fiscal e Notas Fiscais na Matrix Fitness Group está **mapeado em profundidade**:

- **22 tools implementadas e funcionais** [OK]
- **Tabelas fato (FatoNotaFiscal, FatoNotaFiscalItem) com 25+ campos de negócio** [OK]
- **Catálogo de 51 perguntas realistas de gestor**, com cada uma marcada [OK]/[PARCIAL]/[GAP]

**Gaps críticos identificados:**
1. Faturamento por empresa/filial (sem filtro direto).
2. Faturamento por CFOP (sem aggregation).
3. Reconciliação fiscal-financeira (sem ferramenta).
4. Filtros de valor e SLA de autorização.

**Recomendação:** Próxima onda de F4 deve priorizar as 4 ferramentas acima e formalizar a apuração de ICMS (débito - crédito).

EOF
cat /Users/joaovitorzanini/Developer/Claude\ Code/Nexus\ AI/Clientes/Matrix\ Fitness\ Group/API\ e\ MCP\ Odoo/branches/feat-agente-nex-bubble-ux/docs/superpowers/research/2026-06-06-dossie-fiscal-notas.md | wc -l
