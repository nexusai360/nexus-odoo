# F2 — Ingestão / Cache — Design

> Spec da Fase 2 do nexus-odoo. Brainstorm conduzido com o usuário em 2026-05-16.
> Branch: `feat/ingestao`.

## 1. Objetivo

Entregar a **máquina de ingestão** do nexus-odoo: o worker BullMQ + cron que
sincroniza periodicamente o Odoo Tauga e popula o Postgres cache. A partir da
F2, o cache existe, está populado e se mantém atualizado sozinho. Dashboard
(F3) e MCP (F4) lerão exclusivamente desse cache — nenhuma das frentes toca o
Odoo ao vivo.

## 2. Escopo

**Dentro da F2:**

1. **`OdooClient` em TypeScript** — cliente JSON-RPC, portado de
   `discovery/odoo_client.py`.
2. **Camada `raw` completa** — 79 tabelas JSONB espelhando os 79 modelos
   detalhados pela F0 em `discovery/output/modelos/`, inclusive os vazios.
3. **Sync engine** — incremental, snapshot e reconcile de exclusões.
4. **Worker BullMQ** — agenda os ciclos via repeatable jobs.
5. **Config de sync editável** — intervalos globais persistidos em banco.
6. **Tela `/configuracao`** — superadmin-only, edita os intervalos e exibe o
   estado de sync de cada modelo.
7. **`fato_estoque_saldo`** — um único fato derivado, **provisório**, para
   validar o ciclo Odoo → raw → fato ponta a ponta.
8. **Correção do `CLAUDE.md`** — substituir as menções a "XML-RPC" por
   "JSON-RPC" (ver §4).
9. **`docs/fatos-modelagem.md`** — documento vivo registrando que a modelagem
   definitiva dos `fatos_*` é tarefa da F3/F4 (ver §9).

**Fora da F2 (adiado, registrado):**

- Modelagem definitiva das camadas `fatos_*` — depende dos relatórios da F3 e
  das tools do MCP da F4. A F2 entrega só `fato_estoque_saldo` como amostra.
- Qualquer leitura do cache pela UI de relatórios (F3) ou pelo MCP (F4).

## 3. Decisão canônica: protocolo JSON-RPC, não XML-RPC

O `CLAUDE.md` (escrito antes da F0) cita "XML-RPC". A F0 descobriu que o
XML-RPC do Odoo serializa respostas com `allow_none=False` e **quebra** no
`fields_get` de modelos com metadados `None` — comum na customização SPED da
Tauga. O discovery resolveu migrando para **JSON-RPC**, que serializa `None`
como `null`. O `discovery/odoo_client.py` rodou estável contra os 650 modelos
da instância real.

**Decisão F2:** o worker usa JSON-RPC. O endpoint é `{ODOO_URL}/jsonrpc`,
servidor Odoo 17. A F2 inclui a tarefa de corrigir o `CLAUDE.md` para refletir
isso e evitar reincidência do erro.

## 4. Arquitetura e componentes

```
BullMQ (repeatable jobs)
   │ agenda
   ▼
Sync engine ──► OdooClient (JSON-RPC) ──► Odoo Tauga
   │ grava
   ▼
Postgres: raw_* (JSONB)  ──► job de fato ──► fato_estoque_saldo (tipado)
   ▲                                              ▲
   │ lê SyncState/config                          │
Worker                          App /configuracao ┘ (só leitura + escrita de config)
```

| Componente | Local | Responsabilidade |
|---|---|---|
| `OdooClient` | `src/worker/odoo/` | I/O JSON-RPC com a Tauga: timeout, retry com backoff, throttle, tipos de erro (`OdooAuthError`, `OdooRpcFault`, detecção de `AccessError`). Único módulo de rede. |
| `model-catalog` | `src/worker/catalog/` | Config declarativa dos 79 modelos: nome Odoo, modo de sync, tabela raw destino. Adicionar modelo = uma entrada. |
| `sync-engine` | `src/worker/sync/` | Executa o modo de sync de cada modelo; grava raw; atualiza `SyncState`. |
| Worker BullMQ | `src/worker/index.ts` | Agenda jobs `incremental`, `snapshot`, `reconcile`; lê intervalos da config; guarda contra sobreposição. |
| `fato_estoque_saldo` builder | `src/worker/fatos/` | Lê `raw_estoque_saldo_hoje`, popula a tabela tipada `fato_estoque_saldo`. |
| Tela `/configuracao` | `src/app/(protected)/configuracao/` | Superadmin-only. Edita intervalos; exibe estado de sync por modelo. |

