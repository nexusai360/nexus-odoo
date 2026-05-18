# F4 — MCP semântico — Review crítica da SPEC v1 (Review #1)

> Auditoria adversarial da SPEC v1 (`docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md`).
> Etapa [3] do workflow (`CLAUDE.md §6`). Os achados aplicados geram a SPEC v2.
> Revisor: agente adversarial. Data: 2026-05-17.

Critério desta review: achar erro material. Foram encontrados **23 achados**:
9 CRÍTICOS, 9 IMPORTANTES, 5 MENORES. A SPEC v1 **não está pronta** para virar
plano — ela é sólida na arquitetura macro, mas tem furos estruturais em RBAC,
no contrato de identidade, no faseamento de fatos e na decomposição de ondas.

---

## CRÍTICOS

### C1 — RBAC: o conceito de `tenantId` não existe no schema atual

**Seção:** 3.3 (`UserContext`), 3.6 camada 3, 4 (`FatoFinanceiroSaldo` etc.), 7.

A spec assume `tenantId` em três pontos: o `UserContext` carrega `tenantId`; a
camada 3 do RBAC injeta `tenantId` em todo query; a camada 5 prevê RLS "por
`tenantId`". **Mas `prisma/schema.prisma` não tem coluna `tenantId` em lugar
nenhum** — nem em `User`, nem em `FatoEstoqueSaldo`, nem nas tabelas `raw`. O
projeto é hoje **tenant único** (confirmado pelo próprio CLAUDE.md §1 — uma só
instância Tauga). A spec inventa uma dimensão de dados que não está modelada e
que F1/F2/F3 não criaram.

Consequência: "tenant scoping injetado" (camada 3) é uma camada **vazia** — não
há o que injetar. Os fatos novos de financeiro propostos em 3.4 também **não
têm coluna `tenantId`**, então a própria spec se contradiz: a camada 3 exige
filtrar por `tenantId`, os modelos da seção 4 não o têm.

**Recomendação:** decidir e escrever explicitamente. Ou (a) o projeto é
tenant único e a camada 3/5 do RBAC vira "scoping de empresa Odoo
(`company_id`)" se houver multi-company na instância Tauga — e aí precisa ser
descoberto se há mais de uma `res.company`; ou (b) `tenantId` é removido do
`UserContext` e as 7 camadas são reescritas honestamente como 6 efetivas + 1
documentada-como-futura. Não deixar uma camada de RBAC que é literalmente um
no-op disfarçado de controle. O `CLAUDE.md §5.6` lista "tenant scoping" como
camada canônica — então isto precisa de decisão registrada, não de silêncio.

### C2 — Contrato de identidade: quem emite o JWT por chamada não está definido

**Seção:** 3.3.

A spec diz "o `userId` viaja por chamada dentro de um JWT assinado emitido pela
plataforma". **Não existe hoje** nenhum endpoint da plataforma que emita um JWT
de curta duração por usuário para um serviço terceiro. O NextAuth emite um JWT
de **sessão de browser** (cookie, `maxAge` 7 dias, `auth.config.ts`), que é um
artefato totalmente diferente — não é entregável a um agente, não é por-chamada,
e a chave é `AUTH_SECRET`.

Pior: a F4 declara explicitamente (seção 1, 2.2) que "o vínculo
número↔usuário e a integração WhatsApp são F5". Mas se o emissor do JWT por
chamada é F5 (o agente é quem sabe qual usuário está perguntando), então **a F4
está especificando um contrato cuja contraparte não existe e não será
construída na F4**. A F4 não tem como testar o caminho real de identidade ponta
a ponta — só com tokens de teste forjados.

**Recomendação:** a spec precisa decidir e declarar uma de duas coisas:
(a) a F4 entrega também o **endpoint emissor de token** na plataforma
(`POST /api/mcp/token` autenticado por sessão → devolve JWT curto com `sub=userId`),
tornando o contrato testável de verdade — e isso vira uma entrega explícita da
onda 4a; ou (b) a F4 entrega apenas a **verificação** do token contra um
contrato JWT documentado (claims, algoritmo, emissor, expiração), e o emissor é
F5 — mas então a spec precisa dizer isso com todas as letras e a verificação
ponta a ponta (seção 6) tem que assumir token de teste. Hoje a spec fica no
meio do caminho: "mesma chave do NextAuth ou chave dedicada — decidir no plano"
empurra para o plano uma decisão de **arquitetura de segurança** que é
responsabilidade da spec.

