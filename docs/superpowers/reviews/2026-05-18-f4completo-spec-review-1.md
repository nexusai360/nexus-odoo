# Review adversarial #1 — SPEC v1 "F4 completo"

> Alvo: `docs/superpowers/specs/2026-05-18-f4-completo-design.md` (v1).
> Base de conferência: research `2026-05-18-f4-completo-dominios.md`,
> `2026-05-18-mapa-dominios.md`, spec da onda 1
> `2026-05-17-f4-mcp-semantico-design.md`, código atual (`mcp/`, `prisma/`,
> `src/worker/`), `2026-05-17-f4-postgres-mcp-role.md`.
> Review adversarial — não carimbo. 18 achados: 7 CRÍTICO, 8 IMPORTANTE, 3 MENOR.

---

## CRÍTICO

### C1 — A spec da onda 1 cravou `bi_consulta_avancada` com `inputSchema { pergunta }`; esta spec redesenha para `{ sql }` e não declara a quebra de contrato

**Seção:** §3.7.
A tool `bi_consulta_avancada` **já existe em produção** (`mcp/tools/caminho3/bi-consulta-avancada.ts`). Seu `inputSchema` real é `z.object({ pergunta: z.string().min(1) })` e o `outputSchema` é `{ disponivel: literal(false), mensagem, aviso }`. A spec v1 diz "a tool aceita um parâmetro `sql: string`" — isto **substitui** o input e o output da tool, não "torna funcional um stub". É uma mudança de contrato de uma tool publicada. A spec não menciona que o `inputSchema`/`outputSchema` da tool mudam, nem que `bi-consulta-avancada.test.ts` precisa ser reescrito, nem o impacto no harness de integração que já exercita a tool.

Pior: a spec da onda 1 (§3.7 e research da role) **decidiu explicitamente** que o agente envia *a pergunta em linguagem natural* e o Postgres MCP (Crystal DBA) faz o text-to-SQL — "Enviar a pergunta ao Postgres MCP". A spec v1 inverte isso: agora **o agente gera o SQL** e o MCP semântico **executa o SQL diretamente**. São duas arquiteturas 3c incompatíveis. Não há Postgres MCP / Crystal DBA na v1 — o MCP semântico virou o executor. Isso precisa ser declarado como reversão consciente de decisão, com justificativa, ou a v1 está silenciosamente contradizendo a onda 1.

**Recomendação:** decidir e declarar explicitamente: (a) input vira `sql` ou continua `pergunta`; (b) quem faz text-to-SQL — agente (v1) ou Crystal DBA (onda 1); (c) que a tool publicada muda de contrato e os testes/harness são reescritos; (d) reconciliar com `2026-05-17-f4-postgres-mcp-role.md`, que descreve um fluxo diferente.

### C2 — A v1 fura a decisão canônica §5.7 / §5.5.3: Postgres MCP é ferramenta dev/DBA, não executor in-MCP de SQL do agente

**Seção:** §3.7, §2.1.
`CLAUDE.md §5.5.3` define o 3c como "**Postgres MCP** (text-to-SQL controlado, read-only)". `§5.7` diz "Postgres MCP (Crystal DBA) também em ambiente dev/DBA — uso de produtividade, separado do MCP semântico de produção". A decisão canônica é: o 3c usa **um produto MCP separado** (Crystal DBA Postgres MCP), não um executor de SQL embutido no servidor MCP semântico. A spec v1 implementa o 3c como uma tool `bi_consulta_avancada` do **próprio MCP semântico** que recebe SQL e o executa com `pg`. Isso é uma decisão arquitetural nova que **contraria §5.5 e §5.7** e a research da role (que fala em "Postgres MCP (Crystal DBA)" usando `MCP_BI_DATABASE_URL`).

