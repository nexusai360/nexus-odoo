# Dossie: Dominio "Cadastros, Parceiros e Produtos" - Mapeamento Completo para Nex

**Data:** 2026-06-06  
**Escopo:** Analise exaustiva do dominio de cadastros (res.partner), produtos (sped.produto) e servicos (sped.servico) do ERP Odoo Matrix Fitness Group.  
**Objetivo:** Fornecer ao agente Nex AI visao 360 graus de TUDO que ele precisa conhecer para responder com precisao absoluta sobre QUEM sao os clientes/fornecedores, QUAIS sao os produtos/servicos, e COM QUAIS INFORMACOES pode montar prompts de venda e comunicacoes.

---

## 1. TABELAS E CAMPOS DISPONÍVEIS (RAW + FATO)

### 1.1 Tabelas Raw (Espelho do Odoo)

#### RawResPartner (res.partner do Odoo)
**Tabela:** `raw_res_partner`  
**Linhas esperadas:** ~800 (clientes, fornecedores, contatos diversos)  
**Frequencia de sync:** Incremental 3min + reconcile 24h  
**Campos de negocio extraidos para fato_parceiro:**
- `id` (Odoo ID) -> `odooId` (chave primaria)
- `name` -> `nome` (nome comercial curto)
- `complete_name` -> `nomeCompleto` (nome completo com hierarquia)
- `vat` -> `documento` (CNPJ/CPF)
- `customer` -> `ehCliente` (booleano)
- `supplier` -> `ehFornecedor` (booleano)
- `is_company` -> `ehEmpresa` (booleano: PJ vs PF)
- `city` -> `cidade`
- `state_id` (M2O) -> `uf` (extrai nome do estado)
- `country_id` (M2O) -> `pais`
- `zip` -> `cep`
- `email` -> `email`
- `phone` / `mobile` -> `telefone` (phone com fallback para mobile)
- `active` -> `ativo` (booleano)
- `create_date` -> `dataCriacao` (Odoo create_date, permite filtro "novos")
- **Dados adicionais em JSON (nao normalizados):** enderecos alternativos, atividades de email, categorias (tags), historico de vendas

**Desafios conhecidos:**
- Nomes podem ter variacoes (abreviacoes, "Matrix" vs "Matrix Fitness" vs "Matriz"). Ver secao 4.3 (Armadilhas).
- Documento pode estar incompleto ou em formatos inconsistentes (com/sem mascara).
- `complete_name` pode incluir sufixos hierarquicos (pai>filho) que nao sao relevantes para busca.
- Parceiros com `ehCliente=false` e `ehFornecedor=false` sao contatos puros (p.ex., PJ sem operacoes).

#### RawSpedProduto (sped.produto do Odoo)
**Tabela:** `raw_sped_produto`  
**Linhas esperadas:** ~3787  
**Frequencia de sync:** Incremental 3min + reconcile 24h  
**Campos de negocio extraidos para fato_produto:**
- `id` -> `odooId` (chave primaria)
- `nome` -> `nome` (nome do produto, ex.: "Halteres Ajustaveis 20kg")
- `codigo` -> `codigo` (codigo inteiro, referencia interna)
- `codigo_unico` -> `codigoUnico` (SKU ou referencia unica, pode coincidir com codigo)
- `codigo_barras` -> `codigoBarras` (normalizado: maiusculo, sem pontuacao)
- `active` -> `ativo` (booleano)
- `tipo` -> `tipo` (categoria funcional: "Equipamento", "Servico", "Componente"?)
- `marca_id` (M2O sped.marca) -> `marcaId`, `marcaNome`
- `familia_id` (M2O sped.familia) -> `familiaId`, `familiaNome`
- `unidade_id` (M2O sped.unidade) -> `unidadeNome` (UN, KG, M, etc.)
- `ncm_id` (M2O sped.ncm) -> `ncmCodigo` (extrai prefixo "95.06.91.00")
- `controla_estoque` -> `controlaEstoque` (booleano)
- `permite_venda` -> `permiteVenda` (booleano)
- `permite_compra` -> `permiteCompra` (booleano)
- `preco_custo` -> `precoCusto` (Decimal(14,4), custo unitario)
- `preco_venda` -> `precoVenda` (Decimal(14,4), preco tabela)
- `peso_liquido` -> `pesoLiquido` (Decimal(10,4) em KG)
- `peso_bruto` -> `pesoBruto` (Decimal(10,4) em KG)
- `create_date` -> `criadoEm`
- `write_date` -> `atualizadoEmOdoo`

**Desafios conhecidos:**
- `preco_venda` e `preco_custo` podem ser 0 ou null (produto sem preco tabela, preco via tabela de preco ou negociacao).
- Produtos podem ter variantes (sped.produto.variante) nao refletidas como registros separados; a variante fica em raw_sped_produto_variante (nao normalizada no fato).
- `tipo` pode vir vazio ou null; necessario logica de inferencia (p.ex., if controlaEstoque then "Equipamento" else "Servico").
- `codigo` pode ser duplicado entre modelos diferentes ou ser apenas um numero sequencial sem logica (ver armadilha N4).

#### RawSpedServico (sped.servico do Odoo)
**Tabela:** `raw_sped_servico`  
**Linhas esperadas:** ~150  
**Frequencia de sync:** Incremental 3min + reconcile 24h  
**Campos de negocio (NOTA: fato nao existe ainda; mapeamento bruto de raw):**
- `id` -> `odooId`
- `codigo` (codigo fiscal do servico)
- `codigo_formatado` (codigo com prefixo/formatacao)
- `descricao` (descricao do servico)
- `codigo_tributacao` (codigo da natureza de servico ou classe)
- `al_inss_retido` (aliquota INSS retido, %)

#### RawResCompany (res.company do Odoo - Empresas do Grupo)
**Tabela:** `raw_res_company`  
**Linhas esperadas:** ~20  
**Campos de negocio extraidos para dim_empresa_grupo:**
- `id` -> `odooId`
- `name` -> `nome` (nome da empresa)
- `cnpj` -> `cnpj`
- `tipo` ('matriz' ou 'filial')
- `state_id` -> `uf`
- `active` -> `ativo`

