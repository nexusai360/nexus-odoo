-- CreateTable
CREATE TABLE "fato_financeiro_saldo" (
    "banco_id" INTEGER NOT NULL,
    "banco_nome" TEXT,
    "tipo" TEXT,
    "data_referencia" TIMESTAMP(3),
    "saldo_anterior" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "entrada" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saida" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_financeiro_saldo_pkey" PRIMARY KEY ("banco_id")
);

-- CreateTable
CREATE TABLE "fato_financeiro_movimento" (
    "odoo_id" INTEGER NOT NULL,
    "data" TIMESTAMP(3),
    "conta_id" INTEGER,
    "conta_nome" TEXT,
    "centro_resultado_id" INTEGER,
    "centro_resultado_nome" TEXT,
    "entrada" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saida" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "entrada_prevista" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saida_prevista" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valor_previsto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_financeiro_movimento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_financeiro_titulo" (
    "odoo_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "participante_id" INTEGER,
    "participante_nome" TEXT,
    "conta_id" INTEGER,
    "conta_nome" TEXT,
    "numero_documento" TEXT,
    "data_documento" TIMESTAMP(3),
    "data_vencimento" TIMESTAMP(3),
    "data_pagamento" TIMESTAMP(3),
    "situacao" TEXT,
    "situacao_simples" TEXT,
    "vr_documento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_juros" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_multa" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_financeiro_titulo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "mcp_audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "row_count" INTEGER,
    "duration_ms" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pergunta_resumo" TEXT NOT NULL,
    "dominio" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fato_financeiro_movimento_data_idx" ON "fato_financeiro_movimento"("data");

-- CreateIndex
CREATE INDEX "fato_financeiro_titulo_data_vencimento_idx" ON "fato_financeiro_titulo"("data_vencimento");

-- CreateIndex
CREATE INDEX "fato_financeiro_titulo_tipo_idx" ON "fato_financeiro_titulo"("tipo");

-- CreateIndex
CREATE INDEX "mcp_audit_log_user_id_criado_em_idx" ON "mcp_audit_log"("user_id", "criado_em");