### C3 — Os builders de fato de financeiro não têm onde ser disparados

**Seção:** 3.4, onda 4b.

A spec diz "builders disparados após o ciclo de sync (padrão `src/worker/fatos/`)".
O padrão real (`src/worker/sync/processors.ts` linhas 97-125) é: os builders de
estoque são chamados **hard-coded dentro de `processSnapshotCycle`**, logo após
o loop de snapshot. Não existe registry de builders, não existe hook genérico —
é uma lista fixa de três `await import(...)` no fim de uma função.

As fontes de financeiro propostas (`raw_finan_banco_saldo_hoje`,
`raw_finan_fluxo_caixa`, `raw_finan_pagamento_divida`) podem ser modelos
**incrementais**, não snapshot — `raw_finan_banco_saldo` e
`raw_finan_pagamento_divida` acumulam histórico. Se forem incrementais, os
builders precisam rodar ao fim de `processIncrementalCycle`, **não** de
`processSnapshotCycle`. A spec não diz em qual ciclo cada builder roda, e a
onda 4b ("integração no ciclo de build") esconde essa decisão.

**Recomendação:** (1) determinar o `mode` (snapshot/incremental/estatico) de
cada um dos 3 modelos-fonte de financeiro consultando `MODEL_CATALOG` — isto é
descoberta para a spec/plano, não item solto; (2) decidir se a F4 deve
**refatorar** o disparo de builders num registry (`fatoBuilders: BuilderEntry[]`)
ou apenas **acrescentar** três `await import` à mão como hoje. Dado que o §9
canônico fala de "todos os domínios" na F4, um registry é praticamente
obrigatório — e isso é trabalho real que a onda 4b não dimensiona.

### C4 — `fato_estoque_saldo` é declarado provisório; a F4 constrói 6 tools sobre ele sem revalidar

**Seção:** 2.3, 3.5 (tabela de estoque), e `docs/fatos-modelagem.md`.

`docs/fatos-modelagem.md` afirma textualmente: *"`fato_estoque_saldo` é
**provisório** ... Suas colunas podem mudar quando a F3 definir os relatórios"*
e o checklist diz *"Revisar/substituir `fato_estoque_saldo` se necessário"*.

A F3 já rodou (F3 concluída — recent commits). A spec da F4 assume que os 3
fatos de estoque estão estáveis e constrói 6 tools em cima deles (onda 4c) —
**mas não verifica se a F3 efetivamente estabilizou ou substituiu
`fato_estoque_saldo`**. O catálogo da F3 (`src/lib/reports/catalog.ts`) usa
colunas agregadas (`saldoTotal`, `valorTotal`, `numLocais`, `percentual`,
`armazem`) que **não existem na tabela `FatoEstoqueSaldo`** — elas são
calculadas em query. As tools do MCP terão que reproduzir essa mesma agregação.
A spec não menciona onde mora a lógica de agregação compartilhada entre
dashboard e MCP — risco de divergência de números entre as duas frentes (a
mesma pergunta respondida diferente no painel e no WhatsApp).

**Recomendação:** a spec precisa de uma seção "reuso da camada de query da F3":
ou as tools de estoque do MCP **reusam** as funções de query da F3
(`src/lib/reports/queries/*` ou equivalente — verificar no plano), ou a spec
aceita explicitamente a duplicação e exige um teste de paridade dashboard×MCP.
Sem isso, F3 e F4 vão divergir. Também: confirmar que `fato_estoque_saldo` não
foi marcado para substituição pela F3.

### C5 — `FatoFinanceiroSaldo` usa `odooId`/`bancoId` mas não há garantia de unicidade da fonte

**Seção:** 3.4.

