-- Onda A do Renascimento (parte data-fix): higieniza configs do Agente Nex
-- ja gravadas em AgentSettings. Remove travessao (U+2014) e en-dash
-- (U+2013) de personality, tone, identityBase, advancedOverride e dos
-- itens do array jsonb guardrails. Idempotente.

-- 1) Campos string simples (sempre nao-nulos por schema).
UPDATE "AgentSettings"
SET personality = regexp_replace(coalesce(personality, ''), '[—–]', ',', 'g')
WHERE personality ~ '[—–]';

UPDATE "AgentSettings"
SET tone = regexp_replace(coalesce(tone, ''), '[—–]', ',', 'g')
WHERE tone ~ '[—–]';

-- 2) Campos string opcionais.
UPDATE "AgentSettings"
SET "identityBase" = regexp_replace("identityBase", '[—–]', ',', 'g')
WHERE "identityBase" IS NOT NULL AND "identityBase" ~ '[—–]';

UPDATE "AgentSettings"
SET "advancedOverride" = regexp_replace("advancedOverride", '[—–]', ',', 'g')
WHERE "advancedOverride" IS NOT NULL AND "advancedOverride" ~ '[—–]';

-- 3) Array jsonb de strings. Reconstroi o array depois de aplicar regex em
--    cada elemento. Guarda contra payload nao-array e contra guardrails
--    vazios (jsonb_array_elements_text falha em null/objeto).
UPDATE "AgentSettings" s
SET guardrails = (
  SELECT jsonb_agg(to_jsonb(regexp_replace(value, '[—–]', ',', 'g')))
  FROM jsonb_array_elements_text(s.guardrails) AS value
)
WHERE jsonb_typeof(s.guardrails) = 'array'
  AND jsonb_array_length(s.guardrails) > 0
  AND s.guardrails::text ~ '[—–]';

-- 4) Terminology e jsonb objeto (Record<string,string>). Higieniza keys e
--    values. jsonb_each_text + jsonb_object_agg reconstroi o objeto.
UPDATE "AgentSettings" s
SET terminology = (
  SELECT jsonb_object_agg(
    regexp_replace(k, '[—–]', ',', 'g'),
    regexp_replace(v, '[—–]', ',', 'g')
  )
  FROM jsonb_each_text(s.terminology) AS pair(k, v)
)
WHERE jsonb_typeof(s.terminology) = 'object'
  AND s.terminology::text ~ '[—–]';
