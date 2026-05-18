# F4 — MCP semântico — SPEC v1

> Fase F4 do roadmap (`CLAUDE.md §4`). Brainstorm em 2026-05-17 com o usuário.
> Entrada de requisitos fechada; segue em modo autônomo (`CLAUDE.md §6`).
> Versão: **v1** (pré-reviews). Reviews [3] e [4] geram v2 e v3.

---

## 1. Objetivo

Entregar o **servidor MCP semântico** do nexus-odoo: a camada que permite a um
agente de IA responder perguntas de negócio sobre a operação da Matrix Fitness
Group, consultando **exclusivamente o cache Postgres** por meio de **tools de
vocabulário de negócio** validadas, com **RBAC estrutural** e tratamento
honesto de perguntas fora do catálogo.

A F4 é o servidor MCP e nada além dele. A integração WhatsApp, o vínculo
número↔usuário, o log de conversas e a personalização da IA são **F5**
(`CLAUDE.md §4`, decisão canônica §5.10).

## 2. Escopo

### 2.1 Dentro do escopo (F4 — onda 1)

- Container `mcp/` — servidor TypeScript com `@modelcontextprotocol/sdk`,
  transporte **Streamable HTTP**.
- **Camada de fatos do domínio financeiro** — 3 novos `fato_*` + builders no
  worker, no padrão F2/F3 (`docs/fatos-modelagem.md`).
- **Catálogo de tools semânticas** para **estoque** (reusa os 3 fatos da F3) e
  **financeiro** (consome os fatos novos).
- **RBAC estrutural de 7 camadas** (`CLAUDE.md §5.6`).
- **Contrato de identidade** — `userId` da plataforma em toda chamada.
- **Caminho 3** completo: 3a (falta honesta + log de gap), 3b (recusa
  educada), 3c (modo BI via Postgres MCP read-only).
- **`McpAuditLog`** — auditoria de toda invocação de tool.
- **`feature_requests`** — registro de gaps do Caminho 3a.

### 2.2 Fora do escopo (ondas seguintes da F4 ou F5)

- Domínios comercial, fiscal, contábil, produção — **ondas seguintes da F4**,
  reusando esta arquitetura. O escopo "todos os domínios" (`§5.9`) permanece
  canônico; só a entrega é faseada (`§5.10`).
- WhatsApp, vínculo número↔usuário, pré-filtro de RBAC do agente, log de
  conversas, personalização/RAG, `pgvector` — **F5**.
- Tela de UI no dashboard para gerir o MCP — não há frontend nesta fase
  (exceto o que já existe para `UserDomainAccess`).

### 2.3 Decisão de faseamento (decisão #10)

