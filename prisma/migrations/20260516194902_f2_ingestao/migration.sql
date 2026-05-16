-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('ok', 'erro', 'rodando', 'sem_acesso');

-- CreateTable
CREATE TABLE "raw_contabil_conta" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_contabil_conta_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_contabil_conta_referencial" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_contabil_conta_referencial_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_extrato" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_extrato_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_extrato_rastreabilidade" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_extrato_rastreabilidade_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_local" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_local_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_saldo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_saldo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_saldo_hoje" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_saldo_hoje_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_saldo_hoje_duracao_dias" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_saldo_hoje_duracao_dias_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_saldo_rastreabilidade" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_saldo_rastreabilidade_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_estoque_saldo_rastreabilidade_hoje" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_estoque_saldo_rastreabilidade_hoje_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_banco" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_banco_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_banco_extrato" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_banco_extrato_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_banco_saldo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_banco_saldo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_banco_saldo_hoje" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_banco_saldo_hoje_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_carteira" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_carteira_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_centro_resultado" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_centro_resultado_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_conta" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_conta_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_documento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_documento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_fluxo_caixa" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_fluxo_caixa_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_forma_pagamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_forma_pagamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_lancamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_lancamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_lancamento_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_lancamento_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_pagamento_divida" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_pagamento_divida_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_remessa" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_remessa_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_remessa_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_remessa_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_retorno" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_retorno_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_retorno_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_retorno_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_tipo_faturamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_tipo_faturamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_documento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_documento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_documento_historico" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_documento_historico_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_documento_historico_tempo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_documento_historico_tempo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_etapa" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_etapa_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_operacao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_operacao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_operacao_derivada" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_operacao_derivada_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_parcela" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_parcela_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_producao_processo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_producao_processo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_res_company" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_res_company_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_res_partner" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_res_partner_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_res_users" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_res_users_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_apuracao_inventario" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_apuracao_inventario_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_apuracao_inventario_local" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_apuracao_inventario_local_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_atualizacao_preco" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_atualizacao_preco_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_atualizacao_preco_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_atualizacao_preco_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_atualizacao_preco_regra" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_atualizacao_preco_regra_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_dfe_importacao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_dfe_importacao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_duplicata" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_duplicata_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_item_declaracao_importacao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_item_declaracao_importacao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_item_rastreabilidade" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_item_rastreabilidade_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_item_rateio" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_item_rateio_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_modelo_fiscal" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_modelo_fiscal_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_pagamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_pagamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_rateio" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_rateio_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_referenciado" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_referenciado_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_documento_volume" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_documento_volume_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_empresa" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_empresa_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_endereco" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_endereco_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_faturamento_simples" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_faturamento_simples_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_operacao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_operacao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_operacao_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_operacao_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_participante" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_participante_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_participante_perfil" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_participante_perfil_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_participante_segmento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_participante_segmento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_controle" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_controle_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_familia" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_familia_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_lista_material" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_lista_material_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_lista_material_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_lista_material_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_lista_material_processo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_lista_material_processo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_lote_serie" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_lote_serie_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_marca" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_marca_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_tipo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_tipo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_variante" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_variante_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_produto_volume" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_produto_volume_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_usuario" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_usuario_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_usuario_departamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_usuario_departamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_usuario_perfil" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_usuario_perfil_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_veiculo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_veiculo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "last_incremental_at" TIMESTAMP(3),
    "last_snapshot_at" TIMESTAMP(3),
    "last_reconcile_at" TIMESTAMP(3),
    "last_status" "SyncStatus" NOT NULL DEFAULT 'rodando',
    "last_error" TEXT,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("model")
);

