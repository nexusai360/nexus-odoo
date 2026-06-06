# Dossie MASTER: Entendimento Total do ERP da Matrix Fitness para a Reconstrucao do Nex

**Data:** 2026-06-06
**Autor:** Arquiteto-chefe (consolidacao dos 10 dossies de dominio)
**Escopo:** Verdade do projeto, matriz de cobertura, catalogo de metricas canonicas, desambiguacoes, politica de resultados e roadmap de construcao do agente Nex.
**Decisao de stack ja tomada:** tudo em TypeScript, reusando as tools/fatos/MCP existentes. NAO reescrever em Python.

> Este documento e a fonte unica de verdade para a reconstrucao. Ele consolida os 10 dossies de dominio (estoque, financeiro, fiscal, comercial, contabil, cadastros/produtos, crm, rh, producao, transversal) em uma visao executavel. Onde houver conflito entre dossies, este MASTER decide.

---

## 1. VERDADE DO PROJETO: numeros reais consolidados

### 1.1 Quadro geral por dominio

A contagem de tools por dominio nos dossies soma mais que o total fisico de tools do MCP porque varios dossies contam a mesma tool em dominios diferentes (ex.: `fato_nota_fiscal` aparece em fiscal, comercial e transversal; tools de cadastro aparecem em crm e cadastros). O transversal contabiliza o agregado da plataforma. Por isso, leia a coluna "tools" como "tools relevantes ao dominio", nao como soma disjunta.

| Dominio | Estado | Tools (relevantes) | Fatos | Raw | Perguntas (OK/parcial/gap) |
|---|---|---|---|---|---|
| **Estoque** | Operacional | 9 | 4 (saldo, movimento, minmax, produto_parado) | 9 | 47 (23 / 12 / 12) |
| **Financeiro** | Operacional | 14 (8 core + 6 cobranca data-driven) | 6 (4 core + 2 cobranca) | 25 | 48 (20 / 19 / 10) |
| **Fiscal / Notas** | Operacional (maduro) | 22 | 2 (+ fato_dfe) | 53 | 51 (35 / 12 / 4) |
| **Comercial / Vendas** | Operacional | 20 | 3 (pedido, parcela, historico) + fato_preco/fato_produto | 6 | 81 (56 / 14 / 11) |
| **Contabil** | Parcial (estrutural) | 7 | 4 (2 com dado real, 2 vazias) | 4 | 58 (24 / 20 / 14) |
| **Cadastros / Produtos** | Parcial (parceiros OK, produtos sem tool) | 21 (12 read + 9 write) | 3 + dim_empresa_grupo | 8 (+ ~67 ref) | 60 (35 / 10 / 15) |
| **CRM** | Vazio (estrutural) | 3 | 2 (pipeline vazio + auditoria_regra 15) | 4 | 35 (3 / 5 / 27) |
| **RH / Colaboradores** | Vazio total | 1 (placeholder honesto) | 0 | 0 | 50 (0 / 1 / 49) |
| **Producao** | Vazio (marginal, 1 registro) | 2 | 1 | 1 | 29 (3 / 3 / 23) |
| **Transversal** (plataforma) | Operacional | ~40 (agregado MCP) | 41 (todos) | 126 (todos) | 20 amostrais (20 / 8 / 5) |

### 1.2 Numeros fisicos da plataforma (fonte: dossie transversal, secao 7)

- **Tabelas raw:** **126** (espelho do Odoo via JSON-RPC). Distribuicao: Fiscal 48, Cadastros/Referencia 27, Financeiro 15, Estoque 12, Comercial 5, Contabil 3, Transversal 3 (res_company, res_partner, res_users), Producao 1, CRM (pipeline + auxiliares).
- **Tabelas fato + dim:** **41**. Estoque 5, Financeiro 4, Fiscal 3, Comercial 3, Contabil 4, Complementar 3 (mdfe, reinf, servico), Dimensoes 2 (dim_empresa_grupo, fato_parceiro), Metadados 1 (fato_build_state), demais.
- **Tools MCP semanticas (leitura):** **~35 a 40** efetivas no servidor + tools de escrita (cadastros/crm, modo externo).
- **Query files de relatorio:** **~35** em `src/lib/reports/queries/`.

### 1.3 Estado de cada dominio (classificacao firme)

**OPERACIONAL (dado real, tools maduras, responde producao):**
- **Fiscal** (o mais maduro: 22 tools, 35 perguntas OK, ~47k documentos).
- **Comercial** (20 tools, 56 perguntas OK, ~12,5k pedidos, ~45k parcelas).
- **Financeiro** (14 tools, carteira de 10k lancamentos, fluxo de 16,8k linhas).
- **Estoque** (9 tools, saldo + movimento + parados + concentracao).

