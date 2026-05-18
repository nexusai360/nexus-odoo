# F4 — MCP semântico — SPEC v2

> Fase F4 do roadmap (`CLAUDE.md §4`). Brainstorm em 2026-05-17 com o usuário.
> **v2** — incorpora a Review #1 (`docs/superpowers/reviews/2026-05-17-f4-spec-review-1.md`,
> 23 achados: 9 críticos, 9 importantes, 5 menores). A Review #2 gera a v3.
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

- Container `mcp/` — servidor TypeScript com `@modelcontextprotocol/sdk`,
  transporte **Streamable HTTP**, porta interna **3100**.
- **Camada de fatos do domínio financeiro** — 3 novos `fato_*` + builders no
  worker + **registry de builders** (ver 3.4), no padrão F2/F3.
- **Catálogo de tools semânticas** para **estoque** (6 tools, reusa a camada de
  query da F3 — ver 3.5.1) e **financeiro** (6 tools, consome os fatos novos).
- **RBAC estrutural de 7 camadas** (`CLAUDE.md §5.6`), com as camadas 1/2/6 já
  embutidas na definição de toda tool (ver 3.6).
- **Contrato de identidade** — autenticação de serviço + `userId` da plataforma
  asserido por chamada (ver 3.3).
- **Caminho 3**: 3a (falta honesta + log de gap) e 3b (recusa educada)
  **completos**; 3c (modo BI) entregue como **contrato + tool gated stub**
  (ver 3.7).
- **`McpAuditLog`** — auditoria de toda invocação de tool.
- **`FeatureRequest`** — registro de gaps do Caminho 3a.
- **Harness de teste MCP** — cliente de integração que fala Streamable HTTP
  (ver 6).

### 2.2 Fora do escopo (ondas seguintes da F4 ou F5)

- Domínios comercial, fiscal, contábil, produção — **ondas seguintes da F4**.
  O escopo "todos os domínios" (`§5.9`) permanece canônico; só a entrega é
  faseada (`§5.10`).
- WhatsApp, vínculo número↔usuário, **emissor de token por usuário**,
  pré-filtro de RBAC do agente, log de conversas, personalização/RAG,
  `pgvector` — **F5**.