Pode ser uma decisão melhor — embutir o executor evita rodar um segundo container — mas é uma **reversão de decisão canônica** e a spec não a declara como tal, não justifica, e não atualiza `CLAUDE.md §5`. Modo autônomo não autoriza reverter decisão canônica sem registro; §5 diz "não rediscutir sem motivo" — havendo motivo, registra-se.

**Recomendação:** §3.7 deve abrir com uma subseção "Reversão da decisão §5.5/§5.7" declarando que o 3c passa a ser um executor embutido (não Crystal DBA), com a justificativa, e o plano deve incluir uma task de atualização de `CLAUDE.md §5.5/§5.7` e da research da role. Sem isso, é mudança canônica clandestina.

### C3 — Validação de SQL por blacklist de palavras-chave é ingênua e fura sob CTE/comentário/função; a spec já lista as bypass-rotas sem fechá-las

**Seção:** §3.7 item 2.
O desenho: "deve ser uma única instrução SELECT (ou WITH … SELECT); rejeita `;` múltiplo, `INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER`/`GRANT`/`COPY`/`CALL` e qualquer DML/DDL". Validação textual por palavra-proibida é furada de forma conhecida:

- **`WITH ... SELECT` permitido abre DML em CTE**: Postgres aceita `WITH x AS (DELETE FROM fato_pedido RETURNING *) SELECT * FROM x` — é uma instrução iniciada por `WITH`, sem `;`, e contém DELETE. Se a blacklist barra a palavra `DELETE`, o atacante usa `delete`/`DeLeTe` (case), comentário (`DEL/**/ETE` não — mas `/*c*/DELETE`), ou unicode. A spec **menciona** "CTEs que escondem DML" no enunciado da tarefa de auditoria mas **não especifica como fechar** — deixa o problema nomeado e não resolvido.
- **Comentários SQL** (`--`, `/* */`) podem mascarar a estrutura para um parser textual ingênuo.
- **`pg_sleep`, funções**: um `SELECT pg_sleep(3600)` passa em qualquer blacklist de DML — é mitigado pelo `statement_timeout`, mas a spec lista `pg_sleep` como risco sem dizer que o timeout o cobre.
- **`SELECT ... INTO`** cria tabela — é DDL disfarçada de SELECT.

A blacklist textual **não é o controle**. O controle real e suficiente é a **camada 4 — o role `nexus_mcp_bi` sem privilégio de escrita/DDL**: mesmo que um DELETE-em-CTE passe pela validação textual, o Postgres recusa por falta de GRANT. A spec inverte a hierarquia: trata a validação textual como guarda-corpo 2 de igual peso ao role, quando ela é, na melhor das hipóteses, defesa-em-profundidade frágil. E `SELECT INTO` ainda fura o role se houver `CREATE` no schema (mitigado por `REVOKE CREATE ON SCHEMA`).

**Recomendação:** a v2 deve (1) declarar que o **role read-only é o controle primário e suficiente** — validação textual é só defesa-em-profundidade; (2) trocar "blacklist de palavras" por algo defensável: ou parse com `pg-query-parser`/`libpg_query` verificando que o nó-raiz da AST é `SelectStmt`, ou simplesmente aceitar qualquer SQL e confiar no role + `statement_timeout` + `default_transaction_read_only=on` na sessão + `REVOKE CREATE ON SCHEMA public`; (3) cravar `SET default_transaction_read_only = on` na sessão (barra DML mesmo com GRANT, barra `SELECT INTO`); (4) parar de listar `pg_sleep`/CTE como riscos no §7 sem dizer o controle que os mata.

### C4 — Role `nexus_mcp_bi` da research dá SELECT só em 6 fatos da onda 1; a spec v1 quer SELECT em `fato_*` E `raw_*`, contradizendo a própria research que ela cita

