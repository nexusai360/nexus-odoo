# Auditoria Discovery x Cache x MCP — 2026-05-28

> Read-only. Gerado por `discovery/odoo-schema/audit.py` cruzando
> `schema.json` (Odoo Admin), `prisma/schema.prisma` e `mcp/tools/**`.

> **Nada do agente Nex foi alterado.** Este documento e apenas leitura.


## 1. Cobertura por prefixo customizado

| Prefixo | Modelos no Odoo | No cache (raw_*) | Faltam | Cobertura |
|---|---:|---:|---:|---:|
| `sped.*` | 256 | 73 | 183 | 28.5% |
| `finan.*` | 44 | 19 | 25 | 43.2% |
| `contabil.*` | 29 | 2 | 27 | 6.9% |
| `pedido.*` | 26 | 8 | 18 | 30.8% |
| `estoque.*` | 16 | 8 | 8 | 50.0% |
| `producao.*` | 5 | 1 | 4 | 20.0% |
| `crm.*` | 2 | 0 | 2 | 0.0% |
| `relatorio.*` | 19 | 0 | 19 | 0.0% |
| `auditoria.*` | 3 | 0 | 3 | 0.0% |
| `wms.*` | 6 | 0 | 6 | 0.0% |

## 2. Modelos Odoo customizados ausentes do cache

Candidatos a virarem novas tabelas raw_* (e potencialmente tools MCP no Nex).
So lista os 60 primeiros de cada prefixo para nao inundar.


### `sped.*` (183 ausentes)

- `sped.alteracao.documento` — SPED - Alteração de documentos
- `sped.alteracao.documento.item` — SPED - Itens de alteração de documentos
- `sped.apuracao.ajuste` — SPED - Apuração Ajuste
- `sped.apuracao.auditoria` — SPED - Auditoria de Apuração
- `sped.apuracao.auditoria.item` — SPED - Item de Auditoria de Apuração
- `sped.apuracao.ecd` — SPED Contábil - ECD
- `sped.apuracao.ipi` — SPED - IPI
- `sped.apuracao.tabela` — SPED - Tabelas de código
- `sped.base` — Base para moedas e outros métodos
- `sped.base.modelo.impressao` — Base para modelos de impressos
- `sped.caminho` — Pasta
- `sped.caminho.arquivo` — Arquivo na pasta
- `sped.caminho.base` — Pasta base
- `sped.configuracao.geral` — Configuração Geral
- `sped.configuracao.geral.base` — Configuração Geral base
- `sped.consulta.dfe` — Consulta DF-e
- `sped.consulta.dfe.item` — Item de Consulta DF-e
- `sped.consulta.dfe.item.confirmacao` — Confirmação de Item de Consulta DF-e
- `sped.documento.base` — Base fiscal para os pedidos
- `sped.documento.item.ajuste.apuracao` — Códigos de ajuste de apuração
- `sped.documento.item.declaracao.importacao.adicao` — Adições da Declaração de Importação do Item do Documento Fiscal
- `sped.documento.item.pcp` — PCP do Item do Documento Fiscal
- `sped.documento.item.pedido.atendido` — Pedidos atendidos do Item do Documento Fiscal
- `sped.documento.modelo.impressao` — Impressos  (Documento Fiscal)
- `sped.exporta.documento.anexos` — Exportar anexos dos documentos fiscais
- `sped.grava.anexo` — Grava Anexo
- `sped.ibptax` — IBPTax
- `sped.ibptax.nbs` — IBPTax por NBS
- `sped.ibptax.ncm` — IBPTax por NCM
- `sped.ibptax.servico` — IBPTax por Serviço
- `sped.impressao` — Base para impressos
- `sped.mdfe` — MDF-e
- `sped.mdfe.percurso` — MDF-e - Percurso
- `sped.modelo.impressao` — Impressos  (Fiscais)
- `sped.moeda` — Multi moeda
- `sped.operacao.mdfe` — Operação Fiscal - MDF-e
- `sped.participante.api` — Finan cadastro de cliente com carteira bancaria
- `sped.participante.ie` — Participantes - Inscrições Estaduais
- `sped.participante.perfil.arvore` — Perfil de Participantes - Árvore de Análise
- `sped.participante.segmento.arvore` — Segmento de Participantes - Árvore de Análise
- `sped.patrimonio.ciap` — SPED - Patrimonio CIAP
- `sped.pdv` — sped.pdv
- `sped.pessoa` — Base para dados pessoais (participantes e endereços)
- `sped.pessoa.metodos` — Métodos base para validação de dados pessoais
- `sped.produto.anvisa` — Registro na ANVISA dos produtos
- `sped.produto.caracteristica` — Característica de Produtos
- `sped.produto.caracteristica.arvore` — Característica de Produtos - Árvore de Análise
- `sped.produto.codigo.barras` — Códigos de Barras de Produtos
- `sped.produto.departamento` — Departamento de Produtos
- `sped.produto.departamento.arvore` — Departamento de Produtos - Árvore de Análise
- `sped.produto.ecommerce.wizard` — Wizard Produto ecommerce
- `sped.produto.familia.arvore` — Família de Produtos - Árvore de Análise
- `sped.produto.imagem` — Imagens de Produtos
- `sped.produto.lista.material.arvore` — Lista de Material - Árvore de Análise
- `sped.produto.lote.serie.conjugado` — Lote/Série(s) de Produtos conjugados
- `sped.produto.parametro.qualidade` — Parâmetro de qualidade do produto
- `sped.produto.parametro.qualidade.opcao` — Opção para o parâmetro de qualidade do produto
- `sped.protocolo.icms` — Protocolos ICMS
- `sped.protocolo.icms.aliquota` — Protocolos ICMS - alíquotas
- `sped.protocolo.icms.ncm` — Protocolos ICMS - NCM e MVA

