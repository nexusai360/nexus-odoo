# Review adversarial #1 — PLAN v1 "F4 completo"

> Alvo: `docs/superpowers/plans/2026-05-18-f4-completo.md` (PLAN v1, 56 tasks,
> ondas A–H). Foco `CLAUDE.md §6` [6]: decomposição máxima, zero ambiguidade,
> sem placeholder. Verificado contra o código real (`freshness.ts`, `registry.ts`,
> `failure.ts`, `server.ts`, `audit.ts`, `integration.test.ts`, `dias-atraso.ts`,
> `contas-a-receber.ts`, `mcp-role.sql`, `bi-consulta-avancada.ts`).
>
> Resultado: **5 CRÍTICO, 9 IMPORTANTE, 6 MENOR.** A review encontrou achados
> materiais — o plano **não está pronto para execução** sem uma v2.

---

## CRÍTICO

### P-C1 — `outcome="invalid_input"` para SQL recusada pelo guard é IMPOSSÍVEL com o pipeline atual
**Tasks:** H.6 Step 1, H.8 Step 4; SPEC §3.7 C6.
**Problema.** O plano (H.6 Step 1) crava: "chama `validarSqlSelect(input.sql)` —
`{ ok:false }` → **lança erro que o pipeline mapeia para `outcome="invalid_input"`**".
Isso é falso contra o código real. `mcp/lib/failure.ts::toOutcome` mapeia para
`invalid_input` **somente** `ZodError`; qualquer outra exceção (um `Error`
comum, uma classe custom) cai em `"error"`. E `mcp/server.ts` linha 80–81
executa o handler e imediatamente seta `outcome = "ok"` — o handler só
influencia o outcome lançando exceção. Logo, do jeito descrito, SQL recusada
pelo guard será auditada e respondida como `outcome="error"`, não
`invalid_input`. O E2E de H.8 Step 4 ("`DELETE ...` → recusado (`invalid_input`)")
**vai falhar**. Os testes unitários de H.6 que esperam `invalid_input` também.
**Recomendação.** Decidir e cravar **um** mecanismo, com task explícita:
(a) criar uma classe `InvalidInputError` em `mcp/lib/failure.ts` e estender
`toOutcome` para mapeá-la a `invalid_input` — isso é uma **modificação de
arquivo compartilhado do pipeline da onda 1**, hoje ausente da lista "Modificar"
e de qualquer task; **ou** (b) o handler do 3c não lança: valida com o guard e,
em caso de recusa, **lança um `ZodError`** (artificial — feio); **ou** (c) o
handler retorna um output estruturado de recusa com `outcome="ok"` — mas isso
contradiz a SPEC §3.7 C6 que exige `invalid_input`. A opção (a) é a correta e
precisa virar uma task de onda H **antes** de H.6, com seu próprio teste de
`toOutcome`.

### P-C2 — As assertivas de contagem fixa `14` no harness não são tratadas em nenhuma task
**Tasks:** B.11, C.11, D.7, E.8, F.4, H.8, V.1 Step 6; SPEC §6/§2.4.
**Problema.** O `mcp/__tests__/integration.test.ts` real **não** tem só "um
conjunto de ids esperados" para estender. Tem **pelo menos 9 assertivas
literais** de `14` espalhadas por `it()` distintos: `toHaveLength(14)` nas
linhas 106, 117, 131, 139, 326, e os títulos/lógica das linhas 103, 116, 129,
137, 312. Toda task de harness do plano (B.11 Step 2, C.11 Step 2, etc.) diz
apenas "estender o **conjunto de ids esperados**" — como se houvesse um único
array. Não há instrução para localizar e atualizar os 9 `toHaveLength(14)` →
`(19)` → `(25)` → … → `(33)`, nem os títulos dos testes. Um subagente Sonnet
seguindo a task ao pé da letra deixará 9 testes vermelhos por onda. Pior: como
cada onda soma tools, o número-alvo muda a cada onda (19, 25, 28, 30, 33) — o
plano não diz qual número cada onda deve cravar.
**Recomendação.** Antes da onda B, adicionar uma task que **lê o
`integration.test.ts` real e cataloga todas as assertivas de contagem e título**.
Em cada task de harness, listar explicitamente: "atualizar os N `toHaveLength`
de `<antigo>` para `<novo>`" com os números exatos por onda
(B→19, C→25, D→28, E→30, F→33; H não soma id). Ou refatorar o harness para
derivar o número de uma constante única `EXPECTED_TOOL_IDS` — e essa refatoração
é, ela mesma, uma task.