#### RawSpedProdutoMarca, RawSpedProdutoFamilia, RawSpedProdutoTipo
**Tabelas:** `raw_sped_produto_marca`, `raw_sped_produto_familia`, `raw_sped_produto_tipo`  
**Proposito:** Catalogos de referencia para produtos (marcas = fabricantes, familias = categorias de produtos, tipos = classificacao)  
**Campos tipicos:** `id`, `nome`, `descricao`  
**Uso:** Normalizados em `marcaNome` / `marcaId`, `familiaNome` / `familiaId` na fato_produto.

### 1.2 Tabelas Fato (Derivadas e Modeladas)

#### FatoParceiro
**Tabela:** `fato_parceiro`  
**Linhas:** ~800  
**Reconstrucao:** Truncate + insert de raw_res_partner (raw_deleted=false)  
**Ciclo:** Incremental via worker (3min) + reconcile 24h  
**Campos:**
- `odooId` INT (PK, Odoo ID)
- `nome` STRING nullable
- `nomeCompleto` STRING nullable
- `documento` STRING nullable
- `ehCliente` BOOLEAN DEFAULT false
- `ehFornecedor` BOOLEAN DEFAULT false
- `ehEmpresa` BOOLEAN DEFAULT false
- `cidade` STRING nullable
- `uf` STRING nullable (Nome da UF, nao codigo IBGE)
- `pais` STRING nullable
- `cep` STRING nullable
- `email` STRING nullable
- `telefone` STRING nullable (phone OU mobile)
- `ativo` BOOLEAN DEFAULT true
- `dataCriacao` TIMESTAMP nullable (T-42: permite filtro "parceiros novos em periodo")
- `atualizadoEm` TIMESTAMP DEFAULT now()

**Indices:** uf, ehCliente, ehFornecedor, dataCriacao

**Logica de negocio codificada:**
- `ehCliente=true`: pode ser faturado (saida de produto/servico)
- `ehFornecedor=true`: pode fazer compra (entrada de produto)
- `ehEmpresa=true`: PJ; `ehEmpresa=false`: PF
- `ativo=true`: parceiro operacional; `false`: inativo/bloqueado

#### FatoProduto
**Tabela:** `fato_produto`  
**Linhas:** ~3787  
**Reconstrucao:** Truncate + insert de raw_sped_produto (raw_deleted=false)  
**Ciclo:** Incremental via worker + reconcile  
**Campos:**
- `odooId` INT (PK)
- `nome` STRING (NOT NULL, obrigatorio)
- `codigo` STRING nullable
- `codigoUnico` STRING nullable (SKU)
- `codigoBarras` STRING nullable (normalizado: maiusculo, alphanumerico)
- `ativo` BOOLEAN DEFAULT true
- `tipo` STRING nullable
- `marcaId` INT nullable, `marcaNome` STRING nullable
- `familiaId` INT nullable, `familiaNome` STRING nullable
- `unidadeNome` STRING nullable (UN, KG, M, etc.)
- `ncmCodigo` STRING nullable (ex.: "95.06.91.00")
- `controlaEstoque` BOOLEAN DEFAULT false
- `permiteVenda` BOOLEAN DEFAULT true
- `permiteCompra` BOOLEAN DEFAULT true
- `precoCusto` DECIMAL(14,4) nullable
- `precoVenda` DECIMAL(14,4) nullable
- `pesoLiquido` DECIMAL(10,4) nullable
- `pesoBruto` DECIMAL(10,4) nullable
- `criadoEm` TIMESTAMP nullable
- `atualizadoEmOdoo` TIMESTAMP nullable
- `atualizadoEm` TIMESTAMP DEFAULT now()

**Indices:** ativo, codigo, codigoUnico, codigoBarras, familiaId, marcaId, controlaEstoque

**Logica de negocio codificada:**
- `ativo=true`: produto operacional; pode ser vendido/comprado
- `controlaEstoque=true`: controle por quantidade (saldo); `false`: sem controle ou servico
- `permiteVenda=true`: pode sair em documento de venda (NF)
- `permiteCompra=true`: pode entrar em documento de compra
- **JOIN com fato_estoque_saldo:** por `odooId` (produto_id na tabela estoque)

#### FatoProdutoParado (Derivado)
**Tabela:** `fato_produto_parado`  
**Proposito:** Produtos com saldo há mais de X dias (sinal de lentidao ou obsolescencia)  
**Campos:** `saldoHojeId` (FK estoque), `produtoId`, `produtoNome`, `localId`, `localNome`, `saldo`, `dias` (duracao em estoque), `vrSaldo` (valor em estoque)  
**Uso:** Responder "quais produtos estao parados ha mais de 90 dias?" ou "maior valor parado"

#### DimEmpresaGrupo (R5.01 - Ronda 5)
**Tabela:** `dim_empresa_grupo`  
**Linhas:** ~20  
**Proposito:** Catalogo das empresas do grupo Matrix (matriz + filiais)  
**Campos:**
- `odooId` INT (PK)
- `nome` STRING
- `cnpj` STRING nullable
- `tipo` STRING ('matriz' | 'filial')
- `uf` STRING nullable
- `ativo` BOOLEAN DEFAULT true
- `atualizadoEm` TIMESTAMP DEFAULT now()

**Indices:** tipo, uf

**Uso:** "Quantas filiais temos?", "Qual empresa fica em SP?", "CNPJ da Matriz"

### 1.3 Raw Auxiliares (Tabelas de Referencia)

As seguintes tabelas raw sao **catalogos que normalizam referencia** mas ainda nao estao em fatos dedicados:

- `raw_sped_ncm` (Nomenclatura Comum do Mercosul) - ~10k linhas
- `raw_sped_unidade` (Unidades: UN, KG, M, L, etc.) - ~50 linhas
- `raw_sped_tabela_preco` (Tabelas de preco por cliente/periodo) - ~200 linhas
- `raw_sped_tabela_preco_regra` (Regras de aplicacao de preco) - ~500 linhas
- `raw_sped_condicao_pagamento` (Condicoes: 30 dias, parcelado, etc.) - ~50 linhas
- `raw_sped_estado`, `raw_sped_municipio`, `raw_sped_pais` (Geofilia) - refencia geofisica

