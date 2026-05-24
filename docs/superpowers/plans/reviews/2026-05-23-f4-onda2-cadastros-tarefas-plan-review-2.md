# Review Crítica #2 — PLAN v2 F4 Onda 2 Cadastros + Tarefas

> Auditoria adversarial mais profunda. Foco em integração, edge cases,
> observabilidade, manutenção.

## Achados materiais (Q-series)

### Q1 — Bloco Z assume base de teste online

**Decisão para v3:** Z.0 também faz `python3 -c "..."` chamando
`common.version` na base teste; se erro, abortar com mensagem clara.

### Q2 — A.9 e A.10 são leituras sem deliverable

**Decisão para v3:** transformar em check-list de PR. O agente
escreve no comentário do commit do bloco A: "A.9: linha X de
external-pipeline.ts confirma X. A.10: linha Y confirma Y."

### Q3 — Naming dos arquivos de fields

**Decisão para v3:** `partner-fields.ts`, `activity-fields.ts`,
`category-fields.ts`. Padrão singular do projeto (`partner-fields`,
não `partners-fields`).

### Q4 — Escape em build-tool-examples

`sampleInput` é serializado como JSON dentro de strings de exemplo
(curl, python, javascript). Caractere `'` em `sampleInput` quebra.

**Decisão para v3:** helper sempre faz `JSON.stringify(sampleInput,
null, 2)` e injeta dentro de backticks/aspas duplas (não single
quotes). Documentar no JSDoc.

### Q5 — Cache `resolveModelId` em memória + 1 worker — OK por enquanto

### Q6 — B.0 sonda FK pode quebrar se partner mudar

**Decisão para v3:** B.0 faz primeiro
`search([["customer", "=", true]], limit=10)` e tenta unlink em cada
até pegar um que dá FK error. Documenta qual id deu.

### Q7 — Fixtures helper para scripts E2E

**Decisão para v3:** criar `scripts/e2e/fixtures/cadastros-fixtures.ts`
com helpers:
- `createTestPartner(odoo, override): Promise<number>` — cria partner
  básico, retorna id.
- `cleanupTestPartner(odoo, id): Promise<void>` — apaga.
- `createTestActivity(odoo, partner_id, override): Promise<number>` —
  cria activity em partner.

Os scripts E2E usam essas helpers + try/finally.

### Q8 — `set_tags` mode=remove em tag não associada

Odoo é silent (no-op). **Decisão para v3:** documentar como
"idempotente"; sem erro.

### Q9 — `set_tags` mode=add com tag já associada

Idem: silent. Documentar.

### Q10 — `mail_activity.create` com `note` HTML

Risco de XSS na UI consumidora. **Decisão para v3:** o MCP NÃO
sanitiza HTML (passa direto pro Odoo). Documentar no `descricao` da
tool: "campo `note` aceita HTML; cliente deve sanitizar ao renderizar".

### Q11 — `mail_activity.update` deve excluir `res_model` e `res_id`

Atividade não muda de "dono".

**Decisão para v3:** Zod do update **omite** `res_model` e `res_id`.
Só permite mudar summary, note, date_deadline, user_id, activity_type_id.

### Q12 — `mail_activity.complete` em id já done

Depende de Z.2. **Decisão para v3:** plan reserva linha em Z.2 doc
e D.3 implementa o comportamento documentado (provavelmente: se já
done, retorna `{success: false, messageId: null}` em vez de erro).

### Q13 — Sensitive flag em delete

**Decisão para v3:** `cadastros.res_partner.delete` tem
`sensitive: true` na entry. Documentar.

Também `cadastros.res_partner.archive`? Reversível. Manter
`sensitive: false`.

### Q14 — Documentar destruturidade na descrição

**Decisão para v3:** doc nas descrições:

- `delete`: "Remove permanentemente. Irreversível. Use `archive` para
  desativar reversível."
- `set_tags` com mode=replace: "REPLACE substitui todas as tags
  atuais. Use `add` para apenas adicionar."

### Q15 — Capability matrix estrutura

**Decisão para v3:** task A.7 começa lendo o
`mcp/catalog/api-key-catalog.ts` completo (~200 linhas?) antes de
modificar. Manter estrutura.

### Q16 — `audit:tools` ignora paths

**Decisão para v3:** script ignora paths regex:
`/(scripts|__tests__|__mocks__|fixtures)/`. Documentar.

### Q17 — `getMcpCatalogSchema` server action

OK, confirmado.

### Q18 — Formato capability na UI

A serialização atual em `schema-endpoint.ts`:
`capability: ${entry.capability.module}.${entry.capability.action}`
→ string como `cadastros.update`. Convenção do projeto usa
`<action>:<module>`. Discrepância!

