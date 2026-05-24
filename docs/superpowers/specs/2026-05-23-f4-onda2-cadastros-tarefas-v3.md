# SPEC v3 (final) — F4 Onda 2 Cadastros + Tarefas

> v3 incorpora os 21 achados da Review #2. Vai direto para o plan.

## 1. Contexto

Mantido das versões anteriores. Laudo base:
`docs/laudo-f4-onda2-crm-cadastros-tarefas.md`.

## 2. Escopo final (8 write tools novas + helpers + UI doc)

### 2.1. Write tools

| # | ID | Capability | Modelo Odoo | Ação |
|---|---|---|---|---|
| 1 | `cadastros.res_partner.update` | `update:cadastros` | `res.partner` | Atualiza 23+ campos editáveis (inclui `whatsapp` alias de `mobile`, flags `active/customer/supplier/employee`). Exige ≥ 1 campo além de id. snapshotBefore default true, pulável com `_skipSnapshotBefore`. |
| 2 | `cadastros.res_partner.archive` | `archive:cadastros` | `res.partner` | Soft delete (`active=false`). Reversível por `update {active: true}`. |
| 3 | `cadastros.res_partner.delete` | `delete:cadastros` | `res.partner` | Hard delete (`unlink`). Captura FK → `ParceiroEmUsoError`. |
| 4 | `cadastros.res_partner_category.create` | `create:cadastros` | `res.partner.category` | Cria tag. Idempotente por `name+parent_id` (busca antes; se existe, retorna existente com `created: false`). |
| 5 | `cadastros.res_partner_category.set_tags` | `update:cadastros` | `res.partner` via `category_id` | Modes: `add` (default), `remove`, `replace`. |
| 6 | `cadastros.mail_activity.create` | `create:cadastros` | `mail.activity` | Atrelada a qualquer record (valida `res_id` antes). Resolve `res_model_id` com cache. |
| 7 | `cadastros.mail_activity.update` | `update:cadastros` | `mail.activity` | Exige ≥ 1 campo além de id. |
| 8 | `cadastros.mail_activity.complete` | `transition:cadastros` | `mail.activity` (`action_done`) | Output `{success, messageId, completedAt}`. Aceita number ou array do Odoo. |

### 2.2. Tools mantidas

- `crm.res_partner.get` (read) e `crm.res_partner.create` (write):
  permanecem no módulo `crm`. Renomeação para `cadastros` fica em
  Onda 2.1 dedicada.

### 2.3. Helpers novos

- `mcp/lib/fields/partner-fields.ts` (move + amplia `FIELDS_RES_PARTNER`)
- `mcp/lib/fields/activity-fields.ts`
- `mcp/lib/fields/category-fields.ts`
- `mcp/lib/build-tool-examples.ts` (gera os 4 exemplos curl/n8n/python/javascript dado `{toolId, sampleInput}`)
- `mcp/lib/resolve-model-id.ts` (cache em memória TTL 1h pra `ir.model.search`)
- `mcp/lib/errors.ts`: adiciona `ParceiroEmUsoError`,
  `CategoriaJaExisteError`, `AtividadeNaoEncontradaError`,
  `ModeloNaoSuportadoError`, `RegistroNaoEncontradoError`.

### 2.4. Capabilities novas em `mcp/catalog/api-key-catalog.ts`

`create:cadastros`, `update:cadastros`, `archive:cadastros`,
`delete:cadastros`, `transition:cadastros`.

### 2.5. UI doc

