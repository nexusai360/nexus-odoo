-- Recalcula cost_brl e usd_to_brl_rate de TODAS as linhas com cost_known=true
-- aplicando o novo multiplicador efetivo 1.058805 = (1+0.023)*(1+0.035).
-- (Spread bancario reajustado de 1.83% para 2.3% por decisao operacional.)
--
-- Preserva o commercial original: commercial = rate_atual / spread_atual.
-- Idempotente: se ja estiver em 1.058805 nao faz nada.

UPDATE "llm_usage"
SET
  usd_to_brl_rate = ROUND(
    ("usd_to_brl_rate" / "rate_spread") * 1.058805::numeric,
    6
  ),
  rate_spread = 1.058805,
  cost_brl = CASE
    WHEN "cost_usd" IS NOT NULL THEN
      ROUND(
        "cost_usd" * ("usd_to_brl_rate" / "rate_spread") * 1.058805::numeric,
        6
      )
    ELSE "cost_brl"
  END
WHERE "rate_spread" IS NOT NULL
  AND "rate_spread" <> 1.058805
  AND "cost_known" = true;
