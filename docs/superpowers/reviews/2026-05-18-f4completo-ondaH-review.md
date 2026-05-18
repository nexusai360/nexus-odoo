# Review — F4 completo, Onda H (Caminho 3c funcional)

**Data:** 2026-05-18
**Branch:** `feat/mcp-dominios-completos`
**Commits revisados:** `667d7ed`, `f57500a`, `2b8e48e`, `75fe5e7`, `96b288f`, `179b632`, `b2549e7`, `99f266d`, `98567a3`, `ab541f7`
**Escopo:** conformidade com o plano (Onda H, tasks H.1–H.9) e SPEC v3 §3.7/§3.8; segurança do executor de SQL do 3c.
**Tipo:** review adversarial — o 3c executa SQL, rigor máximo.

---

## Veredito

**APROVADO COM RESSALVAS.** A Onda H está funcionalmente correta, a defesa-em-profundidade do 3c
(role read-only + guard AST + pool fail-safe + statement_timeout) é sólida, e a verificação
automatizada está 100% verde. Porém há **um achado CRÍTICO** que invalida a camada 7 do RBAC
(audit) — decisão canônica — e que **não é exclusivo da Onda H: afeta todas as 33 tools da F4**.
A fase não pode ir para produção sem corrigir esse achado.

| Severidade | Quantidade |
|---|---|
| CRÍTICO   | 1 |
| IMPORTANTE | 3 |
| MENOR     | 4 |

---

## CRÍTICO

### C-1 — Gravação de audit falha silenciosamente sob o role restrito (audit log quebrado)

**Confirmado. É bug real. Severidade: CRÍTICO.**

`mcp/lib/audit.ts` grava o audit com:

```ts
await prisma.mcpAuditLog.create({ data: { ... } });
```

`prisma.<model>.create()` no Prisma **sempre retorna o registro criado**. Com o driver
PostgreSQL (`@prisma/adapter-pg` v7), isso é traduzido para um
`INSERT INTO mcp_audit_log (...) VALUES (...) RETURNING id, user_id, tool, params, outcome,
row_count, duration_ms, criado_em`. A cláusula `RETURNING` exige privilégio **`SELECT`** nas
colunas retornadas.

O role `nexus_mcp` (`prisma/sql/2026-05-17-mcp-role.sql`, passo 8) executa explicitamente:

```sql
EXECUTE 'REVOKE SELECT ON mcp_audit_log FROM nexus_mcp';
```

Resultado: **todo `INSERT` em `mcp_audit_log` falha** com `permission denied for table
mcp_audit_log` em produção, porque o `RETURNING` não tem `SELECT`.

A falha é **engolida silenciosamente** — `auditSafe` em `mcp/server.ts` (linhas ~93–109)
captura qualquer exceção do `record` num `catch {}` que só faz `console.error`. O usuário
recebe a resposta normalmente; **nenhuma linha de audit é gravada**. A camada 7 do RBAC
(audit) — decisão canônica `CLAUDE.md §5.6` — fica **inoperante e a falha é invisível**.

**Alcance — NÃO é só o 3c.** O caminho `recordAudit` → `mcpAuditLog.create` é o pipeline
de audit de **todas as 33 tools** da F4 (a Onda 1 incluída). O `bi_consulta_avancada` do 3c
apenas herda o mesmo pipeline. O concern do implementador está correto e a abrangência é
ainda maior do que ele relatou.

**Segundo site afetado — `feature_requests` (Caminho 3a).** `mcp/tools/caminho3/registrar-lacuna.ts`
faz `ctx.prisma.featureRequest.create({ ... })`. O role `nexus_mcp` tem `GRANT INSERT ON
feature_requests` mas **não tem `SELECT`** — e `create()` também emite `RETURNING`. Logo a
tool `registrar_lacuna` (Caminho 3a) **também falha** sob o role restrito. Diferente do audit,
aqui a exceção **não** é engolida: ela sobe pelo handler, vira `outcome="error"` e o usuário
recebe erro — mas o `feature_requests` (gap logging, decisão canônica §5.5 item 3a) nunca é
gravado.

