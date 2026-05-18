# Review adversarial #2 — SPEC v2 "F4 completo"

> Alvo: `docs/superpowers/specs/2026-05-18-f4-completo-design.md` (v2).
> A última review antes do plano. Mais profunda que a #1: conferência
> linha-a-linha dos 18 achados da Review #1 contra a v2 + auditoria do código
> real (`mcp/lib/freshness.ts`, `mcp/lib/audit.ts`, `mcp/catalog/types.ts`,
> `prisma/schema.prisma`, `src/worker/fatos/registry.ts`,
> `src/worker/fatos/fato-financeiro-titulo.ts`, `src/worker/catalog/model-catalog.ts`,
> `prisma/sql/2026-05-17-mcp-role.sql`).
> Review adversarial — não carimbo. **8 achados novos: 3 CRÍTICO, 4 IMPORTANTE,
> 1 MENOR.** Os 18 da #1: 16 resolvidos de fato, 2 resolvidos só na aparência.

---

## Parte 1 — Status dos 18 achados da Review #1

| # | Sev. | Status na v2 | Veredito |
|---|---|---|---|
| C1 | CRÍTICO | **Resolvido** | §3.7/§3.8 declaram a mudança de contrato (`{pergunta}`→`{sql}`, output tabular) e listam arquivo/teste/harness reescritos. Genuíno. |
| C2 | CRÍTICO | **Resolvido** | §3.8 abre subseção explícita "Reversão das decisões §5.5/§5.7", justifica e cria task de atualizar `CLAUDE.md` + research. Genuíno. |
| C3 | CRÍTICO | **Resolvido com ressalva** | Hierarquia corrigida (role = controle primário; sem blacklist; AST como defesa-em-profundidade). Mas a bifurcação "se AST não viável, confiar só no role" continua não-determinística — ver **achado novo N1**. A correção em si é boa; a ressalva é de fechamento. |
| C4 | CRÍTICO | **Resolvido** | §4 crava `nexus_mcp_bi` com `SELECT` só em `fato_*` (12 fatos), nunca `raw_*`; alinha à research. Genuíno. |
| C5 | CRÍTICO | **Resolvido** | §3.7 especifica `pg.Pool` dedicado em módulo próprio (`bi-pool.ts`), `MCP_BI_DATABASE_URL`, `pg` cru, nunca no `ToolHandlerCtx`. Genuíno. |
| C6 | CRÍTICO | **Resolvido** | `outcome="ok"`, SQL em `params`, `meta` corrigido, audit gravado pela conexão `nexus_mcp`. Confere com `mcp/lib/audit.ts` (`AuditOutcome = ok\|denied\|error\|invalid_input`). Genuíno. |
| C7 | CRÍTICO | **Resolvido** | 5 valores novos (não 7); migration de enum isolada, sem uso na mesma transação. Genuíno. |
| I1 | IMPORTANTE | **Resolvido** | §3 cabeçalho crava os 6 builders `incremental`, com linhas do `model-catalog.ts`. Verificado contra o catálogo real — correto. |
| I2 | IMPORTANTE | **Resolvido** | §3.1 crava lookup direto em `raw_pedido_etapa` (sem fato); §7 + onda B incluem o risco do nome real da flag. Genuíno. |
| I3 | IMPORTANTE | **Resolvido só na aparência** | A condicional ">60s" foi removida e o rebuild full foi "cravado", mas a v2 **não trata a janela de inconsistência** que o próprio rebuild full chunked sem transação cria — ver **achado novo N2**. O achado #1 pedia decidir; a v2 decidiu *e introduziu um problema novo não endereçado*. |
| I4 | IMPORTANTE | **Resolvido** | §3.2 crava fatiamento manual em chunks de 5.000, sem transação única, `markFatoBuilt` ao final. Genuíno como decisão — a consequência é o N2. |
| I5 | IMPORTANTE | **Resolvido** | §3.6 crava as 3 tools `sempreVisivel:true` sem `dominio`. Confere com `mcp/catalog/types.ts` (campo `sempreVisivel` + `dominio?`). Genuíno. |
| I6 | IMPORTANTE | **Resolvido** | §4 + onda A cravam `GRANT SELECT` dos 6 fatos novos ao `nexus_mcp`; E2E sob role `nexus_mcp`. Genuíno. |
| I7 | IMPORTANTE | **Resolvido** | §3.2 crava `tipoMovimento` default `"outro"` + log; `entradaSaida` `String` cru. Genuíno. |
| I8 | IMPORTANTE | **Resolvido** | §5 corrige a dependência da onda F (infra de container/env) e atribui extensão do harness a cada onda B–F. Genuíno. |
| M1 | MENOR | **Resolvido com erro de conta** | §2.4 declara o total — mas a aritmética está errada — ver **achado novo N6**. |
| M2 | MENOR | **Resolvido** | §3.4 reconhece a lacuna de pesquisa de contábil; onda D abre com discovery de `raw_contabil_conta`. Genuíno. |
| M3 | MENOR | **Resolvido** | §2.2 adiciona a nota de reconciliação mapa-dominios×research. Genuíno. |