### `finan.*` (25 ausentes)

- `finan.alcada` — Alçada
- `finan.alcada.item` — Item da alçada
- `finan.banco.arvore` — Conta Bancária - Árvore de Análise
- `finan.banco.historico.fechamento` — Histórico de Fechamento
- `finan.centro.resultado.arvore` — Centro de resultado - Árvore de Análise
- `finan.centro.resultado.rateio` — Rateio por Centro de Resultado
- `finan.cheque` — Cheques
- `finan.conta.arvore` — Conta Gerencial - Árvore de Análise
- `finan.demonstracao` — Demonstração financeira
- `finan.demonstracao.item` — Item de demonstração financeira
- `finan.demonstracao.item.arvore` — Item de demonstração financeira - Árvore de Análise
- `finan.dia.mes` — Dia do mês
- `finan.dia.semana` — Dia da semana
- `finan.dia.util` — Dia útil
- `finan.executa.demonstracao` — Relatório de Demonstracao Financera
- `finan.executa.demonstracao.item` — Item da execucao da demonstração financeira
- `finan.forma.condicao.taxa` — Taxas sobre Forma e Condição de Pagamemento
- `finan.importa.contas.a.pagar` — Importa contas a pagar
- `finan.importa.documento` — Importa documento financeiro
- `finan.importacao` — Importação Financeira
- `finan.importacao.item` — Item de importação Financeira
- `finan.lancamento.atualiza` — Atualiza lançamento financeiro
- `finan.modelo.impressao` — Impressos  (Financeiro)
- `finan.pix` — Finan Pix
- `finan.retorno.wizard` — Wizard de Retorno de Remessa Bancária

### `contabil.*` (27 ausentes)

- `contabil.centro.custo` — Centro de Custo
- `contabil.centro.custo.arvore` — Centro de custo - Árvore de Análise
- `contabil.conta.arvore` — Conta Contábil - Árvore de Análise
- `contabil.conta.centro.custo` — Conta Contábil - Centros de Custo
- `contabil.conta.centro.resultado` — Conta Contábil - Centros de Resultado
- `contabil.conta.cfop` — Conta Contábil - De-Para por CFOP
- `contabil.conta.referencial.arvore` — Conta Contábil Referencial - Árvore de Análise
- `contabil.demonstracao` — Demonstração contábil
- `contabil.demonstracao.item` — Item de demonstração contábil
- `contabil.demonstracao.item.arvore` — Item de demonstração contábil - Árvore de Análise
- `contabil.depreciacao` — Lançamento Depreciação Contábil
- `contabil.depreciacao.gerencial` — Lançamento Depreciação Gerencial
- `contabil.depreciacao.wizard` — Gerar depreciacões do Patrimonio
- `contabil.encerramento` — Encerramento Contábil
- `contabil.encerramento.item` — Item do Encerramento Contábil
- `contabil.executa.demonstracao` — Relatório de Demonstracao contabilcera
- `contabil.executa.demonstracao.item` — Item da execucao da demonstração contabilceira
- `contabil.historico` — Histórico
- `contabil.historico.arvore` — Histórico - Árvore de Análise
- `contabil.lancamento` — Lançamento Contábil
- `contabil.lancamento.item` — Item/Partida do Lançamento Contábil
- `contabil.lancamento.item.rateio` — Rateio do Item do Lançamento Contábil
- `contabil.lancamento.rateio` — Rateio do Lançamento Contábil
- `contabil.lote.lancamento` — Lote de Lançamento Contábil
- `contabil.modelo.impressao` — Impressos  (Contabilidade)
- `contabil.operacao` — Operações Contábeis
- `contabil.operacao.item` — Itens da Operação Contábil