**Decisão para v3:** ajustar `schema-endpoint.ts` para serializar
como `${entry.capability.action}:${entry.capability.module}` para
casar com o resto do projeto (`update:cadastros`). Ou inverter no
front. Vou no serializer (1 só ponto). Atualizar teste do schema
endpoint.

### Q19 — Logging das write tools

Pipeline externo já loga via audit DB. Stdout? Não bloqueador.

### Q20 — tsc perf — OK

### Q21 — Jest workers + mocks

**Decisão para v3:** cada test file com `beforeEach` que reseta
mocks. Padrão jest.

### Q22 — Screenshot em `docs/screenshots/`

**Decisão para v3:** salvar como
`docs/screenshots/2026-05-23-mcp-doc-cadastros.png`.

### Q23 — Regression test — `jest mcp/` cobre. OK.

### Q24 — Serialização de erros tipados

**Decisão para v3:** após implementar os 5 erros novos, rodar o
external-pipeline test para confirmar que serialização para JSON-RPC
fault funciona. Adicionar teste se necessário.

### Q25 — addedInVersion=2 — OK

### Q26 — Helper buildExamples só pra tools novas — OK

### Q27 — Whatsapp/mobile prevalência

**Decisão para v3:** doc no campo `descricao` do update: "Se ambos
`whatsapp` e `mobile` forem passados, `whatsapp` prevalece (mapeado
para `mobile` no Odoo)."

### Q28 — Args mostrados na UI doc

A UI provavelmente exibe `inputSchemaKeys: string[]` (lista de
nomes). Para tipos/required, precisaríamos serializar mais. Não é
escopo desta onda. **Decisão para v3:** documentar como melhoria
futura. UI exibe apenas nomes hoje.

### Q29 — `res_model` validation

**Decisão para v3:** tool `mail_activity.create` aceita string livre
+ erro tipado se modelo não existir. Doc do `res_model`: "Nome do
modelo Odoo (ex: `res.partner`, `pedido.documento`). Se modelo não
existir, retorna `ModeloNaoSuportadoError`."

### Q30 — A.7 começa lendo api-key-catalog

Coberto em Q15.

## Achados extras (Q31+)

### Q31 — Documentação inline nas tools

Cada arquivo da tool no `mcp/tools/cadastros/` deve ter docstring no
topo explicando: (a) o que faz, (b) capability, (c) operação Odoo
subjacente. Padrão de `crm/res-partner-create.ts`.

**Decisão para v3:** task obrigatória por arquivo.

### Q32 — `archive` é sensitive=false mas merece warning

**Decisão para v3:** doc no `descricao`: "Reversível via update com
`active: true`."

### Q33 — Plan não menciona suporte a multi-tenant

Cada `ApiKey` tem `tenantId` (provavelmente). O `recordAudit` já
captura isso. Não bloqueador.

### Q34 — Plan reserva linha para erros do Odoo em Português

Mensagens do Odoo da Tauga vêm em pt-BR (`"O registro x não foi
encontrado"`). Quando mapeamos para nossas exceções, preservar
mensagem original em `message` e usar `code` invariante (snake_case
ASCII). Padrão existente.

**Decisão para v3:** documentar como convenção no comentário do
`mcp/lib/errors.ts`.

### Q35 — Plan reserva linha para verificação de migração de fields

A.2 move `FIELDS_RES_PARTNER`. Tem alias/re-export no arquivo
antigo pra dar grace period?

**Decisão para v3:** não. Migração hard (atualizar todos os imports
em 1 commit). Mais limpo. Coberto por `grep` em A.2.

## Resumo das mudanças para v3

| # | Mudança |
|---|---|
| Q1 | Z.0 inclui health-check da base teste |
| Q2 | A.9/A.10 viram checklist no commit |
| Q3 | Nomes singulares de arquivos |
| Q4 | buildExamples sempre JSON.stringify |
| Q6 | B.0 itera procurando partner com FK |
| Q7 | `scripts/e2e/fixtures/cadastros-fixtures.ts` |
| Q10 | Doc XSS nas tools que aceitam HTML |
| Q11 | `mail_activity.update` exclui res_model/res_id |
| Q12 | Z.2 + D.3 documentam comportamento de done dup |
| Q13 | `delete` é sensitive=true |
| Q14 | Doc destruturidade em descricao |
| Q15 | A.7 lê arquivo antes |
| Q16 | audit:tools ignora paths |
| Q18 | schema-endpoint serializa capability como `action:module` |
| Q21 | beforeEach reset mocks |
| Q22 | Screenshot em `docs/screenshots/` |
| Q24 | Confirmar serialização dos 5 erros novos |
| Q27 | Doc whatsapp prevalência |
| Q29 | Doc modelos suportados em mail_activity.create |
| Q31 | Docstring obrigatória por arquivo |
| Q32 | Doc reversibilidade do archive |
| Q34 | Convenção message pt-BR + code ASCII |

Pronto para PLAN v3 final.
