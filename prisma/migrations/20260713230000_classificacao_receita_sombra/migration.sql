-- Modo SOMBRA da classificacao de receita (decisao do dono, 2026-07-13).
--
-- A regra NOVA (natureza da operacao) passa a rodar ao lado da ANTIGA (nome da operacao
-- contem "venda"), mas quem decide o numero exibido continua sendo a ANTIGA. Estas colunas
-- so OBSERVAM: nenhuma delas e lida por dashboard, relatorio, KPI, Nex ou MCP.
--
-- `is_venda_externa` (que a plataforma inteira le) NAO muda de semantica nem de valor.
-- Por isso a migration e puramente ADITIVA: nao altera coluna existente, nao faz backfill
-- destrutivo, e o pior caso de rollback e ficar com 3 colunas nulas sem uso.
--
-- Contexto: docs/pericia-classificacao-receita-2026-07-13.md

ALTER TABLE "fato_nota_fiscal" ADD COLUMN IF NOT EXISTS "venda_por_natureza" BOOLEAN;
ALTER TABLE "fato_nota_fiscal" ADD COLUMN IF NOT EXISTS "classificacao_divergente" BOOLEAN;
ALTER TABLE "fato_nota_fiscal" ADD COLUMN IF NOT EXISTS "natureza_desconhecida" BOOLEAN;

-- Indices parciais: o painel de divergencias so procura os `true`, que sao pouquissimos
-- (2 divergencias em 1.965 notas na pericia). Indice parcial evita varrer a tabela inteira.
CREATE INDEX IF NOT EXISTS "fato_nota_fiscal_classificacao_divergente_idx"
  ON "fato_nota_fiscal" ("classificacao_divergente") WHERE "classificacao_divergente" = true;
CREATE INDEX IF NOT EXISTS "fato_nota_fiscal_natureza_desconhecida_idx"
  ON "fato_nota_fiscal" ("natureza_desconhecida") WHERE "natureza_desconhecida" = true;