**Seção:** §3.7 item 1.
A spec v1 diz: o role `nexus_mcp_bi` tem "`SELECT` nas tabelas `fato_*`, `raw_*` e de apoio". Mas a research que a spec **cita como fonte do role** (`2026-05-17-f4-postgres-mcp-role.md`) define o `nexus_mcp_bi` com SELECT **apenas nos 6 fatos da onda 1** e diz explicitamente, em tabela: "SELECT em `raw_*`: **Não**" e lista entre as "Proibições críticas": "SELECT em raw_* (dados brutos não validados, sem RLS)". A spec v1 **diretamente contradiz** o documento que invoca como base.

Além disso, mesmo a lista de fatos da research está desatualizada — não inclui os 6 fatos novos desta F4 completa (`fato_pedido`, `fato_nota_fiscal`, etc.). E a spec v1 não diz se o 3c deve enxergar os domínios todos ou ser filtrado por `UserContext` (um admin de comercial poderia ler `fato_financeiro_*` via SQL livre, furando a camada 1/2 do RBAC — o 3c é gated a admin/super_admin, que veem tudo, então é coerente, mas precisa ser dito).

**Recomendação:** decidir conscientemente — `raw_*` dentro ou fora do 3c. Se a decisão for incluir `raw_*` (dado bruto, sem o tratamento de `rawDeleted`/normalização dos fatos), declarar isso como reversão da research da role e justificar; senão, alinhar a spec ao "raw fora" da research. De qualquer modo, o GRANT precisa cobrir os 6 fatos novos, e a research da role precisa ser atualizada (task no plano).

### C5 — Colisão de nomenclatura/escopo entre `nexus_mcp_bi` e a camada 4 do RBAC da onda 1; a spec não diz qual conexão o handler do 3c usa

**Seção:** §3.7 itens 1 e 5.
A onda 1 entregou o container `mcp` rodando com **uma** `DATABASE_URL` = role `nexus_mcp` (camada 4 do RBAC — `prisma/sql/2026-05-17-mcp-role.sql`). A spec v1 diz que o 3c usa um **segundo** role `nexus_mcp_bi` via `MCP_BI_DATABASE_URL`. Problema não resolvido: o handler de `bi_consulta_avancada` roda **dentro do mesmo processo** do servidor MCP. O Prisma já está conectado como `nexus_mcp`. Para o 3c usar `nexus_mcp_bi` é preciso uma **segunda conexão** (segundo `PrismaClient` ou um `pg.Pool` cru) — a spec não diz qual, não diz que o handler do 3c precisa de um `ToolHandlerCtx` diferente (hoje `ToolHandlerCtx` injeta um `prisma` único — ver `mcp/catalog/types.ts`), e não diz como o `$queryRawUnsafe` (necessário p/ SQL arbitrário) coexiste com o cliente `nexus_mcp` que **não tem** GRANT em `raw_*`.

Risco real: se o handler do 3c usar o `prisma` injetado (role `nexus_mcp`), ele **não tem** os GRANTs que a v1 supõe (`raw_*`) e a tool quebra; se abrir conexão própria, a spec precisa especificar o ciclo de vida desse pool, o `statement_timeout` por sessão, e onde a `MCP_BI_DATABASE_URL` é lida. Nenhum dos dois está na spec.

Sobre "colisão": não é colisão de nome no Postgres (`nexus_mcp` ≠ `nexus_mcp_bi`), mas é **colisão conceitual** — a camada 4 do RBAC foi desenhada como "uma conexão, GRANT mínimo". Introduzir uma segunda conexão com GRANT mais amplo no mesmo processo **enfraquece a camada 4**: um bug que vaze o pool `nexus_mcp_bi` para uma tool comum daria a ela leitura ampla. A spec precisa isolar isso (ex.: o pool BI só é instanciável pelo handler do 3c, nunca exposto no `ToolHandlerCtx` geral).

**Recomendação:** §3.7 deve especificar: segunda conexão dedicada (`pg.Pool` ou `PrismaClient` separado) lida de `MCP_BI_DATABASE_URL`, instanciada e usada **somente** pelo handler do 3c, nunca no `ToolHandlerCtx` das demais tools; `SET statement_timeout`/`default_transaction_read_only` aplicados por conexão; e o `ToolHandlerCtx` ou ganha um campo opcional `biPool` ou o handler do 3c o resolve de um módulo próprio. Decidir também: `$queryRawUnsafe` (Prisma) vs `pg` cru.

