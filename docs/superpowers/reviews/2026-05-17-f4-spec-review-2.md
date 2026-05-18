# F4 — MCP semântico — Review crítica da SPEC v2 (Review #2)

> Segunda auditoria adversarial, sobre a SPEC v2
> (`docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md`).
> Etapa [4] do workflow (`CLAUDE.md §6`) — a última review antes do plano.
> Os achados aplicados geram a SPEC v3.
> Revisor: agente adversarial. Data: 2026-05-17.

Critério: caçar o que faltou, o exagero, o conceito quebrado, a integração mal
pensada. A v2 incorporou bem a maioria dos 23 achados da Review #1 — a
arquitetura está mais honesta. Mas a v2 **introduziu problemas novos** ao
"resolver" os antigos, e **dois achados da Review #1 foram fechados só na
aparência**. Foram encontrados **17 achados**: **5 CRÍTICOS, 8 IMPORTANTES,
4 MENORES**. A v2 **não está pronta** para virar plano sem a v3.

---

## Parte I — Status dos 23 achados da Review #1

| # | Severidade R1 | Status na v2 | Observação |
|---|---|---|---|
| C1 | Crítico | **Resolvido** | `tenantId` removido do `UserContext`; camada 3 declarada no-op documentado (3.6). Honesto. Ver N3 sobre a contagem "7 camadas". |
| C2 | Crítico | **Parcial** | v2 escolheu a opção (b): service token + `userId` asserido, emissor por-usuário em F5. Decisão clara — mas a v2 **não especifica o contrato do service token** (rotação, formato, onde validar, o que acontece em mismatch). Ver achado novo **CR-1**. |
| C3 | Crítico | **Resolvido** | Registry de builders (3.4) introduzido; modos das 3 fontes confirmados contra `MODEL_CATALOG`. Verifiquei: `finan.banco.saldo.hoje`=snapshot, `finan.fluxo.caixa`=incremental, `finan.pagamento.divida`=incremental. Correto. Ver **CR-2** sobre semântica de rebuild. |
| C4 | Crítico | **Parcial** | v2 adiciona 3.5.1 (extração da camada de query). Mas a viabilidade da extração está **subdimensionada** — `report-data.ts` está muito mais acoplado do que a spec assume. Ver achado novo **CR-3** (o mais grave desta review). |
| C5 | Crítico | **Resolvido** | PKs declaradas para os 3 fatos; `FatoFinanceiroSaldo` PK=`bancoId`; `diasAtraso` não materializado. Bom. |
| C6 | Crítico | **Resolvido** | 3c reduzido a contrato + stub gated; integração diferida para F5. Coerente. Ver **IM-1** sobre a coerência de "fase completa". |
| C7 | Crítico | **Resolvido** | Onda 4f quebrada em 4f-1..4f-4; camadas 1/2/6 movidas para dentro da definição de tool (decisão #C7). Bom. |
| C8 | Crítico | **Resolvido** | v2 diz "novo rate limiter, não reuso de `checkLoginRateLimit`"; chave `mcp:rate:{userId}`, 60/min. Confirmei que `rate-limit.ts` é específico de login. Correto. Ver **IM-4** sobre a granularidade da chave. |
| C9 | Crítico | **Resolvido** | "PII minimizada" substituído por "params íntegros, tabela protegida pela camada 4 (INSERT sem SELECT)". Decisão registrada (#C9). Ver **IM-5**. |
| I1 | Importante | **Parcial** | Grão declarado para os 3 fatos; colunas previstas marcadas como "confirmado na descoberta". Mas o grão de `FatoFinanceiroMovimento` ("uma linha por registro de `raw_finan_fluxo_caixa`") **não serve igualmente bem às 2 tools que o consomem**. Ver **IM-2**. |
| I2 | Importante | **Resolvido** | 3.5 reescrita: catálogo declarativo próprio do MCP, reusa só a *ideia* de `catalog.ts`. Correto. |
| I3 | Importante | **Resolvido** | 3.9 "comportamento sob falha" adicionada, cobre `FatoBuildState` ausente/vazio/erro. Boa. Ver **IM-3** (gap residual). |
| I4 | Importante | **Resolvido** | 4e agora depende de 4a+4c; tool `registrar_lacuna` movida para 4c. Correto. |
| I5 | Importante | **Resolvido** | "analista" removido; 3c restrito a `admin`/`super_admin`. Confirmei: `PlatformRole` = super_admin/admin/manager/viewer. Correto. |
| I6 | Importante | **Resolvido** | `DATABASE_URL` própria do container `mcp` com role `nexus_mcp`; worker mantém a sua. Declarado em 3.6 camada 4 + onda 4f-1. Bom. |
| I7 | Importante | **Resolvido** | Decisão registrada: recarga por chamada, sem cache, custo aceito (#I7). Bom. |
| I8 | Importante | **Resolvido** | 3.3: usuário inexistente/`isActive=false` → `denied`. Espelha `auth.ts`. Correto. |
| I9 | Importante | **Resolvido** | Harness de teste MCP nomeado como entregável (onda 4f-4, seção 6). Bom. |
| M1 | Menor | **Resolvido** | Padronizado `model FeatureRequest` / `@@map("feature_requests")`. |
| M2 | Menor | **Resolvido** | Equivalência `ReportDomain` registrada como intencional (nota em §4). |
| M3 | Menor | **Resolvido** | Decidido: tool devolve `atualizadoEm` ISO; texto relativo é do cliente. |
| M4 | Menor | **Resolvido** | Porta 3100 fixada. |
| M5 | Menor | **Resolvido** | Seção 7 reescrita, lista os riscos graves com a tag da decisão. |

**Agregado:** 19 resolvidos, 4 parciais (C2, C4, C6→ok mas ver IM-1, I1),
0 não resolvidos. A v2 é uma revisão séria. Mas os 4 parciais escondem o
problema mais caro da fase — ver Parte II.

---

## Parte II — Achados novos

## CRÍTICOS

### CR-1 — O contrato do service token está declarado mas não especificado

**Seção:** 3.3, 2.1, 7.

A v2 resolveu C2 escolhendo "service token + `userId` asserido". A decisão de
arquitetura está certa. Mas a spec descreve o service token em **uma frase**
("segredo forte em `.env`, o container valida em todo request") e empurra para
o plano tudo o que é contrato de segurança:

- **Formato e transporte.** É um `Authorization: Bearer <segredo>`? Um header
  custom? O Streamable HTTP do MCP SDK expõe os headers HTTP ao código de
  validação **antes** do handshake MCP? Isso não é trivial: o
  `StreamableHTTPServerTransport` do `@modelcontextprotocol/sdk` processa o
  POST inteiro; a validação do token tem que acontecer num middleware HTTP
  **antes** de entregar o corpo ao transporte MCP. A spec diz "antes de
  qualquer handler MCP" mas não diz **onde** no pipeline — e o SDK não oferece
  um hook óbvio de pré-autenticação. Isso é risco técnico real, não detalhe.
- **Comparação.** Comparação de segredo tem que ser *constant-time*
  (`crypto.timingSafeEqual`) — senão abre timing attack. A spec não diz.
- **Onde o `userId` viaja.** "Parâmetro de contexto da requisição, não
  parâmetro de tool" — mas o MCP **não tem** um canal de "contexto de
  requisição" padrão fora dos argumentos da tool. Ou o `userId` vai num header
  HTTP (e aí o handler MCP precisa de acesso ao request HTTP — de novo, não
  trivial no SDK), ou vai como argumento de toda tool (e aí *é* parâmetro de
  tool, contradizendo a spec, e o Zind `inputSchema` de cada tool tem que
  incluí-lo). A spec afirma um modelo que o protocolo MCP não suporta
  diretamente. **Isto precisa ser resolvido na spec, não no plano** — é a
  espinha do RBAC inteiro.
- **Rotação e revogação.** Service token único, sem rotação, sem expiração.
  Aceitável para a fase, mas a spec deveria dizer "token estático, rotação
  manual, F5 endurece" explicitamente em vez de silenciar.

**Recomendação:** a v3 precisa de uma subseção concreta "3.3.1 Mecânica do
service token e do `userId`": (a) decidir o transporte do token (header HTTP
Bearer recomendado) e o ponto de validação (middleware HTTP que embrulha o
transporte MCP — provar que o SDK permite); (b) decidir o transporte do
`userId` — recomendo um **header HTTP custom** (`X-Mcp-User-Id`) lido pelo mesmo
middleware e injetado num `AsyncLocalStorage` ou no escopo da sessão, **não**
como argumento de tool; (c) comparação constant-time; (d) declarar
explicitamente "token estático nesta fase". Sem (a) e (b) concretos, a onda 4a
não é construível — esconde uma decisão de protocolo.

### CR-2 — "Rebuild full" de fato sobre fonte incremental: a semântica está sub-pensada

**Seção:** 3.4 (`FatoFinanceiroMovimento`, `FatoFinanceiroTitulo`).

A v2 confirmou que `finan.fluxo.caixa` e `finan.pagamento.divida` são fontes
**incrementais** — corretamente. E declarou que os dois fatos correspondentes
fazem **"rebuild full"** (`deleteMany` + `createMany`). Aqui há dois problemas
que a spec não enfrenta:

1. **Custo do rebuild full sobre fonte que só cresce.** Os fatos de estoque que
   fazem rebuild full (`fato_estoque_movimento`) derivam de
   `raw_estoque_extrato`, que é **snapshot** — recriado a cada ciclo, tamanho
   estável. `raw_finan_pagamento_divida` e `raw_finan_fluxo_caixa` são
   **incrementais**: acumulam histórico indefinidamente. Um `deleteMany` +
   `createMany` da tabela inteira a cada ciclo de sync, sobre uma tabela que só
   cresce, é um padrão que degrada — e o builder roda em
   `processIncrementalCycle`, que pode rodar a cada poucos minutos. A spec
   herda o verbo "rebuild full" do padrão de estoque sem notar que a **classe
   da fonte é diferente**. Ou o fato é construído incrementalmente (upsert por
   `odooId`, respeitando `rawDeleted`), ou a spec aceita explicitamente o
   rebuild full e justifica o custo com uma estimativa de volume.

2. **`rawDeleted` é ignorado.** Os builders de estoque atuais filtram
   `where: { rawDeleted: false }` (visto em `fato-estoque-saldo.ts`). A fonte
   incremental marca linhas como `rawDeleted=true` no reconcile. A spec dos 3
   fatos de financeiro **não menciona `rawDeleted`** em nenhum lugar. Se o
   builder não filtrar, títulos/lançamentos excluídos no Odoo continuam no
   fato. É um requisito de correção, não detalhe.

**Recomendação:** a v3 deve, para `FatoFinanceiroMovimento` e
`FatoFinanceiroTitulo`: (a) decidir entre rebuild full e build incremental por
`odooId` — recomendo **rebuild full mantido** (simplicidade, paridade com o
padrão), mas com uma nota de volume esperado e um gatilho de revisão se a
fonte passar de N linhas; (b) declarar explicitamente que todo builder filtra
`rawDeleted=false`, igual aos de estoque. `FatoFinanceiroSaldo` (fonte
snapshot) não tem o problema (1) mas tem o (2).

### CR-3 — A extração da camada de query da F3 (3.5.1) está gravemente subdimensionada

**Seção:** 3.5.1, onda 4c.

Este é o achado mais sério da review. A v2 trata a extração como "refactor sem
mudança de comportamento, coberto pelos testes existentes" — uma onda
tranquila. **Lendo `src/lib/actions/report-data.ts`, não é isso.** O arquivo
está acoplado ao contexto de request do Next em três eixos, e nenhum deles é
mencionado pela spec:

1. **`guardDominio(entry.dominio)`** — chamada no início de *toda* função de
   query. `guardDominio` → `getCurrentUser()` → `auth()` → `headers()` do
   Next. Isso é **server-only, dependente do request HTTP do Next**. Não roda
   no container `mcp`. A "lógica pura de query" da spec **não é pura** — está
   entrelaçada com o RBAC do dashboard. Extrair exige *separar* a query da
   autorização: a função extraída não pode chamar `guardDominio`; o RBAC do MCP
   (camada 2, validação no handler) é que autoriza no lado MCP, e a Server
   Action da F3 continua chamando `guardDominio` *antes* de chamar a query
   extraída. Isso é uma reestruturação de responsabilidade, não um "mover
   código".

2. **`requireReport(id)` / `getReport(id)`** — toda query resolve uma entrada
   do **catálogo de relatórios** (`src/lib/reports/catalog.ts`, vocabulário de
   UI) e usa `entry.dominio`. A query extraída para o MCP **não tem** um
   `reportId` — o MCP tem `toolId`. A dependência de `getReport` tem que ser
   cortada na extração.

3. **`reportFreshness(prisma, entry)`** — cada query devolve um objeto
   `freshness` derivado da entrada de catálogo. O MCP quer `atualizadoEm` de
   `FatoBuildState` (decisão #M3), **não** o `freshness` da F3. Outra
   dependência a cortar.

Além disso, o **contrato de retorno** das funções da F3 é específico de
dashboard: `{ estado: "preparando"|"vazio"|"ok"|"erro", dados, freshness }`,
com `dados` carregando `kpis`, `top8`, `barras`, `detalhePorLocal` — formas
moldadas para gráficos do Recharts. As tools do MCP querem outra forma de
saída (texto/estrutura para um agente). "Reusar a lógica de agregação" só vale
se a extração isolar **o miolo de agregação** (o `Map`/`reduce` sobre
`fatoEstoqueSaldo`) num núcleo que devolve dado cru, e *tanto* a Server Action
*quanto* a tool MCP vestem esse núcleo com seu próprio formato. A spec fala em
extrair "a lógica pura de query/agregação" como se fosse um bloco coeso — não
é; está fundido com guard, catálogo, freshness e shaping de UI.

Há ainda um detalhe que a spec ignora: `report-data.ts` é um arquivo
`"use server"`. Mover funções dele para `src/lib/reports/queries/estoque.ts`
significa que o **novo** módulo **não** pode ser `"use server"` (senão vira
Server Actions e o `mcp/` não importa). E as funções que *permanecem* em
`report-data.ts` continuam Server Actions. A fronteira é delicada e a spec não
a desenha.

**Recomendação:** a v3 deve reescrever 3.5.1 reconhecendo o escopo real:
(a) o módulo extraído `estoque.ts` é **framework-neutro e sem `"use server"`**,
recebe `prisma` e filtros como argumentos, **não chama `guardDominio` nem
`getReport` nem `reportFreshness`**, e devolve **dado de agregação cru**
(sem `estado`/`freshness`/shaping de gráfico); (b) as Server Actions da F3
ficam como *wrappers finos*: `guardDominio` + `reportFreshness` + chamada ao
núcleo + shaping para a UI; (c) as tools do MCP são outro wrapper: RBAC do MCP
+ chamada ao mesmo núcleo + shaping para o agente; (d) os testes existentes de
`report-data.test.ts` precisam ser revistos — eles testam o contrato antigo;
parte vira teste do núcleo, parte continua teste do wrapper. Isso **não é**
"refactor sem mudança de comportamento coberto pelos testes existentes" — é uma
reestruturação que move a fronteira de teste. **A onda 4c, como está, é um
épico.** Precisa ser quebrada (ver CR-4).

### CR-4 — A onda 4c esconde um épico de 3 unidades de trabalho distintas

**Seção:** 5 (tabela de ondas).

A onda 4c entrega, num único item: (1) a extração/reestruturação da camada de
query da F3 — que CR-3 mostra ser uma reestruturação real com mexida em testes;
(2) as **6 tools de estoque**; (3) a tool `registrar_lacuna` do Caminho 3a.
O `CLAUDE.md §6` é explícito: "se uma task descreve [várias coisas] juntas, ela
é um épico — quebrar... uma task por arquivo ou por ação". 6 tools + uma
extração estrutural + uma sétima tool não é uma onda.

Pior: há uma **dependência interna** que a granularidade atual esconde — as 6
tools de estoque dependem do módulo extraído estar pronto; `registrar_lacuna`
**não** depende da extração (ela não lê fato de estoque, escreve em
`FeatureRequest`). Misturar as duas numa onda obriga a ordem errada ou serializa
trabalho independente.

**Recomendação:** quebrar 4c em: **4c-1** extração e reestruturação da camada
de query de estoque (módulo neutro + reescrita das Server Actions como wrapper
+ revisão dos testes) — verificável isolada por `report-data.test.ts` +
testes do núcleo verdes e paridade; **4c-2** as 6 tools de estoque sobre o
módulo (idealmente o plano ainda subdivide por tool ou por par de tools);
**4c-3** a tool `registrar_lacuna` (depende só de 4a). O plano (etapa [5]) deve
descer ainda mais — mas a **spec** não pode entregar 4c como bloco único.
Mesma observação, em menor grau, para 4d (6 tools de financeiro num item).

### CR-5 — `FatoFinanceiroSaldo` com PK `bancoId` colide com a granularidade declarada

**Seção:** 3.4.

A v2 corrigiu C5 declarando **"grão: uma linha por conta bancária/caixa"** e
**"PK lógica: `bancoId`"**. Mas a mesma seção lista, entre as colunas,
`saldoAnterior, entrada, saida, saldo` e `data`. Isso descreve o **saldo de um
dia** — `raw_finan_banco_saldo_hoje` é o snapshot do movimento do dia por
conta. Se o grão é "uma linha por conta" e a PK é `bancoId`, então só cabe
**um dia** por conta no fato — o de hoje. Tudo bem se a intenção é "foto de
hoje" (e a tool `financeiro_saldo_contas` pergunta "hoje"). Mas então:

- O nome do modelo `FatoFinanceiroSaldo` e a coluna `data` sugerem série
  temporal; o grão diz foto única. A spec é ambígua sobre se o fato guarda
  **histórico de saldos diários** ou só **o saldo de hoje**.
- Se for só hoje, a coluna `data` é redundante com `atualizadoEm` e a tool
  nunca consegue responder "qual era o saldo na semana passada".
- Se for histórico, a PK **não pode** ser `bancoId` sozinho — tem que ser
  `(bancoId, data)`, e o builder não pode fazer `deleteMany` total (apagaria o
  histórico). Mas a fonte é `..._hoje` (snapshot só de hoje) — então não há
  como reconstruir histórico de qualquer forma.

A spec não resolve a contradição: declara grão "por conta", PK `bancoId`,
rebuild `deleteMany`+`createMany`, **e** uma coluna `data`. As três primeiras
são coerentes entre si (foto de hoje); a quarta confunde.

**Recomendação:** a v3 deve declarar explicitamente que `FatoFinanceiroSaldo`
é **a foto do saldo de hoje, sem histórico** (consistente com a fonte `_hoje`
ser snapshot e com a PK `bancoId`); manter `data` apenas se representar a data
do snapshot vinda do Odoo (documentar como "data de referência da foto", não
chave); e registrar como gap para F5/onda futura que "saldo histórico por
conta exige fonte `finan.banco.saldo` (incremental, não-hoje) e outro fato".

---

## IMPORTANTES

### IM-1 — Coerência da decisão canônica §5.5 com o stub de 3c

**Seção:** 3.7 (3c), 2.2.

A v2 entrega 3c como stub gated e difere a integração real. A Review #1 (C6)
pediu isso e está certo. Mas o `CLAUDE.md §5.5` define o Caminho 3 como
**decisão canônica** com 3c sendo "modo BI/avançado → Postgres MCP
(text-to-SQL controlado)". A v2 entrega um handler que responde *"modo BI ainda
não disponível nesta fase"*. Isso é defensável **se** a spec disser com todas
as letras que **a F4 entrega o Caminho 3 com 3c em estado de stub, e a entrega
funcional do 3c é trabalho nomeado de uma onda futura da F4 (não F5)** — senão
fica a leitura de que a F4 "completou o Caminho 3" quando completou 2/3. A
seção 2.2 chega a dizer que a integração do Postgres MCP é "configuração de
deploy/F5", e a seção 3.7 diz "onda futura / configuração de deploy" — as duas
não batem (F5? onda futura da F4? deploy?). O escopo "todos os domínios" da F4
é canônico (§5.9); o 3c não é "domínio", é um caminho — mas a ambiguidade de
*quando* ele fica pronto precisa sumir.

**Recomendação:** a v3 deve cravar uma frase única: "a F4 entrega 3a e 3b
funcionais e 3c como contrato + stub gated; a integração funcional do 3c
(Postgres MCP) é uma **onda futura da F4**, fora desta onda 1, e **não** F5".
E corrigir 2.2/3.7 para não citarem três destinos diferentes.

### IM-2 — Grão de `FatoFinanceiroMovimento` não serve igualmente às 2 tools

**Seção:** 3.4, 3.5.3.

`FatoFinanceiroMovimento` tem grão "uma linha por registro de
`raw_finan_fluxo_caixa`" e é consumido por `financeiro_caixa_periodo`
("quanto entrou e saiu no período" — realizado) **e** por
`financeiro_fluxo_caixa` ("fluxo de caixa projetado" — previsto). A spec lista
colunas realizadas e previstas na mesma linha (`entrada/saida/valor` +
`entradaPrevista/saidaPrevista/valorPrevisto`). Pergunta não respondida: **um
mesmo registro de `raw_finan_fluxo_caixa` carrega os dois?** Ou um registro é
*ou* realizado *ou* previsto? Se for o segundo caso, a tool de projeção tem que
filtrar por um discriminador (status realizado/previsto) que a spec não lista
como coluna. Se for o primeiro, ok — mas a spec deveria afirmar. A nota de
descoberta cobre os enums de `selection`, **não** cobre essa questão de
estrutura da fonte.

**Recomendação:** acrescentar à tarefa de descoberta do plano: confirmar contra
amostra de `raw_finan_fluxo_caixa` se realizado e previsto coexistem na mesma
linha ou são linhas distintas; se distintas, adicionar coluna discriminadora ao
fato. Decidir na v3 ou marcar explicitamente como item de descoberta
bloqueante da onda 4b.

### IM-3 — Comportamento sob falha não cobre fato parcialmente obsoleto nem multi-fato

**Seção:** 3.9.

3.9 é boa, mas tem dois buracos:

1. **Tool que lê 2+ fatos.** Nenhuma tool de estoque/financeiro listada cruza
   fatos hoje, mas 3.9 fala em "o(s) fato(s) que usa" — se um fato tem
   `FatoBuildState` e o outro não, qual `outcome`? A spec diz "consulta
   `FatoBuildState` do(s) fato(s)" mas não a regra de combinação. Menor hoje,
   vira bug quando a primeira tool composta surgir.

2. **`atualizadoEm` quando a fonte do fato está velha.** 3.9 trata "builder
   nunca rodou" e "fato vazio", mas não o caso de o builder ter rodado e o
   **dado estar velho** porque a sync do Odoo falhou (`SyncState.lastStatus`
   pode ser `erro`/`sem_acesso`). A tool devolve `atualizadoEm` do
   `FatoBuildState`, que diz quando o *fato* foi montado — não quando o *Odoo*
   foi lido com sucesso. Um agente pode reportar "dado de 2 min atrás" quando o
   Odoo está inacessível há 6h. A decisão §5.2 ("toda tool retorna o timestamp
   da última sync") fala de **sync**, não de build de fato. A spec usa
   `FatoBuildState`, mas a fonte canônica da frescura é `SyncState`.

**Recomendação:** (a) definir a regra multi-fato: se *qualquer* fato usado tem
`FatoBuildState` ausente → "indicador ainda não processado"; (b) decidir se a
tool devolve **só** `atualizadoEm` do `FatoBuildState` ou também o
`SyncState.lastSnapshotAt`/`lastIncrementalAt` + `lastStatus` da fonte — para
não mascarar um Odoo caído. Recomendo a tool devolver os dois timestamps, ou
ao menos um `fonteStatus` derivado de `SyncState`. Isso alinha com §5.2 literal.

### IM-4 — Rate limit por `userId` apenas: o cliente único é o serviço-agente

**Seção:** 3.6 camada 7.

A v2 fixou `mcp:rate:{userId}`, 60/min. Mas o **único** autenticado no
transporte é o service token (um só agente). Se o agente assere `userId`s
diferentes, cada um tem seu balde de 60/min — ok para isolar usuários. Mas não
há **nenhum** limite por *service token* / global: um agente comprometido (ou
em loop) com um único `userId` válido fica preso a 60/min, mas se variar o
`userId` (todos válidos) escala sem teto. O rate limit como desenhado protege
*um usuário do outro*, não protege o **banco** de um agente descontrolado.
Para a F4 (rede interna, um agente confiável) talvez seja aceitável — mas é uma
decisão, e a spec a toma implicitamente.

**Recomendação:** a v3 deve declarar a decisão: ou (a) `mcp:rate:{userId}` é
suficiente porque o agente é infraestrutura confiável na rede Docker (mesma
premissa do #C2) — então **escrever isso**; ou (b) adicionar um teto global
`mcp:rate:global` como segundo balde. Recomendo (a) com a frase explícita, para
não parecer esquecimento.

### IM-5 — `McpAuditLog.params` íntegro sem retenção nem limite de tamanho

**Seção:** 3.8.

C9 foi resolvido (params íntegros, tabela protegida). Mas a v2 não diz: (a)
**política de retenção** — `McpAuditLog` é append-only e cresce com cada tool
call de cada pergunta de WhatsApp; sem TTL/expurgo, a tabela cresce sem limite e
o role `nexus_mcp` nem tem `DELETE` para limpar; (b) **limite de tamanho** do
JSON `params` — improvável estourar com inputs estruturados de tool, mas vale
um teto. O `AuditLog` da plataforma (F1) também não tem retenção, então isto é
coerente com o padrão — mas o volume do MCP é outra ordem de grandeza (um
agente dispara N tools por pergunta).

**Recomendação:** a v3 registra: retenção do `McpAuditLog` é trabalho de
operação (job de expurgo) — ou item de uma onda futura, ou decisão consciente
de "sem expurgo na F4, revisar em F5". Não precisa implementar agora, mas
precisa estar **escrito** como gap conhecido, não silenciado.

### IM-6 — Viabilidade do `@modelcontextprotocol/sdk` não verificada contra o stack

**Seção:** 3.2, 7.

`@modelcontextprotocol/sdk` **não está em `package.json`** — nem em deps nem em
devDeps. A spec assume a biblioteca como dada. Pontos não verificados que podem
virar bloqueio na onda 4a:

- O container `mcp` é descrito como "servidor TypeScript". Roda em Node puro
  (tsx/tsc, como o `worker`) ou é um processo Next? A spec não diz. Se for Node
  puro, o `StreamableHTTPServerTransport` precisa de um servidor HTTP próprio
  (Node `http`/Express) — dependência nova não listada.
- O `worker` roda com `tsx` (`package.json` script `worker`). O `mcp` herda
  esse setup ou tem build próprio? A seção 6 manda `npx next build` na
  verificação — mas o `mcp/` não é Next. Isso sugere confusão: a verificação
  lista o build do dashboard e "build do container `mcp`" lado a lado sem dizer
  que são toolchains diferentes.
- `@prisma/adapter-pg` + Prisma 7: o MCP usa o mesmo `generated/prisma` client.
  Com a `DATABASE_URL` restrita (role `nexus_mcp`), o `prisma generate` não
  muda — ok — mas o client tem que apontar para a env certa em runtime.
  Trivial, mas não dito.

**Recomendação:** a v3 deve declarar: (a) `@modelcontextprotocol/sdk` é
dependência nova a adicionar (e a onda 4a inclui o `npm install`); (b) o
container `mcp` é processo **Node puro** (alinhado ao `worker`), com servidor
HTTP explícito (`node:http` ou framework mínimo) — ou justificar outra escolha;
(c) a verificação (seção 6) separa as toolchains: `tsc`/`eslint`/`jest` valem
para tudo, `next build` vale só para `app/`, e o `mcp/` tem seu próprio build
de container. Como está, a seção 6 mistura.

### IM-7 — Camada 1 (catálogo filtrado) vs. transporte stateless: quando o filtro acontece

**Seção:** 3.2, 3.6 camada 1.

A camada 1 diz: em `tools/list`, só aparecem as tools dos domínios do
`UserContext`. Mas 3.2 diz o servidor é **stateless** e mantém um **cache de
catálogo estático**. Há tensão: `tools/list` é uma operação do protocolo MCP
que acontece no **handshake da sessão** — e o `UserContext` (com `domains`)
depende do `userId`, que (por CR-1) viaja por chamada. Se o `userId` só é
conhecido na chamada de tool, o `tools/list` do handshake **não sabe** qual
usuário é — não tem como filtrar o catálogo. Ou o `userId` é conhecido já no
handshake (e aí ele **não** é "por chamada", é "por sessão" — contradiz 3.3),
ou o `tools/list` não pode ser filtrado por usuário e a camada 1 vira teórica,
restando só a camada 2 (validação no handler) como defesa real.

**Recomendação:** a v3 precisa reconciliar 3.2/3.3/3.6-camada-1. Caminho
coerente: o `userId` é asserido **no início da sessão MCP** (header HTTP no
estabelecimento da conexão Streamable HTTP), válido para a sessão inteira — aí
`tools/list` *pode* filtrar, e a camada 1 funciona. Isso muda 3.3 de "`userId`
por chamada" para "`userId` por sessão" — o que, dado que o agente abre uma
sessão por conversa, é até mais natural. Decidir e escrever. Se ficar "por
chamada", admitir que a camada 1 é best-effort e a camada 2 é a que vale.

### IM-8 — Teste de paridade dashboard×MCP: o critério é forte mas o alvo move

**Seção:** 6 (critério de aceite por tool).

O teste de paridade ("a tool e a Server Action da F3 produzem os mesmos
números") só é significativo se as duas chamarem **o mesmo núcleo** (CR-3). Mas
a F3 e o MCP querem **formatos de saída diferentes** — a Server Action devolve
`{ kpis, top8, barras... }`, a tool devolve estrutura para o agente. "Mesmos
números" só pode ser asserido no nível do **núcleo de agregação**, não no nível
das saídas finais (que são formas distintas de propósito). A spec não diz em
que nível a paridade é medida.

**Recomendação:** a v3 deve precisar: o teste de paridade compara a **saída do
núcleo de agregação extraído** chamado pelos dois caminhos — não as saídas
finais. Ou, mais simples: como os dois caminhos chamam *literalmente a mesma
função-núcleo*, a paridade é garantida por construção e o "teste de paridade"
vira um teste de que ambos os wrappers chamam o núcleo (não recomputam). Definir
qual das duas leituras vale.

---

## MENORES

### MN-1 — `FatoBuildState` "ganha 3 entradas novas (dados, não schema)"

**Seção:** 4. Correto, mas as 3 entradas só existem **depois** do primeiro run
de cada builder — não são seed. Antes do primeiro ciclo de sync pós-deploy, as
tools de financeiro responderão "indicador ainda não processado" (3.9). Isso é
o comportamento certo, mas vale uma frase na spec para não soar como bug na
verificação. Detalhe.

### MN-2 — Enums de `selection` sem fallback para valor desconhecido

**Seção:** 3.4 (nota de descoberta). A tarefa de descoberta lê os valores de
`selection` e fixa os enums. Mas o Odoo pode ganhar um valor novo de
`selection` depois (a Tauga customiza SPED). Se o builder mapear via enum
fechado, um valor novo quebra o build. Os builders de estoque mapeiam strings
livres (`sentido`, `origem`), não enums Prisma. Recomendo a v3 dizer que
`tipo`/`situacao` no fato são **`String`**, não enum Prisma, com normalização
documentada — fail-safe contra valor novo. Detalhe de modelagem.

### MN-3 — A contagem "7 camadas" é hoje 5 efetivas + 2 documentadas

**Seção:** 3.6. Com C1 resolvido, a camada 3 (tenant) é no-op e a camada 5
(RLS) é "preparada, desabilitada". São **2 das 7** que não exercem controle
ativo nesta fase. A spec é honesta sobre cada uma individualmente, mas continua
chamando o conjunto de "RBAC de 7 camadas" no título e no resumo. Sugiro uma
nota: "7 camadas como arquitetura; 5 ativas na F4, 2 (tenant, RLS) preparadas
e documentadas como pontos de extensão". Alinha o discurso com 3.6. Detalhe de
redação, mas evita a leitura de que há 7 controles ativos.

### MN-4 — `registrar_lacuna` é "tool de fronteira (ou o roteador do agente)"

**Seção:** 3.7 (3a). A spec hesita: a lacuna é registrada por "uma tool de
fronteira `registrar_lacuna` **ou** o roteador do agente". São duas
arquiteturas diferentes — se é o roteador do agente, não é entrega da F4
(roteador é F5) e a onda 4c não deveria listar a tool. A spec precisa cravar:
na F4, 3a é uma **tool** `registrar_lacuna` que o agente chama; o roteamento
(decidir *quando* chamá-la) é do agente/F5. Remover o "ou". Detalhe, mas o
"ou" deixa a onda 4c ambígua.

---

## Veredito

A SPEC v2 é uma revisão competente: 19 dos 23 achados da Review #1 foram
genuinamente resolvidos, a arquitetura ficou mais honesta (tenant no-op
assumido, 3c reduzido a stub, emissor de token diferido para F5, ondas
redecompostas). Não é carimbo de v1 — é trabalho real.

Mas a v2 fechou os achados *conceituais* e deixou abertos os achados de
*mecânica concreta* — exatamente o tipo de furo que a etapa [4] existe para
caçar:

1. **O contrato do service token e do `userId` afirma um modelo que o protocolo
   MCP não suporta direto** (CR-1) — e isso colide com a camada 1 do RBAC
   (IM-7). É a espinha da segurança e está em uma frase.
2. **A extração da camada de query da F3 está vendida como refactor trivial e
   é uma reestruturação** que mexe em guard, catálogo, freshness, shaping e
   testes (CR-3) — e por isso a onda 4c é um épico (CR-4).
3. **"Rebuild full" foi herdado do padrão de estoque sem notar que as fontes de
   financeiro são incrementais** (CR-2), e `rawDeleted` foi esquecido.
4. **`FatoFinanceiroSaldo` tem grão, PK e coluna `data` que não fecham entre
   si** (CR-5).
5. **A SDK do MCP, o tipo de processo do container `mcp` e a toolchain de build
   não foram verificados contra o stack** (IM-6) — `@modelcontextprotocol/sdk`
   nem está em `package.json`.

Recomendação para a SPEC v3: resolver CR-1 a CR-5 com decisões escritas
(subseção 3.3.1 de mecânica de identidade; 3.5.1 reescrita reconhecendo a
reestruturação; 3.4 com decisão de rebuild + `rawDeleted` + grão de
`FatoFinanceiroSaldo`); redecompor as ondas 4c e 4d; fechar IM-1/IM-6/IM-7 que
são ambiguidades que travam a onda 4a/4c. Os achados menores (MN-1..4) são
correções de redação e modelagem de baixo risco. **Critério de saída:** nenhuma
onda esconde mais de uma unidade de trabalho e a mecânica de identidade está
desenhada, não delegada ao plano.