**Nota:** Nenhuma destas tem fato correspondente. Sao acessadas como raw direto quando necessario ou via denormalizacao em campos da fato_parceiro (ex.: uf = relNome de state_id M2O).

---

## 2. TOOLS EXISTENTES E O QUE CADA UMA RESPONDE HOJE

### 2.1 Tools de Leitura (READ)

#### cadastro_buscar_parceiro
**Parametros:** `termo` (string, min 2 chars), `limit` (1-100), `offset` (>=0)  
**Retorna:** Lista de parceiros matching por nome/nomeCompleto/documento  
**Logica:** Busca fuzzy via searchPartnerIdsByName + searchPartnerIdsByFullName + fallback documento ILIKE. Union de ids, ordenacao estavel, pagina em memoria.  
**Campos retornados:** odooId, nome, documento, ehCliente, ehFornecedor, uf, cidade  
**Limite truncamento:** ~50 ids por caminho (total ~150)  
**Status:** [OK] Responde com exatidao

#### cadastro_contar_parceiros
**Parametros:** Nenhum (stateless)  
**Retorna:** Contadores agregados
- totalParceiros (todos)
- totalClientes (ehCliente=true)
- totalFornecedores (ehFornecedor=true)
- totalEmpresas (ehEmpresa=true)
- totalPessoasFisicas (ehEmpresa=false)
- totalAtivos (ativo=true)
- totalInativos (ativo=false)
- totalClientesAtivos (ehCliente AND ativo)
- totalFornecedoresAtivos (ehFornecedor AND ativo)

**Status:** [OK] Responde com exatidao

#### cadastro_parceiros_por_uf
**Parametros:** `apenasClientes` (opcional: true)  
**Retorna:** Agregacao por UF ordenada por quantidade DESC  
**Colunas:** uf, quantidade  
**Status:** [OK] Responde com exatidao

#### cadastro_parceiros_por_cidade
**Parametros:** `apenasClientes` (opcional: true), `limit`, `offset`  
**Retorna:** Agregacao por cidade (quando cidade != null)  
**Colunas:** cidade, uf, quantidade  
**Status:** [OK] Responde com exatidao

#### cadastro_cidades_listar
**Parametros:** `limit`, `offset`  
**Retorna:** Lista de cidades unicas em fato_parceiro (cidades com pelo menos 1 parceiro)  
**Colunas:** cidade, uf  
**Status:** [OK] Responde com exatidao

#### cadastro_parceiros_novos (T-42, Ronda 4)
**Parametros:** `dataInicio` (date), `dataFim` (date)  
**Retorna:** Parceiros criados no periodo (dataCriacao between)  
**Colunas:** odooId, nome, documento, ehCliente, ehFornecedor, dataCriacao  
**Status:** [OK] Responde com exatidao; permite "parceiros cadastrados esta semana/mes"

#### cadastro_parceiros_sem_documento
**Parametros:** `limit`, `offset`  
**Retorna:** Parceiros com documento IS NULL (problema de cadastro)  
**Colunas:** odooId, nome, uf, cidade  
**Status:** [OK] Responde; util para auditoria de qualidade

#### cadastro_filiais_listar
**Parametros:** `limit`, `offset`  
**Retorna:** Empresas do grupo (dim_empresa_grupo, tipo='filial' OU tipo='matriz')  
**Colunas:** odooId, nome, cnpj, tipo, uf, ativo  
**Status:** [OK] Responde; lista matriz + filiais

#### cadastro_detalhar_parceiro
**Parametros:** `parceiroId` (int, Odoo ID)  
**Retorna:** Registro completo de fato_parceiro + enrichment adicional  
**Colunas:** Todas as colunas de fato_parceiro  
**Status:** [OK] Responde; utilizado para ficha do cliente

#### servico_buscar
**Parametros:** `termo` (string, busca textual em codigo/descricao)  
**Retorna:** Servicos matching  
**Colunas:** odooId, codigo, codigoFormatado, descricao, codigoTributacao, alInssRetido  
**Status:** [OK] Responde; basicamente raw_sped_servico

#### servico_contar
**Parametros:** Nenhum  
**Retorna:** totalServicos  
**Status:** [OK] Responde

#### servico_listar
**Parametros:** `limit`, `offset`  
**Retorna:** Listagem completa ordenada por codigo  
**Colunas:** odooId, codigo, codigoFormatado, descricao, codigoTributacao, alInssRetido  
**Status:** [OK] Responde

### 2.2 Tools de Escrita (WRITE) - Onda 2 (Nao Prioritario)

#### cadastros_mail_activity_create
**Proposito:** Criar atividade (follow-up, email) associada a parceiro  
**Parametros:** parceiroId, assunto, tipo, dataVencimento  
**Status:** [OK] Tool existe; nao testada em profundidade

#### cadastros_mail_activity_update
**Proposito:** Atualizar atividade existente  
**Status:** [OK] Tool existe

#### cadastros_mail_activity_complete
**Proposito:** Marcar atividade como concluida  
**Status:** [OK] Tool existe

#### cadastros_res_partner_update
**Proposito:** Atualizar dados do parceiro (nome, documento, email, etc.)  
**Status:** [OK] Tool existe; gated por RBAC

#### cadastros_res_partner_archive
**Proposito:** Arquivar (desativar) parceiro  
**Status:** [OK] Tool existe

#### cadastros_res_partner_delete
**Proposito:** Deletar parceiro (raro)  
**Status:** [OK] Tool existe

#### cadastros_res_partner_category_create
**Proposito:** Criar categoria/tag para parceiro  
**Status:** [OK] Tool existe

#### cadastros_res_partner_category_set_tags
**Proposito:** Associar tags a parceiro  
**Status:** [OK] Tool existe

---

## 3. CATALOGO EXAUSTIVO DE PERGUNTAS

Este catalogo enumera TUDO que um gestor pode perguntar sobre cadastros, parceiros e produtos. Cada pergunta esta marcada com status [OK], [PARCIAL] ou [GAP] conforme ja responda ou nao.

