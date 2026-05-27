-- Onda A do Renascimento (parte data-fix): higieniza configs do Agente Nex
-- ja gravadas em agent_settings. Remove travessao (U+2014) e en-dash
-- (U+2013) de personality, tone, identity_base, advanced_override e dos
-- itens do array jsonb guardrails. Idempotente.

-- 1) Campos string simples (sempre nao-nulos por schema).
UPDATE agent_settings
SET personality = regexp_replace(coalesce(personality, ''), '[—–]', ',', 'g')
WHERE personality ~ '[—–]';

UPDATE agent_settings
SET tone = regexp_replace(coalesce(tone, ''), '[—–]', ',', 'g')
WHERE tone ~ '[—–]';

-- 2) Campos string opcionais.
UPDATE agent_settings
SET identity_base = regexp_replace(identity_base, '[—–]', ',', 'g')
WHERE identity_base IS NOT NULL AND identity_base ~ '[—–]';

UPDATE agent_settings
SET advanced_override = regexp_replace(advanced_override, '[—–]', ',', 'g')
WHERE advanced_override IS NOT NULL AND advanced_override ~ '[—–]';

-- 3) Array jsonb de strings. Reconstroi o array depois de aplicar regex em
--    cada elemento. Guarda contra payload nao-array e contra guardrails
--    vazios (jsonb_array_elements_text falha em null/objeto).
UPDATE agent_settings s
SET guardrails = (
  SELECT jsonb_agg(to_jsonb(regexp_replace(value, '[—–]', ',', 'g')))
  FROM jsonb_array_elements_text(s.guardrails) AS value
)
WHERE jsonb_typeof(s.guardrails) = 'array'
  AND jsonb_array_length(s.guardrails) > 0
  AND s.guardrails::text ~ '[—–]';

-- 4) Terminology e jsonb objeto (Record<string,string>). Higieniza keys e
--    values. jsonb_each_text + jsonb_object_agg reconstroi o objeto.
UPDATE agent_settings s
SET terminology = (
  SELECT jsonb_object_agg(
    regexp_replace(k, '[—–]', ',', 'g'),
    regexp_replace(v, '[—–]', ',', 'g')
  )
  FROM jsonb_each_text(s.terminology) AS pair(k, v)
)
WHERE jsonb_typeof(s.terminology) = 'object'
  AND s.terminology::text ~ '[—–]';