**PARCIAL (estrutura pronta, dado incompleto ou tool faltando):**
- **Cadastros/Produtos:** parceiros completos (~800), mas **produtos (~3787) nao tem nenhuma tool de busca/listagem** (gap critico). Servicos so via raw.
- **Contabil:** plano de contas real (934 + 2216 referencial SPED), mas **lancamentos = 0** (todas as tools de saldo/DRE respondem "nao operado"). Pronto para ativar quando o cliente lancar.

**VAZIO (nao operado no Odoo da Matrix hoje):**
- **CRM:** pipeline 0 registros; so res_partner + 15 regras de auditoria. Tools respondem honestamente vazio.
- **Producao:** 1 unico processo cadastrado, catalogo sem execucao/rastreamento.
- **RH:** GAP total. 19 modelos no Odoo, 0 raw, 0 fato, 0 tool real. Maior obra de construcao se priorizado.

---

## 2. MATRIZ DE COBERTURA

### 2.1 Cobertura por dominio (perguntas catalogadas)

| Dominio | Total perguntas | OK | Parcial | Gap | Cobertura direta |
|---|---|---|---|---|---|
| Comercial | 81 | 56 | 14 | 11 | 69% |
| Fiscal | 51 | 35 | 12 | 4 | 69% |
| Cadastros/Produtos | 60 | 35 | 10 | 15 | 58% |
| Estoque | 47 | 23 | 12 | 12 | 49% |
| Contabil | 58 | 24 | 20 | 14 | 41% |
| Financeiro | 48 | 20 | 19 | 10 | 42% |
| CRM | 35 | 3 | 5 | 27 | 9% |
| Producao | 29 | 3 | 3 | 23 | 10% |
| RH | 50 | 0 | 1 | 49 | 0% |
| Transversal (amostra) | 20 | 20 | 8 | 5 | (referencia de plataforma) |
| **TOTAL catalogado** | **459** | **199** | **96** | **155** | **~43%** |

Leitura: dos ~459 cenarios realistas de gestor catalogados, ~43% ja respondem direto, ~21% parcialmente (workaround/agregacao no agente), ~34% sao gaps. O grosso dos gaps esta concentrado em RH, CRM e Producao (dominios vazios) e em "produtos sem tool" (cadastros).

### 2.2 Os gaps mais criticos do projeto inteiro (priorizados por valor para o gestor)

Priorizacao: alto valor de gestao + esforco viavel + reuso de fatos ja existentes sobe; dominios sem operacao no Odoo descem (dependem do cliente operar primeiro).

**TIER 1 (alto valor, dado JA existe, esforco baixo/medio):**

