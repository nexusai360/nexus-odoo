# F4 — MCP semântico — SPEC v3

> Fase F4 do roadmap (`CLAUDE.md §4`). Brainstorm em 2026-05-17 com o usuário.
> **v3 — versão final, base do plano.** Incorpora a Review #1 (23 achados) e a
> Review #2 (17 achados). Reviews em `docs/superpowers/reviews/`.
> Modo autônomo (`CLAUDE.md §6`).

---

## 1. Objetivo

Entregar o **servidor MCP semântico** do nexus-odoo: a camada que permite a um
agente de IA responder perguntas de negócio sobre a operação da Matrix Fitness
Group, consultando **exclusivamente o cache Postgres** por meio de **tools de
vocabulário de negócio** validadas, com **RBAC estrutural** e tratamento
honesto de perguntas fora do catálogo.

A F4 é o servidor MCP e nada além dele. A integração WhatsApp, o vínculo
número↔usuário, o emissor de token por usuário, o log de conversas e a
personalização da IA são **F5** (`CLAUDE.md §4`, decisão canônica §5.10).

## 2. Escopo

### 2.1 Dentro do escopo (F4 — onda 1)

- Container `mcp/` — servidor **Node puro** (TypeScript, sem Next) com
  `@modelcontextprotocol/sdk`, transporte **Streamable HTTP** sobre `node:http`,
  porta interna **3100**.
- **Camada de fatos do domínio financeiro** — 3 novos `fato_*` + builders no
  worker + **registry de builders** (ver 3.4).
- **Catálogo de tools semânticas** para **estoque** (6 tools, reusa a camada de
  query da F3 — ver 3.5.1) e **financeiro** (6 tools, consome os fatos novos).
