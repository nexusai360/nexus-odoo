# Review Crítica #2 — SPEC v2 F4 Onda 2 Cadastros + Tarefas

> Auditoria adversarial mais profunda sobre a v2. Achados geram a SPEC v3 (final).

## Achados materiais (B-series)

### B1 — Sintaxe Odoo de many2many em `set_tags` precisa ser validada empiricamente

A v2 propõe `[(4, id)]` para add, `[(3, id)]` para remove e
`[(6, 0, [ids])]` para replace. A sintaxe Odoo correta é uma **lista
de tuplas** dentro do campo m2m. Mas `[(4, id1), (4, id2)]` (várias
tuplas no array) precisa ser confirmado em runtime. **Risco**: se a
sintaxe correta for diferente, todas as 3 ações de `set_tags` quebram.

**Decisão para v3:** acrescentar **Bloco Z (zero)** no plan: um
microteste empírico (`scripts/e2e/teste-J-set-tags-syntax.py`) que
valida add/remove/replace antes mesmo do código de produção. Se a
sintaxe estiver errada, ajusta antes de qualquer implementação.

### B2 — `mail.activity.action_done` retorno

A v2 diz que retorna um `number` consistente. A verificação no Teste G
mostrou: chamada retornou `785`, que era id da `mail.message`
criada. Mas o método foi chamado com `[[id]]` (lista). Saída pode ser
`[id]` (lista) em algumas versões do Odoo, não `id` direto.

**Decisão para v3:** output schema mais robusto:
```ts
{success: true, messageId: number | number[] | null, completedAt: string}
```
E o handler normaliza: se `result` é list, pega primeiro; se int, usa.

### B3 — `update` deve exigir pelo menos 1 campo além do id

Sem isso, `write([id], {})` no Odoo é no-op (não atualiza nada). API
deveria rejeitar com mensagem clara.

**Decisão para v3:** `inputSchema.refine(v => Object.keys(v).length > 1)`.

### B4 — `res_partner_category.create` precisa de idempotência por conteúdo

Sem isso, retry de uma criação cria duplicate. A `Idempotency-Key`
do header já resolve dupla submissão da mesma chamada, mas se o
cliente esqueceu de mandar o header, duplica.

**Decisão para v3:** se input traz `external_id`, valida via
`ir.model.data` (mesmo padrão de `res_partner.create`). Se input traz
só `name`+`parent_id`, busca antes; se já existe, retorna esse id
sem erro (response field `created: false`).

### B5 — Snapshot antes (snapshotBefore) no update tem custo extra

Cada update vira: 1 read (snapshot before) + 1 write + 1 read
(snapshot after) = 3 round-trips JSON-RPC. Para um agente Nex que
chama muito, é overhead.

**Decisão para v3:** `snapshotBefore` é **default true** para
auditoria (regra do projeto: write tools auditadas). Adicionar campo
opcional `_skipSnapshotBefore: true` no input que pula a leitura
prévia. Documentar como "para uso em flows de alto volume; perde audit
de diff".

### B6 — Templates de exemplos (curl/n8n/python/javascript) repetitivos

Escrever 7 tools × 4 exemplos = 28 blocos hardcoded é repetitivo e
suscetível a erro.

**Decisão para v3:** criar helper
`mcp/lib/build-tool-examples.ts` que gera os 4 exemplos a partir de
`{toolId, sampleInput}`. Cada tool faz:
```ts
examples: buildExamples({ toolId: "cadastros.res_partner.update", sampleInput: {...} })
```
Isso garante consistência (header, formato JSON-RPC, idempotency-key,
auth) e reduz erro por copy-paste.

### B7 — Lista de campos do snapshot do partner

Não repetir 25 campos em 4 tools. Reaproveitar `FIELDS_RES_PARTNER`
do `res-partner-create.ts` movendo para `mcp/lib/fields/partner-fields.ts`.

**Decisão para v3:** módulo helper `mcp/lib/fields/` com
`PARTNER_SNAPSHOT_FIELDS`, `ACTIVITY_SNAPSHOT_FIELDS`,
`CATEGORY_SNAPSHOT_FIELDS`. Reusar em todas as tools que leem snapshot.

