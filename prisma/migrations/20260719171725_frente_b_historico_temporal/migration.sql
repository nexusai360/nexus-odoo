-- Frente B: historico temporal de preco e saldo (append-por-mudanca).
-- Migration ADITIVA: so cria tabelas e indices novos, nenhuma coluna existente alterada.

-- CreateTable
CREATE TABLE "fato_preco_historico" (
    "id" UUID NOT NULL,
    "rodada_id" UUID NOT NULL,
    "capturado_em" TIMESTAMP(3) NOT NULL,
    "tabela_id" INTEGER NOT NULL,
    "tabela_nome" TEXT,
    "produto_id" INTEGER NOT NULL,
    "produto_nome" TEXT,
    "quantidade_minima" DECIMAL(18,4) NOT NULL,
    "valor" DECIMAL(18,4),
    "evento" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL,
    CONSTRAINT "fato_preco_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fato_estoque_saldo_historico" (
    "id" UUID NOT NULL,
    "rodada_id" UUID NOT NULL,
    "capturado_em" TIMESTAMP(3) NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "produto_nome" TEXT,
    "local_id" INTEGER NOT NULL,
    "local_nome" TEXT,
    "quantidade" DECIMAL(18,4),
    "vr_saldo" DECIMAL(18,2),
    "familia_id" INTEGER,
    "familia_nome" TEXT,
    "marca_id" INTEGER,
    "marca_nome" TEXT,
    "unidade" TEXT,
    "evento" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL,
    CONSTRAINT "fato_estoque_saldo_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fato_captura_rodada" (
    "id" UUID NOT NULL,
    "serie" TEXT NOT NULL,
    "capturado_em" TIMESTAMP(3) NOT NULL,
    "linhas_observadas" INTEGER NOT NULL,
    "linhas_gravadas" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "motivo" TEXT,
    CONSTRAINT "fato_captura_rodada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fato_preco_historico_tabela_id_produto_id_quantidade_minima_idx" ON "fato_preco_historico"("tabela_id", "produto_id", "quantidade_minima", "capturado_em");

-- CreateIndex
CREATE INDEX "fato_preco_historico_capturado_em_idx" ON "fato_preco_historico"("capturado_em");

-- CreateIndex
CREATE INDEX "fato_preco_historico_rodada_id_idx" ON "fato_preco_historico"("rodada_id");

-- CreateIndex
CREATE INDEX "fato_estoque_saldo_historico_produto_id_local_id_capturado__idx" ON "fato_estoque_saldo_historico"("produto_id", "local_id", "capturado_em");

-- CreateIndex
CREATE INDEX "fato_estoque_saldo_historico_capturado_em_idx" ON "fato_estoque_saldo_historico"("capturado_em");

-- CreateIndex
CREATE INDEX "fato_estoque_saldo_historico_rodada_id_idx" ON "fato_estoque_saldo_historico"("rodada_id");

-- CreateIndex
CREATE INDEX "fato_captura_rodada_serie_capturado_em_idx" ON "fato_captura_rodada"("serie", "capturado_em");

-- Indices UNICOS PARCIAIS (SQL cru, o Prisma 7 nao os modela no schema): garantem exatamente
-- UM vigente por chave E dao a leitura O(chaves) do "ultimo por chave" na captura.
CREATE UNIQUE INDEX "fato_preco_historico_vigente_key"
  ON "fato_preco_historico" ("tabela_id", "produto_id", "quantidade_minima")
  WHERE "vigente";

CREATE UNIQUE INDEX "fato_estoque_saldo_historico_vigente_key"
  ON "fato_estoque_saldo_historico" ("produto_id", "local_id")
  WHERE "vigente";