Cada componente é testável isolado (o `OdooClient` com mock de rede).

## 5. Modelo de dados (Prisma)

**5.1 Camada `raw` — 79 tabelas JSONB.** Todas com a mesma forma. Nome:
`raw_<modelo_com_underscore>` (ex.: `estoque.saldo.hoje` → `raw_estoque_saldo_hoje`).

| Coluna | Tipo | Função |
|---|---|---|
| `odooId` | `Int` | `id` do registro no Odoo. Único. |
| `data` | `Json` | Registro inteiro como veio do Odoo. |
| `odooWriteDate` | `DateTime?` | `write_date` do Odoo; filtro do incremental. |
| `syncedAt` | `DateTime` | Quando a linha foi sincronizada. |
| `rawDeleted` | `Boolean` (default `false`) | Marcado pelo reconcile quando some do Odoo. |

Índices: único em `odooId`; índices em `odooWriteDate` e `rawDeleted`.

**5.2 `SyncState` — estado por modelo.** Uma linha por modelo:
`model`, `lastIncrementalAt?`, `lastSnapshotAt?`, `lastReconcileAt?`,
`lastStatus` (`ok` | `erro` | `rodando` | `sem_acesso`), `lastError String?`,
`recordCount Int`. É a fonte do "atualizado há Xs" e do painel da
tela de Configuração.

**5.3 Config de sync — via `AppSetting` existente.** O schema da F1 já tem
`AppSetting` (key-value `Json`, com `category` e `updatedById`) e a F1 já tem
a `AuditAction.setting_updated`. **Não criar tabela nova:** os intervalos vão
como linhas de `AppSetting`, `category = "sync"`:

- `sync.incremental_interval_min` — default `3`
- `sync.snapshot_interval_min` — default `1440`
- `sync.reconcile_interval_min` — default `1440`

Editáveis em runtime pela tela de Configuração; o worker relê a cada ciclo.
Alterações registram `AuditLog` com `setting_updated`.

**5.4 `fato_estoque_saldo` — tipado, provisório.** Tabela com colunas reais
(não JSONB). As colunas exatas saem da leitura do field-map
`discovery/output/modelos/estoque.saldo.hoje.json` na fase de planejamento.
Mínimo esperado: identificação do produto, do local, quantidade, unidade,
timestamp do dado. Marcada como provisória no schema e em `docs/fatos-modelagem.md`.

## 6. Estratégia de sincronização

Cada modelo declara no catálogo seu **modo**:

- **`incremental`** — a maioria. A cada ciclo: `search_read` com domínio
  `[["write_date", ">", lastIncrementalAt]]`, paginado por `offset/limit`;
  upsert na raw por `odooId`. Carga inicial é um full backfill paginado.
- **`snapshot`** — modelos `*.saldo.hoje`, recalculados 1×/dia pelo Odoo.
  Full refresh substituindo a tabela raw inteira numa transação.
- **`estatico`** — cadastros que quase não mudam; sync raro (no ciclo snapshot).

A classificação dos 79 modelos sai da **leitura dos field-maps da F0** na fase
de planejamento — confirma-se modelo a modelo a presença de `write_date`.
Não é suposição: é evidência dos JSONs em `discovery/output/modelos/`.

**Cadências (defaults, editáveis na tela):**

- Ciclo incremental: a cada **3 min**.
- Ciclo snapshot: **1×/dia**.
- Reconcile de exclusões: **1×/dia**.

**Reconcile:** busca só os `id`s de cada modelo no Odoo, compara com os
`odooId` da raw, marca `rawDeleted = true` no que sumiu. Nunca apaga linha.

## 7. Erros e observabilidade