`FatoFinanceiroSaldo` lista `odooId` como coluna mas **não diz qual é a PK**.
O padrão dos fatos existentes é heterogêneo e deliberado: `FatoEstoqueSaldo`
tem PK `id` UUID + `odooSaldoId @unique`; `FatoEstoqueMovimento` tem PK `odooId`
"porque o builder recria a tabela inteira"; `FatoProdutoParado` tem PK
`saldoHojeId`. A spec da F4 não escolhe o padrão de PK para nenhum dos 3 fatos
novos.

Mais grave em `FatoFinanceiroSaldo`: a fonte é `raw_finan_banco_saldo_hoje`,
descrita no risco (seção 7) como tendo "só 8 linhas". Se é um snapshot do saldo
**de hoje** por conta, o `odooId` da linha-fonte rotaciona a cada snapshot (como
acontece com modelos snapshot — ver comentário WR-08 em `processors.ts`).
Usar `odooId` como identidade do fato é frágil. A identidade natural é
`bancoId` (a conta), não o `odooId` do registro de snapshot.

**Recomendação:** para cada um dos 3 fatos, a spec deve declarar a PK e a
estratégia de rebuild (full `deleteMany`+`createMany` é o padrão). Para
`FatoFinanceiroSaldo`, a PK lógica é `bancoId`; `odooId` pode nem ser
necessário. Não empurrar isto para "o plano decide" — é modelagem de dados, é
trabalho da spec.

### C6 — Caminho 3c (Postgres MCP) está subespecificado a ponto de não ser construível

**Seção:** 3.7 (3c), 5 (onda 4e), 7.

A spec descreve 3c como "uma tool dedicada (`bi_consulta_sql` ou equivalente)
encaminha ao Postgres MCP (text-to-SQL controlado, read-only)". Isso esconde um
épico inteiro disfarçado de bullet point:

- **Quem é o Postgres MCP?** O `CLAUDE.md §5.7` cita "Crystal DBA" como
  ferramenta de **dev/DBA**, separada do MCP de produção. A spec agora o coloca
  **em produção**, dentro do caminho 3c, acessível por usuário admin via o
  agente. Isso é uma mudança de decisão canônica que a spec não sinaliza.
- **Como o MCP semântico "encaminha" para outro MCP?** Um servidor MCP não é
  cliente de outro MCP por padrão. Ou o MCP semântico vira **cliente MCP** do
  Postgres MCP (complexidade nova: connection, lifecycle, auth entre dois MCPs),
  ou o agente da F5 fala com os **dois** servidores MCP diretamente — e nesse
  caso 3c **não é entrega da F4** de forma alguma, é configuração de F5.
- **Text-to-SQL** implica um LLM gerando SQL. A spec diz "a F4 não embute um
  classificador de linguagem natural" (3.7) — mas text-to-SQL é exatamente
  isso. Contradição.
- O Postgres MCP precisa de um **role read-only** próprio (a spec menciona),
  mas isso colide com a camada 4 do RBAC, que define um role MCP com SELECT só
  em `fato_*`. O Postgres MCP read-only com SELECT em `fato_*` apenas é inútil
  para BI (o ponto do BI é ir além dos fatos); com SELECT em tudo, fura a
  contenção da camada 4.

**Recomendação:** retirar 3c do escopo da onda 1 da F4, ou reescrevê-lo por
completo. A opção honesta: a F4 entrega o **contrato 3c** — a tool de fronteira
que sinaliza "esta pergunta requer modo BI", o aviso de resposta, e a definição
do role read-only — e **a integração efetiva do Postgres MCP é F5/configuração
de deploy**, onde o agente é montado. Se 3c fica na F4, precisa de sua própria
sub-spec. Como está, é irreal.

### C7 — A onda 4f esconde um épico: "hardening do RBAC 7 camadas" não é uma onda, são 7

**Seção:** 5 (tabela de ondas).

A onda 4f é descrita como "Hardening do RBAC 7 camadas (GRANT mínimo, RLS
preparado, rate limit), verificação ponta a ponta". Isso agrupa, num único item:
criação de role Postgres por migration/script (camada 4), políticas RLS
preparadas (camada 5), rate limit por usuário com Redis (camada 7), **mais** a
verificação ponta a ponta da fase inteira. Cada um desses é uma unidade de
trabalho independente e verificável isoladamente. O `CLAUDE.md §6` é explícito:
"se uma task descreve [várias coisas] juntas, ela é um épico — quebrar".

