# Review Crítica #1 — PLAN v1 F4 Onda 2 Cadastros + Tarefas

> Auditoria adversarial. Achados materiais geram o PLAN v2.

## Achados materiais (P-series)

### P1 — Bloco Z sem cleanup explícito

Z.1 cria partner + tags na base teste pra validar sintaxe.
Se cair no meio, deixa lixo.

**Decisão para v2:** cada script de Z usa `try/finally` que apaga o
partner + tags criados. Adicionar comentário explicando.

### P2 — A.1 toca `mcp/lib/errors.ts` (arquivo compartilhado)

Outro agente pode estar mexendo.

**Decisão para v2:** task A.0: `git log -5 --oneline -- mcp/lib/errors.ts`
+ `ls docs/agents/active/`. Se houver atividade recente alheia ou outro
agente ativo declarando esse arquivo, pausar e coordenar.

### P3 — A.2 (mover `FIELDS_RES_PARTNER`) quebra imports em tests existentes

Pode existir `mcp/tools/crm/__tests__/res-partner-create.test.ts` que
importa o constante.

**Decisão para v2:** task A.2 explicita: `grep -r "FIELDS_RES_PARTNER"
mcp/`. Atualizar **todos** os imports antes de commitar a movimentação.

### P4 — A.7 toca `mcp/catalog/api-key-catalog.ts` (compartilhado)

Mesmo de P2: checar atividade recente + outros agentes.

**Decisão para v2:** check no início do Bloco A.

### P5 — B.1 não detalha `_skipSnapshotBefore` no Zod

