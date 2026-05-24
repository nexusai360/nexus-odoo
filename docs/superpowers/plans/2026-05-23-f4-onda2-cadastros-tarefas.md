# PLAN v1 — F4 Onda 2 Cadastros + Tarefas

> Plan sobre a SPEC v3
> (`docs/superpowers/specs/2026-05-23-f4-onda2-cadastros-tarefas-v3.md`).
> Vai passar por 2 reviews críticas (v2, v3) antes da execução.

## Convenções

- Tasks atômicas, 1 unidade verificável cada.
- Commits atômicos por bloco (não por task), mensagens em pt-br sem
  emojis.
- Validação após cada bloco: `pnpm tsc --noEmit` + jest do escopo.

## Bloco Z — Validação empírica pré-código

### Z.1 — Validar sintaxe Odoo many2many

- Arquivo: `scripts/e2e/teste-J-many2many-syntax.py`
- Conteúdo: cria partner com tag A, B; chama write com mode add `[(4,id)]`,
  remove `[(3,id)]`, replace `[(6,0,[ids])]`. Lê de volta. Confirma
  estado esperado em cada caso.
- Done quando: 3 modos validados contra `teste_grupojht`.

### Z.2 — Validar retorno de `mail.activity.action_done`

- Arquivo: `scripts/e2e/teste-K-activity-done-return.py`
- Conteúdo: cria activity, chama action_done, loga tipo do retorno
  (number / array / null).
- Done quando: tipo confirmado e documentado em
  `mcp/tools/cadastros/mail-activity-complete.ts` (futuro).

## Bloco A — Fundação (helpers, erros, capabilities)

### A.1 — Erros novos em `mcp/lib/errors.ts`

- Adicionar classes (extends `Error`, code snake_case):
  - `ParceiroEmUsoError` (code `parceiro_em_uso`)
  - `CategoriaJaExisteError` (code `categoria_ja_existe`)
  - `AtividadeNaoEncontradaError` (code `atividade_nao_encontrada`)
  - `ModeloNaoSuportadoError` (code `modelo_nao_suportado`)
  - `RegistroNaoEncontradoError` (code `registro_nao_encontrado`)
- Done quando: erros existem + 1 teste unit cada em
  `mcp/lib/__tests__/errors.test.ts` confirmando code/message.

### A.2 — `mcp/lib/fields/partner-fields.ts`

- Mover `FIELDS_RES_PARTNER` de
  `mcp/tools/crm/res-partner-create.ts` para
  `mcp/lib/fields/partner-fields.ts`.
- Exportar `PARTNER_SNAPSHOT_FIELDS` (lista de 16 campos:
  id, name, display_name, is_company, company_type, email, phone,
  mobile, street, city, zip, country_id, state_id, active, customer,
  supplier).
- Atualizar import em `res-partner-create.ts` para usar o novo path.
- Done quando: arquivo existe, `res-partner-create.ts` importa, tsc verde.

### A.3 — `mcp/lib/fields/activity-fields.ts`

- Exportar `ACTIVITY_SNAPSHOT_FIELDS` com ~10 campos chave de
  `mail.activity`: id, res_model, res_id, res_name, summary, note,
  date_deadline, user_id, activity_type_id, state.
- Done quando: arquivo existe, tsc verde.

### A.4 — `mcp/lib/fields/category-fields.ts`

- Exportar `CATEGORY_SNAPSHOT_FIELDS`: id, name, color, parent_id,
  active, complete_name.
- Done quando: arquivo existe, tsc verde.

### A.5 — `mcp/lib/build-tool-examples.ts`

- Função `buildExamples({ toolId, sampleInput, mcpUrl? }):
  ToolEntryExample[]`.
- Gera 4 exemplos (curl, n8n, python, javascript) com strings
  template usando o `toolId` e `sampleInput` literal.
