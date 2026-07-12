-- Origem do titulo financeiro: pedido ou nota fiscal.
--
-- O Odoo da Tauga gera o financeiro de dois jeitos (pelo PEDIDO ou pela NOTA), e sem essas
-- colunas o KPI "Contas a receber" nao tinha como distinguir recebivel de carteira a faturar:
-- somava os dois (R$ 30,9 mi de pedidos SEM nota emitida entravam como dinheiro a receber).
--
-- Aditiva e idempotente: colunas novas, todas com default seguro. Nao mexe em dado existente
-- (o proximo rebuild do fato preenche).
ALTER TABLE "fato_financeiro_titulo" ADD COLUMN IF NOT EXISTS "pedido_id" INTEGER;
ALTER TABLE "fato_financeiro_titulo" ADD COLUMN IF NOT EXISTS "nota_fiscal_id" INTEGER;
ALTER TABLE "fato_financeiro_titulo" ADD COLUMN IF NOT EXISTS "pedido_faturado" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "fato_financeiro_titulo_pedido_id_idx" ON "fato_financeiro_titulo"("pedido_id");
