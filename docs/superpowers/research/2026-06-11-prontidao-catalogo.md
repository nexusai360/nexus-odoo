# Relatório de prontidão do catálogo MCP , nexus-odoo

> Data: 2026-06-11. Branch: feat/nex-reconstrucao.
> Catálogo auditado: `src/lib/mcp-catalog-snapshot.json` , 118 tools
> (109 read + 9 write), 8 módulos: estoque(9), financeiro(14), comercial(21),
> fiscal(35), cadastros(21), contabil(8), crm(3), outros(7).
> Banco real read-only: `nexus-odoo-db-1` / `nexus_odoo_l1`.
> Objetivo: medir prontidão para 100+ perguntas de GESTÃO antes de soltar para o cliente.

## Sumário executivo

A base está madura no fiscal/faturamento (35 tools, o domínio mais coberto) e
no comercial/pedidos, com camada de fatos populada e GRANT consistente. O maior
buraco não é técnico, é de leitura: **compras e contas a pagar** tem dado farto
(NF de entrada 2.887 linhas, DFe R$116M de 404 fornecedores, títulos a_pagar
R$209M) mas **nenhuma tool que responda "quanto comprei de quem" ou "quem eu devo,
por fornecedor"** , o gestor vai perguntar e a IA vai cair no Caminho 3. Domínios
vazios (CRM, RH, Produção, comissões, cotações, cheque, PIX, mín/máx) estão honestos:
CRM/RH/Produção têm tool de status, mas **comissões, cotações, cheque, PIX e
mín/máx não têm aviso de fonte-vazia** e respondem "lista vazia" como se fosse
resultado de negócio , risco de o gestor achar que zerou de verdade. GRANT em
tabelas novas está 100% (40/40 fato_ com SELECT para nexus_mcp_bi), sem BO de role.

---

## 0. Premissas verificadas no banco (SELECTs reais)

Verificadas 14 premissas antes de classificar. Transcrição dos comandos e resultados:

```sql
-- P1: dominios potencialmente vazios (confirmar FONTE-VAZIA)
SELECT 'crm_pipeline',count(*) FROM raw_crm_pipeline UNION ALL ...
 crm_pipeline=0 | producao_processo=1 | pedido_comissao=0 | pedido_cotacao=0
 estoque_min_max=0 | finan_cheque=0 | finan_pix=0 | contabil_lancamento=0

-- P2: contas a pagar / a receber existem e estão divididas
SELECT tipo,count(*) FROM fato_financeiro_titulo GROUP BY tipo;
 a_pagar=3812 | a_receber=3826 | total=7638

-- P7/P20: tabelas de fato vazias apesar de terem tool
 fato_comissao=0 | fato_cotacao=0 | fato_estoque_min_max=0
 fato_produto_parado=1342 | fato_servico=336 | fato_producao_processo=1

-- P5: pedidos têm vendedor preenchido (não é fonte-vazia)
SELECT count(*),count(*) FILTER(WHERE vendedor_id IS NOT NULL),count(DISTINCT vendedor_id) FROM fato_pedido;
 1797 total | 1795 com vendedor | 20 vendedores distintos

-- P6: pós-venda / assistência / garantia / devolução / RH , NENHUMA tabela existe
SELECT table_name FROM information_schema.tables
  WHERE table_name ILIKE '%assist%' OR '%garantia%' OR '%ticket%' OR '%devolu%'
     OR '%rh%' OR '%funcion%' OR '%hr_%' OR '%employ%';
 (0 linhas) -> domínio inexistente no Odoo, sem tabela e sem tool de status

-- P10/P11/P12: GRANT do role read-only do Caminho 3c em tabelas novas
SELECT count(*) FILTER(WHERE has_table_privilege('nexus_mcp_bi', ...,'SELECT')) FROM pg_tables WHERE tablename LIKE 'fato_%';
 40 tabelas fato_ | 40 com GRANT (100%) | faltando: nenhuma
 roles: nexus | nexus_mcp | nexus_mcp_bi (todos existem)

-- P13/P17: DFe = NF-e de entrada (compras), com fornecedor e valor
 colunas fato_dfe: cnpj_fornecedor, fornecedor_id, fornecedor_nome, vr_nf, data_emissao, manifestacao...
SELECT count(DISTINCT fornecedor_id),sum(vr_nf),min(data_emissao),max(data_emissao) FROM fato_dfe;
 404 fornecedores | R$116.776.791 | 2026-01-01 a 2026-06-11

-- P16: NF tem entrada e saída separadas (compras x vendas)
SELECT tipo_movimento,count(*) FROM fato_nota_fiscal GROUP BY tipo_movimento;
 saida=7154 | entrada=2887
 colunas fato_nota_fiscal: entrada_saida, tipo_movimento, participante_nome, empresa_nome, vr_nf, vr_produtos, vr_icms_proprio...

-- P18: contas a pagar é agrupável por fornecedor (dado pronto, falta tool)
SELECT count(DISTINCT participante_id),sum(vr_saldo) FROM fato_financeiro_titulo WHERE tipo='a_pagar' AND vr_saldo>0;
 131 fornecedores | R$209.760.224 em aberto

-- P19: funil de pedido tem etapa + datas (orçamento->aprovação->validade->prevista)
 colunas fato_pedido: etapa_nome, etapa_finaliza, operacao_nome, vendedor_nome,
   data_orcamento, data_aprovacao, data_validade, data_prevista, vr_produtos, vr_nf
```