### C6 — `outcome` do `McpAuditLog`: a research da role exige `outcome="dynamic_query"`, mas o enum de outcomes da onda 1 não o tem e a spec v1 não o adiciona

**Seção:** §3.7 item 5.
`McpAuditLog.outcome` é `String` (livre no banco), mas a onda 1 padronizou os valores: `ok`/`denied`/`error`/`invalid_input` (spec onda 1 §3.8/§3.9). A research da role (`2026-05-17-f4-postgres-mcp-role.md` item 3) manda gravar o 3c com `outcome = "dynamic_query"` no campo `meta`. A spec v1 diz "Toda execução gravada em `McpAuditLog` com a SQL como `params`" e "Erro de SQL → `outcome=error`" — ou seja, a v1 usa `params` (não `meta` — e o modelo **não tem** campo `meta`, só `params`) e não define o `outcome` do caso de sucesso do 3c. Sucesso do 3c é `ok` ou `dynamic_query`? Há três fontes divergentes (enum onda 1, research da role, spec v1) e nenhuma reconciliação.

Detalhe adicional: gravar a SQL inteira em `params` (Json) é correto, mas o modelo `McpAuditLog` é gravável pelo role `nexus_mcp` com `INSERT` apenas. O role `nexus_mcp_bi` também precisa de `INSERT ON mcp_audit_log` (a research o concede) — mas se a execução de audit é feita pela conexão `nexus_mcp` (não a `_bi`), tudo bem; a spec precisa dizer **qual conexão grava o audit do 3c**.

**Recomendação:** v2 crava o valor de `outcome` para sucesso do 3c (recomendo manter `ok` e usar `params` para a SQL — campo `meta` não existe; corrigir a research da role que cita `meta`), e diz que o audit do 3c é gravado pela conexão padrão `nexus_mcp` (que tem o INSERT), não pela `_bi`.

### C7 — Migration de enum `ReportDomain` adicionando 7 valores: a spec diz "Migration de enum" sem tratar a regra do Postgres de que `ALTER TYPE ... ADD VALUE` não roda dentro de transação

**Seção:** §3.5, §4.
A spec lista valores novos: `comercial`, `fiscal`, `cadastros`, `contabil`, `rh`, `crm`, `producao`. O enum atual (`prisma/schema.prisma`) já tem `estoque`, `financeiro`, `fiscal`, `comercial`. Então **`fiscal` e `comercial` já existem** — a spec lista 7 valores como "novos" mas só **5 são novos** (`cadastros`, `contabil`, `rh`, `crm`, `producao`). A spec erra a contagem ("ganha 7 valores" no §4; "ganha os valores: comercial, fiscal, cadastros…" no §3.5 — incluindo dois que já existem). Aplicar `ADD VALUE` de um valor já existente falha sem `IF NOT EXISTS`.

Mais grave: Prisma gera `ALTER TYPE "ReportDomain" ADD VALUE 'x'`. No Postgres, **`ALTER TYPE ... ADD VALUE` não pode rodar dentro de um bloco de transação** (antes do PG12; no PG12+ pode, mas o valor novo não é usável na mesma transação). Prisma `migrate` envolve migrations em transação — adicionar valor de enum **e usá-lo na mesma migration** (ex.: um seed de `UserDomainAccess`) quebra. A spec diz "Migration de enum" como se fosse trivial; é o ponto historicamente quebradiço de migration Prisma. A spec não menciona separar a migration de enum das migrations que usam os valores.

**Recomendação:** v2 corrige a contagem (5 valores novos, não 7), e o plano deve isolar o `ADD VALUE` numa migration própria, sem nenhum uso dos valores novos na mesma migration; qualquer seed/`UserDomainAccess` que referencie os domínios novos vem em migration posterior. Documentar a restrição.