-- CreateTable
CREATE TABLE "fato_estoque_saldo" (
    "id" UUID NOT NULL,
    "odoo_saldo_id" INTEGER NOT NULL,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "local_id" INTEGER,
    "local_nome" TEXT,
    "quantidade" DECIMAL(18,4),
    "unidade" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_estoque_saldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_contabil_conta_odoo_write_date_idx" ON "raw_contabil_conta"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_contabil_conta_raw_deleted_idx" ON "raw_contabil_conta"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_contabil_conta_referencial_odoo_write_date_idx" ON "raw_contabil_conta_referencial"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_contabil_conta_referencial_raw_deleted_idx" ON "raw_contabil_conta_referencial"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_extrato_odoo_write_date_idx" ON "raw_estoque_extrato"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_extrato_raw_deleted_idx" ON "raw_estoque_extrato"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_extrato_rastreabilidade_odoo_write_date_idx" ON "raw_estoque_extrato_rastreabilidade"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_extrato_rastreabilidade_raw_deleted_idx" ON "raw_estoque_extrato_rastreabilidade"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_local_odoo_write_date_idx" ON "raw_estoque_local"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_local_raw_deleted_idx" ON "raw_estoque_local"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_odoo_write_date_idx" ON "raw_estoque_saldo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_raw_deleted_idx" ON "raw_estoque_saldo"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_hoje_odoo_write_date_idx" ON "raw_estoque_saldo_hoje"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_hoje_raw_deleted_idx" ON "raw_estoque_saldo_hoje"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_hoje_duracao_dias_odoo_write_date_idx" ON "raw_estoque_saldo_hoje_duracao_dias"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_hoje_duracao_dias_raw_deleted_idx" ON "raw_estoque_saldo_hoje_duracao_dias"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_rastreabilidade_odoo_write_date_idx" ON "raw_estoque_saldo_rastreabilidade"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_rastreabilidade_raw_deleted_idx" ON "raw_estoque_saldo_rastreabilidade"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_rastreabilidade_hoje_odoo_write_date_idx" ON "raw_estoque_saldo_rastreabilidade_hoje"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_estoque_saldo_rastreabilidade_hoje_raw_deleted_idx" ON "raw_estoque_saldo_rastreabilidade_hoje"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_banco_odoo_write_date_idx" ON "raw_finan_banco"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_banco_raw_deleted_idx" ON "raw_finan_banco"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_banco_extrato_odoo_write_date_idx" ON "raw_finan_banco_extrato"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_banco_extrato_raw_deleted_idx" ON "raw_finan_banco_extrato"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_banco_saldo_odoo_write_date_idx" ON "raw_finan_banco_saldo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_banco_saldo_raw_deleted_idx" ON "raw_finan_banco_saldo"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_banco_saldo_hoje_odoo_write_date_idx" ON "raw_finan_banco_saldo_hoje"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_banco_saldo_hoje_raw_deleted_idx" ON "raw_finan_banco_saldo_hoje"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_carteira_odoo_write_date_idx" ON "raw_finan_carteira"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_carteira_raw_deleted_idx" ON "raw_finan_carteira"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_centro_resultado_odoo_write_date_idx" ON "raw_finan_centro_resultado"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_centro_resultado_raw_deleted_idx" ON "raw_finan_centro_resultado"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_conta_odoo_write_date_idx" ON "raw_finan_conta"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_conta_raw_deleted_idx" ON "raw_finan_conta"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_documento_odoo_write_date_idx" ON "raw_finan_documento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_documento_raw_deleted_idx" ON "raw_finan_documento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_fluxo_caixa_odoo_write_date_idx" ON "raw_finan_fluxo_caixa"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_fluxo_caixa_raw_deleted_idx" ON "raw_finan_fluxo_caixa"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_forma_pagamento_odoo_write_date_idx" ON "raw_finan_forma_pagamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_forma_pagamento_raw_deleted_idx" ON "raw_finan_forma_pagamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_lancamento_odoo_write_date_idx" ON "raw_finan_lancamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_lancamento_raw_deleted_idx" ON "raw_finan_lancamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_lancamento_item_odoo_write_date_idx" ON "raw_finan_lancamento_item"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_lancamento_item_raw_deleted_idx" ON "raw_finan_lancamento_item"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_pagamento_divida_odoo_write_date_idx" ON "raw_finan_pagamento_divida"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_pagamento_divida_raw_deleted_idx" ON "raw_finan_pagamento_divida"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_remessa_odoo_write_date_idx" ON "raw_finan_remessa"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_remessa_raw_deleted_idx" ON "raw_finan_remessa"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_remessa_item_odoo_write_date_idx" ON "raw_finan_remessa_item"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_remessa_item_raw_deleted_idx" ON "raw_finan_remessa_item"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_retorno_odoo_write_date_idx" ON "raw_finan_retorno"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_retorno_raw_deleted_idx" ON "raw_finan_retorno"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_retorno_item_odoo_write_date_idx" ON "raw_finan_retorno_item"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_retorno_item_raw_deleted_idx" ON "raw_finan_retorno_item"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_tipo_faturamento_odoo_write_date_idx" ON "raw_finan_tipo_faturamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_tipo_faturamento_raw_deleted_idx" ON "raw_finan_tipo_faturamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_documento_odoo_write_date_idx" ON "raw_pedido_documento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_documento_raw_deleted_idx" ON "raw_pedido_documento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_documento_historico_odoo_write_date_idx" ON "raw_pedido_documento_historico"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_documento_historico_raw_deleted_idx" ON "raw_pedido_documento_historico"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_documento_historico_tempo_odoo_write_date_idx" ON "raw_pedido_documento_historico_tempo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_documento_historico_tempo_raw_deleted_idx" ON "raw_pedido_documento_historico_tempo"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_etapa_odoo_write_date_idx" ON "raw_pedido_etapa"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_etapa_raw_deleted_idx" ON "raw_pedido_etapa"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_operacao_odoo_write_date_idx" ON "raw_pedido_operacao"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_operacao_raw_deleted_idx" ON "raw_pedido_operacao"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_operacao_derivada_odoo_write_date_idx" ON "raw_pedido_operacao_derivada"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_operacao_derivada_raw_deleted_idx" ON "raw_pedido_operacao_derivada"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_parcela_odoo_write_date_idx" ON "raw_pedido_parcela"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_parcela_raw_deleted_idx" ON "raw_pedido_parcela"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_producao_processo_odoo_write_date_idx" ON "raw_producao_processo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_producao_processo_raw_deleted_idx" ON "raw_producao_processo"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_res_company_odoo_write_date_idx" ON "raw_res_company"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_res_company_raw_deleted_idx" ON "raw_res_company"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_res_partner_odoo_write_date_idx" ON "raw_res_partner"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_res_partner_raw_deleted_idx" ON "raw_res_partner"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_res_users_odoo_write_date_idx" ON "raw_res_users"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_res_users_raw_deleted_idx" ON "raw_res_users"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_apuracao_inventario_odoo_write_date_idx" ON "raw_sped_apuracao_inventario"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_apuracao_inventario_raw_deleted_idx" ON "raw_sped_apuracao_inventario"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_apuracao_inventario_local_odoo_write_date_idx" ON "raw_sped_apuracao_inventario_local"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_apuracao_inventario_local_raw_deleted_idx" ON "raw_sped_apuracao_inventario_local"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_atualizacao_preco_odoo_write_date_idx" ON "raw_sped_atualizacao_preco"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_atualizacao_preco_raw_deleted_idx" ON "raw_sped_atualizacao_preco"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_atualizacao_preco_item_odoo_write_date_idx" ON "raw_sped_atualizacao_preco_item"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_atualizacao_preco_item_raw_deleted_idx" ON "raw_sped_atualizacao_preco_item"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_atualizacao_preco_regra_odoo_write_date_idx" ON "raw_sped_atualizacao_preco_regra"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_atualizacao_preco_regra_raw_deleted_idx" ON "raw_sped_atualizacao_preco_regra"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_dfe_importacao_odoo_write_date_idx" ON "raw_sped_dfe_importacao"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_dfe_importacao_raw_deleted_idx" ON "raw_sped_dfe_importacao"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_odoo_write_date_idx" ON "raw_sped_documento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_raw_deleted_idx" ON "raw_sped_documento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_duplicata_odoo_write_date_idx" ON "raw_sped_documento_duplicata"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_duplicata_raw_deleted_idx" ON "raw_sped_documento_duplicata"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_odoo_write_date_idx" ON "raw_sped_documento_item"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_raw_deleted_idx" ON "raw_sped_documento_item"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_declaracao_importacao_odoo_write_da_idx" ON "raw_sped_documento_item_declaracao_importacao"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_declaracao_importacao_raw_deleted_idx" ON "raw_sped_documento_item_declaracao_importacao"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_rastreabilidade_odoo_write_date_idx" ON "raw_sped_documento_item_rastreabilidade"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_rastreabilidade_raw_deleted_idx" ON "raw_sped_documento_item_rastreabilidade"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_rateio_odoo_write_date_idx" ON "raw_sped_documento_item_rateio"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_item_rateio_raw_deleted_idx" ON "raw_sped_documento_item_rateio"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_modelo_fiscal_odoo_write_date_idx" ON "raw_sped_documento_modelo_fiscal"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_modelo_fiscal_raw_deleted_idx" ON "raw_sped_documento_modelo_fiscal"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_pagamento_odoo_write_date_idx" ON "raw_sped_documento_pagamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_pagamento_raw_deleted_idx" ON "raw_sped_documento_pagamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_rateio_odoo_write_date_idx" ON "raw_sped_documento_rateio"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_rateio_raw_deleted_idx" ON "raw_sped_documento_rateio"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_referenciado_odoo_write_date_idx" ON "raw_sped_documento_referenciado"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_referenciado_raw_deleted_idx" ON "raw_sped_documento_referenciado"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_documento_volume_odoo_write_date_idx" ON "raw_sped_documento_volume"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_documento_volume_raw_deleted_idx" ON "raw_sped_documento_volume"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_empresa_odoo_write_date_idx" ON "raw_sped_empresa"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_empresa_raw_deleted_idx" ON "raw_sped_empresa"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_endereco_odoo_write_date_idx" ON "raw_sped_endereco"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_endereco_raw_deleted_idx" ON "raw_sped_endereco"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_faturamento_simples_odoo_write_date_idx" ON "raw_sped_faturamento_simples"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_faturamento_simples_raw_deleted_idx" ON "raw_sped_faturamento_simples"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_operacao_odoo_write_date_idx" ON "raw_sped_operacao"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_operacao_raw_deleted_idx" ON "raw_sped_operacao"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_operacao_item_odoo_write_date_idx" ON "raw_sped_operacao_item"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_operacao_item_raw_deleted_idx" ON "raw_sped_operacao_item"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_participante_odoo_write_date_idx" ON "raw_sped_participante"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_participante_raw_deleted_idx" ON "raw_sped_participante"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_participante_perfil_odoo_write_date_idx" ON "raw_sped_participante_perfil"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_participante_perfil_raw_deleted_idx" ON "raw_sped_participante_perfil"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_participante_segmento_odoo_write_date_idx" ON "raw_sped_participante_segmento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_participante_segmento_raw_deleted_idx" ON "raw_sped_participante_segmento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_odoo_write_date_idx" ON "raw_sped_produto"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_raw_deleted_idx" ON "raw_sped_produto"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_controle_odoo_write_date_idx" ON "raw_sped_produto_controle"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_controle_raw_deleted_idx" ON "raw_sped_produto_controle"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_familia_odoo_write_date_idx" ON "raw_sped_produto_familia"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_familia_raw_deleted_idx" ON "raw_sped_produto_familia"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lista_material_odoo_write_date_idx" ON "raw_sped_produto_lista_material"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lista_material_raw_deleted_idx" ON "raw_sped_produto_lista_material"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lista_material_item_odoo_write_date_idx" ON "raw_sped_produto_lista_material_item"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lista_material_item_raw_deleted_idx" ON "raw_sped_produto_lista_material_item"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lista_material_processo_odoo_write_date_idx" ON "raw_sped_produto_lista_material_processo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lista_material_processo_raw_deleted_idx" ON "raw_sped_produto_lista_material_processo"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lote_serie_odoo_write_date_idx" ON "raw_sped_produto_lote_serie"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_lote_serie_raw_deleted_idx" ON "raw_sped_produto_lote_serie"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_marca_odoo_write_date_idx" ON "raw_sped_produto_marca"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_marca_raw_deleted_idx" ON "raw_sped_produto_marca"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_tipo_odoo_write_date_idx" ON "raw_sped_produto_tipo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_tipo_raw_deleted_idx" ON "raw_sped_produto_tipo"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_variante_odoo_write_date_idx" ON "raw_sped_produto_variante"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_variante_raw_deleted_idx" ON "raw_sped_produto_variante"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_produto_volume_odoo_write_date_idx" ON "raw_sped_produto_volume"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_produto_volume_raw_deleted_idx" ON "raw_sped_produto_volume"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_usuario_odoo_write_date_idx" ON "raw_sped_usuario"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_usuario_raw_deleted_idx" ON "raw_sped_usuario"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_usuario_departamento_odoo_write_date_idx" ON "raw_sped_usuario_departamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_usuario_departamento_raw_deleted_idx" ON "raw_sped_usuario_departamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_usuario_perfil_odoo_write_date_idx" ON "raw_sped_usuario_perfil"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_usuario_perfil_raw_deleted_idx" ON "raw_sped_usuario_perfil"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_veiculo_odoo_write_date_idx" ON "raw_sped_veiculo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_veiculo_raw_deleted_idx" ON "raw_sped_veiculo"("raw_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "fato_estoque_saldo_odoo_saldo_id_key" ON "fato_estoque_saldo"("odoo_saldo_id");

-- CreateIndex
CREATE INDEX "fato_estoque_saldo_produto_id_idx" ON "fato_estoque_saldo"("produto_id");

-- CreateIndex
CREATE INDEX "fato_estoque_saldo_local_id_idx" ON "fato_estoque_saldo"("local_id");
