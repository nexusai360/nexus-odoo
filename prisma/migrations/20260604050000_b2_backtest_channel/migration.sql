-- B2/raiz do dado poluído: canal estrutural para conversas de replay/backtest
-- de qualidade. Separa o sintético do real sem depender de marcador no título.
-- ADD VALUE precisa ficar isolado do backfill (Postgres proíbe usar o novo
-- valor na mesma transação que o cria), por isso o UPDATE vai numa migration
-- seguinte.
ALTER TYPE "AgentChannel" ADD VALUE IF NOT EXISTS 'backtest';
