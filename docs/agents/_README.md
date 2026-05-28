# docs/agents/

Pasta de coordenação multi-agente do projeto.

## Estado atual (2026-05-28+)

O **protocolo de coordenação vigente é global**, definido em `~/.claude/CLAUDE.md` (sincronizado a partir de `~/ai-instructions/master.md`). Resumo no `AGENTS.md` da raiz deste projeto.

**Sob o protocolo novo, esta pasta contém apenas:**

- `HISTORY.md` — registro append-only, uma linha por commit relevante. Formato canônico:
  ```
  YYYY-MM-DD HH:MM | agent=<id> | commits=<hashes> | scope=<feat+test+infra+...> | summary=<resumo curto>
  ```
  Mantenha o append-only. Ninguém edita histórico para trás.
- `_README.md` — este arquivo.

## O que NÃO existe mais

- **`docs/agents/active/`**: removido. O modelo de "criar um arquivo declarando o que vou fazer ao começar e deletar no fim" foi substituído pela própria existência da worktree git em `<projeto>/branches/<branch>/`. `git worktree list` responde "quem está trabalhando em quê" mais confiavelmente que arquivo manual.
- **Checklist por sessão duplicado aqui e no `AGENTS.md` da raiz**: consolidado no global `~/.claude/CLAUDE.md`.

## Histórico do protocolo antigo (referência)

O protocolo anterior (vigente até maio/2026) usava:
- `docs/agents/active/<agent-id>.md` declarando trabalho ativo.
- `AGENTS.md` na raiz com checklist completo.
- `npm run sync` para visualizar estado e agentes ativos.
- Listagem de "arquivos compartilhados que vou modificar" no active file.

Esse modelo provou-se frágil em prática: dois agentes operando na mesma working directory git colidiam mesmo respeitando o protocolo, porque o git só permite uma branch checked-out por working directory. A solução foi adotar `git worktree` com automação global (`~/bin/agente`).

## Em caso de dúvida

- Estado atual: `agente status` na pasta onde você está.
- Worktrees ativas: `agente list`.
- Histórico recente: `tail -20 docs/agents/HISTORY.md`.
