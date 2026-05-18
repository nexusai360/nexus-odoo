# F4 completo — MCP semântico para todos os domínios — SPEC v1

> Continuação da F4 (`CLAUDE.md §4`, decisões §5.9/§5.10). A F4 onda 1 entregou
> estoque + financeiro. Esta spec cobre **todos os demais domínios** + o
> Caminho 3c funcional. Decisão do usuário (2026-05-18): "MCP cobre 100% do que
> o Odoo expõe; criar tudo mesmo onde não há dado".
> Base factual: `docs/superpowers/research/2026-05-18-f4-completo-dominios.md`
> e `docs/superpowers/research/2026-05-18-mapa-dominios.md`.
> **v1** — pré-reviews. Reviews [3][4] geram v2/v3. Modo autônomo (`§6`).

---

## 1. Objetivo

Estender o servidor MCP semântico (já em produção desde a F4 onda 1) para
cobrir **todos os domínios de negócio** do Odoo Tauga, e tornar o **Caminho 3c
(modo BI)** funcional. Ao fim, o MCP responde perguntas de gestor sobre estoque,
financeiro, comercial, fiscal e cadastros; expõe a estrutura contábil; e oferece
consulta BI controlada para o que estiver fora do catálogo.

## 2. Escopo

### 2.1 Dentro do escopo

- **Domínio Comercial** — 2 fatos, 5 tools (pedidos de venda, parcelas).
- **Domínio Fiscal** — 2 fatos, 6 tools (notas fiscais, itens).
- **Domínio Cadastros** — 1 fato, 3 tools (clientes/fornecedores `res.partner`).
- **Domínio Contábil** — 1 fato, 2 tools (estrutura do plano de contas).
- **Domínios sem dado operacional (RH, CRM, Produção)** — 1 tool honesta por
  domínio que declara "domínio não operado no Odoo — sem dado" (ver 3.6).
- **Caminho 3c funcional** — `bi_consulta_avancada` deixa de ser stub: executa
  SQL read-only controlado contra o cache (ver 3.7).
- Extensão do enum `ReportDomain` e da matriz de RBAC para os domínios novos.

### 2.2 Fora do escopo

- Estender a ingestão F2 — **não é preciso**: a pesquisa confirmou que todos os
  modelos-fonte (`pedido.*`, `sped.*`, `res.partner`, `contabil.conta`) já estão
  no `MODEL_CATALOG` e sincronizados no cache.
- Refinar imposto nota-a-nota a partir dos 211k itens fiscais (a tool de
  impostos usa a estimativa IBPT do cabeçalho — refinamento futuro).
- F5 (WhatsApp, conversas, personalização) — permanece fora.
- Modelos de infraestrutura do Odoo (`ir.*`, `mail.*`, `auditoria.*`, etc.) —
  não são domínio de negócio; a cauda longa é coberta pelo 3c.

### 2.3 Arquitetura — sem mudança estrutural

Reusa integralmente a arquitetura da F4 onda 1: servidor MCP, transporte,
contrato de identidade, registry de catálogo, RBAC 7 camadas, `withFreshness`,
`McpAuditLog`, registry de builders, comportamento sob falha. Esta spec **só
acrescenta fatos, builders e tools** ao que existe — e torna o 3c funcional.

---

## 3. Especificação por domínio

> Padrões obrigatórios herdados da onda 1 (todos os builders e tools):
> `rawDeleted=false`; dinheiro `Decimal @db.Decimal(18,2)`, `Number()` no
> builder; datas `date` → `new Date(\`${s}T00:00:00\`)`; `selection` → `String`;
> m2o via `relId`/`relNome`; "dias de atraso" calculado na query; builder no
> `registry.ts` com `cycle` conforme `MODEL_CATALOG`; `markFatoBuilt(tx,…)` na
> transação; `createMany` com `atualizadoEm @default(now())`.

### 3.1 Comercial

Dois fatos e cinco tools, conforme `research §1.4–1.5`:

- **`FatoPedido`** — 1 linha/pedido, PK `odooId`, fonte `raw_pedido_documento`
  (incremental), rebuild full. Colunas em `research §1.4`. O builder monta um
  `Map` `pedido.etapa.id → finaliza_pedido_confirmando` a partir de
  `raw_pedido_etapa` para preencher `etapaFinaliza`.
- **`FatoPedidoParcela`** — 1 linha/parcela, PK `odooId`, fonte
  `raw_pedido_parcela` (incremental), rebuild full. Colunas em `research §1.4`.
- Tools: `comercial_pedidos_periodo`, `comercial_pedidos_por_etapa`,
  `comercial_pedidos_por_vendedor`, `comercial_pedidos_atrasados`,
  `comercial_parcelas_a_vencer` (`research §1.5`).
- **Lacunas honestas** que toda tool de comercial declara na resposta: universo
  pequeno (71 pedidos); **não há pedido de compra** (compras são notas de
  entrada no fiscal); valor do pedido vem de `vrProdutos`/`vrNf` (`vr_total`
  zerado na fonte); atraso de pedido é parcial (`dataPrevista` cobre 30/71) —
  priorizar atraso por parcela vencida não faturada.

