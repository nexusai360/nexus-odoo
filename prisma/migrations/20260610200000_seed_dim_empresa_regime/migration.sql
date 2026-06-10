-- Fase 5: SEED inicial do de-para CNPJ-raiz -> regime tributario.
-- Valores PROVADOS ao vivo em sped.empresa.regime_tributario (discovery 2026-06-10),
-- iguais em dev e prod (mesma instancia Odoo Tauga). Garante que a tool
-- fiscal_faturamento_por_regime funcione em prod sem passo manual, ja no boot
-- (migrate deploy). O builder dim-empresa-regime (scripts/build-dim-empresa-regime.ts)
-- continua sendo o refresh dinamico: ON CONFLICT DO UPDATE deixa o builder sobrescrever.
-- Precedente: dim_empresa_grupo foi seedado por migration do mesmo jeito.

INSERT INTO dim_empresa_regime (cnpj_raiz, regime_codigo, regime_label, atualizado_em) VALUES
  ('07390039', '1',   'Simples Nacional', CURRENT_TIMESTAMP),  -- JHT Brasilia
  ('33718546', '1',   'Simples Nacional', CURRENT_TIMESTAMP),  -- Jib DF
  ('34461908', '1',   'Simples Nacional', CURRENT_TIMESTAMP),  -- Ks
  ('45424185', '1',   'Simples Nacional', CURRENT_TIMESTAMP),  -- Jmf
  ('10557556', '3',   'Lucro Presumido',  CURRENT_TIMESTAMP),  -- Jht DF
  ('35156509', '3',   'Lucro Presumido',  CURRENT_TIMESTAMP),  -- Cs
  ('62673999', '3',   'Lucro Presumido',  CURRENT_TIMESTAMP),  -- Ijht Premium Car
  ('18282961', '3.1', 'Lucro Real',       CURRENT_TIMESTAMP),  -- Jds
  ('34161829', '3.1', 'Lucro Real',       CURRENT_TIMESTAMP)   -- Jht SP
ON CONFLICT (cnpj_raiz) DO UPDATE
  SET regime_codigo = EXCLUDED.regime_codigo,
      regime_label  = EXCLUDED.regime_label,
      atualizado_em = EXCLUDED.atualizado_em;
