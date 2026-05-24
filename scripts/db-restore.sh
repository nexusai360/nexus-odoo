#!/usr/bin/env bash
#
# db-restore.sh — restaura um backup gerado por scripts/db-backup.sh.
#
# Uso:
#   bash scripts/db-restore.sh <arquivo.sql.gz> [nome_do_banco]
#
# Se o nome do banco nao for informado, e derivado do nome do arquivo
# (a parte antes do timestamp). O banco e criado se nao existir; objetos
# pre-existentes sao substituidos (o dump usa --clean --if-exists).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="${1:-}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: bash scripts/db-restore.sh <arquivo.sql.gz> [nome_do_banco]" >&2
  echo "" >&2
  echo "Backups disponiveis:" >&2
  ls -1t "$ROOT/backups"/*.sql.gz 2>/dev/null | sed 's/^/  /' >&2 || echo "  (nenhum)" >&2
  exit 1
fi

DB_CONTAINER="$(cd "$ROOT" && docker compose ps -q db)"
if [ -z "$DB_CONTAINER" ]; then
  echo "[db-restore] o container 'db' nao esta rodando." >&2
  echo "[db-restore] suba com: docker compose up -d db" >&2
  exit 1
fi

PG_USER="${POSTGRES_USER:-nexus}"

# Banco alvo: 2o argumento, ou derivado do nome do arquivo.
if [ -n "${2:-}" ]; then
  TARGET="$2"
else
  TARGET="$(basename "$FILE" | sed -E 's/-[0-9]{8}-[0-9]{6}\.sql\.gz$//')"
fi

echo "[db-restore] arquivo : $FILE"
echo "[db-restore] banco   : $TARGET"

# Cria o banco se ainda nao existir.
EXISTS="$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d postgres -tA \
  -c "SELECT 1 FROM pg_database WHERE datname = '$TARGET';")"
if [ "$EXISTS" != "1" ]; then
  echo "[db-restore] criando banco '$TARGET'..."
  docker exec "$DB_CONTAINER" createdb -U "$PG_USER" "$TARGET"
fi

echo "[db-restore] restaurando..."
gunzip -c "$FILE" | docker exec -i "$DB_CONTAINER" psql -U "$PG_USER" -d "$TARGET"

echo "[db-restore] concluido."