Conclusões das premissas: (a) compras/AP tem dado, falta agregação por fornecedor;
(b) CRM/RH/Produção vazios e cobertos por status; (c) comissões, cotações, cheque,
PIX, mín/máx vazios e **sem** status próprio; (d) GRANT sem furo; (e) DFe é o proxy
de compras e a coluna correta é `entrada_saida`/`tipo_movimento` (não `tipo_operacao`).

---

## 1. Mapa de cobertura por tema de gestão

Legenda: COBERTA (tool resolve) · PARCIAL (resolve em parte, falta X) ·
DESCOBERTA (precisa tool nova) · FONTE-VAZIA (dado não existe no Odoo).

### 1.1 Vendas / faturamento
| Pergunta do gestor | Status | Tool / o que falta |
|---|---|---|
| "Quanto a gente faturou no mês?" | COBERTA | `fiscal_faturamento_periodo`, `fiscal_faturamento_mensal_serie` |
| "Quanto faturei por CNPJ/empresa?" | COBERTA | `fiscal_faturamento_por_empresa`, `fiscal_faturamento_por_cliente` |
| "Faturamento por estado (UF)?" | COBERTA | `fiscal_faturamento_por_uf` |
| "Quanto cada marca vendeu?" | COBERTA | `fiscal_faturamento_por_marca` |
| "Qual produto mais faturou?" | COBERTA | `fiscal_faturamento_por_produto` (via `fiscal_produtos_faturados`) |
| "Quanto vendi de tal produto por empresa, com CMV?" | COBERTA | `fiscal_vendas_produto_por_empresa` |
| "Qual minha margem bruta?" | PARCIAL | `fiscal_margem_aproximada` existe mas é estimada (preco_custo, sem despesa/imposto); avisar limite |
| "Receita real depois de devolução/intercompany?" | COBERTA | `fiscal_ponte_faturamento`, `fiscal_receita_consolidada`, `fiscal_intercompany` |
| "Faturamento por regime tributário?" | COBERTA | `fiscal_faturamento_por_regime` |
| "Vendas por vendedor (R$)?" | PARCIAL | `comercial_pedidos_por_vendedor` conta pedidos/valor de pedido, não faturamento NF por vendedor; gap se gestor quiser NF×vendedor |
| "Ticket médio por cliente?" | DESCOBERTA | derivável de NF mas sem tool dedicada (faturamento/contagem por cliente) |
| "Faturamento não autorizado / cancelado?" | COBERTA | `fiscal_faturamento_nao_autorizado` |

