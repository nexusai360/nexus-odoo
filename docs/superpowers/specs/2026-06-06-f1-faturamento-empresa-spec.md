# SPEC v3 (consolidada apos 2 reviews): Fase 1 do Nex, Faturamento + Corte por Empresa

**Data:** 2026-06-06
**Fase:** F1 da reconstrucao do Nex (roadmap do dossie MASTER, secao 6, "Fase 1, Metricas Canonicas")
**Autor:** Arquiteto (consolidacao v3, apos SPEC v1 + 2 reviews adversariais)
**Stack:** TypeScript, reuso de tools/fatos/MCP existentes. NAO reescrever em Python (decisao travada).
**Fonte da verdade:** `docs/superpowers/research/2026-06-06-dossie-MASTER.md` + dossies fiscal, financeiro, transversal, todos confrontados contra `prisma/schema.prisma` e o codigo real da branch `feat-nex-reconstrucao`.
**Status:** v3, versao final que vai para o plano.

> Esta fase ataca a dor numero 1 do dono (gap tier-1 #1 do MASTER): hoje toda metrica
> de faturamento devolve o TOTAL GLOBAL do grupo, sem separar filial. A Matrix tem
> ~20 empresas. A F1 formaliza o faturamento como camada de metricas canonicas em
> codigo deterministico e adiciona o corte por empresa, de ponta a ponta (query,
> tool, aviso de grupo).

> **Mudancas materiais da v3 sobre a v1 (vindas das reviews):**
> 1. **Definicao de "faturamento" agora exclui naturezas de NAO-venda** (devolucao, transferencia entre filiais). A v1 contava devolucao como receita. Corrigido em 4.0 e propagado a todas as metricas.
> 2. **`FATURAMENTO_POR_EMPRESA` agrupa SO por `empresaId`** (nome resolvido em segundo passo). A v1 agrupava por `(empresaId, empresaNome)`, o que inflaria a contagem de empresas quando o nome desnormalizado divergisse.
> 3. **Mecanismo de agrupamento decidido: agregacao em memoria** (padrao `cadastros.ts`), nunca `prisma.groupBy` com chave nula. O proprio codigo ja provou que `groupBy` com `null` nao e confiavel no driver `@prisma/adapter-pg`.
> 4. **`FATURAMENTO_NAO_AUTORIZADO` virou metrica nomeada propria** com `groupBy(situacaoNfe)`, nao mais residuo de subtracao.
> 5. **Elo emitido vs recebido reescrito sobre o schema REAL.** A v1 dizia "nao existe campo de ligacao"; falso parcialmente. Ver 4.9: existem `FatoPedidoParcela.finanLancamentoId`, `FatoPedidoParcela.parcelaFaturada`, `FatoFinanceiroLancamentoItem.pedidoId`. O unico elo que falta de fato e `nota -> pedido`.
> 6. **Contrato de entrada da tool fechado:** a tool aceita `empresaRef: string` (texto livre: id, CNPJ ou nome) e o handler resolve. O `empresaId` numerico cru deixou de ser a unica porta.
> 7. **Borda de periodo agora e exclusiva** (`lt: ate+1dia`), eliminando o bug latente do `lte 00:00:00Z`.
> 8. **CFOP-por-empresa: `empresaId` sera desnormalizado em `fato_nota_fiscal_item` ja na F1** (mesmo padrao de `dataEmissao`/`entradaSaida` no mesmo modelo), matando os 4 subproblemas do `documentoId IN (...)`.
> 9. **As 3 tools `$queryRawUnsafe` (por-marca, por-uf, mensal-serie) tratadas explicitamente:** marca/uf usam `vrProdutos`, declarado no envelope; criterio de fechamento de CFOP/operacao trocado de "bate exato" para "bate dentro de tolerancia de rateio".
> 10. **RBAC explicitado:** toda tool nova declara `dominio: "fiscal"`; o comparativo de empresas ganha `gatedRoles: ['admin','super_admin']`.

---

## 1. OBJETIVO E CRITERIO DE SUCESSO

### 1.1 Objetivo

Formalizar o **faturamento fiscal** como uma camada de **metricas canonicas em codigo**
(`src/lib/metrics/fiscal/`), cada metrica com regra exata de fonte, filtro, data de
referencia, valor e exclusoes embutida no codigo (nao no prompt do LLM), e ligar essas
metricas a tools MCP que aceitam um **corte por empresa** opcional. Entrega:

1. Modulos de metrica para as dez metricas de faturamento desta fase (secao 4).
2. Corte por empresa opcional em todas as queries e tools de faturamento (secao 5), via
   `empresaRef` textual resolvido para `empresaId`.
3. Tools MCP novas para os gaps `por_empresa` (que JA e o comparativo de filiais),
   `por_operacao` (natureza), `por_cfop`, `nao_autorizado` e `recebido`; refactor das
   tools existentes para passar a consumir os modulos canonicos e aceitar o filtro de
   empresa.
4. Aviso explicito de escopo: quando nenhuma empresa e informada, a resposta diz
   "considerei o grupo todo (N empresas com faturamento no periodo)" e reporta quanto do
   total esta sem empresa classificada.
5. Distincao formal entre faturamento EMITIDO (nota) e RECEBIDO de fato (elo
   nota->pedido->titulo financeiro), entregue com o estado real do elo no cache (secao
   4.9): a ponte `pedido->financeiro` ja existe; a ponte `nota->pedido` nao. A F1 entrega
   o que a ponte parcial habilita e marca o resto como gap honesto, nunca numero inventado.

### 1.2 Criterio de sucesso (como sabemos que acertou)

A F1 esta correta quando, contra o cache real:

- **Soma fecha (cabecalho):** para o mesmo recorte (mesmo periodo, mesma empresa,
  `entradaSaida='1'`), vale
  `FATURAMENTO_BRUTO = FATURAMENTO_AUTORIZADO_TOTAL + IMPACTO_CANCELAMENTOS + FATURAMENTO_NAO_AUTORIZADO`,
  onde `FATURAMENTO_AUTORIZADO_TOTAL` e a soma de TODA saida autorizada (venda + devolucao
  + transferencia, ver 4.0). As tres parcelas batem o total exatamente (mesmo `SUM(vrNf)`,
  mesma fonte). `FATURAMENTO_AUTORIZADO` (so venda) e um SUBCONJUNTO de
  `FATURAMENTO_AUTORIZADO_TOTAL`, nao entra nessa equacao de fechamento.
- **Corte por empresa fecha:** `SUM(FATURAMENTO_POR_EMPRESA.valor sobre TODAS as linhas,
  inclusive a linha empresaId=null) == FATURAMENTO_AUTORIZADO do grupo` para o mesmo
  periodo. ATENCAO: isto vale para a metrica `POR_EMPRESA` (4.6, que inclui a linha null),
  NUNCA para a soma de N chamadas de `faturamentoAutorizado(empresaRef=X)`: essas N
  chamadas filtram por `empresaId` e por construcao excluem as notas com `empresaId=null`,
  somando MENOS que o grupo. O E2E testa o fechamento SO contra `POR_EMPRESA` (ver 8.2).
- **Default avisa:** toda resposta de faturamento sem empresa carrega o aviso
  "considerei o grupo todo (N empresas com faturamento no periodo)", mais quanto do valor
  esta em `empresaId=null`; toda resposta com empresa carrega o nome e CNPJ da empresa
  resolvida.
- **Determinismo:** todo numero vem de SUM/COUNT em SQL ou TS, jamais do LLM.
- **Freshness:** toda resposta carrega `atualizadoEm` + `atualizadoHa` (via `withFreshness`
  sobre `fato_nota_fiscal` / `fato_nota_fiscal_item`).
- **Identidade de empresa comprovada:** `SELECT DISTINCT empresa_id FROM fato_nota_fiscal`
  (nao nulos) e subconjunto de `SELECT odoo_id FROM dim_empresa_grupo`. Confirmado pelo
  dossie transversal (linha 17: ambos mapeiam o `id` de `res.company`); o E2E valida no dado.
- **Politica de resultados:** "por empresa" (~20) lista todas; ranking de operacoes/CFOP
  trava em N explicito; listas acima de 50 paginam 50/50 com KPIs sobre o conjunto inteiro.
- **Sem regressao:** as tools fiscais ja [OK] continuam respondendo identico quando
  chamadas sem empresa.
- **Teste E2E verde:** subir o cache real, popular os fatos, exercer cada metrica e
  conferir os numeros (secao 8).

---

## 2. NAO-OBJETIVOS

Fora do escopo da F1, ficam para fases seguintes do roadmap (MASTER secao 6):

- **Saude da empresa / score verde-amarelo-vermelho.** Thresholds nao documentados pelo
  dono (MASTER 3.8 #3). Nao entra.
- **Previsao / projecao de fechamento de caixa.** Regras de threshold ausentes. Nao entra.
- **RH, CRM, Producao.** Dominios vazios no Odoo. Nao entram.
- **Cerebro de orquestracao** (tool retrieval, verificador, classificacao de intencao):
  Fase 3. A F1 entrega metricas e tools corretas; a escolha da tool certa pela pergunta
  nao e desta fase. **A resolucao texto->empresa da F1 (5.2) e local e simples** (id/CNPJ/
  nome exato/contains), nao e o resolvedor generico do cerebro.
- **Resolvedor generico de entidades** (fuzzy Levenshtein de parceiro/produto/NF): Fase 2.
  A F1 resolve **apenas a entidade empresa**.
- **Reconciliacao fiscal-financeira nota-a-nota completa.** A F1 entrega o que a ponte
  parcial `pedido->financeiro` ja habilita (4.9), nao a reconciliacao nota individual ->
  titulo individual, que depende da ponte `nota->pedido` ainda inexistente.
- **Reescrita das agregacoes de `faturamento_por_marca` / `por_uf` / `produtos_faturados`.**
  Essas tools tem logica propria (marca/uf via `$queryRawUnsafe`, produtos via memoria) e
  duas delas usam `vrProdutos`, nao `vrNf`. A F1 **so as estende para aceitar empresa** e
  **declara no envelope** que usam valor de produtos sem impostos (ver 4.10 e 9.7). Nao
  realinha a base de valor delas (sairia do escopo "faturamento + empresa").
- **Apuracao de ICMS, filtros de valor minimo, SLA de autorizacao.** Gaps fiscais reais
  (dossie fiscal secao 8) fora do escopo.
- **UI / dashboard.** A F1 e camada de metricas + tools MCP. Nenhuma tela.

---

## 3. CAMADA DE METRICAS CANONICAS

### 3.1 Problema que resolve

Hoje a logica de faturamento vive solta em `src/lib/reports/queries/fiscal.ts`: cada
funcao (`queryFaturamentoPeriodo`, `queryFaturamentoPorCliente`, etc.) reimplementa o
mesmo `where` (`entradaSaida: "1"`, `situacaoNfe: "autorizada"`, janela de
`dataEmissao`). A regra de "o que e faturamento" esta duplicada e nao tem nome unico.
Quando o dono pergunta "faturamento", nao ha definicao canonica de codigo, ha varias
copias da mesma clausula. Pior: nenhuma dessas copias hoje distingue venda de devolucao/
transferencia, entao "faturamento" hoje superestima a receita real. Isso e a raiz das
divergencias de definicao (MASTER secao 6, Fase 1).

### 3.2 Onde os modulos vivem

Novo diretorio: **`src/lib/metrics/fiscal/`** (paralelo a `src/lib/reports/queries/`,
nao dentro dele, porque metrica != query de relatorio). Um arquivo por metrica:

```
src/lib/metrics/
├── _shared/
│   ├── periodo.ts        → buildPeriodoWhere(de, ate) sobre dataEmissao, borda EXCLUSIVA
│   │                        (gte de 00:00:00Z, lt (ate+1dia) 00:00:00Z). Ver 3.5.
│   ├── empresa.ts        → buildEmpresaWhere(empresaId), buildEmpresaSqlFragment(...),
│   │                        resolverEmpresa(...). Ver 5.1/5.2.
│   ├── naturezas.ts      → classificacao venda vs nao-venda (4.0). Ver 3.6.
│   └── types.ts          → FaturamentoInput, FaturamentoResultado, FaturamentoEmpresaLinha,
│                            EmpresaResolucao
├── fiscal/
│   ├── faturamento-autorizado.ts          (so venda, ver 4.1)
│   ├── faturamento-autorizado-total.ts     (toda saida autorizada, ver 4.1b)
│   ├── faturamento-bruto.ts
│   ├── faturamento-nao-autorizado.ts       (metrica nomeada, ver 4.3b)
│   ├── impacto-cancelamentos.ts
│   ├── faturamento-saida.ts
│   ├── faturamento-entrada.ts
│   ├── faturamento-por-empresa.ts
│   ├── faturamento-por-operacao.ts         (natureza_operacao)
│   ├── faturamento-por-cfop.ts             (sobre fato_nota_fiscal_item)
│   └── faturamento-recebido.ts             (elo, ver 4.9)
└── index.ts              → re-exporta os modulos
```

Decisao de design: a camada de metricas **nao** substitui
`src/lib/reports/queries/fiscal.ts` num passo unico. As metricas novas vivem em
`metrics/`; as queries existentes que ja servem o dashboard F3 permanecem e passam a
**delegar** para os modulos de metrica. **Criterio de pronto do refactor (3.7) impede que
o refactor pare no meio e crie duas fontes de verdade.**

### 3.3 Padrao de um modulo de metrica

Cada modulo exporta UMA funcao pura assincrona, framework-neutra (recebe `prisma` +
input tipado, devolve resultado cru sem envelope/freshness, igual ao padrao ja usado em
`fiscal.ts`). Estrutura obrigatoria, na ordem:

```ts
// src/lib/metrics/fiscal/faturamento-autorizado.ts
import type { PrismaClient } from "@/generated/prisma/client";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { NATUREZAS_NAO_VENDA_WHERE } from "../_shared/naturezas";
import type { FaturamentoInput } from "../_shared/types";

// REGRA CANONICA (documentada no proprio arquivo, fonte da verdade):
//  fonte:     fato_nota_fiscal (cabecalho)
//  filtro:    entradaSaida = "1" (saida) AND situacaoNfe = "autorizada"
//             AND natureza NAO classificada como devolucao/transferencia (4.0)
//  data ref:  dataEmissao (fato gerador), nunca dataAutorizacao
//  valor:     SUM(vrNf) (com impostos), nunca vrProdutos nem vrFatura
//  exclui:    canceladas, nao-autorizadas, devolucoes, transferencias intra-grupo
//  empresa:   se input.empresaId presente, AND empresaId = input.empresaId
export async function faturamentoAutorizado(
  prisma: PrismaClient,
  input: FaturamentoInput,           // { periodoDe?, periodoAte?, empresaId? }
): Promise<{ totalNotas: number; valor: number }> {
  const where = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...NATUREZAS_NAO_VENDA_WHERE,     // NOT classificada como nao-venda
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const [agg, totalNotas] = await Promise.all([
    prisma.fatoNotaFiscal.aggregate({ where, _sum: { vrNf: true } }),
    prisma.fatoNotaFiscal.count({ where }),
  ]);
  return { totalNotas, valor: Number(agg._sum.vrNf ?? 0) };
}
```

Regras do padrao (inegociaveis):

1. **Cabecalho de regra canonica** em comentario no topo: fonte, filtro, data de
   referencia, valor, exclusoes, comportamento de empresa. E o contrato escrito.
2. **Input tipado unico** (`FaturamentoInput` em `_shared/types.ts`), com `periodoDe?`,
   `periodoAte?`, `empresaId?` (numero ja resolvido). Listas/rankings recebem ainda
   `limit?`/`offset?`. O texto livre `empresaRef` e resolvido ANTES, no handler (5.2),
   nunca dentro do modulo de metrica.
3. **Calculo deterministico** via `prisma.aggregate` (`_sum`) + `count` quando da para
   agregar no banco; **agregacao em memoria** (`findMany` + `Map`) quando o agrupamento
   e por campo que pode ser nulo (empresaId, naturezaId), seguindo o padrao de
   `cadastros.ts` (ver 3.4). NUNCA usar `prisma.groupBy` com chave que pode ser nula.
4. **Sem captura de excecao, sem envelope, sem freshness** dentro do modulo.
5. **Reuso dos helpers `_shared`**: `buildPeriodoWhere`, `buildEmpresaWhere` e
   `NATUREZAS_NAO_VENDA_WHERE` sao os UNICOS lugares onde periodo, empresa e classificacao
   de natureza sao montados. Elimina as ~8 copias atuais.

### 3.4 Agregacao: decisao definitiva sobre `groupBy` e nulos

O codigo do projeto e inconsistente: `cadastros.ts` (linha 113) evita `prisma.groupBy`
com nulo de proposito ("Prisma nao suporta groupBy com null em todos os drivers") e usa
`findMany` + `Map`; `contabil.ts` usa `groupBy`, mas por `contaId` que nao e nulo. O
driver do projeto e `@prisma/adapter-pg`. **Decisao da F1, sem ambiguidade:**

- Toda metrica que agrupa por campo **que pode ser nulo** (`empresaId` em 4.6,
  `naturezaOperacaoId` em 4.7, `situacaoNfe` em 4.3b) usa **`findMany({ select })` +
  agregacao em `Map`** (padrao `cadastros.ts`), garantindo que a chave `null` vire um
  bucket proprio e entre na soma.
- Para `FATURAMENTO_POR_CFOP` (4.8), que opera sobre `fato_nota_fiscal_item` com volume de
  linhas maior, usa **`prisma.fatoNotaFiscalItem.groupBy({ by: ['cfopId'], _sum, _count })`**
  porque a chave de agrupamento (cfopId) raramente e nula E o volume justifica agregar no
  banco; a eventual linha `cfopId=null` e tratada explicitamente (mostrada como "sem CFOP").
  Se o E2E revelar `cfopId` nulo material, cai no padrao memoria.
- `prisma.aggregate` (`_sum`/`_count`) sem `by` continua para escalares (4.1, 4.1b, 4.2,
  4.3, 4.4, 4.5), onde nao ha agrupamento.

### 3.5 Borda de periodo (decisao revista na v3)

`buildPeriodoWhere(de?, ate?)` retorna `{}` quando ambos ausentes, e
`{ dataEmissao: { gte: <de>T00:00:00Z, lt: <ate + 1 dia>T00:00:00Z } }` quando presentes
(borda **exclusiva** no fim). Isso casa o dia `ate` por inteiro independentemente de a
data ter ou nao hora, eliminando o bug latente do `lte ...T00:00:00Z` que truncava o
ultimo dia se `dataEmissao` viesse com hora != meia-noite. Como `buildPeriodoWhere` nasce
nesta fase, nao ha "compatibilidade" a preservar. O E2E confere que o total com a borda
nova >= o total com a borda antiga (nunca corta o ultimo dia). `de` e `ate` sao strings
`AAAA-MM-DD`; o `+1 dia` e calculado em UTC sobre a data.

### 3.6 Classificacao de natureza (venda vs nao-venda), `_shared/naturezas.ts`

O dossie fiscal (linha 33, 705) confirma que naturezas de saida autorizada incluem
"Venda", "Devolucao" e "Transferencia entre filiais", todas com `entradaSaida='1'` e
`situacaoNfe='autorizada'`. Somar todas como "faturamento" superestima a receita. Ver 4.0.
`_shared/naturezas.ts` define:

- `NATUREZAS_NAO_VENDA_TERMOS = ['devolu', 'transfer', 'retorno', 'remessa', 'bonifica',
  'comodato', 'demonstra']` (lista de termos, minusculo, sem acento), revisada no E2E
  contra `SELECT DISTINCT natureza_operacao_nome FROM fato_nota_fiscal`.
- `NATUREZAS_NAO_VENDA_WHERE`: clausula Prisma que exclui notas cujo `naturezaOperacaoNome`
  (case-insensitive, sem acento) contem qualquer termo da lista. Como Prisma nao tem
  `unaccent` nativo no `where`, a F1 implementa via `naturezaOperacaoNome: { not: { contains
  ..., mode: 'insensitive' } }` encadeado por termo, OU pre-resolve os `naturezaOperacaoId`
  nao-venda uma vez e usa `naturezaOperacaoId: { notIn: [...] }` (mais barato e robusto a
  acento). **Decisao: pre-resolver os ids nao-venda** (uma query leve sobre os distintos),
  porque o id e estavel e imune a acento/variacao de texto. A lista de ids nao-venda e
  cacheada por chamada.
- A classificacao e **explicitamente listada no `aviso`** de toda metrica de faturamento:
  "faturamento = vendas autorizadas; exclui devolucoes e transferencias entre filiais".

### 3.7 Criterio de pronto do refactor (impede duas fontes de verdade)

Ao fim da F1, **toda** query fiscal que hoje usa o filtro "saida autorizada"
(`entradaSaida:'1'` + `situacaoNfe:'autorizada'`) **delega** para um helper canonico
(`faturamentoAutorizado` / `buildPeriodoWhere` / `buildEmpresaWhere` /
`NATUREZAS_NAO_VENDA_WHERE`), OU a SPEC lista explicitamente por que fica de fora. Alvos
identificados no codigo: `queryFaturamentoPeriodo` (delega total), `queryNotasEmitidas`
(mesmo filtro de saida autorizada, **delega** o where canonico), `queryFaturamentoPorCliente`
(delega o where + ganha empresa), `queryProdutosFaturados` (ganha empresa; mantem
`vrProdutos` por ser ranking de produto, documentado em 9.7). Nenhuma query fiscal com o
filtro de saida autorizada pode sobreviver com a clausula inline depois da F1.

### 3.8 Como as tools MCP passam a consumir os modulos

Hoje uma tool MCP (ex.: `mcp/tools/fiscal/faturamento-periodo.ts`) importa
`queryFaturamentoPeriodo` de `@/lib/reports/queries/fiscal.js`, faz `shape()`, embrulha em
`withFreshness` e `enriquecerEnvelope`. O padrao continua; muda a fonte e a entrada:

- A tool importa a **metrica canonica** de `@/lib/metrics/fiscal/<metrica>.js`.
- O `inputSchema` Zod ganha
  `empresaRef: z.string().trim().min(1).optional().describe("Empresa do grupo: id Odoo,
  CNPJ ou nome. Sem este campo, considera o grupo todo.")`.
- O handler chama `resolverEmpresa(prisma, empresaRef)` (5.2) ANTES da metrica: status
  `unica` -> usa `empresa.odooId` como `empresaId`; status `ambigua` -> retorna envelope de
  desambiguacao (lista de candidatas, sem chutar); status `nenhuma` -> aviso e roda como
  grupo (ou recusa, ver 5.2).
- Injeta `escopoEmpresa` (grupo vs empresa, 5.3) no `shape()`.
- `withFreshness(ctx.prisma, ["fato_nota_fiscal"], ...)` permanece (ou
  `["fato_nota_fiscal", "fato_nota_fiscal_item"]` para CFOP). `enriquecerEnvelope` permanece.

Tools `$queryRawUnsafe` (por-marca, por-uf) NAO usam `buildEmpresaWhere` (que retorna
objeto Prisma): recebem o fragmento SQL parametrizado `buildEmpresaSqlFragment` (5.1).

---

## 4. METRICAS DE FATURAMENTO DESTA FASE

Campos reais confirmados em `prisma/schema.prisma`: `FatoNotaFiscal` (`odooId`, `numero`,
`serie`, `entradaSaida` String?, `situacaoNfe` String?, `naturezaOperacaoId/Nome`,
`empresaId` Int?, `empresaNome`, `dataEmissao` DateTime?, `vrNf`, `vrProdutos`, `vrFatura`)
e `FatoNotaFiscalItem` (`odooId`, `documentoId` Int?, `cfopId/Nome`, `vrNf`, `vrProdutos`,
`dataEmissao` desnormalizado, `entradaSaida` desnormalizado). Data gravada como
`AAAA-MM-DDT00:00:00Z` (date-only do Odoo); janela com `gte`/`lt` sobre `dataEmissao`
(borda exclusiva, 3.5).

### 4.0 Definicao canonica de FATURAMENTO (decisao de raiz da v3)

**"Faturamento" = venda autorizada que saiu.** Em termos de filtro:
`entradaSaida='1'` AND `situacaoNfe='autorizada'` AND natureza NAO classificada como
nao-venda (devolucao, transferencia entre filiais, retorno, remessa, bonificacao,
comodato, demonstracao). Essa exclusao de natureza (3.6) e o que separa receita de
movimentacao fiscal sem venda. **Todas as metricas 4.1, 4.4, 4.6, 4.7, 4.8 herdam essa
definicao.** As metricas de controle/conciliacao (4.1b, 4.2, 4.3, 4.3b) NAO aplicam o
filtro de natureza, porque existem justamente para fechar a aritmetica de todas as notas
de saida (ver 1.2). Onde a distincao importa, o nome da metrica deixa claro.

### 4.1 FATURAMENTO_AUTORIZADO (venda)

- **Fonte:** `fato_nota_fiscal`.
- **Filtro:** `entradaSaida='1'` AND `situacaoNfe='autorizada'` AND `naturezaOperacaoId NOT IN
  (ids nao-venda)` (3.6).
- **Data de referencia:** `dataEmissao`. Nunca `dataAutorizacao`.
- **Valor:** `SUM(vrNf)`. Nunca `vrProdutos` nem `vrFatura`.
- **Exclui:** canceladas, nao-autorizadas, devolucoes, transferencias.
- **Empresa:** `AND empresaId = input.empresaId` quando presente.
- **Saida:** `{ totalNotas, valor }`. **E a definicao de "faturamento" do dono.**

### 4.1b FATURAMENTO_AUTORIZADO_TOTAL (toda saida autorizada)

- Igual a 4.1, **sem o filtro de natureza**: toda saida autorizada (venda + devolucao +
  transferencia). E a parcela que entra no fechamento de 1.2
  (`BRUTO = AUTORIZADO_TOTAL + CANCELAMENTOS + NAO_AUTORIZADO`).
- **Saida:** `{ totalNotas, valor }`. Usada por verificacao e pela tool `por_operacao`
  (que mostra a decomposicao venda vs nao-venda explicitamente).

### 4.2 FATURAMENTO_BRUTO

- **Fonte:** `fato_nota_fiscal`. **Filtro:** `entradaSaida='1'` (sem filtro de `situacaoNfe`,
  sem filtro de natureza, todas as emitidas de saida).
- **Data:** `dataEmissao`. **Valor:** `SUM(vrNf)`. **Empresa:** opcional.
- **Saida:** `{ totalNotas, valor }`.
- **Semantica:** "quanto tentamos faturar", inclui autorizadas + canceladas + rejeitadas +
  denegadas + `situacaoNfe=null`.

### 4.3 IMPACTO_CANCELAMENTOS

- **Fonte:** `fato_nota_fiscal`. **Filtro:** `entradaSaida='1'` AND `situacaoNfe='cancelada'`.
- **Data:** `dataEmissao`. **Valor:** `SUM(vrNf)`. **Empresa:** opcional.
- **Saida:** `{ totalNotas, valor }`.
- **Nota de data (dossie fiscal 604):** uma nota emitida em janeiro e cancelada em marco
  conta em janeiro nos dois lados (BRUTO e CANCELAMENTOS), por `dataEmissao`, o que mantem
  a equacao de fechamento por periodo de emissao consistente.

### 4.3b FATURAMENTO_NAO_AUTORIZADO (metrica nomeada, nao residuo)

- **Fonte:** `fato_nota_fiscal`. **Filtro:** `entradaSaida='1'` AND
  `(situacaoNfe NOT IN ('autorizada','cancelada') OR situacaoNfe IS NULL)`.
- **Data:** `dataEmissao`. **Valor:** `SUM(vrNf)`. **Empresa:** opcional.
- **Agrupamento de composicao:** alem do total, devolve `porSituacao` =
  `[{ situacaoNfe, totalNotas, valor }]` (agregacao em memoria, 3.4), para o dono ver
  quanto e `denegada`, `rejeitada`, `null`. Resolve o achado "residuo sem rotulo".
- **Saida:** `{ totalNotas, valor, porSituacao }`.
- **Fechamento:** `BRUTO = AUTORIZADO_TOTAL + IMPACTO_CANCELAMENTOS + NAO_AUTORIZADO` (1.2),
  agora com as tres parcelas sendo metricas nomeadas proprias, sem subtracao implicita.

### 4.4 FATURAMENTO_SAIDA

- Semanticamente igual a 4.1 (venda autorizada de saida). **Delega para
  `faturamentoAutorizado` internamente**, sem duplicar SQL. Existe para parear com ENTRADA.
- **Saida:** `{ totalNotas, valor }`.

### 4.5 FATURAMENTO_ENTRADA

- **Fonte:** `fato_nota_fiscal`. **Filtro:** `entradaSaida='0'` AND `situacaoNfe='autorizada'`.
  **Valor:** `SUM(vrNf)`. **Data:** `dataEmissao`. **Empresa:** opcional.
- **Saida:** `{ totalNotas, valor }`.
- **Armadilha (dossie fiscal 6.10):** ENTRADA aqui sao **notas proprias de compra**
  (`entradaSaida='0'` em `fato_nota_fiscal`), NAO os DF-e (`fato_dfe`, tabela separada). A
  F1 nao soma as duas fontes (risco de dupla contagem). O aviso da tool deixa explicito.
- **Terceira categoria `entradaSaida=null`:** existe (`entradaSaida` e String? no schema).
  Notas com `null` nao casam `='1'` nem `='0'` e por isso nao aparecem em SAIDA nem ENTRADA.
  O E2E conta `entradaSaida IS NULL` e a metrica BRUTO/SAIDA nunca assume que SAIDA+ENTRADA
  == total de notas. Se o volume null for material, vira investigacao (regra de raiz).

### 4.6 FATURAMENTO_POR_EMPRESA (= comparativo de filiais)

- **Fonte:** `fato_nota_fiscal`.
- **Filtro base:** definicao de faturamento de 4.0 (venda autorizada). **Data:** `dataEmissao`.
  **Valor:** `SUM(vrNf)`.
- **Agrupamento:** **SO por `empresaId`** (NUNCA pelo par `(empresaId, empresaNome)`, que
  inflaria a contagem quando o nome desnormalizado divergisse entre syncs). O `empresaNome`
  para exibir e resolvido num **segundo passo**: para cada `empresaId` distinto, busca o nome
  em `dim_empresa_grupo` (via `odooId`), com fallback para o `empresaNome` mais recente do
  proprio fato se a dim nao tiver. Implementacao: `findMany({ select: { empresaId, vrNf } })`
  + `Map<empresaId|null, {totalNotas, valor}>` (3.4), depois join em memoria com a dim.
- **Linha `empresaId=null`:** aparece **destacada** como "sem empresa / nao classificado",
  nunca silenciada (risco 9.3). Entra na soma do fechamento de 1.2.
- **Saida:** lista de `{ empresaId, empresaNome, totalNotas, valor }` ordenada por `valor`
  desc (a linha null por ultimo), mais
  `{ totalGrupo, empresasComFaturamento, valorSemEmpresa, totalNotasSemEmpresa }`.
- **Decisao de design:** esta metrica **nao** recebe filtro de empresa (ela JA quebra por
  empresa); responde "qual filial faturou mais" (pergunta 36 do dossie fiscal). **Esta E a
  tool de comparativo de empresas** mencionada no objetivo 1.1 item 3, nao ha tool separada.
- **Politica de resultados:** lista TODAS (~20 < 50), nao trava em N. Acima de 50 cairia na
  regra 50/50 via `paginacao.ts` (improvavel; documentado).
- **RBAC:** a tool ganha `gatedRoles: ['admin','super_admin']` (visao consolidada do grupo,
  que o dono nao quer expor a todo usuario). Ver 7.3.

### 4.7 FATURAMENTO_POR_OPERACAO (natureza)

- **Fonte:** `fato_nota_fiscal`.
- **Filtro base:** `entradaSaida='1'` AND `situacaoNfe='autorizada'` (saida autorizada,
  **sem** excluir nao-venda, porque o ponto desta metrica e justamente mostrar a
  decomposicao por natureza, incluindo devolucao/transferencia rotuladas). **Data:**
  `dataEmissao`. **Valor:** `SUM(vrNf)`.
- **Agrupamento:** por `naturezaOperacaoId`, nome resolvido em segundo passo (mesmo cuidado
  de 4.6: nome desnormalizado pode variar, nao entra na chave). Agregacao em memoria (3.4),
  pois `naturezaOperacaoId` pode ser nulo.
- **Empresa:** aceita filtro de empresa.
- **Saida:** lista de `{ naturezaOperacaoId, naturezaOperacaoNome, ehVenda, totalNotas,
  valor }` ordenada por valor desc, mais `{ total, valorGeral, valorVenda, valorNaoVenda }`.
  O flag `ehVenda` (da classificacao 3.6) deixa explicito o que e receita e o que e
  movimentacao. Ranking trava em N (`limit`).
- **Fechamento (relaxado, ver achado CFOP):** `valorGeral` desta metrica == 4.1b
  (`FATURAMENTO_AUTORIZADO_TOTAL`) do mesmo recorte, e `valorVenda` == 4.1
  (`FATURAMENTO_AUTORIZADO`). Bate exato porque ambos saem do mesmo `fato_nota_fiscal`
  (cabecalho), sem rateio.
- **Armadilha (dossie fiscal 6.7):** id de natureza pode ficar orfao; exibir o nome
  desnormalizado, nao depender de JOIN com `raw_sped_natureza_operacao`.

### 4.8 FATURAMENTO_POR_CFOP

- **Fonte:** `fato_nota_fiscal_item` (CFOP vive no item: `cfopId`/`cfopNome`).
- **Desnormalizacao nova na F1 (decisao de raiz, vinda da review):** adicionar
  **`empresaId Int?` desnormalizado em `fato_nota_fiscal_item`** (mais `@@index([empresaId])`),
  preenchido pelo builder a partir da nota-mae, exatamente como ja e feito para
  `dataEmissao` e `entradaSaida` nesse mesmo modelo. Isso elimina os quatro subproblemas do
  filtro via `documentoId IN (...)` (item sem empresa, IN gigante, paginacao de ids,
  situacao so no cabecalho), barateia toda tool de item por empresa nas fases seguintes, e
  e o padrao ja comprovado no schema. **Implica migration Prisma + reprocesso do builder**
  (ver 7.4 e protocolo de schema do CLAUDE.md).
- **Filtro de situacao:** `situacaoNfe` so existe no cabecalho. O builder tambem desnormaliza
  `situacaoNfe` no item (uma coluna a mais, mesmo movimento), para o filtro "autorizada" ser
  direto no item sem segunda etapa. (Alternativa, se o reprocesso for caro: manter o
  pre-filtro de `documentoId` autorizados; mas a decisao default da v3 e desnormalizar.)
- **Filtro:** item com `entradaSaida='1'` (ja desnormalizado) AND `situacaoNfe='autorizada'`
  (desnormalizado) AND nota de venda (a F1 NAO exclui nao-venda aqui por padrao, pois CFOP
  ja codifica a operacao; o aviso explica). **Data:** `dataEmissao` (desnormalizado).
- **Valor:** `SUM(item.vrNf)` (valor da linha, ja com impostos rateados). Nunca multiplicar
  cabecalho por numero de itens.
- **Agrupamento:** por `cfopId` (`groupBy` no banco, 3.4), nome em segundo passo.
- **Empresa:** filtro direto `empresaId = input.empresaId` no item (gracas a desnormalizacao).
- **Saida:** lista de `{ cfopId, cfopNome, totalLinhas, valor }` ordenada por valor desc,
  mais `{ total, valorGeral }`. Ranking trava em N.
- **Fechamento (tolerancia, corrigido na v3):** `valorGeral` (soma dos itens de saida
  autorizada) **bate com `FATURAMENTO_AUTORIZADO_TOTAL` (4.1b) dentro de tolerancia de
  arredondamento de rateio**, NAO exato. A soma de `item.vrNf` rateado por linha pode
  divergir do `vrNf` do cabecalho por centavos de arredondamento, e itens orfaos (com
  `documentoId`/`empresaId` apontando para nota nao sincronizada) ficam de fora. Criterio:
  divergencia <= R$ 0,01 por nota acumulada OU divergencia relativa < 0,1%, E o E2E
  reconcilia/loga itens orfaos (conta quantos e quanto valor). Divergencia maior vira
  investigacao (regra de raiz). O criterio "bate exato" da v1 era inatingivel por design.
- **Armadilha (dossie fiscal 6.8):** CFOP de **entrada** sao familias `1.xxx/2.xxx/3.xxx`,
  CFOP de **saida** sao `5.xxx/6.xxx/7.xxx`. (O dossie 6.8 dizia "entrada 9.xxx", o que e
  factualmente errado e foi corrigido aqui; registrar no plano para nao contaminar.) O
  filtro `entradaSaida='1'` ja separa saida de entrada.

### 4.9 FATURAMENTO_RECEBIDO (elo nota -> pedido -> titulo financeiro)

**Estado do elo no cache REAL (confrontado contra o schema, corrige a v1):**

- `FatoPedido` tem `empresaId`, `participanteId`, `vrNf`, `vrProdutos`, mas **NAO** tem
  `notaId` nem `chaveNfe`. (Ponte `nota -> pedido` ausente.)
- `FatoNotaFiscal` **NAO** tem `pedidoId`. (Mesma ponte ausente, do outro lado.)
- `FatoPedidoParcela` **TEM** `pedidoId`, `parcelaFaturada` (Boolean) e
  **`finanLancamentoId`** (`@map("finan_lancamento_id")`). (Ponte `pedido -> financeiro`
  PRESENTE.)
- `FatoFinanceiroLancamentoItem` **TEM** `pedidoId`. (Reforca a ponte `pedido -> financeiro`.)
- `FatoFinanceiroTitulo` **NAO** tem `pedidoId` nem `notaId` nem `chaveNfe` (confirmado no
  schema; a afirmacao de review de que `FatoFinanceiroTitulo.pedidoId` existe na linha 1931
  esta incorreta, o `pedidoId` esta em `FatoPedidoParcela` e `FatoFinanceiroLancamentoItem`).

**Conclusao factual:** o elo completo `nota -> recebimento` tem DUAS pontes possiveis no
cache (`pedido -> fato_pedido_parcela.finanLancamentoId -> finan` e
`pedido -> fato_financeiro_lancamento_item.pedidoId`) e UMA ponte FALTANTE (`nota -> pedido`).
O dossie financeiro (linhas 475, 479) confirma: nao ha chave direta nota<->titulo, e o
pedido seria o bridge "mas ainda nao conectado".

**Entrega da F1 (sem inventar numero):**

1. **O que a ponte parcial JA habilita (entregar de verdade):** "faturado vs recebido **por
   pedido**" usando `FatoPedidoParcela`: por pedido (e por empresa, via `FatoPedido.empresaId`),
   somar `parcelaFaturada=true` (faturado) vs parcelas com `finanLancamentoId` cujo titulo
   financeiro esta baixado/pago (recebido). Isso responde "quanto do que foi faturado ja
   foi recebido" no eixo PEDIDO, que e exatamente onde a ponte existe. Entregue como metrica
   real, rotulada "por pedido, nao por nota individual".
2. **O que falta e fica como gap honesto (Caminho 3a):** o cruzamento NOTA individual ->
   recebimento. Sem `notaId` em `FatoPedido`/`FatoFinanceiroTitulo`, a tool
   `fiscal_faturamento_recebido` responde, quando perguntada no eixo NOTA: "consigo cruzar
   no nivel de PEDIDO (faturado vs recebido por pedido), mas ainda nao no nivel de NOTA
   individual, porque falta a ponte nota->pedido no cache; registrei como gap". Loga o gap
   em `feature_requests`. NUNCA chuta numero por nota.
3. **Campo que falta, registrado para a Fase 2:** desnormalizar `pedidoId` (ou `chaveNfe`)
   em `fato_nota_fiscal`, OU `notaId` em `fato_pedido`, fechando a ponte `nota<->pedido`.
   A F1 documenta o campo exato a adicionar; a Fase 2 modela.
4. **Proxy por participante (opcional, so se o E2E provar):** faturamento autorizado de
   cliente X (4.1 por participante) vs `contas_a_receber` aberto do mesmo participante.
   Habilitado **somente** se o E2E mostrar que os `participanteId` batem entre
   `fato_nota_fiscal` e `fato_financeiro_titulo`. Sempre rotulado "aproximacao por
   participante, nao por nota". Se nao bater, fica so o item 1 + gap do item 2.

### 4.10 Tools de faturamento por marca / UF / serie (estendidas, nao reescritas)

- `faturamento_por_marca`: `$queryRawUnsafe` somando **`vrProdutos`** (sem impostos). A F1
  adiciona o filtro de empresa via `buildEmpresaSqlFragment` e **declara no `aviso`/envelope**:
  "valor por marca usa valor de produtos (sem impostos), pode ser 5-30% menor que o
  faturamento autorizado; nao cruzar diretamente". Nao realinha para `vrNf` (fora do escopo).
- `faturamento_por_uf`: `$queryRawUnsafe` ja somando **`vrNf`** (confirmado no codigo,
  linha 68). A F1 so adiciona o filtro de empresa via `buildEmpresaSqlFragment`. Sem ressalva
  de valor (ja usa vrNf).
- `faturamento_mensal_serie`: **delega** `queryFaturamentoPeriodo` (confirmado, linha 81),
  entao herda automaticamente o realinhamento canonico (vrNf + natureza de venda) ao
  refatorar `queryFaturamentoPeriodo`. So precisa propagar `empresaRef` no input.

---

## 5. CORTE POR EMPRESA

### 5.1 Helpers de empresa (dois, Prisma e SQL)

- **Campo real:** `FatoNotaFiscal.empresaId` (`@map("empresa_id")`, Int?, schema) +
  `empresaNome` (desnormalizado). Ja existe; o gap e que nenhuma query/tool filtra por ele.
- **`buildEmpresaWhere(empresaId?: number)`** em `src/lib/metrics/_shared/empresa.ts`:
  retorna `{}` quando ausente e `{ empresaId }` quando presente. Para as metricas Prisma.
- **`buildEmpresaSqlFragment(empresaId?, paramIndex)`** no mesmo arquivo: retorna
  `{ sql: '', params: [] }` quando ausente e `{ sql: 'AND <alias>.empresa_id = $N',
  params: [empresaId] }` quando presente, para as tools `$queryRawUnsafe` (por-marca,
  por-uf). Recebe o alias da tabela e o indice de parametro para nao colidir. Resolve o
  achado "helper unico nao cobre as 3 tools raw".
- **Tools (input):** `empresaRef: z.string().trim().min(1).optional()` (texto livre). O
  numero `empresaId` que entra no helper vem da resolucao (5.2), nunca direto do agente.

### 5.2 Resolver a entidade empresa (dim_empresa_grupo)

- **Fonte:** `DimEmpresaGrupo` (`odooId`, `nome`, `cnpj`, `tipo` 'matriz'|'filial', `uf`,
  `ativo`). O dossie transversal (linha 17) confirma: `dim_empresa_grupo.odoo_id` e o `id`
  de `res.company`, **a mesma chave** que `fato_nota_fiscal.empresa_id`. Logo, filtrar o
  fato por `empresaId = empresa.odooId` e correto. O E2E confirma a igualdade no dado
  (`DISTINCT empresa_id` do fato subconjunto de `odoo_id` da dim).
- **`resolverEmpresa(prisma, ref: string)`** em `_shared/empresa.ts`:
  - `ref` so digitos com ate 9 chars (cabe em Int) -> tenta como `odooId`. Achou: 1.
  - `ref` so digitos com 14 chars -> CNPJ (compara so digitos, imune a mascara, mesmo
    padrao do filtro de documento em `fiscal.ts` linha 333, confirmado no codigo).
  - `ref` texto -> match por `nome` (`contains`, `mode:'insensitive'`). Um match: resolve.
    Multiplos: lista (top 3) para desambiguacao, NUNCA chuta. Zero: `nenhuma`.
- **Contrato:** `resolverEmpresa` devolve
  `{ status: 'unica', empresa } | { status: 'ambigua', candidatas } | { status: 'nenhuma' }`.
  O handler decide: `unica` -> usa `empresa.odooId`; `ambigua` -> envelope de desambiguacao
  ("achei N empresas com esse nome, qual?", lista nome+CNPJ+tipo); `nenhuma` -> a tool
  responde aviso "nao encontrei empresa '<ref>'" e **roda como grupo** (default seguro),
  deixando claro no `escopoEmpresa` que o filtro pedido nao foi aplicado.
- **Fronteira com Fase 2:** so empresa, so id/CNPJ/nome-exato/contains. Sem Levenshtein.

### 5.3 Regra de default (sem empresa = grupo, com aviso) e nao-classificado

- **Sem `empresaRef`:** a metrica roda sobre o grupo todo. A tool injeta no `dados`:
  `escopoEmpresa: { tipo: 'grupo', empresasComFaturamento: M, empresasCadastradas: N,
  valorSemEmpresa: X, aviso: "considerei o grupo todo (M empresas com faturamento no
  periodo; N cadastradas no grupo); R$ X estao em notas sem empresa classificada" }`.
  - `N` = `dimEmpresaGrupo.count({ where: { ativo: true } })`.
  - `M` = numero de `empresaId` distintos nao nulos com faturamento no recorte (do
    resultado de `POR_EMPRESA`, ou de um `findMany` distinto no recorte). **O aviso usa M**
    (empresas que de fato faturaram), nao N, para nao enganar ("grupo todo (20)" quando so
    12 faturaram). Reporta N tambem, separado.
  - `valorSemEmpresa` (X) = `SUM(vrNf)` das notas com `empresaId=null` no recorte. Reporta a
    magnitude do nao-classificado mesmo quando o usuario nao filtra, resolvendo o achado de
    transparencia.
- **Com empresa resolvida:** `escopoEmpresa: { tipo: 'empresa', empresaId, empresaNome,
  cnpj, aviso: "considerei apenas a empresa <nome> (CNPJ <cnpj>)" }`.
- **Decisao de design:** o aviso e dado estruturado calculado em codigo, nao instrucao de
  prompt. Elimina a ambiguidade empresa-vs-grupo (MASTER 4.1 #1), a dor numero 1.

---

## 6. POLITICA DE RESULTADOS APLICADA A ESTA FASE

Aplica a politica canonica (MASTER secao 5) ao faturamento:

- **Escalares** (`FATURAMENTO_AUTORIZADO`, `_AUTORIZADO_TOTAL`, `_BRUTO`,
  `IMPACTO_CANCELAMENTOS`, `_NAO_AUTORIZADO`, `_SAIDA`, `_ENTRADA` para um recorte):
  retornam `{ totalNotas, valor }` (+ `porSituacao` no nao-autorizado) + `_DESTAQUE`/
  `_agregado`, sem lista paginavel.
- **`FATURAMENTO_POR_EMPRESA`** (~20 linhas): lista TODAS as empresas (~20 < 50, nao pagina,
  nao trava em N). KPIs (`totalGrupo`, maior/menor empresa, `valorSemEmpresa`) sobre o
  conjunto inteiro. Acima de 50 cai na regra 50/50 via `paginacao.ts`.
- **`FATURAMENTO_POR_OPERACAO` e `FATURAMENTO_POR_CFOP`** (rankings): travam em N explicito
  via `limit` (`paginacaoInputShape`, default 10, max 50). Ordenados por `valor` desc com
  desempate estavel (pelo nome). `total` = grupos distintos; `valorGeral` = soma do recorte
  inteiro (independente da pagina), como ja faz `queryFaturamentoPorCliente`.
- **Freshness:** todas carregam `atualizadoEm`/`atualizadoHa` via `withFreshness`.
- **Envelope de tamanho:** reusa `enriquecerEnvelope`; nenhuma resposta desta fase chega
  perto de 24KB (agregados pequenos).

---

## 7. IMPACTO NO CODIGO EXISTENTE

### 7.1 Novo (criar)

- `src/lib/metrics/_shared/{periodo.ts, empresa.ts, naturezas.ts, types.ts}`.
- `src/lib/metrics/fiscal/{faturamento-autorizado, faturamento-autorizado-total,
  faturamento-bruto, faturamento-nao-autorizado, impacto-cancelamentos, faturamento-saida,
  faturamento-entrada, faturamento-por-empresa, faturamento-por-operacao,
  faturamento-por-cfop, faturamento-recebido}.ts` + `index.ts`.
- `mcp/tools/fiscal/faturamento-por-empresa.ts` (tool nova, `dominio: "fiscal"`,
  `gatedRoles: ['admin','super_admin']`; e o comparativo de filiais).
- `mcp/tools/fiscal/faturamento-por-operacao.ts` (tool nova, `dominio: "fiscal"`).
- `mcp/tools/fiscal/faturamento-por-cfop.ts` (tool nova, `dominio: "fiscal"`).
- `mcp/tools/fiscal/faturamento-nao-autorizado.ts` (tool nova, `dominio: "fiscal"`).
- `mcp/tools/fiscal/faturamento-recebido.ts` (tool nova, `dominio: "fiscal"`, Caminho 3a +
  metrica por-pedido).
- Testes unitarios por metrica (`*.test.ts`) e por tool nova (padrao
  `mcp/tools/fiscal/*.test.ts`).

### 7.2 Refactor (mudar sem reescrever a logica que funciona)

- `src/lib/reports/queries/fiscal.ts`: extrair a clausula de periodo para
  `buildPeriodoWhere`; `queryFaturamentoPeriodo` e `queryNotasEmitidas` passam a usar o
  `where` canonico (`faturamentoAutorizado` / helpers + `NATUREZAS_NAO_VENDA_WHERE`);
  `queryFaturamentoPorCliente` ganha `empresaId?` via `buildEmpresaWhere` e usa o where
  canonico; `queryProdutosFaturados` ganha `empresaId?` (mantem `vrProdutos`, documentado).
  Criterio de pronto: 3.7.
- `mcp/tools/fiscal/faturamento-periodo.ts`, `notas-emitidas.ts`, `notas-recebidas.ts`,
  `faturamento-por-cliente.ts`, `produtos-faturados.ts`, `impostos-periodo.ts`,
  `faturamento-mensal-serie.ts`: adicionar `empresaRef` ao `inputSchema`, resolver empresa
  no handler, injetar `escopoEmpresa` no `shape()`. Sem mexer no envelope/freshness.
- `mcp/tools/fiscal/faturamento-por-marca.ts`, `faturamento-por-uf.ts`: adicionar
  `empresaRef` + `buildEmpresaSqlFragment` no `$queryRawUnsafe`; marca declara ressalva de
  `vrProdutos` no envelope (4.10).
- `mcp/tools/fiscal/index.ts`: registrar as 5 tools novas no array `fiscalTools`.

### 7.3 RBAC (explicitado na v3)

- Toda tool nova declara `dominio: "fiscal"` no `ToolEntry`. Sem isso, uma entry sem
  dominio cai no caso "sempre coerente de dominio" (furo). Confirmado no `mcp/catalog/types.ts`:
  o gate por dominio filtra `visibleTools` pelos dominios concedidos; `gatedRoles` e gate
  adicional por role.
- `faturamento-por-empresa` (comparativo consolidado do grupo) declara
  `gatedRoles: ['admin','super_admin']`: e a visao agregada de todas as filiais que o dono
  nao quer que todo usuario veja. As demais tools novas ficam so com `dominio: "fiscal"`
  (sem gate de role), iguais as tools fiscais existentes.

### 7.4 Schema (migration nova na F1)

- `fato_nota_fiscal_item`: adicionar `empresaId Int? @map("empresa_id")` (+ `@@index`) e
  `situacaoNfe String? @map("situacao_nfe")` desnormalizados da nota-mae (4.8). O builder
  `src/worker/fatos/fato-nota-fiscal-item.ts` preenche ambos a partir do cabecalho, mesmo
  padrao ja usado para `dataEmissao`/`entradaSaida` nesse arquivo.
- **Protocolo de schema (CLAUDE.md):** avisar antes da migration; rodar
  `agente schema-changed` apos; rebuildar **todos** os containers (app, mcp, worker) porque
  schema mudou. O worker reprocessa `fato_nota_fiscal_item` para preencher as colunas novas.

### 7.5 Nao tocar

- `withFreshness`, `enriquecerEnvelope`, `paginacao.ts`, `mcp/catalog/registry.ts` (o gate
  de dominio/role ja existe; so consumimos). `FATO_FONTE` ja mapeia `fato_nota_fiscal` e
  `fato_nota_fiscal_item`.
- As 16+ tools fiscais que nao tocam faturamento (carta-correcao, certificados, mdfe,
  reinf, dfe-*, referencia-buscar): inalteradas.

---

## 8. PLANO DE TESTE E2E CONTRA CACHE REAL

Regra de raiz: subir o servico, popular os fatos, exercer contra o cache real.
`tsc`/`eslint`/`jest` com mocks nao bastam.

### 8.1 Preparacao

- `fato_nota_fiscal` e `fato_nota_fiscal_item` populados (build do worker, com as colunas
  novas de 7.4 preenchidas) e `dim_empresa_grupo` com as ~20 empresas. Conferir
  `SELECT COUNT(*) FROM dim_empresa_grupo WHERE ativo`.
- Rebuild do container `mcp` (e `app`/`worker` por causa da migration de schema; ver 7.4 e
  o mapa de rebuild do CLAUDE.md).
- **Pre-flight de premissas (rodar ANTES de confiar em qualquer numero):**
  1. `SELECT DISTINCT situacao_nfe FROM fato_nota_fiscal` (valida a lista de 9.2, nao
     assumir fechada).
  2. `SELECT DISTINCT natureza_operacao_nome FROM fato_nota_fiscal` (revisa a lista de
     termos nao-venda de 3.6; ajustar se aparecer natureza nao prevista).
  3. `SELECT DISTINCT empresa_id FROM fato_nota_fiscal WHERE empresa_id IS NOT NULL` e
     conferir subconjunto de `SELECT odoo_id FROM dim_empresa_grupo` (identidade de empresa).
  4. `SELECT COUNT(*) FROM fato_nota_fiscal WHERE entrada_saida IS NULL` (terceira categoria).
  5. `SELECT COUNT(*), MAX(data_emissao) FROM fato_nota_fiscal WHERE EXTRACT(HOUR FROM
     data_emissao) <> 0` (valida a borda de periodo 3.5).

### 8.2 Numeros a conferir

1. **Coerencia bruto/autorizado-total/cancelado/nao-autorizado** (criterio 1.2): para um
   periodo amplo, conferir
   `BRUTO == AUTORIZADO_TOTAL + IMPACTO_CANCELAMENTOS + NAO_AUTORIZADO` (todas metricas
   nomeadas, sem subtracao). Cada parcela >= 0. Conferir tambem que
   `FATURAMENTO_AUTORIZADO (venda) <= AUTORIZADO_TOTAL` (venda e subconjunto). Logar (nao
   falhar) se alguma parcela der negativa: indica `vrNf` editado pos-cancelamento, vira
   investigacao do registro especifico.
2. **Fechamento do corte por empresa** (criterio 1.2): `SUM(POR_EMPRESA.valor sobre TODAS
   as linhas, incluindo empresaId=null) == FATURAMENTO_AUTORIZADO do grupo` para o mesmo
   periodo. Tolerancia zero (mesmo `SUM`, mesma fonte, mesma definicao de 4.0). **NAO** testar
   contra a soma de N chamadas `faturamentoAutorizado(empresaRef=X)`: essas excluem null e
   por construcao somam menos (documentado em 1.2). A linha null e exibida (risco 9.3).
3. **Default avisa:** `fiscal_faturamento_periodo` sem `empresaRef` -> `escopoEmpresa.tipo
   = 'grupo'`, `empresasComFaturamento = M`, `valorSemEmpresa` presente. Com `empresaRef` de
   uma matriz -> `tipo = 'empresa'`, nome e CNPJ corretos.
4. **Resolucao de empresa:** `resolverEmpresa` por odooId (unica), por CNPJ (unica), por
   nome exato (unica), por nome parcial que casa 2+ (ambigua -> lista), por nome inexistente
   (nenhuma -> roda como grupo com aviso).
5. **POR_OPERACAO:** `valorGeral == AUTORIZADO_TOTAL` e `valorVenda == AUTORIZADO (venda)`
   do mesmo recorte (exato, mesma fonte cabecalho). Conferir que naturezas de devolucao/
   transferencia aparecem com `ehVenda=false`.
6. **POR_CFOP:** `valorGeral` bate com `AUTORIZADO_TOTAL` **dentro da tolerancia de rateio**
   (4.8): divergencia <= R$ 0,01/nota acumulada OU < 0,1% relativo, E itens orfaos
   contados/logados. CFOP filtrado por empresa <= CFOP do grupo.
7. **Sem regressao:** comparar `fiscal_faturamento_periodo` (sem empresaRef) antes e depois
   do refactor. ATENCAO: o numero **vai mudar** se o periodo tiver devolucao/transferencia,
   porque a v3 passa a excluir nao-venda (4.0). O criterio de "sem regressao" e: o novo numero
   == antigo numero MENOS as devolucoes/transferencias do periodo (conferir a diferenca contra
   `POR_OPERACAO.valorNaoVenda`). Se o periodo nao tiver nao-venda, numero identico.
8. **RECEBIDO:** confirmar que (a) a metrica "faturado vs recebido por pedido" (4.9 item 1)
   responde numero real rotulado "por pedido"; (b) a pergunta no eixo NOTA individual retorna
   gap honesto (estado/aviso), nao numero, e loga o gap; (c) o proxy por participante so
   aparece com rotulo de aproximacao e so se os participantes baterem entre os fatos.

### 8.3 Sanidade de negocio

- O faturamento total do grupo bate a ordem de grandeza esperada pelo dono. A maior filial
  em `POR_EMPRESA` faz sentido (matriz costuma liderar). Numero que nao fecha vira
  investigacao ate a certeza (regra de raiz), nao entrega com ressalva.

---

## 9. RISCOS E ARMADILHAS

### 9.1 Itens orfaos e rateio no CFOP
`fato_nota_fiscal_item` nao tem relacao Prisma com `fato_nota_fiscal` (comentario no schema
e em `fiscal.ts` linha 239). Com a desnormalizacao de `empresaId`/`situacaoNfe` no item
(7.4), o filtro por empresa fica direto, mas itens cujo `documentoId` aponta para nota nao
sincronizada ficam orfaos e nao somam no CFOP. Por isso o fechamento do CFOP e por
tolerancia (4.8/8.2.6), nunca exato: rateio arredonda e orfaos faltam. O E2E conta orfaos.
Nunca multiplicar valor de cabecalho por numero de itens (usar `item.vrNf`, ja rateado).

### 9.2 `situacao_nfe`: valores reais e nulos
Valores observados: `'autorizada'`, `'cancelada'`, `'denegada'`, `'rejeitada'`, `null`.
`null` (nunca foi / rejeitada) e `'cancelada'` (foi autorizada e cancelada depois) sao
coisas diferentes (dossie fiscal 6.1). `FATURAMENTO_NAO_AUTORIZADO` (4.3b) captura
`NOT IN ('autorizada','cancelada') OR IS NULL` e decompoe por `situacaoNfe`, entao
`denegada`/`rejeitada`/`null` aparecem rotuladas, nao como residuo. NAO assumir lista
fechada: o pre-flight 8.1 valida os distintos reais.

### 9.3 `empresa_id` nulo
Notas de transferencia intra-grupo ou registros antigos podem ter `empresaId = null`. No
`POR_EMPRESA`, a linha null aparece destacada ("sem empresa / nao classificado"), entra na
soma do fechamento (1.2), e o valor agregado (`valorSemEmpresa`) e reportado em TODO escopo
de grupo (5.3), mesmo quando o usuario nao filtra. Um filtro por empresa nunca casa linhas
null (correto). Volume null material vira investigacao.

### 9.4 Faturamento emitido vs recebido (estado real do elo)
Confrontado contra o schema: ponte `pedido -> financeiro` EXISTE
(`FatoPedidoParcela.finanLancamentoId`, `parcelaFaturada`,
`FatoFinanceiroLancamentoItem.pedidoId`); ponte `nota -> pedido` NAO existe
(`FatoPedido` sem `notaId`, `FatoNotaFiscal` sem `pedidoId`, `FatoFinanceiroTitulo` sem
nenhum dos dois). A F1 entrega "faturado vs recebido por PEDIDO" (real) e marca o eixo NOTA
individual como gap honesto (4.9). Risco maximo da fase: a tentacao de inventar o numero no
nivel nota. Mitigacao: a tool nunca chuta; o proxy por participante so com rotulo e so se o
E2E provar.

### 9.5 Borda de periodo
`buildPeriodoWhere` usa borda EXCLUSIVA (`gte de`, `lt ate+1dia`), blindada contra
`dataEmissao` com hora (3.5). Nasce assim na F1, sem divida latente. O pre-flight 8.1 item 5
documenta se ha datas com hora.

### 9.6 Custo do filtro de empresa no CFOP (resolvido por desnormalizacao)
A v1 filtrava CFOP por empresa via `documentoId IN (...)` em duas etapas (item sem
`empresaId`), com risco de `IN` gigante. A v3 desnormaliza `empresaId` no item (7.4),
tornando o filtro direto. O custo migra para a migration + reprocesso do builder (uma vez),
nao para cada consulta.

### 9.7 `vrNf` vs `vrProdutos` vs `vrFatura`
Faturamento (cabecalho) = `vrNf` (com impostos), sempre. `vrProdutos` (sem impostos) daria
5-30% menos (dossie fiscal 6.2). `vrFatura` pode ser a parcela da filial em operacoes
compartilhadas (difere de `vrNf`, que e o total da nota); como a F1 opera no nivel empresa,
onde o caso compartilhado importa, **a F1 ignora `vrFatura` de proposito** e usa `vrNf` por
nota; se o E2E revelar muitas notas com `vrFatura != vrNf`, registrar para investigacao
futura de rateio inter-filial. Excecoes conscientes que mantem `vrProdutos`:
`queryProdutosFaturados` (ranking de produto) e `faturamento_por_marca` (4.10), ambas
rotuladas no envelope. O code review confere que nenhuma metrica de cabecalho usou
`vrProdutos`/`vrFatura` por engano.

### 9.8 `entradaSaida` e string nullable, nao boolean
`'0'`/`'1'` como string, e tambem `null` (dossie fiscal 6.4 + schema String?).
`if (row.entradaSaida)` entra com `'0'` (truthy). Sempre comparar `=== "1"` / `=== "0"`.
Notas com `entradaSaida=null` somem de SAIDA e ENTRADA (4.5); o E2E conta e a metrica nunca
assume `SAIDA + ENTRADA == total`.

### 9.9 `groupBy` Prisma com nulo
O driver `@prisma/adapter-pg` nao agrupa nulo de forma confiavel (`cadastros.ts` linha 113
ja contorna). Metricas com agrupamento por campo possivelmente nulo (empresa, natureza,
situacao) usam `findMany` + `Map` (3.4); so o CFOP usa `groupBy` no banco (chave cfopId
raramente nula), com a linha `cfopId=null` tratada explicitamente. O code review confere
que nenhuma metrica novou `groupBy` por empresa/natureza/situacao.

---

## RESUMO

A v3 transforma o faturamento fiscal numa **camada de metricas canonicas** em
`src/lib/metrics/fiscal/` (uma funcao pura por metrica, cabecalho de regra exata:
fonte, filtro, data=`dataEmissao`, valor=`vrNf`, exclusoes), consumidas pelas tools MCP que
hoje tem a regra duplicada em `src/lib/reports/queries/fiscal.ts`. As tres correcoes de raiz
sobre o DADO REAL, levantadas pelas reviews e confrontadas contra o schema: (1) "faturamento"
agora **exclui devolucao e transferencia** (naturezas de saida autorizada que nao sao venda),
via classificacao em `_shared/naturezas.ts`, antes a v1 contava devolucao como receita;
(2) agrupamento por campo nulo (empresa/natureza/situacao) usa **`findMany`+`Map`**, nunca
`prisma.groupBy` com null, que o proprio codigo ja provou nao funcionar no `adapter-pg`, e
`POR_EMPRESA` agrupa **so por `empresaId`** com nome resolvido em segundo passo; (3) o elo
emitido-vs-recebido foi reescrito sobre o schema REAL: a ponte `pedido->financeiro` existe
(`finanLancamentoId`, `parcelaFaturada`, `FatoFinanceiroLancamentoItem.pedidoId`) e habilita
"faturado vs recebido por PEDIDO" de verdade; so falta `nota->pedido`, que vira gap honesto
no eixo nota. Fechamentos: a equacao `BRUTO = AUTORIZADO_TOTAL + IMPACTO_CANCELAMENTOS +
NAO_AUTORIZADO` usa quatro metricas nomeadas (incluindo `FATURAMENTO_NAO_AUTORIZADO` com
`groupBy(situacaoNfe)`, nao mais subtracao), e o CFOP fecha **por tolerancia de rateio**, nao
exato. Contrato de entrada fechado: tools aceitam `empresaRef` textual (id/CNPJ/nome),
resolvido por `resolverEmpresa` para `empresaId`. Borda de periodo exclusiva
(`lt ate+1dia`), sem bug latente. CFOP-por-empresa resolvido **desnormalizando `empresaId` e
`situacaoNfe` em `fato_nota_fiscal_item`** ja na F1 (migration + builder). RBAC explicitado:
toda tool nova declara `dominio: "fiscal"`, e o comparativo de filiais ganha
`gatedRoles: ['admin','super_admin']`.

**Metricas finais (10):** FATURAMENTO_AUTORIZADO (venda), FATURAMENTO_AUTORIZADO_TOTAL (toda
saida autorizada), FATURAMENTO_BRUTO, FATURAMENTO_NAO_AUTORIZADO (com decomposicao por
situacao), IMPACTO_CANCELAMENTOS, FATURAMENTO_SAIDA (delega autorizado), FATURAMENTO_ENTRADA,
FATURAMENTO_POR_EMPRESA (= comparativo de filiais), FATURAMENTO_POR_OPERACAO (natureza, com
flag ehVenda), FATURAMENTO_POR_CFOP, FATURAMENTO_RECEBIDO (por pedido real + gap no eixo nota).

**Camada de metricas (design):** funcao pura por metrica + cabecalho canonico + helpers
unicos em `_shared/` (`buildPeriodoWhere` borda exclusiva, `buildEmpresaWhere` Prisma,
`buildEmpresaSqlFragment` para as 2 tools raw, `resolverEmpresa`, `NATUREZAS_NAO_VENDA_WHERE`);
tools = transporte (schema + resolucao de empresa + envelope + aviso); refactor incremental
COM criterio de pronto (3.7) que impede duas fontes de verdade.

**Arquivos que a execucao cria/altera (alimenta o plano):**
- Criar: `src/lib/metrics/_shared/{periodo,empresa,naturezas,types}.ts`;
  `src/lib/metrics/fiscal/{faturamento-autorizado,faturamento-autorizado-total,
  faturamento-bruto,faturamento-nao-autorizado,impacto-cancelamentos,faturamento-saida,
  faturamento-entrada,faturamento-por-empresa,faturamento-por-operacao,faturamento-por-cfop,
  faturamento-recebido}.ts` + `index.ts`; `mcp/tools/fiscal/{faturamento-por-empresa,
  faturamento-por-operacao,faturamento-por-cfop,faturamento-nao-autorizado,
  faturamento-recebido}.ts`; testes `*.test.ts` de cada metrica e tool nova.
- Alterar: `prisma/schema.prisma` (colunas `empresaId`/`situacaoNfe` em
  `FatoNotaFiscalItem` + migration); `src/worker/fatos/fato-nota-fiscal-item.ts` (builder
  preenche as colunas novas); `src/lib/reports/queries/fiscal.ts` (delegacao + `empresaId`);
  `mcp/tools/fiscal/{faturamento-periodo,notas-emitidas,notas-recebidas,
  faturamento-por-cliente,produtos-faturados,impostos-periodo,faturamento-mensal-serie,
  faturamento-por-marca,faturamento-por-uf}.ts` (empresaRef + escopo); `mcp/tools/fiscal/index.ts`
  (registrar 5 tools).
