# F4 completo — MCP semântico para todos os domínios — SPEC v2

> **SPEC v2 — aplica Review #1 (18 achados).**
> Continuação da F4 (`CLAUDE.md §4`, decisões §5.9/§5.10). A F4 onda 1 entregou
> estoque + financeiro. Esta spec cobre **todos os demais domínios** + o
> Caminho 3c funcional. Decisão do usuário (2026-05-18): "MCP cobre 100% do que
> o Odoo expõe; criar tudo mesmo onde não há dado".
> Base factual: `docs/superpowers/research/2026-05-18-f4-completo-dominios.md`,
> `docs/superpowers/research/2026-05-18-mapa-dominios.md` e
> `docs/superpowers/research/2026-05-17-f4-postgres-mcp-role.md`.
> **v2** — incorpora a Review adversarial #1
> (`docs/superpowers/reviews/2026-05-18-f4completo-spec-review-1.md`): 7 CRÍTICO,
> 8 IMPORTANTE, 3 MENOR, todos aplicados. A v2 vai para a Review #2 (`§6` [4]),
> que gera a v3. Modo autônomo (`CLAUDE.md §6`). Mapa achado→seção ao fim (§10).

---

## 1. Objetivo

Estender o servidor MCP semântico (já em produção desde a F4 onda 1) para
cobrir **todos os domínios de negócio** do Odoo Tauga, e tornar o **Caminho 3c
(modo BI)** funcional. Ao fim, o MCP responde perguntas de gestor sobre estoque,
financeiro, comercial, fiscal e cadastros; expõe a estrutura contábil; declara
honestamente os domínios sem dado (RH/CRM/produção); e oferece consulta BI
controlada para o que estiver fora do catálogo.

## 2. Escopo

### 2.1 Dentro do escopo

- **Domínio Comercial** — 2 fatos, 5 tools (pedidos de venda, parcelas).
- **Domínio Fiscal** — 2 fatos, 6 tools (notas fiscais, itens).
- **Domínio Cadastros** — 1 fato, 3 tools (clientes/fornecedores `res.partner`).
- **Domínio Contábil** — 1 fato, 2 tools (estrutura do plano de contas).
- **Domínios sem dado operacional (RH, CRM, Produção)** — 1 tool honesta por
  domínio, `sempreVisivel: true` e sem `dominio` (ver §3.6).
- **Caminho 3c funcional** — `bi_consulta_avancada` deixa de ser stub: passa a
  ser um **executor de SQL read-only embutido no próprio MCP semântico**, com
  mudança de contrato declarada (ver §3.7 e §3.8).
- Extensão do enum `ReportDomain` (5 valores novos) e da matriz de RBAC.
- Extensão do script de provisionamento de role `prisma/sql/2026-05-17-mcp-role.sql`
  (`GRANT SELECT` nos 6 fatos novos ao role `nexus_mcp`) e criação do role
  `nexus_mcp_bi` por script SQL próprio.
- Atualização de `CLAUDE.md §5.5/§5.7` e da research do role (ver §3.8).

### 2.2 Fora do escopo