### 1.2 Clientes / cadastros
| Pergunta | Status | Tool |
|---|---|---|
| "Quantos clientes tenho?" | COBERTA | `cadastro_contar_parceiros` |
| "Clientes por estado?" | COBERTA | `cadastro_parceiros_por_uf` |
| "Clientes do interior de SP?" | COBERTA | `cadastro_parceiros_por_cidade` |
| "Quais cidades tenho cliente?" | COBERTA | `cadastro_cidades_listar` |
| "Clientes novos esta semana?" | COBERTA | `cadastro_parceiros_novos` |
| "Cadastros sem CNPJ?" | COBERTA | `cadastro_parceiros_sem_documento` |
| "Buscar cliente X / detalhar?" | COBERTA | `cadastro_buscar_parceiro`, `cadastro_detalhar_parceiro` |
| "Quem são meus maiores clientes (por compra)?" | PARCIAL | `fiscal_faturamento_por_cliente` dá valor, mas ranking de cliente por receita não tem tool própria (top-N) , gestor terá lista, não "top 10" |
| "Clientes inativos / sem comprar há X?" | DESCOBERTA | sem tool de recência/churn de cliente |
| "Minhas filiais / empresas do grupo?" | COBERTA | `cadastro_filiais_listar` |

### 1.3 Estoque / logística
| Pergunta | Status | Tool |
|---|---|---|
| "Saldo do produto X?" | COBERTA | `estoque_saldo_produto`, `estoque_locais_por_produto` |
| "Valor do estoque por armazém?" | COBERTA | `estoque_valor_armazem`, `estoque_concentracao` |
| "O que está parado?" | COBERTA | `estoque_produtos_parados` (fato_produto_parado=1342) |
| "Produtos com saldo zero / negativo?" | COBERTA | `estoque_produtos_saldo_zero` |
| "Itens mais movimentados?" | COBERTA | `estoque_top_movimentados`, `estoque_entradas_saidas` |
| "Estoque em demonstração / comodato?" | COBERTA | filtros de `estoque_saldo_produto`/`estoque_locais_por_produto` (8 perguntas-base já resolvidas) |
| "Estoque mínimo/máximo, o que repor?" | FONTE-VAZIA | `estoque_minimo_maximo` existe mas raw_estoque_minimo_maximo=0 e fato_estoque_min_max=0; tool já avisa "não há mín/máx cadastrado" (OK) |
| "Giro de estoque / cobertura em dias?" | PARCIAL | há raw_estoque_saldo_hoje_duracao_dias (3666) mas sem tool de giro/cobertura |
| "Curva ABC do estoque?" | DESCOBERTA | sem tool ABC (concentração existe por família/marca, não ABC por item) |
| "Transferências entre armazéns?" | PARCIAL | movimento existe (fato_estoque_movimento=16166) mas sem tool de transferência inter-armazém |

### 1.4 Compras / fornecedores  ← MAIOR LACUNA
| Pergunta | Status | Tool / gap |
|---|---|---|
| "Quanto comprei no mês?" | DESCOBERTA | NF entrada=2887 e DFe R$116M existem; nenhuma tool soma compras por período |
| "Quanto comprei de cada fornecedor?" | DESCOBERTA | `fiscal_dfe_por_fornecedor` lista DFe mas não soma valor de compra por fornecedor como métrica de gestão |
| "Quem são meus maiores fornecedores?" | DESCOBERTA | dado pronto (404 fornecedores em fato_dfe), sem tool de ranking |
| "Notas recebidas (entrada) no período?" | COBERTA | `fiscal_notas_recebidas`, `fiscal_dfe_importados_periodo` |
| "Notas recebidas por fornecedor?" | COBERTA | `fiscal_notas_recebidas_por_fornecedor` |
| "DFe pendente de manifestação?" | COBERTA | `fiscal_dfe_pendentes_manifestacao` |
| "Tenho fornecedor sem cadastro completo?" | PARCIAL | `cadastro_parceiros_sem_documento` cobre parceiros, não filtra fornecedor |
| "Prazo médio de pagamento a fornecedor?" | DESCOBERTA | títulos a_pagar têm datas, sem tool de PMP |
| "Compras x vendas (balanço)?" | DESCOBERTA | ambos os lados existem, sem tool comparativa |

