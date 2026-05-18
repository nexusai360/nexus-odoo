# Review — F4 completo, Ondas E (Contábil) e F (RH/CRM/Produção)

- **Data:** 2026-05-18
- **Branch:** `feat/mcp-dominios-completos`
- **Commits E:** `da1c0e9`, `0d2b443`, `08ffe88`, `82b6820`, `46f634f`, `3bd8ef3`
- **Commits F:** `03d27d9`, `123c05c`, `339bc2e`, `524864c`
- **Escopo:** conformidade com SPEC v3 §3.4 / §3.6 e plano (Onda E/F) + qualidade.

---

## Veredito

**APROVADO COM RESSALVAS.**

Nenhum achado CRÍTICO. Um achado IMPORTANTE (gap de cobertura de teste) e dois
MENORES. Toda a verificação automatizada passa verde. As Ondas E e F estão
conformes à SPEC v3 e ao plano; o único ponto material é a ausência de
cobertura de teste para o predicado `isVazio` custom de `contabil_estrutura_conta`.

### Contagem por severidade

| Severidade  | Qtd |
|-------------|-----|
| CRÍTICO     | 0   |
| IMPORTANTE  | 1   |
| MENOR       | 2   |

---

## Verificação automatizada

| Comando                          | Resultado |
|----------------------------------|-----------|
| `npx tsc --noEmit`               | verde (exit 0) |
| `npx tsc -p mcp/tsconfig.json`   | verde (exit 0) |
| `npx jest`                       | verde — **102 suites, 794 testes** (bate com o esperado ~794) |
| `npx eslint src/ mcp/`           | verde (exit 0) |

---

## Onda E — Contábil

### Conformidade com SPEC v3 §3.4 e plano

| Item da SPEC / plano | Estado | Evidência |
|---|---|---|
| Builder `fato_conta_contabil`, `cycle: incremental` | OK | `registry.ts` L34 — `{ nome: "fato_conta_contabil", cycle: "incremental", run }` |
| Filtro `rawDeleted: false` | OK | `fato-conta-contabil.ts` L50 — `where: { rawDeleted: false }` |
| Build em `$transaction` (`deleteMany` + `createMany` + `markFatoBuilt`) | OK | `fato-conta-contabil.ts` L55–61 |
| Guard `if (mapped.length)` no `createMany` (R2-I2) | OK | L57; teste "não chama createMany quando não há linhas" |
| Mapeamento `raw→fato` conforme discovery O.2 | OK | `mapContaContabilRow` cobre as 11 colunas da tabela §"Mapeamento" do discovery |
| `FATO_FONTE` estendido — `contabil.conta`, `mode: incremental` | OK | `freshness.ts` L47 |
| 2 tools: `contabil_plano_de_contas`, `contabil_estrutura_conta`, domínio `contabil` | OK | `contabil/index.ts`; ambas com `dominio: "contabil"` |
| Schemas Zod (input + output união `preparando`/`ok-vazio`) | OK | `plano-de-contas.ts` L11–42, `estrutura-conta.ts` L11–49 |
| `inputSchemaShape: inputSchema.shape` (R2-I5) | OK | ambas as tools |
| `withFreshness(["fato_conta_contabil"])` | OK | ambas as tools |
| Aviso "sem movimento contábil" fixo | OK | constante `AVISO` em ambas as tools, replicada na descrição e na nota de cabeçalho |
| Catálogo + harness reconhecem 30 tools (E.6) | OK — depois absorvido pela Onda F → 33 |
| Verde sob discovery O.2 (campos reais cravados) | OK | schema `FatoContaContabil` (L1421–1439) bate 1:1 com a tabela do discovery |

**Observação favorável.** O builder usa os helpers `relId`/`relNome`
(`odoo-relational.ts`) para extrair `conta_superior_id`, em vez do
`Array.isArray(...)` literal escrito no discovery O.2 §"Mapeamento". É
**equivalente e mais robusto**: `relNome` exige `typeof v[1] === "string"`,
tratando o caso `[id, false]` do Odoo — o `String(raw.conta_superior_id[1])`
literal do doc produziria a string `"false"`. Melhoria silenciosa correta.

### Achados — Onda E

#### IMPORTANTE — E-1: predicado `isVazio` custom de `contabil_estrutura_conta` sem cobertura de teste

`estrutura-conta.ts` L78 passa a `withFreshness` o predicado custom
`(d) => d.conta === null` — destacado na SPEC como decisão cravada P-M1 e na
task E.5 Step 1 do plano, que promete que o teste cobre os 3 casos com
**"estado `ok`/`vazio`"**. Na prática:

- `contabil.test.ts` testa `queryEstruturaConta` nos 3 casos (a/b/c), mas a
  query **não decide estado** — só devolve `{ conta, filhas }`. O comentário
  "estado ok" no nome do teste (b) é enganoso: nada ali exercita `estado`.
