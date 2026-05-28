#!/usr/bin/env bash
# scripts/sync-status.sh
#
# Mostra o estado de sincronizacao entre este checkout (worktree ou repo
# principal) e a main remota + lista outros agentes ativos.
#
# So INFORMA. Nao faz pull, nao bloqueia nada. Decisao fica com o humano
# ou o agente que estiver lendo.
#
# Uso: npm run sync

set -e

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "?")
BRANCH=$(git branch --show-current 2>/dev/null || echo "?")
MAIN_BRANCH="main"

# Fetch silencioso pra ter dados frescos.
git fetch origin --quiet 2>/dev/null || true

YELLOW=$'\033[0;33m'
GREEN=$'\033[0;32m'
BLUE=$'\033[0;34m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
NC=$'\033[0m'

printf '\n%s=== Sync status ===%s\n' "$BOLD" "$NC"
printf '  checkout: %s%s%s\n' "$DIM" "$ROOT" "$NC"
printf '  branch:   %s%s%s\n\n' "$BOLD" "$BRANCH" "$NC"

# Estado vs main.
if [ "$BRANCH" = "$MAIN_BRANCH" ]; then
  AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "?")
  BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
  if [ "$AHEAD" = "0" ] && [ "$BEHIND" = "0" ]; then
    printf '  %smain local e remota sincronizadas.%s\n' "$GREEN" "$NC"
  else
    [ "$AHEAD" != "0" ] && printf '  %slocal esta %s commit(s) a frente da origin/main.%s\n' "$YELLOW" "$AHEAD" "$NC"
    [ "$BEHIND" != "0" ] && printf '  %slocal esta %s commit(s) atras da origin/main. Rode: git pull%s\n' "$YELLOW" "$BEHIND" "$NC"
  fi
else
  BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "?")
  BEHIND_MAIN=$(git rev-list --count "${BASE}..origin/main" 2>/dev/null || echo "?")
  AHEAD_MAIN=$(git rev-list --count "${BASE}..HEAD" 2>/dev/null || echo "?")
  printf '  vs origin/main:\n'
  if [ "$BEHIND_MAIN" = "0" ]; then
    printf '    %satualizada com main.%s\n' "$GREEN" "$NC"
  else
    printf '    %s%s commit(s) novos em main desde quando voce ramificou.%s\n' "$YELLOW" "$BEHIND_MAIN" "$NC"
    printf '    %srebase opcional: git fetch origin && git rebase origin/main%s\n' "$DIM" "$NC"
  fi
  printf '    %s%s commit(s) seus nesta branch.%s\n' "$BLUE" "$AHEAD_MAIN" "$NC"
fi
printf '\n'

# Diff vs main remota (top 5 commits novos em main).
NEW_ON_MAIN=$(git log --oneline HEAD..origin/main 2>/dev/null | head -5)
if [ -n "$NEW_ON_MAIN" ]; then
  printf '%sCommits novos em origin/main:%s\n' "$BOLD" "$NC"
  printf '%s\n' "$NEW_ON_MAIN" | sed 's/^/  /'
  printf '\n'
fi

# Agentes ativos.
ACTIVE_DIR="docs/agents/active"
if [ -d "$ACTIVE_DIR" ]; then
  ACTIVE_COUNT=$(ls "$ACTIVE_DIR" 2>/dev/null | grep -v "^_" | wc -l | tr -d ' ')
  if [ "$ACTIVE_COUNT" -gt 0 ]; then
    printf '%sAgentes ativos (docs/agents/active/):%s\n' "$BOLD" "$NC"
    for f in "$ACTIVE_DIR"/*.md; do
      [ -e "$f" ] || continue
      [ "$(basename "$f")" = "_README.md" ] && continue
      AGENT=$(basename "$f" .md)
      BRANCH_OF=$(grep -E "^branch:" "$f" 2>/dev/null | head -1 | sed 's/branch:[[:space:]]*//')
      STARTED=$(grep -E "^started_at:" "$f" 2>/dev/null | head -1 | sed 's/started_at:[[:space:]]*//')
      TOPIC=$(grep -E "^target_phase:|^Topic:|^## Topico|^## Topic" "$f" 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//')
      printf '  %s%s%s\n' "$BOLD" "$AGENT" "$NC"
      [ -n "$BRANCH_OF" ] && printf '    branch:  %s\n' "$BRANCH_OF"
      [ -n "$STARTED" ] && printf '    desde:   %s\n' "$STARTED"
      [ -n "$TOPIC" ] && printf '    topico:  %s\n' "$TOPIC"
    done
  else
    printf '%sNenhum agente ativo registrado.%s\n' "$GREEN" "$NC"
  fi
  printf '\n'
fi

# Sumario das ultimas linhas do HISTORY.
HIST="docs/agents/HISTORY.md"
if [ -f "$HIST" ]; then
  printf '%sHISTORY (ultimas 3 entradas):%s\n' "$BOLD" "$NC"
  tail -3 "$HIST" | cut -c1-180 | sed 's/^/  /'
  printf '\n'
fi

printf '%sEste script so mostra estado. Nenhuma alteracao foi feita.%s\n' "$DIM" "$NC"
printf '%sPara sair: git pull / git rebase origin/main / git merge origin/main (decisao sua).%s\n\n' "$DIM" "$NC"