### P-C3 — `mcp-role.sql` não é idempotente em `GRANT`; reaplicá-lo apaga os GRANTs novos
**Task:** A.4 Step 2 ("o script é idempotente").
**Problema.** A.4 Step 2 afirma "(o script é idempotente)". Parcialmente falso e
perigoso. O `2026-05-17-mcp-role.sql` real começa (linhas 28–30) com
`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nexus_mcp`. O plano manda
**inserir o bloco 5b** dos 6 GRANTs novos no meio do arquivo. Reaplicar o
arquivo é idempotente **só se** o bloco 5b estiver presente — ok. Mas o risco
real é outro: a Task A.4 roda **antes** da A.3 ter criado as tabelas? Não — A.3
cria as tabelas, A.4 dá GRANT. Porém A.4 Step 2 aplica **o arquivo inteiro**,
que tem o bloco 8 (`DO $$` que faz `REVOKE ALL` em todas `raw_*`). Tudo bem.
O problema concreto: o `GRANT SELECT ON fato_pedido` **falha com erro** se a
tabela não existir, e A.4 depende de A.3 ter rodado `prisma migrate dev` **e**
a migration ter sido aplicada no mesmo banco de dev onde A.4 roda `psql`. O
plano não crava que A.3 e A.4 operam o **mesmo banco**, nem o que fazer se a
ordem A.3→A.4 for violada num replay parcial. Além disso, o bloco 8 itera
`raw_%` — se rodar antes de A.3, sem novidade; mas não há garantia textual de
que A.4 não seja re-rodada após uma futura migration que crie outra `raw_*`.
**Recomendação.** Cravar em A.4: "precondição — a migration de A.3 foi aplicada
neste banco; confirmar com `\d fato_pedido` antes de rodar o script". E
declarar explicitamente que A.3 (`prisma migrate dev`) e A.4 (`psql -f`) usam a
**mesma `DATABASE_URL` de dev**. Sem isso o subagente pode rodar A.3 no banco
do Prisma e A.4 num banco diferente.

### P-C4 — Task E.2 é uma task condicional/épico disfarçado — viola decomposição máxima
**Task:** E.2.
**Problema.** E.2 é "Ajuste do schema `FatoContaContabil` conforme a discovery"
com Steps marcados "(condicional)" e "(só se divergente)". Uma task cujo escopo,
arquivos tocados e existência de commit dependem do resultado de E.1 **não é
uma unidade de escopo único verificável isoladamente** — é um épico ramificado.
O `CLAUDE.md §6` proíbe explicitamente isto ("se uma task descreve [trabalho
condicional]... quebrar"). Pior: se E.1 revelar que o `FatoContaContabil`
provisório de A.3 está errado, E.2 gera uma **segunda migration de schema** —
ou seja, A.3 entregou um modelo que se sabe de antemão que pode estar errado.
Isso é dívida deliberada no schema, e o número de migrations final é
indeterminado.
**Recomendação.** Reordenar: a **discovery de `raw_contabil_conta` (E.1) deve
acontecer ANTES da onda A**, junto com a discovery de `pedido.etapa` (hoje em
B.1 — mesmo problema, ver P-I1). A SPEC §3.4 já admite "é o domínio mais fraco";
então o `FatoContaContabil` **não deve ser criado provisório em A.3**. Mover a
discovery contábil para uma onda A.0 (ou pré-onda) e criar o modelo
`FatoContaContabil` definitivo em A.3 com colunas já cravadas. Eliminar E.2;
o builder E.3 passa a operar sobre schema estável.

### P-C5 — Conflito de escrita em `registry.ts`/`catalog/index.ts`/`freshness.ts` entre ondas é "resolvido" por uma recomendação, não pelo plano
**Tasks:** §"Modelo de execução", B.2/B.4/B.11, C.x, D.x, E.x, F.4.
**Problema.** O plano diz (linhas 178–182) que B–F "podem ser despachadas em
paralelo, **exceto** o Step que edita [os 4 arquivos compartilhados]... o
subagente edita um de cada vez, **ou** executam-se as ondas em sequência.
Recomendado: B→C→D→E→F sequencial". Isso é ambiguidade pura num plano que se
diz para `subagent-driven-development`. "Recomendado" não é instrução
executável. Se o executor seguir o paralelo, dois subagentes editam
`registry.ts` e `mcp/catalog/index.ts` concorrentemente → conflito de merge ou
sobrescrita silenciosa. O plano precisa **decidir**.
**Recomendação.** Cravar: "ondas B–F são **estritamente sequenciais**
(B→C→D→E→F); não há paralelismo entre ondas". Remover a alternativa "ou".
Alternativamente, extrair as edições de `registry.ts`/`catalog/index.ts`/
`freshness.ts` para tasks de "integração" que rodam serializadas após os
builders/tools — mas a sequencialidade simples é mais limpa.

