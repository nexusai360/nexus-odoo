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

# URL para o psql: o Prisma usa "?schema=public" na DATABASE_URL, mas o psql
# (libpq) rejeita esse parametro ("invalid URI query parameter"). Removemos a
# query string so para os comandos psql; o Prisma continua usando a URL original.
MCP_HAS_PW=0
if [ -n "$MCP_DB_PASSWORD" ] && [ -n "$MCP_BI_DB_PASSWORD" ]; then
  MCP_HAS_PW=1
  PSQL_URL=$(printf '%s' "$DATABASE_URL" | sed 's/?.*//')
fi

# Bootstrap dos roles do MCP ANTES das migrations: algumas migrations fazem
# `GRANT ... TO nexus_mcp` e falhariam numa base nova, onde o role ainda nao
# existe (o provisionamento completo so roda depois do migrate). Aqui criamos
# apenas os roles SEM senha (idempotente) para que esses GRANTs inline
# funcionem. A senha e definida depois pelo provision-mcp.sql (passo abaixo).
# IMPORTANTE: psql NAO interpola variaveis :'var' em comandos -c (so em -f);
# por isso o bootstrap nao usa senha aqui (evita o erro de sintaxe em ":").
if [ "$MCP_HAS_PW" = "1" ]; then
  echo "[entrypoint] Bootstrap dos roles do MCP (pre-migrate)…"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -c "
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nexus_mcp') THEN CREATE ROLE nexus_mcp LOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nexus_mcp_bi') THEN CREATE ROLE nexus_mcp_bi LOGIN; END IF;
    END \$\$;
  " || { echo "[entrypoint] FALHA no bootstrap dos roles do MCP"; exit 1; }
fi

echo "[entrypoint] Aplicando migrations…"
npx prisma migrate deploy --config=./prisma.config.ts || {
  echo "[entrypoint] FALHA ao rodar migrations"
  exit 1
}

# Provisionamento completo dos roles do MCP (nexus_mcp / nexus_mcp_bi): cria os
# roles (idempotente) e aplica os GRANTs de menor privilegio em fato_*. Roda o
# provision-mcp.sql direto com a URL sanitizada (o script `db:provision` do
# package.json passa a DATABASE_URL crua, que o psql rejeita por causa do
# "?schema=public"). Ver docs/runbooks/deploy-mcp-db.md (item R4 do RADAR).
if [ "$MCP_HAS_PW" = "1" ]; then
  echo "[entrypoint] Provisionando roles do MCP (provision-mcp.sql)…"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -v mcp_pw="$MCP_DB_PASSWORD" -v bi_pw="$MCP_BI_DB_PASSWORD" \
    -f prisma/sql/provision-mcp.sql || {
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
