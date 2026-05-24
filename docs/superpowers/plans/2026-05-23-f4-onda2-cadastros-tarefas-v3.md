# PLAN v3 (final) — F4 Onda 2 Cadastros + Tarefas

> v3 incorpora os 22 achados da Review #2. Vai para execução.

## Convenções

- Tasks atômicas, commits por bloco, validation após cada bloco.
- Docstring obrigatória no topo de cada arquivo de tool.
- Erros: `code` snake_case ASCII invariante; `message` pode ser pt-BR.

## Bloco Z — Validação empírica pré-código

### Z.0 — Checks defensivos
1. `git log -5 --oneline -- mcp/lib/errors.ts mcp/catalog/api-key-catalog.ts mcp/dispatcher/check-mode.ts mcp/dispatcher/external-pipeline.ts src/components/integracoes/servidor-mcp/mcp-docs-content.tsx mcp/catalog/schema-endpoint.ts`
2. `ls docs/agents/active/`
3. Healthcheck: `python3 -c "import urllib.request,json,ssl,os;d=json.dumps({'jsonrpc':'2.0','method':'call','params':{'service':'common','method':'version','args':[]},'id':1}).encode();r=urllib.request.urlopen(urllib.request.Request(os.environ['ODOO_WRITE_URL']+'/jsonrpc',data=d,headers={'Content-Type':'application/json'}),timeout=15,context=ssl.create_default_context()).read();print(json.loads(r))"`

### Z.1 — Sintaxe Odoo m2m (com cleanup)
`scripts/e2e/teste-J-many2many-syntax.py`. Try/finally. 4 cenários:
add 1, add 2, remove 1, replace.

### Z.2 — `action_done` retorno + dup-call
`scripts/e2e/teste-K-activity-done.py`. Try/finally. Cenários: chamar
1x, chamar 2x no mesmo id. Documentar tipo do retorno.

## Bloco A — Fundação (10 tasks)

### A.0 — Confirma branch + working tree (cobertura de Z.0)
### A.1 — `mcp/lib/errors.ts`: 5 erros novos
Doc no topo: "Convenção: code snake_case ASCII invariante; message
pode ser pt-BR (preservado do Odoo)."

### A.2 — `mcp/lib/fields/partner-fields.ts` (16 campos)
1. `grep -r "FIELDS_RES_PARTNER" mcp/` → atualizar imports.
2. Mover constante + ampliar.

### A.3 — `mcp/lib/fields/activity-fields.ts`
~10 campos: id, res_model, res_id, res_name, summary, note,
date_deadline, user_id, activity_type_id, state.

### A.4 — `mcp/lib/fields/category-fields.ts`
6 campos: id, name, color, parent_id, active, complete_name.

### A.5 — `mcp/lib/build-tool-examples.ts`
`buildExamples({ toolId, sampleInput, mcpUrl? })` → 4 examples.
JSDoc: sempre `JSON.stringify` no sampleInput; injetar dentro de
template literal.

### A.6 — `mcp/lib/resolve-model-id.ts`
Map TTL 1h. Mock-friendly (recebe odoo client). Lança
`ModeloNaoSuportadoError`.

### A.7 — `mcp/catalog/api-key-catalog.ts`
1. Ler arquivo inteiro.
2. Adicionar capabilities `archive` e `delete` e `transition` na
   estrutura existente para módulo `cadastros`.

### A.8 — JSDoc `addedInVersion` em `mcp/catalog/types.ts`

### A.9 — `mcp/catalog/schema-endpoint.ts`: ajustar serialização
de `capability` para `action:module` (não `module.action`).
Atualizar `schema-endpoint.test.ts`.

### A.10 — Checklist A.9/A.10 (do plan v2)
Comentários nos commits (não tasks separadas):
- ✓ `external-pipeline.ts` chama `recordAudit` em success e error
  para write tools (linha exata)
- ✓ `check-mode.ts` rejeita write em interno com 403
  `forbidden_via_internal_auth` (linha exata)
- ✓ rate limit é o mesmo bucket por user para read e write

## Bloco B — `res_partner.update + archive + delete` (8 tasks)

### B.0 — Sondar FK error
`scripts/e2e/teste-L-partner-fk-error.py`. Itera partners até achar
um com FK ativo, captura erro do Odoo. Documenta classe/code.

### B.1 — `cadastros.res_partner.update`
- Arquivo: `mcp/tools/cadastros/res-partner-update.ts`
- Docstring no topo (o que faz, capability, ação Odoo).
- Input: id req + 23 campos opt + `whatsapp` alias + `_skipSnapshotBefore`.
  Transform whatsapp→mobile. Refine ≥1 campo além de id.
- Doc no descricao: "Se ambos whatsapp e mobile, whatsapp prevalece
  (mapeado para mobile no Odoo)."
- Handler: snap before (cond) + write + snap after.
- Examples via `buildExamples`.
- sensitive: false.

### B.2 — `cadastros.res_partner.archive`
- Arquivo: `mcp/tools/cadastros/res-partner-archive.ts`
- Docstring + descricao com "Reversível via update active=true."
- sensitive: false.

### B.3 — `cadastros.res_partner.delete`
- Arquivo: `mcp/tools/cadastros/res-partner-delete.ts`
- Docstring + descricao com "Irreversível. Use archive para desativar."
- sensitive: **true**.
- Mapeia erro descoberto em B.0 → `ParceiroEmUsoError`.

