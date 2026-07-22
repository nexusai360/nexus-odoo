-- Onda B: historico temporal dos VALORES do pedido (append-por-mudanca).
-- Migration ADITIVA: so cria a tabela e indices novos, nenhuma coluna existente alterada.
-- Valores vem prontos do Odoo (raw_pedido_documento.data); margem/imposto NUNCA recalculados.

-- CreateTable
CREATE TABLE "fato_pedido_valor_historico" (
    "id" UUID NOT NULL,
    "rodada_id" UUID NOT NULL,
    "capturado_em" TIMESTAMP(3) NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "etapa_id" INTEGER,
    "etapa_nome" TEXT,
    "vr_produtos" DECIMAL(18,2),
    "vr_operacao_tributacao" DECIMAL(18,2),
    "vr_desconto" DECIMAL(18,2),
    "vr_custo_comercial" DECIMAL(18,2),
    "vr_comissao" DECIMAL(18,2),
    "al_margem" DECIMAL(18,4),
    "vr_liquido" DECIMAL(18,2),
    "vr_icms_proprio" DECIMAL(18,2),
    "vr_difal" DECIMAL(18,2),
    "vr_fcp" DECIMAL(18,2),
    "vr_pis_proprio" DECIMAL(18,2),
    "vr_cofins_proprio" DECIMAL(18,2),
    "vr_irpj" DECIMAL(18,2),
    "vr_csll" DECIMAL(18,2),
    "vr_cbs" DECIMAL(18,2),
    "vr_ibs" DECIMAL(18,2),
    "saldo_atender_custo" DECIMAL(18,2),
    "saldo_atender_venda" DECIMAL(18,2),
    "data_prevista" TIMESTAMP(3),
    "evento" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL,
    CONSTRAINT "fato_pedido_valor_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fato_pedido_valor_historico_pedido_id_capturado_em_idx" ON "fato_pedido_valor_historico"("pedido_id", "capturado_em");

-- CreateIndex
CREATE INDEX "fato_pedido_valor_historico_capturado_em_idx" ON "fato_pedido_valor_historico"("capturado_em");

-- CreateIndex
CREATE INDEX "fato_pedido_valor_historico_rodada_id_idx" ON "fato_pedido_valor_historico"("rodada_id");

-- Indice UNICO PARCIAL (SQL cru, o Prisma 7 nao o modela): garante exatamente UM vigente por
-- pedido E da a leitura O(pedidos) do "ultimo por pedido" na captura. NAO remover em migrate dev.
CREATE UNIQUE INDEX "fato_pedido_valor_historico_vigente_key"
  ON "fato_pedido_valor_historico" ("pedido_id")
  WHERE "vigente";