---

## IMPORTANTE

### I1 — `MODEL_CATALOG`: `contabil.conta` é `incremental`, não verificável "na execução" — a spec deixa indefinição que já tem resposta

**Seção:** §3.4.
A spec diz `FatoContaContabil` fonte `raw_contabil_conta` "(verificar modo no `MODEL_CATALOG`)". O catálogo já responde: `{ odooModel: "contabil.conta", mode: "incremental" }`. Não é "a verificar" — é incremental, logo o builder roda em `processIncrementalCycle`. Idem: `pedido.documento`, `pedido.parcela`, `pedido.etapa`, `sped.documento`, `sped.documento.item`, `res.partner` — **todos `incremental`** no catálogo. A spec deixa "verificar" o que a research já podia ter cravado. Isso vira ambiguidade que o plano herda.

**Recomendação:** v2 crava: todos os 6 fatos novos têm fonte `incremental` → builders no registry com `cycle: "incremental"` → rodam em `processIncrementalCycle`. Remover o "(verificar…)".

### I2 — `pedido.etapa` é incremental no catálogo, mas a spec/research o trata como "tabela de apoio/lookup" — o builder de `FatoPedido` precisa lê-la, e ela é sincronizada como `raw_pedido_etapa`; a spec não diz se vira fato nem como o lookup é montado em rebuild full

**Seção:** §3.1.
O builder de `FatoPedido` "monta um `Map` `pedido.etapa.id → finaliza_pedido_confirmando` a partir de `raw_pedido_etapa`". Bom. Mas: (a) `raw_pedido_etapa` está no cache (203 linhas) — confirmado; (b) a spec não diz se o `Map` é montado a cada rebuild lendo `raw_pedido_etapa` inteira (custo trivial, ok) — mas **deveria cravar** que a fonte do lookup é `raw_pedido_etapa` e **não** um fato; (c) o campo é `finaliza_pedido_confirmando` na research §1.4 mas a research §1.1 lista a flag como `finaliza_*` genérico — confirmar o nome exato do campo é tarefa de descoberta e a spec não a lista no §7 (riscos só citam `selection` de `tipo`).

**Recomendação:** v2 adiciona ao §7 o risco "nome real do campo de flag de etapa final" com mitigação "descoberta na onda B contra `raw_pedido_etapa`", e crava que o lookup lê `raw_pedido_etapa` direto (sem fato).

### I3 — `FatoNotaFiscalItem` 211k: "rebuild full, e se >60 s migrar para incremental" é decisão adiada disfarçada de decisão — e a fonte já é `incremental`

**Seção:** §3.2, §5 onda C, §7.
A spec manda "rebuild full mantido… o plano deve medir o tempo do build e, se passar de ~60 s, migrar para build incremental". Isso é **um épico escondido numa cláusula condicional**: "migrar para build incremental por `odooId`" é reescrever o builder com lógica de upsert/delete-incremental — não é um ajuste de parâmetro. Decidir isso *durante a execução da onda C* significa que a onda C pode estourar em escopo no meio. A spec da onda 1 cravou rebuild full com gatilho em 50k "para revisão" — aqui já **sabemos** que são 211k, 4x o gatilho. Adiar a decisão para "medir na execução" contraria a regra de raiz do `CLAUDE.md §6`: o plano deve ter zero ambiguidade e nenhuma task pode esconder mais de uma unidade de trabalho.

Além disso a fonte `sped.documento.item` **já é `incremental`** no `MODEL_CATALOG` — o `raw` só cresce, é populado incrementalmente. Fazer `deleteMany`+`createMany` de 211k a cada ciclo de sync (que roda periodicamente) é desperdício previsível, não hipótese.

