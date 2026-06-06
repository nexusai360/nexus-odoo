# Dossier RH e Colaboradores - Análise Completa do Domínio

**Data:** 2026-06-06  
**Analista:** Claude Code (Haiku 4.5)  
**Status:** Análise de GAP — mapeamento exaustivo de dados, fatos e perguntas  
**Escopo:** Domínio "RH e Colaboradores" do ERP Odoo Tauga (Matrix Fitness Group)

---

## Resumo Executivo

O domínio RH no Odoo Tauga é **totalmente VAZIO no cache Postgres**. A Matrix Fitness possui 19 modelos Odoo de RH cadastrados, mas:

- **0 tabelas raw_*** sincronizadas do Odoo
- **0 tabelas fato_*** modeladas
- **0 tools MCP** funcionais (apenas placeholder `rh_status_dominio` respondendo "não operado")
- **0 dados** no cache para consultas do Agente Nex

Este dossier enumera:
1. Todos os modelos RH e sua estrutura
2. Lacunas críticas (o que falta ser construído)
3. Catálogo exaustivo de perguntas de negócio (45+ cenários)
4. Métricas canônicas a formalizar
5. Dependências com outros domínios
6. Armadilhas de dados e status

**Leitura obrigatória antes de qualquer implementação de RH no Nex.**

---

## 1. Tabelas e Campos Disponíveis

### 1.1. Modelos Odoo (Estrutura)

O Odoo Tauga possui **19 modelos de RH**, agrupados em 5 famílias:

#### Família 1: Cadastro de Pessoal e Contratação

| Modelo | Nome Odoo | Descrição | Registros (est.) |
|--------|-----------|-----------|------------------|
| `rh.contrato` | RH - Contrato de Trabalho | Documento de contratação de colaborador | ~50-200 |
| `rh.contrato.ferias` | RH - Férias - Período Aquisitivo | Períodos de aquisição e gozo de férias por contrato | ~100-300 |
| `rh.cargo` | RH - Cargo | Tabela de cargos/posições disponíveis | ~20-50 |
| `rh.cbo` | RH - CBO | Classificação Brasileira de Ocupações (código de profissão) | ~500-5000 |
| `rh.tabela.cbo` | rh.tabela.cbo | Tabela parametrizável de CBO | ~100 |

#### Família 2: Folha de Pagamento

| Modelo | Nome Odoo | Descrição | Registros (est.) |
|--------|-----------|-----------|------------------|
| `rh.holerite` | RH - Holerite | Recibo de pagamento de pessoal individual | ~500-2000 |
| `rh.holerite.item` | RH - Item Holerite | Detalhamento de rubrica em cada holerite | ~5000-10000 |
| `rh.lote.holerite` | RH - Lote de Holerite | Agrupamento de holerites para processamento em lote | ~50-200 |
| `rh.lote.holerite.item` | RH - Item do Lote de Holerite | Referência de holerites no lote | ~500-2000 |
| `rh.rubrica` | RH - Rubrica | Componentes de salário (básico, INSS, IRRF, adicionais, descontos) | ~30-80 |
| `rh.natureza.rubrica` | RH - Natureza das Rubricas | Classificação de rubrica (proventos, descontos, encargos) | ~10-20 |
| `rh.modelo.calculo` | RH - Modelo de Cálculo | Template de cálculo salarial por categoria | ~5-10 |

#### Família 3: Jornada e Ponto

| Modelo | Nome Odoo | Descrição | Registros (est.) |
|--------|-----------|-----------|------------------|
| `rh.jornada` | RH - Escala de Trabalho | Escala de jornada (ex: 8h/dia, 6h/dia) | ~10-30 |
| `rh.horario.trabalho` | RH - Horário de Trabalho | Horários de entrada/saída por jornada | ~20-50 |
| `rh.ponto` | RH - Ponto | Registro consolidado de ponto/frequência por colaborador | ~5000-20000 |
| `rh.ponto.marcacao` | RH - Ponto - Marcação | Marcação individual de entrada/saída (timeclock raw) | ~50000-200000 |
| `rh.ponto.pausa` | RH - Ponto - Pausa | Pausas e intervalos registrados dentro da jornada | ~10000-50000 |

#### Família 4: Afastamento

| Modelo | Nome Odoo | Descrição | Registros (est.) |
|--------|-----------|-----------|------------------|
| `rh.afastamento` | RH - Afastamento | Registros de afastamento (licença, suspensão, etc.) | ~100-500 |

#### Família 5: Configuração e Impressão