### 3.2 Fiscal

Dois fatos e seis tools, conforme `research §2.3–2.4`:

- **`FatoNotaFiscal`** — 1 linha/nota, PK `odooId`, fonte `raw_sped_documento`
  (incremental), rebuild full (3743 linhas). Colunas em `research §2.3`,
  incluindo `tipoMovimento` derivado (`entrada_saida="1"`→`saida`,
  `"0"`→`entrada`). Índices: `dataEmissao`, `entradaSaida`, `situacaoNfe`.
- **`FatoNotaFiscalItem`** — 1 linha/item, PK `odooId`, fonte
  `raw_sped_documento_item` (incremental). **Volume 211k — decisão de build:**
  rebuild full mantido (consistência com o padrão; `createMany` em lotes de
  ~5.000). O plano deve **medir o tempo do build** e, se passar de ~60 s,
  migrar para build incremental por `odooId`. Índices: `documentoId`,
  `produtoId`.
- Tools: `fiscal_faturamento_periodo` (filtra `entradaSaida="1"` +
  `situacaoNfe="autorizada"`), `fiscal_notas_emitidas`,
  `fiscal_notas_recebidas`, `fiscal_impostos_periodo` (usa `vrIbpt` com aviso
  de estimativa IBPT), `fiscal_faturamento_por_cliente`,
  `fiscal_produtos_faturados` (`research §2.4`).

### 3.3 Cadastros

Um fato e três tools, conforme `research §3.2–3.3`:

- **`FatoParceiro`** — 1 linha/parceiro, PK `odooId`, fonte `raw_res_partner`
  (incremental), rebuild full (6545 linhas). Colunas em `research §3.2`:
  `ehCliente`/`ehFornecedor` dos booleanos OCA `customer`/`supplier`,
  `ehEmpresa` de `is_company`, `documento` de `vat`, `uf` de `relNome(state_id)`.
  Índices: `uf`, `ehCliente`, `ehFornecedor`.
- Tools: `cadastro_buscar_parceiro` (ILIKE em nome/documento),
  `cadastro_parceiros_por_uf`, `cadastro_contar_parceiros`.
- **Decisão (research §3.2):** não criar fato separado para
  `sped.participante` — os fatos transacionais (`FatoPedido`,
  `FatoNotaFiscal`) já carregam `participanteNome` desnormalizado;
  `FatoParceiro` serve só as tools de consulta de cadastro.

### 3.4 Contábil

Um fato e duas tools — só estrutura, pois não há movimento contábil
(`research`/`mapa-dominios`: `contabil.lancamento`=0).

- **`FatoContaContabil`** — 1 linha por conta do plano, PK `odooId`, fonte
  `raw_contabil_conta` (verificar modo no `MODEL_CATALOG`), rebuild full (934
  linhas). Colunas: `odooId`, `codigo` (String), `nome` (String), `tipo`
  (String — selection, ex. analítica/sintética), `contaPaiId`, `contaPaiNome`,
  `natureza` (String se houver — devedora/credora), `ativo` (Boolean),
  `atualizadoEm`. Confirmar os campos reais na execução (tarefa de descoberta).
