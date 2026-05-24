# PLAN v2 — F4 Onda 2 Cadastros + Tarefas

> v2 incorpora os 16 achados da Review #1.

## Convenções (mantidas)

Tasks atômicas, commits por bloco, validation após bloco.

## Bloco Z — Validação empírica (3 tasks)

### Z.0 — Checar atividade alheia em arquivos compartilhados

- `git log -5 --oneline -- mcp/lib/errors.ts mcp/catalog/api-key-catalog.ts mcp/dispatcher/check-mode.ts mcp/dispatcher/external-pipeline.ts src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`
- `ls docs/agents/active/`
- Se houver outro agente declarando esses arquivos → pausar.
- Done quando: sinal verde no comentário.

### Z.1 — Validar sintaxe Odoo m2m em `category_id` (com cleanup)

- `scripts/e2e/teste-J-many2many-syntax.py`
- Try/finally garantindo cleanup do partner + tags.
- Casos: add 1 tag, add 2 tags, remove 1, replace.
- Done: 4 sintaxes confirmadas + cleanup OK.

### Z.2 — Validar retorno de `action_done` + idempotência

- `scripts/e2e/teste-K-activity-done.py`
- Cria activity, chama action_done, loga tipo do retorno.
- Chama action_done **2x** no mesmo id; documenta comportamento
  (erro ou no-op).
- Cleanup garantido.
- Done: 2 cenários documentados.

## Bloco A — Fundação (8 tasks)

### A.0 — Setup defensivo

- (cobertura em Z.0 já fez o check git/active)
- Confirmar branch correta + working tree limpo.

### A.1 — Erros novos em `mcp/lib/errors.ts`

(Mantido v1)

### A.2 — `mcp/lib/fields/partner-fields.ts` + grep+atualizar imports

- `grep -r "FIELDS_RES_PARTNER" mcp/` para listar todos os imports.
- Mover constante.
- Atualizar todos os imports (provavelmente:
  `mcp/tools/crm/res-partner-create.ts` e qualquer test).
- Done quando: tsc verde + jest do escopo crm verde.

### A.3 — `mcp/lib/fields/activity-fields.ts`

(Mantido v1)

### A.4 — `mcp/lib/fields/category-fields.ts`

(Mantido v1)

### A.5 — `mcp/lib/build-tool-examples.ts`

(Mantido v1)

### A.6 — `mcp/lib/resolve-model-id.ts`

(Mantido v1)

### A.7 — Capabilities em `mcp/catalog/api-key-catalog.ts`

(Mantido v1)

### A.8 — JSDoc `addedInVersion` em `mcp/catalog/types.ts`

(Mantido v1)

### A.9 — Confirmar enforcement de `requiresExternalAuth`

- Tarefa de **leitura**: `mcp/dispatcher/check-mode.ts`,
  `mcp/dispatcher/external-pipeline.ts`. Confirmar:
  - Modo interno rejeita WriteToolEntry com 403.
  - Write rodam pelo external-pipeline com `recordAudit`.
- Done: comentário em I.2.

### A.10 — Confirmar rate limit das write tools

- Ler `mcp/lib/rate-limit.ts`.
- Confirmar que write tools são rate-limitadas igual reads (mesmo
  bucket por user).
- Done: comentário em I.2.

## Bloco B — `res_partner.update` + `archive` + `delete` (8 tasks)

### B.0 — Sondar FK error empírico em `res.partner.unlink`

- `scripts/e2e/teste-L-partner-fk-error.py`
- Tenta `unlink` num partner com FK ativa (ex: id=11138 que tem
  vendas atreladas, do PV-0225/26).
- Captura mensagem exata do erro do Odoo.
- Mapear em `mcp/lib/errors.ts` (via `mapOdooFault`).
- Cleanup: não cria nada (só lê e tenta delete que deve falhar).
- Done: erro mapeado + tipo identificado.

### B.1 — `cadastros.res_partner.update`

Igual v1 + `_skipSnapshotBefore: z.boolean().default(false)` no input.

### B.2 — `cadastros.res_partner.archive`

(Mantido v1)

### B.3 — `cadastros.res_partner.delete`

(Mantido v1; usa o tipo de erro descoberto em B.0)

### B.4 — Testes unit B.1+B.2+B.3 (lê pattern existente primeiro)

- Ler `mcp/tools/crm/__tests__/res-partner-create.test.ts` antes.
- Manter mesma estrutura de mocks/spies do OdooClient.
- Cenários por tool:
  - update: success + Zod reject sem campos + Zod reject só id.
  - archive: success + write recebeu `{active: false}` + snapshotBefore lido.
  - delete: success + FK fail → `ParceiroEmUsoError`.
- Done quando: jest verde nesses arquivos.

