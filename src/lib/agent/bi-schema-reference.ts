/**
 * DDL resumido das fact tables do cache nexus-odoo.
 *
 * Usado pelo agente no Caminho 3c (bi_consulta_avancada) para que o LLM
 * possa construir queries SQL válidas contra as tabelas de fatos.
 *
 * Derivado de prisma/schema.prisma , modelos Fato*.
 * Atualizar aqui sempre que o schema mudar (trava: bi-schema-reference.test.ts).
 *
 * Colunas financeiras (Decimal) são armazenadas como NUMERIC(18,2) no Postgres.
 * Colunas de quantidade como NUMERIC(18,4).
 * Timestamps: TIMESTAMPTZ.
 */

export const BI_SCHEMA_REFERENCE = `
-- ─── ESTOQUE ─────────────────────────────────────────────────────────────────

-- Saldo atual de estoque por produto/local
TABLE fato_estoque_saldo (
  id              UUID PRIMARY KEY,
  odoo_saldo_id   INT UNIQUE,
  produto_id      INT,
  produto_nome    TEXT,
  local_id        INT,
  local_nome      TEXT,
  quantidade      NUMERIC(18,4),
  unidade         TEXT,
  vr_saldo        NUMERIC(18,2),   -- valor monetário do saldo
  familia_id      INT,
  familia_nome    TEXT,
  marca_id        INT,
  marca_nome      TEXT,
  atualizado_em   TIMESTAMPTZ
);

-- Movimentos de entrada/saída por produto
TABLE fato_estoque_movimento (
  odoo_id          INT PRIMARY KEY,
  produto_id       INT,
  produto_nome     TEXT,
  local_id         INT,
  local_nome       TEXT,
  data             TIMESTAMPTZ,
  mes              TEXT,            -- formato 'YYYY-MM'
  quantidade       NUMERIC(18,4),
  sentido          TEXT,            -- 'entrada' | 'saida'
  local_inverso_id INT,
  origem           TEXT
);

-- Produtos sem movimentação (parados)
TABLE fato_produto_parado (
  saldo_hoje_id  INT PRIMARY KEY,
  produto_id     INT,
  produto_nome   TEXT,
  local_id       INT,
  local_nome     TEXT,
  saldo          NUMERIC(18,4),
  dias           INT,              -- dias sem movimentação
  vr_saldo       NUMERIC(18,2),
  unidade        TEXT
);

-- ─── FINANCEIRO ──────────────────────────────────────────────────────────────

-- Saldo por conta bancária (snapshot diário)
TABLE fato_financeiro_saldo (
  banco_id        INT PRIMARY KEY,
  banco_nome      TEXT,
  tipo            TEXT,
  data_referencia TIMESTAMPTZ,
  saldo_anterior  NUMERIC(18,2),
  entrada         NUMERIC(18,2),
  saida           NUMERIC(18,2),
  saldo           NUMERIC(18,2),
  atualizado_em   TIMESTAMPTZ
);

-- Fluxo de caixa (realizado + previsto)
TABLE fato_financeiro_movimento (
  odoo_id                INT PRIMARY KEY,
  data                   TIMESTAMPTZ,
  conta_id               INT,
  conta_nome             TEXT,
  centro_resultado_id    INT,
  centro_resultado_nome  TEXT,
  entrada                NUMERIC(18,2),
  saida                  NUMERIC(18,2),
  valor                  NUMERIC(18,2),
  entrada_prevista       NUMERIC(18,2),
  saida_prevista         NUMERIC(18,2),
  valor_previsto         NUMERIC(18,2),
  atualizado_em          TIMESTAMPTZ
);

-- Títulos a pagar/receber
TABLE fato_financeiro_titulo (
  odoo_id           INT PRIMARY KEY,
  tipo              TEXT,            -- 'pagar' | 'receber'
  participante_id   INT,
  participante_nome TEXT,
  conta_id          INT,
  conta_nome        TEXT,
  numero_documento  TEXT,
  data_documento    TIMESTAMPTZ,
  data_vencimento   TIMESTAMPTZ,
  data_pagamento    TIMESTAMPTZ,     -- NULL = não pago
  situacao          TEXT,
  situacao_simples  TEXT,
  vr_documento      NUMERIC(18,2),
  vr_saldo          NUMERIC(18,2),
  vr_total          NUMERIC(18,2),
  vr_juros          NUMERIC(18,2),
  vr_multa          NUMERIC(18,2),
  vr_desconto       NUMERIC(18,2),
  atualizado_em     TIMESTAMPTZ
);

-- ─── FINANCEIRO / ITENS DO LANCAMENTO (O4, DRE gerencial) ──────────────────
-- Rateio por conta gerencial (conta_nome) e centro de resultado. tipo herdado
-- do lancamento pai: a_receber/recebimento = receita; a_pagar/pagamento = despesa.
-- Use para "quanto por conta gerencial". vr_total = valor do item.
TABLE fato_financeiro_lancamento_item (
  odoo_id               INT PRIMARY KEY,
  lancamento_id         INT,
  tipo                  TEXT,
  conta_id              INT,
  conta_nome            TEXT,
  centro_resultado_id   INT,
  centro_resultado_nome TEXT,
  descricao             TEXT,
  pedido_id             INT,
  vr_documento          NUMERIC(18,2),
  vr_total              NUMERIC(18,2),
  vr_saldo              NUMERIC(18,2),
  vr_pago_total         NUMERIC(18,2),
  data_documento        TIMESTAMPTZ,
  atualizado_em         TIMESTAMPTZ
);

-- ─── COMERCIAL / PEDIDOS ─────────────────────────────────────────────────────

-- Pedidos de venda
TABLE fato_pedido (
  odoo_id           INT PRIMARY KEY,
  numero            TEXT,
  tipo              TEXT,
  etapa_id          INT,
  etapa_nome        TEXT,
  etapa_finaliza    BOOLEAN,
  operacao_id       INT,
  operacao_nome     TEXT,
  participante_id   INT,
  participante_nome TEXT,
  vendedor_id       INT,
  vendedor_nome     TEXT,
  empresa_id        INT,
  empresa_nome      TEXT,
  data_orcamento    TIMESTAMPTZ,
  data_aprovacao    TIMESTAMPTZ,
  data_validade     TIMESTAMPTZ,
  data_prevista     TIMESTAMPTZ,
  vr_produtos       NUMERIC(18,2),
  vr_nf             NUMERIC(18,2),
  atualizado_em     TIMESTAMPTZ
);

-- Parcelas dos pedidos
TABLE fato_pedido_parcela (
  odoo_id              INT PRIMARY KEY,
  pedido_id            INT,
  numero               TEXT,
  participante_id      INT,
  participante_nome    TEXT,
  data_vencimento      TIMESTAMPTZ,
  valor                NUMERIC(18,2),
  vr_juros             NUMERIC(18,2),
  vr_multa             NUMERIC(18,2),
  vr_desconto          NUMERIC(18,2),
  vr_documento         NUMERIC(18,2),
  forma_pagamento_nome TEXT,
  parcela_faturada     BOOLEAN,
  finan_lancamento_id  INT,
  atualizado_em        TIMESTAMPTZ
);

-- ─── COMERCIAL / HISTÓRICO DE ETAPAS DO PEDIDO (O3) ──────────────────────────
-- Log append-only: 1 linha = 1 mudanca de etapa (etapa de destino). Para "tempo
-- em cada etapa" some tempo_etapa_dias agrupando por etapa_id. Loops de
-- retrabalho geram varias linhas no mesmo etapa_id. tempo_etapa_dias ja saneado
-- (>= 0). "Travado no fluxo" = ultimo evento (maior data_entrada) por pedido_id
-- ha mais de N dias , criterio de PROCESSO, nao financeiro (esse e fato_pedido_parcela).
TABLE fato_pedido_historico (
  odoo_id          INT PRIMARY KEY,
  pedido_id        INT,
  etapa_id         INT,
  etapa_nome       TEXT,
  etapa_tipo       TEXT,
  data_entrada     TIMESTAMPTZ,
  data_proxima     TIMESTAMPTZ,
  tempo_etapa_dias INT,
  usuario_id       INT,
  criado_em        TIMESTAMPTZ,
  atualizado_em    TIMESTAMPTZ
);

-- ─── FISCAL / NOTAS FISCAIS ──────────────────────────────────────────────────

-- Notas fiscais (cabeçalho)
TABLE fato_nota_fiscal (
  odoo_id                 INT PRIMARY KEY,
  numero                  TEXT,
  serie                   TEXT,
  modelo                  TEXT,
  entrada_saida           TEXT,     -- 'entrada' | 'saida'
  tipo_movimento          TEXT,     -- 'venda' | 'compra' | 'outro'
  situacao_nfe            TEXT,
  finalidade_nfe          TEXT,
  chave                   TEXT,
  participante_id         INT,
  participante_nome       TEXT,
  natureza_operacao_id    INT,
  natureza_operacao_nome  TEXT,
  empresa_id              INT,
  empresa_nome            TEXT,
  data_emissao            TIMESTAMPTZ,
  data_entrada_saida      TIMESTAMPTZ,
  data_autorizacao        TIMESTAMPTZ,
  vr_nf                   NUMERIC(18,2),
  vr_produtos             NUMERIC(18,2),
  vr_fatura               NUMERIC(18,2),
  vr_ibpt                 NUMERIC(18,2),
  vr_icms_proprio         NUMERIC(18,2),
  vr_desconto             NUMERIC(18,2),
  atualizado_em           TIMESTAMPTZ
);

-- Itens das notas fiscais
TABLE fato_nota_fiscal_item (
  odoo_id           INT PRIMARY KEY,
  documento_id      INT,
  produto_id        INT,
  produto_nome      TEXT,
  cfop_id           INT,
  cfop_nome         TEXT,
  quantidade        NUMERIC(18,2),
  vr_unitario       NUMERIC(18,2),
  vr_produtos       NUMERIC(18,2),
  vr_nf             NUMERIC(18,2),
  vr_icms_proprio   NUMERIC(18,2),
  vr_pis_proprio    NUMERIC(18,2),
  vr_cofins_proprio NUMERIC(18,2),
  data_emissao      TIMESTAMPTZ,
  entrada_saida     TEXT,
  atualizado_em     TIMESTAMPTZ
);

-- ─── FISCAL / DF-e DE ENTRADA (O1) ───────────────────────────────────────────
-- Notas de fornecedores capturadas eletronicamente (manifestacao do
-- destinatario). 1 linha = 1 DF-e. Distinto de fato_nota_fiscal (docs proprios).
-- Agregue por cnpj_fornecedor (fornecedor_id costuma ser NULL). vr_nf as vezes 0.
-- manifestacao IS NULL/'' = pendente de manifestacao.
TABLE fato_dfe (
  odoo_id          INT PRIMARY KEY,
  chave            TEXT,
  numero           TEXT,
  modelo           TEXT,
  cnpj_fornecedor  TEXT,
  fornecedor_id    INT,
  fornecedor_nome  TEXT,
  vr_nf            NUMERIC(18,2),
  data_emissao     TIMESTAMPTZ,
  data_recebimento TIMESTAMPTZ,
  manifestacao     TEXT,
  pode_manifestar  BOOLEAN,
  consulta_id      INT,
  atualizado_em    TIMESTAMPTZ
);

-- ─── CADASTROS / PARCEIROS ───────────────────────────────────────────────────

-- Parceiros (clientes, fornecedores, empresas)
TABLE fato_parceiro (
  odoo_id       INT PRIMARY KEY,
  nome          TEXT,
  nome_completo TEXT,
  documento     TEXT,             -- CPF/CNPJ
  eh_cliente    BOOLEAN,
  eh_fornecedor BOOLEAN,
  eh_empresa    BOOLEAN,
  cidade        TEXT,
  uf            TEXT,             -- sigla UF (2 letras)
  pais          TEXT,
  cep           TEXT,
  email         TEXT,
  telefone      TEXT,
  ativo         BOOLEAN,
  atualizado_em TIMESTAMPTZ
);

-- ─── CONTÁBIL ────────────────────────────────────────────────────────────────

-- Plano de contas contábil
TABLE fato_conta_contabil (
  odoo_id              INT PRIMARY KEY,
  codigo               TEXT,
  nome                 TEXT,
  tipo                 TEXT,
  nivel                INT,
  natureza             TEXT,
  conta_pai_id         INT,
  conta_pai_nome       TEXT,
  parent_path          TEXT,
  caracteristica_saldo TEXT,
  eh_redutora          BOOLEAN,
  atualizado_em        TIMESTAMPTZ
);

-- ─── CONTÁBIL , MOVIMENTO (B1) ───────────────────────────────────────────────
-- Plano REFERENCIAL SPED (de-para fiscal, 2216 contas). Distinto do plano da empresa.
TABLE fato_contabil_conta_referencial (
  odoo_id           INT PRIMARY KEY,
  codigo            TEXT,         -- código hierárquico (ex.: 1.01.01)
  nome              TEXT,
  nome_completo     TEXT,
  natureza          TEXT,         -- 01=Ativo,02=Passivo,03=PL,04=Resultado,05=Compensação,09=Outras
  tipo              TEXT,         -- A (analítica) | S (sintética)
  nivel             INT,
  parent_path       TEXT,
  conta_superior_id INT,
  atualizado_em     TIMESTAMPTZ
);

-- Cabeçalho do lançamento contábil. Estrutural (0 reg ate a contabilidade ser operada).
TABLE fato_contabil_lancamento (
  odoo_id          INT PRIMARY KEY,
  codigo           TEXT,
  tipo             TEXT,          -- N=Normal, E=Encerramento, X=Extemporâneo
  data_lancamento  TIMESTAMPTZ,
  valor            NUMERIC(18,2),
  valor_debito     NUMERIC(18,2),
  valor_credito    NUMERIC(18,2),
  empresa_id       INT,
  atualizado_em    TIMESTAMPTZ
);

-- Partidas do lançamento (base de razão/balancete/resultado). Estrutural (0 reg).
TABLE fato_contabil_lancamento_item (
  odoo_id           INT PRIMARY KEY,
  lancamento_id     INT,          -- FK lógica para fato_contabil_lancamento
  lancamento_tipo   TEXT,         -- tipo do cabeçalho (excluir E=Encerramento no resultado)
  conta_id          INT,          -- FK lógica para fato_conta_contabil
  conta_codigo      TEXT,
  conta_nome        TEXT,
  conta_natureza    TEXT,         -- natureza da conta (04=Resultado p/ resultado por natureza)
  centro_custo_id   INT,
  centro_custo_nome TEXT,
  natureza          TEXT,         -- D (débito) | C (crédito)
  valor             NUMERIC(18,2),
  valor_debito      NUMERIC(18,2),
  valor_credito     NUMERIC(18,2),
  data_lancamento   TIMESTAMPTZ,
  historico         TEXT,
  atualizado_em     TIMESTAMPTZ
);

-- ─── FISCAL COMPLEMENTAR , MDF-e + REINF (B2) ────────────────────────────────
-- Estruturais (0 reg ate os modulos serem operados). Tools respondem "nao operado".
TABLE fato_mdfe (
  odoo_id                   INT PRIMARY KEY,
  chave                     TEXT,
  numero                    TEXT,
  situacao_mdfe             TEXT,
  situacao_fiscal           TEXT,
  tipo_emissao              TEXT,
  empresa_id                INT,
  empresa_cnpj              TEXT,
  data_emissao              TIMESTAMPTZ,
  data_autorizacao          TIMESTAMPTZ,
  data_encerramento         TIMESTAMPTZ,
  data_cancelamento         TIMESTAMPTZ,
  protocolo_autorizacao     TEXT,
  municipio_carregamento    TEXT,
  municipio_descarregamento TEXT,
  peso_bruto                NUMERIC(18,3),
  peso_carga                NUMERIC(18,2),
  vr_nf                     NUMERIC(18,2),
  atualizado_em             TIMESTAMPTZ
);

TABLE fato_reinf_evento (
  odoo_id              INT PRIMARY KEY,
  chave                TEXT,
  tipo                 TEXT,
  situacao             TEXT,
  protocolo_transmissao TEXT,
  empresa_id           INT,
  empresa_cnpj_raiz    TEXT,
  data_evento          TIMESTAMPTZ,
  data_inicial         TIMESTAMPTZ,
  data_final           TIMESTAMPTZ,
  atualizado_em        TIMESTAMPTZ
);

-- ─── PREÇOS (F4 L1a) ─────────────────────────────────────────────────────────

-- Regras de preço das tabelas de preço (uma linha por regra)
TABLE fato_preco (
  odoo_id           INT PRIMARY KEY,
  tabela_id         INT,
  tabela_nome       TEXT,
  dimensao          TEXT,            -- 'produto' | 'familia' | 'participante' | 'geral'
  produto_id        INT,
  produto_nome      TEXT,
  familia_id        INT,
  familia_nome      TEXT,
  participante_id   INT,
  participante_nome TEXT,
  operacao          TEXT,            -- 'valor' | 'margem' | 'desconto' | 'markup' | 'fixo' | 'formula'
  preco_base        TEXT,
  valor             NUMERIC(18,4),   -- preço resolvido (operações diretas); NULL nas relativas
  aliquota          NUMERIC(9,4),    -- percentual (operações relativas)
  quantidade_minima NUMERIC(18,4),
  data_inicial      TIMESTAMPTZ,
  data_final        TIMESTAMPTZ,
  atualizado_em     TIMESTAMPTZ
);

-- ─── SERVIÇOS (F4 L1a) ───────────────────────────────────────────────────────

-- Catálogo de serviços fiscais (lista de serviços LC 116)
TABLE fato_servico (
  odoo_id           INT PRIMARY KEY,
  codigo            TEXT,
  codigo_formatado  TEXT,
  descricao         TEXT,
  codigo_tributacao TEXT,
  al_inss_retido    NUMERIC(9,4),
  atualizado_em     TIMESTAMPTZ
);

-- ─── FISCAL COMPLEMENTAR (F4 L1a) ────────────────────────────────────────────

-- Apurações fiscais (ICMS-IPI e PIS-COFINS)
TABLE fato_apuracao (
  odoo_id              INT PRIMARY KEY,
  empresa_nome         TEXT,
  data_inicial         TIMESTAMPTZ,
  data_final           TIMESTAMPTZ,
  tipo                 TEXT,            -- 'ICMS-IPI' | 'PIS-COFINS'
  entregue             BOOLEAN,
  regime_tributario    TEXT,
  vr_icms_a_recolher   NUMERIC(18,2),
  vr_icms_saldo_credor NUMERIC(18,2),
  vr_ipi_a_recolher    NUMERIC(18,2),
  vr_pis_a_recolher    NUMERIC(18,2),
  vr_cofins_a_recolher NUMERIC(18,2),
  atualizado_em        TIMESTAMPTZ
);

-- Cartas de correção (CC-e) de documentos fiscais
TABLE fato_carta_correcao (
  odoo_id               INT PRIMARY KEY,
  descricao             TEXT,
  correcao              TEXT,
  documento_id          INT,
  data_autorizacao      TIMESTAMPTZ,
  protocolo_autorizacao TEXT,
  sequencia             INT,
  atualizado_em         TIMESTAMPTZ
);

-- Certificados digitais (e-CNPJ) das empresas
TABLE fato_certificado (
  odoo_id              INT PRIMARY KEY,
  tipo                 TEXT,          -- ex.: A1
  numero_serie         TEXT,
  proprietario         TEXT,
  cnpj_cpf             TEXT,
  data_inicio_validade TIMESTAMPTZ,
  data_fim_validade    TIMESTAMPTZ,
  data_vencimento_util TIMESTAMPTZ,
  nome_arquivo         TEXT,
  atualizado_em        TIMESTAMPTZ
);

-- Tabelas de referencia achatadas. Filtre sempre pela coluna tabela. Valores
-- possiveis: ncm, cfop, cest, cnae, nbs, natureza_operacao, unidade, cst_icms,
-- cst_icms_sn, cst_ipi, cst_pis_cofins, cst_cibs, municipio, pais, estado.
TABLE fato_referencia (
  id        INT PRIMARY KEY,
  tabela    TEXT,
  codigo    TEXT,
  descricao TEXT
);

-- ─── FINANCEIRO , COBRANÇA BANCÁRIA (B3) ─────────────────────────────────────
-- Baixas/pagamentos de cobrança (item do retorno bancário). Grão rico.
TABLE fato_retorno_item (
  odoo_id                  INT PRIMARY KEY,
  retorno_id               INT,
  situacao                 TEXT,
  nosso_numero             TEXT,
  data_pagamento           TIMESTAMPTZ,
  vr_documento             NUMERIC,
  vr_juros                 NUMERIC,
  vr_multa                 NUMERIC,
  vr_desconto              NUMERIC,
  vr_tarifas               NUMERIC,
  vr_baixado               NUMERIC,
  vr_total                 NUMERIC,
  divida_numero            TEXT,
  divida_participante_id   INT,
  divida_participante_nome TEXT,
  divida_data_vencimento   TIMESTAMPTZ,
  divida_situacao          TEXT,
  banco_id                 INT,
  banco_nome               TEXT
);

-- Retorno bancário (cabeçalho do arquivo).
TABLE fato_retorno_bancario (
  odoo_id          INT PRIMARY KEY,
  tipo             TEXT,
  banco_id         INT,
  banco_nome       TEXT,
  numero           TEXT,
  data             TIMESTAMPTZ,
  total_entradas   NUMERIC,
  total_saidas     NUMERIC,
  saldo            NUMERIC,
  caixa_fechado    BOOLEAN
);

-- Remessa bancária gerada (enviada ao banco).
TABLE fato_remessa_bancaria (
  odoo_id          INT PRIMARY KEY,
  tipo             TEXT,
  banco_id         INT,
  banco_nome       TEXT,
  numero           TEXT,
  data             TIMESTAMPTZ,
  data_pagamento   TIMESTAMPTZ,
  confirmada       BOOLEAN
);

-- Carteira de cobrança (config de boleto por banco). SEM credenciais.
TABLE fato_carteira_cobranca (
  odoo_id        INT PRIMARY KEY,
  nome           TEXT,
  banco_id       INT,
  banco_nome     TEXT,
  carteira       TEXT,
  tipo_carteira  TEXT,
  beneficiario   TEXT,
  convenio       TEXT
);

-- Cheques (estrutural, 0 reg ate operar).
TABLE fato_cheque (
  odoo_id          INT PRIMARY KEY,
  numero           TEXT,
  banco            TEXT,
  titular_nome     TEXT,
  data             TIMESTAMPTZ,
  valor            NUMERIC,
  participante_id  INT
);

-- PIX (estrutural, 0 reg ate operar).
TABLE fato_pix (
  odoo_id     INT PRIMARY KEY,
  txid        TEXT,
  metodo      TEXT,
  status      TEXT,
  data        TIMESTAMPTZ,
  vr_tarifas  NUMERIC
);

-- ─── COMERCIAL , COTAÇÃO + COMISSÃO (B4) ─────────────────────────────────────
-- Cotações/propostas (estrutural, 0 reg ate operar). eh_compra: true=compra.
TABLE fato_cotacao (
  odoo_id              INT PRIMARY KEY,
  numero               TEXT,
  status               TEXT,
  eh_compra            BOOLEAN,
  empresa_id           INT,
  operacao_id          INT,
  operacao_nome        TEXT,
  usuario_aprovador_id INT,
  centro_resultado_id  INT
);

-- Comissão por pedido/vendedor (estrutural, 0 reg ate operar).
TABLE fato_comissao (
  odoo_id           INT PRIMARY KEY,
  pedido_id         INT,
  participante_id   INT,
  participante_nome TEXT,
  bc_comissao       NUMERIC,
  al_comissao       NUMERIC,
  vr_comissao       NUMERIC
);

-- ─── PRODUÇÃO (B5) ───────────────────────────────────────────────────────────
-- Processos de produção (producao.processo, 1 reg hoje).
TABLE fato_producao_processo (
  odoo_id    INT PRIMARY KEY,
  ordem      INT,
  nome       TEXT,
  descricao  TEXT,
  tempo      NUMERIC
);
`.trim();
