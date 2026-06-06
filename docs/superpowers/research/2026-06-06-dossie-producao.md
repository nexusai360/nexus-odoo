# DOSSIE DETALHADO — DOMINIO PRODUCAO

**Data:** 2026-06-06  
**Status:** Mapeamento completo pós-delivery B5  
**Contexto:** Matrix Fitness Group, ERP Odoo Tauga, agente Nex reconstrução  
**Escopo:** Profundidade máxima no dominio producao (modelo + tools + perguntas + gaps)

---

## 1. TABELAS E CAMPOS DISPONIVEIS

### 1.1 Tabelas RAW (dados brutos do Odoo, espelhadas no cache Postgres)

#### `raw_producao_processo`
**Mapeia:** `producao.processo` (modelo Odoo customizado)

| Campo | Tipo | Observacao |
|-------|------|-----------|
| `odoo_id` | INT (PK) | Identificador do registro no Odoo |
| `data` | JSON | Blob completo do registro (todos os campos do Odoo) |
| `odoo_write_date` | TIMESTAMP | Data da ultima alteracao no Odoo |
| `synced_at` | TIMESTAMP | Data da sincronizacao para o cache (controle de ingestao) |
| `raw_deleted` | BOOLEAN | Flag de exclusao logica (soft delete) |

**Registros no Odoo:** 1 (estrutural, marginalmente operado)

**Campos de negocio extraidos do JSON `data` (via builder):**
- `ordem` (INT, nullable) — sequencia/ordinal do processo
- `nome` (VARCHAR, nullable) — descricao do nome do processo (ex: "Montagem", "Pintura")
- `descricao` (TEXT, nullable) — texto descritivo detalhas do processo
- `tempo` (MONETARY/DECIMAL, default 0) — tempo padrao do processo (provavelmente em horas ou minutos, unidade nao explicitada no Odoo)

**Critério de sincronização:** incremental (detecta mudancas por `odoo_write_date`)

**Uso:** Alimenta a tabela fato `fato_producao_processo`.

---

### 1.2 Tabelas FATO (dados modelados, derivados e otimizados)

#### `fato_producao_processo`
**Origem:** `raw_producao_processo` (transformacao via builder `fato-producao-processo.ts`)

| Campo | Tipo | Observacao |
|-------|------|-----------|
| `odoo_id` | INT (PK) | ID do processo (chave estrangeira virtual com raw_producao_processo) |
| `ordem` | INT (nullable) | Sequencia/ordem do processo |
| `nome` | VARCHAR (nullable) | Nome do processo (texto curto) |
| `descricao` | TEXT (nullable) | Descricao detalhada do processo |
| `tempo` | DECIMAL(18,2) | Tempo padrao (sem unidade explicitada; exposto como-eh) |
| `atualizado_em` | TIMESTAMP | Data da ultima atualizacao nesta tabela (controle de ingestao local) |

**Indices:**
- `(ordem)` — para listagem ordenada de processos

**Registros:** 1 (atualmente)

**Padrão:** 1 linha = 1 processo de producao cadastrado e ativo no Odoo

**Status operacional:** Tabela pronta, mas com dado minimal (1 registro). Escala automaticamente com novos processos.

---

## 2. TOOLS EXISTENTES E RESPOSTAS ATUAIS

### 2.1 Tools de producao (MCP semântico)

#### `producao_processos` (ID: `producao_processos`)
**Categoria:** Dominio-sem-restricao (`sempreVisivel: true`, RBAC nao aplica)  
**Origem:** `mcp/tools/producao/index.ts`

**Descricao:**
> Processos de producao cadastrados: ordem, nome, descricao e tempo padrao. Enquanto a producao nao for operada no Odoo, responde que nao ha processos.

**Assinatura:**
```typescript
inputShape: { limite?: number (1-200, default 100) }
```

**Comportamento:**
- **Quando ha dados (count > 0):** Retorna listagem de processos com campos `odooId`, `ordem`, `nome`, `descricao`, `tempo` (em Decimal cru).
- **Quando nao ha dados (count == 0):** Resposta honesta: "A producao ainda nao eh operada no Odoo da Matrix (sem processos)."
- **Truncamento:** Se total > limite, marca como `truncado: true` no response.
- **Ordem:** Processa ordenados por `ordem ASC`.