- **RBAC estrutural de 7 camadas** (`CLAUDE.md §5.6`) — **5 ativas nesta fase,
  2 preparadas e documentadas** (ver 3.6 e nota #MN-3).
- **Contrato de identidade** — service token + `userId` da plataforma asserido
  **por sessão** (ver 3.3 e 3.3.1).
- **Caminho 3**: 3a (falta honesta + log de gap) e 3b (recusa educada)
  **funcionais**; 3c (modo BI) como **contrato + tool gated stub** — a
  integração funcional do 3c é uma **onda futura da F4** (ver 3.7, #IM-1).
- **`McpAuditLog`** e **`FeatureRequest`**.
- **Harness de teste MCP** — cliente de integração Streamable HTTP (ver 6).

### 2.2 Fora do escopo

- Domínios comercial, fiscal, contábil, produção — **ondas seguintes da F4**.
  O escopo "todos os domínios" (`§5.9`) permanece canônico; só a entrega é
  faseada (`§5.10`).
- **Integração funcional do 3c (Postgres MCP)** — **onda futura da F4** (não
  F5, não deploy; ver 3.7).
- WhatsApp, vínculo número↔usuário, **emissor de token por usuário**,
  pré-filtro de RBAC do agente, classificação 3a/3b/3c, log de conversas,
  personalização/RAG, `pgvector` — **F5**.
- Tela de UI no dashboard para gerir o MCP.

### 2.3 Decisão de faseamento (decisão #10)

A arquitetura completa do MCP é desenhada e validada com 2 domínios reais de
alto valor (estoque e financeiro). Modelar fatos de fiscal (44 tabelas SPED) ou
contábil antes de conhecer as perguntas violaria `docs/fatos-modelagem.md`.

---

## 3. Arquitetura

### 3.1 Posição no monorepo

```
nexus-odoo/
├── app/      → dashboard Next.js              (Server Actions de estoque viram wrappers — 3.5.1)
├── mcp/      → NOVO: servidor MCP (Node puro)  (container "mcp", porta 3100)
├── worker/   → cron + builders de fatos        (ganha builders financeiro + registry)
├── prisma/   → schema COMPARTILHADO            (ganha 3 fato_* + 2 tabelas)
└── docs/
```

O servidor MCP roda como container próprio, conecta ao mesmo Postgres cache, e
**nunca toca o Odoo** (decisão §5.1/§5.2). Toda resposta de tool carrega
`atualizadoEm` (ISO 8601) da última construção do fato consultado **e** o
estado da sincronização da fonte (ver 3.9, #IM-3).

### 3.2 Transporte e processo

- Container `mcp` é processo **Node puro** (alinhado ao `worker`, que roda com
  `tsx`), **não** Next. Servidor HTTP explícito via `node:http`, sobre o qual o
  `StreamableHTTPServerTransport` do `@modelcontextprotocol/sdk` é montado.
- `@modelcontextprotocol/sdk` é **dependência nova** — adicionada ao
  `package.json` na onda 4a (#IM-6).
- Porta interna **3100**, exposta **só na rede Docker interna** — o agente da
  F5 é o único cliente; sem exposição pública.
- Stateless quanto a conversa. O servidor mantém pool de conexão Postgres e um
  **cache de catálogo estático** (a definição das tools por domínio não muda em
  runtime; o que é filtrado por usuário é a *visibilidade*, não a definição).

### 3.3 Contrato de identidade

A F4 **não** depende de um JWT por usuário emitido pela plataforma — esse
emissor é F5. O contrato da F4:

- A conexão MCP é autenticada como o **serviço-agente** via **service token**.
- O `userId` do usuário final é asserido **por sessão** (não por chamada —
  decisão #CR-1/#IM-7): o agente abre uma sessão Streamable HTTP por conversa de
  WhatsApp e informa o `userId` no **estabelecimento da conexão**. O `userId`
  vale para a sessão inteira. Isso permite que `tools/list` seja filtrado por
  usuário (camada 1 do RBAC — ver 3.6).
- O `userId` é **sempre** o `User.id` da plataforma. Número de WhatsApp nunca
  chega ao MCP.
- O MCP **confia no serviço-agente autenticado** para asserir o `userId`
  correto — o agente é infraestrutura confiável na rede Docker. O endurecimento
  (token assinado por usuário) é F5.
- Ao abrir a sessão, o MCP resolve o `UserContext` do banco
  (`User` + `UserDomainAccess`). A cada **chamada de tool**, o MCP **recarrega**
  `role`/`domains` do banco (decisão #I7 — autorização nunca obsoleta; custo de
  2 queries indexadas aceito; sem cache).
- Se o `userId` não existe, ou `User.isActive=false` — na abertura da sessão
  **ou** numa recarga — a operação é negada (`outcome=denied`). Espelha o
  callback `jwt` de `src/auth.ts` (#I8).

```
UserContext = { userId: string, role: PlatformRole, domains: ReportDomain[] }
```

Não há `tenantId` (decisão #C1 — ver 3.6 camada 3).

### 3.3.1 Mecânica do service token e do `userId` (decisão #CR-1)

- **Service token:** segredo forte e estático em `.env` (`MCP_SERVICE_TOKEN`,
  fora do Git). Transportado no header HTTP `Authorization: Bearer <token>`.
  Validado num **middleware HTTP** que embrulha o servidor `node:http`
  **antes** de o corpo da requisição ser entregue ao
  `StreamableHTTPServerTransport`. Comparação **constant-time**
  (`crypto.timingSafeEqual`). Token ausente/inválido → HTTP 401, a requisição
  nunca chega ao transporte MCP. **Token estático nesta fase**; rotação é
  manual; o endurecimento (token por usuário, rotação automática) é F5.
- **`userId`:** transportado num header HTTP custom `X-Mcp-User-Id`, lido pelo
  mesmo middleware **no estabelecimento da sessão**. O middleware resolve o
  `UserContext` e o associa à sessão MCP (escopo de sessão do
  `StreamableHTTPServerTransport`, ou `AsyncLocalStorage` indexado pelo
  `sessionId`). O `userId` **não** é argumento das tools de negócio — os
  `inputSchema` Zod das tools contêm só parâmetros de negócio.
- **Verificação de viabilidade (onda 4a, primeira task):** confirmar, com o
  `@modelcontextprotocol/sdk` instalado, que o `StreamableHTTPServerTransport`
  permite (a) um middleware HTTP de pré-autenticação e (b) acesso ao
  `UserContext` de sessão dentro do handler de tool. Se a API do SDK divergir
  deste desenho, a onda 4a ajusta o mecanismo **antes** de qualquer tool — é a
  task de fundação e bloqueia as demais.

### 3.4 Camada de fatos — domínio financeiro

Três fatos novos, tabelas Prisma tipadas, builders no worker. **Modos das
fontes confirmados em `MODEL_CATALOG`:**

| Fato | Fonte `raw` | Modo da fonte | Builder roda em |
|---|---|---|---|
| `FatoFinanceiroSaldo` | `raw_finan_banco_saldo_hoje` | snapshot | `processSnapshotCycle` |
| `FatoFinanceiroMovimento` | `raw_finan_fluxo_caixa` | incremental | `processIncrementalCycle` |
| `FatoFinanceiroTitulo` | `raw_finan_pagamento_divida` | incremental | `processIncrementalCycle` |

**Registry de builders (decisão #C3).** Hoje os 3 builders de estoque são 3
`await import(...)` hard-coded em `processSnapshotCycle`
(`src/worker/sync/processors.ts`). A F4 introduz um registry
`FATO_BUILDERS: BuilderEntry[]`, cada entrada `{ nome, cycle:
"snapshot"|"incremental", run }`. `processSnapshotCycle` e
`processIncrementalCycle` iteram o registry filtrando por `cycle`. Os 3
builders de estoque atuais são **migrados** para o registry — refactor sem
mudança de comportamento, coberto por teste de não-regressão. Os 3 de
financeiro são novas entradas.

**Estratégia de rebuild (decisão #CR-2).** Todos os 3 builders fazem **rebuild
full** (`deleteMany` + `createMany` em transação + `markFatoBuilt`),
mantendo o padrão dos builders de estoque — simplicidade e idempotência. As
fontes `finan.fluxo.caixa` e `finan.pagamento.divida` são incrementais (só
crescem); o rebuild full é aceito para os volumes atuais (`finan.fluxo.caixa`
≈591 linhas, `finan.pagamento.divida` ≈1147 — censo da F0). **Gatilho de
revisão registrado:** se qualquer uma das fontes ultrapassar ~50k linhas,
reavaliar para build incremental por `odooId`. Todos os builders filtram
**`rawDeleted = false`** (igual aos de estoque) — linhas excluídas no Odoo não
entram no fato.

**`FatoFinanceiroSaldo`** — **foto do saldo de hoje, sem histórico** (decisão
#CR-5): a fonte `..._hoje` é snapshot só do dia; o fato não guarda série
temporal. Grão: **uma linha por conta bancária/caixa**. **PK lógica:
`bancoId`.** Rebuild full.
Colunas: `bancoId` (PK), `bancoNome`, `tipo` (`String` — banco/caixa),
`dataReferencia` (a data do snapshot vinda do Odoo — documentada como data de
referência da foto, **não** chave), `saldoAnterior`, `entrada`, `saida`,
`saldo`, `atualizadoEm`.
> Gap registrado: "saldo histórico por conta" exige a fonte `finan.banco.saldo`
> (incremental) e outro fato — onda futura, não F4 onda 1.

**`FatoFinanceiroMovimento`** — grão: **uma linha por registro de
`raw_finan_fluxo_caixa`**. **PK: `odooId`.** Rebuild full.
Colunas: `odooId` (PK), `data`, `contaId`, `contaNome`, `centroResultadoId`,
`centroResultadoNome`, `entrada`, `saida`, `valor`, `entradaPrevista`,
`saidaPrevista`, `valorPrevisto`, `atualizadoEm`.
> **Descoberta bloqueante da onda 4b (decisão #IM-2):** confirmar contra
> amostra de `raw_finan_fluxo_caixa` se "realizado" e "previsto" coexistem na
> mesma linha (colunas `entrada` + `entrada_prevista` preenchidas juntas) ou
> são linhas distintas. Se forem linhas distintas, acrescentar uma coluna
> discriminadora (`natureza`: realizado/previsto) ao fato. A modelagem acima
> assume coexistência; a descoberta confirma ou corrige.

**`FatoFinanceiroTitulo`** — grão: **uma linha por registro de
`raw_finan_pagamento_divida`** (título a pagar/receber). **PK: `odooId`.**
Rebuild full. **`diasAtraso` NÃO é materializado** (#C5/#I1: atraso muda todo
dia) — é calculado **na query da tool** a partir de `dataVencimento` e da data
corrente.
Colunas: `odooId` (PK), `tipo` (`String` — a_pagar/a_receber, derivado de
`tipo`/`sinal`), `participanteId`, `participanteNome`, `contaId`, `contaNome`,
`numeroDocumento`, `dataDocumento`, `dataVencimento`, `dataPagamento`,
`situacao` (`String`), `situacaoSimples` (`String`), `vrDocumento`, `vrSaldo`,
`vrTotal`, `vrJuros`, `vrMulta`, `vrDesconto`, `atualizadoEm`.

> **Enums de `selection` (decisão #MN-2):** `tipo`, `situacao`,
> `situacaoSimples` são **`String`** no fato — **não** enum Prisma. Tarefa de
> descoberta no plano: ler os valores reais do `selection` do Odoo a partir de
> amostra de `raw` e documentar a normalização. `String` é fail-safe contra a
> Tauga introduzir um valor novo (a customização SPED muda).

Builders: `fato-financeiro-saldo.ts`, `fato-financeiro-movimento.ts`,
`fato-financeiro-titulo.ts` em `src/worker/fatos/`, registrados no registry.

### 3.5 Catálogo de tools semânticas

Catálogo declarativo **próprio do MCP** (#I2). Cada entrada: `id`, `dominio`
(`ReportDomain`), `descricao`, `inputSchema` (Zod), `outputSchema` (Zod),
`handler`. Um registry monta as tools MCP a partir do catálogo; a *visibilidade*
por usuário é aplicada na listagem (camada 1).

#### 3.5.1 Reuso da camada de query da F3 — reestruturação (decisão #CR-3)

A lógica de agregação dos relatórios de estoque vive em
`src/lib/actions/report-data.ts`, **acoplada ao request do Next** em três eixos:
`guardDominio()` (→ `auth()` → `headers()`), `requireReport()`/`getReport()` (o
catálogo de UI) e `reportFreshness()`. **Não é "lógica pura"** — está fundida
com RBAC do dashboard, catálogo de UI e shaping para Recharts. Extrair é uma
**reestruturação**, não um "mover código". O desenho:

1. **Núcleo de agregação extraído** — novo módulo `src/lib/reports/queries/estoque.ts`,
   **framework-neutro, sem `"use server"`**. Recebe `prisma` e os filtros como
   argumentos; **não** chama `guardDominio`, `getReport` nem `reportFreshness`;
   devolve **dado de agregação cru** (sem `estado`/`freshness`/shaping de
   gráfico). É o miolo `Map`/`reduce` sobre os fatos de estoque.
2. **Server Actions da F3 viram wrappers finos** — `report-data.ts` mantém as
   funções `getRelatorio*` como `"use server"`, agora fazendo: `guardDominio`
   + chamada ao núcleo + `reportFreshness` + shaping para a UI. Comportamento
   externo idêntico.
3. **Tools de estoque do MCP** — outro wrapper: RBAC do MCP (camadas 1/2/6) +
   chamada ao **mesmo núcleo** + shaping para o agente + `atualizadoEm`/estado
   de fonte (3.9).
4. **Testes** — `report-data.test.ts` testa o contrato antigo; é **revisto**:
   a parte de agregação migra para um novo `estoque.test.ts` (testa o núcleo);
   a parte de guard/freshness/shaping permanece testando o wrapper. Isso **não
   é** "refactor coberto pelos testes existentes" — a fronteira de teste se
   move.

Confirmar na descoberta que a F3 não deixou `fato_estoque_saldo` marcado para
substituição (`docs/fatos-modelagem.md`).

#### 3.5.2 Tools de estoque

| Tool | Pergunta-alvo | Fato |
|---|---|---|
| `estoque_saldo_produto` | "Quantas unidades tenho do produto X? Onde está?" | `fato_estoque_saldo` |
| `estoque_valor_armazem` | "Quanto tenho em estoque, **a preço de custo**, por armazém?" | `fato_estoque_saldo` |
| `estoque_entradas_saidas` | "Como estão entradas e saídas por mês?" | `fato_estoque_movimento` |
| `estoque_top_movimentados` | "Quais produtos mais se movimentaram?" | `fato_estoque_movimento` |
| `estoque_produtos_parados` | "Quais produtos estão parados / imobilizados?" | `fato_produto_parado` |
| `estoque_concentracao` | "Como o valor de estoque se distribui por família/marca?" | `fato_estoque_saldo` |

> Valor de estoque é a **preço de custo** (`vr_saldo`), não de venda.

#### 3.5.3 Tools de financeiro

| Tool | Pergunta-alvo | Fato |
|---|---|---|
| `financeiro_saldo_contas` | "Qual o saldo de cada conta/banco hoje?" | `fato_financeiro_saldo` |
| `financeiro_caixa_periodo` | "Quanto entrou e saiu do caixa no período?" | `fato_financeiro_movimento` |
| `financeiro_fluxo_caixa` | "Como está o fluxo de caixa projetado?" | `fato_financeiro_movimento` |
| `financeiro_contas_a_receber` | "Quanto tenho a receber? Vencendo quando?" | `fato_financeiro_titulo` |
| `financeiro_contas_a_pagar` | "Quanto tenho a pagar? Boletos a vencer?" | `fato_financeiro_titulo` |
| `financeiro_titulos_vencidos` | "Quais títulos estão vencidos / boletos não pagos?" | `fato_financeiro_titulo` |

### 3.6 RBAC estrutural — 7 camadas

Defesa em profundidade. O MCP é a **última linha** — independente de qualquer
pré-filtro do agente (F5). **Nota #MN-3:** as 7 camadas são a *arquitetura*;
nesta fase **5 são controles ativos** e **2 (camada 3 tenant, camada 5 RLS)
são preparadas e documentadas** como pontos de extensão — ver abaixo. As
camadas **1, 2 e 6 fazem parte da definição de "uma tool"** e são exercidas por
toda tool desde a onda 4c-2.

1. **Catálogo filtrado por usuário (ativa)** — em `tools/list`, só aparecem as
   tools dos domínios do `UserContext` da sessão (`visibleDomains`).
   Privilegiados (`admin`/`super_admin`) veem tudo. Funciona porque o `userId`
   é conhecido desde a abertura da sessão (3.3).
2. **Validação no handler (ativa)** — toda tool revalida o domínio contra o
   `UserContext` (recarregado) no início do handler.
3. **Scoping de tenant (preparada, no-op documentado)** — a plataforma tem
   **um único tenant**; não há coluna `tenantId` em nenhum modelo (F1/F2/F3 não
   criaram). Camada mantida como princípio e ponto de extensão; **hoje não
   aplica filtro** — documentar no código como no-op explícito, não disfarçar
   de controle. (As 20 `res.company` da Tauga são entidades legais internas do
   cliente; eventual filtro de tool por empresa seria requisito de produto, não
   RBAC.)
4. **User Postgres com GRANT mínimo (ativa)** — o container `mcp` recebe
   **`DATABASE_URL` própria** com o role `nexus_mcp`: `SELECT` em `fato_*` e nas
   tabelas de apoio de leitura (`User`, `UserDomainAccess`, `SyncState`,
   `FatoBuildState`); `INSERT` em `McpAuditLog` e `feature_requests`; **nada
   mais** — sem `raw_*`, sem `UPDATE`/`DELETE`, sem `SELECT` em `McpAuditLog`.
   O **worker** mantém sua `DATABASE_URL` própria (#I6). Role criado por script
   de provisionamento versionado.
5. **RLS (preparada, desabilitada)** — Row-Level Security documentada, **sem
   política ativa** nesta fase de tenant único (coerente com a camada 3).
6. **Validação Zod (ativa)** — todo input passa pelo `inputSchema` antes do
   handler; inválido → `outcome=invalid_input`, erro estruturado, sem tocar o
   banco.
7. **Audit + rate limit (ativa)** — toda invocação gravada em `McpAuditLog`
   (3.8). Rate limit (#C8): **novo** rate limiter, padrão de
   `src/lib/rate-limit.ts` (Redis `INCR`+`EXPIRE`) mas chave/limites próprios —
   **não** reuso de `checkLoginRateLimit`. Chave `mcp:rate:{userId}`, **60
   chamadas/min por `userId`**. Decisão #IM-4: o limite é **por `userId`
   apenas** — não há balde global por service token, porque o agente é
   infraestrutura confiável na rede interna (mesma premissa do contrato de
   identidade); endurecer com teto global é F5. Estouro → `outcome=denied`.

### 3.7 Caminho 3 — perguntas fora do catálogo

- **3a — métrica fora do escopo (funcional na F4).** Uma **tool**
  `registrar_lacuna` (decisão #MN-4 — é uma tool que o agente chama; o
  *roteamento*, decidir quando chamá-la, é do agente/F5) registra a pergunta
  não coberta → resposta de falta honesta + `INSERT` em `feature_requests`
  (`{ userId, perguntaResumo, dominio?, criadoEm }`).
- **3b — fora do escopo de negócio (funcional na F4).** Contrato de recusa
  educada: a F4 entrega a mensagem-padrão e o ponto onde o agente a aciona.
- **3c — modo BI (contrato + stub gated na F4).** Decisão **#C6/#IM-1:** a F4
  entrega (1) a tool `bi_consulta_avancada` **gated** — visível/invocável só
  para `admin`/`super_admin` (não existe perfil "analista"); (2) o handler stub
  respondendo "modo BI ainda não disponível nesta fase" + aviso de "consulta
  dinâmica não auditada"; (3) a definição documentada do role Postgres
  read-only do futuro Postgres MCP. **A integração funcional do 3c é uma onda
  futura da F4** — não F5, não "configuração de deploy". A F4 onda 1 entrega o
  Caminho 3 com 3a/3b funcionais e 3c em estado de stub. A F4 **não** embute
  text-to-SQL nem classificador de linguagem natural.

### 3.8 Logs

- **`McpAuditLog`** (append-only, 7ª camada): `id`, `userId`, `tool`, `params`
  (JSON — **inputs estruturados íntegros**; a tabela é protegida pela camada 4:
  role `nexus_mcp` tem `INSERT` sem `SELECT`), `outcome`
  (`ok`/`denied`/`error`/`invalid_input`), `rowCount`, `durationMs`, `criadoEm`.
  **Retenção (#IM-5):** sem expurgo na F4 — coerente com o `AuditLog` da F1, que
  também não tem. Gap registrado: job de expurgo do `McpAuditLog` é trabalho de
  operação a revisar na F5 (o volume do MCP é maior — um agente dispara N tools
  por pergunta).
- **`FeatureRequest`** (model `FeatureRequest`, tabela `feature_requests`):
  gaps do Caminho 3a. `perguntaResumo` — único campo de texto livre — gravado
  como recebido (resumo curto enviado pelo agente, não a mensagem bruta).

Ambos registram **tool calls / gaps**, não conversas. O log de conversas é F5.

### 3.9 Comportamento sob falha (decisões #I3, #IM-3)

Toda tool, antes de responder, consulta `FatoBuildState` do(s) fato(s) que usa
e o `SyncState` da(s) fonte(s):

- **`FatoBuildState` ausente em qualquer fato usado** (builder nunca rodou) →
  resposta "este indicador ainda não foi processado"; `outcome=ok`. Regra
  multi-fato: **se qualquer** fato usado não tem `FatoBuildState`, vale esta
  resposta.
- **`FatoBuildState` presente, fato com zero linhas** → "não há registros para
  o filtro informado"; `outcome=ok`.
- **Erro de conexão Postgres / exceção inesperada** → `outcome=error`, mensagem
  genérica ao agente (sem vazar detalhe interno), erro logado no servidor.
- **Domínio negado / usuário inativo / rate limit** → `outcome=denied`.
- **Input inválido (Zod)** → `outcome=invalid_input`.

**Frescor do dado (decisão #IM-3, alinha §5.2).** A tool devolve **dois
sinais**: `atualizadoEm` (do `FatoBuildState` — quando o fato foi montado) e
`fonteStatus` (derivado do `SyncState` da fonte — `lastStatus` e o timestamp
do último ciclo de sync bem-sucedido). Assim o agente distingue "fato montado
há 2 min sobre dado fresco" de "fato montado há 2 min, mas o Odoo está
inacessível há 6h". Sem isto, um Odoo caído ficaria mascarado.

> **#MN-1:** as 3 entradas de `FatoBuildState` dos fatos de financeiro só
> existem **após** o primeiro ciclo de sync pós-deploy. Até lá, as tools de
> financeiro respondem "indicador ainda não processado" — comportamento
> correto, não bug; registrar na verificação para não soar como falha.

---

## 4. Modelo de dados (Prisma — schema compartilhado)

Adições ao `prisma/schema.prisma` (nenhuma alteração destrutiva):

- `model FatoFinanceiroSaldo` — colunas/PK de 3.4. Índices: PK `bancoId`.
- `model FatoFinanceiroMovimento` — colunas/PK de 3.4. Índices: PK `odooId`,
  índice em `data` (filtro por período das tools).
- `model FatoFinanceiroTitulo` — colunas/PK de 3.4. Índices: PK `odooId`,
  índices em `dataVencimento` e `tipo` (filtros das tools de a pagar/receber/
  vencidos).
- `model McpAuditLog` — colunas de 3.8. Índice em `(userId, criadoEm)`.
- `model FeatureRequest` (`@@map("feature_requests")`) — colunas de 3.8.
- Enum `ReportDomain` já cobre `financeiro` — sem mudança.
- `FatoBuildState` ganha 3 entradas novas (dados, não schema — #MN-1).

Migrations Prisma versionadas. O role Postgres `nexus_mcp` (camada 4) é criado
por **script de provisionamento versionado** (`prisma/sql/` ou `scripts/`),
documentado no runbook; não é migration de modelo.

> `ReportDomain`/`UserDomainAccess` (#M2): o MCP reusa o mesmo enum de domínio
> dos relatórios. A equivalência é **intencional** — conceder "financeiro" a um
> usuário libera os relatórios **e** as tools MCP de financeiro. Registrado
> para ciência do produto.

---

## 5. Decomposição em sub-fases (ondas de execução)

| Onda | Entrega | Depende de |
|---|---|---|
| **4a** | Fundação: dep `@modelcontextprotocol/sdk`; container `mcp` Node puro (porta 3100); servidor `node:http` + `StreamableHTTPServerTransport`; **verificação de viabilidade do SDK** (3.3.1); middleware de service token (constant-time) + resolução de `UserContext` por sessão; recarga de `role`/`domains` por chamada + checagem `isActive`; registry de catálogo de tools com camadas 1/2/6 embutidas; `McpAuditLog` + gravação de audit | — |
| **4b** | Fatos de financeiro: **descoberta** dos enums de `selection` e da estrutura realizado/previsto (#IM-2); 3 modelos Prisma + migration; **registry de builders** (migra os 3 de estoque, teste de não-regressão); 3 builders de financeiro plugados nos ciclos corretos | 4a (schema) |
| **4c-1** | Estoque: reestruturação da camada de query (3.5.1) — núcleo `estoque.ts` neutro + Server Actions da F3 viram wrappers + revisão de `report-data.test.ts` + novo `estoque.test.ts` | 4a |
| **4c-2** | 6 tools de estoque sobre o núcleo (o plano subdivide por par de tools) | 4c-1 |
| **4c-3** | Tool `registrar_lacuna` (Caminho 3a) + `feature_requests` | 4a |
| **4d-1** | Tools de financeiro de saldo/caixa: `financeiro_saldo_contas`, `financeiro_caixa_periodo`, `financeiro_fluxo_caixa` | 4b, 4c-2 |
| **4d-2** | Tools de financeiro de títulos: `financeiro_contas_a_receber`, `financeiro_contas_a_pagar`, `financeiro_titulos_vencidos` (inclui cálculo de `diasAtraso` na query) | 4b, 4c-2 |
| **4e** | Caminho 3: contrato de recusa 3b + tool `bi_consulta_avancada` gated stub (3c) | 4a, 4c-2 |
| **4f-1** | Role Postgres `nexus_mcp` + GRANT mínimo (script) + `DATABASE_URL` própria do container `mcp` (camada 4) | 4a |
| **4f-2** | RLS preparada e documentada, desabilitada (camada 5) | 4f-1 |
| **4f-3** | Rate limiter do MCP (camada 7) | 4a |
| **4f-4** | Harness de teste de integração MCP (Streamable HTTP) | 4c-2, 4d-2, 4e |

A **verificação ponta a ponta** é a etapa [9] do workflow, sobre o harness de
4f-4. O plano (etapa [5]) desce cada onda a microtarefas (uma por tool / por
arquivo / por ação).

---

## 6. Testes e verificação

- **Unitário** (Jest): builders de fato (mapeamento `raw`→`fato`, enums de
  `selection`, filtro `rawDeleted`), registry de builders (não-regressão dos 3
  de estoque), núcleo de query `estoque.ts`, schemas Zod, handlers de tool,
  filtro de catálogo por RBAC, resolução de `UserContext` + recarga +
  `isActive`, cálculo de `diasAtraso` na query, gravação de audit, rate
  limiter, comportamento sob falha (3.9).
- **Harness de teste MCP (entregável — onda 4f-4):** cliente de integração
  Streamable HTTP que autentica com service token de teste, abre sessão com
  `userId` de teste, exerce cada tool com `UserContext` de cada perfil
  (`super_admin`/`admin`/`manager`/`viewer`) e confirma o RBAC (catálogo
  filtrado em `tools/list`, negação no handler, gate de 3c). É o único cliente
  possível na F4 — o agente real é F5.
- **Teste de paridade dashboard×MCP (decisão #IM-8):** como as tools de estoque
  e as Server Actions da F3 chamam **literalmente a mesma função-núcleo** de
  `estoque.ts`, a paridade de números é garantida por construção. O teste
  verifica que ambos os wrappers **delegam ao núcleo** (não recomputam
  agregação por conta própria) — não compara as saídas finais, que têm formatos
  distintos de propósito (UI vs. agente).
- **Verificação final (decisão #IM-6 — toolchains separadas):**
  `npx tsc --noEmit`, `npx eslint`, `npx jest` valem para todo o monorepo;
  `npx next build` vale **só para `app/`**; o `mcp/` tem seu **build de
  container próprio** (Node puro). CI verde.
- **Critério de aceite por tool:** responde a pergunta-alvo (3.5.2/3.5.3) com
  dado do cache, `atualizadoEm` e `fonteStatus` (3.9); nega corretamente quando
  o perfil não tem o domínio; rejeita input inválido com erro estruturado;
  cobre os casos de falha de 3.9.

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| API do `@modelcontextprotocol/sdk` não permitir o middleware de pré-auth / `UserContext` de sessão como desenhado | Task de **verificação de viabilidade** é a primeira de 4a e bloqueia as demais (3.3.1) |
| Valores de `selection` do Odoo desconhecidos | Descoberta bloqueante da onda 4b; campos no fato são `String`, não enum (#MN-2) |
| Estrutura realizado/previsto de `finan.fluxo.caixa` incerta | Descoberta bloqueante da onda 4b (#IM-2) |
| Extração da camada de query quebrar a F3 | Reestruturação explícita (3.5.1); Server Actions viram wrappers; testes revistos; paridade por construção |
| Rebuild full sobre fonte incremental degradar | Volumes atuais baixos; gatilho de revisão em ~50k linhas (#CR-2) |
| `rawDeleted` esquecido nos builders | Spec exige filtro `rawDeleted=false` nos 3 builders (#CR-2) |
| Contrato de identidade depende de peça da F5 | F4 usa service token + `userId` por sessão; testável com token de teste |
| Camada 3/5 sem dimensão de dados | Tenant único; documentadas como no-op/preparada, não disfarçadas (#C1/#MN-3) |
| MCP herdar a `DATABASE_URL` do worker anula a camada 4 | `DATABASE_URL` própria do `mcp` com role `nexus_mcp` (#I6) |
| `McpAuditLog` cresce sem expurgo | Gap registrado; job de expurgo é trabalho de operação a revisar na F5 (#IM-5) |
| Odoo caído mascarado por `atualizadoEm` do fato | Tool devolve também `fonteStatus` do `SyncState` (#IM-3) |

## 8. Itens deixados explícitos para a F5

Registrado aqui e em `CLAUDE.md §4`/§5.10: vínculo número de WhatsApp↔`userId`
(campo no `User`, criado pela F5), **emissor de token assinado por usuário** e
rotação automática, pré-filtro de RBAC do agente, classificação 3a/3b/3c da
pergunta, log de conversas em Postgres relacional, BI de perguntas mais feitas,
personalização da IA com `pgvector` no Postgres existente, job de expurgo do
`McpAuditLog`, eventual teto global de rate limit. A integração funcional do
3c (Postgres MCP) é **onda futura da F4**, não F5. Nada disso é banco vetorial
separado.
