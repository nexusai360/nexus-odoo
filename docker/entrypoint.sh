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
npx prisma migrate deploy --config=./prisma.config.js || {
  echo "[entrypoint] FALHA ao rodar migrations"
  exit 1
}

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] Rodando seed (idempotente)…"
  npx prisma db seed --config=./prisma.config.js || echo "[entrypoint] Seed falhou (não-crítico)"
fi

echo "[entrypoint] Iniciando aplicação: $@"
exec "$@"