**Agregado:** 16/18 resolvidos de fato; **I3 e M1 resolvidos só na aparência**
(I3 fechou a condicional mas abriu o N2; M1 declarou o total mas com soma
errada — N6). Nenhuma correção da #1 introduziu regressão *além* da janela de
inconsistência do I3/I4 (N2).

---

## Parte 2 — Achados novos

## CRÍTICO

### N1 — A bifurcação do guarda-corpo 2 ("se AST não viável, confiar só no role") deixa a spec sem decisão determinística — o plano herda um if irresolvido

**Seção:** §3.7 item 2.
A v2 corrigiu C3 quanto à hierarquia (role = controle primário), mas o item 2
termina com: *"se a dependência de parse não for viável, a alternativa aceita é
confiar inteiramente no controle primário (role + sessão) — nunca a blacklist
textual"*. Isso é **a mesma classe de defeito que o I3 da Review #1 condenava**:
uma decisão adiada disfarçada de decisão. Uma spec que vai para o plano não pode
dizer "ou faz parse de AST, ou não faz" — são dois desenhos diferentes:

- **Com AST** (`libpg_query`/`pg-query-parser`): nova dependência npm no
  `package.json` do `mcp`, no build do container, novo ponto de teste unitário
  (a v2 §6 já lista "verificação estrutural da SQL" como teste — esse teste
  *pressupõe* que a AST existe; se a alternativa "sem parse" for escolhida, o
  teste do §6 vira impossível e some).
