-- Recalcula custoBRL de TODAS as linhas historicas de llm_usage com a nova
-- formula multiplicativa PTAX + spread bancario + IOF (commit 9da335b).
--
-- Antes: usd_to_brl_rate = commercial * 1.10 (spread agregado antigo).
--        cost_brl = cost_usd * usd_to_brl_rate.
-- Agora: novo multiplicador efetivo = (1 + 0.0183) * (1 + 0.035) = 1.0539.
--        commercial = usd_to_brl_rate / rate_spread (preserva o "comercial"
--        original que estava armazenado, seja PTAX ou bid AwesomeAPI da
--        epoca; a unica coisa que muda eh o spread agregado).
--
-- Linhas sem cost_known ou sem rate_spread permanecem intactas (sem dado
-- suficiente para recalcular).

UPDATE "llm_usage"
SET
  usd_to_brl_rate = ROUND(
    ("usd_to_brl_rate" / "rate_spread") * 1.0539::numeric,
    6
  ),
  rate_spread = 1.0539,
  cost_brl = CASE
    WHEN "cost_usd" IS NOT NULL THEN
      ROUND(
        "cost_usd" * ("usd_to_brl_rate" / "rate_spread") * 1.0539::numeric,
        6
      )
    ELSE "cost_brl"
  END
WHERE "rate_spread" IS NOT NULL
  AND "rate_spread" <> 1.0539
  AND "cost_known" = true;