**Recomendação:** a spec **decide agora**: `FatoNotaFiscalItem` é build incremental por `odooId` desde a onda C (não "talvez"). Se a equipe quiser manter rebuild full, então a onda C precisa de uma sub-onda explícita "C-bis: migração para incremental" pré-planejada — não uma cláusula `if tempo > 60s`. Eliminar a condicional.

### I4 — `createMany` de 211k "em lotes de ~5.000": Prisma `createMany` já faz batch interno; o número 5.000 é arbitrário e a transação de 211k linhas é o risco real não tratado

**Seção:** §3.2.
A spec diz `createMany` em lotes de ~5.000 dentro de "rebuild full (`deleteMany` + `createMany` em transação)". Dois problemas: (1) Prisma `createMany` já divide em chunks internamente — "lotes de 5.000" só faz sentido se o builder fatiar o array manualmente e chamar `createMany` N vezes; a spec não diz qual; (2) o padrão da onda 1 é `deleteMany`+`createMany` **em uma transação** (`fato-financeiro-*`) — uma transação que insere 211k linhas segura locks e infla o WAL; pode estourar `statement_timeout` ou ser lenta o suficiente para o caso "60 s". A spec herda o padrão transacional da onda 1 sem notar que 211k o estressa de modo qualitativamente diferente de 1.147 linhas (financeiro).

**Recomendação:** v2, se mantiver rebuild full (ver I3), especifica explicitamente: fatiamento manual em chunks, e decide se a transação envolve tudo ou se o `markFatoBuilt` é o ponto de consistência com inserts fora de transação única. Melhor: resolver via I3 (incremental) e o problema some.

### I5 — Domínios sem dado (RH/CRM/Produção): tool "honesta" gated por domínio do enum — mas quem recebe `rh`/`crm`/`producao` em `UserDomainAccess`? Sem isso a tool é invisível para todos os não-privilegiados e a entrega some

**Seção:** §3.6, §3.5.
As tools `rh_status_dominio` etc. ficam "sob os domínios `rh`/`crm`/`producao` do enum (camada 1 do RBAC)". Camada 1 filtra `tools/list` por `visibleDomains(user)`: privilegiados veem tudo, demais dependem de `UserDomainAccess`. Como **nenhum usuário** terá `UserDomainAccess` de `rh`/`crm`/`producao` (não há dado, ninguém vai conceder), essas 3 tools só aparecem para `admin`/`super_admin`. Pode ser aceitável — mas a spec não diz isso, e o objetivo declarado ("o MCP responde perguntas… expõe tools mesmo sem dado") fica frustrado para o gestor comum. Ou as 3 tools deveriam ser `sempreVisivel: true` (como `bi_consulta_avancada` e `registrar_lacuna` — domínio-neutro), ou a spec aceita explicitamente que são admin-only.

Também: o `ToolEntry.dominio` é `ReportDomain | undefined`; uma tool com `dominio: "rh"` mas sem usuário com acesso é coerente, mas a tool "honesta" não consulta fato nenhum — ela é conceitualmente mais próxima de `registrar_lacuna` (informativa) do que de uma tool de domínio. Decidir o tratamento.

**Recomendação:** v2 decide: ou (a) as 3 tools são `sempreVisivel: true` e sem `dominio`, ficando visíveis a todos (coerente com "expor mesmo sem dado"), ou (b) ficam gated por domínio e a spec declara que são, na prática, admin-only até a Matrix operar os módulos. Recomendo (a) — alinhado ao objetivo.

### I6 — Spec não toca `prisma/sql/2026-05-17-mcp-role.sql`: os 6 fatos novos precisam de `GRANT SELECT` ao role `nexus_mcp` ou as tools novas quebram em runtime