- **Isolamento de falha:** cada modelo sincroniza independente. Falha de um
  (timeout, erro de negócio) grava `lastStatus = erro` + `lastError` no
  `SyncState` daquele modelo e o engine **segue para o próximo**. Um modelo
  quebrado não derruba o ciclo.
- **`AccessError`:** os modelos sem permissão (o censo da F0 contou 118 sem
  acesso) são estado esperado — `lastStatus = sem_acesso`, não falha de sistema.
- **Guarda de sobreposição:** ciclo novo não inicia se o anterior ainda roda.
- **Observabilidade:** `SyncState` é a fonte de verdade; a tela de Configuração
  lista os 79 modelos com última sync, status, contagem e último erro. Logs
  estruturados no worker.
- **Job de fato:** após o ciclo snapshot de `estoque.saldo.hoje`, dispara o
  rebuild de `fato_estoque_saldo`.

## 8. Tela de Configuração (`/configuracao`)

Rota protegida, **superadmin-only** — mesmo padrão de RBAC e visual da seção de
Usuários da F1 (`/usuarios`). Item adicionado ao `NAV_ITEMS`, visível só para
super_admin. Conteúdo:

- **Intervalos de sync** — campos editáveis para incremental, snapshot e
  reconcile; salvar persiste em `AppSetting` e registra `AuditLog`.
- **Estado da ingestão** — tabela dos 79 modelos: nome, modo, última sync,
  status, contagem de registros, último erro. Leitura do `SyncState`.

Por tocar UI, a F2 passa pela skill `ui-ux-pro-max` no design da tela e pelo
`/gsd-ui-review` na auditoria final.

## 9. `fatos_*` definitivos — adiado e registrado

A modelagem definitiva das camadas `fatos_*` **não** é da F2 — depende de saber
quais relatórios a F3 mostra e quais perguntas o MCP da F4 responde. A F2
entrega só `fato_estoque_saldo` como amostra provisória.

Para isso não se perder, a F2 cria **`docs/fatos-modelagem.md`** — documento
vivo que registra: (a) que `fato_estoque_saldo` é provisório e deve ser
revisitado; (b) um checklist explícito de que F3 e F4 devem, cada uma, modelar
seus `fatos_*` definitivos sobre a camada `raw`, no padrão tipado de §5.4;
(c) o princípio de enforcement do RBAC ("só concede o que você tem"), herdado
do STATUS da F1. As specs da F3 e da F4 devem referenciar esse documento.

## 10. Testes

- `OdooClient` — testes unitários com mock de rede: parsing de resposta,
  retry/backoff, `OdooRpcFault`, detecção de `AccessError`.
- `sync-engine` — testes do incremental (filtro `write_date`, paginação,
  upsert), snapshot (full refresh transacional), reconcile (marcação
  `rawDeleted`), isolamento de falha por modelo.
- `model-catalog` — validação de que as 79 entradas batem com
  `discovery/output/modelos/` e que cada uma tem modo válido.
- `fato_estoque_saldo` builder — teste de derivação da raw para a tabela tipada.
- Verificação: `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npm test`.

## 11. Resumo das decisões

| # | Decisão |
|---|---|
| 1 | Protocolo: **JSON-RPC** (não XML-RPC). Cliente portado da F0. |
| 2 | `raw` = 79 tabelas **JSONB**, espelho fiel, inclusive modelos vazios. |
| 3 | `fatos_*` = tipados; só `fato_estoque_saldo` na F2, provisório. |
| 4 | Modelagem definitiva de `fatos_*` adiada para F3/F4, registrada em `docs/fatos-modelagem.md`. |
| 5 | Sync: incremental (3 min) / snapshot (1×/dia) / reconcile (1×/dia). |
| 6 | Intervalos editáveis em runtime via `AppSetting`, sem redeploy. |
| 7 | Tela `/configuracao`, superadmin-only, padrão da seção de Usuários. |
| 8 | Isolamento de falha por modelo; `AccessError` é estado esperado. |
| 9 | Classificação de modo dos 79 modelos sai dos field-maps da F0 no planejamento. |