### 3.1 Perguntas sobre Parceiros (Clientes/Fornecedores)

**P1.1** "Quantos clientes temos?" 
- **Status:** [OK] 
- **Tool:** cadastro_contar_parceiros (totalClientes)
- **Campos:** Apenas contagem

**P1.2** "Quantos fornecedores cadastrados?"
- **Status:** [OK]
- **Tool:** cadastro_contar_parceiros (totalFornecedores)

**P1.3** "Qual eh o cliente chamado [NOME]?"
- **Status:** [OK]
- **Tool:** cadastro_buscar_parceiro (termo=NOME)
- **Retorna:** Todos matching (nome, documento, cidade, UF, status)

**P1.4** "Qual CNPJ da empresa [NOME]?"
- **Status:** [OK]
- **Tool:** cadastro_buscar_parceiro (termo=NOME) OU cadastro_detalhar_parceiro (odooId)
- **Retorna:** documento (CNPJ/CPF)

**P1.5** "Quantos clientes por UF? / Distribuicao geografica de clientes?"
- **Status:** [OK]
- **Tool:** cadastro_parceiros_por_uf (apenasClientes=true)
- **Retorna:** Grafico agregado por UF

**P1.6** "Qual UF concentra mais clientes?"
- **Status:** [OK]
- **Tool:** cadastro_parceiros_por_uf (apenasClientes=true) + TOP 1
- **Logica:** Ordenacao ja vem DESC por quantidade

**P1.7** "Clientes em Sao Paulo?"
- **Status:** [PARCIAL]
- **Tool:** cadastro_parceiros_por_cidade (apenasClientes=true) + filtro cidade='SAO PAULO'
- **Falta:** Tool nao tem filtro por UF direto; precisaria query separada OU adicionar parametro `uf` a tool

**P1.8** "Quantos clientes em cada cidade?"
- **Status:** [OK]
- **Tool:** cadastro_parceiros_por_cidade (apenasClientes=true)

**P1.9** "Quais cidades temos clientes?"
- **Status:** [OK]
- **Tool:** cadastro_cidades_listar
- **Retorna:** Lista unica de cidades

**P1.10** "Parceiros cadastrados esta semana / este mes?"
- **Status:** [OK]
- **Tool:** cadastro_parceiros_novos (dataInicio, dataFim)
- **Logica:** Filtra por dataCriacao

**P1.11** "Quantos parceiros inativos / desativados?"
- **Status:** [OK]
- **Tool:** cadastro_contar_parceiros (totalInativos)

**P1.12** "Qual eh a lista completa de clientes ativos?"
- **Status:** [PARCIAL]
- **Tool:** Nao existe; seria necessario buscar com `cadastro_buscar_parceiro` com termo wildcard (nao suportado; termo minimo 2 chars)
- **Falta:** Tool de "listar_clientes" com filtros (ativo, tipo, UF, cidade)

**P1.13** "Parceiros sem CNPJ/CPF cadastrado? (problema de qualidade)"
- **Status:** [OK]
- **Tool:** cadastro_parceiros_sem_documento
- **Retorna:** Lista de registros para auditoria

**P1.14** "Qual eh o email/telefone do cliente [NOME]?"
- **Status:** [OK]
- **Tool:** cadastro_detalhar_parceiro (odooId)
- **Retorna:** email, telefone

**P1.15** "Clientes duplicados (mesmo nome/documento em multiplos registros)?"
- **Status:** [GAP]
- **Falta:** Query de "duplicatas" nao existe
- **Seria necessario:** GROUP BY nome HAVING count > 1 OU GROUP BY documento HAVING count > 1

**P1.16** "Comparacao: quantos clientes vs fornecedores?"
- **Status:** [OK]
- **Tool:** cadastro_contar_parceiros (totalClientes vs totalFornecedores)

**P1.17** "Parceiros que sao AMBOS cliente e fornecedor?"
- **Status:** [GAP]
- **Falta:** Query nao existe; seria COUNT WHERE ehCliente AND ehFornecedor

**P1.18** "Top 10 cidades por quantidade de clientes"
- **Status:** [OK]
- **Tool:** cadastro_parceiros_por_cidade (apenasClientes=true) + TOP 10

**P1.19** "Clientes por regiao (Sul, Sudeste, etc.)?"
- **Status:** [GAP]
- **Falta:** Mapeamento UF -> Regiao nao codificado; seria necessario adicionar coluna regiao ou fazer lookup

**P1.20** "Ranking de UFs por quantidade de clientes"
- **Status:** [OK]
- **Tool:** cadastro_parceiros_por_uf (apenasClientes=true) - ja vem ordenado DESC

### 3.2 Perguntas sobre Produtos

**P2.1** "Quantos produtos no catalogo?"
- **Status:** [GAP]
- **Falta:** Tool contar_produtos nao existe
- **Query:** SELECT COUNT(*) FROM fato_produto WHERE ativo=true

**P2.2** "Qual eh o preco do produto [NOME/CODIGO]?"
- **Status:** [GAP]
- **Falta:** Tool buscar_produto nao existe
- **Seria:** Busca por nome ou codigo em fato_produto, retorna precoCusto, precoVenda

**P2.3** "Quais produtos estao ativos?"
- **Status:** [PARCIAL]
- **Falta:** Lista completa de produtos inativos; seria necessario filtro `ativo=false`

**P2.4** "Listar todos os produtos por familia/categoria"
- **Status:** [GAP]
- **Falta:** Tool produto_por_familia nao existe
- **Seria:** GROUP BY familiaNome, retorna produtos em cada familia

**P2.5** "Quais marcas vendemos?"
- **Status:** [GAP]
- **Falta:** Tool marcas_listar nao existe
- **Seria:** SELECT DISTINCT marcaNome FROM fato_produto WHERE ativo=true ORDER BY marcaNome

**P2.6** "Produtos de uma marca especifica?"
- **Status:** [GAP]
- **Falta:** Tool produto_por_marca nao existe

**P2.7** "Qual eh o SKU do produto [NOME]?"
- **Status:** [GAP]
- **Falta:** buscar_produto teria que retornar codigoUnico

