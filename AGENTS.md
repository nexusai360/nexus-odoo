# AGENTS.md

## Coordenação multi-agente — vale o protocolo GLOBAL

Este projeto roda múltiplas sessões Claude em paralelo. O protocolo de coordenação **NÃO mora mais aqui**; ele é global e está em `~/.claude/CLAUDE.md` (sincronizado a partir de `~/ai-instructions/master.md`), aplicado a todos os repos git do usuário.

**Resumo operacional:**

- Cada agente trabalha em uma **worktree git dedicada** dentro de `branches/<nome-da-branch>/`.
- A **pasta principal** (raiz do repo) fica permanentemente em `main` e é a "view" que roda no `localhost:3000`.
- O script global `agente` (`~/bin/agente`) orquestra:
  - `agente start <branch>` — cria worktree em `branches/<branch>/`, roda `npm ci`, faz symlink do `.env.local`, gera Prisma client.
  - `agente end [<branch>]` — pusha pendentes e remove a worktree.
  - `agente list` — lista worktrees do projeto.
  - `agente status` — mostra onde estamos (principal vs worktree).
- Hook `~/.config/git/hooks/pre-commit` (global) **bloqueia** commits em branch errada (pasta principal != `main`, ou worktree `branches/<X>/` != branch `<X>`). Em projetos com husky, o `agente start` injeta automaticamente a chamada ao hook global no `.husky/pre-commit`.

**Regras inegociáveis (resumo, ver detalhes em `~/.claude/CLAUDE.md`):**

1. Antes de tocar em arquivo no projeto: rodar `agente status`. Se estiver na pasta principal e o trabalho não é sobre `main`, rode `agente start <branch>` e migre para a worktree.
2. Claude nomeia a branch por padrão (formato `<tipo>/<descrição-curta-kebab>`). O usuário trabalha em modo passivo; se quiser renomear, ele aciona e Claude troca o nome da branch, da pasta e de qualquer referência junto.
3. Comandos git destrutivos (`reset --hard`, `push --force`, `rebase`, `merge`, `branch -D`, `worktree remove --force`, `gh pr merge`) exigem confirmação explícita.
4. Encerramento de sessão: usuário fala "encerra", "troca de sessão", "finaliza essa branch" ou variação → Claude pergunta literalmente "Posso rodar `agente end <branch>` agora? Isso vai pushar pendentes e deletar `branches/<branch>/`." e executa só com sim.
5. PRs e merges para `main` sempre com confirmação explícita.
6. `branches/` está no `.gitignore` (local e global) — nunca comitar.

## Convenções específicas deste projeto

- **Pasta principal**: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo/` (sempre em `main`).
- **Worktrees ativas**: `branches/<nome>/` (gitignored).
- **`HISTORY.md`** (em `docs/agents/HISTORY.md`): continua valendo como registro append-only por commit relevante. Mantenha.
- **Containers**: só uma instância de `docker compose` pode rodar por vez (mesmas portas). O lugar canônico é a pasta principal. Worktrees rodam testes (`jest`, `tsc`, `prisma generate`), não servem o app.
- **Rebuild de containers**: quando o código que um container consome mudar, rebuilde. Mapa de impacto em `CLAUDE.md §2.1`.

## O que NÃO é mais usado neste projeto

- `docs/agents/active/<id>.md` — modelo antigo de active files. Substituído pela própria existência da worktree.
- Lista de "arquivos compartilhados que vou modificar" no active file. Substituída pelo isolamento de worktree (cada agente edita só na sua, ponto).
- Checklists locais de início/fim de sessão que duplicavam o protocolo. Vão pro CLAUDE.md global.

## Quando o protocolo global NÃO se aplica aqui

Quase nunca. Se você precisar trabalhar direto na pasta principal sem worktree (caso raro: hotfix urgente em `main` mesmo, edição de arquivo de doc isolado, etc.), o pre-commit hook só vai deixar passar se a branch da pasta principal for `main`. Para qualquer outra coisa, vá pra worktree.

## Em caso de dúvida

`agente status` na pasta atual responde em 1 segundo.