- Teste unit em `mcp/lib/__tests__/build-tool-examples.test.ts`
  garantindo que os 4 exemplos têm o `toolId` certo e header padrão
  (Bearer, X-Mcp-User-Id, X-Api-Key, Idempotency-Key).
- Done quando: arquivo existe, teste passa.

### A.6 — `mcp/lib/resolve-model-id.ts`

- Função `resolveModelId(odoo: OdooClient, modelName: string):
  Promise<number>`.
- Map em memória do processo, TTL 1h por entrada.
- Lança `ModeloNaoSuportadoError` se não achar.
- Teste unit com mock de OdooClient (Map vazio + Map quente).
- Done quando: arquivo existe, testes passam.

### A.7 — Capabilities em `mcp/catalog/api-key-catalog.ts`

- Adicionar (se não existirem): `archive`, `delete`, `transition` na
  lista de ações canônicas. Atualizar `cadastros` no mapa.
- Done quando: tsc verde + teste do `api-key-catalog.test.ts` passa.

### A.8 — JSDoc `addedInVersion` em `mcp/catalog/types.ts`

- Documentar: 1 = leitura original (F4 leitura), 2 = primeiras writes.
- Done quando: comentário adicionado.

### A.9 — Confirmar enforcement de `requiresExternalAuth`

- Tarefa de **leitura/análise**: ler
  `mcp/dispatcher/check-mode.ts` + `mcp/dispatcher/external-pipeline.ts`
  e confirmar:
  - Modo interno rejeita `WriteToolEntry` com 403 `forbidden_via_internal_auth`.
  - Write tools rodam pelo external-pipeline com `recordAudit` em
    success e error.
- Done quando: comentário em PR (ou anotação em `docs/agents/HISTORY.md`)
  confirmando os 2 invariantes. Ajustes só se faltarem.

## Bloco B — `res_partner.update` + `archive` + `delete`

### B.1 — `cadastros.res_partner.update`

- Arquivo: `mcp/tools/cadastros/res-partner-update.ts`
- Input Zod: id (req), name, company_type, is_company, customer,
  supplier, employee, active, email, phone, mobile, whatsapp (alias),
  website, function, street, street2, city, zip, country_id,
  state_id, lang, tz, comment, ref, company_registry, industry_id,
  title (todos opcionais exceto id). Transform: whatsapp→mobile.
  Refine: ≥ 1 campo além de id.
- Handler:
  1. (opcional, default true) ler snapshot before.
  2. `odoo.write("res.partner", [id], vals)`.
  3. Ler snapshot after (`PARTNER_SNAPSHOT_FIELDS`).
  4. Retornar `{id, data: snapshotAfter, snapshotBefore, snapshotAfter}`.
- Done quando: arquivo existe, exportado, tsc verde.

### B.2 — `cadastros.res_partner.archive`

- Arquivo: `mcp/tools/cadastros/res-partner-archive.ts`
- Input: id (req).
- Handler:
  1. Snapshot before.
  2. `odoo.write("res.partner", [id], {active: false})`.
  3. Snapshot after.
  4. Retornar `{id, data, snapshotBefore, snapshotAfter}`.
- Done quando: arquivo existe, exportado, tsc verde.

### B.3 — `cadastros.res_partner.delete`

- Arquivo: `mcp/tools/cadastros/res-partner-delete.ts`
- Input: id (req).
- Handler:
  1. Snapshot before.
  2. Try `odoo.unlink("res.partner", [id])`. Catch `OdooIntegrityError` (ou similar) → lançar `ParceiroEmUsoError`.
  3. Retornar `{id, data: null, snapshotBefore, snapshotAfter: null}`.
- Done quando: arquivo existe, exportado, tsc verde.

### B.4 — Testes unit para B.1, B.2, B.3

- Arquivos: `mcp/tools/cadastros/__tests__/res-partner-update.test.ts`,
  `res-partner-archive.test.ts`, `res-partner-delete.test.ts`.