**Seção:** §4, §3.7.
A camada 4 do RBAC: o container `mcp` roda como role `nexus_mcp`, que tem `GRANT SELECT` **explícito tabela-a-tabela** (`mcp-role.sql` passos 4–6) — só nos 6 fatos da onda 1. As tools novas (comercial/fiscal/cadastros/contábil) consultam `fato_pedido`, `fato_nota_fiscal`, `fato_nota_fiscal_item`, `fato_parceiro`, `fato_conta_contabil`, `fato_pedido_parcela` — **nenhum tem GRANT** para `nexus_mcp`. Sem novos `GRANT SELECT`, toda tool nova retorna `permission denied` em runtime — e os testes unitários (que rodam como superusuário) **não pegam isso**; só o E2E contra o cache real pega, se rodar com o role certo. A spec menciona "Migrations versionadas. Role `nexus_mcp_bi` por script SQL" mas **não menciona estender o `mcp-role.sql`** para os 6 fatos novos. É uma omissão que quebra a entrega inteira em produção.

**Recomendação:** v2 adiciona, explicitamente em §4 e na onda A (ou em cada onda B/C/D), a task "estender `prisma/sql/2026-05-17-mcp-role.sql` com `GRANT SELECT` nos 6 fatos novos" e a regra de que o E2E roda sob o role `nexus_mcp` (não superusuário) para validar a camada 4.

### I7 — `tipoMovimento` derivado em `FatoNotaFiscal`: a research diz que `entrada_saida` tem valores `"0"`/`"1"`, mas a spec da onda 1 obriga `selection → String` "fail-safe contra a Tauga introduzir valor novo" — `tipoMovimento` derivado quebra esse princípio

**Seção:** §3.2.
A spec deriva `tipoMovimento`: `entrada_saida="1"`→`saida`, `"0"`→`entrada`. A research §2.1 confirma só dois valores reais hoje. Mas o princípio canônico herdado (onda 1, research §método) é: `selection` vira `String` justamente porque a customização SPED da Tauga **pode introduzir valor novo**. Se amanhã aparecer `entrada_saida="2"`, o builder de `tipoMovimento` cai num `else` não especificado. A spec não diz o que `tipoMovimento` recebe para um `entrada_saida` fora de `{"0","1"}`. Coluna de conveniência derivada de `selection` é exatamente o caso que o princípio quer evitar — ou some o derivado, ou o builder trata o default.

**Recomendação:** v2 especifica o comportamento do builder para `entrada_saida` inesperado (ex.: `tipoMovimento = "outro"` ou `null`, com log), ou remove a coluna `tipoMovimento` e deixa as tools filtrarem por `entradaSaida` direto (que já está no fato). Recomendo manter `tipoMovimento` mas cravar o default.

### I8 — Onda F depende só de "A", mas o role `nexus_mcp_bi`, a `MCP_BI_DATABASE_URL` e a segunda conexão tocam o servidor MCP — F deveria depender da infra de container/conexão, e o harness (onda 1 4f-4) precisa ser estendido

**Seção:** §5 (tabela de ondas), §6.
A tabela de ondas diz onda F (3c) "Depende de A" (só o schema). Mas o 3c precisa: (1) o role `nexus_mcp_bi` criado no Postgres; (2) a env `MCP_BI_DATABASE_URL` no container `mcp` (mudança de `docker-compose`/Portainer); (3) a segunda conexão no processo MCP (ver C5). Nada disso depende da onda A — depende da infra de container da onda 1. A dependência declarada está incompleta. Além disso, o harness de integração da onda 1 (`4f-4`) testa as tools existentes; a spec §6 diz "harness estendido com as tools novas (contagem total atualizada)" mas não o lista como entrega de nenhuma onda — fica órfão. Cada onda B–F adiciona tools e **deve** atualizar o harness; a spec não atribui isso.

**Recomendação:** v2 corrige a coluna "Depende de" da onda F (depende da infra de container/env) e atribui explicitamente a extensão do harness de integração a cada onda (ou cria uma onda G de harness, como a onda 1 fez com 4f-4).

---

## MENOR

### M1 — Contagem de tools inconsistente entre §2.1 e o corpo