### `pedido.*` (18 ausentes)

- `pedido.comissao` — Comissão do Pedido
- `pedido.defeito` — Defeitos
- `pedido.defeito.arvore` — Defeitos - Árvore de Análise
- `pedido.documento.avanca.etapa` — Avança etapa de produção
- `pedido.documento.avanca.etapa.item` — Item do avança etapa de produção
- `pedido.documento.cotacao` — Cotação
- `pedido.documento.cotacao.analise` — Itens da cotação
- `pedido.documento.cotacao.item` — Itens da cotação
- `pedido.documento.parametro.qualidade` — Parâmetro de qualidade do pedido
- `pedido.documento.processo` — Processo de produção do pedido
- `pedido.documento.producao.wizard` — Wizard de produção
- `pedido.documento.rateio` — Documento do Lançamento Financeiro
- `pedido.documento.reajuste` — Contrato Reajuste
- `pedido.documento.reajuste.item` — Contrato Reajuste Item
- `pedido.etapa.tempo` — Tempo Etapa do Pedido
- `pedido.modelo.impressao` — Impressos  (Pedido)
- `pedido.operacao.condicao.comercial` — Condição Comercial
- `pedido.pagamento` — Pagamentos do pedido

### `estoque.*` (8 ausentes)

- `estoque.local.arvore` — Local de Estoque - Árvore de Análise
- `estoque.local.endereco` — Endereços dos produtos nos locais de estoque
- `estoque.minimo.maximo` — Estoque mínimo e máximo
- `estoque.norma.palete` — Normas de palete
- `estoque.norma.palete.item` — Item das normas de palete
- `estoque.requisito` — Requisitos de Armazenagem
- `estoque.requisito.arvore` — Requisito de Armazenagem - Árvore de Análise
- `estoque.tipo.palete` — Tipos de palete

### `producao.*` (4 ausentes)

- `producao.alteracao.materia.prima` — Alteração de matéria-prima da lista de material
- `producao.alteracao.materia.prima.item` — Item de alteração de matéria-prima da lista de material
- `producao.centro.trabalho` — Produção - Centro - Trabalho
- `producao.parametro.qualidade` — Parâmetros de qualidade

### `crm.*` (2 ausentes)

- `crm.pipeline` — CRM - Pipeline
- `crm.pipeline.etapa` — CRM - Etapa do pipeline

### `relatorio.*` (19 ausentes)

- `relatorio.executa` — Relatório (execução)
- `relatorio.executa.base` — Base para tela de filtro de relatórios
- `relatorio.executa.contabil.lancamento` — Relatório de Lançamentos Financeiros
- `relatorio.executa.estoque.extrato` — Relatório de Extrato de Estoque
- `relatorio.executa.finan.banco.extrato` — Relatório de Extratos Financeiros
- `relatorio.executa.finan.banco.saldo` — Relatório de Saldos Financeiros
- `relatorio.executa.finan.fluxo.caixa` — Relatório de Fluxo de Caixa
- `relatorio.executa.finan.lancamento` — Relatório de Lançamentos Financeiros
- `relatorio.executa.finan.pagamento.divida` — Relatório de Pagamentos de Dívidas
- `relatorio.executa.pedido.documento` — Relatório de Pedidos Diversos
- `relatorio.executa.rh.holerite.relatorio` — Relatório RH Holerite
- `relatorio.executa.sped.apuracao` — Relatório de Apurações Fiscais
- `relatorio.executa.sped.documento` — Relatório de Documentos Fiscais
- `relatorio.executa.sped.documento.item` — Relatório de Itens de Documentos Fiscais
- `relatorio.executa.sped.produto` — Relatório de Produtos
- `relatorio.executa.sped.produto.lista.material` — Relatório de Listas de Material
- `relatorio.executa.sped.produto.lote.serie` — Relatório de Lotes/Séries
- `relatorio.relatorio` — Relatório
- `relatorio.sql` — Relatório - SQL adicional

### `auditoria.*` (3 ausentes)

- `auditoria.log` — Log de auditoria
- `auditoria.log.item` — Item de Log de auditoria
- `auditoria.regra` — Regra de auditoria

### `wms.*` (6 ausentes)

