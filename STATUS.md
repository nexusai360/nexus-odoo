# STATUS — nexus-odoo

> Ponto de retomada entre sessões. Atualizado em 2026-05-16.
> Ao iniciar uma sessão: ler este arquivo e o `CLAUDE.md`. Modo autônomo.

## Onde estamos

- **F0 — Discovery do Odoo:** ✅ CONCLUÍDO, mergeado na `main` (PR #1).
- **F1 — Fundação:** ✅ CONCLUÍDA, mergeada na `main` (PR #2 + PR #3).
- **F2 — Ingestão / cache:** ✅ CONCLUÍDA na branch **`feat/ingestao`**. PR pendente de abertura (ver abaixo).
- **Próxima fase:** F3 — Dashboard de relatórios. Começa com **brainstorm** (requer humano).

## F2 — entregue (Blocos 1–7)

### O que foi construído

- **OdooClient JSON-RPC** (`src/worker/odoo/client.ts`): autenticação, `searchRead`, `fieldsGet`, retry com backoff, erros tipados.
- **79 tabelas `raw_*` JSONB** + `SyncState` + `fato_estoque_saldo` tipado no schema Prisma; migration gerada e aplicada.
- **Catálogo declarativo** de 79 modelos (`src/worker/catalog/model-catalog.ts`): nome Odoo, modo (incremental/snapshot/reconcile), tabela raw.
- **Sync engine** (`src/worker/sync/`): orquestra incremental (por `write_date`), snapshot (full refresh transacional) e reconcile (marca `rawDeleted`). `SyncState` lido/escrito por `sync-state.ts`; intervalos de `AppSetting` por `sync-config.ts`.
- **Worker BullMQ** (`src/worker/index.ts` + `jobs.ts`): repeatable jobs config-driven; agenda ciclos conforme intervalos salvos.
- **Builder `fato_estoque_saldo`** (`src/worker/fatos/fato-estoque-saldo.ts`): deriva fato tipado de `raw_estoque_saldo_hoje`. Provisório — será revisado na F3.
- **Tela `/configuracao`** (superadmin-only): edita intervalos de sync, exibe `SyncState` por modelo. RBAC enforçado via `requireRole`.
- **Suíte de testes** Jest cobrindo client, catálogo, sync engine, fato e state.
- **`docs/fatos-modelagem.md`**: registro de que a modelagem definitiva de `fatos_*` aguarda F3/F4.

### Decisão de protocolo

JSON-RPC (não XML-RPC). Comprova F0: XML-RPC quebra no `fields_get` de modelos com metadados `None` (SPED Tauga). Ver decisão 8 em `CLAUDE.md §5`.

## Ambiente

- Docker: projeto `nexus-odoo` — containers `nexus-odoo-db-1` (Postgres, porta **5436**) e `nexus-odoo-redis-1` (Redis, porta **6380**). Se pararem: `docker compose up -d db redis`.
- Banco migrado com schema F2 (79 raw + SyncState + fato_estoque_saldo). Owner: `nexusai360@gmail.com` (credencial em `.env.local`).
- Dev server: `npm run dev` (porta 3000). `.env.local` aponta para `localhost:5436` / `localhost:6380`.
- Verificação: `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npx jest`.

## PARA RETOMAR (próxima sessão)

1. Branch atual: **`feat/ingestao`**. Confirmar com `git status`.
2. Abrir PR `feat/ingestao` → `main` (etapa [9]: `/gsd-code-review` + `/gsd-ui-review` antes do PR, se ainda não feito).
3. Merge do PR é decisão humana.
4. **F3 — Dashboard de relatórios:** iniciar com brainstorm (`superpowers:brainstorming`) — requer o usuário. A modelagem dos `fatos_*` que cada relatório consome é definida aqui (ver `docs/fatos-modelagem.md`).

## Notas

- `.env.local` na raiz (gitignored) tem credenciais do Odoo e do owner.
- Fonte de porte de UI: `nexus-insights` em `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`.
- Workflow e decisões canônicas: `CLAUDE.md`.
- Modelagem de fatos adiada para F3/F4: `docs/fatos-modelagem.md`.