| Modelo | Nome Odoo | Descrição | Registros (est.) |
|--------|-----------|-----------|------------------|
| `rh.modelo.impressao` | Impressos (RH) | Templates de impressão de documentos RH | ~5-20 |

---

### 1.2. Cache Postgres (Tabelas raw_*)

**Status:** NENHUMA tabela sincronizada.

```
raw_rh_contrato               ← NÃO EXISTE
raw_rh_contrato_ferias        ← NÃO EXISTE
raw_rh_cargo                  ← NÃO EXISTE
raw_rh_cbo                    ← NÃO EXISTE
raw_rh_holerite               ← NÃO EXISTE
raw_rh_holerite_item          ← NÃO EXISTE
raw_rh_lote_holerite          ← NÃO EXISTE
raw_rh_lote_holerite_item     ← NÃO EXISTE
raw_rh_jornada                ← NÃO EXISTE
raw_rh_horario_trabalho       ← NÃO EXISTE
raw_rh_ponto                  ← NÃO EXISTE
raw_rh_ponto_marcacao         ← NÃO EXISTE
raw_rh_ponto_pausa            ← NÃO EXISTE
raw_rh_rubrica                ← NÃO EXISTE
raw_rh_natureza_rubrica       ← NÃO EXISTE
raw_rh_modelo_calculo         ← NÃO EXISTE
raw_rh_afastamento            ← NÃO EXISTE
raw_rh_modelo_impressao       ← NÃO EXISTE
raw_rh_tabela_cbo             ← NÃO EXISTE
```

**Ação necessária:** Adicionar os 19 modelos ao `src/worker/catalog/model-catalog.ts` (modo `incremental` para contrato/holerite/ponto/afastamento; `snapshot` para tabelas de referência como cargo/cbo/jornada/rubrica).

---

### 1.3. Campos Esperados (Estrutura Estimada)

Baseado em padrão Odoo customizado Brasil (via OCA Brasil):

#### rh.contrato (Contrato de Trabalho)

Campos esperados:
- `nome` / `numero_contrato` — identificador
- `colaborador_id` → `res.partner` (FK a parceiro/colaborador)
- `empresa_id` → `res.company` (FK a empresa/filial)
- `departamento` ou `area_id` — departamento/área do colaborador
- `cargo_id` → `rh.cargo` (posição do colaborador)
- `data_inicio` — data de admissão
- `data_fim` — data de demissão (se ativo)
- `status` / `ativo` — ativo/inativo/suspenso
- `salario_base` — salário mensal base
- `cbo_id` → `rh.cbo` (classificação de ocupação)
- `jornada_id` → `rh.jornada` (escala de trabalho)
- `create_date`, `write_date` — metadados

#### rh.holerite (Recibo de Pagamento)

Campos esperados:
- `numero` / `name` — número do holerite
- `mes`, `ano` — mês/ano de referência
- `colaborador_id` → `rh.contrato` ou `res.partner`
- `data_pagamento` — quando foi/será pago
- `salario_bruto` — soma de proventos
- `total_descontos` — soma de descontos
- `liquido` — salário líquido (bruto - descontos)
- `status` — aberto, processado, pago, cancelado
- `lote_id` → `rh.lote.holerite` (referência ao lote)
- `item_ids` → `rh.holerite.item` (1:N relação a rubricas)

#### rh.holerite.item (Item de Rubrica)

Campos esperados:
- `holerite_id` → `rh.holerite` (FK pai)
- `rubrica_id` → `rh.rubrica` (qual rubrica)
- `valor` — valor bruto dessa rubrica
- `desconto` — desconto dessa rubrica (se aplicável)
- `descricao` — texto da rubrica no holerite

#### rh.ponto (Consolidação de Ponto)

Campos esperados:
- `colaborador_id` → `rh.contrato`
- `data` ou `periodo` — mês/ano
- `dias_trabalhados` — quantos dias efetivos
- `horas_trabalhadas` — total de horas
- `horas_extras` — horas extras realizadas
- `faltas` — dias de falta
- `atrasos` — quantidade de atrasos
- `marcacoes_ids` → `rh.ponto.marcacao` (1:N detalhes)

#### rh.ponto.marcacao (Timeclock)

Campos esperados:
- `ponto_id` → `rh.ponto` (FK consolidação)
- `data` — data da marcação
- `hora_entrada` — hora de entrada
- `hora_saida` — hora de saída
- `tipo` — "entrada", "saída", "pausa_inicio", "pausa_fim"
- `comentario` — motivo de atraso/saída antecipada

---

### 1.4. Tabelas de Fatos (Esperadas)

Nenhuma fato existe hoje. Seguem as que seriam necessárias:

| Fato | Descrição | Método de Cálculo |
|------|-----------|-------------------|
| `fato_colaborador` | Snapshot de colaborador ativo/inativo | Derivado de raw_rh_contrato com agregações |
| `fato_folha_pagamento` | Consolidação de holerite e rubricas | Soma de raw_rh_holerite + raw_rh_holerite_item |
| `fato_ponto_consolidado` | Consolidação diária/mensal de frequência | Derivado de raw_rh_ponto + raw_rh_ponto_marcacao |
| `fato_cargo_departamento` | Matriz de colaboradores por cargo/depto | Cruzamento de raw_rh_contrato + raw_rh_cargo + raw_rh_jornada |
| `fato_rubrica_movimento` | Histórico de movimentação de rubricas | raw_rh_holerite_item por período |
| `fato_afastamento` | Registros de afastamento por motivo | raw_rh_afastamento com datas |

---

## 2. Tools MCP Existentes e Escopo

### 2.1. Status Atual

**Ferramenta única:** `rh_status_dominio` (placeholder)

```typescript
// mcp/tools/dominios-vazios/rh-status-dominio.ts
id: "rh_status_dominio"
input: {} (sem parâmetros)
output: {
  dominio: "rh",
  operado: false,
  registros: 0,
  mensagem: "O domínio RH existe no Odoo da Matrix mas não é operado..."
}
```

**O que faz HOJE:** retorna resposta honesta de que RH não está integrado.

**O que deveria fazer:** (vazio, a ser implementado)

---

### 2.2. Tools Necessárias (Escopo Futuro)

Baseado no catálogo de perguntas (§3), as tools deveriam responder:

**Leitura — Colaboradores e Contratação:**
- `colaborador_listar` — lista todos os colaboradores ativos por empresa/depto
- `colaborador_detalhe` — informações completas de um colaborador
- `colaborador_por_cargo` — colaboradores filtrados por cargo
- `colaborador_por_departamento` — colaboradores filtrados por departamento
- `colaborador_admissoes_periodo` — novos colaboradores em um período
- `colaborador_demissoes_periodo` — demissões em um período

**Leitura — Folha de Pagamento:**
- `holerite_por_periodo` — holerites processados em mês/ano
- `holerite_detalhe` — rubrica por rubrica de um holerite
- `folha_consolidada_mes` — consolidação total de folha (bruto, descontos, líquido)
- `rubrica_movimento_periodo` — movimento de rubricas em período
- `folha_por_departamento` — folha desagregada por depto

**Leitura — Ponto e Assiduidade:**
- `ponto_por_colaborador_periodo` — ponto consolidado de um colaborador
- `ponto_detalhes_dia` — marcações da dia por colaborador
- `assiduidade_ranking` — ranking de faltadores/atrasados
- `horas_extras_periodo` — resumo de horas extras por colaborador

**Leitura — Afastamento:**
- `afastamento_ativo` — afastamentos vigentes (licença, suspensão)
- `afastamento_por_motivo` — afastamentos agrupados por tipo

---

## 3. Catálogo Exaustivo de Perguntas

Um gestor de RH faria cerca de **50+ perguntas distintas** sobre colaboradores. Cada uma é marcada com status de resposta.

### 3.1. COLABORADORES — Listagem e Busca

| # | Pergunta | Status | Dados Necessários | Gap |
|---|----------|--------|-------------------|-----|
| Q1 | Quantos colaboradores ativos temos? | [GAP] | rh.contrato com status='ativo' | Sem raw_rh_contrato |
| Q2 | Liste todos os colaboradores com nome contendo "João" | [GAP] | rh.contrato + res.partner (nome) | Sem raw_rh_contrato |
| Q3 | Quantos colaboradores por empresa/filial? | [GAP] | rh.contrato + res.company | Sem sincronização |
| Q4 | Quantos colaboradores por departamento? | [GAP] | rh.contrato + campo depto | Sem estrutura de depto |
| Q5 | Quantos colaboradores por cargo? | [GAP] | rh.contrato + rh.cargo | Sem rh.cargo sincronizado |
| Q6 | Qual é o colaborador mais antigo? | [GAP] | rh.contrato com data_inicio mínima | Sem dados históricos |
| Q7 | Quem são os colaboradores que completam X anos de casa este mês? | [GAP] | rh.contrato com data_inicio filtrada | Sem cálculo de data |
| Q8 | Listagem de todos os colaboradores inativos (demitidos)? | [GAP] | rh.contrato com status='inativo' | Sem dados de demissão |
| Q9 | Qual colaborador foi promovido de cargo no período X-Y? | [PARCIAL] | Histórico de rh.contrato (write_date + cargo_id antes/depois) | Sem auditoria de mudança |
| Q10 | Exporte a lista de colaboradores para Excel (nome, CPF, cargo, depto, salário base) | [GAP] | rh.contrato + res.partner + rh.cargo | Sem tool de exportação |