### B.5 — Registrar em `mcp/tools/cadastros/index.ts`

Ordem exata (write em alfabético, após reads):

```ts
// reads (existentes, alfabético):
cadastroBuscarParceiro,
cadastroContarParceiros,
cadastroParceirosPorUf,
cadastrosServicoBuscar,
cadastrosServicoContar,
cadastrosServicoListar,
// writes novas (alfabético, conforme spec):
cadastrosResPartnerArchive,
cadastrosResPartnerDelete,
cadastrosResPartnerUpdate,
```

(As 5 outras writes entram nos blocos C e D na mesma ordem.)

### B.6 — Scripts E2E para B.1/B.2/B.3

- `scripts/e2e/test-cadastros-res-partner-update.ts`
- `scripts/e2e/test-cadastros-res-partner-archive.ts`
- `scripts/e2e/test-cadastros-res-partner-delete.ts`
- Cada script com try/finally pra cleanup garantido.
- Done quando: rodam contra `teste_grupojht` com sucesso.

### B.7 — Commit "feat(cadastros): res_partner update + archive + delete"

## Bloco C — `res_partner_category` (5 tasks)

### C.1 — `cadastros.res_partner_category.create`

(Mantido v1)

### C.2 — `cadastros.res_partner_category.set_tags`

(Mantido v1; usa sintaxe validada em Z.1)

### C.3 — Testes unit

### C.4 — Registrar em `index.ts` (ordem final do array com tudo):

```ts
// reads ...
cadastrosMailActivityComplete,
cadastrosMailActivityCreate,
cadastrosMailActivityUpdate,
cadastrosResPartnerArchive,
cadastrosResPartnerCategoryCreate,
cadastrosResPartnerCategorySetTags,
cadastrosResPartnerDelete,
cadastrosResPartnerUpdate,
```

### C.5 — Scripts E2E + commit

## Bloco D — `mail_activity` (8 tasks)

### D.1 — `cadastros.mail_activity.create`

Doc explícito no handler: "validação de `res_id` é feita via odoo
client do worker (sempre autenticado), não via credenciais da API key
do user; permissão garantida."

### D.2 — `cadastros.mail_activity.update`

(Mantido v1)

### D.3 — `cadastros.mail_activity.complete`

(Mantido v1)

### D.4 — Testes unit

### D.5 — Registrar em `index.ts`

### D.6 — Scripts E2E

### D.7 — Teste defesa modo interno (lê pattern existente primeiro)

- Ler `mcp/__tests__/e2e/coexist-modes.test.ts` antes pra ver helper
  de simular sessão interna.
- Implementar baseado no pattern.

### D.8 — Commit

## Bloco E — UI doc (5 tasks)

### E.1 — Leitura integral + inventário de primitivos UI

- Ler `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`.
- Listar primitivos UI disponíveis em `src/components/ui/` (Tabs,
  Collapsible, etc.).
- Done: anotação no PR ou comentário.

### E.2 — Ordenação read-then-write

(Mantido v1)

### E.3 — Bloco "Capability" + "Auth"

(Mantido v1)

### E.4 — Exemplos colapsáveis por linguagem

- Reusar primitivos UI da E.1.

### E.5 — Commit

## Bloco F — Audit script (3 tasks)

(Mantido v1: F.1 audit script + F.2 npm script + F.3 rodar)

### F.4 — Commit

## Bloco G — E2E real (1 task)

### G.1 — Rodar `scripts/e2e/test-cadastros-*.ts` em sequência

- Adicionar `e2e:cadastros` em package.json:
  `tsx scripts/e2e/test-cadastros-res-partner-update.ts && tsx ...`
- Done: todos verdes.

## Bloco H — Validation final (1 task)

### H.1 — Suite completa

- `pnpm tsc --noEmit`
- `pnpm lint`
- `pnpm jest`
- `pnpm build`
- `pnpm audit:tools` (deve voltar 0 órfãs)
- `pnpm dev` + screenshot manual da página doc com 6 read + 8 write
  no módulo Cadastros.
- Done: todos verdes + screenshot.

## Bloco I — Commits + push + HISTORY (4 tasks)

### I.0 — Confirmar pre-commit hooks

- Verificar `package.json` por `husky`/`lint-staged`.
- Se houver, garantir que passam.

### I.1 — Commits atômicos por bloco

(Mantido v1)

### I.2 — Atualizar `docs/agents/HISTORY.md`

Inclui comentários de A.9 e A.10 (confirmações).

### I.3 — Push para `feat/f4-onda2-cadastros-tarefas`.

### I.4 — Remover `docs/agents/active/claude-f4-onda2-cadastros-tarefas.md`.

## Próximo passo

Plan v2 vai para review crítica #2. Foco: integração entre blocos,
edge cases não cobertos.