**P2.8** "Produtos sem preco tabela?"
- **Status:** [GAP]
- **Falta:** Query precoVenda IS NULL; util para auditoria (venda por negociacao)

**P2.9** "Qual peso liquido / bruto do produto [NOME]?"
- **Status:** [GAP]
- **Falta:** buscar_produto; quando retorna, teria peso

**P2.10** "Produtos que nao controlam estoque? (servicos puro?)"
- **Status:** [GAP]
- **Falta:** Query controlaEstoque=false

**P2.11** "Produtos que permitem venda?"
- **Status:** [GAP]
- **Falta:** Todas permitem por default; seria permiteVenda=true

**P2.12** "Produtos que permitem compra?"
- **Status:** [GAP]
- **Falta:** Todas permitem por default

**P2.13** "Produtos com codigo de barras cadastrado?"
- **Status:** [GAP]
- **Falta:** Query codigoBarras IS NOT NULL

**P2.14** "NCM de um produto (para fiscal)?"
- **Status:** [GAP]
- **Falta:** buscar_produto teria ncmCodigo; util para calculo de imposto

**P2.15** "Quando foi cadastrado o produto [NOME]? (controle de versao)"
- **Status:** [GAP]
- **Falta:** buscar_produto teria criadoEm, atualizadoEmOdoo

**P2.16** "Produtos cadastrados neste mes?"
- **Status:** [GAP]
- **Falta:** Query por criadoEm BETWEEN

**P2.17** "Produtos modificados recentemente? (auditoria de mudancas)"
- **Status:** [GAP]
- **Falta:** Query por atualizadoEmOdoo DESC LIMIT 20

**P2.18** "Ficha tecnica completa do produto [NOME]? (para venda)"
- **Status:** [GAP]
- **Falta:** Tool teria que retornar: nome, codigo, marca, familia, preco, unidade, peso, NCM, status
- **Necessario para:** Construir prompt de venda

**P2.19** "Comparacao de precos entre produtos da mesma familia"
- **Status:** [GAP]
- **Falta:** Tool produto_por_familia; retorna produtos com precos

**P2.20** "Produto com maior margem (precoVenda - precoCusto)?"
- **Status:** [GAP]
- **Falta:** Query calcula margem, ordena DESC LIMIT 1

### 3.3 Perguntas sobre Servicos

**P3.1** "Quantos servicos cadastrados?"
- **Status:** [OK]
- **Tool:** servico_contar

**P3.2** "Qual eh o servico [NOME/CODIGO]?"
- **Status:** [PARCIAL]
- **Tool:** servico_buscar (termo=NOME/CODIGO)
- **Retorna:** codigo, descricao, codigoTributacao, alInssRetido
- **Falta:** Ficha completa; descricao pode ser vaga

**P3.3** "Listar todos os servicos"
- **Status:** [OK]
- **Tool:** servico_listar

**P3.4** "Servicos por codigo tributacao?"
- **Status:** [GAP]
- **Falta:** GROUP BY codigoTributacao

**P3.5** "Qual eh a aliquota INSS retido do servico [NOME]?"
- **Status:** [OK]
- **Tool:** servico_buscar + retorna alInssRetido

**P3.6** "Servicos cadastrados neste periodo?"
- **Status:** [GAP]
- **Falta:** raw_sped_servico nao tem data de criacao mapeada

### 3.4 Perguntas de Cruzamento (Parceiros + Produtos)

**P4.1** "Quais produtos ja foram vendidos ao cliente [NOME]?"
- **Status:** [GAP]
- **Falta:** Requer JOIN fato_nota_fiscal_item (dominio fiscal, nao cadastros)
- **Seria:** SELECT DISTINCT p.* FROM fato_produto p JOIN fato_nota_fiscal_item i ON p.odooId=i.produtoId JOIN fato_nota_fiscal n ON i.documentoId=n.odooId WHERE n.participanteId = :clienteId

**P4.2** "Qual eh o cliente que compra mais de [PRODUTO]?"
- **Status:** [GAP]
- **Falta:** Requer estoque + fiscal

**P4.3** "Produtos nunca vendidos? (inventario morto)"
- **Status:** [GAP]
- **Falta:** Requer LEFT JOIN fato_nota_fiscal_item; nao encontra = nunca vendido

**P4.4** "Qual eh o volume de vendas por produto ao cliente [NOME]?"
- **Status:** [GAP]
- **Falta:** Fiscal

**P4.5** "Produtos recomendados para cliente [NOME] (baseado em historico)?"
- **Status:** [GAP]
- **Falta:** Requer logica de AI (fora do scope de cadastro; seria recomendacao preditiva)

### 3.5 Perguntas de Empresas/Filiais

**P5.1** "Quantas filiais temos?"
- **Status:** [OK]
- **Tool:** cadastro_filiais_listar (filter tipo='filial') + COUNT

**P5.2** "Qual eh a lista de filiais?"
- **Status:** [OK]
- **Tool:** cadastro_filiais_listar

**P5.3** "Qual CNPJ da Matriz?"
- **Status:** [OK]
- **Tool:** cadastro_filiais_listar (filter tipo='matriz')

**P5.4** "Filiais ativas?"
- **Status:** [OK]
- **Tool:** cadastro_filiais_listar (filter ativo=true)

**P5.5** "Filial em [UF]?"
- **Status:** [PARCIAL]
- **Tool:** cadastro_filiais_listar + filtro em memoria por uf
- **Falta:** Tool nao tem parametro direto; precisaria adicionar

---

## 4. METRICAS CANONICAS A FORMALIZAR

Estas sao as metricas de negocio **exatas** que o agente deve responder com precisao absoluta. Cada metrica tem regra CLARA, sem ambiguidade.

### M1: Total de Clientes Ativos
**Definicao:** COUNT de registros em fato_parceiro onde `ehCliente=true` AND `ativo=true`  
**Formula SQL:** `SELECT COUNT(*) FROM fato_parceiro WHERE ehCliente=true AND ativo=true`  
**Atualizacao:** Realtime (cache)  
**Desambiguacoes:**
- "Cliente" = qualquer registro com campo `ehCliente=true` (ja foi cliente ou eh cliente ativo)
- "Ativo" = campo booleano, nao relacionado a se fez compra recente
- Nao inclui fornecedores mesmo que tambem sejam clientes (AMBOS cliente + fornecedor contam em ambas as contagens)

