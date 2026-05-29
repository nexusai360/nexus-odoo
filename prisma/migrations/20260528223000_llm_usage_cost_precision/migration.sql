-- Aumenta a precisao das colunas de custo de llm_usage de 6 para 10 casas
-- decimais. Custos de embedding por chamada (~1e-7 USD) zeravam com 6 casas;
-- com 10 casas a soma no menu de consumo passa a refletir o gasto real.
ALTER TABLE "llm_usage" ALTER COLUMN "cost_usd" TYPE DECIMAL(18,10);
ALTER TABLE "llm_usage" ALTER COLUMN "cost_brl" TYPE DECIMAL(20,10);