- Cada um: mock de OdooClient com spy de write/unlink/read.
  - update: case success + Zod reject (sem campos extra).
  - archive: success + write recebeu `{active: false}`.
  - delete: success + FK fail → ParceiroEmUsoError.
- Done quando: `jest mcp/tools/cadastros/__tests__/` verde.

### B.5 — Registrar em `mcp/tools/cadastros/index.ts`

- Importar e adicionar ao array `cadastrosTools` na ordem alfabética
  (write atrás dos reads).
- Done quando: `mcp/__tests__/integration.test.ts` (se existir) passa.

### B.6 — Scripts E2E

- `scripts/e2e/test-res-partner-update.ts`
- `scripts/e2e/test-res-partner-archive.ts`
- `scripts/e2e/test-res-partner-delete.ts`
- Cada um: cria partner via `crm.res_partner.create` (api direta),
  invoca a tool sob teste, valida, cleanup.
- Done quando: rodam sem erro contra `teste_grupojht`.

## Bloco C — `res_partner_category.create` + `set_tags`

### C.1 — `cadastros.res_partner_category.create`

- Arquivo: `mcp/tools/cadastros/res-partner-category-create.ts`
- Input: name (req), color (opt, int 0-11), parent_id (opt, int).
- Handler:
  1. Buscar existente por (`name`, `parent_id`). Se achar, retornar
     `{id: existente, data: snapshot, created: false}`.
  2. Criar.
  3. Snapshot after.
  4. Retornar `{id, data, created: true}`.
- outputSchema inclui `created: boolean` (estendendo padrão).
- Done quando: arquivo existe, exportado, tsc verde.

### C.2 — `cadastros.res_partner_category.set_tags`

- Arquivo: `mcp/tools/cadastros/res-partner-category-set-tags.ts`
- Input: partner_id (req), category_ids (req, array int positivo
  não-vazio), mode (default "add", enum).
- Handler: construir comando m2m segundo mode, fazer `write`. Retornar
  snapshot do parceiro com `category_id` atualizado.
- Done quando: arquivo existe, exportado, tsc verde.

### C.3 — Testes unit

- Arquivos correspondentes em `__tests__/`.
- Done quando: jest verde.

### C.4 — Registrar em `index.ts` do módulo.

### C.5 — Scripts E2E.

## Bloco D — `mail_activity.create` + `update` + `complete`

### D.1 — `cadastros.mail_activity.create`

- Arquivo: `mcp/tools/cadastros/mail-activity-create.ts`
- Input: res_model (req string), res_id (req int positivo),
  summary (req), note (opt string HTML), date_deadline (req date
  ISO), user_id (req int), activity_type_id (opt int).
- Handler:
  1. Resolver `res_model_id` via helper.
  2. Validar existência do record (`<res_model>.search([["id","=",res_id]])`).
     Se vazio, `RegistroNaoEncontradoError`.
  3. Criar com `{res_model_id, res_id, summary, note, date_deadline,
     user_id, activity_type_id}`.
  4. Snapshot after.
- Done quando: arquivo existe, exportado, tsc verde.

### D.2 — `cadastros.mail_activity.update`

- Arquivo: `mcp/tools/cadastros/mail-activity-update.ts`
- Input: id (req), summary/note/date_deadline/user_id/activity_type_id
  (todos opt). Refine: ≥ 1 além de id.
- Handler: snapshot before + write + snapshot after.
- Done quando: arquivo existe, exportado, tsc verde.

### D.3 — `cadastros.mail_activity.complete`

- Arquivo: `mcp/tools/cadastros/mail-activity-complete.ts`
- Input: id (req).
- Handler: chama `action_done([id])`, normaliza retorno, retorna
  `{success, messageId, completedAt}`.
- Done quando: arquivo existe, exportado, tsc verde.

### D.4 — Testes unit para D.1, D.2, D.3.

### D.5 — Registrar em `index.ts`.

### D.6 — Scripts E2E.

### D.7 — Teste defesa modo interno

- Arquivo: `mcp/__tests__/e2e/write-tools-forbidden-internal.test.ts`
  (ou similar).