### 1.5 Financeiro AR / AP
| Pergunta | Status | Tool |
|---|---|---|
| "Quem me deve / contas a receber?" | COBERTA | `financeiro_contas_a_receber` (a_receber=3826) |
| "Quem eu devo / contas a pagar?" | COBERTA | `financeiro_contas_a_pagar` (a_pagar=3812) |
| "Quanto devo POR fornecedor?" | DESCOBERTA | R$209M a_pagar agrupável por participante_id (131), sem tool de AP por fornecedor |
| "Títulos vencidos?" | COBERTA | `financeiro_titulos_vencidos` |
| "Saldo em banco / contas?" | COBERTA | `financeiro_saldo_contas` (fato_financeiro_saldo=9) |
| "Fluxo de caixa / projeção?" | COBERTA | `financeiro_fluxo_caixa`, `financeiro_caixa_periodo` |
| "Liquidez da empresa?" | COBERTA | `financeiro_liquidez` |
| "Cheques no período?" | FONTE-VAZIA | `financeiro_cheques` existe mas raw_finan_cheque=0; sem aviso de fonte-vazia (risco) |
| "PIX recebidos?" | FONTE-VAZIA | `financeiro_pix_recebidos` existe mas raw_finan_pix=0 e fato_pix=0; sem aviso (risco) |
| "Inadimplência / aging detalhado?" | PARCIAL | títulos têm dias de atraso, sem aging bucketizado (0-30/30-60/60-90/90+) |
| "Resultado por centro de custo?" | COBERTA | `contabil_centro_custo`, `financeiro_resultado_por_conta` |

### 1.6 Fiscal / impostos
| Pergunta | Status | Tool |
|---|---|---|
| "Quanto paguei de imposto no período?" | COBERTA | `fiscal_impostos_periodo`, `fiscal_apuracao` |
| "Notas emitidas / recebidas?" | COBERTA | `fiscal_notas_emitidas`, `fiscal_notas_recebidas` |
| "Cartas de correção emitidas?" | COBERTA | `fiscal_carta_correcao` |
| "Certificados digitais válidos?" | COBERTA | `fiscal_certificados` |
| "MDFe / manifestos de transporte?" | COBERTA | `fiscal_mdfe_manifestos` (fato_mdfe=0 hoje, mas tool existe) |
| "Eventos REINF?" | PARCIAL | `fiscal_reinf_eventos` (fato_reinf_evento=1, quase vazio) |
| "Faturamento por CFOP / operação?" | COBERTA | `fiscal_faturamento_por_cfop`, `fiscal_faturamento_por_operacao` |
| "Detalhe de uma nota específica?" | COBERTA | `fiscal_detalhar_nota` |
| "Apuração de ICMS-ST / DIFAL?" | DESCOBERTA | apuração geral existe, sem recorte ST/DIFAL |

### 1.7 Pedidos / funil comercial
| Pergunta | Status | Tool |
|---|---|---|
| "Quantos pedidos tenho?" | COBERTA | `comercial_contar_pedidos` |
| "Pedidos por etapa / funil?" | COBERTA | `comercial_pedidos_por_etapa`, `comercial_pedido_travados_por_etapa` |
| "Pedidos por UF?" | COBERTA | `comercial_pedidos_por_uf` |
| "Pedidos por vendedor?" | COBERTA | `comercial_pedidos_por_vendedor`, `comercial_vendedores_cadastrados` |
| "Pedidos atrasados / sem vendedor?" | COBERTA | `comercial_pedidos_atrasados`, `comercial_pedidos_sem_vendedor` |
| "Maior pedido em aberto / mais antigo?" | COBERTA | `comercial_pedidos_listar_top_valor` |
| "Tempo médio de fechamento?" | COBERTA | `comercial_tempo_medio_fechamento`, `comercial_pedido_historico_etapas` |
| "Parcelas a vencer?" | COBERTA | `comercial_parcelas_a_vencer` |
| "Segmento de orçamentos?" | COBERTA | resolvido (uma das 8 perguntas-base) |
| "Taxa de conversão orçamento→venda?" | FONTE-VAZIA/PARCIAL | `comercial_cotacoes` aponta para fato_cotacao=0 e raw_pedido_documento_cotacao=0; conversão derivável só de etapas do pedido |
| "Comissão por vendedor?" | FONTE-VAZIA | `comercial_comissoes` existe mas fato_comissao=0 e raw_pedido_comissao=0; sem aviso de fonte-vazia (risco) |

