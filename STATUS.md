# STATUS — nexus-odoo

> Estado do projeto para retomada entre sessões. Atualizado em 2026-05-16.
> **Modo de trabalho: autônomo até o fim** — executar sem pausar para
> aprovação; interromper só em bloqueio real. Esta pausa foi pontual (troca
> de sessão), não é regra.

## Onde estamos

- **F0 — Discovery do Odoo:** ✅ CONCLUÍDO, mergeado na `main` (PR #1).
  650 modelos no censo, 79 mapeados em profundidade. Protocolo definido:
  **JSON-RPC** (XML-RPC quebra nesta instância). Achados em
  `docs/runbooks/discovery-odoo.md`.
- **F1 — Fundação:** 🔄 EM ANDAMENTO na branch **`feat/fundacao`**.

## F1 — estrutura

Executado em **6 blocos**, cada um com plano granular próprio + double-check +
verificação antes do seguinte. Roteiro: `docs/superpowers/plans/2026-05-16-fundacao.md`.
Spec: `docs/superpowers/specs/2026-05-15-fundacao-design.md`.

### Bloco 1 — Scaffolding base — ✅ CONCLUÍDO
Plano: `docs/superpowers/plans/2026-05-16-fundacao-bloco1-scaffolding.md`

Todas as 9 tasks concluídas. Verificação: `tsc --noEmit` ✅ · `prisma validate` ✅ · `docker compose config` ✅ · git limpo ✅.

### Bloco 2 — Banco + libs — ⬜ **PRÓXIMO**
Plano ainda não criado. Criar plano granular com double-check antes de executar.

### Blocos 3–6 — ⬜ não iniciados
3: auth/RBAC · 4: UI + telas auth · 5: telas protegidas · 6: worker + CI.

## PARA RETOMAR

1. `git checkout feat/fundacao` (se não estiver nela).
2. Criar plano granular para o **Bloco 2** (banco + libs) com double-check.
3. Executar Blocos 2→6 em modo autônomo até concluir o F1.
4. Ao fim do F1: verificação, e PR `feat/fundacao` → `main`.

## Notas

- `.env.local` existe na raiz (gitignored) com credenciais do Odoo e valores
  de desenvolvimento. **Se retomar em outra máquina**, recriar a partir do
  `.env.example` (a próxima sessão tem o conteúdo no histórico desta).
- Fonte de porte do F1: `nexus-insights` em
  `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`.
- `discovery/.venv` e `discovery/output/` são locais (gitignored).
- Workflow e decisões canônicas: `CLAUDE.md`.