### 3.2. CONTRATAÇÃO — Admissões e Demissões

| # | Pergunta | Status | Dados Necessários | Gap |
|---|----------|--------|-------------------|-----|
| Q11 | Quantas admissões houve em janeiro de 2026? | [GAP] | rh.contrato com data_inicio em 2026-01 | Sem sincronização |
| Q12 | Quantas admissões por empresa em 2026? | [GAP] | rh.contrato agrupado por empresa + período | Sem agregação |
| Q13 | Qual foi o custo de contratação (salários iniciais) em 2026? | [GAP] | rh.contrato com data_inicio + salario_base | Sem cálculo |
| Q14 | Quantas demissões houve em 2026? Por empresa? | [GAP] | rh.contrato com data_fim filtrada | Sem registro de demissão |
| Q15 | Qual foi a taxa de turnover (rotatividade) em 2026? | [GAP] | (admissões + demissões) / colaboradores médios | Sem métrica |
| Q16 | Quantas demissões por motivo (pedido próprio, justa causa, etc.)? | [GAP] | rh.contrato com motivo_demissao | Sem classificação |
| Q17 | Quem foi demitido no período X-Y? Lista completa. | [GAP] | rh.contrato com data_fim filtrada | Sem dados |
| Q18 | Qual colaborador está em aviso prévio? Por quanto tempo ainda? | [GAP] | rh.contrato com status='aviso_previo' + dias restantes | Sem cálculo de data |

### 3.3. FOLHA DE PAGAMENTO — Holerite, Rubrica, Custos

| # | Pergunta | Status | Dados Necessários | Gap |
|---|----------|--------|-------------------|-----|
| Q19 | Qual é o total de folha paga em janeiro de 2026? | [GAP] | SUM(rh.holerite.liquido) para jan/2026 | Sem rh.holerite |
| Q20 | Qual é o custo total de mão de obra em 2026 (bruto)? | [GAP] | SUM(rh.holerite.salario_bruto) por ano | Sem agregação |
| Q21 | Qual é o salário médio de um colaborador? Mediano? | [GAP] | AVG/MEDIAN(rh.holerite.liquido) | Sem estatística |
| Q22 | Qual colaborador tem maior salário? Menor? | [GAP] | MAX/MIN(rh.holerite.liquido) | Sem ranking |
| Q23 | Qual é o custo de INSS, IRRF, FGTS mensalmente? | [GAP] | SUM(rh.holerite_item) filtrado por rubrica | Sem detalhe de rubrica |
| Q24 | Qual rubrica teve maior variação de mês para mês? | [GAP] | rh.holerite_item com rubrica_id + período | Sem série temporal |
| Q25 | Qual colaborador teve maior desconto em determinado mês? | [GAP] | rh.holerite_item com maior valor de desconto | Sem filtro |
| Q26 | Qual é a folha de cada departamento? | [GAP] | rh.holerite agrupado por depto | Sem dimensão depto |
| Q27 | Quanto a empresa gasta com 13º salário? | [GAP] | rh.holerite_item com rubrica '13º' | Sem classificação |
| Q28 | Qual é o impacto de aumentos salariais no custo total? | [GAP] | Comparação de períodos antes/depois de mudança | Sem simulação |
| Q29 | Qual colaborador recebeu adicionais (noturno, insalubridade)? Quanto? | [GAP] | rh.holerite_item com rubrica de adicional | Sem classificação de rubrica |
| Q30 | Quais colaboradores com descontos por falta? Quanto desconto? | [GAP] | rh.holerite_item com rubrica 'desconto falta' | Sem dados |

### 3.4. PONTO, ASSIDUIDADE E JORNADA

