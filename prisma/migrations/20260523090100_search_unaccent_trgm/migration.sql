-- Habilita busca por nome de produto tolerante a acento e fuzzy.
-- unaccent() nao e IMMUTABLE por padrao (a tabela de regras pode mudar);
-- criamos uma versao imutavel para conseguir indexar.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.f_unaccent_immutable(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$;

CREATE INDEX IF NOT EXISTS fato_estoque_saldo_unaccent_produto_nome_idx
  ON "fato_estoque_saldo" (lower(public.f_unaccent_immutable("produto_nome")));
