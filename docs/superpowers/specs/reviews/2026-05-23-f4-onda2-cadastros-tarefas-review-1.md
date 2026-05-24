# Review Crítica #1 — SPEC v1 F4 Onda 2 Cadastros + Tarefas

> Auditoria adversarial. Achados materiais geram a SPEC v2.

## Achados materiais

### A1 — Renomeação `crm.res_partner.create` → `cadastros.res_partner.create` sem inventário de dependências

A spec assume "ambiente dev/teste, ninguém usa em prod ainda". Não verifiquei:

- Hay tests que importam `crmResPartnerCreate` por nome?
- Há referências em docs do user-facing (curl examples, n8n templates) que mencionam o id antigo?
- Há ApiKey real no banco com `create:crm` em capabilities?

**Decisão para v2:** **NÃO renomear nesta onda.** Adicionar as 8 tools
novas em `cadastros` E manter `crm.res_partner.create` como alias
(deprecated) por enquanto. Renomeação fica para Onda 2.1 dedicada,
com inventário e migration de capabilities. Risco evitado por custo
mínimo.

Consequência: o módulo `crm` no MCP **continua existindo** com 2
tools (get, create), e o módulo `cadastros` ganha 8 tools novas (todas
write — pois reads já existem). Total: 6 reads + 8 writes em cadastros,
2 tools em crm = mesma estrutura, mais write tools no lugar certo.

### A2 — `transition` vs `update` é definição confusa para parceiro

Em CRM clássico, "transition" implica state machine. Aqui o
`res.partner.transition` mexe em `active`/`customer`/`supplier`, que
são apenas flags boolean. Risco: confusão com `update` que aceita
qualquer campo.

**Decisão para v2:** **eliminar `res_partner.transition`** e jogar
todos os 4 booleanos (`active`, `customer`, `supplier`, `employee`) no
`update`. Capability fica simples: só `update:cadastros`. Reduz
superfície de erro e tools.

Resultado: -1 tool. Lista final = **7 write tools novas** + crm.res_partner.create
mantido = 8 write tools no total no projeto.

### A3 — `res_partner_category.attach` com sintaxe replace mata as tags existentes

Spec usa `category_id: [(6, 0, [ids])]` que SUBSTITUI todas. Se o
usuário chama "adicionar tag X" a um parceiro com tags A, B, ele perde
A e B.

**Decisão para v2:** **3 ações distintas** em `attach`, controladas
por campo `mode`:

- `mode: "add"` → `[(4, id)]` por id (default).
- `mode: "remove"` → `[(3, id)]` por id.
- `mode: "replace"` → `[(6, 0, [ids])]` (a sintaxe atual).

Renomear a tool: `cadastros.res_partner_category.set_tags` (mais
honesto que "attach"). Input: `partner_id`, `category_ids` (lista de
int), `mode` (selection).

### A4 — `res.partner.delete` é hard delete, sem alternativa de soft

Risco real de perda de dado. Em CRM moderno, soft delete via
`active=False` é o padrão.

**Decisão para v2:** **renomear `delete` → `archive`** e por padrão
fazer `write({active: false})`. Adicionar parâmetro opcional
`hard: false` (default) → `unlink` real só se `hard: true` e o
parceiro não tem FK em uso. Capability: `archive:cadastros` (soft) e
`delete:cadastros` (hard). Defaults seguros.

### A5 — WhatsApp não é campo dedicado mas o usuário pediu explicitamente

Spec diz "Mobile serve como WhatsApp". OK pra dado físico, mas a
**API do MCP** deveria aceitar `whatsapp` como sinônimo de `mobile`
para deixar claro ao agente Nex / n8n / quem consumir.

**Decisão para v2:** input Zod aceita `whatsapp` como alias de
`mobile`. Mapeia internamente para o campo `mobile` do Odoo. Documenta
a equivalência. Se ambos forem passados, `whatsapp` prevalece (mais
específico).

### A6 — Tarefa atrelada via `res_model` string requer resolver `res_model_id` (FK para ir.model)

Spec passa string `"res.partner"` mas o Odoo precisa de int em
`res_model_id`. Resolver via search em `ir.model` em todo create =
overhead.

**Decisão para v2:** o handler de `mail_activity.create` mantém o
campo `res_model: string` no input, mas resolve **uma vez** o
`res_model_id` por chamada (com cache opcional via Redis pra evitar
roundtrip). Documenta os 4-5 modelos esperados (`res.partner`,
`pedido.documento`, `crm.pipeline`, etc.).

### A7 — `mail_activity.complete` retorna o id da `mail.message` gerada — não é "best effort"

Spec sugere "wrappear com try/catch". Errado. `action_done` retorna
um `int` (id da `mail.message`) consistentemente. Vai como
`messageId` no output.

**Decisão para v2:** output schema:
`{success: boolean, messageId: number|null, completedAt: string}`.

### A8 — Inventário de tools sem critério de ação