| # | Pergunta | Status | Dados Necessários | Gap |
|---|----------|--------|-------------------|-----|
| Q31 | Quantas horas cada colaborador trabalhou em janeiro de 2026? | [GAP] | SUM(rh.ponto_marcacao.horas) por colaborador | Sem rh.ponto_marcacao |
| Q32 | Quantas horas extras foram realizadas em 2026? Por quem? | [GAP] | SUM(horas_extras) onde tipo='extra' | Sem cálculo |
| Q33 | Qual é o ranking de colaboradores com mais faltas? | [GAP] | COUNT(faltas) por colaborador, TOP 10 | Sem agregação |
| Q34 | Qual é o ranking de colaboradores com mais atrasos? | [GAP] | COUNT(atrasos) > 0 | Sem dados |
| Q35 | Qual colaborador teve falta injustificada em X data? | [GAP] | rh.ponto_marcacao com tipo='falta' + comentário | Sem detalhe |
| Q36 | Quantas faltas injustificadas vs. justificadas? | [GAP] | rh.afastamento + rh.ponto.faltas | Sem classificação |
| Q37 | Qual é a jornada (horário) de cada colaborador? | [GAP] | rh.contrato + rh.jornada + rh.horario_trabalho | Sem sincronização |
| Q38 | Quantos colaboradores em jornada 8h? 6h? Outra? | [GAP] | rh.jornada com contagem | Sem agregação |
| Q39 | Qual colaborador tem escala de turno diferente? | [GAP] | rh.jornada filtrada por tipo='turno' | Sem dados |

### 3.5. AFASTAMENTO, FÉRIAS E AUSÊNCIAS

| # | Pergunta | Status | Dados Necessários | Gap |
|---|----------|--------|-------------------|-----|
| Q40 | Quantos colaboradores estão de licença remunerada? Por quanto tempo? | [GAP] | rh.afastamento com tipo='licença' + data_fim | Sem rh.afastamento |
| Q41 | Qual é o custo de afastamentos (licença maternidade, médica)? | [GAP] | rh.holerite com rubrica 'licença' + período | Sem classificação |
| Q42 | Quantos colaboradores em gozo de férias em determinado período? | [GAP] | rh.contrato_ferias com data_inicio <= hoje <= data_fim | Sem rh.contrato_ferias |
| Q43 | Qual colaborador tem férias vencidas (não gozadas)? | [GAP] | rh.contrato_ferias com data_limite < hoje | Sem cálculo de vencimento |
| Q44 | Qual colaborador está em aviso prévio? Quando sai? | [GAP] | rh.contrato com status='aviso_previo' + data_saida | Sem cálculo |
| Q45 | Quanto a empresa vai gastar com férias coletivas em 2026? | [GAP] | SUM(salario_base) durante período de férias coletivas | Sem agregação |

### 3.6. ANÁLISE COMPARATIVA E SÉRIE TEMPORAL

| # | Pergunta | Status | Dados Necessários | Gap |
|---|----------|--------|-------------------|-----|
| Q46 | Qual é a evolução de colaboradores por mês em 2026? Gráfico. | [GAP] | rh.contrato com data_inicio por período | Sem série temporal |
| Q47 | Comparar folha de janeiro vs. fevereiro de 2026. Qual foi a variação? | [GAP] | rh.holerite agrupado por mês | Sem comparação |
| Q48 | Qual foi o ticket médio de holerite em 2025 vs. 2026? | [GAP] | AVG(rh.holerite.liquido) por ano | Sem série temporal |
| Q49 | Qual empresa tem maior custo de mão de obra em 2026? | [GAP] | rh.holerite agrupado por empresa + período | Sem dimensão empresa |
| Q50 | Ranking de departamentos por custo de folha. | [GAP] | rh.holerite agrupado por depto | Sem dimensão depto |

---

### 3.7. Resumo do Catálogo de Perguntas

| Status | Qtd |
|--------|-----|
| [OK] | 0 |
| [PARCIAL] | 1 |
| [GAP] | 49 |
| **TOTAL** | **50** |

**Conclusão:** O domínio RH é completamente vazio. Apenas 1 pergunta tem dados parcialmente viáveis (Q9 — auditoria de mudança de cargo, se a Odoo gravar write_date em rh.contrato).

---

## 4. Métricas Canônicas

Métricas que um gestor de RH esperaria consultar com **precisão absoluta e sem alucinação**. Cada uma tem regra exata e exceções.

### 4.1. Folha de Pagamento

#### **Folha Total (Bruto)**
- **Definição:** Soma de todos os salários brutos (base + adicionais) pagos em um período específico
- **Fórmula:** `SUM(rh.holerite.salario_bruto)` onde `mes = X AND ano = Y AND status NOT IN ('cancelado')`
- **Filtros:** por empresa (res.company), por departamento (dimensão que falta), por período (mês/ano obrigatório)
- **Ambiguidades a resolver com usuário:**
  - 13º salário entra em "folha normal" ou é relatório separado?
  - Férias gozadas entram em qual mês (mês de referência ou mês de pagamento)?
  - Holerites "em processamento" (status != 'pago') contam?
  - Descontos por falta são deduzidos do bruto ou do líquido?

