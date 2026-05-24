# SPEC v1 — F4 Onda 2 (escrita): Cadastros + Tarefas

> Data: 2026-05-23. Primeira versão. Vai passar por 2 reviews críticas
> (v2, v3) antes do plan.

## 1. Contexto

A spec mãe da F4 Onda 2 (`docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md`)
assumiu modelos Odoo padrão (`crm.lead`, `sale.order`, etc.) que **não
existem** no Odoo da Tauga (laudo `docs/laudo-f4-onda2-realidade-tauga.md`).
A bateria empírica posterior (laudos
`docs/laudo-f4-onda2-escrita-via-api-direta.md` e
`docs/laudo-f4-onda2-crm-cadastros-tarefas.md`) provou:

- `res.partner` e `mail.activity` (modelos padrão Odoo) escrevem 100% via
  API JSON-RPC oficial, sem depender de `tauga_api_post`.
- `pedido.documento` (custom Tauga) cria mas fica em rascunho (sem
  número, sem totais).
- CRM kanban com cards arrastáveis **não existe nativamente** no Odoo
  da Tauga (mas o usuário vai investigar mais a fundo; ele tem dúvida
  sobre se eu encontrei tudo).

O usuário pediu para começar agora pela parte 100% destravada.

## 2. Objetivo

Entregar as primeiras write tools de produção do MCP cobrindo:

1. **Cadastro de parceiros (clientes/fornecedores)** com todos os campos
   relevantes da Tauga (24+ campos validados E2E).
2. **Tags de parceiros** (criar nova tag, associar ao parceiro).
3. **Tarefas atreladas a parceiros (ou outros records)** com
   responsável, prazo, tipo e observação.

Mais a auditoria + ampliação da página de documentação do servidor MCP
(`/integracoes/servidor-mcp/docs`) para refletir as novas tools e
melhorar a apresentação visual de read x write.

## 3. Escopo

### 3.1. Dentro

**Write tools novas (8):**

| ID | Módulo | Ação | Modelo Odoo |
|---|---|---|---|
| `cadastros.res_partner.update` | cadastros | update | `res.partner` |
| `cadastros.res_partner.transition` | cadastros | transition | `res.partner` |
| `cadastros.res_partner.delete` | cadastros | delete | `res.partner` |
| `cadastros.res_partner_category.create` | cadastros | create | `res.partner.category` |
| `cadastros.res_partner_category.attach` | cadastros | update | `res.partner` (write em `category_id`) |
| `cadastros.mail_activity.create` | cadastros | create | `mail.activity` |
| `cadastros.mail_activity.update` | cadastros | update | `mail.activity` |
| `cadastros.mail_activity.complete` | cadastros | transition | `mail.activity` (action_done) |

A tool existente `crm.res_partner.create` será **movida para o módulo
`cadastros`** e renomeada como `cadastros.res_partner.create` (CRM como
módulo perde sentido enquanto não houver CRM kanban próprio; ver §6
"Decisões").

### 3.2. Para a UI de documentação

- Auditoria do inventário de leitura: confirmar 48 tools na doc vs
  ~50 arquivos no `mcp/tools/**`. Levantar se há tool implementada mas
  não exportada no `index.ts` do módulo.
- Renomear/revisar `module="crm"` para `module="cadastros"` no
  `crm.res_partner.create`.
- Atualizar o componente `McpDocsContent` (ou criar variante) para:
  - Cor visual diferente para write (já vi badge "ESCRITA" violeta na
    screenshot — manter).
  - Mostrar nas tools write o **capability necessário**.
  - Mostrar exemplos de uso (curl/n8n/python/javascript) — padrão da
    `WriteToolEntry.examples` existente.
- Verificar se a contagem "X de leitura, Y de escrita" por módulo é
  derivada do catálogo (já é, segundo `schema-endpoint.ts`).

### 3.3. Fora

- Pipelines/cards/etapas de CRM (usuário disse explicitamente para não
  implementar — vai investigar com a Tauga).
- `pedido.documento` (depende do `tauga_api_post` para ciclo completo).
- Modelos custom Tauga (`sped.*`, `finan.*`, `contabil.*`, `estoque.*`)
  para escrita — Onda 3+.
- Mudanças no pipeline de auth/dispatcher (já existem e funcionam para
  `crm.res_partner.create`).

## 4. Critérios de aceite

1. As 8 write tools novas + a renomeada compõem 9 write tools de cadastros.
2. Cada tool tem: `id`, `operation: "write"`, `module: "cadastros"`,
   `descricao`, `capability`, `inputSchemaShape`, `inputSchema` (Zod),
   `outputSchema`, `odooModel`, `affectsModels`, `eventName`,
   `requiresExternalAuth: true`, `addedInVersion: 2`, `examples` (curl,
   n8n, python, javascript).
3. Cada tool tem teste **unit** (handler com mocks de OdooClient) e
   **e2e real** (script `scripts/e2e/test-cadastros-*.ts` rodando contra
   `teste_grupojht`).