Além disso, há um **erro de ordem**: as camadas 1, 2, 6 do RBAC (catálogo
filtrado, validação no handler, Zod) **não podem** ser deixadas para 4f — elas
são intrínsecas a cada tool e precisam existir já em 4c/4d, senão as tools de
estoque/financeiro nascem sem RBAC e ficam 2 ondas inseguras. A spec coloca
"scaffolding do RBAC" em 4a e "hardening" em 4f, mas não diz que camadas 1/2/6
são pré-requisito de 4c/4d.

**Recomendação:** redecompor. As camadas 1, 2, 6 são parte da definição de
"uma tool" — entram no scaffolding de 4a e são exercidas por toda tool de
4c/4d. A onda 4f deve ser quebrada em: 4f-1 role Postgres + GRANT (migration),
4f-2 RLS preparado (documentado, desabilitado), 4f-3 rate limit por usuário,
4f-4 verificação ponta a ponta. E a verificação ponta a ponta talvez nem seja
"onda" — é a etapa [9] do workflow.

### C8 — Rate limit por `userId`: o padrão existente não serve e a spec não reconhece isso

**Seção:** 3.6 camada 7, 5 (onda 4f).

A spec diz "rate limit por `userId` (reusar padrão `src/lib/rate-limit.ts`)".
O `src/lib/rate-limit.ts` real é um rate limiter de **login**: chave
`login:attempts:{email}:{ip}`, 5 tentativas/60s, lockout de 15 min, função
`checkLoginRateLimit(email, ip)`. Ele é **específico de login** — assinatura,
chaves, constantes e semântica de lockout não se aplicam a tool calls de MCP.
"Reusar" aqui não é reusar; é escrever um rate limiter novo. A spec subestima o
trabalho e induz o plano a erro.

Além disso falta decidir: rate limit por `userId` apenas, ou por
`userId`+`tool`? Qual janela e qual limite para um agente de IA que pode
disparar várias tools por pergunta? O agente legítimo pode estourar um limite
pensado para humano.

**Recomendação:** a spec deve dizer "novo rate limiter para o MCP, inspirado no
padrão de `rate-limit.ts` (Redis INCR + EXPIRE), com chave e limites próprios
de tool call" e definir janela/limite (ex.: 60 req/min por `userId`),
considerando que o cliente é um agente, não um humano. Não dizer "reusar".

### C9 — `McpAuditLog` grava `params` com "PII minimizada" — regra indefinida e potencialmente conflitante com o gap-log

**Seção:** 3.8.

`McpAuditLog.params` é "JSON, com PII minimizada". A spec não define o que é
"minimizar PII". Os inputs das tools de financeiro incluem nomes de
participantes, números de documento, valores — dados sensíveis de negócio. Ao
mesmo tempo, `feature_requests` grava `perguntaResumo` (3a), que é texto livre
do usuário e pode conter qualquer PII. A spec aplica "minimização" a um e não
ao outro, sem critério.

Há também um conflito com a decisão canônica de **auditoria** (`CLAUDE.md §8`,
"Auditoria de acessos"): um audit log que minimiza os params perde valor
forense — não dá para reconstruir o que foi consultado. A spec precisa
escolher entre "audit completo, tabela protegida" e "audit minimizado".

**Recomendação:** definir explicitamente a política: (a) `McpAuditLog.params`
guarda os inputs **íntegros** (são parâmetros estruturados, não conteúdo livre)
e a tabela é protegida pela camada 4 (sem SELECT para o role MCP comum); (b)
`feature_requests.perguntaResumo` é o único campo de texto livre — definir se é
gravado cru ou se passa por alguma sanitização. Remover o termo vago "PII
minimizada" e substituir por regra concreta.

---

## IMPORTANTES

### I1 — Os 3 fatos de financeiro podem não cobrir as 6 tools propostas

**Seção:** 3.4 vs 3.5 (tabela financeiro).

Cruzando tools×fatos:
- `financeiro_fluxo_caixa` ("fluxo projetado") depende de `FatoFinanceiroMovimento`,
  que tem `entradaPrevista`/`saidaPrevista`. Mas `raw_finan_fluxo_caixa` é
  realizado **ou** previsto? Se a fonte só tem realizado, a tool de projeção não
  tem dado. A spec assume colunas previstas sem confirmar que a fonte as fornece.