#### **Folha Total (Líquida)**
- **Definição:** Soma do que o colaborador realmente recebe após descontos obrigatórios
- **Fórmula:** `SUM(rh.holerite.liquido)` onde `mes = X AND ano = Y AND status NOT IN ('cancelado')`
- **Nota:** `liquido = salario_bruto - SUM(descontos onde tipo IN ('inss', 'irrf', 'vale', ...))`
- **Ambiguidades:**
  - Vale-refeição/transporte são desconto obrigatório ou adiantamento?
  - Contribuição sindical desconta do líquido ou é retenção separada?

#### **Custo Total (Com Encargos)**
- **Definição:** Custo real de mão de obra para a empresa, incluindo encargos patronais
- **Fórmula:** `SUM(rh.holerite.salario_bruto) + SUM(rh.holerite_item.valor)` para itens com natureza='encargo_patronal'
- **Inclui:** INSS patronal (11%), FGTS (8%), contribuição sindical, seguro acidente
- **Ambiguidades:**
  - Encargos variam por contrato (CLT vs. PJ vs. Autônomo)?
  - 13º tem encargos também?
  - Férias/afastamentos estão em folha ou em linha separada?

#### **Média de Salário**
- **Definição:** Salário médio por colaborador em um período
- **Fórmula:** `AVG(rh.holerite.liquido)` onde `mes = X AND ano = Y`
- **Nota:** Considerar apenas colaboradores com holerite nesse mês (não incluir inativos)
- **Ambiguidades:**
  - Considerar holerite parcial (afastamento/férias)?
  - Média aritmética ou ponderada por dias trabalhados?

#### **Mediana de Salário**
- **Definição:** Salário "do meio" — 50% ganham mais, 50% ganham menos
- **Fórmula:** `MEDIAN(rh.holerite.liquido)`
- **Uso:** identifica distribuição assimétrica de salários

### 4.2. Assiduidade e Ponto

#### **Dias Trabalhados (Colaborador)**
- **Definição:** Quantidade de dias efetivos trabalhados em um período
- **Fórmula:** `COUNT(DISTINCT data) FROM rh.ponto_marcacao WHERE colaborador_id = X AND mes = M AND ano = A`
- **Excludente:** Faltas, férias, afastamento médico, licença sem remuneração
- **Nota:** Diferente de "dias do mês" — excluda fins de semana/feriados
- **Ambiguidades:**
  - Dia trabalhado = presença em ambas (entrada E saída) ou basta entrada?
  - Teletrabalho conta como presença?
  - Dia com pausa almoço = 1 dia ou conta parcial?

#### **Horas Extras**
- **Definição:** Horas trabalhadas além da jornada contratual
- **Fórmula:** `SUM(rh.ponto_marcacao.horas_extras)` onde `rh.ponto_marcacao.tipo = 'extra' AND colaborador_id = X`
- **Cálculo:** Horas trabalhadas no dia - horas da jornada contratual (rh.jornada.horas_dia)
- **Nota:** Varia por jornada (8h vs. 6h)
- **Ambiguidades:**
  - Horas extras são pagas 50% a mais? 100% a mais? (Varia por lei e convenção)
  - Pausa almoço desconceptua horas extras?
  - Hora extra noturna tem valor diferente?

#### **Taxa de Ausência**
- **Definição:** Proporção de faltas vs. dias úteis do período
- **Fórmula:** `(COUNT(faltas) / COUNT(dias_uteis)) * 100`
- **Nota:** "Dia útil" = seg-sex, excluda feriados
- **Ambiguidades:**
  - Falta justificada vs. injustificada (duas métricas distintas?)
  - Licença médica conta como falta?
  - Atraso significativo (>30min) conta como falta?

### 4.3. Pessoal e Contratação

#### **Total de Colaboradores Ativos**
- **Definição:** Quantidade de colaboradores com contrato vigente
- **Fórmula:** `COUNT(DISTINCT colaborador_id) FROM rh.contrato WHERE status = 'ativo' AND data_inicio <= hoje AND (data_fim IS NULL OR data_fim >= hoje)`
- **Nota:** Snapshot em data específica (pois varia ao longo do mês)
- **Ambiguidades:**
  - Colaborador em aviso prévio é "ativo"?
  - Colaborador em afastamento médico é "ativo"?
  - Dois contratos para mesmo colaborador (temporário + permanente) = 1 ou 2?

#### **Taxa de Turnover (Rotatividade)**
- **Definição:** Proporção de colaboradores que saem vs. total médio no período
- **Fórmula:** `((admissoes + demissoes) / colaboradores_medio) / periodo_meses * 12 * 100`
- **Nota:** Expresso em % anual
- **Ambiguidades:**
  - Qual período de cálculo? (últimos 12 meses? Este ano? Últimos 3 meses?)
  - "Saída" inclui licença remunerada?
  - Promoção interna (mudança de cargo) é "rotatividade"?