- Conteúdo: simula sessão interna (agente Nex), tenta chamar
  `cadastros.mail_activity.create`. Espera 403
  `forbidden_via_internal_auth`.
- Done quando: jest verde.

## Bloco E — UI doc (mcp-docs-content.tsx)

### E.1 — Leitura integral

- Ler `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`
  (1229 linhas) e mapear:
  - Onde as tools são renderizadas.
  - Como o badge "ESCRITA" é aplicado.
  - Como `examples` são renderizados.
  - Como módulos são agrupados.
- Done quando: comentários no PR ou anotação confirmando estrutura.

### E.2 — Ordenação read-then-write dentro do módulo

- Patch: ordenar `tools` por `operation` (read antes) + nome
  alfabético.
- Done quando: render mostra ordem correta no `pnpm dev`.

### E.3 — Bloco "Capability necessária" e "Auth"

- Patch: para `operation === "write"`, render:
  - Linha "Capability necessária: `<module>.<action>`"
  - Linha "Auth: requer API key externa (não acessível via agente Nex)"
- Done quando: render no dev.

### E.4 — Exemplos colapsáveis por linguagem

- Patch: cada tool com `examples` mostra select/tabs por language
  (curl/n8n/python/javascript) com syntax highlight (se já houver,
  reusar; senão simples `<pre>`).
- Done quando: render no dev + verifica que clica e abre.

## Bloco F — Audit script + capabilities matrix

### F.1 — `scripts/audit-mcp-tools.ts`

- Varre `mcp/tools/<dom>/*.ts` (ignora `index.ts`, `*.test.ts`,
  `__tests__/`).
- Para cada arquivo: confere se há export do tipo
  `ToolEntry | WriteToolEntry` e se está no `index.ts` do módulo.
- Reporta órfãs. Exit 1 se houver.
- Done quando: roda local, retorna 0 com a árvore atual.

### F.2 — Script em `package.json`

- `"audit:tools": "tsx scripts/audit-mcp-tools.ts"`.
- Done quando: `pnpm audit:tools` roda.

## Bloco G — E2E real (validação contra base teste)

### G.1 — Rodar todos os scripts E2E em sequência

- Comando: `pnpm e2e:cadastros` (script novo no package.json que
  rodar os scripts/e2e em ordem).
- Done quando: todos retornam exit 0.

## Bloco H — Validation final

### H.1 — Suite completa

- `pnpm tsc --noEmit`
- `pnpm lint`
- `pnpm jest`
- `pnpm build`
- `pnpm dev` + screenshot manual da página
  `/integracoes/servidor-mcp/docs` mostrando o módulo "Cadastros" com
  6 read + 8 write tools.
- Done quando: todos verdes.

## Bloco I — Commits + push + HISTORY

### I.1 — Commit atômicos por bloco

- Cada bloco vira 1 commit. Commit message segue padrão do projeto
  (sem emojis, sem travessões, pt-br, escopo `feat(mcp)` ou
  `feat(cadastros)`).

### I.2 — Atualizar `docs/agents/HISTORY.md` com cada commit relevante.

### I.3 — Push para `feat/f4-onda2-cadastros-tarefas`.

### I.4 — Remover `docs/agents/active/claude-f4-onda2-cadastros-tarefas.md`.

## Estimativa

- Total de tasks: ~40 atômicas
- Microcommits: ~10 (1 por bloco)
- Total LOC: ~3000+ (8 tools + helpers + tests + UI doc + script)

## Riscos do plan

- Bloco Z pode encontrar sintaxe diferente da assumida → ajustar
  `set_tags` antes da implementação. Tempo extra: 30 min.
- Leitura do `mcp-docs-content.tsx` (1229 linhas) pode revelar
  necessidade de refator maior. Mitigação: patch incremental, sem
  rewrite.
- E2E reais dependem da base de teste estar online. Mitigação: já
  validada hoje (uid=11).