- `financeiro_titulos_vencidos` precisa de `diasAtraso` calculado **na data de
  hoje**. `FatoFinanceiroTitulo` tem `diasAtraso` como coluna materializada —
  mas atraso muda todo dia. Se o fato é reconstruído só quando a fonte muda,
  `diasAtraso` fica obsoleto entre rebuilds. Mesma classe de problema que
  `fato_produto_parado` (que depende de `raw_..._duracao_dias` justamente para
  não calcular tempo no builder).
- `financeiro_caixa_periodo` e `financeiro_fluxo_caixa` consomem o **mesmo**
  fato (`FatoFinanceiroMovimento`) — ok, mas então a granularidade do fato (por
  dia? por dia+conta+centro?) precisa servir às duas. A spec lista as colunas
  mas não a **chave de grão**.

**Recomendação:** a spec deve, para cada fato: (1) declarar o grão (uma linha
representa o quê); (2) confirmar contra amostra de `raw` que as colunas
previstas existem na fonte; (3) tratar `diasAtraso` — ou recalculá-lo na query
da tool (não materializar) ou documentar que reflete o último rebuild. A nota
"mapeamento de selection é tarefa de descoberta" cobre os enums, mas **não**
cobre o grão nem as colunas calculadas voláteis.

### I2 — Catálogo MCP "no padrão de `catalog.ts`" — mas o padrão da F3 não tem schema de input/output

**Seção:** 3.5.

A spec diz que o catálogo de tools segue "o padrão de `src/lib/reports/catalog.ts`".
O `catalog.ts` real é um catálogo de **relatórios de dashboard**: tem `secoes`,
`template`, `config`, `filtros`, `icone` — vocabulário de UI. Uma tool MCP
precisa de `inputSchema`/`outputSchema` Zod, `handler`, `domínio` — vocabulário
totalmente diferente. "No padrão de `catalog.ts`" é enganoso: o que se reaproveita
é a **ideia** de catálogo declarativo + função de filtro por RBAC
(`reportsForUser`), não a estrutura. A spec induz o plano a achar que há mais
reuso do que há.

**Recomendação:** trocar a frase por "catálogo declarativo **próprio do MCP**,
inspirado na ideia de `catalog.ts` (entrada declarativa + filtro por domínio
como `reportsForUser`), com estrutura própria: `id`, `dominio`, `descricao`,
`inputSchema`, `outputSchema`, `handler`".

### I3 — A spec não trata erro de banco / cache vazio / fato nunca construído

**Seção:** geral; 6 (testes).

A spec define `outcome` do audit com `ok/denied/error/invalid_input`, mas não
descreve o **comportamento** das tools nos casos de erro: Postgres
indisponível, fato com `FatoBuildState` ausente (builder nunca rodou — o próprio
schema comenta que isso é distinguível), fato vazio (rodou e não produziu
linhas). O modelo `FatoBuildState` existe exatamente para distinguir esses
casos; a spec não diz como a tool usa essa distinção. "Builder nunca rodou"
deveria dar uma resposta diferente de "não há dados".

**Recomendação:** acrescentar uma subseção "comportamento sob falha": tool
consulta `FatoBuildState`; se ausente → resposta "este indicador ainda não foi
processado"; se presente mas zero linhas → "não há registros"; erro de conexão
→ `outcome=error` + mensagem genérica ao agente. Sem isto, o critério de aceite
da seção 6 é incompleto.

### I4 — Onda 4e depende só de 4a, mas a tool de gap-log e 3c precisam do registry e do RBAC

**Seção:** 5 (tabela de ondas).

A onda 4e ("Caminho 3 completo") declara dependência apenas de 4a. Mas:
- A tool de gap-log (3a) e a tool de BI (3c) são **tools** — entram no mesmo
  registry de catálogo e no mesmo pipeline de RBAC/audit das tools de
  estoque/financeiro. Se o registry e o pipeline só ficam maduros depois de
  4c/4d, 4e não pode rodar antes deles, ou roda sobre um pipeline imaturo.
