#!/bin/sh
set -e

cd /app

# Detecta se este container é o worker — neste caso pula migrations/seed
# (essas tarefas são responsabilidade do container `app`, evitando race
# condition quando ambos sobem juntos).
WORKER_MODE=0
for arg in "$@"; do
  case "$arg" in
    *worker*|*tsx*)
      WORKER_MODE=1
      break
      ;;
  esac
done

if [ "$WORKER_MODE" = "1" ]; then
  echo "[entrypoint] Modo WORKER detectado (cmd='$@'). Pulando migrations/seed."
  exec "$@"
fi

echo "[entrypoint] Aplicando migrations…"
npx prisma migrate deploy --config=./prisma.config.ts || {
  echo "[entrypoint] FALHA ao rodar migrations"
  exit 1
}

# Provisiona os roles de menor privilegio do MCP (nexus_mcp / nexus_mcp_bi) e
# seus GRANTs em fato_*. Idempotente — seguro rodar a cada boot. So roda quando
# as senhas dos roles estao no ambiente; do contrario as tools do MCP retornam
# "permission denied". Ver docs/runbooks/deploy-mcp-db.md (item R4 do RADAR).
if [ -n "$MCP_DB_PASSWORD" ] && [ -n "$MCP_BI_DB_PASSWORD" ]; then
  echo "[entrypoint] Provisionando roles do MCP (db:provision)…"
  npm run db:provision || {
    echo "[entrypoint] FALHA ao provisionar roles do MCP"
    exit 1
  }
fi

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] Rodando seed (idempotente)…"
  npx prisma db seed --config=./prisma.config.ts || echo "[entrypoint] Seed falhou (não-crítico)"
fi

echo "[entrypoint] Iniciando aplicação: $@"
exec "$@"