### 1.8 Pós-venda / assistência
| Pergunta | Status | Observação |
|---|---|---|
| "Chamados de assistência / garantia / devoluções?" | FONTE-VAZIA | **Nenhuma tabela existe** (assist/garantia/ticket/devolu = 0 tabelas) e **nenhuma tool de status**. Pergunta provável (empresa de equipamento de academia faz pós-venda). Hoje cai no Caminho 3 sem explicação honesta. |

### 1.9 Domínios vazios (RH / Produção / CRM)
| Pergunta | Status | Observação |
|---|---|---|
| "Folha / funcionários / RH?" | FONTE-VAZIA + STATUS | `rh_status_dominio` informa "0 registros" (OK) |
| "Ordens de produção?" | FONTE-VAZIA + STATUS | `producao_status_dominio` + `producao_processos` (1 registro residual). OK |
| "Leads / oportunidades / pipeline CRM?" | FONTE-VAZIA + STATUS | `crm_status_dominio`, `crm_pipeline_funis` (config sem transacional). OK |

---

## 2. Top 10 gaps priorizados (probabilidade × esforço)

| # | Pergunta exemplo | O que existe no dado | O que construir (1 linha) |
|---|---|---|---|
| 1 | "Quanto comprei de cada fornecedor no mês?" | fato_dfe (404 forn., R$116M, vr_nf, fornecedor_nome, data_emissao) | tool `compras_por_fornecedor` agregando vr_nf de DFe por fornecedor+período |
| 2 | "Quem eu devo, por fornecedor?" | fato_financeiro_titulo tipo=a_pagar (131 forn., R$209M, vr_saldo) | tool `financeiro_a_pagar_por_fornecedor` agrupando vr_saldo por participante |
| 3 | "Quanto comprei no total no período?" | NF entrada=2887, fato_dfe | tool `compras_periodo` somando entrada (NF/DFe) por período |
| 4 | "Tem chamado de assistência / garantia em aberto?" | nada (0 tabelas) | tool `pos_venda_status_dominio` (fonte-vazia honesta, espelho de rh_status) |
| 5 | "Quanto cada vendedor faturou (NF), não só pedidos?" | fato_nota_fiscal saida + fato_pedido.vendedor_nome | tool `fiscal_faturamento_por_vendedor` cruzando NF×pedido×vendedor |
| 6 | "Top 10 clientes por receita" | fato_nota_fiscal saida por participante | tool `fiscal_top_clientes` (ranking N por vr_nf) |
| 7 | "Comissão por vendedor?" | fato_comissao=0 (vazio) | adicionar aviso de fonte-vazia em `comercial_comissoes` (sem dado, não "lista vazia") |
| 8 | "Cheques / PIX recebidos?" | raw_finan_cheque=0, fato_pix=0 | aviso de fonte-vazia em `financeiro_cheques` e `financeiro_pix_recebidos` |
| 9 | "Aging da inadimplência (0-30/30-60/60-90/90+)?" | títulos com data_vencimento, dias atraso | tool `financeiro_aging_recebiveis` bucketizando atraso |
| 10 | "Cobertura/giro de estoque em dias" | raw_estoque_saldo_hoje_duracao_dias (3666) | tool `estoque_cobertura_dias` lendo duração já calculada |

Priorização: 1-3 (compras/AP por fornecedor) são quase-certos numa rodada de 100
perguntas e o dado já está pronto , maior retorno por esforço. 4,7,8 são baratos
(espelham padrão de status existente) e evitam resposta enganosa. 5,6,9,10 são
de média probabilidade e exigem agregação nova mas sobre fato já populado.

---

## 3. Riscos estruturais que viram BO

1. **Fonte-vazia sem aviso (risco de resposta enganosa, ALTO).** `comercial_comissoes`
   (fato_comissao=0), `comercial_cotacoes` (fato_cotacao=0), `financeiro_cheques`
   (raw_finan_cheque=0), `financeiro_pix_recebidos` (fato_pix=0) retornam lista
   vazia como se fosse resultado de negócio. O gestor lê "0 comissões" e entende
   "ninguém vendeu". O padrão correto já existe (`rh_status_dominio`,
   `estoque_minimo_maximo` avisa explicitamente). Aplicar o mesmo aviso nessas 4.