**Por que os testes passam (827 verdes) mesmo assim.** Os testes unitários mockam o Prisma
(`ctx = { prisma: {} as never }`) e os testes de integração usam um `record` mockado ou um
banco com o usuário `nexus` (superusuário), não o role `nexus_mcp` restrito. O bug só aparece
**em runtime de produção com o role real** — exatamente o cenário que o E2E da H.9 Step 4
deveria exercer, mas que (pelos commits) não foi executado contra o role restrito de fato,
ou foi executado e o `catch {}` mascarou a falha do audit.

**Correção recomendada (preferida): suprimir o `RETURNING`.**

Trocar `create()` por `createMany()`, que com o adapter-pg emite um `INSERT` **sem
`RETURNING`** (retorna apenas `{ count }`). É a correção de menor privilégio — mantém o
princípio "o MCP grava mas não lê seu próprio log" intacto.

- `mcp/lib/audit.ts`:
  ```ts
  await prisma.mcpAuditLog.createMany({ data: [{ ...campos }] });
  ```
- `mcp/tools/caminho3/registrar-lacuna.ts`:
  ```ts
  await ctx.prisma.featureRequest.createMany({ data: [{ ...campos }] });
  ```
  (a tool descarta o retorno — só usa `{ registrado: true }`, então `createMany` é drop-in).

**Correção alternativa (rejeitada): `GRANT SELECT ON mcp_audit_log / feature_requests`.**
Funciona, mas **viola o menor privilégio** e contradiz o comentário explícito do próprio
script (`-- SEM SELECT em mcp_audit_log (o MCP grava mas não lê seu próprio log via SQL)`).
Pior: daria ao 3c (`bi_consulta_avancada`) a capacidade de ler o `mcp_audit_log` inteiro via
SQL livre — vazamento de toda a trilha de auditoria de todos os usuários para qualquer
admin que use o modo BI. **Não adotar.**

**Ação obrigatória adicional:** o `catch {}` de `auditSafe` mascarou um bug crítico por toda
a F4. Manter o fail-safe (audit não deve derrubar a resposta), mas o `console.error` deve ser
um log estruturado de severidade alta / alerta, para que uma falha sistemática de audit seja
detectável em produção, não silenciosa.

---

## IMPORTANTE

### I-1 — H.9 Step 4 (E2E contra o role real) não tem evidência de execução

O plano exige na H.9 Step 4 subir o MCP com `MCP_BI_DATABASE_URL` do role `nexus_mcp_bi` e
exercer `bi_consulta_avancada` contra o cache real, **confirmando inclusive que o audit gravou
em `McpAuditLog`**. Não há, nos commits nem em arquivo de verificação, registro do resultado
desse E2E. Se tivesse sido executado de fato contra o role restrito, o achado C-1 teria sido
detectado na própria H.9 (a confirmação do audit falharia). A ausência de evidência do E2E é
o que permitiu C-1 escapar. **A H.9 Step 4 e Step 5 precisam ser executadas de verdade após
a correção de C-1, com evidência registrada.**

### I-2 — `sql-guard` não rejeita `SELECT ... FOR UPDATE` (e similares de lock)

`validarSqlSelect` aprova qualquer nó-raiz `SelectStmt`. Um `SELECT ... FOR UPDATE` /
`FOR SHARE` é um `SelectStmt` (com `lockingClause`) e adquire lock de linha — semântica de
escrita. Hoje ele é barrado **apenas** pelo `default_transaction_read_only = on` do pool
(que rejeita `FOR UPDATE` em transação read-only) e pelo role sem `UPDATE`. Ou seja: a
defesa existe, mas mora 100% nas camadas de baixo — a verificação AST, que é justamente a
"defesa-em-profundidade determinística" (achado N1 da SPEC), tem um furo. Recomendado:
rejeitar explicitamente `SelectStmt` com `lockingClause` presente, junto do `intoClause`.
Não é CRÍTICO porque há duas camadas abaixo que cobrem, mas contradiz o propósito do guard.

### I-3 — Wrap `SELECT * FROM (<sql>) AS _bi_subquery LIMIT n` quebra queries legítimas

O handler envelopa o SQL do agente como subquery. Isso falha para entradas válidas e
SELECT-puras:

- `WITH x AS (...) SELECT ...` — CTE no topo: `SELECT * FROM (WITH ... SELECT ...) AS _bi...`
  é válido em Postgres moderno, mas o guard explicitamente aprova `WITH...SELECT` como caso
  de sucesso (H.6 Step 1) — então a tool promete suportar CTE e o wrap precisa de fato
  funcionar para todos os casos de CTE (inclusive `WITH ... DELETE`/`INSERT` em CTE, que o
  guard hoje aprova porque o nó-raiz ainda é `SelectStmt` se o statement final for SELECT —
  ver nota abaixo).
- Uma query do agente que **já** termina com `LIMIT`/`OFFSET` ou `ORDER BY` funciona dentro
  da subquery, mas `SELECT ... ; ` (com ponto-e-vírgula final) quebra o wrap. O guard rejeita
  multi-statement, mas um `;` final solitário pode passar como statement único — convém
  normalizar (trim do `;`) antes do wrap.

**Sub-achado relevante para C-1/segurança:** o guard valida o **nó-raiz**. Uma query
`WITH w AS (DELETE FROM fato_pedido RETURNING *) SELECT * FROM w` tem nó-raiz `SelectStmt`
mas contém um `DELETE` data-modifying CTE. O guard a **aprovaria**. Hoje isso é barrado pelo
role sem `DELETE` e pelo `read_only`, mas é outro furo do guard AST — recomendado rejeitar
CTEs com `ctename` cujo statement seja `DeleteStmt`/`InsertStmt`/`UpdateStmt` (inspecionar
`withClause.ctes[].ctequery`). Severidade IMPORTANTE pelo mesmo motivo de I-2: as camadas
de baixo cobrem, mas o guard tem furo.

---

## MENOR

### M-1 — `pgsql-parser` `loadModule()` não é chamado no caminho de produção

`mcp/SDK-NOTES.md` afirma que `loadModule()` deve ser chamado uma vez no startup, mas que
`sql-guard.ts` "não requer `loadModule` antes do import" porque só chama `parse` dentro da
função. Os testes chamam `loadModule()` em `beforeAll`. Em produção, ninguém chama
`loadModule()` — a primeira chamada a `parse()` arca com a inicialização do WASM (latência
extra na primeira consulta 3c, ou erro se a versão exigir init explícito). Recomendado: ou
chamar `loadModule()` no boot do servidor MCP, ou confirmar e documentar que `parse()` da
v17.9.15 auto-inicializa. Hoje é uma suposição não verificada em runtime real.

### M-2 — Pool 3c sem `max` de conexões nem tratamento de `pool.on("error")`

`bi-pool.ts` cria `new Pool({ connectionString })` sem `max` (default 10) e sem handler
`pool.on("error", ...)`. Um erro de um cliente idle do pool (ex.: conexão derrubada pelo
servidor) emite `error` no pool; sem handler, no `pg` isso pode derrubar o processo Node.
O 3c é gated a admin/super_admin, então o risco é baixo, mas o módulo se descreve como
"fail-safe" — adicionar `pool.on("error", ...)` e um `max` explícito conservador alinha o
código à promessa.

### M-3 — `colunas` derivado de `result.fields` pode divergir das chaves de `linhas`

`colunas` vem de `result.fields[].name`; `linhas` são os `result.rows` crus do `pg`. Se a
query do agente tiver duas colunas com o mesmo alias (`SELECT a AS x, b AS x`), `fields` tem
dois `x` e `rows` tem um só (o `pg` sobrescreve a chave do objeto). `colunas` e `linhas`
ficam inconsistentes. Caso de borda menor — vale um comentário ou normalização.

### M-4 — `outputSchema` aceita `linhas` arbitrariamente grandes apesar do cap

O cap de 1000 é aplicado no handler (`slice`), correto. Mas `totalLinhas` é definido como
`linhas.length` (sempre ≤ 1000) — o nome sugere "total de linhas que a query produziria",
o que **não** é verdade quando `truncado: true` (não dá para saber o total real sem um
`count`). O agente da F5 pode interpretar `totalLinhas` como o universo completo. Recomendado:
renomear para `linhasRetornadas` ou documentar no `descricao`/`aviso` que, com `truncado:
true`, `totalLinhas` é só o que foi devolvido.

---

## Conformidade com o plano e a SPEC