- Estender a ingestão F2 — **não é preciso**. O `mapa-dominios §5` levantou a
  hipótese de que faltariam modelos-fonte; a `research §4` a **refutou
  tabela-a-tabela**: `pedido.documento`, `pedido.parcela`, `pedido.etapa`,
  `sped.documento`, `sped.documento.item`, `res.partner` e `contabil.conta`
  **todos já estão no `MODEL_CATALOG`** (verificado — `model-catalog.ts` linhas
  11, 39, 42, 45, 48, 56, 58) e sincronizados no cache. **Vale a research**
  (achado M3 da Review #1).
- Refinar imposto nota-a-nota a partir dos 211k itens fiscais (a tool de
  impostos usa a estimativa IBPT do cabeçalho — refinamento futuro).
- F5 (WhatsApp, conversas, personalização) — permanece fora. O **text-to-SQL é
  responsabilidade do agente da F5**; o MCP é só o executor (ver §3.7).
- Modelos de infraestrutura do Odoo (`ir.*`, `mail.*`, `auditoria.*`, etc.) —
  não são domínio de negócio; a cauda longa é coberta pelo 3c.

### 2.3 Arquitetura — sem mudança estrutural (exceto a segunda conexão do 3c)

Reusa integralmente a arquitetura da F4 onda 1: servidor MCP, transporte,
contrato de identidade, registry de catálogo, RBAC 7 camadas, `withFreshness`,
`McpAuditLog`, registry de builders, comportamento sob falha. Esta spec
**acrescenta fatos, builders e tools** ao que existe. A **única mudança
estrutural** é a segunda conexão Postgres dedicada ao 3c (ver §3.7, achado C5).

### 2.4 Total de tools pós-F4-completo (achado M1)

A onda 1 entregou **14 tools** (estoque 6 + financeiro 6 + `registrar_lacuna` 1
+ `bi_consulta_avancada` stub 1). A F4 completo **adiciona 19 tools** e
**reescreve 1** (`bi_consulta_avancada`, de stub para funcional):

| Domínio | Tools novas |
|---|---|
| Comercial | 5 |
| Fiscal | 6 |
| Cadastros | 3 |
| Contábil | 2 |
| RH/CRM/Produção | 3 |
| **Subtotal novas** | **19** |
| `bi_consulta_avancada` | reescrita (não conta como nova) |

**Total do catálogo pós-F4-completo: 33 tools** (14 da onda 1 + 19 novas; a
`bi_consulta_avancada` reescrita já estava nas 14). Este número é o alvo da
verificação do harness de integração (§6).

---

## 3. Especificação por domínio

> Padrões obrigatórios herdados da onda 1 (todos os builders e tools):
> `rawDeleted=false`; dinheiro `Decimal @db.Decimal(18,2)`, `Number(raw.x ?? 0)`
> no builder; datas `date` → `new Date(\`${s}T00:00:00\`)`; `selection` →
> `String`; m2o via `relId`/`relNome`; "dias de atraso" calculado na query;
> builder no `registry.ts`; `markFatoBuilt(tx,…)`; `createMany` com
> `atualizadoEm @default(now())`.
>
> **Modo de build dos 6 fatos novos (achado I1).** Todos os modelos-fonte são
> `incremental` no `MODEL_CATALOG` (verificado — `contabil.conta` L11,
> `pedido.documento` L39, `pedido.etapa` L42, `pedido.parcela` L45,
> `res.partner` L48, `sped.documento` L56, `sped.documento.item` L58). Logo
> **todos os 6 builders novos têm `cycle: "incremental"`** e rodam em
> `processIncrementalCycle`. Não há nada "a verificar" — está cravado.

### 3.1 Comercial

Dois fatos e cinco tools, conforme `research §1.4–1.5`:

- **`FatoPedido`** — 1 linha/pedido, PK `odooId`, fonte `raw_pedido_documento`,
  builder `cycle: "incremental"`, rebuild full. Colunas em `research §1.4`. O
  builder monta um `Map` `pedido.etapa.id → <flag de etapa final>` lendo
  **`raw_pedido_etapa` direto** (203 linhas, custo trivial; **não há fato de
  etapa** — `pedido.etapa` é tabela de apoio/lookup) para preencher
  `etapaFinaliza` (achado I2).
- **`FatoPedidoParcela`** — 1 linha/parcela, PK `odooId`, fonte
  `raw_pedido_parcela`, builder `cycle: "incremental"`, rebuild full. Colunas em
  `research §1.4`.
- Tools: `comercial_pedidos_periodo`, `comercial_pedidos_por_etapa`,
  `comercial_pedidos_por_vendedor`, `comercial_pedidos_atrasados`,
  `comercial_parcelas_a_vencer` (`research §1.5`). Domínio `comercial`.
- **Lacunas honestas** que toda tool de comercial declara na resposta: universo
  pequeno (71 pedidos); **não há pedido de compra** (compras são notas de
  entrada no fiscal); valor do pedido vem de `vrProdutos`/`vrNf` (`vr_total`
  zerado na fonte); atraso de pedido é parcial (`dataPrevista` cobre 30/71) —
  priorizar atraso por parcela vencida não faturada.

### 3.2 Fiscal

Dois fatos e seis tools, conforme `research §2.3–2.4`:

- **`FatoNotaFiscal`** — 1 linha/nota, PK `odooId`, fonte `raw_sped_documento`,
  builder `cycle: "incremental"`, rebuild full (3743 linhas). Colunas em
  `research §2.3`. O campo derivado `tipoMovimento` (achado I7): `"1"`→`saida`,
  `"0"`→`entrada`, **e qualquer valor de `entrada_saida` fora de `{"0","1"}` →
  `"outro"`** (com log de aviso no builder). Isso preserva o princípio canônico
  "`selection` é `String` fail-safe" — `entradaSaida` permanece como `String`
  crua no fato; `tipoMovimento` é só conveniência derivada com default seguro.
  Índices: `dataEmissao`, `entradaSaida`, `situacaoNfe`.
- **`FatoNotaFiscalItem`** — 1 linha/item, PK `odooId`, fonte
  `raw_sped_documento_item`, builder `cycle: "incremental"`. Colunas em
  `research §2.3`.
  **Decisão de build cravada (achados I3/I4):** o builder faz **rebuild full**
  dos 211k itens, com **`createMany` fatiado manualmente em chunks de 5.000**
  (o builder fatia o array e chama `createMany` N vezes; não conta com o batch
  interno do Prisma). Os inserts **não ficam numa transação única gigante** —
  uma transação de 211k linhas seguraria locks e inflaria o WAL. O ponto de
  consistência é **`markFatoBuilt`**: chamado uma única vez ao final, após todos
  os chunks; até `markFatoBuilt` rodar, o fato é considerado "em
  reconstrução". **Não há cláusula condicional "se >60s migrar para
  incremental"** — essa condicional da v1 foi removida. Caso futuro se queira
  build incremental por `odooId`, isso é uma **onda futura explícita** (não
  uma decisão adiada dentro da onda C). Índices: `documentoId`, `produtoId`.
- Tools: `fiscal_faturamento_periodo` (filtra `entradaSaida="1"` +
  `situacaoNfe="autorizada"`), `fiscal_notas_emitidas`,
  `fiscal_notas_recebidas`, `fiscal_impostos_periodo` (usa `vrIbpt` com aviso
  de estimativa IBPT), `fiscal_faturamento_por_cliente`,
  `fiscal_produtos_faturados` (`research §2.4`). Domínio `fiscal`.

### 3.3 Cadastros

Um fato e três tools, conforme `research §3.2–3.3`:

- **`FatoParceiro`** — 1 linha/parceiro, PK `odooId`, fonte `raw_res_partner`,
  builder `cycle: "incremental"`, rebuild full (6545 linhas). Colunas em
  `research §3.2`: `ehCliente`/`ehFornecedor` dos booleanos OCA
  `customer`/`supplier`, `ehEmpresa` de `is_company`, `documento` de `vat`, `uf`
  de `relNome(state_id)`. Índices: `uf`, `ehCliente`, `ehFornecedor`.
- Tools: `cadastro_buscar_parceiro` (ILIKE em nome/documento),
  `cadastro_parceiros_por_uf`, `cadastro_contar_parceiros`. Domínio `cadastros`.
- **Decisão (research §3.2):** não criar fato separado para
  `sped.participante` — os fatos transacionais (`FatoPedido`,
  `FatoNotaFiscal`) já carregam `participanteNome` desnormalizado;
  `FatoParceiro` serve só as tools de consulta de cadastro.

### 3.4 Contábil

Um fato e duas tools — só estrutura, pois não há movimento contábil
(`research`/`mapa-dominios`: `contabil.lancamento`=0).

> **Lacuna de pesquisa reconhecida (achado M2).** Diferente de
> comercial/fiscal/cadastros, o domínio contábil **não foi pesquisado contra o
> dado real** — a research não tem seção sobre `contabil.conta`; o
> `mapa-dominios §3` só conta registros (934). É o domínio mais fraco da spec.
> Por isso a **onda D abre com uma task de discovery real de
> `raw_contabil_conta`** (campos efetivamente preenchidos, valores reais de
> `selection`) **antes de fixar as colunas do fato**.

- **`FatoContaContabil`** — 1 linha por conta do plano, PK `odooId`, fonte
  `raw_contabil_conta` (`incremental` — confirmado, `model-catalog.ts` L11),
  rebuild full (934 linhas). Colunas-base propostas (a confirmar/ajustar na
  discovery da onda D): `odooId`, `codigo` (String), `nome` (String), `tipo`
  (String — selection, ex. analítica/sintética), `contaPaiId`, `contaPaiNome`,
  `natureza` (String se houver — devedora/credora), `ativo` (Boolean),
  `atualizadoEm`. A discovery da onda D crava a lista final.
- Tools: `contabil_plano_de_contas` ("mostre o plano de contas / busque uma
  conta"), `contabil_estrutura_conta` ("detalhe de uma conta e suas filhas").
  Domínio `contabil`.
- Toda tool de contábil declara: **não há movimento/lançamento contábil no
  Odoo da Matrix** — só a estrutura do plano de contas.

### 3.5 Enum de domínios e RBAC

> **Achado C7.** O enum atual (`prisma/schema.prisma`) já tem `estoque`,
> `financeiro`, `fiscal`, `comercial`. Portanto **`fiscal` e `comercial` já
> existem** — a v1 errava ao listar 7 valores novos.

`ReportDomain` ganha **5 valores novos**: `cadastros`, `contabil`, `rh`, `crm`,
`producao`. A migration de enum é **isolada**:

- **Migration própria, só `ALTER TYPE "ReportDomain" ADD VALUE`** para os 5
  valores. `ADD VALUE` no Postgres não é usável na mesma transação em que é
  criado; a migration **não pode usar** os valores novos (nenhum seed,
  `UserDomainAccess`, etc. na mesma migration). Qualquer uso dos valores novos
  (seed, RBAC) vem em **migration posterior** separada.
- `src/lib/reports/domains.ts` (`REPORT_DOMAINS`, `ALL_DOMAINS`) é estendido.
- As camadas 1/2 do RBAC do MCP já filtram por domínio — passam a cobrir os
  novos automaticamente. Privilegiados (`admin`/`super_admin`) veem tudo; demais
  perfis dependem de `UserDomainAccess`.

### 3.6 Domínios sem dado operacional — RH, CRM, Produção

Decisão do usuário: criar tools mesmo sem dado. Para cada um dos 3 domínios,
**uma tool honesta** — `rh_status_dominio`, `crm_status_dominio`,
`producao_status_dominio` — cujo handler **não consulta fato nenhum** e
responde de forma estruturada: "O domínio &lt;X&gt; existe no Odoo da Matrix mas
não é operado — 0 registros. Quando a Matrix passar a usar o módulo, este
domínio ganha tools de consulta." `outcome=ok`.

> **Achado I5.** Essas 3 tools são **`sempreVisivel: true` e SEM `dominio`** —
> conceitualmente são informativas, próximas de `registrar_lacuna`, não tools
> de domínio. São **visíveis a todos os usuários** (alinhado ao objetivo
> "expor mesmo sem dado"). Se ficassem gated por domínio, nenhum usuário teria
> `UserDomainAccess` de `rh`/`crm`/`producao` e elas só apareceriam para
> admin — frustrando o objetivo. Os valores `rh`/`crm`/`producao` ainda entram
> no enum (§3.5) para uso futuro quando esses domínios ganharem fatos reais.

Não há fato, builder nem migration de dado para esses 3. Quando o cliente
passar a operar os módulos, viram ondas futuras com fatos reais.

### 3.7 Caminho 3c funcional — `bi_consulta_avancada`

A F4 onda 1 entregou `bi_consulta_avancada` como **stub gated**. Esta spec o
torna **funcional** como **executor de SQL read-only embutido no próprio MCP
semântico** (a §3.8 declara e justifica a reversão das decisões §5.5/§5.7).

**Mudança de contrato da tool (achado C1).** A tool já está publicada com
`inputSchema = z.object({ pergunta: z.string().min(1) })` e
`outputSchema = { disponivel: literal(false), mensagem, aviso }`. A v2 **muda o
contrato**:

- `inputSchema` passa de `{ pergunta }` para **`{ sql: z.string().min(1) }`**.
- `outputSchema` passa a devolver **dados tabulares** — ex.:
  `{ colunas: string[], linhas: Array<Record<string, unknown>>, totalLinhas:
  number, truncado: boolean, aviso: string }`.
- Os arquivos `mcp/tools/caminho3/bi-consulta-avancada.ts`, o teste
  `bi-consulta-avancada.test.ts` e o trecho do harness de integração que
  exercita a tool são **reescritos** (tasks da onda F).

**Quem faz o text-to-SQL.** O agente (F5) gera o SQL; o MCP é só o **executor
controlado**. O MCP **não embute LLM**.

**Guarda-corpos — hierarquia corrigida (achado C3).** O **controle primário e
suficiente é o role Postgres read-only `nexus_mcp_bi`** + a configuração da
sessão. A validação textual de SQL é **apenas defesa-em-profundidade**, não o
controle. Ordem:

1. **Controle primário — role + sessão.** A conexão do 3c usa o role
   `nexus_mcp_bi` (ver §4 e o script SQL). Na abertura de cada conexão/sessão o
   handler aplica: `SET default_transaction_read_only = on` (barra todo DML
   mesmo que houvesse GRANT, e barra `SELECT INTO`), `SET statement_timeout =
   '5s'` (mata `pg_sleep` e queries longas). O role **não tem** `INSERT`/
   `UPDATE`/`DELETE`/DDL e o schema sofre `REVOKE CREATE ON SCHEMA public`
   (impede criar tabela/objeto). Um `WITH ... DELETE` em CTE é recusado pelo
   Postgres por falta de GRANT — não depende de parser.
2. **Defesa-em-profundidade — verificação estrutural (não blacklist).** Antes
   de executar, o handler verifica que a instrução é **um único `SELECT` ou
   `WITH … SELECT`**. **Não se usa blacklist de palavras** (`DELETE`, `DROP`,
   etc.) — é furável por case/comentário/unicode. A verificação é feita por
   **parse de AST** (ex.: `libpg_query` / `pg-query-parser`) confirmando que o
   nó-raiz é `SelectStmt` e que há **uma única instrução**; se a dependência de
   parse não for viável, a alternativa aceita é confiar inteiramente no
   controle primário (role + sessão) — nunca a blacklist textual.
3. **`LIMIT` forçado.** A tool envelopa a query com um cap de linhas (ex.:
   1000) ou trunca o resultado a esse cap, sinalizando `truncado: true`.
4. **Gate de role.** Permanece gated a `admin`/`super_admin` (camada 1). É
   coerente que o 3c enxergue todos os domínios via SQL livre: só perfis
   privilegiados, que já veem tudo no RBAC, têm acesso.

**Conexão Postgres dedicada (achado C5).** O handler do 3c **não usa** o
`prisma` injetado no `ToolHandlerCtx` (esse roda como `nexus_mcp`, que não tem
os GRANTs do BI). Usa um **`pg.Pool` dedicado**, lido de `MCP_BI_DATABASE_URL`,
instanciado num **módulo próprio** (ex.: `mcp/tools/caminho3/bi-pool.ts`) e
**usado somente pelo handler do 3c** — nunca exposto no `ToolHandlerCtx` geral
das demais tools (isso enfraqueceria a camada 4 do RBAC). O pool aplica
`default_transaction_read_only` e `statement_timeout` por conexão
(`pool` com `options`/`on('connect')`). SQL arbitrário é executado via `pg`
cru (`pool.query`), **não** via `$queryRawUnsafe` do Prisma.

**Auditoria (achado C6).** Toda execução do 3c é gravada em `McpAuditLog`:

- `outcome = "ok"` em caso de sucesso (o enum padronizado da onda 1 é
  `ok`/`denied`/`error`/`invalid_input`; **não** se cria valor novo
  `dynamic_query`). Erro de SQL → `outcome = "error"`, mensagem do Postgres
  saneada (sem vazar schema interno além do necessário).
- A SQL executada é gravada no campo **`params`** (Json). O modelo `McpAuditLog`
  **não tem** campo `meta` — a research do role cita `meta` por engano e será
  corrigida (task da onda F).
- O `INSERT` no audit é feito pela **conexão padrão `nexus_mcp`** (que tem
  `INSERT ON mcp_audit_log`), **não** pelo pool `nexus_mcp_bi`.

A resposta inclui o aviso fixo "consulta dinâmica não auditada como tool" e os
dados tabulares.

### 3.8 Revisão das decisões §5.5/§5.7 (achados C1, C2)

> **Decisão cravada na v2 — reversão consciente de decisão canônica.**

`CLAUDE.md §5.5.3` define o 3c como "**Postgres MCP** (text-to-SQL controlado,
read-only)" e `§5.7` posiciona o Postgres MCP (Crystal DBA) como produto MCP
separado. A research do role (`2026-05-17-f4-postgres-mcp-role.md`) descreve o
3c como "Enviar a pergunta ao Postgres MCP", que faria o text-to-SQL.

**A v2 reverte essa decisão.** O Caminho 3c passa a ser um **executor de SQL
embutido no próprio MCP semântico** — não o Crystal DBA separado:

- O text-to-SQL é responsabilidade do **agente da F5** (que já tem LLM); o MCP
  semântico recebe o `sql` pronto e o **executa** sob role read-only.
- **Justificativa:** (a) evita rodar e operar um segundo container/produto MCP
  em produção; (b) mantém auditoria, RBAC (gate de role) e freshness sob o
  mesmo servidor MCP já em produção; (c) o controle de segurança real é o role
  read-only + sessão `default_transaction_read_only` — idêntico independente de
  quem executa o SQL; (d) o Crystal DBA permanece útil **só em ambiente
  dev/DBA** (uso de produtividade), não em produção.
- **Consequências no plano:** o plano da F4 completo inclui obrigatoriamente:
  1. Task de **atualizar `CLAUDE.md §5.5/§5.7`** para registrar que o 3c de
     produção é o executor embutido (`bi_consulta_avancada` recebe `sql`), e
     que o Crystal DBA fica restrito a dev/DBA.
  2. Task de **atualizar a research `2026-05-17-f4-postgres-mcp-role.md`**:
     corrigir o campo `meta`→`params`, o `outcome` (`ok`, não
     `dynamic_query`), o fluxo ("executar o SQL" em vez de "enviar a pergunta
     ao Postgres MCP"), e o GRANT do role (ver achado C4 abaixo).
  3. Reescrita de `bi-consulta-avancada.ts`, seu teste e o trecho do harness.

---

## 4. Modelo de dados e provisionamento (Prisma — schema compartilhado)

Adições (nenhuma alteração destrutiva): `model FatoPedido`,
`FatoPedidoParcela`, `FatoNotaFiscal`, `FatoNotaFiscalItem`, `FatoParceiro`,
`FatoContaContabil` — colunas/PK/índices conforme §3 e `research`.

- **Enum `ReportDomain`** ganha **5 valores novos** (`cadastros`, `contabil`,
  `rh`, `crm`, `producao`) — migration isolada, conforme §3.5 (achado C7).
- `FatoBuildState` ganha 6 entradas novas (dados — em migration posterior à de
  enum se referenciar domínios).
- **Provisionamento de roles (achados I6, C4):**
  - **Estender `prisma/sql/2026-05-17-mcp-role.sql`** com `GRANT SELECT` para o
    role `nexus_mcp` nas **6 tabelas de fato novas** (`fato_pedido`,
    `fato_pedido_parcela`, `fato_nota_fiscal`, `fato_nota_fiscal_item`,
    `fato_parceiro`, `fato_conta_contabil`). Sem esses GRANTs, toda tool nova
    retorna `permission denied` em runtime — os testes unitários (superusuário)
    **não pegam isso**; só o E2E sob o role certo pega. Esta é uma task
    explícita da onda A.
  - **Criar o role `nexus_mcp_bi`** por script SQL versionado próprio em
    `prisma/sql/` (ex.: `2026-05-18-mcp-bi-role.sql`). O role tem:
    - `SELECT` **somente em `fato_*`** — os 6 fatos da onda 1 **mais os 6 fatos
      novos** desta F4 (12 fatos no total). **NÃO** tem `SELECT` em `raw_*`
      (achado C4 — alinhado à research do role, que proíbe `raw_*`
      explicitamente; a v1 contradizia a própria research ao pedir `raw_*`).
      `SELECT` nas tabelas de apoio (`User`, `UserDomainAccess`, `sync_state`,
      `FatoBuildState`) conforme a research.
    - `INSERT` em `mcp_audit_log` (embora o audit do 3c seja gravado pela
      conexão `nexus_mcp` — ver §3.7 C6; o GRANT fica como a research previu,
      sem uso obrigatório).
    - **Sem** `INSERT`/`UPDATE`/`DELETE`/DDL em qualquer outra tabela;
      `REVOKE CREATE ON SCHEMA public FROM nexus_mcp_bi`.
  - A research do role é atualizada (task da onda F) para refletir os 12 fatos
    e a reversão arquitetural.

---

## 5. Decomposição em ondas

| Onda | Entrega | Depende de |
|---|---|---|
| **A** | Schema (6 fatos) + migration isolada do enum (5 valores) + `GRANT SELECT` dos 6 fatos novos ao `nexus_mcp` em `mcp-role.sql` | — |
| **B** | Comercial — 2 builders + 5 tools; discovery do nome real da flag de etapa final; estende o harness | A |
| **C** | Fiscal — 2 builders (`FatoNotaFiscalItem` rebuild full chunked, sem transação gigante) + 6 tools; estende o harness | A |
| **D** | Discovery real de `raw_contabil_conta`; Cadastros — 1 builder + 3 tools; Contábil — 1 builder + 2 tools; estende o harness | A |
| **E** | RH/CRM/Produção — 3 tools "sem dado" (`sempreVisivel`); estende o harness | A |
| **F** | Caminho 3c funcional — role `nexus_mcp_bi` (script SQL), `MCP_BI_DATABASE_URL` no container, `pg.Pool` dedicado, executor SQL, guarda-corpos; reescrita de `bi-consulta-avancada.ts` + teste; atualização de `CLAUDE.md §5.5/§5.7` e da research do role; estende o harness | A **e** infra de container/env da onda 1 |

> **Achado I8.** A onda F **não depende só de A** — depende também da infra de
> container/conexão entregue na onda 1 (o container `mcp`, sua configuração de
> env/`docker-compose`/Portainer), pois precisa acrescentar `MCP_BI_DATABASE_URL`
> e uma segunda conexão ao processo. **Cada onda B–F estende o harness de
> integração** com suas tools novas (não é entrega órfã) — a verificação final
> confere a contagem total de 33 tools (§2.4).

Cada onda: tasks bite-sized no plano, TDD, e **verificação end-to-end contra o
cache real obrigatória** (`CLAUDE.md §6` [9], regra de raiz) — popular os fatos,
subir o MCP, exercer as tools, conferir os números. **O E2E roda sob o role
`nexus_mcp`** (não superusuário), para validar a camada 4 do RBAC (achado I6).

## 6. Testes e verificação

- Unitário (Jest): builders (mapeamento `raw`→`fato`, `selection`, `rawDeleted`,
  lookup de etapa, default `"outro"` de `tipoMovimento`, chunking de 5.000 do
  `FatoNotaFiscalItem`), schemas Zod, handlers, RBAC dos domínios novos,
  verificação estrutural da SQL do 3c (aceita `SELECT`/`WITH…SELECT`, rejeita
  multi-statement e não-`SELECT`).
- **E2E contra o cache real, sob o role `nexus_mcp`** (regra de raiz, achado
  I6): por domínio, rebuild dos fatos + servidor MCP + chamada das tools,
  conferindo contagens/valores contra `SELECT` direto. Para o 3c: confirmar que
  `INSERT`/`UPDATE`/`DROP`/`SELECT INTO`/multi-statement são rejeitados (pelo
  role e/ou pela verificação estrutural) e que o role `nexus_mcp_bi` não
  escreve; confirmar `statement_timeout` e `LIMIT` forçado.
- Verificação final: `tsc` (raiz + mcp), `eslint`, `jest`, `next build`,
  `docker compose build mcp` — verdes; **harness de integração estendido com as
  19 tools novas + a `bi_consulta_avancada` reescrita; contagem total = 33
  tools** (§2.4).

## 7. Riscos

| Risco | Mitigação |
|---|---|
| `FatoNotaFiscalItem` 211k — rebuild lento / transação grande | Rebuild full **chunked** (`createMany` em chunks de 5.000), inserts **fora de transação única**; `markFatoBuilt` é o ponto de consistência (§3.2, achados I3/I4). Build incremental por `odooId` é onda futura explícita, não condicional. |
| `selection` de `pedido.tipo`/`conta.tipo` sem valores no discovery | Descoberta na execução (onda B/D): ler valores reais do `raw`. `selection`→`String` no fato (fail-safe). |
| **Nome real do campo de flag de etapa final** em `pedido.etapa` | Descoberta na **onda B** contra `raw_pedido_etapa` antes de cravar o lookup (achado I2). |
| `entrada_saida` com valor fora de `{"0","1"}` | `tipoMovimento` recebe default `"outro"` com log; `entradaSaida` permanece `String` cru (achado I7). |
| Campos contábeis reais divergirem do suposto | **Discovery real de `raw_contabil_conta` abre a onda D** antes de fixar o fato (achado M2). |
| Tools novas quebrarem em produção por falta de `GRANT` | Onda A estende `mcp-role.sql`; E2E roda sob `nexus_mcp` (achado I6). |
| 3c — SQL malicioso/perigoso | **Controle primário:** role `nexus_mcp_bi` read-only + `default_transaction_read_only=on` + `statement_timeout=5s` + `REVOKE CREATE ON SCHEMA public`. Defesa-em-profundidade: verificação estrutural (AST `SelectStmt`, instrução única). `LIMIT` forçado. Gate admin. `pg_sleep` é morto pelo `statement_timeout`; `WITH…DELETE` é morto pela falta de GRANT; `SELECT INTO` é morto por `default_transaction_read_only` + `REVOKE CREATE` (§3.7, achado C3). |
| Segunda conexão (`nexus_mcp_bi`) vazar para tools comuns | `pg.Pool` em módulo próprio, usado só pelo handler do 3c, nunca no `ToolHandlerCtx` geral (§3.7, achado C5). |
| Migration de enum quebrar (`ADD VALUE` em transação) | Migration isolada, só `ADD VALUE`, sem uso dos valores na mesma migration; seed/RBAC em migration posterior (§3.5, achado C7). |
| Tools de domínio vazio (RH/CRM) parecerem quebradas/invisíveis | Handler responde mensagem honesta estruturada, `outcome=ok`; tools `sempreVisivel: true` sem `dominio` — visíveis a todos (§3.6, achado I5). |

## 8. Notas

A F4 completa encerra o escopo §5.9 (todos os domínios). Domínios hoje vazios
(RH/CRM/produção) viram ondas futuras com fatos reais quando o cliente operar
os módulos. O refinamento de imposto nota-a-nota, o histórico de saldos
financeiros (`docs/RADAR.md`) e o eventual build incremental de
`FatoNotaFiscalItem` permanecem como evolução pós-F4.

## 9. Decisões canônicas afetadas

A v2 reverte conscientemente `CLAUDE.md §5.5.3` e `§5.7` quanto ao Caminho 3c
(ver §3.8). O plano inclui a task de atualizar `CLAUDE.md §5.5/§5.7` e a
research `2026-05-17-f4-postgres-mcp-role.md`. Fora isso, nenhuma outra decisão
canônica é tocada.

## 10. Mapa achado → seção (Review #1, 18 achados)

| Achado | Severidade | Resolução | Seção |
|---|---|---|---|
| C1 | CRÍTICO | Contrato de `bi_consulta_avancada` muda (`{pergunta}`→`{sql}`, output tabular); arquivo/teste/harness reescritos — declarado | §3.7, §3.8 |
| C2 | CRÍTICO | Reversão de §5.5/§5.7 declarada e justificada; 3c vira executor embutido; task de atualizar `CLAUDE.md` | §3.8, §9 |
| C3 | CRÍTICO | Hierarquia corrigida: role read-only é controle primário; sem blacklist — verificação estrutural AST como defesa-em-profundidade; `default_transaction_read_only`, `statement_timeout`, `REVOKE CREATE`, `LIMIT` | §3.7 item 1–3, §7 |
| C4 | CRÍTICO | `nexus_mcp_bi` com `SELECT` só em `fato_*` (12 fatos), nunca `raw_*`; research do role atualizada | §4 |
| C5 | CRÍTICO | `pg.Pool` dedicado de `MCP_BI_DATABASE_URL` em módulo próprio, só do handler do 3c; `pg` cru, não `$queryRawUnsafe` | §3.7 |
| C6 | CRÍTICO | Sucesso do 3c = `outcome="ok"`; SQL em `params`; `meta` não existe (corrige research); audit gravado pela conexão `nexus_mcp` | §3.7, §3.8 |
| C7 | CRÍTICO | 5 valores novos (não 7); migration de enum isolada, sem uso na mesma transação | §3.5, §4 |
| I1 | IMPORTANTE | Cravado: 6 fatos novos `incremental`; builders `cycle:"incremental"` | §3 cabeçalho |
| I2 | IMPORTANTE | Lookup lê `raw_pedido_etapa` direto (sem fato); risco do nome da flag adicionado ao §7 | §3.1, §7 |
| I3 | IMPORTANTE | `FatoNotaFiscalItem` rebuild full decidido agora; condicional ">60s" removida; incremental é onda futura explícita | §3.2, §7 |
| I4 | IMPORTANTE | `createMany` fatiado manualmente em chunks de 5.000; sem transação única; `markFatoBuilt` é o ponto de consistência | §3.2 |
| I5 | IMPORTANTE | 3 tools de domínio vazio `sempreVisivel:true` sem `dominio` — visíveis a todos | §3.6 |
| I6 | IMPORTANTE | Onda A estende `mcp-role.sql` com `GRANT SELECT` dos 6 fatos novos; E2E sob role `nexus_mcp` | §4, §5, §6 |
| I7 | IMPORTANTE | `tipoMovimento` recebe default `"outro"` fora de `{"0","1"}`; `entradaSaida` permanece `String` cru | §3.2, §7 |
| I8 | IMPORTANTE | Onda F depende também da infra de container/env da onda 1; cada onda B–F estende o harness | §5 |
| M1 | MENOR | Total de tools pós-F4-completo declarado: 33 | §2.4 |
| M2 | MENOR | Lacuna de pesquisa de contábil reconhecida; onda D abre com discovery de `raw_contabil_conta` | §3.4, §5, §7 |
| M3 | MENOR | Nota de reconciliação mapa-dominios×research sobre estender ingestão | §2.2 |
