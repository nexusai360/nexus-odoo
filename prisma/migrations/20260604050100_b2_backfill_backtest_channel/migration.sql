-- B2/raiz do dado poluído: backfill histórico. Move para o canal `backtest`
-- as conversas in_app geradas por scripts de replay/calibração, identificadas
-- pelo marcador de título que esses scripts sempre gravaram:
--   [AUDIT-...]  -> quality-audit/03-run-test-questions + 03b-rerun-failed
--   [SMOKE-...]  -> quality-audit/smoke-e2e
-- Conversas reais da bubble têm título null (ou um título sem esses marcadores)
-- e permanecem in_app, aparecendo no monitoramento Bubble.
UPDATE "conversations"
SET "channel" = 'backtest'
WHERE "channel" = 'in_app'
  AND ("title" LIKE '[AUDIT%' OR "title" LIKE '[SMOKE%');