- Tools: `contabil_plano_de_contas` ("mostre o plano de contas / busque uma
  conta"), `contabil_estrutura_conta` ("detalhe de uma conta e suas filhas").
- Toda tool de contábil declara: **não há movimento/lançamento contábil no
  Odoo da Matrix** — só a estrutura do plano de contas.

### 3.5 Enum de domínios e RBAC

`ReportDomain` (Prisma) ganha os valores: `comercial`, `fiscal`, `cadastros`,
`contabil`, `rh`, `crm`, `producao`. Migration de enum. `src/lib/reports/domains.ts`
(`REPORT_DOMAINS`, `ALL_DOMAINS`) é estendido. As camadas 1/2 do RBAC do MCP já
filtram por domínio — passam a cobrir os novos automaticamente. Privilegiados
(`admin`/`super_admin`) veem tudo; demais perfis dependem de `UserDomainAccess`.

### 3.6 Domínios sem dado operacional — RH, CRM, Produção

Decisão do usuário: criar tools mesmo sem dado. Para cada um dos 3 domínios,
**uma tool honesta** — `rh_status_dominio`, `crm_status_dominio`,
`producao_status_dominio` — cujo handler **não consulta fato nenhum** e
responde de forma estruturada: "O domínio <X> existe no Odoo da Matrix mas não
é operado — 0 registros. Quando a Matrix passar a usar o módulo, este domínio
ganha tools de consulta." `outcome=ok`. Ficam sob os domínios `rh`/`crm`/
`producao` do enum (camada 1 do RBAC). Não há fato, builder nem migration de
dado para esses 3. Quando o cliente passar a operar os módulos, viram ondas
futuras com fatos reais.

### 3.7 Caminho 3c funcional — `bi_consulta_avancada`

A F4 onda 1 entregou `bi_consulta_avancada` como **stub gated**. Esta spec o
torna **funcional**, dentro do escopo da F4 e respeitando `CLAUDE.md §5.5/§5.7`:

- A tool aceita um parâmetro `sql: string` — a **consulta SQL é gerada pelo
  agente** (text-to-SQL é responsabilidade do agente/F5; o MCP **não** embute
  LLM). O MCP é o **executor controlado**.
- **Guarda-corpos estruturais (não dependem de prompt):**
  1. A conexão usa um **role Postgres read-only dedicado** — `nexus_mcp_bi`
     (definido em `docs/superpowers/research/2026-05-17-f4-postgres-mcp-role.md`),
     com `SELECT` nas tabelas `fato_*`, `raw_*` e de apoio; **sem** escrita,
     sem DDL.
  2. Validação da query antes de executar: deve ser **uma única instrução
     `SELECT`** (ou `WITH … SELECT`); rejeita `;` múltiplo, `INSERT`/`UPDATE`/
     `DELETE`/`DROP`/`ALTER`/`GRANT`/`COPY`/`CALL` e qualquer DML/DDL.
  3. `statement_timeout` curto na sessão (ex.: 5 s) e `LIMIT` forçado (a tool
     envelopa a query ou rejeita resultado acima de N linhas, ex.: 1000).
  4. Permanece **gated** a `admin`/`super_admin` (camada 1).
  5. Toda execução gravada em `McpAuditLog` com a SQL como `params`.
- A resposta inclui o aviso fixo "consulta dinâmica não auditada como tool" e
  os dados em forma tabular. Erro de SQL → `outcome=error`, mensagem do
  Postgres saneada (sem vazar schema interno além do necessário).
- O role `nexus_mcp_bi` é criado por script de provisionamento versionado
  (`prisma/sql/`), análogo ao `nexus_mcp` da onda 1; o container `mcp` recebe
  uma `MCP_BI_DATABASE_URL` própria para essa conexão.

---

## 4. Modelo de dados (Prisma — schema compartilhado)

Adições (nenhuma alteração destrutiva): `model FatoPedido`,
`FatoPedidoParcela`, `FatoNotaFiscal`, `FatoNotaFiscalItem`, `FatoParceiro`,
`FatoContaContabil` — colunas/PK/índices conforme §3 e `research`. Enum
`ReportDomain` ganha 7 valores (§3.5). `FatoBuildState` ganha 6 entradas novas
(dados). Migrations versionadas. Role `nexus_mcp_bi` por script SQL.

## 5. Decomposição em ondas

| Onda | Entrega | Depende de |
|---|---|---|
| **A** | Schema (6 fatos + enum) + migrations | — |
| **B** | Comercial — 2 builders + 5 tools | A |
| **C** | Fiscal — 2 builders + 6 tools (mede build de 211k) | A |
| **D** | Cadastros — 1 builder + 3 tools; Contábil — 1 builder + 2 tools | A |
| **E** | RH/CRM/Produção — 3 tools "sem dado" | A |
| **F** | Caminho 3c funcional — role `nexus_mcp_bi`, executor SQL, guarda-corpos | A |

Cada onda: tasks bite-sized no plano, TDD, e **verificação end-to-end contra o
cache real obrigatória** (`CLAUDE.md §6` [9], regra de raiz) — popular os fatos,
subir o MCP, exercer as tools, conferir os números.

## 6. Testes e verificação

- Unitário (Jest): builders (mapeamento `raw`→`fato`, `selection`, `rawDeleted`,
  lookup de etapa), schemas Zod, handlers, RBAC dos domínios novos, validação
  da SQL do 3c (rejeição de DML/DDL/multi-statement).
- **E2E contra o cache real** (regra de raiz): por domínio, rebuild dos fatos +
  servidor MCP + chamada das tools, conferindo contagens/valores contra
  `SELECT` direto. Para o 3c: confirmar que `INSERT`/`UPDATE`/`DROP` e
  multi-statement são rejeitados e que o role `nexus_mcp_bi` não escreve.
- Verificação final: `tsc` (raiz + mcp), `eslint`, `jest`, `next build`,
  `docker compose build mcp` — verdes; harness de integração estendido com as
  tools novas (contagem total de tools atualizada).

## 7. Riscos

| Risco | Mitigação |
|---|---|
| `FatoNotaFiscalItem` 211k — rebuild lento | Onda C mede o tempo; `createMany` em lotes; gatilho p/ incremental se >60 s |
| `selection` de `pedido.tipo`/`conta.tipo` sem valores no discovery | Descoberta na execução: ler valores reais do `raw` |
| 3c — SQL malicioso/perigoso | Role read-only + validação SELECT-único + timeout + LIMIT + gate admin (§3.7) |
| Tools de domínio vazio (RH/CRM) parecerem quebradas | Handler responde mensagem honesta estruturada, `outcome=ok` |
| Campos contábeis reais divergirem do suposto | Descoberta na onda D antes de fixar colunas |

## 8. Notas

A F4 completa encerra o escopo §5.9 (todos os domínios). Domínios hoje vazios
(RH/CRM/produção) viram ondas futuras com fatos reais quando o cliente operar
os módulos. O refinamento de imposto nota-a-nota e o histórico de saldos
financeiros (`docs/RADAR.md`) permanecem como evolução pós-F4.