- `wms.documento` — WMS Documento
- `wms.documento.historico` — Histório de Etapas da Operação de WMS
- `wms.documento.item` — WMS Item de documento
- `wms.etapa` — Etapa do WMS
- `wms.modelo.impressao` — Impressos  (WMS)
- `wms.operacao` — Operações de WMS

## 3. Cobertura da camada de fatos (o que o Nex realmente consulta)

Tools do MCP consultam `fato_*`, nao `raw_*` diretamente.
Hoje existem **20 tabelas de fatos** no Prisma.

### Fatos COM tool MCP cobrindo
- `fato_apuracao` — 2 tool(s)
- `fato_build_state` — 1 tool(s)
- `fato_carta_correcao` — 2 tool(s)
- `fato_certificado` — 2 tool(s)
- `fato_conta_contabil` — 3 tool(s)
- `fato_estoque_movimento` — 4 tool(s)
- `fato_estoque_saldo` — 9 tool(s)
- `fato_financeiro_movimento` — 3 tool(s)
- `fato_financeiro_saldo` — 3 tool(s)
- `fato_financeiro_titulo` — 5 tool(s)
- `fato_nota_fiscal` — 14 tool(s)
- `fato_nota_fiscal_item` — 4 tool(s)
- `fato_parceiro` — 14 tool(s)
- `fato_pedido` — 14 tool(s)
- `fato_pedido_parcela` — 3 tool(s)
- `fato_preco` — 4 tool(s)
- `fato_produto` — 10 tool(s)
- `fato_produto_parado` — 3 tool(s)
- `fato_referencia` — 2 tool(s)
- `fato_servico` — 4 tool(s)

### Fatos SEM tool MCP cobrindo (capacidade ociosa do agente)
_Todos os fatos sao consultados por pelo menos uma tool._

### Raw tables sem fato derivado (so cache, sem agregacao semantica)
Tabelas no cache que ainda nao viraram fato. Para virar tool, o caminho
eh: criar fato_* derivado -> criar tool MCP que consulta o fato.

Total: **96** de 114 raw_* sem fato heuristicamente associado.
_(Lista omitida por tamanho. Disponivel em `discovery/odoo-schema/raw_sem_fato.json` se necessario.)_

## 4. Selections (status/tipos) de modelos customizados

Campos do tipo `selection` com varios valores. Usar essas listas evita
o Nex chutar nomes de status. Top 30 por quantidade de opcoes.

| Campo (label do Odoo) | # opcoes | Exemplos |
|---|---:|---|
| CST PIS-COFINS de origem (SPED - Itens de alteração de documentos) | 66 | 01, 01, 02, 02, 03 |
| CST PIS-COFINS de destino (SPED - Itens de alteração de documentos) | 66 | 01, 01, 02, 02, 03 |
| Modelo (SPED - Item de Auditoria de Apuração) | 63 | RPA, ND, NC, FL, FC |
| Tipo do pedido (Email Templates) | 46 | prospecto, venda, ecommerce, pdv, caixa |
| Tipo (Impressos  (Pedido)) | 46 | prospecto, venda, ecommerce, pdv, caixa |
| Tipo (Etapa do Pedido) | 46 | prospecto, venda, ecommerce, pdv, caixa |
| Tipo (Operações de Pedido) | 46 | prospecto, venda, ecommerce, pdv, caixa |
| Tipo (Pedido) | 46 | prospecto, venda, ecommerce, pdv, caixa |
| Tipo (Faturamento de pedido/contrato) | 46 | prospecto, venda, ecommerce, pdv, caixa |
| Tipo (CRM - Pipeline) | 46 | prospecto, venda, ecommerce, pdv, caixa |
| Dia para faturamento (Pedido) | 30 | 1, 2, 3, 4, 5 |
| Dia para faturamento (Faturamento de pedido/contrato) | 30 | 1, 2, 3, 4, 5 |
| Mês (Relatório de Lançamentos Financeiros) | 24 | 01, 01, 02, 02, 03 |
| Situação (Relatório de Lançamentos Financeiros) | 17 | provisorio, provisorio, provisorio, compensacao, a_vencer |

## 5. Resumo executivo

- **Modelos Odoo:** 652 | **Cache raw_*:** 114 | **Fatos:** 20 | **Tools MCP:** 79
- Cobertura do **sped.\***: 28.5% (73/256)
- Cobertura do **finan.\***: 43.2% (19/44)
- Cobertura do **pedido.\***: 30.8% (8/26)
- Cobertura do **contabil.\***: 6.9% (2/29)
- Cobertura do **estoque.\***: 50.0% (8/16)
- Tabelas raw_* sem tool MCP cobrindo: **113**

> Proximas decisoes ficam com o usuario. Nada implementado a partir deste relatorio.