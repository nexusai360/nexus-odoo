-- B3 (cobrança bancária). Aditiva: 2 raws novos (cheque/pix) + 6 fatos.
-- remessa/retorno(.item)/carteira já têm raw de ondas anteriores.

CREATE TABLE "raw_finan_cheque" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "raw_finan_cheque_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_finan_cheque_odoo_write_date_idx" ON "raw_finan_cheque"("odoo_write_date");
CREATE INDEX "raw_finan_cheque_raw_deleted_idx" ON "raw_finan_cheque"("raw_deleted");

CREATE TABLE "raw_finan_pix" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "raw_finan_pix_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_finan_pix_odoo_write_date_idx" ON "raw_finan_pix"("odoo_write_date");
CREATE INDEX "raw_finan_pix_raw_deleted_idx" ON "raw_finan_pix"("raw_deleted");

CREATE TABLE "fato_remessa_bancaria" (
    "odoo_id" INTEGER NOT NULL,
    "tipo" TEXT,
    "banco_id" INTEGER,
    "banco_nome" TEXT,
    "cnpj_cpf_raiz" TEXT,
    "carteira_id" INTEGER,
    "numero" TEXT,
    "data" TIMESTAMP(3),
    "data_pagamento" TIMESTAMP(3),
    "confirmada" BOOLEAN NOT NULL DEFAULT false,
    "data_confirmacao" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_remessa_bancaria_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_remessa_bancaria_data_idx" ON "fato_remessa_bancaria"("data");
CREATE INDEX "fato_remessa_bancaria_banco_id_idx" ON "fato_remessa_bancaria"("banco_id");
CREATE INDEX "fato_remessa_bancaria_confirmada_idx" ON "fato_remessa_bancaria"("confirmada");

CREATE TABLE "fato_retorno_bancario" (
    "odoo_id" INTEGER NOT NULL,
    "tipo" TEXT,
    "banco_id" INTEGER,
    "banco_nome" TEXT,
    "cnpj_cpf_raiz" TEXT,
    "carteira_id" INTEGER,
    "numero" TEXT,
    "data" TIMESTAMP(3),
    "total_entradas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_saidas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "data_inicial_ofx" TIMESTAMP(3),
    "data_final_ofx" TIMESTAMP(3),
    "caixa_fechado" BOOLEAN NOT NULL DEFAULT false,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_retorno_bancario_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_retorno_bancario_data_idx" ON "fato_retorno_bancario"("data");
CREATE INDEX "fato_retorno_bancario_banco_id_idx" ON "fato_retorno_bancario"("banco_id");

CREATE TABLE "fato_retorno_item" (
    "odoo_id" INTEGER NOT NULL,
    "retorno_id" INTEGER,
    "situacao" TEXT,
    "nosso_numero" TEXT,
    "numero" TEXT,
    "tipo" TEXT,
    "data_registro" TIMESTAMP(3),
    "data_pagamento" TIMESTAMP(3),
    "data_credito_debito" TIMESTAMP(3),
    "data_baixa" TIMESTAMP(3),
    "vr_documento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_juros" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_multa" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_tarifas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_baixado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "divida_numero" TEXT,
    "divida_participante_id" INTEGER,
    "divida_participante_nome" TEXT,
    "divida_data_vencimento" TIMESTAMP(3),
    "divida_situacao" TEXT,
    "motivo_rejeicao" TEXT,
    "banco_id" INTEGER,
    "banco_nome" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_retorno_item_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_retorno_item_retorno_id_idx" ON "fato_retorno_item"("retorno_id");
CREATE INDEX "fato_retorno_item_data_pagamento_idx" ON "fato_retorno_item"("data_pagamento");
CREATE INDEX "fato_retorno_item_situacao_idx" ON "fato_retorno_item"("situacao");
CREATE INDEX "fato_retorno_item_divida_participante_id_idx" ON "fato_retorno_item"("divida_participante_id");

CREATE TABLE "fato_carteira_cobranca" (
    "odoo_id" INTEGER NOT NULL,
    "nome" TEXT,
    "banco_id" INTEGER,
    "banco_nome" TEXT,
    "banco" TEXT,
    "carteira" TEXT,
    "tipo_carteira" TEXT,
    "beneficiario" TEXT,
    "convenio" TEXT,
    "modalidade" TEXT,
    "al_juros" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "al_multa" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "al_desconto" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxa_emissao" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dias_protesto" INTEGER,
    "dias_negativacao" INTEGER,
    "proximo_nosso_numero" TEXT,
    "proxima_remessa" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_carteira_cobranca_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_carteira_cobranca_banco_id_idx" ON "fato_carteira_cobranca"("banco_id");

CREATE TABLE "fato_cheque" (
    "odoo_id" INTEGER NOT NULL,
    "codigo" TEXT,
    "codigo_barras" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "numero" TEXT,
    "titular_nome" TEXT,
    "titular_cnpj_cpf" TEXT,
    "data" TIMESTAMP(3),
    "data_entrada" TIMESTAMP(3),
    "data_pre_datado" TIMESTAMP(3),
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "empresa_id" INTEGER,
    "cnpj_cpf" TEXT,
    "participante_id" INTEGER,
    "participante_nome" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_cheque_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_cheque_data_idx" ON "fato_cheque"("data");
CREATE INDEX "fato_cheque_participante_id_idx" ON "fato_cheque"("participante_id");

CREATE TABLE "fato_pix" (
    "odoo_id" INTEGER NOT NULL,
    "txid" TEXT,
    "metodo" TEXT,
    "data_hora" TIMESTAMP(3),
    "data" TIMESTAMP(3),
    "status" TEXT,
    "vr_tarifas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lancamento_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_pix_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_pix_data_idx" ON "fato_pix"("data");
CREATE INDEX "fato_pix_status_idx" ON "fato_pix"("status");