---

## IMPORTANTE

### P-I1 — Discovery (B.1) está dentro da onda B, mas seu resultado deveria existir antes do schema
**Task:** B.1.
**Problema.** B.1 descobre o nome real da flag de etapa final **e** "o nome real
do campo `selection` `tipo` de `pedido.documento` e seus valores". Mas o modelo
`FatoPedido` já foi cravado em A.3 com a coluna `tipo`/`etapaFinaliza`. Se a
discovery revelar algo inesperado (ex.: a flag não existe, ou `tipo` tem outro
nome), o schema de A.3 está errado e não há task de correção (ao contrário do
contábil, que ao menos tem E.2). Discovery que pode invalidar o schema deve
preceder o schema.
**Recomendação.** Mover B.1 (e a discovery contábil E.1 — ver P-C4) para uma
onda de discovery **antes da onda A**. A onda A consome resultados cravados.

### P-I2 — `calcDiasAtraso` vs `diasAtraso` — nome de função inexistente
**Tasks:** B.9 Step 1 e Step 3.
**Problema.** B.9 manda calcular dias de atraso "via `mcp/lib/dias-atraso.ts`" e
no Step 3 "`calcDiasAtraso` por linha". O arquivo real `mcp/lib/dias-atraso.ts`
exporta a função **`diasAtraso`**, não `calcDiasAtraso`. Um subagente vai
importar um símbolo inexistente → erro de compilação, ou vai criar uma função
nova duplicada.
**Recomendação.** Corrigir B.9 para `diasAtraso(dataVencimento, hoje)`, com a
assinatura real `(Date | null, Date) => number`.

### P-I3 — A SPEC §3.7 manda `import "./bi-pool.js"`; o plano nunca conecta o `bi-pool` ao handler
**Tasks:** H.4, H.6.
**Problema.** H.4 cria `bi-pool.ts` com `getBiPool()`. H.6 reescreve
`bi-consulta-avancada.ts` e diz "obtém o pool via `getBiPool()`". Mas H.6 não
lista `bi-pool.ts` em **Files** nem instrui o `import { getBiPool } from
"./bi-pool.js"`. Menor que C1, mas é ambiguidade: o subagente de H.6 precisa
saber o caminho exato e a forma do import. Idem para `sql-guard.ts` (H.5) → H.6
usa `validarSqlSelect` sem H.6 declarar o import.
**Recomendação.** Em H.6 Step 3, cravar os dois imports literais
(`import { getBiPool } from "./bi-pool.js"`,
`import { validarSqlSelect } from "./sql-guard.js"`).

### P-I4 — `runBuilders` engole exceções; o "teste de rollback" de C.12 não pode observar a falha por ele
**Tasks:** C.2 Step 1, C.12 Step 2.
**Problema.** C.12 Step 2 quer "simular falha de chunk e confirmar rollback
total". Mas `registry.ts::runBuilders` (código real, linhas 36–41) tem
`try/catch` que **engole** a exceção do builder e só faz `console.error`. Se o
E2E de C.12 invocar o builder via `runBuilders`, a falha simulada será
silenciada — o teste não "vê" a exceção, só o efeito no banco. C.2 Step 1 diz
"mock de `$transaction` que repassa o `tx` e deixa a exceção subir" para o
**unitário** — ok para o unitário. Mas C.12 Step 2 (E2E) é ambíguo sobre **como**
injetar a falha num build real e como observá-la. "Injeção em ambiente de
teste" não é um step executável.
**Recomendação.** Em C.12 Step 2, cravar: invocar `rebuildFatoNotaFiscalItem`
**diretamente** (não via `runBuilders`), com um chunk forçado a falhar (ex.:
monkeypatch de `createMany` no n-ésimo chunk, ou um registro que viole a PK), e
capturar a exceção no próprio teste; em paralelo o `SELECT count(*)`. Detalhar
o mecanismo de injeção ou marcar C.12 Step 2 como teste de integração com
arquivo próprio (e então ele deixa de ser "verificação sem arquivo").