Spec diz "verificar se há tools órfãs" mas não diz o que fazer. Já
fiz a auditoria manual: o `caminho3/` tem 4 arquivos mas só 2 são
tools (`registrar-lacuna.ts` e `bi-consulta-avancada.ts`); os outros
(`sql-guard.ts`, `bi-pool.ts`) são helpers. Mesmo padrão em outras
pastas: cada arquivo de tool tem export que vira `ToolEntry`,
helpers ficam sem export.

**Decisão para v2:** auditoria reduzida a **uma checagem programática**
em CI/script: cada arquivo `.ts` em `mcp/tools/<dom>/` (não `index.ts`,
não `*.test.ts`) deve exportar um símbolo que casa com
`ToolEntry | WriteToolEntry`. Se não casar, é helper documentado em
comentário no topo. Script: `scripts/audit-mcp-tools.ts`. Reporta
órfãs (arquivos com export ToolEntry mas não registrado no `index.ts`).

### A9 — UI doc no React precisa de wireframe explícito do write tool

A doc atual (mostrada nas screenshots) já tem badge "ESCRITA" violeta.
Mas não vi se ela:

- Mostra capability necessária (ex: "Requer capability `update:cadastros`")
- Mostra warning sobre `requiresExternalAuth` (write não roda via
  agente Nex, só via API key externa).
- Tem ícone de cadeado nos sensitive.

**Decisão para v2:** wireframe textual da página doc:

```
[ESCRITA] cadastros.res_partner.update
  Descricao: Atualiza um parceiro existente.
  Capability necessaria: update:cadastros
  Auth: REQUER API key externa (nao acessivel via agente Nex)
  Sensivel: nao

  Argumentos: [colapsavel]
    id*: numero, id do parceiro
    name?: string, novo nome
    ...

  Exemplos: [colapsavel por linguagem]
    [curl] [n8n] [python] [javascript]
```

### A10 — Versão da API (`addedInVersion`) sem origem documentada

A spec diz `addedInVersion: 2`. Por quê 2? A versão 1 é a F4 Onda 1
leitura (já em prod)? Não temos doc sobre versionamento.

**Decisão para v2:** documentar a convenção: `1` = read tools
originais (F4 leitura), `2` = primeiras write tools (esta onda).
Próximos incrementos só quando houver breaking change ou expansão
declarada. Registrar em `mcp/catalog/types.ts` como JSDoc.

### A11 — Erros tipados não inventariados

Spec menciona `ParceiroEmUsoError` mas não diz se existe ou onde criar.

**Decisão para v2:** todos os erros novos em `mcp/lib/errors.ts`
seguindo padrão existente (extends `Error`, code snake_case ASCII).
Erros previstos:

- `ParceiroEmUsoError` (FK constraint no unlink)
- `CategoriaJaExisteError` (duplicate name em res.partner.category)
- `AtividadeNaoEncontradaError` (update/complete em id inexistente)
- `ModeloNaoSuportadoError` (res_model passado não é registrado)

### A12 — Mover arquivos requer atualizar imports — inventário ausente

Mesmo cancelando A1, ainda há criação de novos arquivos. Para evitar
falhas de import, todo arquivo novo deve ser **adicionado**
explicitamente ao `index.ts` do módulo. Critério de aceite: o teste
de integração `mcp/__tests__/integration.test.ts` (citado no
`catalog/index.ts`) deve passar.

**Decisão para v2:** adicionar critério explícito de aceite.

### A13 — Tests com cobertura indefinida

**Decisão para v2:** por tool:

- 1 teste unit por handler (mock OdooClient): success + 1 erro
  esperado mínimo.
- 1 teste de validação Zod (input inválido rejeitado).
- 1 script e2e real (skipped sem ODOO_WRITE_*) cobrindo create →
  update → cleanup (ou variação por tool).

Sem percentual de cobertura. Foco em cenários.

## Resumo das mudanças para v2

- A1: NÃO renomear `crm.res_partner.create`. Manter como está.
- A2: eliminar `res_partner.transition` (juntar com update).
- A3: tool de tags vira `set_tags` com `mode` add/remove/replace.
- A4: `delete` vira `archive` (soft, default) + `hard` opcional.
- A5: `whatsapp` como alias de `mobile`.
- A6: documentar resolução de `res_model_id` (com cache).
- A7: output de `complete` retorna `messageId`.
- A8: auditoria programática via `scripts/audit-mcp-tools.ts`.
- A9: wireframe da UI doc por write tool.
- A10: documentar convenção de `addedInVersion`.
- A11: lista explícita de erros novos em `mcp/lib/errors.ts`.
- A12: critério explícito = teste de integração passa.
- A13: spec de tests por tool.

**Lista final de tools dessa onda (após reviews):**

1. `cadastros.res_partner.update` — write
2. `cadastros.res_partner.archive` — write (soft + hard opt)
3. `cadastros.res_partner_category.create` — write
4. `cadastros.res_partner_category.set_tags` — write (add/remove/replace)
5. `cadastros.mail_activity.create` — write
6. `cadastros.mail_activity.update` — write
7. `cadastros.mail_activity.complete` — write

**7 tools novas.** A `crm.res_partner.create` continua sendo a única
tool de criação de parceiro nesta onda (não vamos duplicar com
`cadastros.res_partner.create`).