### B.4 — Tests unit B.1/B.2/B.3
- Ler `mcp/tools/crm/__tests__/res-partner-create.test.ts` antes.
- 3 arquivos em `mcp/tools/cadastros/__tests__/`.
- `beforeEach` resetando mocks.
- Cenários: success + Zod reject sem campos + FK fail.

### B.5 — Registrar em `mcp/tools/cadastros/index.ts`

### B.6 — Scripts E2E (3)
Usando `scripts/e2e/fixtures/cadastros-fixtures.ts` (criado em B.7).
Try/finally.

### B.7 — `scripts/e2e/fixtures/cadastros-fixtures.ts`
Helpers: createTestPartner, cleanupTestPartner, createTestActivity,
cleanupTestActivity, createTestCategory.

### B.8 — Commit: `feat(cadastros): res_partner update + archive + delete`

## Bloco C — `res_partner_category` (5 tasks)

### C.1 — `cadastros.res_partner_category.create`
- Docstring.
- Idempotência por name+parent_id (busca antes).
- outputSchema com `created: boolean`.

### C.2 — `cadastros.res_partner_category.set_tags`
- Docstring.
- Modes add/remove/replace. Sintaxe validada em Z.1.
- Doc: "REPLACE substitui todas as tags. ADD/REMOVE são
  idempotentes."

### C.3 — Tests unit (2)

### C.4 — Registrar em index

### C.5 — Scripts E2E (2) + commit

## Bloco D — `mail_activity` (7 tasks)

### D.1 — `cadastros.mail_activity.create`
- Docstring com nota: validação de res_id usa odoo do worker.
- Doc no `note`: "Campo aceita HTML; cliente deve sanitizar ao
  renderizar."
- Doc no `res_model`: "Nome do modelo Odoo. Se não existir, retorna
  `ModeloNaoSuportadoError`."
- Resolve `res_model_id` via helper.
- Valida `res_id` existe via search.

### D.2 — `cadastros.mail_activity.update`
- Zod **omite** res_model e res_id (atividade não muda de dono).
- Refine ≥1 campo além de id.

### D.3 — `cadastros.mail_activity.complete`
- Comportamento de dup-call segue o documentado em Z.2.
  Provavelmente: se já done, retorna `{success: false, messageId: null}`.

### D.4 — Tests unit (3)

### D.5 — Registrar em index

### D.6 — Scripts E2E (3)

### D.7 — Teste defesa modo interno
- Ler `mcp/__tests__/e2e/coexist-modes.test.ts` antes.
- Implementar baseado no pattern.

### D.8 — Commit

## Bloco E — UI doc (5 tasks)

### E.1 — Leitura + inventário UI
- `mcp-docs-content.tsx` integral.
- Listar primitivos disponíveis em `src/components/ui/`.

### E.2 — Ordenação read-then-write alfabético

### E.3 — Bloco "Capability" e "Auth" para writes

### E.4 — Exemplos colapsáveis por linguagem (reusa primitivos UI)

### E.5 — Commit + screenshot em `docs/screenshots/2026-05-23-mcp-doc-cadastros.png`

## Bloco F — Audit script (4 tasks)

### F.1 — `scripts/audit-mcp-tools.ts`
- Ignora paths regex: `/(scripts|__tests__|__mocks__|fixtures)/`.
- Reporta órfãs. Exit 1 se houver.

### F.2 — `package.json` script `audit:tools`

### F.3 — Rodar e confirmar 0 órfãs

### F.4 — Commit

## Bloco G — E2E real (1 task)

### G.1 — `pnpm e2e:cadastros` rodando todos sequenciais.

## Bloco H — Validation final (1 task)

### H.1 — Suite completa
- `pnpm tsc --noEmit`
- `pnpm lint`
- `pnpm jest`
- `pnpm build`
- `pnpm audit:tools`
- `pnpm dev` + screenshot `docs/screenshots/2026-05-23-mcp-doc-cadastros.png`.

## Bloco I — Commits + push + HISTORY (4 tasks)

### I.0 — Confirmar pre-commit hooks
### I.1 — Commits atômicos (1 por bloco, ~9 commits)
### I.2 — Atualizar `docs/agents/HISTORY.md` + checklist A.10
### I.3 — Push para `feat/f4-onda2-cadastros-tarefas`
### I.4 — Remover `docs/agents/active/claude-f4-onda2-cadastros-tarefas.md`

## Inventário final esperado

**Arquivos novos (~28):**
- 8 tools em `mcp/tools/cadastros/*.ts`
- 8 tests em `mcp/tools/cadastros/__tests__/*.test.ts`
- 5 helpers em `mcp/lib/{errors.ts, fields/, build-tool-examples.ts, resolve-model-id.ts}`
- 1 fixture em `scripts/e2e/fixtures/cadastros-fixtures.ts`
- 8 scripts E2E
- 1 audit script
- 1 teste defesa modo interno
- 1 screenshot

**Arquivos modificados (~6):**
- `mcp/tools/cadastros/index.ts`
- `mcp/catalog/api-key-catalog.ts`
- `mcp/catalog/types.ts`
- `mcp/catalog/schema-endpoint.ts`
- `mcp/tools/crm/res-partner-create.ts` (import movido)
- `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`
- `package.json`
- `docs/agents/HISTORY.md`

**Total LOC:** ~3500 adicionadas, ~50 modificadas.

**Commits:** ~9.

Pronto para execução.
