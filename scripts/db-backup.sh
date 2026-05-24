#!/usr/bin/env bash
#
# db-backup.sh — backup dos bancos Postgres do nexus-odoo.
#
# Gera um pg_dump comprimido de cada banco da aplicacao (container "db" do
# docker compose) em backups/, com timestamp no nome.
#
# Retencao: mantem os N backups mais recentes (default 10; ajuste pela env
# BACKUP_KEEP). O dump do banco de leitura inclui o cache raw do Odoo, entao
# cada arquivo dele pode passar de 1 GB — calibre BACKUP_KEEP conforme o disco.
#
# Uso:
#   bash scripts/db-backup.sh
#
# Restaurar um backup:
#   bash scripts/db-restore.sh backups/<arquivo>.sql.gz [nome_do_banco]
#
# Recomendado rodar ANTES de qualquer recriacao de banco (prisma migrate
# reset, drop/create database, troca de DATABASE_URL). Foi a falta desse
# passo que custou os dados de uso do Agente Nex em 2026-05-22.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"

# Container do servico "db" do docker compose.
DB_CONTAINER="$(cd "$ROOT" && docker compose ps -q db)"
if [ -z "$DB_CONTAINER" ]; then
  echo "[db-backup] o container 'db' nao esta rodando." >&2
  echo "[db-backup] suba com: docker compose up -d db" >&2
  exit 1
fi

PG_USER="${POSTGRES_USER:-nexus}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Bancos da aplicacao (ignora templates e o banco 'postgres' de servico).
DBS="$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d postgres -tA \
  -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres' ORDER BY 1;")"

if [ -z "$DBS" ]; then
  echo "[db-backup] nenhum banco de aplicacao encontrado." >&2
  exit 1
fi

COUNT=0
for DB in $DBS; do
  OUT="$BACKUP_DIR/${DB}-${STAMP}.sql.gz"
  echo "[db-backup] $DB -> ${OUT#"$ROOT"/}"
  # --clean --if-exists deixa o dump pronto para restaurar por cima.
  docker exec "$DB_CONTAINER" pg_dump -U "$PG_USER" --clean --if-exists "$DB" \
    | gzip > "$OUT"
  COUNT=$((COUNT + 1))
done

# Retencao: mantem apenas os N arquivos mais recentes (default 10).
KEEP="${BACKUP_KEEP:-10}"
ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r OLD; do
  echo "[db-backup] removendo backup antigo: ${OLD#"$ROOT"/}"
  rm -f "$OLD"
done

echo "[db-backup] concluido — $COUNT banco(s) salvo(s) em ${BACKUP_DIR#"$ROOT"/}/"