- `freshness.test.ts` **não exercita o parâmetro `isVazio`** em nenhum teste —
  todos os casos usam a lógica padrão `ARRAY_KEYS_PRIORITY`.
- Não há teste da `ToolEntry` `contabilEstruturaConta` nem teste E2E pelo
  `integration.test.ts` que invoque o handler.

Resultado: o caminho que mapeia conta-folha (`conta` populada, `filhas=[]`) →
`estado:"ok"` e conta inexistente (`conta=null`) → `estado:"vazio"` **não tem
nenhuma asserção**. É exatamente o ponto que P-M1 existe para proteger: o array
se chama `filhas`, fora de `ARRAY_KEYS_PRIORITY`, então sem o predicado custom
uma conta-folha cairia em `"ok"` por acaso (sem array reconhecido) — e uma
regressão que removesse o predicado passaria silenciosa.

**Recomendação:** adicionar um teste de `withFreshness` com `isVazio` custom
(2 casos: `conta=null` → `"vazio"`; `conta` populada + `filhas=[]` → `"ok"`),
ou um teste da `ToolEntry`. Baixo custo, fecha o gap deixado pela task E.5.
Não bloqueia o merge.

#### MENOR — E-2: tool de plano de contas sem teste E2E de handler

`contabil_plano_de_contas` e `contabil_estrutura_conta` não têm teste que
invoque o `handler`/`handleToolCall` — só cobertura de catálogo/RBAC na
integração e de núcleo de query. É **consistente com as Ondas B/C/D** (mesmo
padrão), portanto não é regressão da Onda E, mas vale registrar: o
`integration.test.ts` §7 só exercita o pipeline de erro Zod com
`bi_consulta_avancada`. Um smoke E2E por domínio elevaria a confiança. Sem
impacto de conformidade.

---

## Onda F — Domínios sem dado operacional (RH/CRM/Produção)

### Conformidade com SPEC v3 §3.6

| Item da SPEC / plano | Estado | Evidência |
|---|---|---|
| 3 tools `rh_status_dominio`, `crm_status_dominio`, `producao_status_dominio` | OK | `dominios-vazios/index.ts` |
| `sempreVisivel: true` | OK | as 3 tools |
| **Sem** `dominio` (achado I5) | OK | nenhuma das 3 declara `dominio`; teste "não tem dominio definido" |
| Sem fato, sem builder, sem entrada em `FATO_FONTE` | OK | nada acrescentado em `registry.ts` nem `FATO_FONTE` |
| Handler não chama `withFreshness` | OK | handlers retornam objeto literal direto |
| Mensagem honesta estruturada (`operado:false`, `registros:0`) | OK | output `{ dominio, operado:false, registros:0, mensagem }` |
| `outcome=ok` | OK | implícito — `server.ts` L81 seta `outcome="ok"` quando o handler não lança; testes nomeiam "outcome implícito ok" |
| Harness reconhece 33 tools | OK | `integration.test.ts` L147/158 — `toHaveLength(33)`; `harness.ts` cabeçalho "33 tools" |
| Visíveis a todos os perfis | OK | testes: viewer sem domínio, manager sem domínio, viewer-comercial — todos veem as 3 |

### Achados — Onda F

#### MENOR — F-1: mensagens/schemas das 3 tools idênticos por cópia

`rh`, `crm` e `producao` `*-status-dominio.ts` são triplicações quase
literais (mesma estrutura de schema, mesma frase com o nome do domínio
trocado). Não é defeito de conformidade — a SPEC §3.6 pede "uma tool honesta"
por domínio e o padrão das outras ondas é um arquivo por tool. Mas uma
factory `makeStatusDominioTool(dominio, label)` removeria ~70 linhas
duplicadas e garantiria que uma futura mudança de copy/contrato não fique
dessincronizada entre os três. Melhoria opcional; sem ação obrigatória.

**Sem achados IMPORTANTES ou CRÍTICOS na Onda F.** A Onda F está integralmente
conforme à SPEC §3.6 e ao plano, com boa cobertura de teste (unitário por tool
+ visibilidade por perfil na integração).

---

## Achados graves

Nenhum. Não há achado CRÍTICO. O único achado material é **E-1**
(IMPORTANTE) — gap de cobertura do predicado `isVazio` custom de
`contabil_estrutura_conta`, sem risco em runtime mas sem rede de proteção
contra regressão.

---

## Conclusão

As Ondas E e F entregam o que a SPEC v3 §3.4 e §3.6 e o plano especificam,
com toda a verificação automatizada verde (794 testes). **APROVADO COM
RESSALVAS** — recomenda-se fechar o gap E-1 com um teste do predicado custom
antes do fechamento do F4 completo; E-2 e F-1 são melhorias opcionais que não
bloqueiam.