**Decisão para v2:** input do `update` tem `_skipSnapshotBefore`
opcional boolean default false. Documentar com warning ("perde audit
de diff").

### P6 — Mapping de FK constraint para `OdooIntegrityError`

A v1 do plan diz "catch IntegrityError → ParceiroEmUsoError". Mas o
exato nome da exceção que o Odoo retorna em FK constraint não está
definido (pode ser `psycopg2.errors.ForeignKeyViolation` traduzido).

**Decisão para v2:** task B.3 antes do código: rodar um delete real
contra `teste_grupojht` num parceiro com FK (que tem pedidos atrelados)
e capturar o erro exato. Mapear no `mapOdooFault`. Só então
implementar o `ParceiroEmUsoError`.

### P7 — Padrão de mock do OdooClient

Verificar pattern existente em
`mcp/tools/crm/__tests__/res-partner-create.test.ts` antes de
implementar B.4. Manter consistência.

**Decisão para v2:** task B.4 inicia lendo o test existente.

### P8 — Ordem exata do `cadastrosTools` array

**Decisão para v2:** documentar a ordem final esperada do array
após esta onda (12 entradas):

```ts
export const cadastrosTools: ToolEntry[] = [
  // reads (alfabético):
  cadastroBuscarParceiro as ToolEntry,
  cadastroContarParceiros as ToolEntry,
  cadastroParceirosPorUf as ToolEntry,
  cadastrosServicoBuscar as ToolEntry,
  cadastrosServicoContar as ToolEntry,
  cadastrosServicoListar as ToolEntry,
  // writes (alfabético):
  cadastrosMailActivityComplete as unknown as ToolEntry,
  cadastrosMailActivityCreate as unknown as ToolEntry,
  cadastrosMailActivityUpdate as unknown as ToolEntry,
  cadastrosResPartnerArchive as unknown as ToolEntry,
  cadastrosResPartnerCategoryCreate as unknown as ToolEntry,
  cadastrosResPartnerCategorySetTags as unknown as ToolEntry,
  cadastrosResPartnerDelete as unknown as ToolEntry,
  cadastrosResPartnerUpdate as unknown as ToolEntry,
];
```

### P9 — C.1 (`category.create`) idempotência: search por name pode ser slow

Não bloqueador hoje (poucas categorias). Documentar como "best
effort" — sem garantia de não duplicar em caso de race extrema.

**Decisão para v2:** doc no campo `descricao` da tool: "Idempotente
por nome+parent_id (busca antes de criar; em caso de race extrema,
pode duplicar). Use `external_id` opcional via header
`X-External-Id` para garantia absoluta."

(O `external_id` via header não foi pedido na spec. Pode ser feature
futura. Documentar como "futuro".)

### P10 — D.1 (mail_activity.create) precisa de permissão para validar res_id

A busca `<res_model>.search([["id","=",res_id]])` usa o `OdooClient`
do worker (autenticado como `joaozanini`), não as credenciais da
API key do user externo. Permissão garantida.

**Decisão para v2:** documentar isso explicitamente no handler.
Quem chama a API JSON-RPC é sempre o write user (worker), não a chave
da Nexus API.

### P11 — D.3 complete: o que acontece com atividade já done?

Action_done numa activity que já estava done provavelmente é no-op
ou erro idempotente. Verificar empiricamente no Z.2 ou no E2E de D.

**Decisão para v2:** Z.2 estende para chamar action_done 2x no mesmo
id e documentar comportamento. Se erro, mapear; se silent no-op,
documentar.

### P12 — D.7 teste defesa interno: helper existente?

Verificar `mcp/__tests__/e2e/` para padrão de simular sessão interna.

**Decisão para v2:** task D.7 lê tests existentes (`coexist-modes.test.ts`
ou similar) antes de implementar.

### P13 — E.4 colapsável: BaseUI já tem componente?

O projeto usa BaseUI. Olhar `src/components/ui/` para `Tabs`,
`Collapsible`, `Disclosure`.

**Decisão para v2:** task E.1 (leitura integral) inclui inventário de
primitivos de UI disponíveis. E.4 reusa o que existe.

### P14 — F.1 (audit script) regex aceitável

OK, sem mudança.

### P15 — G.1 cada script com cleanup robusto

**Decisão para v2:** template padrão de script E2E:

```ts
try {
  const id = await action.create(...);
  try {
    // ... testes
  } finally {
    await action.delete(id); // cleanup garantido
  }
} catch (e) { console.error(e); process.exit(1); }
```

### P16 — H.1 build é caro

Manter como única passada no final do bloco.

### P17 — pre-commit hooks

**Decisão para v2:** task I.0: confirmar `husky` / `lint-staged` no
projeto. Não usar `--no-verify`. Se hook falhar, debugar.

### P18 — Confirmar que `ctx.odoo` é `clientFromEnv("write")`

Já confirmado em `crm.res_partner.create`. OK.

### P19 — Rollback via git revert OK

### P20 — `ir.model` é meta, sem problema de permissão. OK.

### P21 — Página doc usa server action — confirmado. OK.

### P22 — Teste Zod "update sem campos extra rejeita"

**Decisão para v2:** task B.4 inclui esse cenário explícito.

### P23 — Cleanup garantido em Z. Já em P1.

## Achados extras

### P24 — Logs estruturados nas write tools

Tools de escrita devem logar (não só audit DB):

- Tool ID
- User ID (anonimizado)
- Tempo de execução
- Outcome

**Decisão para v2:** o pipeline externo já loga via `recordAudit`. Não
duplicar.

### P25 — Documentação visual da onda

Após implementação, capturar screenshot da página doc com as 8 write
tools renderizadas e anexar ao PR.

**Decisão para v2:** task H.1 já cobre. Renforçar critério.

### P26 — Rate limiting das write tools

Write tools devem ter rate limit potencialmente mais agressivo que
reads. Verificar `mcp/lib/rate-limit.ts`.

**Decisão para v2:** task A.10: ler rate-limit.ts e confirmar que
write tools são rate-limitadas igual reads (mesmo bucket por user).
Se diferenciar, decidir multiplicador (ex: 0.5x do limite de read).
Default: igual.

## Resumo das mudanças para v2

| # | Mudança no plan |
|---|---|
| P1 | Cleanup try/finally em todo script Z e G |
| P2/P4 | A.0: check git+active dos arquivos shared |
| P3 | A.2 explicita grep+atualização de imports |
| P5 | B.1: `_skipSnapshotBefore` no input |
| P6 | B.3 começa com sonda empírica do FK error |
| P7 | B.4 começa lendo test existente |
| P8 | Ordem exata documentada do `cadastrosTools` |
| P9 | C.1 doc sobre race extrema |
| P10 | D.1 documenta que validação usa odoo client do worker |
| P11 | Z.2 estende para 2x action_done |
| P12 | D.7 lê tests internos antes |
| P13 | E.1 inventário de primitivos UI |
| P15 | Template padrão de script E2E |
| P17 | I.0: confirmar hooks |
| P22 | B.4 inclui teste Zod "sem campos" |
| P26 | A.10: rate limit checking |
