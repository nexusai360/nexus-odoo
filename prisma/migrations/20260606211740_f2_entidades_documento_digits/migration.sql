-- F2 (entidades): coluna documento_digits + indices para resolucao de entidades.
-- Migration MANUAL, aplicada com `prisma migrate deploy` (NUNCA `migrate dev`:
-- o banco tem drift pre-existente e migrate dev pediria reset, destruindo o cache).
-- SQL idempotente (IF NOT EXISTS) para ser segura mesmo se parcialmente aplicada.

-- 1. Coluna documento_digits em fato_parceiro (so digitos do CNPJ/CPF).
ALTER TABLE "fato_parceiro" ADD COLUMN IF NOT EXISTS "documento_digits" TEXT;

-- 2. Indice para o ramo documento de resolverParceiro (filtro por igualdade).
CREATE INDEX IF NOT EXISTS "fato_parceiro_documento_digits_idx" ON "fato_parceiro" ("documento_digits");

-- 3. Indice para o ramo chave de resolverNotaFiscal (chave NFe de 44 digitos).
CREATE INDEX IF NOT EXISTS "fato_nota_fiscal_chave_idx" ON "fato_nota_fiscal" ("chave");

-- 4. Backfill alinhado ao builder (mapParceiroRow): NULLIF garante que documento
--    sem digitos (ex.: "BR-") vire NULL, igual ao `soDigitos(...) || null` do builder.
UPDATE "fato_parceiro"
SET "documento_digits" = NULLIF(regexp_replace("documento", '\D', '', 'g'), '')
WHERE "documento" IS NOT NULL AND "documento_digits" IS NULL;