A arquitetura completa do MCP é desenhada e validada com 2 domínios reais de
alto valor de negócio (estoque e financeiro). Modelar fatos de fiscal (44
tabelas SPED) ou contábil antes de conhecer as perguntas violaria
`docs/fatos-modelagem.md` ("fato só se modela quando se sabe quais perguntas
serão respondidas"). Domínios seguintes entram como trabalho repetitivo de
baixo risco sobre a base pronta.

---

## 3. Arquitetura

### 3.1 Posição no monorepo

```
nexus-odoo/
├── app/      → dashboard Next.js              (inalterado nesta fase)
├── mcp/      → NOVO: servidor MCP semântico    (container "mcp")
├── worker/   → cron + builders de fatos        (ganha builders de financeiro)
├── prisma/   → schema COMPARTILHADO            (ganha 3 fato_* + 2 tabelas)
└── docs/
```

O servidor MCP roda como container próprio (`mcp`), conecta ao mesmo Postgres
cache, e **nunca toca o Odoo** — decisão canônica §5.1/§5.2. Toda resposta de
tool carrega o timestamp da última sincronização (`atualizado há Xs`),
derivado de `SyncState`/`FatoBuildState`.

### 3.2 Transporte e processo

- Servidor MCP Streamable HTTP (`@modelcontextprotocol/sdk`), porta interna
  dedicada, exposto só na rede Docker interna (o agente da F5 é o único
  cliente; não há exposição pública nesta fase).
- Stateless quanto a conversa: cada requisição é autônoma. O servidor mantém
  só pool de conexão Postgres e cache de catálogo.

### 3.3 Contrato de identidade (Caminho C do brainstorm)

Toda chamada de tool exige um **contexto de usuário** validado:

```
UserContext = { userId: string, tenantId: string, role: PlatformRole,
                domains: ReportDomain[] }
```

- A sessão MCP é autenticada como o **serviço-agente** via service token
  (segredo em `.env`, fora do Git).
- O `userId` do usuário final viaja **por chamada**, dentro de um **JWT
  assinado** emitido pela plataforma (mesma chave de assinatura do NextAuth
  ou chave dedicada — decidir no plano). O MCP valida assinatura + expiração
  antes de qualquer handler.
- O `userId` é **sempre** o ID do usuário na plataforma (`User.id`). Número de
  WhatsApp **nunca** chega ao MCP; a resolução número→`userId` é F5.
- Após validar o JWT, o MCP **recarrega** `role` e `domains` do banco
  (`User` + `UserDomainAccess`) — o JWT identifica, o banco autoriza. Isso
  evita autorização obsoleta se o acesso mudou após a emissão do token.

### 3.4 Camada de fatos — domínio financeiro

Três fatos novos, tabelas Prisma tipadas, builders no worker disparados após o
ciclo de sync (padrão `src/worker/fatos/`):

**`FatoFinanceiroSaldo`** — fonte `raw_finan_banco_saldo_hoje`. Snapshot do
saldo de cada conta bancária / caixa.
Colunas: `odooId`, `bancoId`, `bancoNome`, `tipo` (banco/caixa), `data`,
`saldoAnterior`, `entrada`, `saida`, `saldo`, `atualizadoEm`.

**`FatoFinanceiroMovimento`** — fonte `raw_finan_fluxo_caixa`. Movimento de
caixa realizado e previsto, por dia.
Colunas: `odooId`, `data`, `contaId`, `contaNome`, `centroResultadoId`,
`centroResultadoNome`, `entrada`, `saida`, `valor`, `entradaPrevista`,
`saidaPrevista`, `valorPrevisto`, `atualizadoEm`.

**`FatoFinanceiroTitulo`** — fonte `raw_finan_pagamento_divida`. Títulos a
pagar e a receber, com vencimento, situação e atraso.
Colunas: `odooId`, `tipo` (a_pagar/a_receber, derivado de `tipo`/`sinal`),
`participanteId`, `participanteNome`, `contaId`, `contaNome`, `numeroDocumento`,
`dataDocumento`, `dataVencimento`, `dataPagamento`, `situacao`,
`situacaoSimples`, `diasAtraso`, `vrDocumento`, `vrSaldo`, `vrTotal`,
`vrJuros`, `vrMulta`, `vrDesconto`, `atualizadoEm`.

> O mapeamento exato de `tipo`/`sinal`/`situacao` (valores de `selection` do
> Odoo) é tarefa de descoberta no plano: ler os valores reais via censo /
> amostra de `raw`. Sem inventar enum.

Builders: `fato-financeiro-saldo.ts`, `fato-financeiro-movimento.ts`,
`fato-financeiro-titulo.ts` em `src/worker/fatos/`. Cada um: `deleteMany` +
`createMany` em transação + `markFatoBuilt`. Registrados em `FatoBuildState`.

### 3.5 Catálogo de tools semânticas

Cada tool: nome de vocabulário de negócio, input Zod, handler TS validado e
testado, output tipado, sempre com `atualizadoEm`/`atualizadoHa`.

**Estoque** (consome os 3 fatos da F3, sem novos builders):

| Tool | Pergunta que responde | Fato |
|---|---|---|
| `estoque_saldo_produto` | "Quantas unidades tenho do produto X? Onde está?" | `fato_estoque_saldo` |
| `estoque_valor_armazem` | "Quanto tenho em estoque, a preço de custo, por armazém?" | `fato_estoque_saldo` |
| `estoque_entradas_saidas` | "Como estão entradas e saídas por mês?" | `fato_estoque_movimento` |
| `estoque_top_movimentados` | "Quais produtos mais se movimentaram?" | `fato_estoque_movimento` |
| `estoque_produtos_parados` | "Quais produtos estão parados / imobilizados?" | `fato_produto_parado` |
| `estoque_concentracao` | "Como o valor de estoque se distribui por família/marca?" | `fato_estoque_saldo` |

> **Valor de estoque é a preço de custo** (`vr_saldo`), não de venda —
> requisito explícito do usuário no brainstorm.

**Financeiro** (consome os fatos novos):

| Tool | Pergunta que responde | Fato |
|---|---|---|
| `financeiro_saldo_contas` | "Qual o saldo de cada conta/banco hoje?" | `fato_financeiro_saldo` |
| `financeiro_caixa_periodo` | "Quanto entrou e saiu do caixa no período?" | `fato_financeiro_movimento` |
| `financeiro_fluxo_caixa` | "Como está o fluxo de caixa projetado?" | `fato_financeiro_movimento` |
| `financeiro_contas_a_receber` | "Quanto tenho a receber? Vencendo quando?" | `fato_financeiro_titulo` |
| `financeiro_contas_a_pagar` | "Quanto tenho a pagar? Boletos a vencer?" | `fato_financeiro_titulo` |
| `financeiro_titulos_vencidos` | "Quais títulos estão vencidos / boletos não pagos?" | `fato_financeiro_titulo` |

Catálogo declarativo, no padrão de `src/lib/reports/catalog.ts`: cada tool
declara `id`, `dominio`, `descricao`, schema de input/output e o(s) `fato_*`
que consulta. Um registry monta as tools MCP a partir do catálogo.

### 3.6 RBAC estrutural — 7 camadas

Defesa em profundidade. O MCP é a **última linha** — independente de qualquer
pré-filtro do agente (F5). As 7 camadas (`CLAUDE.md §5.6`):

1. **Catálogo filtrado por usuário** — no handshake/listagem de tools, só
   aparecem as tools dos domínios que o `UserContext` concede
   (`visibleDomains`). Privilegiados (`admin`/`super_admin`) veem tudo.
2. **Validação no handler** — toda tool revalida o domínio contra o
   `UserContext` no início do handler, mesmo que o catálogo já filtre.
3. **Tenant scoping injetado** — todo query ao cache recebe `tenantId` do
   contexto, injetado pela camada de acesso a dados, nunca por parâmetro de
   tool.
4. **User Postgres com GRANT mínimo** — o MCP conecta com um role Postgres
   dedicado, com `SELECT` apenas nas tabelas `fato_*` e nas de apoio; sem
   acesso a tabelas `raw` nem de escrita (exceto `McpAuditLog`,
   `feature_requests`).
5. **RLS opcional** — Row-Level Security nas tabelas `fato_*` por `tenantId`,
   habilitável; nesta fase de tenant único, deixar preparado e documentado.
6. **Validação Zod** — todo input de tool passa por schema Zod antes do
   handler; rejeição estruturada em caso de input inválido.
7. **Audit + rate limit** — toda invocação gravada em `McpAuditLog`; rate
   limit por `userId` (reusar padrão `src/lib/rate-limit.ts`).

### 3.7 Caminho 3 — perguntas fora do catálogo

- **3a — métrica inexistente no escopo.** A tool/roteador não encontra
  cobertura → resposta de falta honesta ("ainda não consigo responder isso")
  + registro em `feature_requests` (`{ userId, perguntaResumo, dominio?,
  criadoEm }`) para BI de gaps. **Não** é erro; é sinal de produto.
- **3b — fora do escopo de negócio.** Pergunta não relacionada à operação →
  recusa educada, sem log de gap.
- **3c — modo BI / avançado.** Uma tool dedicada (`bi_consulta_sql` ou
  equivalente) encaminha ao **Postgres MCP** (text-to-SQL controlado,
  read-only). **Restrita a `admin`/`super_admin`/analista** (camada 1 do RBAC
  a esconde dos demais). Resposta sempre com aviso "consulta dinâmica não
  auditada como tool". O Postgres MCP usa um role read-only separado.

> A **classificação** da pergunta entre 3a/3b/3c é responsabilidade do agente
> (F5). A F4 entrega o que sustenta cada caminho: a tool de gap-log (3a), o
> contrato de recusa (3b) e a tool/integração de BI (3c). A F4 não embute um
> classificador de linguagem natural.

### 3.8 Logs

- **`McpAuditLog`** — `id`, `userId`, `tool`, `params` (JSON, com PII
  minimizada), `outcome` (`ok`/`denied`/`error`/`invalid_input`), `rowCount`,
  `durationMs`, `criadoEm`. Append-only. É a 7ª camada do RBAC.
- **`feature_requests`** — gaps do Caminho 3a (ver 3.7).

Os dois são **tool calls / gaps**, não conversas. O log de conversas é F5.

---

## 4. Modelo de dados (Prisma — schema compartilhado)

Adições ao `prisma/schema.prisma` (nenhuma alteração destrutiva):

- `model FatoFinanceiroSaldo` — colunas de 3.4.
- `model FatoFinanceiroMovimento` — colunas de 3.4.
- `model FatoFinanceiroTitulo` — colunas de 3.4.
- `model McpAuditLog` — colunas de 3.8.
- `model FeatureRequest` — colunas de 3.8.
- Enum `ReportDomain` já cobre `financeiro` — sem mudança.
- `FatoBuildState` ganha 3 entradas novas (dados, não schema).

Migrations Prisma versionadas; role Postgres do MCP criado por migration ou
script de provisionamento documentado.

---

## 5. Decomposição em sub-fases (ondas de execução)

| Onda | Entrega | Depende de |
|---|---|---|
| **4a** | Fundação: container `mcp`, servidor Streamable HTTP, contrato de identidade (JWT + `UserContext`), scaffolding do RBAC, `McpAuditLog`, registry de catálogo vazio | — |
| **4b** | Fatos de financeiro: 3 modelos Prisma + migration + 3 builders no worker + integração no ciclo de build | 4a (schema) |
| **4c** | Catálogo + handlers das 6 tools de estoque | 4a |
| **4d** | Catálogo + handlers das 6 tools de financeiro | 4a, 4b |
| **4e** | Caminho 3 completo: `feature_requests`, tool de gap-log (3a), contrato de recusa (3b), integração Postgres MCP (3c) | 4a |
| **4f** | Hardening do RBAC 7 camadas (GRANT mínimo, RLS preparado, rate limit), verificação ponta a ponta | 4a–4e |

Cada onda: tasks bite-sized no plano, TDD onde houver código testável,
verificação isolada.

---

## 6. Testes e verificação

- **Unitário** (Jest): builders de fato (mapeamento `raw`→`fato`), schemas
  Zod, handlers de tool (com Postgres de teste ou mocks de fato), filtro de
  catálogo por RBAC, validação de JWT, gravação de audit.
- **Integração**: subir o servidor MCP, exercer cada tool com um
  `UserContext` de cada perfil, confirmar que o RBAC esconde/nega corretamente.
- **Verificação final**: `npx tsc --noEmit`, `npx eslint`, `npx jest`,
  `npx next build` verdes; CI verde.
- Critério de aceite por tool: responde a pergunta-alvo (seção 3.5) com dado
  do cache e `atualizadoHa`, nega corretamente quando o perfil não tem o
  domínio, e rejeita input inválido com erro estruturado.

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Valores de `selection` do Odoo (`tipo`, `situacao`, `sinal`) desconhecidos | Tarefa de descoberta no plano: ler valores reais do `raw` antes de modelar enum |
| `raw_finan_banco_saldo_hoje` tem só 8 linhas — fato pode ficar trivial | Aceitável: reflete a realidade do cache; tool retorna o que há |
| JWT mal desenhado vaza autorização | Recarregar `role`/`domains` do banco a cada chamada (3.3); JWT só identifica |
| Postgres MCP (3c) amplia superfície de ataque | Role read-only dedicado; restrito a admin/analista pela camada 1; aviso na resposta |
| Escopo "todos os domínios" pressiona a F4 | Faseamento decisão #10 — só estoque+financeiro nesta fase |

## 8. Itens deixados explícitos para a F5

Registrado aqui e em `CLAUDE.md §4`/§5.10: vínculo número de WhatsApp↔`userId`
(campo no `User`, criado pela F5), pré-filtro de RBAC do agente, log de
conversas em Postgres relacional, BI de perguntas mais feitas, personalização
da IA com `pgvector` no Postgres existente quando houver RAG sobre histórico.
Nada disso é banco vetorial separado.