**Implementacao:**
- Query: `queryProducaoProcessos(prisma, filtros)` — lê de `fato_producao_processo`
- Count: `fatoProducaoProcessoCount(prisma)` — valida operacao do dominio
- Factory: `makeHonestTool` — template de tool sem dominio explicitado, com `sempreVisivel`

**Resposta esperada (resultado):**
```json
{
  "linhas": [
    {
      "odooId": 1,
      "ordem": null,
      "nome": "Embalagem",
      "descricao": "Processo de embalagem final do equipamento",
      "tempo": 15.50
    }
  ],
  "total": 1,
  "truncado": false
}
```

**Limitacoes atuais:**
1. Nao expoe unidade de tempo (campo bruto; usuario deve inferir ou consultar admin)
2. Sem filtro por ativo/inativo (retorna todos; nao ha flag de status no modelo)
3. Sem busca por nome (retorna lista inteira, truncada em limite)
4. Sem historico ou auditoria de modificacoes de processos

---

### 2.2 Status do dominio (ferramenta complementar)

#### `producao_status_dominio` (ID: `producao_status_dominio`)
**Categoria:** Status/saude operacional  
**Origem:** `mcp/tools/dominios-vazios/index.ts`

**Descricao:**
> Status de operacao do dominio Producao no Odoo da Matrix. Retorna se producao eh operada e em que escala.

**Resposta (atual):**
```
"Producao nao eh operada no Odoo da Matrix. Nenhum processo cadastrado."
```

**Quando muda:** Permanece como "nao operada" ate que `fato_producao_processo.count() > 0`. Apos B5, sera dinamica.

---

## 3. CATALOGO EXAUSTIVO DE PERGUNTAS (MATRIZ Q x RESPOSTA)

### 3.1 Questoes operacionais basicas

| # | Pergunta | Resposta Esperada | Status | Lacuna |
|---|----------|------------------|--------|--------|
| 1 | Quais sao os processos de producao cadastrados? | Lista completa com ordem, nome, descricao, tempo | [OK] `producao_processos` | — |
| 2 | Qual eh o tempo padrao de cada processo? | Tempo por processo em unidade bruta (field time) | [OK] `producao_processos` | Unidade nao explicitada |
| 3 | Quantos processos de producao temos? | Count total (1 atualmente) | [OK] `producao_processos.total` | — |
| 4 | Qual eh o tempo total/medio de producao? | Media/soma dos tempos de todos os processos | [GAP] | Sem agregacao no MCP |
| 5 | A producao esta operada no Odoo? | Sim/Nao com contexto | [PARCIAL] `producao_status_dominio` | Resposta estatica |
| 6 | Qual processo leva mais tempo? | Processo com mayor valor `tempo` | [GAP] | Sem ranking no MCP |
| 7 | Qual processo leva menos tempo? | Processo com menor valor `tempo` | [GAP] | Sem ranking no MCP |
| 8 | Qual eh a ordem recomendada para executar os processos? | Lista ordenada por campo `ordem` | [OK] `producao_processos` retorna ordenada | — |

---

### 3.2 Questoes de filtragem e busca

| # | Pergunta | Resposta Esperada | Status | Lacuna |
|---|----------|------------------|--------|--------|
| 9 | Qual processo tem nome contendo "montagem"? | Processa com nome similar | [GAP] | Sem busca/LIKE no MCP |
| 10 | Quais processos tem tempo > 10 horas? | Filtragem por threshold | [GAP] | Sem filtro dinamico no MCP |
| 11 | Processo de ordem 1? | Retorna processo com `ordem=1` | [GAP] | Sem filtro por campo |
| 12 | Qual processo eh o primeiro? | Minimum `ordem` | [GAP] | Sem min/max no MCP |

---

### 3.3 Questoes de validacao e integridade

