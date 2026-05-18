-- CreateTable
CREATE TABLE "fato_pedido" (
    "odoo_id" INTEGER NOT NULL,
    "numero" TEXT,
    "tipo" TEXT,
    "etapa_id" INTEGER,
    "etapa_nome" TEXT,
    "etapa_finaliza" BOOLEAN NOT NULL DEFAULT false,
    "operacao_id" INTEGER,
    "operacao_nome" TEXT,
    "participante_id" INTEGER,
    "participante_nome" TEXT,
    "vendedor_id" INTEGER,
    "vendedor_nome" TEXT,
    "empresa_id" INTEGER,
    "empresa_nome" TEXT,
    "data_orcamento" TIMESTAMP(3),
    "data_aprovacao" TIMESTAMP(3),
    "data_validade" TIMESTAMP(3),
    "data_prevista" TIMESTAMP(3),
    "vr_produtos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_nf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_pedido_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_pedido_parcela" (
    "odoo_id" INTEGER NOT NULL,
    "pedido_id" INTEGER,
    "numero" TEXT,
    "participante_id" INTEGER,
    "participante_nome" TEXT,
    "data_vencimento" TIMESTAMP(3),
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_juros" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_multa" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_documento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "forma_pagamento_nome" TEXT,
    "parcela_faturada" BOOLEAN NOT NULL DEFAULT false,
    "finan_lancamento_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_pedido_parcela_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_nota_fiscal" (
    "odoo_id" INTEGER NOT NULL,
    "numero" TEXT,
    "serie" TEXT,
    "modelo" TEXT,
    "entrada_saida" TEXT,
    "tipo_movimento" TEXT NOT NULL DEFAULT 'outro',
    "situacao_nfe" TEXT,
    "finalidade_nfe" TEXT,
    "chave" TEXT,
    "participante_id" INTEGER,
    "participante_nome" TEXT,
    "natureza_operacao_id" INTEGER,
    "natureza_operacao_nome" TEXT,
    "empresa_id" INTEGER,
    "empresa_nome" TEXT,
    "data_emissao" TIMESTAMP(3),
    "data_entrada_saida" TIMESTAMP(3),
    "data_autorizacao" TIMESTAMP(3),
    "vr_nf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_produtos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_fatura" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_ibpt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_icms_proprio" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_nota_fiscal_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_nota_fiscal_item" (
    "odoo_id" INTEGER NOT NULL,
    "documento_id" INTEGER,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "cfop_id" INTEGER,
    "cfop_nome" TEXT,
    "quantidade" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_unitario" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_produtos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_nf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_icms_proprio" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_pis_proprio" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_cofins_proprio" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "data_emissao" TIMESTAMP(3),
    "entrada_saida" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_nota_fiscal_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_parceiro" (
    "odoo_id" INTEGER NOT NULL,
    "nome" TEXT,
    "nome_completo" TEXT,
    "documento" TEXT,
    "eh_cliente" BOOLEAN NOT NULL DEFAULT false,
    "eh_fornecedor" BOOLEAN NOT NULL DEFAULT false,
    "eh_empresa" BOOLEAN NOT NULL DEFAULT false,
    "cidade" TEXT,
    "uf" TEXT,
    "pais" TEXT,
    "cep" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_parceiro_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_conta_contabil" (
    "odoo_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nivel" INTEGER,
    "natureza" TEXT,
    "conta_pai_id" INTEGER,
    "conta_pai_nome" TEXT,
    "parent_path" TEXT,
    "caracteristica_saldo" TEXT,
    "eh_redutora" BOOLEAN NOT NULL DEFAULT false,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_conta_contabil_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "fato_pedido_data_orcamento_idx" ON "fato_pedido"("data_orcamento");

-- CreateIndex
CREATE INDEX "fato_pedido_etapa_id_idx" ON "fato_pedido"("etapa_id");

-- CreateIndex
CREATE INDEX "fato_pedido_vendedor_id_idx" ON "fato_pedido"("vendedor_id");

-- CreateIndex
CREATE INDEX "fato_pedido_parcela_data_vencimento_idx" ON "fato_pedido_parcela"("data_vencimento");

-- CreateIndex
CREATE INDEX "fato_pedido_parcela_pedido_id_idx" ON "fato_pedido_parcela"("pedido_id");

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_data_emissao_idx" ON "fato_nota_fiscal"("data_emissao");

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_entrada_saida_idx" ON "fato_nota_fiscal"("entrada_saida");

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_situacao_nfe_idx" ON "fato_nota_fiscal"("situacao_nfe");

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_item_documento_id_idx" ON "fato_nota_fiscal_item"("documento_id");

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_item_produto_id_idx" ON "fato_nota_fiscal_item"("produto_id");

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_item_data_emissao_idx" ON "fato_nota_fiscal_item"("data_emissao");

-- CreateIndex
CREATE INDEX "fato_parceiro_uf_idx" ON "fato_parceiro"("uf");

-- CreateIndex
CREATE INDEX "fato_parceiro_eh_cliente_idx" ON "fato_parceiro"("eh_cliente");

-- CreateIndex
CREATE INDEX "fato_parceiro_eh_fornecedor_idx" ON "fato_parceiro"("eh_fornecedor");

-- CreateIndex
CREATE INDEX "fato_conta_contabil_tipo_idx" ON "fato_conta_contabil"("tipo");

-- CreateIndex
CREATE INDEX "fato_conta_contabil_natureza_idx" ON "fato_conta_contabil"("natureza");

-- CreateIndex
CREATE INDEX "fato_conta_contabil_conta_pai_id_idx" ON "fato_conta_contabil"("conta_pai_id");