### M2: Total de Fornecedores Ativos
**Definicao:** COUNT where `ehFornecedor=true` AND `ativo=true`  
**Desambiguacoes:** Fornecedor pode TAMBEM ser cliente

### M3: Parceiros sem Documento (Auditoria)
**Definicao:** COUNT where `documento IS NULL`  
**Interpretacao:** Problema de cadastro; deveria haver CNPJ ou CPF  
**Acao sugerida:** Requisitar ao usuario completar cadastro

### M4: Distribuicao de Parceiros por UF
**Definicao:** GROUP BY `uf` de fato_parceiro, COUNT(*), ORDER BY COUNT DESC  
**Desambiguacoes:**
- `uf=NULL`: Parceiros sem UF cadastrada (problema; mostrar separado)
- "Parceiros por UF" = todos os tipos (cliente, fornecedor, contato puro)
- Filtro opcional: `apenasClientes=true` restringe para `ehCliente=true`

### M5: Catalogo de Produtos Ativos
**Definicao:** COUNT where `ativo=true` em fato_produto  
**Nota:** Total de 3787 no Odoo; ~3500 deve estar ativo  
**Desambiguacoes:**
- Nao confundir com "produtos em estoque" (que requer JOIN com fato_estoque_saldo)
- Produto inativo pode ter saldo em estoque; nunca sera vendido

### M6: Produtos por Familia
**Definicao:** GROUP BY `familiaId`, COUNT(*), com nome da familia  
**Retorna:** familia, quantidade de produtos  
**Desambiguacoes:**
- `familiaId=NULL`: Produtos sem familia (falta classificacao)

### M7: Produtos por Marca
**Definicao:** GROUP BY `marcaId`, COUNT(*), com nome da marca  
**Desambiguacoes:**
- `marcaId=NULL`: Produtos sem marca (falta informacao)

### M8: Ficha Tecnica do Produto (Venda)
**Definicao:** 1 linha contendo:
- `nome` (nome comercial)
- `codigo` (codigo interno)
- `codigoUnico` (SKU)
- `marca` (nome da marca)
- `familia` (categoria)
- `preco_venda` (preco tabela em R$)
- `preco_custo` (custo em R$)
- `margem` (calculado: precoVenda - precoCusto)
- `unidade` (UN, KG, etc.)
- `peso` (liquido em KG)
- `ativo` (status)
- `controla_estoque` (sim/nao)

**Uso:** Para agente Nex montar prompt de venda ("produto A custa R$ 1000, marca XYZ, apropriado para [uso]")

### M9: Parceiros Novos em Periodo
**Definicao:** Registros where `dataCriacao BETWEEN :dataInicio AND :dataFim`  
**Granularidade:** Data (no time)  
**Desambiguacoes:**
- "Novos esta semana" = ultimos 7 dias
- "Novos este mes" = desde 1o do mes ate hoje
- Se `dataCriacao IS NULL` = nao conhecido (Odoo pode nao ter populate em migracao)

### M10: Servicos Ativos
**Definicao:** COUNT em raw_sped_servico (nao tem fato)  
**Campos importantes:**
- `codigo` (codigo fiscal, deve ser unico)
- `descricao` (o que eh o servico)
- `al_inss_retido` (aliquota, usado em calculo de retencao)

**Desambiguacoes:**
- Servico pode nao ter NCM (diferente de produto); usa codigo fiscal proprio

---

## 5. COMBINACOES CRUZADAS COM OUTROS DOMINIOS

O dominio cadastros interage com outros dominios de forma chave. Mappings:

### Cruzamento com Dominio Fiscal (fato_nota_fiscal*)
- **Via:** fato_nota_fiscal.participanteId = fato_parceiro.odooId
- **Via:** fato_nota_fiscal_item.produtoId = fato_produto.odooId
- **Perguntas que usam:** "Produtos vendidos a cliente X?", "Valor total vendido ao cliente?", "Nota por cliente?"

### Cruzamento com Dominio Estoque (fato_estoque_saldo*)
- **Via:** fato_estoque_saldo.produto_id = fato_produto.odooId
- **Via:** fato_estoque_saldo.local_id = almoxarifado/armazem
- **Perguntas:** "Saldo do produto X?", "Valor em estoque por produto?", "Produtos parados?"

### Cruzamento com Dominio Financeiro (fato_financeiro_titulo*)
- **Via:** fato_financeiro_titulo.participanteId = fato_parceiro.odooId
- **Perguntas:** "Titulos em aberto do cliente?", "Vendas a receber?"

### Cruzamento com Dominio Comercial (fato_pedido*)
- **Via:** fato_pedido.participanteId = fato_parceiro.odooId
- **Via:** fato_pedido_item?.produtoId = fato_produto.odooId (se houver item detail)
- **Perguntas:** "Pedidos em aberto do cliente?", "Historico de compras?"

---

## 6. ARMADILHAS DE DADO (Campos que Enganam, Status Confusos, JOINs que Duplicam)

### A1: Nome do Parceiro (Resolucao de Nomes)
**Armadilha:** Um parceiro pode ter multiplas representacoes:
- Razao social: "Matrix Fitness Group LTDA"
- Abreviacoes: "Matrix Fitness", "MFG"
- Variacao de escrita: "Matriz Fitness" vs "Matrix Fitness"

**Impacto:** Busca por "Matrix" pode nao achar "Matriz"; fuzzy search com unaccent ajuda, mas nao eh perfeito.

**Mitigacao:** Na ferramenta de busca, usar:
1. Busca por nome curto (tolerante a acento)
2. Busca por nome completo (hierarchical; pode incluir pai>filho)
3. Busca por documento (CNPJ/CPF, unico)

**Melhor pratica:** Sempre preferir documento como chave de identificacao quando disponivel.