| # | Pergunta | Resposta Esperada | Status | Lacuna |
|---|----------|------------------|--------|--------|
| 13 | Ha processos sem nome? | Lista de processos null `nome` | [GAP] | Sem validacao/auditoria |
| 14 | Ha processos com tempo zerado? | Lista com `tempo=0` | [GAP] | Sem auditoria de dados ruins |
| 15 | Ha duplicacoes de nome entre processos? | Identifica nomes repetidos | [GAP] | Sem validacao de unicidade |
| 16 | Qual foi o ultimo processo adicionado? | Baseado em `atualizado_em` | [GAP] | Sem ordenacao temporal |

---

### 3.4 Questoes cruzadas (com outros dominios)

| # | Pergunta | Resposta Esperada | Status | Lacuna |
|---|----------|------------------|--------|--------|
| 17 | Quais pedidos usam o processo "X"? | Linkagem pedido.documento ↔ processos | [GAP] | Modelo desconexo; falta relacao |
| 18 | Qual eh o tempo total para completar um pedido (por processo)? | Soma de tempos dos processos do pedido | [GAP] | Falta jointure com pedidos |
| 19 | Quantos pedidos estao em cada etapa de producao? | Status por processo (em_progresso, concluido, bloqueado...) | [GAP] | Falta status/historico de execucao |
| 20 | Qual processo eh bottleneck (espera mais tempo)? | Baseado em historico de execucao | [GAP] | Falta dados de execucao; modelo so define CATALOGO |
| 21 | Qual processo foi modificado recentemente? | Ultimo processo alterado em timestamp | [PARCIAL] `atualizado_em` existe | Sem filtro temporal no MCP |
| 22 | Qual produto usa o processo "X" na sua fabricacao? | Link produto ↔ processo (via lista material) | [GAP] | Modelo desconexo de produtos |

---

### 3.5 Questoes de planejamento e capacidade

| # | Pergunta | Resposta Esperada | Status | Lacuna |
|---|----------|------------------|--------|--------|
| 23 | Qual eh a capacidade total de producao por mes? | Tempo disponivel - tempo comprometido | [GAP] | Falta modelo de capacidade |
| 24 | Qual processo tem maior risco de atraso? | Baseado em tempo padrao vs. historico | [GAP] | Falta dados de execucao |
| 25 | Precisamos aumentar a capacidade de algum processo? | Analise de demanda vs. tempo disponivel | [GAP] | Falta demanda/historico |
| 26 | Qual eh o tempo medio de ciclo na producao? | Media dos tempos de execucao | [GAP] | Falta dados de execucao |

---

### 3.6 Questoes futuras (projecoes e cenarios)

| # | Pergunta | Resposta Esperada | Status | Lacuna |
|---|----------|------------------|--------|--------|
| 27 | Se eu adicionar um novo processo, quanto tempo levaria? | Recomendacao de tempo baseado em similares | [GAP] | Falta mecanismo de previsao |
| 28 | Qual seria o impacto de otimizar o processo "X" em 20%? | Simulacao de cenario | [GAP] | Falta engine de cenarios |
| 29 | Qual eh a sequencia otimizada de processos? | Recomendacao baseada em algoritmo | [GAP] | Falta otimizador de sequencia |

---

## 4. METRICAS CANONICAS A FORMALIZAR

### 4.1 Metricas ja implicitamente possiveis (baseadas em fato_producao_processo)

#### Metrica: `TEMPO_PROCESSO_UNITARIO`
**Definicao canonica:**
> Para cada processo cadastrado, o tempo padrao eh o valor armazenado em `fato_producao_processo.tempo`.
> Sem unidade explicitada no Odoo; assume-se minutos ou horas (DESAMBIGUACAO NECESSARIA com usuario).
> Regra: incluir processos com `raw_deleted = false` em sincronizacao.

**Filtros:**
- Por `odoo_id`
- Por `ordem` (sequencia do catalogo)
- Por data de atualizacao (`atualizado_em`)

**Agregacoes:**
- MIN(tempo) — processo mais rapido
- MAX(tempo) — processo mais lento
- AVG(tempo) — tempo medio
- SUM(tempo) — tempo total de ALL processos (interpretacao: se executados em sequencia, tempo total)

