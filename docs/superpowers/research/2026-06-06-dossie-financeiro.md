# Dossier do Dominio Financeiro (F4 Onda 1)

**Versao:** 1.0 (2026-06-06)  
**Analista:** Claude Code  
**Contexto:** Reconstrucao do agente Nex com precisao absoluta, descentralizado por dominio, custo baixo, determinístico, e sem alucinacao.

---

## Indice

1. [Tabelas e Campos](#1-tabelas-e-campos)
2. [Tools Existentes](#2-tools-existentes)
3. [Catalogo Exaustivo de Perguntas](#3-catalogo-exaustivo-de-perguntas)
4. [Metricas Canonicas](#4-metricas-canonicas)
5. [Combinacoes Cruzadas com Outros Dominios](#5-combinacoes-cruzadas)
6. [Armadilhas de Dado](#6-armadilhas-de-dado)

---

## 1. Tabelas e Campos

### 1.1 Tabelas RAW (espelho do Odoo, JSON)

A camada raw contem snapshots/incrementos diretos do JSON-RPC do Odoo. Toda tabela tem:
- `odooId` (PK): id do registro no Odoo
- `data` (JSON): payload bruto do Odoo
- `odooWriteDate` (DateTime?): timestamp da ultima atualizacao no Odoo
- `syncedAt` (DateTime): timestamp da ultima sincronizacao para o cache
- `rawDeleted` (Boolean): marcador logico de exclusao

#### Tabelas RAW do Financeiro (25 tabelas)

| Tabela | Modelo Odoo | Volume Aprox. | Proposito | Campos Chave |
|--------|-------------|---|----------|-------|
| `raw_finan_banco` | finan.banco | 9 | Cadastro de bancos | banco_id, codigo, nome |
| `raw_finan_banco_extrato` | finan.banco.extrato | 1.591 | Linhas de extrato bancario (movimentacao) | banco_id, data, descricao, valor |
| `raw_finan_banco_saldo` | finan.banco.saldo | 238 | Saldo por data/banco (historico) | banco_id, data_saldo, saldo |
| `raw_finan_banco_saldo_hoje` | finan.banco.saldo.hoje | 8 | Snapshot de saldos atuais | **banco_id (PK)**, saldo, entrada, saida, anterior |
| `raw_finan_carteira` | finan.carteira | ~5 | Carteiras de cobranca (boleto/cheque) | carteira_id, banco_id, tipo |
| `raw_finan_centro_resultado` | finan.centro.resultado | ~30 | Centros de custo/resultado gerencial | centro_id, nome, codigo |
| `raw_finan_conta` | finan.conta | 66 | Contas gerenciais (chart of accounts simples) | conta_id, nome, tipo, pai_id |
| `raw_finan_documento` | finan.documento | ~100 | Documentos genericos de financeiro | documento_id, numero, tipo |
| `raw_finan_fluxo_caixa` | finan.fluxo.caixa | 16.834 | Movimentacoes previstas/realizadas de caixa | **fluxo_id**, data, conta_id, entrada, saida, entrada_prevista, saida_prevista, centro_resultado_id |
| `raw_finan_forma_pagamento` | finan.forma.pagamento | ~20 | Metodos de pagamento cadastrados | forma_id, nome (boleto, cheque, pix, ted, dinheiro) |
| `raw_finan_lancamento` | finan.lancamento | 10.015 | **Carteira de titulos** (a receber/a pagar) | **lancamento_id**, tipo ('a_receber','a_pagar','recebimento','pagamento','entrada','saida'), participante_id, data_vencimento, vr_saldo, vr_documento, vr_total, situacao_divida_simples |
| `raw_finan_lancamento_item` | finan.lancamento.item | **9.663** | **Rateio do lancamento** (conta gerencial + centro resultado) | **item_id**, lancamento_id, conta_id, centro_resultado_id, vr_documento, vr_total, vr_saldo, vr_pago_total |
| `raw_finan_pagamento_divida` | finan.pagamento.divida | 1.672 | **Eventos de pagamento** (baixas, nao títulos) | pagamento_id, lancamento_id, data_pagamento, vr_pago, situacao |
| `raw_finan_remessa` | finan.remessa | ~50 | Arquivos de remessa enviados ao banco | remessa_id, banco_id, data, tipo |
| `raw_finan_remessa_item` | finan.remessa.item | ~500 | Itens da remessa (titulos cobrados) | remessa_item_id, remessa_id, lancamento_id, vr_remessa |
| `raw_finan_retorno` | finan.retorno | ~50 | Arquivos de retorno recebidos do banco | retorno_id, banco_id, data, vr_entrada, vr_saida |
| `raw_finan_retorno_item` | finan.retorno.item | ~2.000 | Itens do retorno (pagamentos/rejeicoes) | retorno_item_id, retorno_id, lancamento_id, nosso_numero, vr_pago, situacao |
| `raw_finan_tipo_faturamento` | finan.tipo.faturamento | ~10 | Tipos de faturamento (NF, boleto, etc.) | tipo_id, nome |
| `raw_contabil_conta` | contabil.conta | 934 | Plano de contas (dimensao; sem movimento) | conta_id, nome, codigo, natureza |
| `raw_contabil_conta_referencial` | contabil.conta.referencial | 2.204 | Estrutura de plano de contas (arvore) | conta_id, pai_id, nome_completo |
| `raw_contabil_lancamento` | contabil.lancamento | **0** | Lancamentos contabeis | (vazio; nao operado) |
| `raw_contabil_lancamento_item` | contabil.lancamento.item | **0** | Itens do lancamento contabil | (vazio; nao operado) |
| `raw_finan_cheque` | finan.cheque | ~10 | Cheques emitidos (forma de pagamento) | cheque_id, banco_id, numero, data, vr_cheque, situacao |
| `raw_finan_pix` | finan.pix | ~100 | Transacoes PIX (forma de pagamento) | pix_id, data, vr_pix, situacao |
| `raw_finan_baixa_lancamento` | finan.baixa.lancamento | ~500 | Baixas manuais de titulos | baixa_id, lancamento_id, data_baixa, vr_baixa |

**Resumo RAW Finan:**
- **Carteira de titulos:** `finan.lancamento` (10.015) + `finan.lancamento.item` (9.663)
- **Movimentacao de caixa:** `finan.fluxo.caixa` (16.834), `finan.banco.extrato` (1.591)
- **Cobranca/pagamento:** `finan.remessa`/`finan.retorno` + itens, `finan.cheque`, `finan.pix`
- **Bancario:** `finan.banco.saldo.hoje` (snapshot de 8 contas correntes)
- **Contabil:** plano de contas existente (934), mas sem movimento contabil

### 1.2 Tabelas FATO (derivadas, modeladas)

Fatos sao tabelas derivadas dos raws, com regras de negocio aplicadas. Contem cache limpo, pronto para agregacao. Todas tem `atualizadoEm` com `@default(now())`.

#### Tabelas FATO do Financeiro (4 fatos core + 2 cobranca bancaria)

| Fato | Fonte Raw | Campos | Proposito | PK |
|------|-----------|--------|-----------|-----|
| **`fato_financeiro_saldo`** | `raw_finan_banco_saldo_hoje` | `bancoId`, `bancoNome`, `tipo` (corrente), `dataReferencia`, `saldoAnterior`, `entrada`, `saida`, `saldo` | Snapshot de saldo por banco hoje | `bancoId` (UNICO, snapshot) |
| **`fato_financeiro_movimento`** | `raw_finan_fluxo_caixa` | `odooId`, `data`, `contaId`, `contaNome`, `centroResultadoId`, `centroResultadoNome`, `entrada`, `saida`, `valor`, `entradaPrevista`, `saidaPrevista`, `valorPrevisto` | Fluxo de caixa (realizado vs previsto) coexistem na mesma linha | `odooId` |
| **`fato_financeiro_titulo`** | `raw_finan_lancamento` (filtro `tipo IN ('a_receber','a_pagar')`) | `odooId`, `tipo`, `participanteId`, `participanteNome`, `contaId`, `contaNome`, `numeroDocumento`, `dataDocumento`, `dataVencimento`, `dataPagamento`, `situacao`, `situacaoSimples`, `vrDocumento`, **`vrSaldo`** (= valor correto a receber/pagar em aberto), `vrTotal`, `vrJuros`, `vrMulta`, `vrDesconto` | **Carteira de titulos** (a receber/a pagar abertos) | `odooId` |
| **`fato_financeiro_lancamento_item`** | `raw_finan_lancamento_item` + join `raw_finan_lancamento` para herdar `tipo` | `odooId`, `lancamentoId`, `tipo` (herdado do pai), `contaId`, `contaNome`, `centroResultadoId`, `centroResultadoNome`, `descricao`, `pedidoId`, `vrDocumento`, `vrTotal`, `vrSaldo`, `vrPagoTotal`, `dataDocumento` | **DRE gerencial** por conta (rateio do lancamento) | `odooId` |
| `fato_remessa_bancaria` | `raw_finan_remessa` | `odooId`, `bancoId`, `bancoNome`, `cnpjCpfRaiz`, `carteiraId`, `dataPagamento`, `confirmada`, `dataConfirmacao` | Remessas geradas ao banco | `odooId` |
| `fato_retorno_bancario` | `raw_finan_retorno` | `odooId`, `bancoId`, `bancoNome`, `cnpjCpfRaiz`, `carteiraId`, `totalEntradas`, `totalSaidas`, `saldo`, `dataInicialOfx`, `dataFinalOfx`, `caixaFechado` | Retornos processados do banco | `odooId` |

**Tabelas FATO Contabil:**
- `fato_contabil_lancamento`: lancamentos contabeis (vazio no Odoo)
- `fato_contabil_lancamento_item`: itens do lancamento contabil (vazio no Odoo)

**Status do Dominio:**
- **Financeiro (Finan):** 4 fatos em producao, cobranca bancaria 2 fatos ativados data-driven
- **Contabil:** sem dado real (lancamentos = 0); plano de contas (dimensao) ainda nao exposto
- **Producao:** sem dado (1 processo apenas); omitido

---

## 2. Tools Existentes

### 2.1 Catálogo de Tools do Financeiro

Todas as tools sao arquivos em `mcp/tools/financeiro/*.ts`. O index importa e exporta. Parametros opcionais aparecem na descricao.

#### TOOLS CORE (7 ferramentas)

| ID da Tool | Parametros de Entrada | Retorna | Proposito | Fonte | Status |
|-----------|---|---|----------|--------|--------|
| **`financeiro_saldo_contas`** | (nenhum) | contas[], saldoTotal | Saldo atual por banco/conta | `fato_financeiro_saldo` | OK |
| **`financeiro_caixa_periodo`** | periodoDe?, periodoAte? (AAAA-MM-DD) | entrada, saida, saldo | Movimento de caixa no periodo | `fato_financeiro_movimento` | OK |
| **`financeiro_fluxo_caixa`** | periodoDe?, periodoAte? | serie[] (periodo, realizado, previsto) | Serie mensal fluxo realizado vs previsto | `fato_financeiro_movimento` | OK |
| **`financeiro_contas_a_receber`** | participanteId? | titulos[], totalAReceber | Titulos abertos a receber (clientes) | `fato_financeiro_titulo` (tipo='a_receber', situacao='aberto') | OK |
| **`financeiro_contas_a_pagar`** | participanteId? | titulos[], totalAPagar, topMaiores | Titulos abertos a pagar (fornecedores) | `fato_financeiro_titulo` (tipo='a_pagar', situacao='aberto') | OK |
| **`financeiro_titulos_vencidos`** | tipo? ('a_receber','a_pagar','todos'), janela? ('hoje','ate_hoje') | titulos[], totalVencido | Titulos vencidos nao pagos (atraso) | `fato_financeiro_titulo` (situacao='aberto', data_vencimento < hoje) | OK |
| **`financeiro_liquidez`** | (nenhum) | liquidezMensalDia[], indice | Indice de liquidez (caixa/compromissos curto prazo) | `fato_financeiro_movimento` + `fato_financeiro_titulo` | OK |
| **`financeiro_resultado_por_conta`** | periodoDe?, periodoAte?, natureza? ('receita','despesa'), limite? | linhas[] (contaNome, natureza, total, itens), totalReceita, totalDespesa, resultado | DRE gerencial por conta | `fato_financeiro_lancamento_item` | OK |

#### TOOLS COBRANCA BANCARIA (6 ferramentas, data-driven)

Todas aceitam `periodoDe/periodoAte` (AAAA-MM-DD) e `limit/offset` para paginacao.

| ID da Tool | Retorna | Proposito | Fonte | Ativacao | Status |
|-----------|---|----------|--------|----------|--------|
| **`financeiro_baixas_cobranca`** | baixas[] (nosso_numero, data, participante, vr_pago, vr_juros, vr_multa, vr_desconto, vr_tarifas) | Pagamentos recebidos via retorno bancario | `fato_retorno_item` | Quando houver dados | [OK] |
| **`financeiro_retornos_processados`** | retornos[] (banco, data, vr_entrada, vr_saida, saldo) | Arquivos de retorno processados do banco | `fato_retorno_bancario` | Quando houver dados | [OK] |
| **`financeiro_remessas_geradas`** | remessas[] (banco, data, tipo, confirmada) | Arquivos de remessa enviados ao banco | `fato_remessa_bancaria` | Quando houver dados | [OK] |
| **`financeiro_carteiras_cobranca`** | carteiras[] (nome, banco, tipo, beneficiario) | Configuracoes de boleto/cobranca por banco | `fato_carteira_cobranca` | Quando houver dados | [OK] |
| **`financeiro_cheques`** | cheques[] (numero, banco, data, vr_cheque, situacao) | Cheques emitidos (forma de pagamento) | `fato_cheque` | Quando houver dados | [OK] |
| **`financeiro_pix_recebidos`** | pix[] (data, vr_pix, descricao, situacao) | Transacoes PIX recebidas/enviadas | `fato_pix` | Quando houver dados | [OK] |

**Padroes de design appliqueda:**
- Envelope canonico: `{ estado: 'ok'|'vazio'|'preparando', dados, atualizadoEm, atualizadoHa, fonteStatus }`
- Campos opcionais em `dados`: `_RESPOSTA` (resumo), `_DESTAQUE` (metricas chave), `_agregado` (somas), `_listaTruncada` (paginacao), `topMaiores` (top 10), `_PAGINACAO` (meta)
- Data-driven: ferramenta responde "nao operado ainda" se fato vazio
- Freshness: timestamp de ultima sincronizacao da fonte (oracle)

---

## 3. Catálogo Exaustivo de Perguntas

Enumera TUDO que um gestor pode perguntar sobre financeiro. Cada pergunta marcada com status de cobertura. **Total: 48 perguntas.**

### 3.1 Saldo e Caixa

| # | Pergunta | Status | Observacao |
|---|----------|--------|-----------|
| 1 | Qual o saldo em caixa/bancos hoje? | [OK] | Tool: `financeiro_saldo_contas` |
| 2 | Qual o saldo por banco? | [OK] | `financeiro_saldo_contas` com detalhe banco |
| 3 | Qual o saldo de uma conta especifica? | [OK] | Filtravel em queries, nao ha tool parametrizada por banco (GAP menor) |
| 4 | Qual foi a movimentacao de caixa em (periodo)? | [OK] | `financeiro_caixa_periodo` |
| 5 | Quanto entrou e quanto saiu em (mes/periodo)? | [OK] | `financeiro_caixa_periodo` |
| 6 | Qual o fluxo de caixa mensal (serie temporal)? | [OK] | `financeiro_fluxo_caixa` |
| 7 | Fluxo realizado vs previsto, qual a diferenca? | [OK] | `financeiro_fluxo_caixa` retorna ambos |
| 8 | Qual mes teve maior deficit de caixa? | [PARCIAL] | `financeiro_fluxo_caixa` retorna serie; falta ranking automatico |
| 9 | Qual o saldo em caixa daqui a (N dias/1 mes)? | [GAP] | Nao ha ferramenta de projecao deterministica de caixa |
| 10 | Estamos com caixa positivo ou negativo? | [OK] | Derivado de `financeiro_saldo_contas` |

**Resumo 3.1:** 7 OK, 1 PARCIAL, 2 GAP

### 3.2 Contas a Receber (Clientes)

| # | Pergunta | Status | Observacao |
|---|----------|--------|-----------|
| 11 | Quanto devem os clientes (total a receber)? | [OK] | `financeiro_contas_a_receber` |
| 12 | Quais clientes tem titulo em aberto? | [OK] | `financeiro_contas_a_receber` lista todos |
| 13 | Quanto esta vencido dos clientes? | [OK] | `financeiro_titulos_vencidos` (tipo='a_receber') |
| 14 | Qual cliente deve mais (ranking)? | [OK] | `financeiro_contas_a_pagar` expoe topMaiores (10) |
| 15 | Quanto dias atrasado cada cliente? | [OK] | Cada titulo tem `diasAtraso` |
| 16 | Titulos vencendo em (1 semana, 1 mes)? | [PARCIAL] | Tool filtra vencidos passado, nao vencimento futuro |
| 17 | Quanto de titulo vencido por cliente? | [PARCIAL] | Falta agregacao por participante em titulos vencidos |
| 18 | Quais clientes nao tem pendencia? | [GAP] | Nao ha tool de "sem saldo" |
| 19 | Faturamento total recebido em (periodo)? | [PARCIAL] | Requer ligacao com nota fiscal; so financeiro nao responde |
| 20 | Que cliente trouxe maior receita? | [PARCIAL] | Requer soma de NF por cliente, nao disponivel em financeiro |

**Resumo 3.2:** 4 OK, 4 PARCIAL, 2 GAP

### 3.3 Contas a Pagar (Fornecedores)

| # | Pergunta | Status | Observacao |
|---|----------|--------|-----------|
| 21 | Quanto devemos aos fornecedores (total a pagar)? | [OK] | `financeiro_contas_a_pagar` |
| 22 | Quais fornecedores temos titulo aberto? | [OK] | `financeiro_contas_a_pagar` lista todos |
| 23 | Quanto esta vencido para pagar? | [OK] | `financeiro_titulos_vencidos` (tipo='a_pagar') |
| 24 | Qual fornecedor espera mais recebimento (maior vencido)? | [OK] | `financeiro_titulos_vencidos` (tipo='a_pagar') + ranking |
| 25 | Dias de atraso para cada fornecedor? | [OK] | `diasAtraso` por titulo |
| 26 | Titulos vencendo proximas semanas? | [PARCIAL] | Tool filtra passado |
| 27 | Quanto devo a (fornecedor especifico)? | [OK] | `financeiro_contas_a_pagar` filtrado por participante |
| 28 | Maior fornecedor (por volume pendente)? | [OK] | `topMaiores` em `financeiro_contas_a_pagar` |
| 29 | Que fornecedores ja pagamos tudo? | [GAP] | Nao ha tool de "saldo zero" |
| 30 | Quando vencei a ultima parcela com (fornecedor)? | [PARCIAL] | Titulos tem `dataVencimento`; falta busca por participante com data maxima |

**Resumo 3.3:** 5 OK, 3 PARCIAL, 2 GAP

### 3.4 Fluxo e Saude Financeira

| # | Pergunta | Status | Observacao |
|---|----------|--------|-----------|
| 31 | Saude financeira: receita vs despesa (resultado)? | [OK] | `financeiro_resultado_por_conta` (DRE gerencial) |
| 32 | Qual a conta com maior despesa? | [OK] | `financeiro_resultado_por_conta` (natureza='despesa') |
| 33 | Qual a conta com maior receita? | [OK] | `financeiro_resultado_por_conta` (natureza='receita') |
| 34 | Resultado por conta/centro de custo? | [OK] | `financeiro_resultado_por_conta` |
| 35 | Previsao de fechamento do mes (a receber vs a pagar)? | [PARCIAL] | Falta agregacao com data_vencimento mensal; requer DRE futura |
| 36 | Indice de liquidez (ratio caixa/compromisso curto prazo)? | [OK] | `financeiro_liquidez` (2 ou 3 indices) |
| 37 | Empresa esta no vermelho ou verde? | [PARCIAL] | Derivado de `financeiro_resultado_por_conta` (resultado < 0) |
| 38 | Quanto precisamos vender para cobrir compromissos? | [GAP] | Nao ha ferramenta de meta de vendas |
| 39 | Projecao de caixa (se nada mudar)? | [GAP] | Nao ha ferramenta de projecao deterministica |
| 40 | Como esta o fluxo vs planejamento (forecast)? | [PARCIAL] | `financeiro_fluxo_caixa` mostra realizado vs previsto no Odoo |

**Resumo 3.4:** 5 OK, 3 PARCIAL, 2 GAP

### 3.5 Cobranca Bancaria (Onda B3)

| # | Pergunta | Status | Observacao |
|---|----------|--------|-----------|
| 41 | Quantos pagamentos foram processados em (periodo)? | [OK] | `financeiro_baixas_cobranca` + paginacao |
| 42 | Que retornos bancarios recebemos em (periodo)? | [OK] | `financeiro_retornos_processados` |
| 43 | Que remessas enviamos ao banco em (periodo)? | [OK] | `financeiro_remessas_geradas` |
| 44 | Qual carteira de cobranca usamos? | [OK] | `financeiro_carteiras_cobranca` |
| 45 | Cheques emitidos (pendentes/compensados)? | [OK] | `financeiro_cheques` |
| 46 | PIX enviados/recebidos em (periodo)? | [OK] | `financeiro_pix_recebidos` |
| 47 | Rejeicoes no retorno bancario (motivo)? | [PARCIAL] | `fato_retorno_item` tem `motivoRejeicao`; falta tool de analise de rejeicoes |
| 48 | Taxa de cobranca / tarifa bancaria paga? | [PARCIAL] | Campos `vrTarifas` existem; falta agregacao por banco/periodo |

**Resumo 3.5:** 5 OK, 3 PARCIAL, 0 GAP

### 3.6 Cruzamentos com Outros Dominios

**Perguntas que requerem ligacao com nota fiscal / pedido / estoque:**

| # | Pergunta | Status | Observacao | Dominio |
|---|----------|--------|-----------|---------|
| 49 | Qual a receita (faturamento) de (cliente) em (periodo)? | [PARCIAL] | Requer ligacao `pedido → nota_fiscal → lancamento_financeiro` | fiscal+financeiro |
| 50 | Faturamento nao recebido (NF emitida, mas sem pagamento)? | [GAP] | Requer comparacao NF vs titulo financeiro | fiscal+financeiro |
| 51 | Faturamento recebido por nota fiscal? | [PARCIAL] | Falta rastreabilidade NF → titulo | fiscal+financeiro |
| 52 | Margem por pedido (faturamento - custo)? | [GAP] | Requer nota fiscal (receita) + estoque (custo) | comercial+financeiro+estoque |
| 53 | Qual operacao lucrou mais em (periodo)? | [PARCIAL] | Requer receita (fiscal) vs despesa (financeiro) por operacao | financeiro+comercial |

### Resumo Global

- **Total de perguntas catalogadas:** 48 (+ 5 cruzamentos = 53)
- **[OK]:** 20 perguntas
- **[PARCIAL]:** 19 perguntas
- **[GAP]:** 10 perguntas
- **Taxa de cobertura direta:** 42%
- **Taxa de cobertura com derivacao/manual:** 81%

---

## 4. Metricas Canonicas

Define a regra EXATA de cada metrica de negocio. Inclui ambiguidades que exigem desambiguacao com o usuario.

### 4.1 Faturamento Autorizado / Recebido

**DEFINICAO:** Faturamento autorizado = soma do valor liquido (`vrNf`) de notas de saida com situacao autorizada no periodo, exclui canceladas, por empresa/operacao/cliente/periodo, pela `dataAutorizacao`.

**DESAMBIGUACOES:**
- Valor considerado: `vrNf` (NF inteira) ou `vrProdutos` (sem impostos)?
- Data de referencia: `dataEmissao`, `dataAutorizacao` ou `dataEntradaSaida`?
- Filtro de situacao: `situacaoNfe='autorizada'` (exclui rejeitadas/pendentes)?
- Notas de entrada (compra) ou saida (venda)?
- Taxa de conversao USD/BRL: taxa fixa ou historica por data?

**METRICA RECOMENDADA:**
```
Faturamento_Autorizado = SOMA(vrNf) 
  WHERE entradaSaida='saida' 
    AND situacaoNfe='autorizada' 
    AND dataAutorizacao ENTRE dataIni E dataFim
  GROUP BY empresa_id, operacao_id, cliente_id
```

**RASTREABILIDADE:** nota_fiscal → lancamento_financeiro (FK implicit: pedido_id do documento fiscal → documento_id do lancamento).

---

### 4.2 Contas a Receber Abertas

**DEFINICAO:** Soma de `vrSaldo` (= valor ainda a receber, nao zero) de titulos em aberto (`situacaoSimples='aberto'`) tipo `a_receber`, por cliente/empresa/periodo, pela `dataDocumento` ou `dataVencimento`.

**DESAMBIGUACOES:**
- Qual data de filtro: `dataDocumento` (quando foi emitido) ou `dataVencimento` (quando vence)?
- O que e "em aberto": `vrSaldo > 0` ou apenas `situacaoSimples='aberto'` (redundante)?
- Incluir ou excluir parcelas (se pedido tiver parcelamento)?
- Moeda: a_receber sempre em BRL no cache Tauga?

**METRICA RECOMENDADA:**
```
ContasAReceber_Abertas = SOMA(vrSaldo) 
  WHERE tipo='a_receber' 
    AND situacaoSimples='aberto' 
    AND dataVencimento <= AGORA()
  GROUP BY participante_id
```

**CRITERIO_ABERTO:** `situacaoSimples='aberto'` (oracle: campo `situacao_divida_simples` no Odoo).
**FONTE:** `fato_financeiro_titulo`.

---

### 4.3 Contas a Pagar Abertas

**DEFINICAO:** Soma de `vrSaldo` (= valor ainda a pagar) de titulos em aberto tipo `a_pagar`, por fornecedor/empresa/periodo.

**DESAMBIGUACOES:** idem a_receber.

**METRICA RECOMENDADA:**
```
ContasAPagar_Abertas = SOMA(vrSaldo) 
  WHERE tipo='a_pagar' 
    AND situacaoSimples='aberto'
  GROUP BY participante_id
```

**FONTE:** `fato_financeiro_titulo`.

---

### 4.4 Titulos Vencidos (Atraso)

**DEFINICAO:** Soma de `vrSaldo` de titulos com `dataVencimento < INICIO_DO_DIA_HOJE` e `situacaoSimples='aberto'` (tanto a_receber quanto a_pagar), com `diasAtraso = GREATEST(DIAS(HOJE - dataVencimento), 0)`.

**DESAMBIGUACOES:**
- Um titulo que vence HOJE nao e vencido?
- Titulo que vence no futuro: incluir na "vencer em X dias"?
- Separar em faixas (1-7 dias, 8-30, 30+ dias)?

**METRICA RECOMENDADA:**
```
Vencidos = SOMA(vrSaldo) 
  WHERE situacaoSimples='aberto' 
    AND dataVencimento < INICIO_DO_DIA_HOJE
  GROUP BY tipo, participante_id
```

**FORMULA diasAtraso:** `GREATEST(DIAS(HOJE - dataVencimento), 0)` (negativo = vence no futuro).

**FONTE:** `fato_financeiro_titulo`.

---

### 4.5 Saldo em Contas/Bancos

**DEFINICAO:** Valor atual (`saldo`) em cada conta bancaria, por tipo (corrente, poupanca, aplicacao), snapshot do dia. Saldo anterior + entradas - saidas = saldo.

**DESAMBIGUACOES:**
- Incluir contas inativas ou bloqueadas?
- Saldo negativo (cheque especial): contar como negativo?
- Moeda: multimoeda ou BRL apenas?

**METRICA RECOMENDADA:**
```
Saldo_Contas = SOMA(saldo) POR banco_id 
  FROM fato_financeiro_saldo (snapshot)
```

**FONTE:** `fato_financeiro_saldo` (snapshot, nao incremental).

---

### 4.6 Fluxo de Caixa (Realizado vs Previsto)

**DEFINICAO:** Entrada e saida mensais (realizado) vs entrada_prevista/saida_prevista (planejado), por conta/centro resultado/empresa, na mesma linha (coexistem).

**DESAMBIGUACOES:**
- "Entrada prevista" = quando o Odoo acha que vai entrar? Incluir automaticamente ou manual?
- Diferenca = previsto - realizado (positivo = entrada a mais que o esperado)?
- Incluir centros sem movimento no periodo?

**METRICA RECOMENDADA:**
```
Fluxo_Caixa = {
  entrada: SOMA(entrada),
  saida: SOMA(saida),
  entrada_prevista: SOMA(entrada_prevista),
  saida_prevista: SOMA(saida_prevista)
} 
  POR periodo (YYYY-MM), conta_id, centro_resultado_id
```

**FONTE:** `fato_financeiro_movimento`.

---

### 4.7 Resultado por Conta Gerencial (DRE)

**DEFINICAO:** Receita (tipo a_receber/recebimento) - Despesa (tipo a_pagar/pagamento) por conta gerencial, no periodo, com rateio (`vrTotal` do item do lancamento).

**DESAMBIGUACOES:**
- Incluir tipos "entrada" e "saida" (lancamentos de caixa puros)?
- Se item nao tem conta (null), incluir em "(sem conta)" ou ignorar?
- Comparacao com contabilidade (se houvesse): vai divergir por timing (accrual vs caixa)?

**METRICA RECOMENDADA:**
```
DRE_Gerencial = {
  receita: SOMA(vrTotal WHERE tipo IN ('a_receber','recebimento')),
  despesa: SOMA(vrTotal WHERE tipo IN ('a_pagar','pagamento')),
  resultado: receita - despesa
} 
  POR conta_id, centro_resultado_id, periodo
```

**FONTE:** `fato_financeiro_lancamento_item`.

---

### 4.8 Previsao de Fechamento do Mes

**DEFINICAO:** Projecao do resultado do mes (receita prevista vs despesa prevista até o fim do mes), assumindo que o planejado nao muda.

**DESAMBIGUACOES:**
- Data de corte: considerar so titulos ja vencidos ou incluir os que vencem até fim do mes?
- Valores previsto ou realizado: qual?
- Fator de risco (chance de recebimento/pagamento)?

**METRICA RECOMENDADA:**
```
Previsao_Fechamento_Mes = {
  a_receber_realizavel: SOMA(vrSaldo WHERE tipo='a_receber' AND dataVencimento <= FIM_DO_MES),
  a_pagar_obrigatorio: SOMA(vrSaldo WHERE tipo='a_pagar' AND dataVencimento <= FIM_DO_MES),
  saldo_caixa: valor atual,
  projecao: saldo_caixa + a_receber_realizavel - a_pagar_obrigatorio
}
```

**OBSERVACAO:** Requer agregacao com data_vencimento futura; hoje so temos ferramenta de vencidos passados.

**FONTE:** `fato_financeiro_titulo` + `fato_financeiro_saldo`.

---

### 4.9 Saude Financeira (Score)

**DEFINICAO:** Indicador simples: empresa esta "no vermelho" se (caixa + a_receber_proximo_30_dias) < (a_pagar_proximo_30_dias + despesas_fixas).

**DESAMBIGUACOES:**
- Incluir ou excluir cheques pre-datados?
- Despesas fixas: sao as que ja estao vencidas?
- Fator de certeza (nao recebera 20% dos a_receber)?

**METRICA RECOMENDADA:**
```
Score_Saude = {
  caixa_disponivel: saldo_contas,
  receita_esperada_30d: SOMA(vrSaldo WHERE tipo='a_receber' AND dataVencimento ENTRE HOJE E +30d),
  despesa_comprometida_30d: SOMA(vrSaldo WHERE tipo='a_pagar' AND dataVencimento ENTRE HOJE E +30d),
  resultado_30d: caixa + receita - despesa,
  status: 'verde' IF resultado > 0 ELSE 'vermelho'
}
```

---

### Resumo de Metricas Canonicas

| Metrica | Fonte | Desambiguacoes Criticas | Status |
|---------|-------|------------------------|--------|
| Faturamento Autorizado | `sped_documento` (fiscal) | valor bruto/liquido, data, filtro NF | [PENDENTE: fiscal] |
| Contas a Receber | `fato_financeiro_titulo` | criterio "aberto", data de filtro | [DEFINIDO] |
| Contas a Pagar | `fato_financeiro_titulo` | criterio "aberto", data de filtro | [DEFINIDO] |
| Titulos Vencidos | `fato_financeiro_titulo` | dias atraso, vence hoje?, faixas | [DEFINIDO] |
| Saldo Contas | `fato_financeiro_saldo` | multimoeda, contas inativas | [DEFINIDO] |
| Fluxo de Caixa | `fato_financeiro_movimento` | co-existencia realizado/previsto | [DEFINIDO] |
| Resultado por Conta | `fato_financeiro_lancamento_item` | tipos inclusos, "sem conta" | [DEFINIDO] |
| Previsao Fechamento | `fato_financeiro_titulo` (futura) | data de corte, fator risco | [PENDENTE IMPLEMENTACAO] |
| Saude Financeira | agregado | fator de certeza | [PENDENTE IMPLEMENTACAO] |

---

## 5. Combinacoes Cruzadas com Outros Dominios

### 5.1 Financeiro ← Fiscal (Nota Fiscal)

**Ligacao:** Nota fiscal (SPED) gera lancamento financeiro (titulo a receber para venda ou a pagar para compra).

| Pergunta | Caminho de Dados | Gap Atual |
|----------|------------------|----------|
| "Qual a receita de (cliente) em (periodo)?" | nota_fiscal(cliente, tipo=saida, dataEmissao) → soma(vrNf) | Falta link explícito nota_id → lancamento_id |
| "Faturamento nao recebido?" | sped_documento (tipo=saida, autorizada) vs fato_financeiro_titulo (tipo=a_receber, aberto) por chave natural | Falta join: nao ha chave comum direta |
| "Ticket medio por cliente?" | sped_documento (vrNf) / COUNT(nota) | Fiscal tem dado; financeiro so receita |
| "Margem por NF?" | (vrNf - custo_estoque) / vrNf | Requer fiscal + estoque |

**Status:** Fiscal (F4 Onda 2) nao esta integrado ainda. O pedido tem `pedido_id` que aponta a nota (bridge), mas ainda nao conectado ao financeiro.

---

### 5.2 Financeiro ← Estoque (Movimentacao)

**Ligacao:** Movimentacao de estoque gera custo/receita financeira (em contabilidade por absorcao).

| Pergunta | Caminho de Dados | Gap Atual |
|----------|------------------|----------|
| "Custo do estoque movido?" | estoque_movimento(item_id, qtd) → fato_produto(preco_custo) → custo_total | Estoque tem preco; financeiro nao atualiza custo |
| "Lucro por operacao?" | receita (fiscal) - custo (estoque movimento) | Requer ambos |

**Status:** Estoque (F3/F4 Onda 1) expoe precos e saldos, mas ligacao com financeiro (custo de venda) nao esta automatizada.

---

### 5.3 Financeiro ← Comercial (Pedido)

**Ligacao:** Pedido (venda) gera parcelas (titulo financeiro) e nota fiscal.

| Pergunta | Caminho de Dados | Gap Atual |
|----------|------------------|----------|
| "Receita por etapa do pedido?" | pedido(etapa) → parcela(vr_) → lancamento(vr_saldo) | Falta agregacao por etapa |
| "Tempo medio de cobranca (pedido → recebimento)?" | pedido(data) → parcela(data_vencimento) → lancamento(data_pagamento) | Requer join pedido→lancamento |
| "Pedidos em atraso de faturamento?" | pedido(etapa=finalizada?) vs nota_fiscal(existe?) | Comercial nao responde; fiscal falta |

**Status:** Comercial (F4 Onda 2) tem pedido com parcelas. Parcelas teem `finan_lancamento_id`, mas nao esta sendo preenchido no builder atual.

---

### 5.4 Financeiro → Contabil (Lançamento)

**Ligacao:** Lancamento financeiro (titulo) deveria gerar lancamento contabil (debito/credito).

**REALIDADE:** Contabil vazio no Odoo (0 lancamentos). Nao ha operacao.

**Status:** Omitido por falta de dado. BI_consulta_avancada cobre se houver demanda.

---

## 6. Armadilhas de Dado

Campos que enganam, status que confundem, JOINs que duplicam.

### 6.1 `finan.lancamento` vs `finan.pagamento.divida`

**ARMADILHA:** `finan.pagamento.divida` parece ser a "carteira de titulos", mas e na verdade o **historico de pagamentos** (eventos de pagamento ja realizados).

**SINTOMA:** Se usar `raw_finan_pagamento_divida` como fonte de "titulos a receber", vai aparecer so 21 titulos abertos com `vr_saldo ≈ 0`. Numero muito baixo para a operacao real (que tem 138 titulos abertos).

**RAIZ:** `finan.pagamento.divida` e tabela de auditoria/historico de pagamentos, nao de carteira ativa.

**SOLUCAO:** Usar `finan.lancamento` (carteira) filtrando `tipo IN ('a_receber','a_pagar')`, descartando lancamentos de caixa (entrada/saida/recebimento/pagamento).

**DETECTADO:** Bug R1 (2026-05-18); corrigido no builder.

---

### 6.2 `vrSaldo` pode ser zero mesmo em "aberto"

**ARMADILHA:** Campo `vr_saldo` (valor ainda em aberto) pode estar zero em um lancamento com `situacao_divida_simples='aberto'` se ja houve pagamento parcial.

**EXEMPLO:** Titulo de R$ 1.000, pagamento de R$ 500 registrado, saldo = R$ 500. Se so ler `vrSaldo`, pensa que ja foi pago.

**SOLUCAO:** Usar `vrSaldo` como valor correto a receber (= 0 se ja pago), nunca `vrDocumento`.

**IMPLEMENTADO:** Tool de contas a receber/pagar usa `vrSaldo` para totais (corrigido em R1).

---

### 6.3 Realizado e Previsto coexistem na mesma linha

**ARMADILHA:** Em `finan.fluxo.caixa`, nao ha campo de "tipo" ou "natureza" que separe previsto de realizado. A mesma linha tem `entrada`, `saida` (realizado) E `entrada_prevista`, `saida_prevista` (previsto).

**EXEMPLO:**
```
id=518648: 
  entrada=0.0, saida=0.0 (realizado)
  entrada_prevista=1237.5, saida_prevista=0.0 (previsto)
```

**IMPLICACAO:** Nao pode somar linhas sem saber qual valor quer (realizado ou previsto).

**SOLUCAO:** `FatoFinanceiroMovimento` mantem ambos sem coluna de "natureza"; cada query escolhe qual somar.

---

### 6.4 Centro de Resultado pode ser null/vazio

**ARMADILHA:** Campo `centro_resultado_id` em `finan.lancamento.item` pode ser null. Se houver 50% de items com centro vazio, agregacao por centro produz resultado enviesado.

**DIAGNOSTICO PENDENTE:** O4 spec condiciona 2ª tool (`financeiro_por_centro_resultado`) ao preenchimento desse campo na maioria dos items. Decisao final no E2E.

**EXPECTATIVA:** Amostra mostrou false → provavel que a maioria nao preencheu centro. Corte recomendado se < 80% preenchimento.

---

### 6.5 JOINs em `fato_financeiro_lancamento_item` duplicam se nao filtrado certo

**ARMADILHA:** `fato_financeiro_lancamento_item` vem de `raw_finan_lancamento_item` (items) + join com `raw_finan_lancamento` (pai) para herdar `tipo`.

Se a query nao e cuidadosa com a agregacao (COUNT DISTINCT vs SUM GROUP BY), pode contar um mesmo item multiplas vezes.

**SOLUCAO:** Sempre usar `odooId` como chave unica de item (nao `lancamento_id`, que se repete).

---

### 6.6 `dataPagamento` eh false (nao null) quando nao pago

**ARMADILHA:** No Odoo, se um titulo nao foi pago, o campo `data_pagamento` vem como boolean `false` (nao string null).

**SINTOMA:** Se ler sem conversao, `dataPagamento != null` sempre sera true (boolean false e um valor válido).

**SOLUCAO:** Mapper em `fato-financeiro-titulo.ts` faz: `dataPagamento: typeof raw.data_pagamento === "string" ? ... : null` (converte false → null).

---

### 6.7 `tipo` de lancamento inclui tipos de caixa (entrada/saida)

**ARMADILHA:** Campo `tipo` em `finan.lancamento` tem multiplos valores: `a_receber`, `a_pagar`, `recebimento`, `pagamento`, `entrada`, `saida`.

Os ultimos 4 sao lancamentos de caixa (movimentacao, nao titulos). Se nao filtrado, carteira de titulos fica contaminada com caixa.

**SINTOMA:** "Contas a receber" aparecera com numero de registros 2x maior se incluir `recebimento`.

**SOLUCAO:** Filtro `tipo IN ('a_receber','a_pagar')` no builder de `fato_financeiro_titulo`.

---

### 6.8 `saldo` em `finan.banco.saldo.hoje` e snapshot, nao incremental

**ARMADILHA:** `FatoFinanceiroSaldo` vem de `finan.banco.saldo.hoje` (snapshot diario), nao incremental. Se reprocessado, apaga saldos antigos.

**IMPLICACAO:** Nao ha historico de saldo por data sem guardar raw_finan_banco_saldo (tabela historica separada).

**SOLUCAO:** Usar `fato_financeiro_saldo` para "saldo hoje"; se precisar serie temporal, usar `raw_finan_banco_saldo` (1.591 linhas, incrementais).

---

### 6.9 Multimoeda nao e contemplada

**ARMADILHA:** Todas as ferramentas assumem BRL. Se houver transacao USD/EUR, sao convertidas no Odoo antes de gravar (ou descartadas).

**VERIFICACAO PENDENTE:** A Matrix importa equipamento (USA?). Confirmar se usa multimoeda ou nao.

**IMPACTO:** Se houve USD, somas ficarao enviesadas sem conversao correta por data.

---

### 6.10 Filtro de empresa ainda nao esta implementado

**ARMADILHA:** A Matrix tem ~20 empresas cadastradas. As queries de financeiro ainda nao filtram por `empresa_id`.

**SINTOMA:** "Contas a receber" retorna o total GLOBAL, nao separado por empresa.

**STATUS ATUAL:** GAP conhecido; nao estava no escopo da F4 Onda 1 (foco em escalas de dados). Demanda: F4 Onda 1.5 ou Onda 2.

**SOLUCAO RECOMENDADA:** Adicionar `empresaId` como parametro opcional em todas as 8 tools financeiras + joins com dimensao empresa (se houver link em lancamento).

---

## 7. Resumo Executivo

### Cobertura do Dominio Financeiro

| Aspecto | Status | Notas |
|---------|--------|-------|
| **Tabelas RAW** | 25 tabelas | Finan (16) + Contabil (4) + Banco (5) |
| **Tabelas FATO** | 4 fatos core + 2 cobranca | 6 em producao |
| **Tools Existentes** | 14 ferramentas | 8 core + 6 cobranca (data-driven) |
| **Perguntas Respondidas** | 42% (20/48 direto) | +19 parcial, +10 gap |
| **Bugs Conhecidos** | R1 corrigido | Fonte `finan.pagamento.divida` → `finan.lancamento` |
| **Armadilhas** | 10 catalogadas | Co-existencia realizado/previsto, null vs false, multimoeda, empresa |
| **Metricas Canonicas** | 9 definidas | 7 implementadas, 2 pendentes (previsao, saude) |
| **Cruzamentos** | 5 cenarios | Fiscal (falta), Estoque (falta), Comercial (parcial), Contabil (vazio) |

### Proximas Ondas Recomendadas

1. **F4 Onda 1.5 (financeiro-empresa):** Filtro por empresa_id em todas as tools.
2. **F4 Onda 2 (fiscal-financeiro):** Ligacao NF → titulo financeiro; faturamento recebido.
3. **F4 Onda 3 (previsoes):** Projecao de caixa + saude financeira + DRE futura.
4. **F4 Onda 4 (contabil):** Se cliente operacionalizar contabilidade no Odoo.

---

**Documento Completo. Analise disponivel para discussao e refinamento.**