- A tool de BI (3c) é restrita a admin/analista — depende da camada 1 do RBAC
  estar funcionando, não só do "scaffolding".

**Recomendação:** corrigir as dependências: 4e depende de 4a **e** de 4c (ou
de uma onda intermediária que estabilize o registry+RBAC com a primeira tool
real). Ou mover a tool de gap-log para dentro de 4c (primeira tool a exercer o
pipeline completo).

### I5 — Não há perfil "analista" no schema; 3c restringe a um perfil inexistente

**Seção:** 3.7 (3c).

A spec diz que o modo BI é "restrito a `admin`/`super_admin`/analista". O enum
`PlatformRole` no schema tem **`super_admin`, `admin`, `manager`, `viewer`** —
não existe `analista`. O `CLAUDE.md §5.5` também fala em "perfil admin/analista".
A spec referencia um papel que o sistema não tem.

**Recomendação:** decidir: ou 3c é restrito a `admin`/`super_admin` (papéis
reais) e a spec corrige a frase; ou "analista" é um papel novo a ser criado —
e aí é mudança de schema (`PlatformRole`), com impacto em F1/RBAC, e precisa ser
item explícito da spec, não citação de passagem. Recomendado: usar
`admin`/`super_admin` e remover "analista".

### I6 — `markFatoBuilt` é gravado dentro da transação; o role MCP só tem SELECT — ok, mas o worker e o MCP usam roles diferentes e a spec não separa

**Seção:** 3.6 camada 4.

A camada 4 define um role Postgres do **MCP** com SELECT em `fato_*` + escrita
só em `McpAuditLog`/`feature_requests`. Correto. Mas os **builders de fato**
(onda 4b) rodam no **worker**, que precisa de `DELETE`/`INSERT` em `fato_*` e
`UPSERT` em `fato_build_state`. A spec não menciona que worker e MCP devem usar
**roles/credenciais distintos** — hoje o worker usa `DATABASE_URL` com um único
role (provavelmente superusuário/owner). Se o MCP herda a mesma `DATABASE_URL`,
a camada 4 não existe na prática.

**Recomendação:** a spec deve declarar explicitamente: o container `mcp` recebe
uma `DATABASE_URL` própria apontando para o role restrito; o worker mantém a
sua. Adicionar isto ao escopo da onda 4a (provisionamento do role e da env do
container) e à seção 4 ("role Postgres do MCP criado por migration ou script").

### I7 — Stateless + "cache de catálogo" + recarregar role/domains a cada chamada: custo não avaliado

**Seção:** 3.2, 3.3.

A spec diz que o servidor é stateless e mantém "cache de catálogo"; e que a cada
chamada **recarrega** `role` e `domains` do banco. Para um agente que dispara N
tools por pergunta de WhatsApp, isso é N queries `User`+`UserDomainAccess` por
pergunta. Não é proibitivo, mas a spec afirma "stateless" e "recarrega sempre"
sem avaliar o custo nem oferecer alternativa (ex.: cache curto de
`UserContext` por `userId` com TTL de segundos). Não é crítico, mas é uma
decisão de performance tomada implicitamente.

**Recomendação:** registrar a decisão: recarga por chamada é aceita pela
segurança (autorização sempre fresca) e o custo é baixo (2 queries indexadas);
ou introduzir um cache de `UserContext` com TTL curto. Escolher e justificar,
não deixar implícito.

### I8 — A spec não define o que acontece quando o JWT é válido mas o usuário foi desativado/excluído

**Seção:** 3.3.

A spec diz "após validar o JWT, recarrega `role` e `domains` do banco". E se o
`findUnique` não achar o usuário (excluído) ou achar `isActive=false`? O
callback `jwt` do NextAuth (`auth.ts`) trata exatamente isso (`if (!fresh.isActive) return null`).
A spec do MCP não trata. Um JWT ainda válido de um usuário desligado não pode
acessar tools.

**Recomendação:** acrescentar: se o usuário não existe ou `isActive=false`, a
chamada é negada (`outcome=denied`), independente de o JWT estar dentro da
validade.

### I9 — Verificação "ponta a ponta" sem o cliente real (o agente é F5) — a spec não diz como

