# AGENTS.md

## Coordenação multi-agente (REGRA ABSOLUTA)

> **Há ≥ 2 sessões Claude trabalhando neste repositório simultaneamente em features distintas.**
> Sem este protocolo: conflito de merge, sobrescrita de trabalho, commits que quebram o build, deploys empilhando.

### Protocolo completo

O protocolo detalhado está em **`docs/agents/_README.md`**. Resumo aqui — e os arquivos que materializam:

- **`docs/agents/active/<agent-id>.md`** — quem está trabalhando agora (1 arquivo por agente; criado no início, deletado no fim).
- **`docs/agents/HISTORY.md`** — log append-only do que foi feito (1 linha por commit relevante).
- **Este `AGENTS.md`** — checklist obrigatório (abaixo).

### Início da sessão (obrigatório)

1. `git fetch origin main && git status` — pegar o estado mais recente do remoto.
2. `git log --oneline HEAD..origin/main` (commits remotos novos) e `git log --oneline -10` (atividade recente).
3. `ls docs/agents/active/` — quais agentes estão ativos.
4. Para cada `docs/agents/active/<other-agent>.md` ALHEIO: ler, entender o tópico do outro, identificar arquivos compartilhados.
5. `tail -30 docs/agents/HISTORY.md` — atividade recente registrada.
6. Se houver mudanças remotas: `git pull --rebase origin main`.
7. **Criar `docs/agents/active/<meu-agent-id>.md`** descrevendo o que vou fazer (formato no `_README.md`).

### Antes de QUALQUER mudança em arquivo

- Se ainda não criei `docs/agents/active/<meu-id>.md` — criar AGORA.
- Verificar se outro `active/*.md` declarou o mesmo arquivo na seção "Arquivos compartilhados que VOU modificar". Se sim → **PARAR e coordenar**.

### Antes de mexer em arquivo compartilhado

Estes arquivos têm alta probabilidade de conflito porque várias features tocam neles:

- `package.json` (versão, dependências)
- `STATUS.md`
- `CLAUDE.md`
- `AGENTS.md`
- `prisma/schema.prisma`
- `prisma/migrations/`
- `src/lib/queue.ts` (se existir) / `src/worker/index.ts`
- `src/components/layout/sidebar.tsx`
- `src/components/integracoes/` (estrutura do menu Integrações)
- `src/components/agent/` (UI do Agente Nex)
- `src/mcp/` (servidor MCP — F4)
- `.env.example`

Antes de tocar um deles:

1. `git log -3 --oneline -- <arquivo>` — ver quem mexeu recente.
2. Se commit muito recente (< 30 min), provável que outro agente esteja trabalhando nesse arquivo agora. Avaliar:
   - Se a mudança é independente: pode prosseguir.
   - Se há sobreposição: **PARAR**, esperar o outro agente terminar (até 1h) ou pivotar.
3. Se vai bumpar versão (`package.json`): leia o número atual antes — pode ter sido bumpado por outro agente.

### Antes de commitar

1. **`git fetch origin main`** de novo.
2. Se há commits remotos novos durante seu trabalho:
   - `git pull --rebase origin main` (ou rebase contra branch alvo se não for `main`).
   - Resolver conflitos manualmente (não force-push).
   - Re-rodar `npm run typecheck` e `npm test`.
3. Stage **APENAS** os arquivos que você modificou para a sua feature. **Nunca** `git add -A` ou `git add .` — pega trabalho dos outros.
4. Se aparecer untracked file que não é seu: deixar quieto. Outro agente vai commitar.
5. **Append uma linha em `docs/agents/HISTORY.md`** quando o commit é "relevante" (bump de versão, migration, mudança em arquivo compartilhado, novo spec/plan, fix urgente). Formato no `_README.md`.

### Antes de PUSH (deploy automático na main)

> Push em `main` dispara CI → ghcr.io → Portainer redeploy. Múltiplos pushes em sequência empilham builds (~5 min cada) e o último ganha. Cuidado.

> Para branches de feature (ex.: `feat/f4-onda2-*`), CI roda mas não há deploy. Pode push livremente.

1. `gh run list --limit 5` — verificar se há build queued/in-progress.
2. Se há build de outro agente em curso na `main`:
   - Esperar terminar OU
   - Confirmar que o seu push não conflita com o que está sendo deployado.
3. Verificar status atual de produção (`/api/health`) — não pushar `main` se já está caindo.
4. Push.
5. (Opcional) `gh run watch <id>` pra acompanhar.

### Fim da sessão

- **Deletar `docs/agents/active/<meu-id>.md`** — sinaliza pros outros que terminou.
- Última entrada em `HISTORY.md` se ainda não foi.

### Conflito de spec/plan

- Cada feature deve ter spec/plan próprio em `docs/superpowers/{specs,plans}/YYYY-MM-DD-<topico>-design.md`.
- Antes de iniciar: listar `docs/superpowers/specs/` e ver se há feature em progresso (data recente, `_design.md` mas sem `plans/...` correspondente, ou `plans/...` sem implementação completa).
- Se há overlap conceitual entre features (ex.: dois agentes mexendo no Dashboard), **escolher um**: o que tem spec mais antiga geralmente continua, o outro espera ou pivota.

### Como saber em que outros agentes estão trabalhando

Sinais que indicam trabalho em paralelo:

- `git status`: arquivos modificados (sem staged) que você não tocou.
- `git log --oneline -10`: commits muito recentes (< 30 min) com hash diferente do seu.
- `docs/superpowers/specs/`: arquivos `*-design.md` recentes não escritos por você.
- `docs/agents/active/`: arquivos `<agent-id>.md` que não são seus.
- `package.json` versão bumpada quando você não bumpou.

Se identificar o tópico de outro agente (ex.: "Playground F5.5", "F4 Onda 2 MCP Escrita"):

- **Não toque nos arquivos da feature dele**, mesmo se parece simples.
- Use os commits/specs dele como contexto pra evitar duplicação.
- Se sua feature **depende** de algo que ele está fazendo: pause sua execução, anote o ponto, retome quando ele commitar e push.

### Em caso de dúvida: PERGUNTAR ao João

Se não está claro se uma mudança vai colidir com trabalho de outro agente — pergunta. É barato. Conflito de merge é caro.

---

## Onde buscar mais contexto

- **`CLAUDE.md`** — workflow e contexto canônico do projeto.
- **`STATUS.md`** — ponto de retomada (o que já foi feito, próxima ação).
- **`docs/superpowers/specs/`** — specs de features.
- **`docs/superpowers/plans/`** — planos de execução.
- **`docs/agents/_README.md`** — protocolo detalhado de multi-agente.
- **`docs/agents/HISTORY.md`** — atividade recente registrada.

---

## Inspiração

Este protocolo foi adaptado do projeto irmão `nexus-insights` (mesma empresa, mesmo cliente), onde rotineiramente rodam 2-3 sessões Claude em paralelo. As regras foram batidas em produção lá.