- Componente `mcp-docs-content.tsx`: ler integral primeiro. Patch
  incremental para garantir:
  - Read antes de write em cada módulo, alfabético dentro.
  - Bloco "Capability necessária" para writes.
  - Bloco "Auth" para writes (texto: "Requer API key externa, NÃO
    acessível via agente Nex").
  - Exemplos colapsáveis por linguagem.
- Sem redesign de layout. Sem mudança em "Visão Geral", "Autenticação",
  "Conceitos", etc.

### 2.6. Audit script

- `scripts/audit-mcp-tools.ts`: varre `mcp/tools/<dom>/` e reporta
  arquivos com export `ToolEntry|WriteToolEntry` que não estão no
  `index.ts`. Exit code 1 se houver órfãs.
- Adicionar ao `package.json` como `pnpm audit:tools`.

## 3. Critérios de aceite (versão final)

1. 8 write tools novas implementadas e registradas em
   `cadastrosTools` (`mcp/tools/cadastros/index.ts`).
2. Cada tool: id, operation, module="cadastros", descricao,
   capability, inputSchemaShape, inputSchema (Zod), outputSchema,
   odooModel, affectsModels, eventName, requiresExternalAuth=true,
   addedInVersion=2, examples gerados via `build-tool-examples.ts`.
3. Testes: 1 unit por handler (mock OdooClient), 1 teste Zod por
   tool (input inválido rejeitado), 1 script e2e real skipped sem
   ODOO_WRITE_*.
4. Teste explícito: agente Nex (modo interno) tenta chamar uma write
   tool → 403 `forbidden_via_internal_auth`.
5. `mcp/__tests__/integration.test.ts` passa.
6. `scripts/audit-mcp-tools.ts` retorna exit 0.
7. Capabilities novas serializadas corretamente em
   `api-key-catalog.ts`.
8. Erros tipados em `mcp/lib/errors.ts`.
9. Página `/integracoes/servidor-mcp/docs` rende 6 read + 8 write em
   cadastros, ordenadas read-then-write, alfabético.
10. `tsc --noEmit`, `eslint`, `jest`, `next build` verdes.
11. Manual: `pnpm dev` + screenshot da página doc anexado ao último
    commit.

## 4. Convenções definidas

### 4.1. Templates de exemplos

```ts
// mcp/lib/build-tool-examples.ts
export function buildExamples({ toolId, sampleInput, mcpUrl = "https://mcp.exemplo.com.br" }): ToolEntryExample[] {
  return [
    { language: "curl", description: "...", code: `curl -X POST ${mcpUrl}/mcp ...` },
    { language: "n8n", description: "...", code: `// Node: HTTP Request ...` },
    { language: "python", description: "...", code: `import requests ...` },
    { language: "javascript", description: "...", code: `const r = await fetch ...` },
  ];
}
```

### 4.2. `whatsapp` como alias

```ts
const inputBase = z.object({
  id: z.number().int().positive(),
  mobile: z.string().optional(),
  whatsapp: z.string().optional(),
  // ...
});

const inputSchema = inputBase.transform(v => {
  const out = { ...v };
  if (out.whatsapp && !out.mobile) {
    out.mobile = out.whatsapp;
  }
  delete out.whatsapp;
  return out;
}).refine(v => Object.keys(v).length > 1, "Pelo menos 1 campo além de 'id' deve ser fornecido");
```

### 4.3. `set_tags` modes

```ts
mode === "add"     ? category_ids.map(id => [4, id])
mode === "remove"  ? category_ids.map(id => [3, id])
mode === "replace" ? [[6, 0, category_ids]] : never;
```

Validar essa sintaxe no Bloco Z (pré-implementação).

### 4.4. `archive` vs `delete` (2 tools separadas)

```ts
// archive: capability archive:cadastros
write(id, {active: false}) → snapshotAfter mostra active=false

// delete: capability delete:cadastros
unlink([id]) → catch IntegrityError → ParceiroEmUsoError
snapshotAfter = null (registro não existe mais)
```

### 4.5. `mail_activity.complete` output normalizado

```ts
const raw = await odoo.executeKw("mail.activity", "action_done", [[id]]);
const messageId = Array.isArray(raw) ? (raw[0] ?? null) : (typeof raw === "number" ? raw : null);
return { success: true, messageId, completedAt: new Date().toISOString() };
```

### 4.6. `addedInVersion` doc em types.ts

JSDoc no campo: `1` = leitura original, `2` = primeiras writes (esta
onda + crm.res_partner.create).

## 5. Plan (preview do que vai detalhar a próxima etapa)

10 blocos. Detalhe completo no PLAN v1.

- **Bloco Z** — validação empírica de sintaxe Odoo m2m + cache model_id (2 tasks)
- **Bloco A** — fundação: erros, capabilities, helpers (5 tasks)
- **Bloco B** — `res_partner.update + archive + delete` (8 tasks)
- **Bloco C** — `res_partner_category.create + set_tags` (5 tasks)
- **Bloco D** — `mail_activity.create + update + complete` (8 tasks)
- **Bloco E** — UI doc (4 tasks)
- **Bloco F** — audit script + validation suite (3 tasks)
- **Bloco G** — testes E2E reais (8 tasks: 1 por tool)
- **Bloco H** — validation final (tsc + eslint + jest + build + screenshot) (1 task)
- **Bloco I** — commits + push + atualização HISTORY (1 task)

Total estimado: ~45 tasks atômicas. Microcommits por bloco.

## 6. Fora de escopo (não fazer nesta onda)

- CRM kanban (usuário disse para não implementar; investigando).
- Renomeação de `crm.res_partner.create` para `cadastros.*`.
- Webhooks/eventos para terceiros (F5).
- Tools sobre `pedido.documento`, `sped.*`, `finan.*`, `contabil.*`,
  `estoque.*`.
- Migration de schema Prisma (capabilities são JSON na ApiKey existente).