**Seção:** 6, onda 4f.

A spec promete "verificação ponta a ponta" e "subir o servidor MCP, exercer
cada tool com um `UserContext` de cada perfil". Mas o **único cliente** do MCP
é o agente da F5, que não existe. "Ponta a ponta" na F4 só pode significar um
**harness de teste** que simula o cliente MCP (forja JWT, chama tools via
Streamable HTTP, verifica resposta). A spec não nomeia esse harness como
entregável — e ele é trabalho real.

**Recomendação:** a seção 6 deve declarar o harness/cliente de teste MCP como
entregável explícito (script ou suíte de integração que fala Streamable HTTP),
incluindo a forja de JWT de teste. Sem ele, "ponta a ponta" é vago.

---

## MENORES

### M1 — `feature_requests` em snake_case; demais models em PascalCase

**Seção:** 2.1, 3.8, 4. A spec ora chama de `feature_requests`, ora de
`FeatureRequest` (seção 4). O schema usa `model PascalCase` + `@@map("snake_case")`.
Padronizar a spec: model `FeatureRequest`, tabela `feature_requests`.

### M2 — Enum `ReportDomain` é de "domínio de relatório" — o MCP usa "domínio de tool"

**Seção:** 3.6 camada 1. A spec reusa `ReportDomain`/`UserDomainAccess` para o
RBAC do MCP. Conceitualmente, o domínio que governa um relatório e o que governa
uma tool MCP são o mesmo (estoque, financeiro...) — o reuso é correto. Mas vale
registrar na spec que essa equivalência é **intencional** e que conceder o
domínio "financeiro" a um `viewer` libera tanto os relatórios quanto as tools
MCP de financeiro — pode não ser o desejado. Confirmar com o produto.

### M3 — `atualizadoHa` vs `atualizadoEm` — formato não definido

**Seção:** 3.1, 3.5. A spec fala em `atualizadoEm` e `atualizadoHa`. `atualizadoHa`
("há Xs") é texto relativo — definido em qual unidade, calculado onde (servidor
ou cliente)? A F3.5g já implementou indicador de tempo relativo no dashboard;
verificar se há util reaproveitável. Definir: tool retorna `atualizadoEm` (ISO)
e o texto relativo é responsabilidade de quem exibe, ou a tool já devolve a
string.

### M4 — Porta interna "dedicada" não nomeada

**Seção:** 3.2. "Porta interna dedicada" — escolher e registrar o número na
spec (ex.: 3100), para o `docker-compose`/Portainer e a env do agente. Detalhe,
mas evita decisão solta no plano.

### M5 — Seção 7 (riscos) não lista os riscos mais graves desta review

**Seção:** 7. A matriz de riscos não menciona: ausência de `tenantId` (C1),
emissor de JWT inexistente (C2), 3c subespecificado (C6). A matriz de riscos
deveria refletir os pontos realmente frágeis, não os confortáveis.

---

## Veredito

A SPEC v1 acerta a visão macro (cache-only, tools validadas, Caminho 3, 7
camadas como princípio) e está alinhada às decisões canônicas de **alto nível**.
Mas falha nos pontos onde "decisão canônica" precisa virar "desenho concreto":

1. **`tenantId` é vaporware** no schema — uma camada de RBAC inteira é no-op (C1).
2. **O contrato de identidade não tem emissor** — a peça central da segurança
   depende de algo que não existe e que a F4 declara fora de escopo (C2).
3. **3c (Postgres MCP) é um épico disfarçado** de bullet e contradiz §5.7 (C6).
4. **A decomposição em ondas tem dependências erradas e a 4f é um épico** (C7, I4).
5. **Os fatos de financeiro estão modelados sem grão nem confirmação de fonte**,
   e `diasAtraso` materializado fica obsoleto (C5, I1).

Recomendação: a SPEC v2 deve resolver C1–C9 com decisões escritas (não
"decidir no plano"), reescrever a seção 5 com ondas redecompostas, e adicionar
as subseções "comportamento sob falha", "reuso da camada de query da F3" e
"harness de teste MCP". A maioria dos achados aponta para **escopo empurrado
indevidamente ao plano** — a spec precisa puxar essas decisões de volta.