#### **Custo de Admissão**
- **Definição:** Custo médio para contratar um novo colaborador
- **Fórmula:** `(anuncios + recrutamento + treinamento) / total_admissoes`
- **Nota:** Dado que a Odoo Tauga não registra esses custos, métrica não é viável
- **Ambiguidades:**
  - Incluir custo de inatividade (até o colaborador ser produtivo)?

#### **Representatividade por Cargo**
- **Definição:** Quantidade de colaboradores por cargo
- **Fórmula:** `COUNT(*) FROM rh.contrato GROUP BY cargo_id`
- **Dimensões:** por empresa, por depto, por tipo de contrato (CLT/PJ/Autônomo)

### 4.4. Férias e Afastamento

#### **Dias de Férias Acumulados**
- **Definição:** Saldo de férias não gozadas por colaborador
- **Fórmula:** Cálculo complexo: 30 dias por ano de contrato - dias gozados
- **Nota:** Lei: máximo 2 períodos em aberto (36 meses)
- **Ambiguidades:**
  - 13º salário entram como parte de férias?
  - Afastamento médio (maternidade, doença) reinicia o período de aquisição?

#### **Dias em Licença Remunerada**
- **Definição:** Tempo total de afastamento com remuneração em um período
- **Fórmula:** `SUM(DATEDIFF(data_fim, data_inicio)) FROM rh.afastamento WHERE tipo IN ('licenca_maternidade', 'licenca_paternidade', 'licenca_medica', 'luto')`
- **Nota:** Cada tipo pode ter duração máxima por lei
- **Ambiguidades:**
  - Licença médica com INSS (empresa não paga a partir de dia 16) = remunerada?

---

## 5. Combinações Cruzadas com Outros Domínios

O domínio RH depende e se cruza com:

### 5.1. Comercial / Pedido
- **Relação:** Quem fez a venda (vendedor_id → res.users → rh.contrato)
- **Uso:** Comissão de vendedor, análise de produtividade por vendedor
- **Gap:** Campo vendedor em pedido.documento não foi explorado ainda

### 5.2. Contábil / Financeiro
- **Relação:** Folha de pagamento gera lançamentos contábeis (rh.holerite → contabil.lancamento)
- **Uso:** Reconciliação de folha com contabilidade, análise de provisões
- **Gap:** Mapping entre rh.holerite e contabil.lancamento não está documentado

### 5.3. Estoque / Produção
- **Relação:** Colaborador alocado em Ordem de Produção (rh.contrato → producao.processo)
- **Uso:** Custo de mão de obra por produção, alocação de pessoal
- **Gap:** Modelos produção.* não têm relação explícita com RH

### 5.4. Fiscal (SPED)
- **Relação:** Folha de pagamento gera obrigações acessórias (eSocial, FGTS, INSS)
- **Uso:** Conformidade fiscal, declarações periódicas
- **Gap:** Modelos sped.* não integram dados de RH

---

## 6. Armadilhas de Dados e Status

Problemas comuns em sistemas RH que causam números errados:

### 6.1. Duplicação de Registros

**Armadilha:** Um colaborador pode ter múltiplos contratos (temporário, permanente, PJ).

- **Risco:** Contar colaboradores por COUNT(contrato) retorna duplicatas
- **Solução:** Agrupar por colaborador_id, não contrato_id
- **Validação:** `SELECT COUNT(DISTINCT colaborador_id) != COUNT(*)` deve ser verdadeiro

### 6.2. Status Ambíguo

**Armadilha:** Campo `ativo` em rh.contrato pode significar vários estados:

- `ativo = True` → Contrato vigente?
- `ativo = False` → Demitido? Suspenso? Licença?
- Falta campo `status` explicit com enum (ativo, inativo, afastado, aviso_previo)

**Solução:** Desambiguar com `data_fim` (se > hoje, é ativo; se < hoje, é inativo)

### 6.3. Períodos de Referência vs. Períodos de Pagamento

**Armadilha:** Holerite pode ter mês de referência (jan/2026) mas ser pago em fev/2026.

- **Risco:** SUM(holerite.liquido) no período pagamento ≠ SUM na período referência
- **Solução:** Sempre filtrar por `mes_referencia`, não por `data_pagamento`

### 6.4. Afastamentos que Interrompem Jornada

**Armadilha:** Colaborador em férias/licença não deve contar em "dias trabalhados".

- **Risco:** rh.ponto registra entrada/saída mesmo em dia de férias
- **Solução:** Fazer LEFT JOIN com rh.afastamento e EXCLUDE datas que caem em afastamento