4. O catálogo (`mcp/catalog/index.ts`) registra as novas tools no
   `cadastrosTools`.
5. A capability matrix (`mcp/catalog/api-key-catalog.ts`) cobre
   `create:cadastros`, `update:cadastros`, `delete:cadastros`,
   `transition:cadastros`.
6. A página `/integracoes/servidor-mcp/docs` renderiza as 9 write tools
   no módulo "Cadastros" com badge "ESCRITA", capability necessária e
   exemplos colapsáveis. Read tools mantidas.
7. `tsc --noEmit` + `eslint` + `jest` + `next build` verdes.

## 5. Notas de implementação

### 5.1. Renaming `crm.res_partner.create` → `cadastros.res_partner.create`

A tool atual está em `mcp/tools/crm/res-partner-create.ts`. Vai ser
**movida** para `mcp/tools/cadastros/res-partner-create.ts`, com:

- `id` mudando de `crm.res_partner.create` para `cadastros.res_partner.create`.
- `module` mudando de `crm` para `cadastros`.
- `capability` mudando de `{module: "crm", action: "create"}` para
  `{module: "cadastros", action: "create"}`.
- `eventName` mudando de `crm.res_partner.created` para
  `cadastros.res_partner.created`.

**Risco de break:** se alguma `ApiKey` em uso já tem `create:crm` no
`capabilities`, a tool nova não vai abrir para ela. Mitigação: o
ambiente é dev/teste, ninguém usa API key real. **OK seguir.**

A tool `crm.res_partner.get` (read) também passa para `cadastros`?
**Sim**: a única razão de existir o módulo "crm" no MCP era abrigar
essas 2. Sem elas, o módulo morre. Vou mover o `get` também.

O módulo `crm` no `mcp/tools/` será removido (sem registros no
`catalogo`).

### 5.2. Campos do `res.partner` na update/transition

- Update: aceita os 23 campos editáveis canônicos validados no Teste
  F2 (laudo). Zod schema com todos opcionais.
- Transition: campos boolean canônicos para mudança de estado:
  `active`, `customer`, `supplier`, `employee`.
- Delete: exige só o `id`. Trata FK error (parceiro com docs em uso)
  com erro tipado.

### 5.3. Tags (`res.partner.category`)

- `res_partner_category.create`: cria nova categoria com `name` e
  opcional `color`, `parent_id`.
- `res_partner_category.attach`: associa uma ou várias categorias a um
  parceiro via `write({category_id: [(6, 0, [ids])]})`.

### 5.4. Tarefas (`mail.activity`)

- `mail_activity.create`: cria atividade em qualquer record (não só
  parceiro). Input: `res_model` (string, ex: `res.partner`), `res_id`
  (int), `summary` (string), `note` (string opcional, HTML), `date_deadline`
  (date), `user_id` (int, responsável), `activity_type_id` (int).
- `mail_activity.update`: muda `summary`, `note`, `date_deadline`,
  `user_id`, `activity_type_id`.
- `mail_activity.complete`: chama `action_done(ids)` na atividade.

### 5.5. UI de documentação

- O componente `McpDocsContent` (1229 linhas) já é estruturado em
  seções. Vou ler ele inteiro e:
  - Garantir que `operation === "write"` aparece com badge violeta
    "ESCRITA" e ícone distinto (a screenshot mostra que já tem).
  - Adicionar bloco "Capability necessária" quando `capability` for
    não-nulo.
  - Renderizar `examples` em collapsible com syntax highlight.
- Verificar se há tools-órfãs (implementadas mas não no `index.ts` do
  módulo, ou no `index.ts` mas não no `catalogo`).

## 6. Decisões

1. **Módulo `crm` deixa de existir no MCP.** As 2 tools que estavam lá
   migram para `cadastros`. Quando o usuário investigar o CRM de
   verdade da Tauga, criamos um módulo novo (`crm.pipeline`,
   `crm.negocio`, etc.) sem amarra.
2. **Sem migration de DB** nesta onda. As capabilities são strings em
   array JSON da `ApiKey.capabilities`, não tabela.
3. **Idempotency** via `Idempotency-Key` (já implementado no pipeline
   externo) e `external_id` opcional (já implementado em `res_partner.create`).
   Mesmo padrão para as novas.

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Renomeação quebra alguma API key existente | Ambiente dev/teste, ninguém usa em prod ainda |
| `mail.activity.action_done` retorna formato variável | Wrappear com try/catch + log; documentar resposta como "best effort" |
| `res.partner.delete` falha por FK constraint | Capturar `IntegrityError` do Odoo e retornar erro tipado `ParceiroEmUsoError` |
| UI de documentação tem regressão visual | `pnpm dev` + screenshot manual antes do commit final |
| Inventário de read tools tem órfãs | Auditar 1 a 1 via script (`scripts/audit-tools.ts`) |

## 8. Próximos passos

Esta v1 vai para review crítica adversarial. Achados materiais geram
v2; nova review adversarial gera v3, que vai para o plan.
