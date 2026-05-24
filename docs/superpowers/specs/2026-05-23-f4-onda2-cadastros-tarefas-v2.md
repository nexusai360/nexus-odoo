# SPEC v2 — F4 Onda 2 Cadastros + Tarefas

> v2 incorpora os 13 achados da Review #1 (todos materializados).

## 1. Contexto

Mantido da v1 (cenário do laudo `docs/laudo-f4-onda2-crm-cadastros-tarefas.md`).

## 2. Objetivo

Mantido da v1.

## 3. Escopo final

### 3.1. Tools novas (7 write tools)

| # | ID | Capability | Modelo Odoo | Observação |
|---|---|---|---|---|
| 1 | `cadastros.res_partner.update` | `update:cadastros` | `res.partner` | Aceita 23 campos editáveis + flags `active/customer/supplier/employee` |
| 2 | `cadastros.res_partner.archive` | `archive:cadastros` (soft) ou `delete:cadastros` (hard) | `res.partner` | Soft default (`active=false`). `hard:true` faz `unlink` com guard de FK. |
| 3 | `cadastros.res_partner_category.create` | `create:cadastros` | `res.partner.category` | Cria tag com `name`, `color?`, `parent_id?` |
| 4 | `cadastros.res_partner_category.set_tags` | `update:cadastros` | `res.partner` (via `category_id`) | `mode: add\|remove\|replace` |
| 5 | `cadastros.mail_activity.create` | `create:cadastros` | `mail.activity` | Atrelada a qualquer record |
| 6 | `cadastros.mail_activity.update` | `update:cadastros` | `mail.activity` | Mudar prazo/responsável/etc. |
| 7 | `cadastros.mail_activity.complete` | `transition:cadastros` | `mail.activity` (action_done) | Retorna `messageId` da `mail.message` gerada |

### 3.2. Tools mantidas

- `crm.res_partner.get` (read) — permanece em `crm`. Reaval na próxima onda.
- `crm.res_partner.create` (write) — permanece em `crm`. Reaval na próxima onda.

Não vamos duplicar `cadastros.res_partner.create`; quem cria parceiro
continua usando `crm.res_partner.create`. (Razão: evitar breaking
change e duplicação. Onda 2.1 dedicada faz a renomeação se necessário.)

### 3.3. UI documentação

- Auditoria programática (`scripts/audit-mcp-tools.ts`) garantindo que
  todo arquivo de tool em `mcp/tools/<dom>/` está exportado no
  `index.ts` do módulo.
- Página `/integracoes/servidor-mcp/docs` mostra para cada write tool:
  - Badge "ESCRITA" violeta (já existe)
  - Linha "Capability necessária: `<module>.<action>`"
  - Linha "Auth: requer API key externa (não acessível via agente Nex)"
  - Argumentos colapsáveis
  - Exemplos colapsáveis por linguagem (curl, n8n, python, javascript)

### 3.4. Fora

Mantido da v1 (CRM kanban, pedido.documento, modelos custom Tauga).

## 4. Critérios de aceite

1. 7 write tools novas implementadas, registradas em `cadastrosTools`
   (`mcp/tools/cadastros/index.ts`) e somadas ao `catalogo`.
2. Cada tool com: id, operation, module="cadastros", descricao,
   capability, inputSchemaShape, inputSchema (Zod), outputSchema,
   odooModel, affectsModels, eventName, requiresExternalAuth=true,
   addedInVersion=2, examples (curl, n8n, python, javascript).
3. `mcp/__tests__/integration.test.ts` passa (proteção contra tool não
   registrada).
4. `scripts/audit-mcp-tools.ts` reporta 0 órfãs (passa em CI).
5. Cada tool com 1 teste unit (handler + Zod) + 1 script e2e real
   skipped sem ODOO_WRITE_*.
6. Capabilities adicionadas em `mcp/catalog/api-key-catalog.ts`:
   `create:cadastros`, `update:cadastros`, `archive:cadastros`,
   `delete:cadastros`, `transition:cadastros`.
7. Erros novos em `mcp/lib/errors.ts`: `ParceiroEmUsoError`,
   `CategoriaJaExisteError`, `AtividadeNaoEncontradaError`,
   `ModeloNaoSuportadoError`.
8. Página `/integracoes/servidor-mcp/docs` rende as 7 write tools no
   módulo "Cadastros" com badge, capability, exemplos.