§2.1 resume "Comercial — 5 tools; Fiscal — 6 tools; Cadastros — 3 tools; Contábil — 2 tools" + 3 tools de domínio vazio + 1 (`bi_consulta_avancada` já existe, é tornada funcional) = 19 tools tocadas. O §6 pede "contagem total de tools atualizada" mas a spec nunca dá o total resultante (onda 1 entregou 6+6+2 = 14; após F4 completo seriam ~33). Cravar o número-alvo ajuda a verificação.

**Recomendação:** v2 declara o total esperado de tools no catálogo pós-F4-completo.

### M2 — `FatoContaContabil` com colunas marcadas "confirmar na execução" — aceitável, mas a research nem mapeou o dado real de `contabil.conta`

§3.4 lista colunas de `FatoContaContabil` com "(verificar)" / "se houver" e a research **não tem uma seção** sobre `contabil.conta` (o `mapa-dominios` §3 só conta registros). Diferente de comercial/fiscal/cadastros, contábil **não foi pesquisado contra o dado real**. A spec está propondo um fato sobre um domínio não pesquisado. É o domínio mais fraco da spec. Não é crítico (934 linhas, baixo risco), mas a spec deveria reconhecer que contábil carece da pesquisa que os outros 3 tiveram, e a onda D abre com uma descoberta real (não só "confirmar campos").

**Recomendação:** v2 reconhece a lacuna de pesquisa de contábil e a onda D inclui uma task de discovery do dado real de `raw_contabil_conta` antes de fixar o fato.

### M3 — §2.2 diz "não estender a ingestão" apoiado na research, mas o `mapa-dominios §5` levanta dúvida ("Pode ser necessário estender a ingestão") — a spec resolve a favor de não estender sem mostrar a verificação tabela-a-tabela

§2.2 afirma que todos os modelos-fonte já estão no `MODEL_CATALOG`. Verifiquei: `pedido.documento/parcela/etapa`, `sped.documento/item`, `res.partner`, `contabil.conta` **estão** no catálogo. A afirmação está correta — mas a spec a apoia em "a pesquisa confirmou" enquanto o `mapa-dominios` (também citado) diz o oposto ("pode ser necessário estender"). A spec deveria citar a verificação concreta (a research §4 faz isso) e não deixar dois documentos-fonte se contradizendo sem nota de reconciliação.

**Recomendação:** v2 adiciona uma frase: "o `mapa-dominios §5` levantou a hipótese de estender a ingestão; a research §4 a refutou tabela-a-tabela — vale a research".

---

## Resumo

| Severidade | Qtd |
|---|---|
| CRÍTICO | 7 |
| IMPORTANTE | 8 |
| MENOR | 3 |
| **Total** | **18** |

**Mais graves:** o desenho do Caminho 3c (§3.7) é o epicentro — **C1** (muda o contrato de uma tool já publicada sem declarar), **C2** (fura as decisões canônicas §5.5/§5.7 ao embutir o executor em vez de usar o Postgres MCP/Crystal DBA, sem registrar a reversão), **C3** (validação de SQL por blacklist textual é furável por CTE-com-DML/`SELECT INTO`/case — o controle real é o role + `default_transaction_read_only`, e a spec inverte a hierarquia), **C4** (a spec quer SELECT em `raw_*` para o `nexus_mcp_bi`, contradizendo a própria research da role que ela cita) e **C5** (não especifica a segunda conexão Postgres no processo MCP). Fora do 3c: **C7** (migration de enum — contagem errada de valores novos e a armadilha do `ALTER TYPE ADD VALUE` fora de transação) e **I6** (omissão que quebra produção: os 6 fatos novos não recebem `GRANT SELECT` para o role `nexus_mcp` — toda tool nova daria `permission denied`). **I3** é a maior falha de decomposição: 211k itens fiscais com "rebuild full e talvez migrar para incremental se passar de 60 s" é um épico escondido numa condicional — a spec tem de decidir incremental agora.