### P-I5 — Viabilidade da transação de 211k linhas é afirmada, nunca medida antes de cravar
**Tasks:** C.2, C.12 Step 1.
**Problema.** SPEC §3.2 e o plano afirmam "211k linhas numa transação Postgres é
viável... duração da ordem de segundos". É plausível, mas é uma **aposta não
verificada** num dos 4 pontos que o autor marcou como difíceis. Um único
`$transaction` mantém locks e um snapshot aberto por toda a duração; `createMany`
de 211k via Prisma (que monta `INSERT` multi-row) sob `@prisma/adapter-pg` pode
estourar parâmetros por statement ou consumir memória no driver. C.12 Step 1
diz "medir o tempo e registrar" — mas isso é **depois** de a decisão estar
cravada e o builder implementado. Se a medição revelar 5 min de transação
segurando lock, não há task de contingência.
**Recomendação.** Adicionar à onda C uma task de **spike** antes de C.2:
rodar um `deleteMany` + `createMany` chunked de 211k dentro de `$transaction`
contra o cache real, medir tempo/memória, confirmar que `@prisma/adapter-pg`
não estoura. Se passar, C.2 segue como está. Se falhar, o plano já previu a
saída (build incremental por `odooId`) — mas isso precisa ser uma ramificação
explícita, não uma descoberta em produção.

### P-I6 — `tipoMovimento` no schema é `String?` (nullable), mas o builder nunca produz null
**Tasks:** A.3 (modelo `FatoNotaFiscal`), C.1.
**Problema.** A.3 declara `tipoMovimento String?`. C.1 crava que o builder
deriva sempre `"saida"|"entrada"|"outro"` — **nunca null**. Coluna nullable que
nunca recebe null é inconsistência de modelagem (e abre espaço para queries
defensivas desnecessárias `WHERE tipoMovimento IS NOT NULL`). Menor severidade,
mas é exatamente o tipo de inconsistência de tipo entre tasks que a review deve
pegar.
**Recomendação.** Em A.3, declarar `tipoMovimento String @default("outro")`
(não-nulo). `entradaSaida` permanece `String?` (cru, pode faltar).

### P-I7 — A onda B/C/D/E reordena builder antes das tools, mas A.3 não garante o tipo Prisma gerado para as tools
**Tasks:** A.3, B.5+.
**Problema.** As tools de B–E importam `FatoPedido` etc. do client Prisma
gerado. A.3 Step 2 roda `prisma generate`. Ok. Mas as ondas B–F são despachadas
"após A" — se algum subagente de onda rodar num worktree/checkout onde
`prisma generate` não foi re-executado (o client gerado normalmente está em
`.gitignore`), os tipos `FatoPedido` não existem. O plano não crava "rodar
`prisma generate` no início de cada onda" nem confirma se `src/generated/prisma`
é versionado.
**Recomendação.** Cravar no preâmbulo das ondas B–H: "Step 0 — garantir
`npx prisma generate` executado no checkout atual". Ou confirmar que
`src/generated/prisma` é commitado e A.3 o commita.

### P-I8 — `parceiro` — campo `telefone` mapeado de `raw.phone`, mas há `mobile`; e `email` sem fonte cravada
**Task:** D.1 Step 1.
**Problema.** D.1 lista `email`/`telefone` mas só dá a fonte de `telefone`
(`raw.phone`) entre parênteses, e **não dá fonte de `email`**. O `res.partner`
do Odoo tem `email`, `phone` e `mobile`. "`email`/`telefone` (de `raw.phone`)"
é ambíguo: `email` vem de quê? `telefone` ignora `mobile`? Um subagente vai
adivinhar.
**Recomendação.** Cravar: `email` de `raw.email`; `telefone` de `raw.phone`
(decidir explicitamente se `mobile` entra — ex.: `raw.phone ?? raw.mobile`).
A research §3.2 deve ter isso; o plano deve copiar verbatim.

### P-I9 — `contabil_estrutura_conta` usa `isVazio` custom, mas `withFreshness` "ok" quando `conta` existe e `filhas` vazio — semântica não testada
**Task:** E.7 Step 5.
**Problema.** E.7 crava `isVazio` custom `(d) => d.conta === null`. Correto para
o caso "conta não encontrada". Mas E.7 não menciona o caso `conta` existe e
`filhas` vazias (conta-folha) — aí `isVazio` retorna false → estado `"ok"`,
correto. Não é bug, mas o Step 1 (teste) não cobre os 3 casos
(conta+filhas / conta sem filhas / conta inexistente). Ambiguidade de cobertura.
**Recomendação.** Em E.7 Step 1, cravar os 3 casos de teste.

---

## MENOR