### A2: Documento Incompleto ou Mal Formatado
**Armadilha:** Campo `vat` pode vir:
- Sem mascara: "12345678000190"
- Com mascara: "12.345.678/0001-90"
- Incompleto: "1234567" (CPF truncado)
- Nulo: Campo vazio ou NULL

**Impacto:** Busca ILIKE por documento pode falhar se usuario faz ILIKE com mascara mas database tem sem mascara.

**Mitigacao:** Normalizacao no builder (remover caracteres nao-numericos antes de armazenar)? Atualmente nao eh feito; stored as-is do Odoo.

**Melhor pratica:** Sempre usar busca por CNPJ/CPF com e sem mascara; avisar usuario se documento estiver incompleto.

### A3: Parceiro com Multiplos Papeis (Cliente + Fornecedor)
**Armadilha:** Um registro pode ter `ehCliente=true` AND `ehFornecedor=true` simultaneamente. Contar "total de clientes" vs "total de fornecedores" pode ter overlap.

**Impacto:** Se disser "2000 clientes + 500 fornecedores = 2500 parceiros", estar ERRADO se houver 200 que sao ambos.

**Mitigacao:** Sempre usar logica correta:
- Total de clientes = COUNT where ehCliente=true (pode incluir alguns que tambem sao fornecedor)
- Total de fornecedores = COUNT where ehFornecedor=true (pode incluir alguns clientes)
- Total de parceiros = COUNT where ehCliente OR ehFornecedor (union, sem duplicacao)

**Melhor pratica:** Na UI, esclarecer: "2000 registros marcados como cliente, 500 como fornecedor, sendo 200 em ambos os papeis" em vez de somar.

### A4: Complete_name com Hierarquia Pai>Filho
**Armadilha:** Campo `complete_name` no Odoo eh adesivo de hierarquia. Se houver filial sob matriz, pode vir:
- complete_name = "Matriz Fitness > Filial Sao Paulo"

**Impacto:** Busca nao-fuzzy por "Filial Sao Paulo" pode falhar porque o campo inteiro inclui "Matriz >".

**Mitigacao:** A tool de busca ja usa fuzzy em ambos `nome` (curto) e `complete_name` (completo). Uniao de ids garante match em ambos.

### A5: Produto.tipo Vazio ou Inconsistente
**Armadilha:** Campo `tipo` pode ser vazio, NULL ou ter valores inconsistentes ("equipamento", "Equipamento", "EQUIP").

**Impacto:** Nao pode usar para diferenciar produto vs servico com confianca.

**Mitigacao:** Preferir usar `controlaEstoque` como heuristica:
- controlaEstoque=true -> Equipamento (controla quantidade)
- controlaEstoque=false -> Servico (sem controle, ou quantidade indefinida)

**Melhor pratica:** Se precisar tipo exato, pedir para agente consultar raw e validar com negocio.

### A6: Preco 0 ou NULL
**Armadilha:** Campos `preco_custo` e `preco_venda` podem ser 0.0 ou NULL:
- NULL = preco nao foi inserido (falta informacao)
- 0.0 = preco explicitamente zero (doacao? produto teste?)

**Impacto:** Nao pode assumir produto tem preco; pode ser venda por negociacao ou tabela de preco dinamica.

**Mitigacao:** Sempre verificar preco; se for NULL ou 0, avisar que produto usa preco dinamico ou nao tem tabela.

**Melhor pratica:** Na ficha de venda do agente Nex, sempre esclarecer se preco eh de tabela ou sob negociacao.

### A7: Codigo Duplicado entre Modelos
**Armadilha:** Campo `codigo` pode ser apenas numero sequencial (1, 2, 3, ...) sem logica de negocio. Pode ser duplicado entre produto e servico (se houver cross-use).

**Impacto:** Nao pode usar codigo como chave de busca sem verificar tipo.

**Mitigacao:** Sempre usar `codigoUnico` (SKU) se disponivel, ou `odooId` (Odoo ID que eh garantidamente unico).

### A8: NCM Extinto ou Mudança de Classificacao
**Armadilha:** NCM pode estar desatualizado; governo muda NCM periodicamente.

**Impacto:** Calculo de imposto pode ficar errado se NCM nao for atual.

**Mitigacao:** Nao eh responsabilidade do cadastro; fiscal precisa auditar. Agente pode avisar: "Produto X usa NCM 95.06.91.00; favor validar se ainda eh correto".

### A9: Estado (UF) com Valor Inconsistente
**Armadilha:** Campo `state_id` eh M2O para sped.estado; pode vir NULL, ou string em vez de referencia.

**Impacto:** Se relNome() falhar, uf fica NULL mesmo que houve entrada.

**Mitigacao:** Builder ja trata com relNome; se vir NULL, significa estado_id nao foi populado no Odoo.

### A10: JOIN FatoParceiro com FatoNotaFiscal Duplica Linhas
**Armadilha:** Se usar LEFT JOIN fato_parceiro p LEFT JOIN fato_nota_fiscal n ON p.odooId = n.participanteId, para cliente com 10 notas, retorna 10 linhas (uma por nota). Usar COUNT(*) retorna 10, nao 1.

**Mitigacao:** Se quiser agregacao por cliente, usar GROUP BY p.odooId antes do COUNT; ou usar subquery.

**Melhor pratica:** Sempre testar JOIN com COUNT para validar multiplicidade.

---

## 7. GAPS PRINCIPAIS (O que falta para responder TUDO)

### G1: Tool "Listar Produtos"
**Descricao:** Nao existe tool de listagem/busca de produtos com filtros.  
**Necessario para:** Responder "qual preco do produto X?", "ficha tecnica do produto", "produtos com preco zerado"  
**Prioridade:** ALTA (essencial para agente Nex vender)

### G2: Tool "Produtos por Familia"
**Descricao:** Agregacao de produtos por categoria/familia.  
**Necessario para:** "Produtos em categoria Y?", "Comparacao de precos por familia"  
**Prioridade:** MEDIA (relatório de inventario)

### G3: Tool "Produtos por Marca"
**Descricao:** Agregacao de produtos por marca.  
**Necessario para:** "Fabricantes em catalogo?", "Produtos da marca X"  
**Prioridade:** MEDIA

