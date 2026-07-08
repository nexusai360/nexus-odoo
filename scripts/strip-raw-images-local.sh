#!/usr/bin/env bash
# strip-raw-images-local.sh , versao DEV LOCAL de scripts/_prod-db-cleanup-images.py.
#
# Remove as imagens base64 legadas (chaves image_* no jsonb `data`) de TODAS as
# tabelas raw_* do Postgres de DEV e devolve o disco (VACUUM FULL).
#
# CONTEXTO (2026-07-08): o field-selection (src/worker/odoo/field-selection.ts)
# exclui campos type=binary do sync desde 2026-06-16, entao dados NOVOS nao trazem
# imagem. Mas o incremental nao re-limpa quem nao mudou: linhas sincronizadas ANTES
# disso ficaram com image_* preso no jsonb (image=1.7MB, image_1024=1.7MB, ...).
# raw_sped_produto chegava a ~774MB e raw_sped_produto_lote_serie a ~3.3GB. O builder
# fato_produto faz findMany do jsonb inteiro -> carregava ~668MB de imagens no heap
# do worker -> OOM ANTES de fato_pedido_classificacao rodar -> bucket_demanda NULL
# (demanda aparecia 0 nos paineis). Este script remove esse legado no banco de dev.
#
# Idempotente: so toca linhas que ainda tem alguma chave image_*. Roda quantas vezes
# quiser. Nenhum builder/query le blob, entao remover e seguro.
#
# Uso:  ./scripts/strip-raw-images-local.sh          # projeto compose "nexus-odoo"
#       DB_CONTAINER=meu-db ./scripts/strip-raw-images-local.sh
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-nexus-odoo-db-1}"
PSQL=(docker exec -i "$DB_CONTAINER" psql -U nexus -d nexus_odoo_l1 -v ON_ERROR_STOP=1)

echo "[strip] container=$DB_CONTAINER , removendo image_* das raws..."

# 1) Strip: reconstroi o jsonb sem as chaves que comecam com 'image', so nas linhas
#    que ainda as tem (idempotente). jsonb_object_agg pode retornar NULL se TODAS as
#    chaves fossem image (impossivel aqui: sempre sobra id/nome/etc) , COALESCE guarda.
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'data'
                        AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind = 'r' AND ns.nspname = 'public' AND c.relname LIKE 'raw\_%'
    ORDER BY pg_total_relation_size(c.oid) DESC
  LOOP
    EXECUTE format(
      'UPDATE %I SET data = COALESCE(' ||
      '  (SELECT jsonb_object_agg(key, value) FROM jsonb_each(data) WHERE key NOT LIKE ''image%%''),' ||
      '  ''{}''::jsonb) ' ||
      'WHERE data ?| ARRAY[''image'',''image_64'',''image_128'',''image_256'',''image_512'',''image_1024'',''image_1920'',''image_small'',''image_medium'']',
      r.relname);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'strip %: % linhas', r.relname, n; END IF;
  END LOOP;
END $$;
SQL

# 2) VACUUM FULL nas tabelas que historicamente carregam imagem, para devolver disco.
echo "[strip] VACUUM FULL (devolve disco)..."
for t in raw_sped_produto_lote_serie raw_sped_produto raw_res_partner raw_sped_produto_volume raw_estoque_local; do
  "${PSQL[@]}" -c "VACUUM FULL $t;" >/dev/null 2>&1 || true
done

echo "[strip] pronto. Maiores raws agora:"
"${PSQL[@]}" -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS tam FROM pg_stat_user_tables WHERE relname LIKE 'raw_%' ORDER BY pg_total_relation_size(relid) DESC LIMIT 5;"