### P-M1 — `ARRAY_KEYS_PRIORITY` não inclui `filhas` — confirmação a favor do plano, mas frágil
`freshness.ts::ARRAY_KEYS_PRIORITY` é `["linhas","titulos","serie","contas",
"top","familia","marca"]`. As tools novas que nomeiam o array `linhas` (a
maioria) funcionam. E.7 acertou ao usar `isVazio` custom porque `filhas` não
está na lista. Mas B.7 já teve de "decidir cravar" usar `linhas`. Vale uma nota
no plano: **toda tool nova cujo array não se chame `linhas` precisa de `isVazio`
custom** — hoje isso está espalhado caso a caso. Recomenda-se uma regra única no
preâmbulo dos padrões.

### P-M2 — Contagem de tasks: o plano se diz "56 tasks"; a verificação não fecha
Ondas: A(5) + B(12) + C(12) + D(8) + E(9) + F(5) + H(8) + V(2) = **61**. O
título e o handoff falam em 56. Discrepância menor, mas indica que o plano foi
editado sem reconciliar a contagem. Corrigir o número.

### P-M3 — `bi-pool.ts` eager no startup do módulo — ordem de import vs. teste
H.4 crava pool "eager na primeira carga do módulo". `bi-pool.test.ts` precisa
manipular `process.env.MCP_BI_DATABASE_URL` **antes** do import do módulo (senão
o eager já leu). H.4 Step 1 menciona `jest.mock("pg")` mas não o
`jest.isolateModules`/re-import necessário para testar os dois caminhos
(env presente vs. ausente) no mesmo arquivo. Cravar a técnica de re-import.

### P-M4 — `.env.example` — `MCP_DATABASE_URL` da onda 1 não é citado
H.2 adiciona `MCP_BI_DATABASE_URL`. O E2E das ondas B–E (ex.: B.12 Step 2) fala
em "configurado com `MCP_DATABASE_URL` do role `nexus_mcp`". Confirmar que essa
env já existe (onda 1) — se o nome real for outro (`DATABASE_URL`?), os steps de
E2E citam uma env inexistente. Verificar contra o `.env.example` real e cravar
o nome correto.

### P-M5 — `users`/`user_domain_access` no role `nexus_mcp_bi` — necessidade não justificada
H.1 dá `GRANT SELECT` em `users`/`user_domain_access`/`sync_state`/
`fato_build_state` ao `nexus_mcp_bi` "conforme a research". Mas o handler do 3c
usa o pool `nexus_mcp_bi` **só** para o SQL do usuário; freshness/RBAC rodam
pela conexão `nexus_mcp` (SPEC §3.7). O SQL do usuário (admin) poderia
legitimamente consultar `users`? Conceder `SELECT` em `users` a um executor de
SQL livre expõe a tabela de usuários a `SELECT *`. Reavaliar: o menor privilégio
sugere **não** conceder `users`/`user_domain_access` ao `nexus_mcp_bi`.

### P-M6 — V.2 self-review duplica o trabalho desta review e não tem critério de saída
V.2 ("self-review de cobertura da SPEC v3") roda **depois** de toda a execução e
"registra lacunas para a próxima iteração do plano (reviews #1/#2)". Mas as
reviews #1/#2 acontecem **antes** da execução (são o ciclo de double-check do
plano). V.2 como está é uma auditoria pós-fato sem ação corretiva definida — se
achar lacuna, o que acontece? Reescopar V.2 como checklist de verificação
factual (cada item da SPEC tem evidência de execução) com critério de
PASS/FAIL, não "registrar para depois".

---

## Achados mais graves (resumo para o autor do plano)

1. **P-C1** — o caminho `invalid_input` do guard de SQL é incompatível com o
   pipeline real (`toOutcome` só mapeia `ZodError`). Falta uma task que
   estenda `mcp/lib/failure.ts`. Sem isso, H.6/H.8 falham.
2. **P-C2** — 9 assertivas literais `14` no `integration.test.ts` que nenhuma
   task de harness trata; cada onda precisa atualizar números exatos
   (19/25/28/30/33) ou o harness deve ser refatorado para uma constante.
3. **P-C4 + P-I1** — discovery (contábil E.1, comercial B.1) acontece **depois**
   do schema (A.3) que ela poderia invalidar; E.2 é uma task condicional/épico.
   Mover toda discovery para antes da onda A.
4. **P-C3 / P-C5** — precondições de banco da A.4 e a sequencialidade B–F
   estão como "recomendação", não como instrução cravada.
5. **P-I5** — a transação de 211k linhas é afirmada viável sem spike prévio;
   é um dos 4 pontos difíceis e não tem contingência executável.

**Contagem: 5 CRÍTICO, 9 IMPORTANTE, 6 MENOR.** O plano precisa de uma v2 que,
no mínimo, feche os 5 CRÍTICO antes de ir para a review #2.