### B8 — `archive` com `hard=true` precisa do dispatcher checar 2 capabilities

A v2 diz "double-check: dispatcher vê `archive:cadastros` por padrão;
quando `hard=true` o handler exige `delete:cadastros` extra". Isso
quebra o modelo do dispatcher (que checa **uma** capability por tool).

**Decisão para v3:** dividir em **2 tools separadas**:

- `cadastros.res_partner.archive` (capability `archive:cadastros`) →
  soft delete (`active=false`).
- `cadastros.res_partner.delete` (capability `delete:cadastros`) →
  hard delete (`unlink` com guard de FK).

Cada uma tem capability própria. Modelo do dispatcher fica simples.
**Total de tools sobe de 7 para 8.**

### B9 — Ordem visual na UI doc (read antes de write?)

Spec v2 não decide. Olhando a screenshot, parece estar listado por
ordem alfabética (cadastro_buscar_parceiro, contar_parceiros, etc.).

**Decisão para v3:** dentro de cada módulo: **read primeiro, depois
write**, cada grupo em ordem alfabética. Reduz contraste cognitivo
ao ler a doc.

### B10 — `set_tags` capability granularidade

Decidi v2: tudo `update:cadastros`. Reavalio na v3: `replace` é
operação destrutiva (apaga as outras tags), faz sentido capability
separada `manage:cadastros` ou similar?

**Decisão para v3:** manter tudo em `update:cadastros`. Replace
destruturiza só category_id, não destrói o parceiro. Granularidade
extra não compensa complexidade. Documentar o risco no campo
`descricao` da tool.

### B11 — Auditoria de tools órfãs precisa exit code não-zero em CI

**Decisão para v3:** `scripts/audit-mcp-tools.ts` retorna exit code 0
se tudo OK, 1 se há órfãs. Adicionar ao package.json como
`pnpm audit:tools`. Não bloqueador em CI por enquanto (não tem CI
configurado para isso), mas dev pode rodar.

### B12 — Endpoint write requer pipeline externo — onde é checado?

`requiresExternalAuth` é flag, mas onde o dispatcher rejeita modo
interno? Olhar `mcp/dispatcher/check-mode.ts` antes de implementar
para não duplicar.

**Decisão para v3:** task #1 do plan: confirmar leitura do código de
auth/dispatch existente e mapear. Sem essa confirmação, tools podem
"funcionar" via interno por engano e a defesa não dispara.

### B13 — Snapshot completo do partner pode quebrar limite de payload

110 campos × tools de retorno = payload grande. `WriteToolEntry.outputSchema`
deve garantir cap. Já a `crm.res_partner.create` lê 14 campos via
`FIELDS_RES_PARTNER` — manter o cap.

**Decisão para v3:** lista canônica de 14-16 campos por entidade.
Não retornar binários (image_1920), one2many vazios, mensagens.

### B14 — Mover `FIELDS_RES_PARTNER` quebra import existente em `res-partner-create.ts`

Se mover para `mcp/lib/fields/partner-fields.ts`, atualizar o import
em `res-partner-create.ts` e em testes que o importam.

**Decisão para v3:** task explícita no plan para o re-export, com
checagem de imports.

### B15 — UI doc — wireframe da página com "Cadastros" cheia

A screenshot mostra "Cadastros: 6 de leitura, 0 de escrita". Pós-onda:
"Cadastros: 6 de leitura, 7 de escrita" (write tools + alfabético).
Vamos somar +7 itens à lista do módulo. Hierarquia visual já existe.
Não precisa redesign maior, só renderizar mais cards.

**Decisão para v3:** sem mudanças no header/agrupamento da página.
Foco em garantir que cada write tool renderize bem (badge + capability +
exemplos).

### B16 — Falta documentar quem chama `recordAudit`

Spec não menciona, mas write tools devem auditar TODA chamada
(success + erro). O pipeline externo (`mcp/dispatcher/external-pipeline.ts`)
já faz isso? Verificar antes.