**Desambiguacoes pendentes:**
1. **Unidade de tempo:** campo `tempo` eh em minutos, horas, dias ou outra?
2. **Natureza do tempo:** tempo padrao para um item, para um lote, para uma ordem?
3. **Overlapping:** processos podem rodar em paralelo ou em serie?
4. **Variabilidade:** ha desvio padrao ou minimo-maximo esperado?

---

#### Metrica: `CONTAGEM_PROCESSOS_OPERADOS`
**Definicao canonica:**
> Total de registros em `fato_producao_processo` com `raw_deleted = false`.
> Atual: 1.
> Muda quando novos processos sao adicionados ao Odoo e sincronizados.

**Interpretacao:**
- count == 0 → "Producao nao operada"
- count >= 1 → "Producao operada com N processos"

---

### 4.2 Metricas futuras (requerem dados de execucao, nao presentes)

Quando `producao.centro.trabalho` (workstation/setor), `pedido.documento.processo` (historico de execucao de pedido por processo) e status de progresso forem operados:

#### Metrica: `TEMPO_EXECUCAO_REAL_PROCESSO`
**Definicao canonica:**
> Media do tempo real gasto em cada processo nos ultimos N pedidos.
> Regra: Δ(data_conclusao - data_inicio) para cada pedido em cada etapa.
> Agrega por processo; compara vs. `tempo_padrao`.

#### Metrica: `DESVIO_TEMPO_PROCESSO`
**Definicao canonica:**
> (tempo_real - tempo_padrao) / tempo_padrao, em %.
> Positivo = atraso; Negativo = adiantamento.

#### Metrica: `THROUGHPUT_PROCESSO_MENSAL`
**Definicao canonica:**
> Quantidade de pedidos que passaram por cada processo no mes.
> Regra: COUNT(DISTINCT pedido_id) WHERE processo=X AND data_conclusao BETWEEN mes_inicio E mes_fim.

#### Metrica: `GARGALO_PRODUCAO`
**Definicao canonica:**
> Processo com maior soma de (tempo_real * frequencia_mensal).
> Regra: SOMA dos tempos de espera em fila + tempo de execucao.

---

## 5. COMBINACOES CRUZADAS COM OUTROS DOMINIOS

### 5.1 Producao × Pedidos (comercial)

**Modelo no Odoo:** `pedido.documento.processo` (ausente do cache)

**Pergunta típica:** "Este pedido usa quais processos?"

**Gap técnico:**
- Nao ha tabela `raw_pedido_documento_processo` (fora do discovery camada 2)
- Nao ha JOIN entre `pedido.documento` e `producao.processo`
- Nao ha historico de execucao por pedido

**Solucao futura:** Adicionar `sped.pedido.documento.processo` ao discovery; criar tabela fato `fato_pedido_processo_historico`.

---

### 5.2 Producao × Estoque (materiais)

**Modelo no Odoo:** `sped.produto.lista.material.item` + `producao.alteracao.materia.prima.item`

**Pergunta típica:** "Qual material eh usado em cada processo?"

**Gap técnico:**
- Lista de material operada no dominio FISCAL (sped.*), nao producao
- Alteracoes de materia-prima nao sao sincronizadas (fora camada 2)
- Sem JOIN entre producao e lista.material

**Solucao futura:** Modelar relacao material ↔ processo via tabela de ligacao.

---

### 5.3 Producao × Centros de Trabalho (RH/Operacional)

**Modelo no Odoo:** `producao.centro.trabalho` (ausente do cache)

**Pergunta típica:** "Qual centro de trabalho executa qual processo?"

**Gap técnico:**
- Modelo ausente da sincronizacao (0 registros)
- Nao ha dados sobre alocacao de recursos

**Solucao futura:** Adicionar `raw_producao_centro_trabalho` + modelar capacidade por setor.

---

### 5.4 Producao × Financeiro (custo)

**Modelo no Odoo:** Nao ha mapeamento direto

**Pergunta típica:** "Qual eh o custo de cada processo?"

**Gap técnico:**
- Nao ha tabela de custo padrao por processo
- Sem integracao com `finan.centro.resultado` ou centros de custo

