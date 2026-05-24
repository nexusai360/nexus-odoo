# Coordenação multi-agente

> **Regra absoluta deste projeto.** Quando há ≥ 2 sessões Claude trabalhando no repositório ao mesmo tempo. Sem este protocolo: conflito de merge, sobrescrita de trabalho, deploys empilhando, build quebrando em produção.

## Visão geral

Três peças, todas em arquivos **separados por agente** para minimizar conflitos no próprio sistema de coordenação:

1. **`docs/agents/active/`** — quem está trabalhando AGORA.
2. **`docs/agents/HISTORY.md`** — o que já foi feito (append-only).
3. **`AGENTS.md` (raiz)** — checklist obrigatório antes de qualquer ação.

---

## Peça 1: `docs/agents/active/` (work-in-progress)

### Início da sessão (obrigatório)

Antes de tocar em qualquer arquivo de código, criar:

```
docs/agents/active/<agent-id>.md
```

Onde `<agent-id>` é um nome único da sessão. Sugestão de naming:

- `claude-<topico-curto>` — ex: `claude-f4-onda2-mcp-escrita`, `claude-playground-overrides`, `claude-bubble-refinements`.
- Se rodar 2 sessões do mesmo tópico: adicionar sufixo numérico ou data.

### Conteúdo do arquivo

```markdown
---
agent: claude-<topico>
started_at: 2026-05-20T11:30-03:00
branch: feat/<topico>
target_phase: F4 onda 2
status: in_progress | blocked | review
---

## Tópico
<uma linha resumindo o que está sendo feito>

## Arquivos que provavelmente vou tocar
- src/lib/...
- src/components/...
- prisma/...

## Arquivos compartilhados que VOU modificar
> Listar aqui se vou tocar algum dos arquivos da seção "Arquivos com alta
> probabilidade de conflito" do `AGENTS.md`. Se aparecer aqui o mesmo
> arquivo em 2 agentes ativos: PARAR e coordenar.
- prisma/schema.prisma (adição de tabelas X, Y)
- CLAUDE.md (revisão da decisão canônica #N)
- src/components/layout/sidebar.tsx (adição de submenu)

## Decisões / contexto importante
- ...

## Bloqueios
- (vazio se nenhum)
```

### Fim da sessão

**DELETAR o próprio arquivo de `active/`** quando terminar. Ninguém deleta arquivo dos outros — espera o agente concluir.

Se não houver outro agente pra registrar o término (ex: sessão Claude Code terminada sem cleanup), arquivo "fantasma" pode ficar. Solução: TTL informal de 24h. Se `started_at` > 24h, considerar abandonado e pode ser deletado por outro agente como housekeeping (com nota no `HISTORY.md`).

---

## Peça 2: `docs/agents/HISTORY.md` (append-only)

### Quando registrar

A cada **commit relevante** (não a cada commit trivial). Critérios de "relevante":

- Bump de versão.
- Migration Prisma.
- Modificação em arquivos compartilhados (lista no `AGENTS.md`).
- Novo arquivo em `docs/superpowers/{specs,plans}/`.
- Resolução de bloqueio mencionado em outro `active/*.md`.

### Formato

Sempre ao final do arquivo, **append only**:

```
2026-05-20 11:35 | agent=claude-f4-onda2-mcp-escrita | commit=ab12cd3 | scope=docs | summary=Spec v3 da F4 onda 2 escrita
```

Campos:

- **timestamp** ISO curto local.
- **agent**: o `<agent-id>` do `active/`.
- **commit**: SHA curto do commit (`git log -1 --format=%h`).
- **scope**: feat | fix | docs | infra | release | revert | spec | plan.
- **summary**: 1 linha. Se mais detalhes, linkar pro CHANGELOG ou spec.

### Conflito ao append

Append em arquivo é raro de conflitar — mas se acontecer (`<<<<<<` no merge), o resolver MANUAL é:

- Manter ambas as linhas (são entradas independentes).
- Reordenar por timestamp se necessário.

---

## Peça 3: Checklist obrigatório

Está em `AGENTS.md` raiz. Resumido aqui:

### Antes de qualquer mudança em arquivo

1. `git fetch origin main && git status`
2. `ls docs/agents/active/` — ver quem está trabalhando.
3. Para cada arquivo `active/*.md` ALHEIO, ler — entender o tópico do outro.
4. `git log -10 --oneline` — ver atividade recente.
5. Se vou tocar arquivo compartilhado: `git log -3 --oneline -- <arquivo>`.

### Antes de commit

1. `git fetch origin main` de novo.
2. Se há commits remotos novos: `git pull --rebase origin <branch-alvo>`.
3. Stage **APENAS** seus arquivos. Nunca `git add -A`.
4. Rodar `npm run typecheck`.
5. Rodar `npm test` da área tocada.

### Antes de push (deploy automático na main)

1. `gh run list --limit 5` — ver builds em curso.
2. Se há build queued/in-progress de outro agente: aguardar terminar (apenas para `main`).
3. Atualizar HISTORY.md com sua entrada (se relevante).
4. `git push origin <branch>`.

### Resolução de conflitos detectados

- Mesmo arquivo em 2 `active/*.md`: parar, decidir quem segue, o outro espera ou pivota.
- Build em curso de outro: esperar.
- Commit recente do outro em arquivo que vou tocar: pull, ler diff, decidir se ainda faz sentido fazer minha alteração.

---

## Diagrama de fluxo

```
Sessão começa
    ↓
git fetch + ler active/ + ler HISTORY tail
    ↓
Há overlap com outro agente?
    ├─ SIM → pivota OU espera (declarar bloqueio em active/)
    └─ NÃO ↓
Criar docs/agents/active/<agent-id>.md
    ↓
Trabalho (TDD, etc)
    ↓
A cada commit relevante:
    ├─ git fetch + sync se necessário
    ├─ commit
    └─ append em HISTORY.md
    ↓
Antes de push em main → gh run list → esperar se há build alheio
    ↓
push
    ↓
Sessão termina → DELETAR active/<agent-id>.md
```

---

## Quando NÃO usar (exceções)

- Sessões de **leitura pura** (consulta, debug informacional, rodar `gh workflow run` de leitura) podem pular a criação do `active/*.md`.
- **Hotfix urgente** (produção fora do ar): pode pular o checklist mas deve registrar em `HISTORY.md` no mesmo commit.

---

## Quando atualizar este documento

- A regra mudou.
- Apareceu um padrão de conflito que não foi previsto aqui.
- Adicionou um arquivo novo à lista "alta probabilidade de conflito" em `AGENTS.md`.

Mudanças neste documento devem ser commitadas separadamente, com escopo `docs(agents)`.

---

## Inspiração

Protocolo adaptado do projeto irmão `nexus-insights` (mesma empresa, mesmo cliente). Bateu em produção lá e funciona bem com 2-3 sessões Claude simultâneas.