**Decisão para v3:** task de leitura: confirmar que
`external-pipeline.ts` chama `recordAudit` em ambos sucesso e erro
para write tools. Se não, ajustar.

### B17 — Erros do `mail.activity` com `res_id` inválido

Se passar `res_id: 999999` (não existe), Odoo provavelmente cria a
atividade pendurada num registro inexistente (não valida FK em
runtime nesse modelo, é "soft" reference). Risco: atividades
órfãs.

**Decisão para v3:** handler de `mail_activity.create` faz
`<res_model>.search([["id","=",res_id]])` antes do create. Se não
encontrar, erro `RegistroNaoEncontradoError`. Custo: 1 round-trip
extra. Aceitável.

### B18 — `mail_activity.update` parcial vs replace

Mesma análise do `res.partner.update`: pelo menos 1 campo além de
`id` deve estar presente.

**Decisão para v3:** mesmo `refine`.

### B19 — Cache de `res_model_id` em memória vs Redis

V2 diz "cache em memória do processo". Mas o MCP roda em container
único hoje; em 2 workers, cada um teria seu cache. Não é problema
agora (1 worker em prod), mas em scale future, Redis seria melhor.

**Decisão para v3:** Map em memória do processo, TTL 1h. Doc avisa
que em multi-worker futuro pode virar Redis. Simples agora.

### B20 — Conferir que tools de escrita NÃO aparecem para o agente Nex (modo interno)

Já checada na implementação atual de `crm.res_partner.create`. Mas
spec deveria pedir teste explícito.

**Decisão para v3:** task adicional: rodar teste E2E "agente Nex
tenta chamar `cadastros.mail_activity.create` → 403
`forbidden_via_internal_auth`".

### B21 — Tamanho do PR final

7 tools + helpers + UI doc + tests + e2e + audit script. Estimativa:
20-30 arquivos novos/modificados, ~3000 linhas adicionadas. Aceitável
para um PR único, mas dividir em commits atômicos por bloco do plan.

**Decisão para v3:** commits atômicos por bloco. Single PR ao final.

## Resumo das mudanças para v3

| # | Mudança |
|---|---|
| B1 | Bloco Z no plan: testar sintaxe Odoo m2m antes do código |
| B2 | Output `complete` aceita number ou array, normaliza |
| B3 | `update` exige ≥ 1 campo além de id |
| B4 | `category.create` idempotência por nome/external_id |
| B5 | `_skipSnapshotBefore` opcional no update |
| B6 | Helper `build-tool-examples.ts` para gerar os 4 exemplos |
| B7 | Helper `mcp/lib/fields/*` para listas canônicas |
| B8 | Dividir `archive`/`delete` em 2 tools com capabilities separadas → 8 tools totais |
| B9 | UI doc: read antes de write, alfabético dentro |
| B10 | `set_tags` mantém tudo em `update:cadastros` |
| B11 | `audit-mcp-tools.ts` com exit code |
| B12 | Confirmar enforcement de `requiresExternalAuth` antes de implementar |
| B13 | Lista canônica de ~14-16 campos por entidade |
| B14 | Mover `FIELDS_RES_PARTNER` com atualização de imports |
| B15 | UI doc sem redesign, só renderizar +7 cards |
| B16 | Confirmar `recordAudit` no external-pipeline para write tools |
| B17 | `mail_activity.create` valida `res_id` antes |
| B18 | `mail_activity.update` exige ≥ 1 campo além de id |
| B19 | Cache `res_model_id` em memória, TTL 1h |
| B20 | Teste explícito: write tool 403 no modo interno |
| B21 | Commits atômicos por bloco, PR único |

**Lista final de tools (8 write tools novas):**

1. `cadastros.res_partner.update`
2. `cadastros.res_partner.archive` (soft)
3. `cadastros.res_partner.delete` (hard)
4. `cadastros.res_partner_category.create`
5. `cadastros.res_partner_category.set_tags`
6. `cadastros.mail_activity.create`
7. `cadastros.mail_activity.update`
8. `cadastros.mail_activity.complete`