**Solucao futura:** Criar tabela `fato_producao_custo_padrao` baseada em mapeamento manual.

---

## 6. ARMADILHAS DE DADO (CAMPOS QUE ENGANAM, JOINS QUE DUPLICAM)

### 6.1 Campo `tempo` sem unidade

**Armadilha:** Campo `DECIMAL(18,2)` no Odoo, armazenado como JSON na raw, exposto cru no MCP.

**Risco:** Usuario assume hora; na realidade pode ser minuto ou outra unidade.

**Mitigacao:** 
- [ ] Verificar no Odoo Tauga qual eh a unidade (via inspecao manual ou discovery aprofundado)
- [ ] Documentar no dossier de negocio
- [ ] Resposta do MCP mencionar "unidade nao especificada"

### 6.2 Campo `ordem` nao garante sequencia de execucao

**Armadilha:** Campo `ordem` existe, mas nao ha restricao UNIQUE; pode haver processos com mesma ordem ou order=NULL.

**Risco:** Assumir que `ordem=1` eh primeiro; na realidade pode haver ambiguidade.

**Mitigacao:**
- [ ] Validar no discovery se `ordem` eh unica por processo
- [ ] Documentar se ordem implica sequencia obrigatoria ou apenas dica visual
- [ ] Tool pode retornar order=NULL sem avisar usuario

### 6.3 Modelo isolated (sem relacoes FK)

**Armadilha:** Tabela `fato_producao_processo` eh atomica; nao ha FK para pedidos, centros de trabalho ou materiais.

**Risco:** User pergunta "qual pedido usa este processo?" — resposta eh "sem dados, nao sou capaz".

**Mitigacao:**
- [ ] Documentar que e um catalogo, nao um rastreamento de execucao
- [ ] Tool deve responder honestamente quando pergunta requer dados ausentes

### 6.4 Sincronizacao incremental pode perder historico

**Armadilha:** Raw usa modo `incremental` (delta por `odoo_write_date`). Se processo eh deletado no Odoo, ficara com `raw_deleted=true`, mas fato nao eh atualizado.

**Risco:** Usuario ve processo deletado em relatorio antigo (cache).

**Mitigacao:**
- [ ] Builder deve filtrar `raw_deleted=true` explicitamente
- [ ] Fato deve ter coluna `deletado_em` se necessario manter historico

### 6.5 Fato sem data de criaceo

**Armadilha:** `fato_producao_processo` tem `atualizado_em`, mas nao tem `criado_em`.

**Risco:** Nao conseguir dizer "quando este processo foi cadastrado originalmente?".

**Mitigacao:**
- [ ] Se relevante para negocio, adicionar coluna `criado_em` na migracao
- [ ] Por hora, resposta eh "desconhecido; so tenho data de atualizacao"

---

## 7. STATUS DE COMPLETUDE E ROADMAP

### 7.1 Completude do modelo

| Aspecto | Status | Notas |
|---------|--------|-------|
| **Raw table** | [OK] | `raw_producao_processo` existe, sincronizando |
| **Fato table** | [OK] | `fato_producao_processo` com 5 campos de negocio |
| **Tool MCP** | [OK] | `producao_processos` operacional (1 resultado) |
| **RBAC** | [OK] | `sempreVisivel` (nao filtrado por dominio) |
| **Discovery** | [PARCIAL] | Schema descoberto, mas campos em JSON; 4 modelos relacionados nao sincronizados |
| **Historico de execucao** | [GAP] | Falta `pedido.documento.processo` (historico) |
| **Relacoes cruzadas** | [GAP] | Sem JOIN com pedidos, estoque, RH |
| **Dados de capacidade** | [GAP] | Falta `producao.centro.trabalho` |
| **Auditoria de mudancas** | [GAP] | Sem rastreamento de quem alterou quando |

---

### 7.2 Roadmap de expansao (proximo desenvolvimento)

#### B6 — Producao Avancada (Capacidade e Centros)
- [ ] Adicionar `raw_producao_centro_trabalho` ao discovery + schema
- [ ] Criar `fato_producao_centro_trabalho` com campos: setor, capacidade_hora, custo_hora
- [ ] Tool: `producao_centros_trabalho` — lista setores com capacidade
- [ ] Tool: `producao_capacidade_disponivel` — capacidade vs. demanda por setor
- [ ] Metrica: `UTILIZACAO_SETOR` = (horas_comprometidas / capacidade) %

