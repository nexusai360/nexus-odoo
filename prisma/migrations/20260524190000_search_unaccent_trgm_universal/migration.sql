-- Onda B do Renascimento do Agente Nex: amplia a cobertura de busca
-- tolerante a acentos/grafia para alem de fato_estoque_saldo. Cria indices
-- funcionais sobre lower(f_unaccent_immutable(coluna)) com operadores
-- gin_trgm_ops, alinhados ao mesmo padrao da migration original
-- 20260523090100_search_unaccent_trgm (que tambem criou a funcao
-- f_unaccent_immutable). Idempotente: CREATE INDEX IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- fato_parceiro: nome curto, nome completo e documento (cnpj/cpf).
CREATE INDEX IF NOT EXISTS fato_parceiro_unaccent_nome_idx
  ON "fato_parceiro" (lower(public.f_unaccent_immutable("nome")));

CREATE INDEX IF NOT EXISTS fato_parceiro_unaccent_nome_trgm_idx
  ON "fato_parceiro" USING gin (
    lower(public.f_unaccent_immutable("nome")) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS fato_parceiro_unaccent_nome_completo_idx
  ON "fato_parceiro" (lower(public.f_unaccent_immutable("nome_completo")));

CREATE INDEX IF NOT EXISTS fato_parceiro_unaccent_nome_completo_trgm_idx
  ON "fato_parceiro" USING gin (
    lower(public.f_unaccent_immutable("nome_completo")) gin_trgm_ops
  );

-- documento e numerico/alfanumerico, mas pessoas digitam com pontos/barras;
-- index funcional sobre lower(unaccent(doc)) cobre o caso geral.
CREATE INDEX IF NOT EXISTS fato_parceiro_unaccent_documento_idx
  ON "fato_parceiro" (lower(public.f_unaccent_immutable("documento")));

-- fato_pedido: participante_nome (cliente do pedido). Usado em
-- comercial_pedidos_por_vendedor e demais filtros por cliente.
CREATE INDEX IF NOT EXISTS fato_pedido_unaccent_participante_nome_idx
  ON "fato_pedido" (lower(public.f_unaccent_immutable("participante_nome")));

CREATE INDEX IF NOT EXISTS fato_pedido_unaccent_participante_nome_trgm_idx
  ON "fato_pedido" USING gin (
    lower(public.f_unaccent_immutable("participante_nome")) gin_trgm_ops
  );

-- Trigram tambem em fato_estoque_saldo.produto_nome para alinhar com a
-- camada universal nova (a migration original so criou o index funcional
-- lower(unaccent), nao o gin_trgm_ops).
CREATE INDEX IF NOT EXISTS fato_estoque_saldo_unaccent_produto_nome_trgm_idx
  ON "fato_estoque_saldo" USING gin (
    lower(public.f_unaccent_immutable("produto_nome")) gin_trgm_ops
  );