| Item | Status |
|---|---|
| H.1 — `SqlGuardError` + `toOutcome` → `invalid_input` | OK — classe criada, mapeamento correto, testes de regressão presentes |
| H.2 — role `nexus_mcp_bi`, SELECT só em `fato_*`, sem `raw_*`/`users` | OK estruturalmente — porém ver C-1 (o `GRANT INSERT ON mcp_audit_log` é inútil enquanto o `create()` emitir `RETURNING`) |
| H.3 — `MCP_BI_DATABASE_URL` em `.env.example`/compose | OK |
| H.4 — `pgsql-parser` + SDK-NOTES | OK — ver M-1 |
| H.5 — `bi-pool.ts` fail-safe, eager, `SET` read-only + timeout | OK — ver M-2 |
| H.6 — `sql-guard.ts` AST: statement único + `SelectStmt` + sem `intoClause` | OK no escopo cravado — ver I-2 e I-3 (furos de `lockingClause` e CTE data-modifying não previstos no plano) |
| H.7 — reescrita de `bi-consulta-avancada.ts`: `{sql}`→tabular, gate admin, cap 1000 | OK — contrato, gate e imports conforme cravado |
| H.7 Step 2 — confirmar caminho de audit em `params` | PARCIAL — o comentário cravado afirma que o pipeline grava `params` automaticamente (verdade: `auditSafe` recebe `rawInput`), MAS o Step não detectou que a gravação **falha** sob o role restrito (C-1) |
| H.8 — `CLAUDE.md §5.5/§5.7` e research | OK — §5.5 item 3c e §5.6/§5.7 (itens 5/6/7) atualizados; research revisada com nota de 2026-05-18 |
| H.9 — harness exercita novo contrato; contagem 33 / 16-10 intacta | OK no harness; **E2E Steps 4–5 sem evidência** (I-1) |

**`CLAUDE.md §5` — reversão do 3c registrada:** SIM. O item 3c do §5.5 e os itens 6/7 do §5
documentam o executor embutido e o rebaixamento do Crystal DBA para dev/DBA, com data de
revisão 2026-05-18 e ponteiro para a research. Conforme.

**Verificação automatizada:** `npx tsc --noEmit` verde; `npx tsc -p mcp/tsconfig.json` verde;
`npx eslint src/ mcp/` verde; `npx jest` — 104 suites / 827 testes verdes. Confirmado. Ressalva:
o verde **não** cobre C-1, porque nenhum teste exercita o pipeline de audit contra o role
`nexus_mcp` real (todos mockam Prisma ou usam superusuário).

---

## Conclusão sobre o audit log quebrado

**É bug real, severidade CRÍTICA.** `prisma.mcpAuditLog.create()` emite `INSERT ... RETURNING`,
e `RETURNING` exige `SELECT`; o role `nexus_mcp` faz `REVOKE SELECT ON mcp_audit_log` — toda
gravação de audit falha em produção sob o role restrito, e a falha é **engolida** pelo
`catch {}` de `auditSafe`. A camada 7 do RBAC (decisão canônica) fica inoperante e invisível.

**O bug NÃO é exclusivo da Onda H:** afeta o pipeline de audit de **todas as 33 tools da F4**,
não só o `bi_consulta_avancada`. Adicionalmente, a tool `registrar_lacuna` (Caminho 3a) sofre
da mesma raiz em `feature_requests` — ali a exceção não é engolida, mas o gap logging nunca é
gravado.

**Correção recomendada:** trocar `create()` por `createMany()` em `mcp/lib/audit.ts` e em
`mcp/tools/caminho3/registrar-lacuna.ts` — `createMany` não emite `RETURNING`, então funciona
com apenas `INSERT` e **preserva o menor privilégio**. Rejeitar a alternativa de `GRANT SELECT`:
viola o princípio do menor privilégio, contradiz o comentário do próprio script SQL e exporia
a trilha de auditoria inteira ao SQL livre do modo BI 3c. Além da correção do `RETURNING`,
elevar o `console.error` do `auditSafe` a um log/alerta estruturado de alta severidade, para
que uma falha sistemática de audit deixe de ser silenciosa. Após corrigir, executar de fato
o E2E da H.9 Steps 4–5 contra o role real e registrar a evidência.