### G4: Tool "Parceiros Duplicados"
**Descricao:** Detectar registros duplicados (mesmo nome ou documento).  
**Necessario para:** Auditoria de qualidade de dados  
**Prioridade:** BAIXA (nao afeta venda, mas melhora integridade)

### G5: Tool "Parceiros por Regiao"
**Descricao:** Agregacao nao por UF, mas por regiao geografica (Sul, Sudeste, etc.)  
**Necessario para:** "Temos presenca no Sudeste?"  
**Prioridade:** BAIXA (requires auxiliary mapping table)

### G6: Fato_Servico (Nao Existe)
**Descricao:** raw_sped_servico tem dados, mas nao ha fato_servico construido.  
**Necessario para:** Queries mais rapidas em servicos; auditoria de uso  
**Prioridade:** MEDIA (servicos existem, mas acesso eh raw)

### G7: Dados de Atualizacao de Documento
**Descricao:** Campo `documento` em fato_parceiro nao tem historico; se mudar, o valor anterior se perde.  
**Necessario para:** "CNPJ anterior do cliente X?"  
**Prioridade:** BAIXA (raro precisar; seria auditoria)

### G8: Cruzamento Parceiro + Estoque + Fiscal
**Descricao:** Nao existe query pre-construida de "produtos ja vendidos a cliente X" ou "cliente X compra como frequencia?"  
**Necessario para:** Recomendacoes do Nex ("baseado em historico, pode interessar produto Y")  
**Prioridade:** MEDIA (depende de F4 onda 2 de comercial)

### G9: Previsao/Custo de Venda (Margem Dinamica)
**Descricao:** Calculo de margem bruta (precoVenda - precoCusto) nao esta formalizado em fato nem query.  
**Necessario para:** "Qual eh a margem do produto X?"  
**Prioridade:** MEDIA (financeiro pode precisar)

### G10: Atividades/Historico de Contato com Parceiro
**Descricao:** raw_mail_activity (do Odoo) nao esta sincronizado nem formalizado em fato.  
**Necessario para:** "Quando foi ultimo contato com cliente X?" "Quantas atividades em aberto?"  
**Prioridade:** MEDIA (CRM, nao obrigatorio para venda)

---

## 8. SINTESE: O QUE O AGENTE NEX PODE FAZER AGORA vs O QUE FALTA

### Hoje (Onda 1 - Cadastros Completo)

**PODE FAZER:**
1. Buscar cliente/fornecedor por nome ou CNPJ
2. Ver detalhes (email, telefone, UF, cidade)
3. Contar clientes/fornecedores ativos/inativos
4. Listar cidades/UFs onde temos presenca
5. Ver parceiros novos em um periodo
6. Listar servicos (basicamente raw)
7. Contar servicos
8. Auditar parceiros sem documento
9. Listar filiais do grupo

**NAO PODE FAZER (Falta de Tool):**
1. Buscar produto por nome/codigo ("Qual eh o halter X?")
2. Ver preco de um produto
3. Ver ficha tecnica completa (para prompt de venda)
4. Listar produtos por categoria
5. Listar brands disponiveis
6. Responder "quais produtos sao equipamentos vs servicos?"
7. Ver produtos com saldo zero ou parados
8. Responder "qual margem do produto X?"
9. Responder "produtos ja vendidos ao cliente X?" (requer fiscal)

### Proximas Ondas (F4 Onda 2+)

**Sera possivel (apos criar as tools):**
1. Tudo acima + combinacoes com estoque, fiscal e financeiro
2. Agente pode montar pitch de venda completo com preco, estoque, historico
3. Agente pode aconselhar "cliente compra Y, pode interessar Z"
4. Agente pode dizer "cliente tem 5 titulos vencidos" (cruzamento com financeiro)

---

## 9. RESUMO EXECUTIVO

**Raw Tables do Dominio:** 75 tabelas raw (cobrindo todos os modelos Odoo)  
**Fato Tables do Dominio:** 3 tabelas fato principais (fato_parceiro, fato_produto, fato_produto_parado) + 1 dimensao (dim_empresa_grupo)  
**Tools Existentes:** 21 tools (12 read + 9 write)  
**Perguntas Catologadas:** 60+ perguntas realistas  
**Respondidas Hoje:** ~35 (ONDA 1 - Cadastros e Parceiros, Servicos Basico)  
**Parcialmente:** ~10 (faltam filtros ou parametros adicionais)  
**Gaps Critcos:** 10 (maioria de produtos, derivadas, e cruzamentos)

**Prioridade para F4 Onda 2:**
1. **CRITICA:** Tool buscar_produto + tool produto_listar (permite agente vender)
2. **MEDIA:** Fato_servico, produtos por familia/marca
3. **BAIXA:** Validacoes e auditoria (duplicatas, inconsistencias)

---

## 10. MATRIZ DE RASTREABILIDADE

| Metrica | Tool(s) | Status | Prioridade |
|---------|---------|--------|-----------|
| Total Clientes Ativos | cadastro_contar_parceiros | OK | CRITICA |
| Total Fornecedores | cadastro_contar_parceiros | OK | CRITICA |
| Clientes por UF | cadastro_parceiros_por_uf | OK | MEDIA |
| Clientes por Cidade | cadastro_parceiros_por_cidade | OK | MEDIA |
| Parceiros Novos (Periodo) | cadastro_parceiros_novos | OK | MEDIA |
| Ficha do Parceiro | cadastro_detalhar_parceiro | OK | CRITICA |
| Total Produtos | NENHUMA | GAP | CRITICA |
| Ficha do Produto | NENHUMA | GAP | CRITICA |
| Preco Produto | NENHUMA | GAP | CRITICA |
| Produtos por Familia | NENHUMA | GAP | MEDIA |
| Produtos por Marca | NENHUMA | GAP | MEDIA |
| Total Servicos | servico_contar | OK | MEDIA |
| Detalhe Servico | servico_buscar | OK | MEDIA |
| Empresas do Grupo | cadastro_filiais_listar | OK | MEDIA |

---

**Dossie finalizado em:** 2026-06-06  
**Proximo passo:** Criar tools de produto (G1, G2, G3) para completar onda 1 de cadastros