1. **Filtro por empresa/filial ausente em quase todas as tools.** A Matrix tem ~20 empresas. Hoje "faturamento", "contas a receber", "saldo contabil", "estoque" retornam o **total global do grupo**, sem separar filial. Aparece em fiscal (gap #1), financeiro (armadilha 6.10), comercial (metrica 13), contabil (gap #5), estoque (gap #1). E o gap transversal numero 1 de valor: o gestor quase sempre quer "por empresa".

2. **Tool de produto inexistente (buscar/listar/ficha tecnica/preco).** ~3787 produtos no cadastro e o agente nao consegue responder "qual o preco do produto X", "ficha tecnica", "produtos por familia/marca". Bloqueia qualquer pitch de venda do Nex. Cadastros gaps G1, G2, G3, P2.1 a P2.20.

3. **Faturamento recebido / reconciliacao fiscal-financeira.** "Faturamento de cliente X no periodo", "faturamento emitido mas nao recebido", "NF emitida vs titulo financeiro". Falta o link nota_fiscal -> lancamento_financeiro. Aparece em financeiro (perguntas 19, 50, 51), fiscal (gap #3, perguntas 49-51), crm (metrica 4.2), comercial (metrica 1, 13).

4. **Faturamento por CFOP e por natureza de operacao.** CFOP determina regime de ICMS; sem agregacao por CFOP nao se responde apuracao por operacao. Fiscal gap #2, perguntas 25-27.

5. **Detalhe de entidade individual (pedido/produto/conta por id).** "Qual cliente/vendedor/etapa do pedido 123?" exige listar tudo e procurar. Falta tool de "obter 1 por id". Comercial perguntas 21-22, cadastros.

**TIER 2 (alto valor, mas precisa modelagem ou regra de negocio do cliente):**

6. **Previsao/projecao deterministica de caixa** (financeiro perguntas 9, 35, 38, 39; metricas previsao_fechamento e saude_financeira). Regras de threshold/score nao documentadas (transversal gap #1).

7. **`preco_custo` incompleto em ~40% dos produtos** (transversal gap #2). Bloqueia margem, ROI, rentabilidade.

8. **Estoque sem `empresaId`, sem origem normalizada de movimento, sem reservas/promessas** (estoque gaps 1, 2, 5). "Estoque disponivel vs alocado a pedidos" nao responde.

9. **DRE estruturada (contabil)** e ativacao dos lancamentos contabeis quando o cliente operar (contabil gaps 1, 2, 4).

10. **Paginacao/offset ausente** (transversal gap #4): limite de 50 corta resultado sem "proximas 50". Afeta a precisao percebida ("limita em 10 arbitrariamente" relatado pelo dono).

**TIER 3 (dependem do cliente operar o Odoo primeiro):**

11. **RH inteiro** (49 gaps): folha, ponto, colaboradores, afastamento. So vale construir apos sincronizar os 19 modelos.
12. **CRM transacional** (27 gaps): leads/oportunidades/funil. Pipeline esta vazio; so config.
13. **Producao com rastreamento** (23 gaps): execucao, centros de trabalho, gargalo. Hoje so 1 processo de catalogo.

---

## 3. CATALOGO MESTRE DE METRICAS CANONICAS

Cada metrica precisa de definicao exata, fonte, filtros, periodo e desambiguacoes. Marcamos com [X-DOMINIO] as que cruzam dominios. A regra exata, quando o dossie trouxe, esta inline.

### 3.1 ESTOQUE

| Metrica | Regra exata | Fonte | Status |
|---|---|---|---|
| SALDO_TOTAL_UNIDADES | `SUM(quantidade)` em fato_estoque_saldo, rawDeleted=false; agrega por nada/local/produto/familia/marca | fato_estoque_saldo | OK |
| SALDO_TOTAL_VALOR | `SUM(vrSaldo)` (custo, BRL); vrSaldo<0 valido (debito) | fato_estoque_saldo | OK |
| SALDO_PRODUTO_X_LOCAL_Y | `quantidade WHERE produtoId=X AND localId=Y`; ausencia de linha = 0 exato | fato_estoque_saldo | OK |
| PRODUTOS_NEGATIVOS_COUNT | `COUNT(DISTINCT produtoId) WHERE quantidade<0` | fato_estoque_saldo | OK |
| ENTRADAS_PERIODO | `SUM(quantidade) WHERE sentido='entrada' AND data BETWEEN de,ate` | fato_estoque_movimento | OK |
| SAIDAS_PERIODO | `SUM(ABS(quantidade)) WHERE sentido='saida' AND data BETWEEN de,ate` | fato_estoque_movimento | OK |
| SALDO_LIQUIDO_PERIODO | `ENTRADAS_PERIODO - SAIDAS_PERIODO` | fato_estoque_movimento | OK |
| CONCENTRACAO_A_B_C_FAMILIA | Pareto por familiaId sobre SUM(vrSaldo), corte 80-15-5 parametrizavel | fato_estoque_saldo | OK |
| CONCENTRACAO_A_B_C_MARCA | Idem por marcaId | fato_estoque_saldo | OK |
| PRODUTOS_PARADOS_DIAS_X | `WHERE dias>=X AND saldo>0` | fato_produto_parado | OK |
| SALDO_ABAIXO_MINIMO | JOIN saldo x minmax `WHERE quantidade < quantidadeMinima` | fato_estoque_saldo + fato_estoque_minmax | Futuro (minmax 0 linhas) |
| TURNOVER_ANUAL | COGS / saldo medio | [X-DOMINIO: estoque+financeiro] | Gap |

### 3.2 FINANCEIRO

| Metrica | Regra exata | Fonte | Status |
|---|---|---|---|
| ContasAReceber_Abertas | `SUM(vrSaldo) WHERE tipo='a_receber' AND situacaoSimples='aberto'` (usar vrSaldo, nunca vrDocumento) | fato_financeiro_titulo | OK |
| ContasAPagar_Abertas | `SUM(vrSaldo) WHERE tipo='a_pagar' AND situacaoSimples='aberto'` | fato_financeiro_titulo | OK |
| Titulos_Vencidos | `SUM(vrSaldo) WHERE situacaoSimples='aberto' AND dataVencimento < INICIO_DIA_HOJE`; diasAtraso=GREATEST(hoje-venc,0) | fato_financeiro_titulo | OK |
| Saldo_Contas_Bancos | `SUM(saldo) POR bancoId` (snapshot) | fato_financeiro_saldo | OK |
| Fluxo_Caixa_Realizado_vs_Previsto | realizado(entrada/saida) e previsto(entrada_prevista/saida_prevista) coexistem na linha; somar o lado correto | fato_financeiro_movimento | OK |
| Resultado_por_Conta_Gerencial_DRE | receita=SUM(vrTotal WHERE tipo IN a_receber,recebimento) menos despesa(a_pagar,pagamento) por conta | fato_financeiro_lancamento_item | OK |
| Previsao_Fechamento_Mes | caixa + a_receber_realizavel(venc<=fim_mes) - a_pagar_obrigatorio(venc<=fim_mes) | fato_financeiro_titulo + saldo | Pendente |
| Saude_Financeira_Score | verde/vermelho por (caixa + receita_30d) vs (despesa_30d) | agregado | Pendente |
| **Faturamento_Recebido** | NF emitida x titulo recebido | [X-DOMINIO: fiscal+financeiro] | Gap |

### 3.3 FISCAL

| Metrica | Regra exata | Status |
|---|---|---|
| FATURAMENTO_AUTORIZADO | `SUM(vrNf) WHERE entradaSaida='1' AND situacaoNfe='autorizada' AND data_emissao IN periodo` (data de emissao = fato gerador; exclui canceladas) | OK |
| FATURAMENTO_BRUTO | idem sem filtro de situacao (tudo emitido) | OK |
| IMPACTO_CANCELAMENTOS | `SUM(vrNf) WHERE situacaoNfe='cancelada'` | OK |
| IMPOSTOS_PROPRIOS | `SUM(vrIcmsProprio + vrPisProprio + vrCofinsProprio)` | OK |
| FATURAMENTO_ENTRADA | idem autorizado para entradaSaida='0' (compras) | OK |
| FATURAMENTO_SAIDA | autorizado para entradaSaida='1' (vendas) | OK |
| ICMS_A_PAGAR | `SUM(debito saida) - SUM(credito entrada)` por sinal | Gap (apuracao) |
| FATURAMENTO_POR_EMPRESA | autorizado filtrado por empresa_id | [X-corte empresa] Gap |
| FATURAMENTO_POR_CFOP | `SUM(item.vrNf) GROUP BY cfop_id` (item autorizado) | Gap |
| CICLO_COBRANCA_MEDIO | emissao ate recebimento | [X-DOMINIO: fiscal+financeiro] Gap |

### 3.4 COMERCIAL

| Metrica | Regra exata | Status |
|---|---|---|
| Total_Pedidos_Aberto | `COUNT WHERE etapaFinaliza=false` | OK |
| Valor_Total_Aberto | `SUM(vrProdutos) WHERE etapaFinaliza=false` (vrProdutos, nao vrNf) | OK |
| Tempo_Medio_Fechamento | `AVG(dataAprovacao-dataOrcamento)` em dias (etapaFinaliza=true, ambas datas not null, aprov>=orca); + mediana/min/max | OK |
| Pedidos_Travados_Etapa | MAX(dataEntrada no historico) < hoje - N dias, etapaFinaliza=false | OK |
| Ticket_Medio_Vendedor | `SUM(vrProdutos)/COUNT(pedido)` por vendedor no periodo | OK |
| Ranking_Vendedores | ordena vendedores por SUM(vrProdutos) | OK |
| Inadimplencia_por_Parcela | `SUM(vrDocumento) WHERE dataVencimento<hoje AND parcelaFaturada=false` | OK |
| Recebivel_a_Vencer | `SUM(vrDocumento) WHERE venc BETWEEN hoje,hoje+N AND parcelaFaturada=false` | OK |
| Dias_Atraso_Maximo | `MAX(hoje-dataVencimento)` parcelas vencidas | OK |
| Margem_Bruta_Produto | `(precoVenda-precoCusto)/precoCusto*100` WHERE ambos>0 | OK (parcial: 40% sem custo) |
| Total_Regras_Preco_Ativas | `COUNT WHERE dataFinal IS NULL OR >hoje` | Parcial (conta todas) |
| Faturamento_Comercial_Autorizado | `SUM(vrProdutos) NF autorizada` por empresa/periodo/status | [X-DOMINIO: comercial+fiscal] Gap |
| Taxa_Conversao_Cotacao_Pedido | pedidos/cotacoes | Gap (cotacoes nao operadas) |
| Comissao_Total_Vendedor | SUM(comissao) | Gap (nao operado) |

### 3.5 CONTABIL (estrutural; ativa quando lancamentos chegarem)

| Metrica | Regra exata | Status |
|---|---|---|
| quantidade_contas_por_tipo | `COUNT GROUP BY tipo (S/A)` | OK (estrutura) |
| quantidade_contas_por_natureza | `COUNT GROUP BY natureza (01-09)` | OK (estrutura) |
| hierarquia_profundidade_maxima | `MAX(nivel)` | OK |
| saldo_conta_periodo | `SUM(valor_debito)-SUM(valor_credito)` periodo, conta, tipo!='E', estado posted (CONFIRMAR) | Pendente ativacao |
| balancete_periodo | saldo_conta para todas com movimento, agrupado por natureza | Pendente |
| saldo_conta_referencial_data | saldo ate data D (competencia vs caixa: CONFIRMAR) | Pendente |
| resultado_periodo | natureza '04': receita=SUM(credito), despesa=SUM(debito), exclui tipo 'E' | Pendente |
| resultado_por_centro_custo | idem agrupado por centroCustoId | Gap (sem tool) |
| saldo_por_centro_custo_periodo | `SUM(debito)-SUM(credito)` por centro | Pendente |
| quantidade_centros_com_movimento | `COUNT(DISTINCT centroCustoId)` | Pendente |
| quantidade_contas_referencial_por_natureza | `COUNT GROUP BY natureza` (real: 01=948,02=376,03=120,04=772) | OK (dado real) |

### 3.6 CADASTROS / PRODUTOS / PARCEIROS

| Metrica | Regra exata | Status |
|---|---|---|
| Total_Clientes_Ativos | `COUNT WHERE ehCliente=true AND ativo=true` | OK |
| Total_Fornecedores_Ativos | `COUNT WHERE ehFornecedor=true AND ativo=true` (pode ser ambos) | OK |
| Parceiros_sem_Documento | `COUNT WHERE documento IS NULL` | OK |
| Distribuicao_Parceiros_UF | `GROUP BY uf COUNT ORDER DESC` (uf=NULL separado) | OK |
| Catalogo_Produtos_Ativos | `COUNT WHERE ativo=true` em fato_produto | Gap (sem tool) |
| Produtos_por_Familia | `GROUP BY familiaId` | Gap |
| Produtos_por_Marca | `GROUP BY marcaId` | Gap |
| Ficha_Tecnica_Produto | linha com nome,codigo,SKU,marca,familia,precoVenda,precoCusto,margem,unidade,peso,ativo | Gap (critico para venda) |
| Parceiros_Novos_Periodo | `WHERE dataCriacao BETWEEN de,ate` | OK |
| Total_Servicos | `COUNT raw_sped_servico` | OK (raw) |

### 3.7 CRM / RH / PRODUCAO (metricas a formalizar quando operar)

- **CRM:** numero_total_parceiros (com dimensoes ativo/cliente/empresa), faturamento_por_cliente [X: crm+fiscal], inadimplencia_por_cliente [X: crm+financeiro], regras_auditoria_ativas, taxa_adimplencia_cliente.
- **RH:** folha_total_bruto, folha_total_liquida, custo_total_com_encargos, salario_medio/mediano, dias_trabalhados, horas_extras, taxa_ausencia, total_colaboradores_ativos, taxa_turnover, dias_ferias_acumulados, dias_licenca_remunerada. Todas com desambiguacoes (13o separado? competencia vs pagamento? CLT vs PJ?).
- **PRODUCAO:** TEMPO_PROCESSO_UNITARIO (unidade nao explicitada: CONFIRMAR min vs hora), CONTAGEM_PROCESSOS_OPERADOS. Futuras (apos execucao): TEMPO_EXECUCAO_REAL, DESVIO_TEMPO, THROUGHPUT, GARGALO.

### 3.8 METRICAS QUE CRUZAM DOMINIOS (catalogo transversal, secao 3.1)

Estas sao as que mais erram hoje porque exigem JOIN canonico de ids e regra de negocio explicita:

1. **previsao_fechamento_fiscal** [fiscal+financeiro] = SUM(NF emitida) - SUM(NF recebida) no periodo.
2. **faturamento_emitido_vs_recebido** [comercial+fiscal].
3. **saude_empresa** (verde/amarelo/vermelho) [financeiro+estoque] - **regras de threshold NAO documentadas, validar com dono.**
4. **cobertura_estoque_dias** [estoque+comercial].
5. **custo_carregamento_diario** [estoque+financeiro] - **taxa de juros vive em JSON sem schema (gap).**
6. **fluxo_caixa_previsto_vs_realizado** [financeiro].
7. **roi_por_parceiro** [comercial+financeiro] - bloqueado por preco_custo 40% nulo.
8. **taxa_conversao_funil_pedidos** [comercial].
9. **inadimplencia_por_parceiro** [financeiro] (filtro critico tipo='a_receber').
10. **estoque disponivel / reservado / total** [estoque+comercial] - falta fato de reservas.

---

## 4. DESAMBIGUACOES E ENTIDADES

### 4.1 Ambiguidades recorrentes (perguntar/decidir antes de calcular)

Estas aparecem em multiplos dossies e sao a maior fonte de erro do agente atual:

1. **Empresa vs grupo.** "Faturamento" = das 20 empresas somadas ou de uma filial? Default atual: grupo (global). O agente DEVE perguntar ou explicitar "considerei o grupo todo" sempre que a metrica suportar corte por empresa. (fiscal, financeiro, comercial, contabil, estoque)
2. **Qual armazem/local.** "Saldo do produto X" em qual local? Se nao especificado, somar todos os locais e dizer isso. (estoque)
3. **Exclui canceladas?** Faturamento sempre exclui `situacaoNfe='cancelada'` e nao-autorizadas, salvo pergunta explicita de "bruto/tentativa". (fiscal)
4. **Qual data de referencia.** Emissao vs autorizacao vs entrada/saida vs vencimento vs pagamento vs recebimento. Padrao por metrica: faturamento fiscal = data_emissao; contas a receber/vencidos = data_vencimento; recebido = data_pagamento; cruzamento previsao = data de realizacao. (fiscal, financeiro)
5. **Qual valor.** vrNf (com impostos) vs vrProdutos (sem) vs vrFatura. Padrao: faturamento fiscal = vrNf; valor de pedido comercial = vrProdutos; titulo aberto = vrSaldo (nunca vrDocumento). (fiscal, comercial, financeiro)
6. **Cliente vs fornecedor (parceiro pode ser ambos).** Sempre filtrar ehCliente/ehFornecedor; nunca somar contagens (overlap). (cadastros, crm)
7. **Ativo vs cliente.** active=true nao significa cliente; sempre combinar com ehCliente. (crm)
8. **Realizado vs previsto** (fluxo de caixa coexistem na mesma linha; somar o lado certo). (financeiro)
9. **Aberto com vrSaldo=0** (pago parcial); usar vrSaldo, nao situacao isolada. (financeiro)
10. **Intencao de resultado:** exaustivo vs ranking vs amostra (ver secao 5).

### 4.2 Catalogo de entidades a resolver em codigo (deterministico)

Fonte: dossie transversal secao 1. Toda entidade tem `odoo_id` (Int PK) e estrategia de resolucao por id > codigo unico > nome fuzzy (Levenshtein), com pedido de desambiguacao quando ambiguo. NUNCA retornar entidade falsa: ambiguo retorna lista ou null.

| Entidade | Fato/Dim | Chave preferida -> fallback |
|---|---|---|
| Empresa/Grupo | dim_empresa_grupo | odoo_id -> CNPJ -> nome (top3) + tipo matriz/filial |
| Armazem/Local | desnorm. em fato_estoque_saldo | odoo_id -> codigo -> nome fuzzy (filtra por UF/empresa se ambiguo) |
| Nota Fiscal | fato_nota_fiscal | odoo_id -> chave NFe (44 dig) -> numero+serie+modelo |
| Parceiro | fato_parceiro | odoo_id -> CNPJ/CPF -> nome+nome_completo fuzzy (filtra por tipo) |
| Produto | fato_produto | odoo_id -> codigo_unico/EAN -> codigo -> nome fuzzy (filtra familia/marca) |
| Conta Contabil | fato_conta_contabil | odoo_id -> codigo -> nome fuzzy (filtra natureza) |
| Pedido | fato_pedido | odoo_id -> numero+tipo -> data+tipo -> por parceiro |
| Centro de Resultado | desnorm. em lancamento_item | odoo_id -> codigo -> nome |
| Natureza Operacao | ref. em fato_nota_fiscal | odoo_id -> codigo -> nome |

**Armadilhas de resolucao a tratar em codigo:** documento com/sem mascara; complete_name com hierarquia pai>filho; codigo sequencial sem logica (preferir codigo_unico/odoo_id); many2one nao resolvido (vem `[id, "nome"]`); desambiguacao numerica (codigo >=7 digitos exige match exato).

---

## 5. POLITICA DE RESULTADOS

Resolve o problema relatado: "limita resultado em 10 arbitrariamente". A politica e deterministica e baseada em intencao + envelope de tamanho.

### 5.1 Regra de apresentacao (deterministica)

- **Ate 50 itens: lista tudo.** Nenhuma tool deve truncar arbitrariamente em 10. O limite de seguranca no banco e 50 (`take: 50` no SQL), nunca 10.
- **Acima de 50: pagina 50/50** com offset/limit. Os KPIs (_RESPOSTA, _DESTAQUE, _agregado, topMaiores) sao calculados sobre o **conjunto inteiro**, nao sobre a pagina. A resposta indica total real e oferece "proxima pagina". (Corrige o gap transversal #4 de paginacao ausente.)
- **Ranking: trava em N explicito.** "Top 10" retorna exatamente 10, ordenado por criterio explicito (`orderBy` no input). Ranking sem criterio definido e erro: a tool exige o criterio.
- **Envelope de tamanho:** se o JSON exceder ~24KB, encurta listas internas para amostra preservando os campos canonicos, e marca `_amostraReduzida {de, para, motivo}`. Nunca remove os KPIs.

### 5.2 Como decidir a intencao

O cerebro de orquestracao classifica a pergunta em uma de tres intencoes ANTES de chamar a tool:

1. **Exaustiva** ("quais sao TODOS os produtos do armazem?") -> tool retorna ate 50, reporta "exibindo X de Y; pagine ou filtre".
2. **Ranking** ("top 5 produtos por valor") -> tool ordena por criterio explicito, retorna exatamente N.
3. **Amostragem** ("da um exemplo de produto parado") -> retorna 3 a 5.

Toda resposta sempre carrega `atualizadoEm` + `atualizadoHa` (freshness) e avisa se sincronizacao > 6h. O calculo das metricas e sempre em **codigo deterministico** (SUM/COUNT/AVG no SQL ou TS), nunca no LLM.

---

## 6. ROADMAP DE CONSTRUCAO PROPOSTO

Traducao dos gaps reais em 6 fases. Tudo em TypeScript, reusando tools/fatos/MCP existentes. Cada fase encadeia no modo autonomo do projeto.

### Fase 1 - Metricas Canonicas (formalizar a verdade do calculo)

Objetivo: cada metrica do catalogo (secao 3) vira um modulo TS unico, validado, testado contra dado real, com regra de filtro/data/valor explicita. Fim das divergencias de definicao.

Entra (com base nos gaps reais):
- Modulo `metricas/<dominio>/<metrica>.ts` para as ~50 metricas operacionais ja com fato (estoque 10, financeiro 7, fiscal 6, comercial 12, cadastros parceiros, contabil estrutura).
- **Corte por empresa** (gap tier-1 #1): adicionar parametro `empresaId` opcional em TODAS as metricas que suportam (fiscal, financeiro, comercial, estoque via local->empresa, contabil). Resolve o gap transversal de maior valor.
- **Metricas de produto** (gap tier-1 #2): `Catalogo_Produtos_Ativos`, `Produtos_por_Familia`, `Produtos_por_Marca`, `Ficha_Tecnica_Produto`, `Margem_Bruta_Produto` sobre fato_produto (ja existe, so falta tool).
- Convencao de valor/data/situacao fixada por metrica (secao 4.1) embutida no codigo, nao no prompt.
- Teste E2E obrigatorio contra cache real (regra de raiz do projeto): subir servico, popular fato, conferir numeros.

As 3 primeiras coisas concretas da Fase 1 (ver resumo final).

### Fase 2 - Entidades / Desambiguacao (resolver QUEM/QUAL em codigo)

Objetivo: resolvedor unico de entidades (secao 4.2), deterministico, com fuzzy + pedido de desambiguacao, reusado por todas as tools.

Entra:
- `entidades/resolve-<entidade>.ts` para empresa, armazem, NF, parceiro, produto, conta, pedido.
- Resolucao por id > codigo unico > nome fuzzy (Levenshtein), retorno de lista/`null` quando ambiguo, log de ambiguidade em feature_requests.
- Normalizacao de documento (com/sem mascara), tratamento de complete_name hierarquico, many2one `[id,nome]`.
- Tool de "detalhe por id" para pedido/produto/conta/parceiro (gap tier-1 #5).
- Tabela de sinonimias de negocio (familia, marca, etapa, natureza) para o cerebro mapear termo do usuario -> filtro.

### Fase 3 - Cerebro de Orquestracao (tool retrieval + verificador)

Objetivo: eliminar "escolhe tool errada" e "alucina". O cerebro decide dominio(s), seleciona a(s) tool(s) certa(s) por recuperacao semantica, classifica intencao (secao 5.2) e passa por um verificador antes de responder.

Entra:
- **Tool retrieval:** dado a pergunta, recuperar as K tools candidatas (descricao + exemplos) em vez de despejar o catalogo inteiro. Barateia e melhora a escolha. Reusa o router `pick-domains` existente, estendido com ranking por embedding/keywords das tool descriptions.
- **Roteamento por dominio + RBAC** (transversal secao 5): filtra catalogo por `user.domains` antes do retrieval.
- **Verificador deterministico:** apos a tool responder, um passo de codigo confere coerencia (totais batem com itens, datas dentro do periodo pedido, sem JOIN que duplica, freshness exposta). Se falhar, reexecuta ou responde gap honesto, nunca inventa.
- **Caminho 3** (decisao canonica do projeto): 3a falta honesta + log; 3b recusa fora de escopo; 3c BI sob role read-only para admin.
- Resolve gaps de "tool errada" e mistura de entidade cliente/fornecedor por JOIN.

### Fase 4 - Apresentacao (resultados que nao mentem)

Objetivo: aplicar a politica de resultados (secao 5) de forma uniforme e humanizada.

Entra:
- Envelope canonico unico: estado, dados, KPIs (_RESPOSTA/_DESTAQUE/_agregado/topMaiores), atualizadoEm/atualizadoHa, aviso de freshness.
- **Paginacao 50/50 real** com offset/limit e total do conjunto (corrige gap transversal #4 / "limita em 10").
- Ranking com criterio explicito; intencao exaustiva/ranking/amostra respeitada.
- Humanizacao de nomes (Title Case), avisos de dado incompleto (ex.: "ROI parcial: 40% dos produtos sem custo"), aviso de "considerei o grupo todo" quando nao houver filtro de empresa.
- Regra: numero sempre vem de codigo; o LLM so redige o texto ao redor do numero.

### Fase 5 - Evals / Golden Dataset (provar que acerta)

Objetivo: transformar os ~459 cenarios catalogados em um dataset de avaliacao versionado, com resposta-ouro por pergunta, rodado a cada mudanca.

Entra:
- Golden dataset a partir das perguntas [OK] de cada dossie (199 prontas), com resposta esperada calculada por codigo contra o cache.
- Casos de desambiguacao (empresa, armazem, cliente/fornecedor, data, valor) como testes de "a tool perguntou em vez de chutar".
- Casos de gap honesto (RH/CRM/Producao vazios; produto sem custo) verificando que o agente responde falta, nao alucina.
- Metrica de eval: acuracia de selecao de tool, acuracia de numero, taxa de alucinacao (alvo: zero), taxa de pergunta-de-desambiguacao correta.
- Regressao: nenhuma mudanca entra sem o golden verde.

### Fase 6 - Custo / Latencia (1-2 centavos USD, rapido)

Objetivo: bater o alvo de custo/latencia do dono sem perder precisao.

Entra:
- Tool retrieval (Fase 3) ja reduz tokens de prompt (nao manda catalogo inteiro).
- Cache de roteamento e de resolucao de entidades por pergunta repetida.
- Modelo menor para roteamento/classificacao de intencao; modelo forte so na redacao final, com numeros vindos de codigo.
- Limite de passos do agente, short-circuit quando a metrica e direta (1 tool resolve).
- Telemetria de custo/latencia por requisicao no McpAuditLog para regressao de custo (alvo 1-2c USD).

### Ordem e dependencias

Fase 1 e 2 sao a fundacao (metrica + entidade corretas). Fase 3 e o cerebro que usa as duas. Fase 4 garante a apresentacao. Fase 5 prova. Fase 6 otimiza. RH/CRM/Producao (tier 3) entram como ondas de dados depois que o cliente operar no Odoo, reusando exatamente esta arquitetura (sincronizar raw -> modelar fato -> metrica Fase 1 -> entidade Fase 2 -> ja cai no cerebro).

---

## 7. SINTESE

A base esta mais madura do que o sintoma sugere: 4 dominios operacionais (fiscal, comercial, financeiro, estoque) ja respondem ~43% dos ~459 cenarios catalogados com dado real. O agente erra nao por falta de fato, mas por: (a) selecao de tool ruim, (b) ausencia de corte por empresa, (c) produtos sem tool, (d) calculo no LLM em vez de codigo, (e) truncamento arbitrario. O roadmap ataca exatamente isso: formalizar metrica e entidade em codigo, por um cerebro de orquestracao com retrieval + verificador no meio, apresentar com paginacao real, e travar tudo com um golden dataset. RH, CRM e Producao ficam para ondas de dados quando o cliente operar, reusando a mesma arquitetura TS.