- **Integração efetiva do Postgres MCP (3c)** — só o contrato e o stub gated
  são F4; a fiação do servidor Postgres MCP é configuração de deploy/F5
  (ver 3.7, decisão #C6).
- Tela de UI no dashboard para gerir o MCP.

### 2.3 Decisão de faseamento (decisão #10)

A arquitetura completa do MCP é desenhada e validada com 2 domínios reais de
alto valor (estoque e financeiro). Modelar fatos de fiscal (44 tabelas SPED) ou
contábil antes de conhecer as perguntas violaria `docs/fatos-modelagem.md`.
Domínios seguintes entram como trabalho repetitivo de baixo risco sobre a base
pronta.

---

## 3. Arquitetura

### 3.1 Posição no monorepo

```
nexus-odoo/
├── app/      → dashboard Next.js              (ganha extração de query — 3.5.1)
├── mcp/      → NOVO: servidor MCP semântico    (container "mcp", porta 3100)
├── worker/   → cron + builders de fatos        (ganha builders financeiro + registry)
├── prisma/   → schema COMPARTILHADO            (ganha 3 fato_* + 2 tabelas)
└── docs/
```

O servidor MCP roda como container próprio, conecta ao mesmo Postgres cache, e
**nunca toca o Odoo** (decisão §5.1/§5.2). Toda resposta de tool carrega
`atualizadoEm` (ISO 8601) da última construção do fato consultado, derivado de
`FatoBuildState`. O texto relativo ("há X min") é responsabilidade de quem
exibe (o agente) — a tool devolve só o timestamp ISO (decisão #M3).

### 3.2 Transporte e processo

- Servidor MCP Streamable HTTP (`@modelcontextprotocol/sdk`), porta interna
  **3100**, exposto **só na rede Docker interna** — o agente da F5 é o único
  cliente; sem exposição pública nesta fase.
- Stateless quanto a conversa: cada requisição é autônoma. O servidor mantém
  pool de conexão Postgres e um **cache de catálogo estático** (a lista de
  tools por domínio não muda em runtime).

### 3.3 Contrato de identidade (decisão #C2 — revista)

A F4 **não** depende de um JWT por usuário emitido pela plataforma — esse
emissor não existe e é F5. O contrato da F4 é mais simples e honesto:

- A sessão MCP é autenticada como o **serviço-agente** via **service token**
  (segredo forte em `.env`, fora do Git; o container `mcp` o valida em todo
  request HTTP antes de qualquer handler MCP). Sem service token válido →
  conexão recusada.
- O `userId` do usuário final viaja **por chamada**, como parâmetro de contexto
  da requisição (não parâmetro de tool de negócio). O MCP **confia no
  serviço-agente autenticado** para asserir o `userId` correto — o agente é
  infraestrutura confiável dentro da rede Docker. O endurecimento dessa
  asserção (token assinado por usuário) é F5.
- O `userId` é **sempre** o `User.id` da plataforma. Número de WhatsApp nunca
  chega ao MCP.
- A cada chamada, o MCP **recarrega** `role` e `domains` do banco
  (`User` + `UserDomainAccess`). Decisão de performance (#I7): recarga sempre,
  autorização nunca obsoleta; custo de 2 queries indexadas por chamada é
  aceito; sem cache de `UserContext` nesta fase.
- Se o `userId` não existe, ou `User.isActive=false`, a chamada é negada
  (`outcome=denied`), independentemente de tudo o mais (#I8). Espelha o
  callback `jwt` de `src/auth.ts`.

```
UserContext = { userId: string, role: PlatformRole, domains: ReportDomain[] }
```

Não há `tenantId` (decisão #C1 — ver 3.6 camada 3).

### 3.4 Camada de fatos — domínio financeiro

Três fatos novos, tabelas Prisma tipadas, builders no worker. **Modos das
fontes confirmados em `MODEL_CATALOG`:**

| Fato | Fonte `raw` | Modo da fonte | Builder roda em |
|---|---|---|---|
| `FatoFinanceiroSaldo` | `raw_finan_banco_saldo_hoje` | snapshot | `processSnapshotCycle` |
| `FatoFinanceiroMovimento` | `raw_finan_fluxo_caixa` | incremental | `processIncrementalCycle` |
| `FatoFinanceiroTitulo` | `raw_finan_pagamento_divida` | incremental | `processIncrementalCycle` |

**Registry de builders (decisão #C3).** Hoje os 3 builders de estoque são 3
`await import(...)` hard-coded no fim de `processSnapshotCycle`
(`src/worker/sync/processors.ts`). Como o §5.9 prevê fatos de **todos os
domínios**, a F4 introduz um **registry**: `FATO_BUILDERS: BuilderEntry[]`, cada
entrada com `{ nome, cycle: "snapshot"|"incremental", run }`. `processSnapshotCycle`
e `processIncrementalCycle` iteram o registry filtrando por `cycle`. Os 3
builders de estoque atuais são migrados para o registry (refactor sem mudança de
comportamento, coberto por teste). Os 3 de financeiro são novas entradas.

**`FatoFinanceiroSaldo`** — grão: **uma linha por conta bancária/caixa**
(snapshot do saldo de hoje). **PK lógica: `bancoId`** (`odooId` do registro de
snapshot rotaciona — não serve como identidade; decisão #C5). Rebuild:
`deleteMany` + `createMany` em transação + `markFatoBuilt`.
Colunas: `bancoId` (PK), `bancoNome`, `tipo` (banco/caixa — `selection`),
`data`, `saldoAnterior`, `entrada`, `saida`, `saldo`, `atualizadoEm`.

**`FatoFinanceiroMovimento`** — grão: **uma linha por registro de
`raw_finan_fluxo_caixa`** (lançamento de fluxo de caixa). **PK: `odooId`.**
Rebuild full. A fonte fornece colunas realizadas **e previstas** (confirmado na
descoberta: `entrada`, `saida`, `valor`, `entrada_prevista`, `saida_prevista`,
`valor_previsto`).
Colunas: `odooId` (PK), `data`, `contaId`, `contaNome`, `centroResultadoId`,
`centroResultadoNome`, `entrada`, `saida`, `valor`, `entradaPrevista`,
`saidaPrevista`, `valorPrevisto`, `atualizadoEm`.

**`FatoFinanceiroTitulo`** — grão: **uma linha por registro de
`raw_finan_pagamento_divida`** (título a pagar/receber). **PK: `odooId`.**
Rebuild full. **`diasAtraso` NÃO é materializado** (decisão #C5/#I1: atraso
muda todo dia e ficaria obsoleto entre rebuilds) — é calculado **na query da
tool**, a partir de `dataVencimento` e da data corrente.
Colunas: `odooId` (PK), `tipo` (a_pagar/a_receber — derivado de `tipo`/`sinal`
do Odoo), `participanteId`, `participanteNome`, `contaId`, `contaNome`,
`numeroDocumento`, `dataDocumento`, `dataVencimento`, `dataPagamento`,
`situacao`, `situacaoSimples`, `vrDocumento`, `vrSaldo`, `vrTotal`, `vrJuros`,
`vrMulta`, `vrDesconto`, `atualizadoEm`.

> **Tarefa de descoberta no plano:** ler os valores reais dos campos
> `selection` do Odoo (`tipo`, `situacao`, `situacao_divida_simples`, `sinal`)
> a partir de amostra de `raw` antes de fixar os enums. Sem inventar enum.

Builders: `fato-financeiro-saldo.ts`, `fato-financeiro-movimento.ts`,
`fato-financeiro-titulo.ts` em `src/worker/fatos/`, registrados no registry.

### 3.5 Catálogo de tools semânticas

Catálogo declarativo **próprio do MCP** (decisão #I2 — não a estrutura de
`src/lib/reports/catalog.ts`, que é vocabulário de UI; reaproveita-se a **ideia**
de catálogo declarativo + filtro por domínio como `reportsForUser`). Cada
entrada: `id`, `dominio` (`ReportDomain`), `descricao`, `inputSchema` (Zod),
`outputSchema` (Zod), `handler`. Um registry monta as tools MCP a partir do
catálogo.

#### 3.5.1 Reuso da camada de query da F3 (decisão #C4)

A lógica de agregação dos relatórios de estoque vive hoje em
`src/lib/actions/report-data.ts` (`getRelatorioSaldoProduto`,
`getRelatorioValorPorArmazem`, etc.), acoplada a Server Actions do Next.js. As
tools de estoque do MCP **precisam dos mesmos números** — divergência entre
dashboard e WhatsApp é inaceitável.

A F4 **extrai** a lógica pura de query/agregação de estoque de `report-data.ts`
para um módulo neutro de framework — `src/lib/reports/queries/estoque.ts` —
importável tanto pelas Server Actions da F3 quanto pelas tools do MCP. As
Server Actions da F3 passam a chamar o módulo extraído (refactor sem mudança de
comportamento, coberto pelos testes existentes de `report-data.test.ts`). As
tools de estoque do MCP chamam o mesmo módulo. Isso é trabalho explícito da
onda 4c, **antes** de construir as tools. Confirmar na descoberta que a F3 não
deixou `fato_estoque_saldo` marcado para substituição.

#### 3.5.2 Tools de estoque (consomem o módulo extraído + os 3 fatos da F3)

| Tool | Pergunta-alvo | Fato |
|---|---|---|
| `estoque_saldo_produto` | "Quantas unidades tenho do produto X? Onde está?" | `fato_estoque_saldo` |
| `estoque_valor_armazem` | "Quanto tenho em estoque, **a preço de custo**, por armazém?" | `fato_estoque_saldo` |
| `estoque_entradas_saidas` | "Como estão entradas e saídas por mês?" | `fato_estoque_movimento` |
| `estoque_top_movimentados` | "Quais produtos mais se movimentaram?" | `fato_estoque_movimento` |
| `estoque_produtos_parados` | "Quais produtos estão parados / imobilizados?" | `fato_produto_parado` |
| `estoque_concentracao` | "Como o valor de estoque se distribui por família/marca?" | `fato_estoque_saldo` |

> Valor de estoque é a **preço de custo** (`vr_saldo`), não de venda —
> requisito explícito do usuário.

#### 3.5.3 Tools de financeiro (consomem os fatos novos)

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
pré-filtro do agente (F5). As camadas **1, 2 e 6 fazem parte da definição de
"uma tool"** e são exercidas por toda tool de estoque/financeiro/Caminho 3
desde a onda 4c — não são "hardening" posterior (decisão #C7).

1. **Catálogo filtrado por usuário** — na listagem de tools (`tools/list` do
   MCP), só aparecem as tools dos domínios que o `UserContext` concede
   (`visibleDomains`). Privilegiados (`admin`/`super_admin`) veem tudo.
2. **Validação no handler** — toda tool revalida o domínio contra o
   `UserContext` no início do handler, mesmo com o catálogo já filtrado.
3. **Scoping de tenant** — **decisão #C1:** a plataforma tem **um único
   tenant** (o cliente Matrix Fitness Group, uma instância Odoo). Não há, nem
   em F1/F2/F3, coluna `tenantId` em nenhum modelo. Esta camada é mantida como
   **princípio arquitetural e ponto de extensão documentado**, mas hoje é um
   **no-op explícito** — não há dimensão de tenant para filtrar. (As 20
   `res.company` da instância Tauga são entidades legais internas do cliente,
   não tenants da plataforma; filtrar tools por empresa Odoo seria um requisito
   de produto novo, não RBAC — fica registrado como possível dimensão futura de
   filtro de tool, não de RBAC.) Documentar isto no código, sem disfarçar de
   controle ativo.
4. **User Postgres com GRANT mínimo** — o container `mcp` recebe uma
   **`DATABASE_URL` própria** apontando para um role Postgres dedicado
   (`nexus_mcp`) com: `SELECT` nas tabelas `fato_*` e nas de apoio de leitura
   (`User`, `UserDomainAccess`, `SyncState`, `FatoBuildState`); `INSERT` em
   `McpAuditLog` e `FeatureRequest`; **nada mais** — sem acesso a `raw_*`, sem
   `UPDATE`/`DELETE`, sem `SELECT` em `McpAuditLog` (#C9). O **worker** mantém
   sua `DATABASE_URL` própria, com escrita em `fato_*`/`fato_build_state`
   (decisão #I6 — roles distintos). O role é criado por script de
   provisionamento versionado e documentado.
5. **RLS opcional** — Row-Level Security: **preparada e documentada, desabilitada**
   nesta fase de tenant único. Sem política ativa (coerente com a camada 3).
6. **Validação Zod** — todo input de tool passa pelo `inputSchema` Zod antes do
   handler; input inválido → `outcome=invalid_input`, erro estruturado, sem
   tocar o banco.
7. **Audit + rate limit** — toda invocação gravada em `McpAuditLog` (3.8).
   Rate limit (decisão #C8): **novo** rate limiter para o MCP, inspirado no
   padrão de `src/lib/rate-limit.ts` (Redis `INCR`+`EXPIRE`), com chave e
   limites próprios — **não** reuso de `checkLoginRateLimit`. Chave
   `mcp:rate:{userId}`, limite **60 chamadas/min por `userId`** (cliente é um
   agente, não humano — folga para várias tools por pergunta). Estouro →
   `outcome=denied` com mensagem de limite.

### 3.7 Caminho 3 — perguntas fora do catálogo

- **3a — métrica inexistente no escopo (completo na F4).** Uma tool de
  fronteira `registrar_lacuna` (ou o roteador do agente) registra a pergunta
  não coberta → resposta de falta honesta + `INSERT` em `FeatureRequest`
  (`{ userId, perguntaResumo, dominio?, criadoEm }`). Não é erro; é sinal de
  produto.
- **3b — fora do escopo de negócio (completo na F4).** Contrato de recusa
  educada: a F4 entrega a mensagem-padrão e o ponto onde o agente a aciona. Sem
  log de gap.
- **3c — modo BI / avançado (contrato + stub gated na F4; integração diferida).**
  Decisão **#C6**: a integração efetiva do Postgres MCP é um épico próprio e o
  `CLAUDE.md §5.7` o define como ferramenta de **dev/DBA**, não de produção. A
  F4 entrega: (1) uma tool `bi_consulta_avancada` **gated** — visível e
  invocável **só para `admin`/`super_admin`** (decisão #I5 — **não existe
  perfil "analista"**; o enum `PlatformRole` tem `super_admin/admin/manager/viewer`);
  (2) o handler stub que responde "modo BI ainda não disponível nesta fase" com
  o aviso de "consulta dinâmica não auditada"; (3) a definição documentada do
  **role Postgres read-only** que o futuro Postgres MCP usará. A fiação real do
  Postgres MCP fica para uma onda futura / configuração de deploy. A F4 **não**
  embute text-to-SQL nem classificador de linguagem natural — a classificação
  3a/3b/3c é do agente (F5).

### 3.8 Logs

- **`McpAuditLog`** (append-only, 7ª camada do RBAC): `id`, `userId`, `tool`,
  `params` (JSON — **inputs estruturados íntegros**, sem "minimização"; são
  parâmetros, não texto livre; a tabela é protegida pela camada 4: o role
  `nexus_mcp` tem `INSERT` mas não `SELECT`), `outcome`
  (`ok`/`denied`/`error`/`invalid_input`), `rowCount`, `durationMs`, `criadoEm`.
- **`FeatureRequest`** (model `FeatureRequest`, tabela `feature_requests` —
  decisão #M1): gaps do Caminho 3a. `perguntaResumo` é o único campo de texto
  livre; gravado **como recebido** (resumo curto que o agente envia, não a
  mensagem bruta do WhatsApp).

Ambos registram **tool calls / gaps**, não conversas. O log de conversas é F5.

### 3.9 Comportamento sob falha (decisão #I3)

Toda tool, antes de responder, consulta `FatoBuildState` do(s) fato(s) que
usa:

- **`FatoBuildState` ausente** (builder nunca rodou) → resposta "este indicador
  ainda não foi processado"; `outcome=ok` (não é erro do MCP).
- **`FatoBuildState` presente, fato com zero linhas** → resposta "não há
  registros para o filtro informado"; `outcome=ok`.
- **Erro de conexão Postgres / exceção inesperada** → `outcome=error`, mensagem
  genérica ao agente (sem vazar detalhe interno), erro logado no servidor.
- **Domínio negado / usuário inativo / rate limit** → `outcome=denied`.
- **Input inválido (Zod)** → `outcome=invalid_input`.

---

## 4. Modelo de dados (Prisma — schema compartilhado)

Adições ao `prisma/schema.prisma` (nenhuma alteração destrutiva):

- `model FatoFinanceiroSaldo` — colunas e PK de 3.4.
- `model FatoFinanceiroMovimento` — colunas e PK de 3.4.
- `model FatoFinanceiroTitulo` — colunas e PK de 3.4.
- `model McpAuditLog` — colunas de 3.8.
- `model FeatureRequest` (`@@map("feature_requests")`) — colunas de 3.8.
- Enum `ReportDomain` já cobre `financeiro` — sem mudança.
- `FatoBuildState` ganha 3 entradas novas (dados, não schema).

Migrations Prisma versionadas. O role Postgres `nexus_mcp` (camada 4) é criado
por **script de provisionamento versionado** (`prisma/sql/` ou `scripts/`),
documentado no runbook; não é uma migration de modelo.

> Sobre `ReportDomain`/`UserDomainAccess` (decisão #M2): o MCP reusa o mesmo
> enum de domínio dos relatórios. A equivalência é **intencional** — conceder o
> domínio "financeiro" a um usuário libera tanto os relatórios quanto as tools
> MCP de financeiro. Registrado para ciência do produto.

---

## 5. Decomposição em sub-fases (ondas de execução)

| Onda | Entrega | Depende de |
|---|---|---|
| **4a** | Fundação: container `mcp` (porta 3100), servidor Streamable HTTP, autenticação de serviço (service token), `UserContext` (resolução + recarga + checagem de `isActive`), **registry de catálogo** com camadas 1/2/6 do RBAC embutidas, `McpAuditLog` + gravação de audit | — |
| **4b** | Fatos de financeiro: 3 modelos Prisma + migration; **registry de builders** (migra os 3 de estoque, sem mudança de comportamento); 3 builders de financeiro plugados nos ciclos corretos (3.4) | 4a (schema) |
| **4c** | Estoque: **extração da camada de query da F3** (3.5.1) + 6 tools de estoque sobre o módulo extraído + a tool `registrar_lacuna` (3a) — primeira a exercer o pipeline completo | 4a |
| **4d** | Financeiro: 6 tools de financeiro sobre os fatos novos | 4a, 4b, 4c |
| **4e** | Caminho 3: contrato de recusa 3b + tool `bi_consulta_avancada` gated stub (3c) | 4a, 4c |
| **4f-1** | Role Postgres `nexus_mcp` + GRANT mínimo (script de provisionamento) + `DATABASE_URL` própria do container `mcp` (camada 4) | 4a |
| **4f-2** | RLS preparada e documentada, desabilitada (camada 5) | 4f-1 |
| **4f-3** | Rate limiter do MCP (camada 7) | 4a |
| **4f-4** | Harness de teste de integração MCP (Streamable HTTP) | 4c, 4d, 4e |

A **verificação ponta a ponta** não é onda — é a etapa [9] do workflow,
executada sobre o harness de 4f-4.

---

## 6. Testes e verificação

- **Unitário** (Jest): builders de fato (mapeamento `raw`→`fato`, incluindo
  enums de `selection`), registry de builders, schemas Zod, handlers de tool,
  filtro de catálogo por RBAC, resolução de `UserContext`, recarga e checagem
  de `isActive`, cálculo de `diasAtraso` na query, gravação de audit, rate
  limiter, comportamento sob falha (3.9).
- **Harness de teste MCP (entregável — onda 4f-4):** cliente de integração que
  fala Streamable HTTP com o servidor, autentica com service token de teste,
  asserta `userId` de teste, exerce cada tool com `UserContext` de cada perfil
  (`super_admin`/`admin`/`manager`/`viewer`) e confirma o RBAC (catálogo
  filtrado, negação, gate de 3c). É o único "cliente" possível na F4 — o agente
  real é F5 (decisão #I9).
- **Verificação final:** `npx tsc --noEmit`, `npx eslint`, `npx jest`,
  `npx next build` verdes; build do container `mcp`; CI verde.
- **Critério de aceite por tool:** responde a pergunta-alvo (3.5.2/3.5.3) com
  dado do cache e `atualizadoEm`; nega corretamente quando o perfil não tem o
  domínio; rejeita input inválido com erro estruturado; cobre os casos de falha
  de 3.9. Para estoque: **teste de paridade** confirmando que a tool e a Server
  Action da F3 produzem os mesmos números (mesmo módulo de query — 3.5.1).

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Valores de `selection` do Odoo (`tipo`, `situacao`, `sinal`) desconhecidos | Tarefa de descoberta no plano: ler valores reais do `raw` antes de fixar enum (3.4) |
| Contrato de identidade depende de peça da F5 | **Resolvido (#C2):** F4 usa service token + `userId` asserido; emissor de token por usuário é F5; F4 testável com service token de teste |
| Camada 3 (tenant) sem dimensão de dados | **Resolvido (#C1):** tenant único; camada 3 é no-op documentado, não disfarçado de controle |
| 3c (Postgres MCP) é um épico e contraria §5.7 | **Resolvido (#C6):** F4 entrega só contrato + stub gated; integração diferida |
| `diasAtraso` materializado fica obsoleto | **Resolvido (#C5/#I1):** `diasAtraso` calculado na query, não no fato |
| MCP herdar a `DATABASE_URL` do worker anula a camada 4 | **Resolvido (#I6):** `DATABASE_URL` própria do container `mcp` com role `nexus_mcp` restrito |
| Divergência de números dashboard × MCP | **Resolvido (#C4):** módulo de query de estoque extraído e compartilhado + teste de paridade |
| Agente legítimo estoura rate limit pensado p/ humano | Limite dimensionado para agente: 60/min por `userId` (#C8) |
| Refactor do registry de builders quebra estoque | Migração coberta por teste de não-regressão dos 3 builders atuais |

## 8. Itens deixados explícitos para a F5

Registrado aqui e em `CLAUDE.md §4`/§5.10: vínculo número de WhatsApp↔`userId`
(campo no `User`, criado pela F5), **emissor de token assinado por usuário**,
pré-filtro de RBAC do agente, classificação 3a/3b/3c da pergunta, integração
efetiva do Postgres MCP (3c), log de conversas em Postgres relacional, BI de
perguntas mais feitas, personalização da IA com `pgvector` no Postgres
existente. Nada disso é banco vetorial separado.