- **Sem AST**: o §6 ("verificação estrutural… aceita `SELECT`/`WITH…SELECT`,
  rejeita multi-statement e não-`SELECT`") fica **sem implementação possível** —
  não dá para rejeitar multi-statement de forma robusta sem parse (split por
  `;` é furável por `;` dentro de string literal/comentário).

A spec **se contradiz**: o §6 exige o teste da verificação estrutural como
entrega obrigatória, mas o §3.7 diz que a verificação estrutural pode não
existir. O plano não pode ser escrito sobre isso — uma task "implementar
verificação estrutural" não tem escopo definido.

**Recomendação:** a v3 **decide agora**, sem bifurcação. Recomendo cravar
**parse de AST com `libpg_query` (via `pgsql-parser`/`pg-query-emscripten`)** —
é dependência madura, roda em Node, e é a única forma de cumprir o §6 como
escrito. Se por algum motivo a equipe rejeitar a dependência, então o §6 tem de
ser reescrito para remover o teste de verificação estrutural e a spec deve
declarar que o controle é exclusivamente role+sessão (e o item 2 inteiro sai).
Não pode ir para o plano com o "ou/ou".

### N2 — `FatoNotaFiscalItem`: a v2 reconhece a janela de inconsistência no enunciado da review mas **não a trata na spec** — `deleteMany`→chunks→`markFatoBuilt` deixa leitores vendo um fato parcial

**Seção:** §3.2, §7.
Este era um dos 3 pontos que o autor deixou para esta review, e a resposta é:
**a v2 não resolve.** O §3.2 diz: *"até `markFatoBuilt` rodar, o fato é
considerado 'em reconstrução'"*. Isso está **factualmente errado** contra o
código real. Olhando `mcp/lib/freshness.ts`:

```
estadoPreparando / withFreshness:
  builds = fatoBuildState.findMany({ where: { fato: { in: fatos } } })
  if (fatos.some(f => !built.has(f))) return { estado: "preparando" }
```

O estado `"preparando"` só dispara quando o fato **nunca teve** `FatoBuildState`
— ou seja, **só no primeiríssimo build**. Em todo rebuild subsequente o registro
`FatoBuildState` **já existe** (de builds anteriores). Durante o rebuild full
chunked do segundo ciclo em diante:

1. `deleteMany({})` apaga as 211k linhas — o fato fica **vazio**;
2. os chunks de 5.000 inserem aos poucos — o fato fica **parcial** por vários
   segundos;
3. `markFatoBuilt` roda no fim.

Durante (1)–(2), uma tool fiscal que consulte `FatoNotaFiscalItem` cai no ramo
`"ok"` do `withFreshness` (o `FatoBuildState` existe, então **não** é
"preparando") e devolve **dados parciais ou zero** ao gestor, como se fosse a
verdade. `fiscal_produtos_faturados` retornaria "0 produtos faturados" no meio
de um sync. Não há transação isolando isso — a decisão I4 ("sem transação
única") é justamente o que abre a janela.

A afirmação da v2 de que "`markFatoBuilt` é o ponto de consistência" é falsa: o
`withFreshness` **não usa `markFatoBuilt` como gate de consistência** — usa só a
*existência* do registro, não sua atualidade. Compare com `fato-financeiro-titulo.ts`,
que faz `deleteMany`+`createMany`+`markFatoBuilt` **dentro de `$transaction`** —
lá não há janela porque a transação isola. O `FatoNotaFiscalItem` quebra
exatamente esse padrão e a spec não compensa.

**Recomendação:** a v3 precisa de uma estratégia de consistência real para um
fato grande sem transação única. Opções defensáveis, escolher uma e cravá-la:
(a) **build incremental por `odooId`** (upsert + delete dos `rawDeleted`) — sem
`deleteMany` global, sem janela; é o que o I3 da Review #1 originalmente
recomendava e a fonte já é `incremental`; (b) **tabela-sombra + swap atômico**:
construir em `fato_nota_fiscal_item_novo`, `ALTER TABLE ... RENAME` numa
transação curta; (c) materializar um flag de "em reconstrução" e `withFreshness`
passar a checá-lo — exige tocar `freshness.ts` e o contrato `FreshnessEnvelope`,
mudança estrutural não trivial. A opção (a) é a mais simples e elimina o
problema na raiz; "rebuild full chunked sem transação" como está é um defeito.

### N3 — Os 6 fatos novos não entram no mapa `FATO_FONTE` de `mcp/lib/freshness.ts` — toda tool nova devolve `fonteStatus` mudo e a v2 não vê isso

**Seção:** §2.3, §3 (todos os domínios), §6.
A v2 afirma no §2.3: *"Reusa integralmente a arquitetura da F4 onda 1: …
`withFreshness` …"*. Mas `withFreshness` **não funciona** para um fato que não
esteja no `FATO_FONTE` (`mcp/lib/freshness.ts`):

```
export const FATO_FONTE: Record<string, {model, mode}> = {
  fato_estoque_saldo: ..., fato_financeiro_titulo: ..., // só os 6 da onda 1
}
```

`withFreshness` percorre `fatos` e, para cada um, faz `FATO_FONTE[fatoNome]`; se
`undefined`, o `continue` pula a fonte. Consequência para os 6 fatos novos: o
envelope ainda devolve `estado` e `atualizadoEm` (o `FatoBuildState` cobre
isso), **mas `fonteStatus` sai sempre `{ status: "ok", ultimaSyncEm: null }`** —
o "atualizado há Xs" relativo à sync do Odoo fica mudo/incorreto. A decisão
canônica `CLAUDE.md §5.2` ("toda tool retorna o timestamp da última sync") fica
violada para 19 das 33 tools.

A v2 não menciona estender `FATO_FONTE` em nenhuma onda. É o gêmeo exato do
achado I6 (GRANT esquecido) — uma omissão de arquivo compartilhado que os testes
unitários não pegam e que degrada silenciosamente a entrega. Pior: exige cravar
o `model` do `SyncState` e o `mode` de cada fonte (ex.: `pedido.documento` →
qual string de `model` o `SyncState` usa? `sped.documento.item` → idem) — não é
trivial, é uma micro-descoberta por fato.

**Recomendação:** a v3 adiciona, explicitamente em cada onda B–E (junto do
builder), a task "estender `FATO_FONTE` em `mcp/lib/freshness.ts` com a entrada
do(s) fato(s) novo(s), `model` confirmado contra `SyncState`/`MODEL_CATALOG` e
`mode: incremental`". Sem isso, `fonteStatus` mente.

---

## IMPORTANTE

### N4 — `markFatoBuilt` exige um cliente com `$transaction` ou o `PrismaClient`; o `FatoNotaFiscalItem` "sem transação" precisa chamar `markFatoBuilt(prisma, …)` — a spec não diz, e o tipo `FatoBuildStateClient` aceita, mas o padrão de todos os builders existentes é dentro de `tx`

**Seção:** §3.2.
`fato-build-state.ts` define `FatoBuildStateClient = Pick<PrismaClient, "fatoBuildState">` —
aceita tanto `prisma` quanto `tx`. Os 6 builders da onda 1 chamam `markFatoBuilt`
**dentro** da transação. O `FatoNotaFiscalItem`, decidido "sem transação única",
terá de chamar `markFatoBuilt(prisma, "fato_nota_fiscal_item")` com o cliente
não-transacional, **após** o último chunk. Funciona — mas a spec não explicita
isso e um executor que copie o padrão `fato-financeiro-titulo.ts` por reflexo
vai tentar envolver em `$transaction` (reintroduzindo a transação gigante que o
I4 baniu) ou deixar `markFatoBuilt` órfão. Também: se um chunk falhar no meio, o
builder atual da onda 1 propaga a exceção e `runBuilders` (`registry.ts`) só
loga; com o rebuild não-transacional, **uma falha no chunk 30/43 deixa o fato
permanentemente parcial** e — pior, combinando com N2 — sem nenhum sinal, porque
o `FatoBuildState` da rodada anterior continua lá. A spec não trata recuperação
de falha parcial.

**Recomendação:** a v3 §3.2 crava: (a) `markFatoBuilt` é chamado com o cliente
não-transacional, após o último chunk, e isso é dito explicitamente para o
plano; (b) o comportamento sob falha de chunk — recomendo **não** chamar
`markFatoBuilt` se algum chunk falhar (o fato fica "não atualizado", mas isso
exige a estratégia de consistência do N2 para ser visível) e **não** fazer o
`deleteMany` antes de ter os dados prontos (reforça a opção tabela-sombra do N2).

### N5 — Onda D empacota discovery + 2 builders + 5 tools de **dois domínios** numa onda só — é um épico, viola a decomposição máxima do `CLAUDE.md §6`

**Seção:** §5, tabela de ondas.
A onda D entrega, numa linha: "Discovery real de `raw_contabil_conta`;
Cadastros — 1 builder + 3 tools; Contábil — 1 builder + 2 tools; estende o
harness". São **dois domínios independentes** (cadastros e contábil), 2
builders, 5 tools, 1 discovery, e a discovery do contábil **bloqueia** o builder
contábil mas não o de cadastros. As ondas B e C entregam **um** domínio cada (2
builders + 5–6 tools). A onda D entrega o dobro de superfície conceitual que B
ou C. Isso é desbalanceamento — e o `CLAUDE.md §6` ("decomposição máxima… se uma
task descreve [vários itens] juntos, ela é um épico — quebrar") condena
empacotar dois domínios. Cadastros e contábil não têm dependência entre si;
mantê-los na mesma onda só serializa trabalho que poderia ser paralelo e mistura
a discovery contábil (incerteza alta) com cadastros (incerteza zero).

**Recomendação:** a v3 separa em **onda D — Cadastros** (1 builder + 3 tools) e
**onda E — Contábil** (discovery de `raw_contabil_conta` + 1 builder + 2 tools),
renomeando RH/CRM/Produção para onda F e o 3c para onda G. Ou, no mínimo,
declara explicitamente que a onda D tem duas frentes paralelas independentes e o
plano as decompõe como tal. A decisão atual junta o domínio de menor risco com o
de maior risco numa caixa só.

### N6 — A aritmética de tools do §2.4 está errada: 14 da onda 1 ≠ 6+6+1+1

**Seção:** §2.4.
O §2.4 afirma: *"A onda 1 entregou 14 tools (estoque 6 + financeiro 6 +
`registrar_lacuna` 1 + `bi_consulta_avancada` stub 1)"*. 6+6+1+1 = 14 — a soma
fecha. Mas a research da onda 1 e o `mapa-dominios` indicam estoque com tools de
saldo/movimento/parado/concentração/top/entradas-saídas e financeiro com
saldo-contas/fluxo-caixa/caixa-periodo/contas-a-receber/contas-a-pagar/titulos-vencidos.
Conferindo `mcp/tools/`: financeiro tem 6 arquivos de tool (`contas-a-receber`,
`caixa-periodo`, `saldo-contas`, `contas-a-pagar`, `titulos-vencidos`,
`fluxo-caixa`) — ok. Estoque: a Review #1 §M1 dizia "onda 1 entregou 6+6+2 = 14"
— **contando 2 tools de Caminho 3**, não 1+1 separados. A v2 reescreveu para
"6+6+1+1" o que é a mesma soma, então o total 14 está certo por coincidência
aritmética. **O erro real está no destino:** §2.4 diz "Total do catálogo
pós-F4-completo: 33 tools (14 + 19)". 14+19 = 33 — ok. Mas o §2.4 também diz
"adiciona 19 tools e reescreve 1" e a tabela soma "Comercial 5 + Fiscal 6 +
Cadastros 3 + Contábil 2 + RH/CRM/Produção 3 = 19" — **isso fecha**. Então a
conta de 33 está aritmeticamente correta.

O problema é outro e mais sutil: o §2.4 é a **única** fonte do número 33 e a §6
manda o harness verificar "contagem total = 33". Mas a v2 não fixa em lugar
nenhum **a lista nominal das 33 tools** — só contagens por domínio. Um harness
que conta 33 mas tem uma tool duplicada e uma faltando passa verde. A Review #1
M1 pediu "declarar o total"; a v2 declarou o número mas **não a lista
verificável**.

**Recomendação:** rebaixo este ponto para o que ele é — não há erro de soma
(retiro a alegação de erro aritmético). O achado válido e remanescente: a v3
deve anexar a **lista nominal das 33 tools** (ids) como apêndice, e o harness
verifica a lista, não só `length === 33`. Severidade **MENOR**, não importante —
ver reclassificação no resumo.

### N7 — `ToolHandlerCtx` não tem como o handler do 3c alcançar o `bi-pool`; a v2 diz "módulo próprio" mas o handler recebe só `{prisma, user}` — falta dizer como o pool é importado e seu ciclo de vida no processo

**Seção:** §3.7.
`mcp/catalog/types.ts`: `ToolHandlerCtx = { prisma: PrismaClient; user: UserContext }` —
e o comentário do arquivo diz explicitamente *"sempreVisivel? nasce aqui na onda
4a — nenhuma onda posterior reabre este arquivo"*. A v2 §3.7 resolve C5 dizendo
que o `pg.Pool` fica num "módulo próprio (`bi-pool.ts`)" usado "somente pelo
handler do 3c". Correto conceitualmente, mas falta o **como**: o handler do 3c é
uma função `handler(input, ctx)` — para usar o pool ele faz `import { biPool }
from "../bi-pool.js"` (singleton de módulo). A v2 não diz isso, e há duas
decisões de ciclo de vida não cravadas: (a) o pool é criado na carga do módulo
(eager, abre conexão no boot do MCP mesmo sem nenhuma chamada 3c) ou lazy (na
1ª chamada)? (b) `MCP_BI_DATABASE_URL` ausente no ambiente — o módulo `bi-pool`
falha no import (derruba o MCP inteiro no boot) ou degrada (a tool 3c responde
"BI indisponível")? Como o 3c é gated a admin e opcional, derrubar o boot do MCP
por falta de uma env de feature secundária seria um defeito. A v2 não decide.

**Recomendação:** v3 §3.7 crava: (a) `bi-pool.ts` exporta o pool **lazy** (criado
na 1ª invocação do handler 3c), (b) `MCP_BI_DATABASE_URL` ausente → `bi_consulta_avancada`
responde erro estruturado "modo BI não configurado" (`outcome="error"` ou
recusa), **nunca** derruba o boot do MCP; (c) o handler importa o pool do módulo
— `ToolHandlerCtx` permanece intocado (coerente com o comentário do arquivo).

---

## MENOR

### N8 — `FatoNotaFiscalItem` tem `documentoId` como "FK lógica" mas a v2 não declara índice composto nem o impacto de não haver FK real entre dois fatos

**Seção:** §3.2.
A research §2.3 e a v2 §3.2 definem `FatoNotaFiscalItem.documentoId` como "FK
lógica → `FatoNotaFiscal.odooId`". Os fatos não têm relação Prisma (padrão da
onda 1 — desnormalização). `fiscal_produtos_faturados` ("produtos mais saídos em
nota") provavelmente filtra itens por período, e período vive em
`FatoNotaFiscal.dataEmissao`, não no item. Logo a tool ou (a) faz join lógico
item×nota em memória/SQL, ou (b) o builder de `FatoNotaFiscalItem` desnormaliza
`dataEmissao`/`entradaSaida` para dentro do item. A v2 não decide — e com 211k
itens, um join por período sem `dataEmissao` no próprio item é caro. Isso toca o
desenho do fato (colunas) e da tool, e deveria estar cravado antes do plano.

**Recomendação:** v3 §3.2 decide: recomendo o builder de `FatoNotaFiscalItem`
**desnormalizar `dataEmissao` e `entradaSaida`** da nota para dentro do item
(o builder já lê ambos os `raw`; é um `Map` `documentoId→{dataEmissao,entradaSaida}`
análogo ao lookup de etapa do `FatoPedido`), e o índice do item passa a incluir
`dataEmissao`. Sem isso, `fiscal_produtos_faturados` filtra por período via join
caro contra 211k linhas.

---

## Resumo

| Severidade | Qtd (novos) |
|---|---|
| CRÍTICO | 3 (N1, N2, N3) |
| IMPORTANTE | 3 (N4, N5, N7) |
| MENOR | 2 (N6, N8) |
| **Total novos** | **8** |

**Status dos 18 da Review #1:** 16 resolvidos de fato; **2 resolvidos só na
aparência** — I3 (fechou a condicional ">60s" mas abriu a janela de
inconsistência do rebuild chunked, que a v2 não trata → N2) e M1 (declarou o
total 33 mas não a lista nominal verificável → N6). Nenhuma das correções da #1
introduziu regressão fora dessa janela.

**Achados novos mais graves:**

- **N2 (CRÍTICO)** — o ponto que o autor da v2 deixou para esta review **não
  foi resolvido**: `deleteMany`→chunks→`markFatoBuilt` sem transação cria uma
  janela de vários segundos em que `FatoNotaFiscalItem` está vazio/parcial e,
  contra o código real de `mcp/lib/freshness.ts`, **leitores concorrentes veem
  o estado parcial como `"ok"`** — `withFreshness` só sinaliza "preparando" no
  primeiro build de todos, não em rebuilds. A afirmação "`markFatoBuilt` é o
  ponto de consistência" é falsa. Solução na raiz: build incremental por `odooId`
  ou tabela-sombra com swap atômico.

- **N3 (CRÍTICO)** — os 6 fatos novos não entram no `FATO_FONTE` de
  `mcp/lib/freshness.ts`; sem isso, `fonteStatus` ("atualizado há Xs") sai mudo
  para 19 das 33 tools, violando a decisão canônica `CLAUDE.md §5.2`. Omissão de
  arquivo compartilhado, gêmea do I6 — invisível aos testes unitários.

- **N1 (CRÍTICO)** — a verificação de SQL do 3c continua com bifurcação "AST ou,
  se inviável, só o role"; o §6 exige o teste de verificação estrutural como
  entrega obrigatória, que só existe com AST. A spec se contradiz e o plano não
  pode ser escrito sobre um "ou/ou". A v3 tem de cravar AST (`libpg_query`).

**Veredito:** a v2 fez um trabalho real sobre a Review #1 — 16/18 genuínos,
incluindo todo o eixo do 3c (C1–C7). Mas os 3 pontos que o autor explicitamente
deixou em aberto **não foram fechados de forma determinística**: (1) o
`outputSchema` do 3c continua só esboçado [aceitável para o plano, é detalhe de
implementação — não vira achado]; (2) a bifurcação do parse de SQL **não é
aceitável** e tem de ser resolvida na spec (N1); (3) a janela de inconsistência
do `FatoNotaFiscalItem` **não foi tratada** e é o defeito mais grave da v2 (N2).
A v3 precisa fechar N1/N2/N3 antes de ir ao plano; N4–N5–N7 são correções de
decomposição e ciclo de vida que o plano também herdaria como ambiguidade.
```