2. **Pós-venda/assistência sem tool de status (lacuna silenciosa).** Diferente de
   RH/CRM/Produção, não há `pos_venda_status_dominio`. Para uma empresa que entrega
   e mantém equipamento de academia, "assistência/garantia" é pergunta natural;
   hoje cai no Caminho 3 sem explicar que o Odoo não opera esse módulo. **Verificado:
   0 tabelas assist/garantia/ticket/devolução.** Toda lacuna de domínio deveria ter
   status; esta é a única que não tem.

3. **Tools "irmãs" que disputam a mesma pergunta (ambiguidade de roteamento).**
   Faturamento por vendedor: `comercial_pedidos_por_vendedor` (valor de pedido) vs.
   a futura `fiscal_faturamento_por_vendedor` (NF). E faturamento por
   empresa/cliente aparece tanto em `fiscal_faturamento_por_empresa` quanto em
   `fiscal_faturamento_por_cliente` e `fiscal_receita_consolidada`/`fiscal_ponte_faturamento`
   , 35 tools fiscais aumentam a chance de o agente escolher a errada. Mitigar com
   descrições disjuntas ("pedido≠NF", "bruto≠receita real") e exemplos de roteamento.

4. **Margem apresentada como lucro (risco de número errado).** `fiscal_margem_aproximada`
   e `comercial_produtos_por_margem` usam preco_custo de cadastro, sem despesa/imposto/rateio.
   Se a resposta não carimbar "aproximada, não é lucro", o gestor decide em cima de
   número inflado. A descrição já alerta; garantir que o aviso chega na resposta final.

5. **GRANT em tabela nova , risco controlado (BAIXO).** Verificado: 40/40 fato_
   com SELECT para `nexus_mcp_bi`, role existe. **Mas** qualquer fato_ novo das tools
   do §2 (ex.: se virar materialização) precisa do GRANT no mesmo migration, senão o
   Caminho 3c (`bi_consulta_avancada`) quebra com permission denied só naquela tabela.
   Checklist: toda nova fato_ + GRANT SELECT nexus_mcp_bi no mesmo commit.

6. **Campos obrigatórios em write tools (risco de escrita falha).** As 9 write tools
   são todas de cadastros/crm (res_partner, mail_activity, tags). `crm.res_partner.create`
   e `cadastros.res_partner.update` dependem de campos que o agente in-app NÃO pode
   chamar (modo INTERNO). Risco real só pela rota EXTERNA (ApiKey): se a capability
   não estiver setada, a write falha silenciosa. Fora do escopo de "perguntas de
   gestão" (read), mas registrar que o catálogo mistura read e write num só snapshot.

7. **fato_reinf_evento e fato_mdfe quase/totalmente vazios com tool ativa.**
   `fiscal_reinf_eventos` (1 linha) e `fiscal_mdfe_manifestos` (0) respondem como
   se o módulo operasse. Menor probabilidade de pergunta, mas mesmo padrão do risco 1.

---

## Apêndice: inventário de fonte-vazia (tool ativa × dado zero)

| Tool | Tabela | Linhas | Tem aviso? |
|---|---|---|---|
| estoque_minimo_maximo | fato_estoque_min_max | 0 | SIM (OK) |
| rh_status_dominio | (n/a) | 0 | SIM (OK) |
| crm_status_dominio / crm_pipeline_funis | raw_crm_pipeline | 0 | SIM (OK) |
| producao_status_dominio / producao_processos | raw_producao_processo | 1 | SIM (OK) |
| comercial_comissoes | fato_comissao | 0 | NÃO (corrigir) |
| comercial_cotacoes | fato_cotacao | 0 | NÃO (corrigir) |
| financeiro_cheques | raw_finan_cheque | 0 | NÃO (corrigir) |
| financeiro_pix_recebidos | fato_pix | 0 | NÃO (corrigir) |
| fiscal_mdfe_manifestos | fato_mdfe | 0 | revisar |
| fiscal_reinf_eventos | fato_reinf_evento | 1 | revisar |
| (sem tool) pós-venda/assistência | (0 tabelas) | n/a | FALTA tool de status |