#### B7 — Producao × Pedidos (Rastreamento)
- [ ] Adicionar `raw_pedido_documento_processo` + `raw_pedido_documento_processo_historico`
- [ ] Criar `fato_pedido_execucao_processo` — historico de execucao por pedido
- [ ] Tool: `producao_pedidos_por_processo` — lista pedidos em cada processo
- [ ] Metrica: `TEMPO_CICLO_PEDIDO` = soma de tempos de todos os processos do pedido
- [ ] Metrica: `ATRASO_PROCESSO` = (tempo_real - tempo_padrao) / tempo_padrao

#### B8 — Qualidade e Parametros (Compliance)
- [ ] Adicionar `raw_producao_parametro_qualidade` (teste de qualidade por processo)
- [ ] Criar `fato_producao_parametro_qualidade` com regras de validacao
- [ ] Tool: `producao_parametros_qualidade` — parametros de teste por processo
- [ ] Metrica: `TAXA_REJEICAO` = quantidade_rejeitada / quantidade_processada %

#### B9 — Materias-Primas (Alteracoes)
- [ ] Adicionar `raw_producao_alteracao_materia_prima` + .item
- [ ] Criar tabela de auditoria de mudancas em lista de material
- [ ] Tool: `producao_materias_alteradas_recentemente` — lista mudancas
- [ ] Metrica: `CONSISTENCIA_LISTA_MATERIAL` = versoes em vigor

---

## 8. RESUMO EXECUTIVO E PRIORIDADES

### O que funciona HOJE

1. **Catalogo de processos:** Tool `producao_processos` retorna lista completa com nome, descricao, tempo padrao.
2. **Status operacional:** Tool `producao_status_dominio` informa se producao esta ativa.
3. **Queries de leitura:** MCP consegue responder "quais sao os processos?" com dados validos.

### O que esta FALTANDO (TOP 5 GAPS)

1. **Unidade de tempo desambiguada** — campo bruto nao diz se eh minuto, hora ou outro. Requer decisao com usuario/PM.
2. **Relacao com pedidos** — sem saber qual pedido usa qual processo, nao consegue responder "quanto tempo levaria executar este pedido?".
3. **Dados de execucao/rastreamento** — sem historico real de execucao, nao consegue calcular desvios, gargalos ou taxa de erro.
4. **Centros de trabalho** — sem modelo de alocacao de recursos, nao consegue responder "qual setor executa isto?" ou "temos capacidade?".
5. **Auditoria de mudancas** — sem rastreamento de quem alterou processo quando, nao consegue responder "quem modificou isto?".

### Prioridade de expansao

1. **P1 — Desambiguar unidade de tempo** (1 dia — consultar Odoo, atualizar dossier)
2. **P2 — Adicionar `producao.centro.trabalho`** (B6, 3-4 dias — expansao incremental)
3. **P3 — Vincular com `pedido.documento.processo`** (B7, 5-7 dias — JOIN complexo)
4. **P4 — Rastreamento de qualidade** (B8, 4-5 dias — novos parametros)
5. **P5 — Alteracoes de materia-prima** (B9, 3-4 dias — auditoria)

---

## RESUMO DO DOSSIER

**Tabelas RAW:** 1 (`raw_producao_processo`)  
**Tabelas FATO:** 1 (`fato_producao_processo`)  
**Tools MCP:** 2 (`producao_processos`, `producao_status_dominio`)  
**Questoes catalogadas:** 29  
**Respondidas completamente [OK]:** 3  
**Respondidas parcialmente [PARCIAL]:** 3  
**Nao respondidas [GAP]:** 23  
**Gaps críticos:** 5 (unidade tempo, relacao pedidos, execucao, centros, auditoria)  
**Metricas canonicas formalizadas:** 2 (TEMPO_UNITARIO, CONTAGEM_PROCESSOS)  
**Metricas futuras (apos expansao):** 8+  