### 6.5. Colaboradores Fantasma

**Armadilha:** Contrato com data_inicio no futuro ou data_fim no passado.

- **Risco:** Incluir em "colaboradores ativos" colaboradores ainda não admitidos
- **Solução:** Validar `data_inicio <= hoje <= COALESCE(data_fim, data_hoje)`

### 6.6. Rubrica Mal Classificada

**Armadilha:** Campo natureza_rubrica pode estar vazio ou errado.

- **Risco:** INSS contabilizado como "rubrica normal" em vez de "desconto"
- **Solução:** Usar enum strict em rh.natureza.rubrica, não texto livre

### 6.7. Holerite Parcial / Cancelado

**Armadilha:** Holerite pode estar em status 'aberto', 'processado', 'pago' ou 'cancelado'.

- **Risco:** Somar holerite cancelado falseia total
- **Solução:** Sempre EXCLUDE status IN ('cancelado', 'rascunho')

### 6.8. Jornada Variável

**Armadilha:** Colaborador pode mudar jornada ao longo do ano.

- **Risco:** Jornada em 1º jan é 8h, mas em 1º jun passa a 6h
- **Solução:** Histórico de mudanças (audit trail), não snapshot único
- **Implementação:** raw_rh_contrato com write_date permite rebuildar histórico

---

## 7. Plano de Implementação (Resumo)

Para operacionalizar RH no Nex, seguir esta ordem:

### Fase 1: Sincronização Raw
1. Adicionar 19 modelos ao model-catalog.ts (modo incremental para transacionais, snapshot para referência)
2. Submeter ao worker, deixar sincronizar por 3 ciclos (6 min + reconcile 24h)
3. Validar:
   - `SELECT COUNT(*) FROM raw_rh_contrato` → deve ter >0
   - `SELECT COUNT(DISTINCT colaborador_id) FROM raw_rh_contrato` → deve ser coerente
   - Verificar write_date não é NULL (ou é NULL para tabelas estáticas?)

### Fase 2: Modelagem de Fatos
1. Criar `fato_colaborador` (snapshot de ativo/inativo por date)
2. Criar `fato_folha_pagamento` (consolidação mensal de holerite + rubricas)
3. Criar `fato_ponto_consolidado` (agregação de marcações em dia/mês)
4. Iniciar com fatos "lentos" (sem recálculo a cada minuto)

### Fase 3: Tools MCP
1. Implementar read tools mais críticas:
   - `colaborador_listar`
   - `holerite_por_periodo`
   - `ponto_por_colaborador`
2. Validar contra números "de verdade" (reconciliação com Odoo)

### Fase 4: Ambiguidades com Cliente
1. Reunião para desambiguar métricas (Q4.1 — Q4.4)
2. Documentar regra de cálculo de cada métrica em Markdown
3. Implementar validators em code para garantir regra

---

## 8. Conclusão

**O domínio RH é um GAP total.** Nenhum dado está sincronizado, nenhuma métrica está calculada, nenhuma tool está funcional.

Mas a **estrutura existe no Odoo Tauga** (19 modelos, >5k registros estimados). É possível implementar com confiança desde que:

1. **Sincronizar todos os 19 modelos** (trabalho mecânico de adicionar ao catalog)
2. **Modelar os fatos** (trabalho de design, ~1-2 semanas)
3. **Desambiguar métricas com o cliente** (reunião executiva, ~4h)
4. **Implementar tools** (2-4 semanas dependendo de complexidade)
5. **Validar contra dados reais do Odoo** (reconciliação continua até 100% match)

**Recomendação:** Colocar RH como onda posterior (não é prioridade imediata vs. comercial/fiscal/financeiro), mas com roadmap claro e prototipagem early.

---

## Apêndice A: Arquivos de Descoberta

Dados brutos do discovery:

```
discovery/odoo-schema/schema.json          # 19 modelos RH (estrutura básica)
discovery/odoo-schema/raw/                 # Excel files com campos detalhados
  ├── Fields (ir.model.fields).xlsx        # Todos os campos de RH
  ├── Fields Selection.xlsx                # Enums de status/tipo
  └── Models (ir.model).xlsx               # Meta de cada modelo
```

Para investigação profunda, usar:
- `src/lib/odoo/client.ts` — cliente JSON-RPC para consulta ao Odoo
- `scripts/e2e/` — exemplos de como fazer discovery programaticamente

---

**Análise concluída:** 2026-06-06  
**Próximo passo recomendado:** Reunião com cliente para validar catálogo de perguntas e desambiguar métricas.

