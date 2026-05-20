/**
 * DDL resumido das fact tables do cache nexus-odoo.
 *
 * Usado pelo agente no Caminho 3c (bi_consulta_avancada) para que o LLM
 * possa construir queries SQL válidas contra as tabelas de fatos.
 *
 * Derivado de prisma/schema.prisma — modelos Fato*.
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
`.trim();
