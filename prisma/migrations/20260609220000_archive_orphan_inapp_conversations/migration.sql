-- Backfill do bug do "ghost" da bubble: conversas in_app antigas que nunca foram
-- limpas ficavam com ended_at = NULL para sempre. Quando o usuario limpava as
-- sessoes recentes, a restauracao no boot "descia" e ressuscitava a orfa ativa
-- mais nova (uma conversa de dias atras reaparecia ao recarregar a pagina).
--
-- O modelo correto e: no maximo UMA conversa in_app ativa por usuario , a sessao
-- atual, que so termina no "Limpar sessao". Aqui arquivamos (ended_at = ultima
-- atividade, nao deletamos) toda conversa in_app aberta que NAO seja a mais
-- recente do usuario, ou seja, que tenha uma irma mais nova no mesmo canal.
-- A unica conversa ativa preservada por usuario e a de maior (updated_at, id).
UPDATE "conversations" c
SET "ended_at" = c."updated_at"
WHERE c."channel" = 'in_app'
  AND c."ended_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "conversations" c2
    WHERE c2."user_id" = c."user_id"
      AND c2."channel" = 'in_app'
      AND (
        c2."updated_at" > c."updated_at"
        OR (c2."updated_at" = c."updated_at" AND c2."id" > c."id")
      )
  );