9. `tsc --noEmit` + `eslint` + `jest` + `next build` verdes. UI testada
   manualmente em `pnpm dev` com screenshot anexado ao commit.

## 5. Convenções de implementação (delta vs v1)

### 5.1. `addedInVersion`

- `1`: tools de leitura originais (F4 leitura).
- `2`: tools de escrita primárias (esta onda + a `crm.res_partner.create`).
- Próximos incrementos só com breaking change documentado.

Doc da convenção em JSDoc no campo `addedInVersion` em
`mcp/catalog/types.ts`.

### 5.2. `whatsapp` como alias de `mobile`

Zod input do `update`:
```ts
const inputSchema = z.object({
  id: z.number().int().positive(),
  // ...
  mobile: z.string().optional(),
  whatsapp: z.string().optional(),
}).transform(v => {
  // whatsapp tem prioridade se ambos passados
  if (v.whatsapp && !v.mobile) {
    return { ...v, mobile: v.whatsapp, whatsapp: undefined };
  }
  return v;
});
```

### 5.3. Resolução de `res_model_id` (mail.activity)

Cache em memória do processo (Map) com TTL 1h. Primeira chamada faz
`ir.model.search([["model","=",res_model]])`. Subsequentes hit cache.

### 5.4. `set_tags` com 3 modes

```ts
const input = z.object({
  partner_id: z.number().int().positive(),
  category_ids: z.array(z.number().int().positive()),
  mode: z.enum(["add", "remove", "replace"]).default("add"),
});

// handler:
const cmd = mode === "add"     ? category_ids.map(id => [4, id])
          : mode === "remove"  ? category_ids.map(id => [3, id])
          : /* replace */        [[6, 0, category_ids]];
await odoo.write("res.partner", [partner_id], { category_id: cmd });
```

### 5.5. `archive` (soft + hard)

```ts
const input = z.object({
  id: z.number().int().positive(),
  hard: z.boolean().default(false),
});

// handler:
if (input.hard) {
  // Capability checada deve ser delete:cadastros (não archive)
  try {
    await odoo.unlink("res.partner", [input.id]);
  } catch (e) {
    if (isIntegrityError(e)) throw new ParceiroEmUsoError(input.id);
    throw e;
  }
} else {
  await odoo.write("res.partner", [input.id], { active: false });
}
```

Capability double-check: o dispatcher vê `archive:cadastros` por
padrão; quando `hard=true` o handler exige `delete:cadastros` extra.
Documentar.

### 5.6. `mail_activity.complete` output

```ts
const outputSchema = z.object({
  success: z.boolean(),
  messageId: z.number().int().nullable(),
  completedAt: z.string().datetime(),
});

// handler:
const result = await odoo.executeKw("mail.activity", "action_done", [[input.id]]);
return {
  success: true,
  messageId: typeof result === "number" ? result : null,
  completedAt: new Date().toISOString(),
};
```

## 6. Cronograma & ordem das tarefas

Apenas resumo (detalhe vai para o PLAN).

1. **Bloco A (fundação):** erros novos + capability matrix + auditoria de tools.
2. **Bloco B (res_partner update + archive):** 2 tools + tests + e2e.
3. **Bloco C (categorias):** 2 tools + tests + e2e (depende de A).
4. **Bloco D (mail.activity):** 3 tools + tests + e2e.
5. **Bloco E (UI doc):** ampliar `mcp-docs-content.tsx` para mostrar
   capability + warning de auth + exemplos.
6. **Bloco F (validação):** tsc + eslint + jest + build + screenshot manual.

## 7. Riscos atualizados

| Risco | Mitigação |
|---|---|
| `archive` confuso (soft x hard) | Default soft, hard explícito com capability extra. Doc clara. |
| `set_tags` mode wrong default | Default `add` (menos destrutivo que replace). Doc clara. |
| Cache de `res_model_id` stale | TTL 1h + invalidação por sinal (módulo do Odoo recompilado é raro). |
| Capability nova quebra ApiKey existente | Capabilities são adicionais; tools novas não afetam ApiKey antigas. |
| UI doc regression | Screenshot + comparação visual. |

## 8. Próximo passo

Esta v2 vai para review crítica #2 ainda mais profunda. Achados
geram v3 final.
