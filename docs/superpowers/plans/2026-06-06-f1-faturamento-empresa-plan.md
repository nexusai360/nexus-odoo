# PLAN v3 (consolidada apos 2 reviews): Fase 1 do Nex, Faturamento + Corte por Empresa

**Data:** 2026-06-06
**Fase:** F1 da reconstrucao do Nex
**Spec fonte:** `docs/superpowers/specs/2026-06-06-f1-faturamento-empresa-spec.md` (SPEC v3)
**Metodo:** `superpowers:writing-plans` + TDD por metrica/tool. Stack TypeScript, sem Python.
**Branch:** `feat/nex-reconstrucao` (worktree `feat-nex-reconstrucao`).

> Este plano materializa a SPEC v3 em tasks microscopicas. Cada task tem arquivo
> exato, acao, verificacao e resultado esperado. Nenhuma task esconde mais de uma
> unidade de trabalho. TDD: a task de teste precede a de implementacao em toda
> metrica/tool com codigo testavel. Proibido travessao no codigo, doc e commits.

> **Mudancas materiais da v3 sobre a v1 (vindas das 2 reviews):**
> 1. **Premissa do builder confirmada ANTES de codar** (era "confirmar depois"). O builder do
>    cabecalho `src/worker/fatos/fato-nota-fiscal.ts` (linhas 64, 71) ja usa `raw.situacao_nfe`
>    (string direta) e `relId(raw.empresa_id)`. O Bloco A fixa esses nomes; nao ha mais "pode
>    vir como company_id". A confirmacao no raw vira pre-flight A1 (bloqueante, antes do teste).
> 2. **O arquivo de teste do builder JA EXISTE** (`fato-nota-fiscal-item.test.ts`, 11KB, com
>    `describe("mapNotaFiscalItemRow")` e `describe("rebuildFatoNotaFiscalItem")`, mock
>    `notaInfoMap` na linha 39-40). A task A6 ESTENDE o arquivo, nunca "cria".
> 3. **Reprocesso (A-reprocesso) movido para DEPOIS do rebuild do worker (Bloco F).** O worker
>    so roda o builder novo apos rebuild da imagem `nexus-odoo:local`. O gatilho real e
>    `runBuilders(prisma, "incremental")` via `scripts/f4l-build-fatos.ts`, executado dentro do
>    container worker. A ordem A->F estava circular na v1; corrigida.
> 4. **Spike bloqueante do elo recebido (Bloco C, antes da metrica).** Confirmado contra o
>    schema: `FatoPedidoParcela.finanLancamentoId @map("finan_lancamento_id")` aponta para um
>    LANCAMENTO, e a ponte para o "recebido" e `FatoFinanceiroLancamentoItem.lancamentoId`
>    (com `vrPagoTotal`/`vrSaldo`), NAO `FatoFinanceiroTitulo` (que nao tem `lancamentoId` nem
>    `pedidoId`). A SPEC 4.9 fala em "titulo baixado/pago via finanLancamentoId": isso esta
>    estruturalmente errado. O spike prova o caminho real no dado antes de implementar.
> 5. **Bloco C decomposto: cada metrica = 1 task de teste (vermelho) + 1 task de impl (verde).**
>    A v1 fundia teste+impl em C3/C4/C5/C6/C7/C8/C12/C14/C16. Agora todas separadas.
> 6. **E6-E11 viraram 6 tasks numeradas independentes,** cada uma com o caminho do `.test.ts`
>    e o veredito "existe/criar". Placeholders `<paramIndex>`/`<alias>` de E12/E13 substituidos
>    por valores concretos (`fnfi`/`$4`; `nf`/`$3`).
> 7. **Nova task que conserta as contagens de `integration.test.ts`** (literais 93/102, FISCAL_IDS,
>    TODOS_IDS, contagens por role) que as 5 tools novas quebram.
> 8. **E1 decide o contrato de retorno de `queryFaturamentoPeriodo`** (mantem a chave
>    `valorFaturado` publica, so troca a fonte interna do where), sem deixar "delega".
> 9. **D5 fixa o contrato do gap:** a tool `faturamento_recebido` no eixo nota retorna envelope de
>    gap honesto SEM gravar nada; quem registra e o agente chamando `registrar_lacuna`
>    (`mcp/tools/caminho3/registrar-lacuna.ts`, que grava via `ctx.prisma.featureRequest.createMany`).
> 10. **G2 resolve `idsNaoVenda` UMA vez e injeta nas duas metricas** no E2E (ou roda com worker
>     pausado), para o fechamento "tolerancia zero" nao falhar por sync concorrente.

---

## 0. VISAO GERAL E ORDEM DE EXECUCAO

A F1 entrega: (1) migration que desnormaliza `empresaId` + `situacaoNfe` em
`fato_nota_fiscal_item` + ajuste do builder; (2) 4 helpers `_shared` (types, periodo, empresa,
naturezas); (3) 11 modulos de metrica canonica em `src/lib/metrics/fiscal/`; (4) spike do elo
recebido; (5) 5 tools MCP novas + registro + correcao das contagens de teste; (6) refactor de
9 tools/queries fiscais para `empresaRef` + escopo + delegacao canonica; (7) rebuild de
containers; (8) reprocesso do builder; (9) verificacao E2E contra cache real; (10) code review.

**Ordem com dependencias (blocos):**

```
A (schema/migration/builder code)  ── A1 confirma nomes no raw (gate) -> schema -> builder
        │
B (_shared: types -> periodo -> empresa -> naturezas)  ── precede TODA metrica do bloco C
        │
C (spike recebido + 11 metricas TDD, uma a uma)  ── precede as tools (D, E)
        │
D (5 tools novas + index + correcao integration.test)  ── consome C; tool CFOP consome A
        │
E (refactor 9 queries/tools + delegacao)  ── consome B (helpers) + C (faturamentoAutorizado)
        │
F (rebuild containers: app p/ worker + mcp)  ── apos A (schema) e apos D/E (codigo)
        │
F-reprocesso (rodar o builder no worker novo)  ── apos F1 (imagem worker nova)
        │
G (E2E contra cache real)  ── apos F-reprocesso
        │
H (code review + STATUS/HISTORY)  ── apos G
```

**Regra de dependencia dura:**
- **A1 (confirmar nomes reais no raw) e o primeiro passo de tudo** e e bloqueante: prova que
  `data.situacao_nfe`/`data.empresa_id` existem no `raw_sped_documento.data` (o builder do
  cabecalho ja le exatamente esses nomes; A1 confirma no dado). So depois roda A2-A8.
- Bloco B antes de C (toda metrica importa os helpers).
- Dentro de C, o **spike C0 (elo recebido)** precede C15/C16; e `faturamento-autorizado`
  (C2/C3) precede `faturamento-saida` (C13/C14, delega) e o refactor E.
- **A coluna nova no DB existe apos A4 (migration aplicada), mas so e POPULADA no
  F-reprocesso**, que roda DEPOIS do rebuild do worker (Bloco F). Logo a tool CFOP (D3) e o
  E2E do CFOP (G4) so sao exerciveis apos F-reprocesso. Codigo do CFOP (C13/C14) e da tool
  (D3) pode ser escrito e ter teste de mock verde antes, sem depender do reprocesso.
- `agente schema-changed` roda em A5 (apos a migration aplicar).

**Convencao de verificacao:** salvo indicado, `npx tsc --noEmit` e `npx jest <arquivo>` rodam
na raiz da worktree. Comandos docker conforme o mapa do CLAUDE.md secao 2.1 (worker NAO tem
build proprio: rebuildar via `app`).

---

## BLOCO A , SCHEMA: desnormalizar empresaId + situacaoNfe no item

> Fonte: SPEC 4.8, 7.4, 9.6. Hoje `FatoNotaFiscalItem` (schema linhas 2056-2079) ja
> desnormaliza `dataEmissao` e `entradaSaida` da nota-mae via `notaInfoMap` no builder
> `src/worker/fatos/fato-nota-fiscal-item.ts`. A F1 acrescenta `empresaId` e `situacaoNfe`
> pelo mesmo caminho. O builder do cabecalho `src/worker/fatos/fato-nota-fiscal.ts` ja prova
> os nomes reais: linha 64 `situacaoNfe: typeof raw.situacao_nfe === "string" ? raw.situacao_nfe : null`,
> linha 71 `empresaId: relId(raw.empresa_id as OdooM2O)`.

### A0. Aviso de schema (protocolo CLAUDE.md)
- **Arquivo:** nenhum (acao de processo).
- **Fazer:** avisar o usuario em uma frase ("esta fase muda o schema do cache, item ganha
  empresaId+situacaoNfe; outras worktrees podem precisar sincronizar depois"). Como o usuario
  ja pediu a fase, procede sem aguardar.
- **Verificar:** N/A.
- **Resultado:** aviso dado; segue para A1. (`agente schema-changed` roda em A5.)

### A1. Confirmar os nomes reais dos campos no raw (PRE-FLIGHT BLOQUEANTE, antes de tudo)
- **Arquivo:** N/A (consulta SQL ao cache).
- **Fazer:** rodar no Postgres do cache:
  `SELECT data->'empresa_id' AS empresa, data->'situacao_nfe' AS situacao FROM raw_sped_documento WHERE raw_deleted = false LIMIT 10;`
  Confirmar que: (a) `empresa_id` vem como par M2O `[id, "Nome"]` (mesmo formato que
  `documento_id`, consumido por `relId`), e (b) `situacao_nfe` vem como string direta. Cruzar
  com o builder do cabecalho `src/worker/fatos/fato-nota-fiscal.ts` (linhas 64 e 71), que ja
  le exatamente `raw.situacao_nfe` e `relId(raw.empresa_id)` com sucesso para `fato_nota_fiscal`.
  Conferir tambem que `SELECT COUNT(*) FROM raw_sped_documento WHERE data ? 'empresa_id'` cobre
  a maioria das linhas (orfas/null sao esperadas, ver SPEC 9.3).
- **Verificar:** o `SELECT` retorna `empresa_id` no formato `[id, nome]` e `situacao_nfe`
  string; os nomes batem com o builder do cabecalho.
- **Resultado:** nomes de campo FIXADOS (`empresa_id` M2O, `situacao_nfe` string). A6 usa esses
  nomes sem ambiguidade. Se (improvavel) divergirem, ajustar A6 aqui, antes de codar.

### A2. Adicionar colunas no schema Prisma
- **Arquivo:** `prisma/schema.prisma`, modelo `FatoNotaFiscalItem` (linhas 2056-2079).
- **Fazer:** dentro do bloco de desnormalizados (apos a linha de `entradaSaida ... @map("entrada_saida")`),
  adicionar:
  `empresaId   Int?    @map("empresa_id")` e
  `situacaoNfe String? @map("situacao_nfe")`.
  Adicionar `@@index([empresaId])` junto aos indices existentes do modelo.
- **Verificar:** `npx prisma validate`.
- **Resultado:** schema valido, modelo com os dois campos novos + indice.

### A3. Gerar a migration (create-only, para inspecao)
- **Arquivo:** novo `prisma/migrations/<timestamp>_fnfi_empresa_situacao/migration.sql`.
- **Fazer:** `npx prisma migrate dev --name fnfi_empresa_situacao --create-only`. Inspecionar o
  SQL: deve conter SO `ALTER TABLE "fato_nota_fiscal_item" ADD COLUMN "empresa_id" INTEGER`,
  `ALTER TABLE "fato_nota_fiscal_item" ADD COLUMN "situacao_nfe" TEXT` e
  `CREATE INDEX ... ON "fato_nota_fiscal_item"("empresa_id")`. Nenhum DROP, nenhuma outra tabela.
- **Verificar:** ler o `migration.sql`; confirmar so os 3 statements aditivos.
- **Resultado:** migration aditiva e segura, ainda nao aplicada.

### A4. Aplicar a migration + prisma generate
- **Arquivo:** N/A (DB + `src/generated/prisma/**`).
- **Fazer:** `npx prisma migrate dev` (aplica) e `npx prisma generate`.
- **Verificar:** `psql ... -c "\d fato_nota_fiscal_item"` mostra `empresa_id` e `situacao_nfe`;
  `npx tsc --noEmit` compila (o client tipado conhece os campos novos).
- **Resultado:** colunas no banco (NULAS em todas as linhas existentes ainda; populadas so no
  F-reprocesso), client regenerado.

### A5. Sinalizar schema mudado entre worktrees
- **Arquivo:** N/A (sinal `.agente/schema-changed.json`).
- **Fazer:** `agente schema-changed`.
- **Verificar:** `agente status` em outra worktree exibe o alerta.
- **Resultado:** demais worktrees avisadas.

### A6. ESTENDER o teste do mapper do builder (TDD, antes da impl)
- **Arquivo:** `src/worker/fatos/fato-nota-fiscal-item.test.ts` (JA EXISTE, 11KB; ESTENDER, nao
  criar).
- **Fazer:**
  1. No `describe("mapNotaFiscalItemRow")`: estender o mock `notaInfoMap` da linha 39-40 (hoje
     `[42, { dataEmissao: new Date("2024-01-15T00:00:00Z"), entradaSaida: "1" }]`) para incluir
     `empresaId: 7` e `situacaoNfe: "autorizada"` na mesma entrada `[42, {...}]`.
  2. No teste existente "desnormaliza dataEmissao e entradaSaida da nota-mae via notaInfoMap"
     (linha 78-82): adicionar `expect(row.empresaId).toBe(7)` e
     `expect(row.situacaoNfe).toBe("autorizada")`.
  3. No teste existente "dataEmissao e entradaSaida null quando documentoId nao esta no map"
     (linha 84-87, usa `documento_id: [999, "NF-X"]`): adicionar
     `expect(row.empresaId).toBeNull()` e `expect(row.situacaoNfe).toBeNull()`.
  4. Adicionar 1 teste novo no mesmo describe: `notaInfo` com `empresaId: null` (nota sem
     empresa) -> `row.empresaId` null e `row.situacaoNfe` propagado.
- **Verificar:** `npx jest src/worker/fatos/fato-nota-fiscal-item.test.ts` -> FALHA (o mapper
  ainda nao popula `empresaId`/`situacaoNfe`).
- **Resultado:** teste vermelho que fixa o contrato dos 2 campos novos no mapper.

### A7. Ajustar a interface e o mapper do builder
- **Arquivo:** `src/worker/fatos/fato-nota-fiscal-item.ts`.
- **Fazer:**
  1. `FatoNotaFiscalItemRow` (interface, linhas 28-46): apos `entradaSaida: string | null;`
     adicionar `empresaId: number | null;` e `situacaoNfe: string | null;`.
  2. `NotaInfo` (interface, linhas 48-51): apos `entradaSaida: string | null;` adicionar
     `empresaId: number | null;` e `situacaoNfe: string | null;`.
  3. `mapNotaFiscalItemRow` (objeto de retorno, linhas 77-94): apos
     `entradaSaida: notaInfo?.entradaSaida ?? null,` adicionar
     `empresaId: notaInfo?.empresaId ?? null,` e `situacaoNfe: notaInfo?.situacaoNfe ?? null,`.
  4. `rebuildFatoNotaFiscalItem` (loop de montagem do `notaInfoMap`, linhas 122-131): dentro do
     `notaInfoMap.set(odooId, {...})` adicionar, ao lado de `dataEmissao`/`entradaSaida`:
     `empresaId: relId(data.empresa_id as OdooM2O),` (helper `relId` ja importado da linha 22) e
     `situacaoNfe: typeof data.situacao_nfe === "string" ? data.situacao_nfe : null,`.
     Os nomes `empresa_id` (M2O) e `situacao_nfe` (string) estao FIXADOS por A1, identicos ao
     builder do cabecalho `fato-nota-fiscal.ts` (linhas 64, 71).
- **Verificar:** `npx jest src/worker/fatos/fato-nota-fiscal-item.test.ts` -> VERDE;
  `npx tsc --noEmit`.
- **Resultado:** mapper popula os 4 campos desnormalizados; teste verde. (As colunas no banco
  so serao populadas no F-reprocesso, apos rebuild do worker.)

---

## BLOCO B , HELPERS `_shared`

> Fonte: SPEC 3.2, 3.5, 3.6, 5.1, 5.2. Ordem interna: B1 (types) antes de B2-B9, pois todos
> importam tipos. Estes helpers sao NOVOS sob `src/lib/metrics/_shared/` (o `mcp/lib/periodo.ts`
> existente e do envelope, nao se confunde).

### B1. Tipos compartilhados
- **Arquivo:** `src/lib/metrics/_shared/types.ts` (criar).
- **Fazer:** exportar:
  `FaturamentoInput = { periodoDe?: string; periodoAte?: string; empresaId?: number; limit?: number; offset?: number }`;
  `FaturamentoResultado = { totalNotas: number; valor: number }`;
  `FaturamentoEmpresaLinha = { empresaId: number | null; empresaNome: string | null; totalNotas: number; valor: number }`;
  `EmpresaResolucao = { status: 'unica'; empresa: { odooId: number; nome: string; cnpj: string | null; tipo: string } } | { status: 'ambigua'; candidatas: Array<{ odooId: number; nome: string; cnpj: string | null; tipo: string }> } | { status: 'nenhuma' }`.
- **Verificar:** `npx tsc --noEmit`.
- **Resultado:** tipos disponiveis para todos os modulos.

### B2. TESTE de `buildPeriodoWhere` (TDD)
- **Arquivo:** `src/lib/metrics/_shared/periodo.test.ts` (criar).
- **Fazer:** casos:
  (a) ambos ausentes -> `{}`;
  (b) `de='2026-01-01'`, `ate='2026-01-31'` -> `{ dataEmissao: { gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2026-02-01T00:00:00Z') } }` (borda exclusiva, +1 dia UTC sobre `ate`);
  (c) `ate` no fim de mes (`2026-02-28`) -> `lt` = `new Date('2026-03-01T00:00:00Z')`;
  (d) **so `de` presente -> `{}`; so `ate` presente -> `{}`** (decisao fechada: exige o par
  completo; igual ao comportamento do `fiscal.ts` legado). Sem indecisao no corpo do teste.
- **Verificar:** `npx jest src/lib/metrics/_shared/periodo.test.ts` -> FALHA.
- **Resultado:** teste vermelho fixando borda exclusiva e o tratamento de par incompleto.

### B3. Implementar `buildPeriodoWhere`
- **Arquivo:** `src/lib/metrics/_shared/periodo.ts` (criar).
- **Fazer:** `buildPeriodoWhere(de?: string, ate?: string)`: se NAO ambos presentes, retorna
  `{}`. Se ambos: `const ateMais1 = new Date(\`${ate}T00:00:00Z\`); ateMais1.setUTCDate(ateMais1.getUTCDate() + 1);`
  e retorna `{ dataEmissao: { gte: new Date(\`${de}T00:00:00Z\`), lt: ateMais1 } }`.
- **Verificar:** `npx jest .../periodo.test.ts` -> VERDE; `npx tsc --noEmit`.
- **Resultado:** helper de periodo unico, borda exclusiva.

### B4. TESTE de `buildEmpresaWhere` e `buildEmpresaSqlFragment` (TDD)
- **Arquivo:** `src/lib/metrics/_shared/empresa.test.ts` (criar).
- **Fazer:** `buildEmpresaWhere(undefined) -> {}`; `buildEmpresaWhere(7) -> { empresaId: 7 }`.
  `buildEmpresaSqlFragment(undefined, 'nf', 3) -> { sql: '', params: [] }`;
  `buildEmpresaSqlFragment(7, 'nf', 3) -> { sql: 'AND nf.empresa_id = $3', params: [7] }`
  (alias e paramIndex parametrizados, SPEC 5.1, assinatura de 3 args).
- **Verificar:** `npx jest .../empresa.test.ts` -> FALHA.
- **Resultado:** teste vermelho dos dois helpers de empresa.

### B5. Implementar `buildEmpresaWhere` e `buildEmpresaSqlFragment`
- **Arquivo:** `src/lib/metrics/_shared/empresa.ts` (criar, parcial; `resolverEmpresa` vem em B7).
- **Fazer:** `buildEmpresaWhere(empresaId?: number)`: `{}` se ausente, `{ empresaId }` se presente.
  `buildEmpresaSqlFragment(empresaId: number | undefined, alias: string, paramIndex: number)`:
  `{ sql: '', params: [] }` se ausente, senao
  `{ sql: \`AND ${alias}.empresa_id = $${paramIndex}\`, params: [empresaId] }`.
- **Verificar:** `npx jest .../empresa.test.ts` -> VERDE; `npx tsc --noEmit`.
- **Resultado:** helpers Prisma e SQL de empresa (assinatura de 3 args, divergente da SPEC 5.1
  que ficou com 2 args desatualizada; o plano e a fonte: 3 args, porque E12/E13 usam aliases
  diferentes).

### B6. TESTE de `resolverEmpresa` (TDD)
- **Arquivo:** `src/lib/metrics/_shared/empresa.resolver.test.ts` (criar).
- **Fazer:** com `prisma` mockado sobre `dimEmpresaGrupo` (SPEC 5.2):
  (a) ref so digitos `<=9` chars e existe como `odooId` -> `status:'unica'`;
  (b) ref 14 digitos -> compara so digitos do CNPJ (imune a mascara) -> `unica`;
  (c) ref texto que casa 1 por `contains` insensitive -> `unica`;
  (d) ref texto que casa 2+ -> `ambigua` com `candidatas` (top 3);
  (e) ref texto sem match -> `nenhuma`;
  (f) ref so digitos `<=9` que nao existe como odooId -> cai para match por nome (sem match) -> `nenhuma`.
  Documentar no cabecalho de `resolverEmpresa` que refs de 10-13 digitos (e >14) caem no ramo
  texto (match por nome), por isso so resolvem se o nome for textual; faixa coberta de odooId e
  ate 9 digitos (Int32).
- **Verificar:** `npx jest .../empresa.resolver.test.ts` -> FALHA.
- **Resultado:** teste vermelho do resolvedor, com a faixa de digitos documentada.

### B7. Implementar `resolverEmpresa`
- **Arquivo:** `src/lib/metrics/_shared/empresa.ts` (completar).
- **Fazer:** `resolverEmpresa(prisma, ref: string): Promise<EmpresaResolucao>`: `ref.trim()`.
  Se `/^\d{1,9}$/`: `findUnique` por `odooId`; achou -> `unica`; nao achou -> cai para match por
  nome (mesmo caminho do ramo texto). Se `/^\d{14}$/`: `findMany` e filtrar em memoria por
  `(c.cnpj ?? '').replace(/\D/g,'') === ref` (mesmo padrao de `fiscal.ts` linha ~333) -> 1 match
  `unica`. Senao (texto): `findMany({ where: { nome: { contains: ref, mode: 'insensitive' } } })`;
  1 -> `unica`; >1 -> `ambigua` (candidatas top 3); 0 -> `nenhuma`. Sempre projetar
  `{ odooId, nome, cnpj, tipo }`.
- **Verificar:** `npx jest .../empresa.resolver.test.ts` -> VERDE; `npx tsc --noEmit`.
- **Resultado:** resolvedor texto->empresa completo (so a entidade empresa, sem Levenshtein).

### B8. TESTE de `_shared/naturezas.ts` (TDD)
- **Arquivo:** `src/lib/metrics/_shared/naturezas.test.ts` (criar).
- **Fazer:** testar `idsNaoVenda(prisma)` (mock de `fatoNotaFiscal.findMany` retornando distintos
  de `{ naturezaOperacaoId, naturezaOperacaoNome }`): nomes contendo `devolu`, `transfer`,
  `retorno`, `remessa`, `bonifica`, `comodato`, `demonstra` (case-insensitive, sem acento) ->
  seus ids entram na lista nao-venda; nome `Venda de mercadoria` -> nao entra; nome com acento
  (`Devolução`) -> entra (normalizacao remove acento). Testar `NATUREZAS_NAO_VENDA_TERMOS` exporta
  a lista esperada. Testar `buildNaturezaVendaWhere([1,2]) -> { naturezaOperacaoId: { notIn: [1,2] } }`
  e `buildNaturezaVendaWhere([]) -> {}`.
- **Verificar:** `npx jest .../naturezas.test.ts` -> FALHA.
- **Resultado:** teste vermelho da classificacao.

### B9. Implementar `_shared/naturezas.ts`
- **Arquivo:** `src/lib/metrics/_shared/naturezas.ts` (criar).
- **Fazer:** exportar `NATUREZAS_NAO_VENDA_TERMOS = ['devolu','transfer','retorno','remessa','bonifica','comodato','demonstra']`.
  `normalizar(s)` = lowercase + `normalize('NFD').replace(/\p{Diacritic}/gu,'')`.
  `idsNaoVenda(prisma): Promise<number[]>`: `findMany({ select: { naturezaOperacaoId: true, naturezaOperacaoNome: true }, distinct: ['naturezaOperacaoId'] })`,
  filtrar os cujo nome normalizado contem algum termo, devolver ids nao nulos.
  `buildNaturezaVendaWhere(idsNaoVenda: number[])`:
  `idsNaoVenda.length ? { naturezaOperacaoId: { notIn: idsNaoVenda } } : {}` (SPEC 3.6).
  NAO exportar `NATUREZAS_NAO_VENDA_WHERE` como objeto estatico (depende do prisma); o where e
  construido por chamada via `buildNaturezaVendaWhere`.
- **Verificar:** `npx jest .../naturezas.test.ts` -> VERDE; `npx tsc --noEmit`.
- **Resultado:** classificacao venda/nao-venda por ids, robusta a acento.

---

## BLOCO C , 11 METRICAS CANONICAS (TDD, teste e impl SEPARADOS) + spike recebido

> Fonte: SPEC 3.3 (padrao do modulo), 4.0-4.9. Cada metrica = 1 task de teste (vermelho) + 1
> task de impl (verde). Toda funcao e pura/assincrona, recebe `(prisma, input)`, devolve
> resultado cru, com cabecalho de regra canonica em comentario. Sem envelope/freshness dentro
> do modulo. Cada teste usa prisma mockado (`aggregate`/`count`/`findMany`/`groupBy` conforme a
> metrica).

### C0. SPIKE bloqueante do elo recebido (provar o caminho no schema E no dado)
- **Arquivo:** N/A (SQL no cache + leitura de schema).
- **Fazer:** confirmar a ponte real do "recebido por pedido", porque a SPEC 4.9 descreve um
  caminho que NAO existe (diz "parcela com `finanLancamentoId` cujo TITULO esta baixado/pago",
  mas `FatoFinanceiroTitulo` NAO tem `lancamentoId` nem `pedidoId`). O caminho REAL no schema e:
  `FatoPedidoParcela.finanLancamentoId @map("finan_lancamento_id")` ->
  `FatoFinanceiroLancamentoItem.lancamentoId @map("lancamento_id")`, e o "recebido" e
  `FatoFinanceiroLancamentoItem.vrPagoTotal` (e/ou `vrSaldo`). Provar no dado:
  1. `SELECT COUNT(*) FROM fato_pedido_parcela WHERE finan_lancamento_id IS NOT NULL;` (quantas
     parcelas tem lancamento).
  2. `SELECT COUNT(*) FROM fato_pedido_parcela p JOIN fato_financeiro_lancamento_item li ON li.lancamento_id = p.finan_lancamento_id;`
     (a ponte casa de fato).
  3. `SELECT SUM(li.vr_pago_total), SUM(li.vr_saldo) FROM fato_financeiro_lancamento_item li WHERE li.pedido_id IS NOT NULL;`
     (o sinal de recebido por pedido existe e e nao trivial).
  Decidir aqui: a metrica usa `FatoFinanceiroLancamentoItem.lancamentoId` como ponte (via
  `finanLancamentoId` da parcela) E/OU `FatoFinanceiroLancamentoItem.pedidoId` direto. Se a
  ponte (2) casar pouco/nada, o eixo "recebido por pedido" tambem vira gap honesto (e C15/C16
  entregam SO o eixo "faturado por pedido" + gap em recebido). Registrar o veredito.
- **Verificar:** os 3 SELECTs rodam; o caminho de recebido esta provado OU classificado como gap.
- **Resultado:** premissa estrutural do recebido resolvida ANTES de codar C15/C16; corrige a
  SPEC 4.9 (titulo -> lancamento item). Se nem a ponte de lancamento casar, recebido vira gap.

### C1. TESTE `faturamento-autorizado` (venda)
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-autorizado.test.ts` (criar).
- **Fazer:** mockar `prisma.fatoNotaFiscal.aggregate` (`_sum.vrNf`) e `count`; assertar que o
  `where` passado contem `entradaSaida:'1'`, `situacaoNfe:'autorizada'`,
  `naturezaOperacaoId:{ notIn: [...] }` (via `idsNaoVenda` mockado), o periodo de
  `buildPeriodoWhere`, e `empresaId` quando `input.empresaId` presente. Saida `{ totalNotas, valor }`.
- **Verificar:** `npx jest .../faturamento-autorizado.test.ts` -> FALHA.
- **Resultado:** teste vermelho da metrica base.

### C2. Implementar `faturamento-autorizado`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-autorizado.ts` (criar).
- **Fazer:** seguir o esqueleto da SPEC 3.3: cabecalho canonico (fonte `fato_nota_fiscal`,
  filtro saida autorizada + nao-venda excluida, data `dataEmissao`, valor `SUM(vrNf)`, exclui
  canceladas/nao-autorizadas/devolucao/transferencia). Resolver `idsNaoVenda(prisma)`, montar
  `where` com `buildPeriodoWhere` + `buildEmpresaWhere` + `buildNaturezaVendaWhere`, rodar
  `aggregate({ _sum: { vrNf } })` + `count` em `Promise.all`, retornar
  `{ totalNotas, valor: Number(agg._sum.vrNf ?? 0) }`.
- **Verificar:** `npx jest .../faturamento-autorizado.test.ts` -> VERDE; `npx tsc --noEmit`.
- **Resultado:** a definicao canonica de "faturamento" do dono, em codigo.

### C3. TESTE `faturamento-autorizado-total` (toda saida autorizada)
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-autorizado-total.test.ts` (criar).
- **Fazer:** igual a C1 mas o `where` esperado NAO tem `naturezaOperacaoId:{notIn}` (SPEC 4.1b:
  nao aplica filtro de natureza). Saida `{ totalNotas, valor }`.
- **Verificar:** `npx jest .../faturamento-autorizado-total.test.ts` -> FALHA.
- **Resultado:** teste vermelho da parcela do fechamento.

### C4. Implementar `faturamento-autorizado-total`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-autorizado-total.ts` (criar).
- **Fazer:** identica a C2 sem `buildNaturezaVendaWhere`. Cabecalho: "toda saida autorizada
  (venda + devolucao + transferencia), parcela do fechamento 1.2".
- **Verificar:** `npx jest .../faturamento-autorizado-total.test.ts` -> VERDE; `tsc`.
- **Resultado:** parcela `AUTORIZADO_TOTAL` do fechamento.

### C5. TESTE `faturamento-bruto`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-bruto.test.ts` (criar).
- **Fazer:** where esperado = `{ entradaSaida:'1', ...periodo, ...empresa }` (SEM `situacaoNfe`,
  SEM natureza, SPEC 4.2). Teste asserta que o where NAO tem `situacaoNfe` nem `naturezaOperacaoId`.
- **Verificar:** `npx jest .../faturamento-bruto.test.ts` -> FALHA.
- **Resultado:** teste vermelho do bruto.

### C6. Implementar `faturamento-bruto`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-bruto.ts` (criar).
- **Fazer:** where = `{ entradaSaida:'1', ...buildPeriodoWhere(...), ...buildEmpresaWhere(...) }`.
  `aggregate(_sum.vrNf)` + `count`. Cabecalho: "quanto tentamos faturar, todas as emitidas de saida".
- **Verificar:** `npx jest .../faturamento-bruto.test.ts` -> VERDE; `tsc`.
- **Resultado:** metrica BRUTO.

### C7. TESTE `faturamento-nao-autorizado` (com decomposicao por situacao)
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-nao-autorizado.test.ts` (criar).
- **Fazer:** SPEC 4.3b. Mockar `findMany({ select: { situacaoNfe, vrNf } })`. Assertar where =
  `{ entradaSaida:'1', ...periodo, ...empresa, OR: [ { situacaoNfe: { notIn: ['autorizada','cancelada'] } }, { situacaoNfe: null } ] }`.
  Teste cobre: `denegada`, `rejeitada`, `null` viram buckets nomeados; total = soma dos buckets.
  Saida `{ totalNotas, valor, porSituacao: [{ situacaoNfe, totalNotas, valor }] }`.
- **Verificar:** `npx jest .../faturamento-nao-autorizado.test.ts` -> FALHA.
- **Resultado:** teste vermelho da metrica nomeada.

### C8. Implementar `faturamento-nao-autorizado`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-nao-autorizado.ts` (criar).
- **Fazer:** `findMany({ select: { situacaoNfe, vrNf } })` (campo possivelmente nulo) +
  `Map<string|null,{totalNotas,valor}>` (padrao `cadastros.ts` linha 113, SPEC 3.4/9.9), NUNCA
  `groupBy`. Total = soma dos buckets. Saida com `porSituacao`.
- **Verificar:** `npx jest .../faturamento-nao-autorizado.test.ts` -> VERDE; `tsc`.
- **Resultado:** metrica nomeada com `porSituacao`, sem residuo por subtracao.

### C9. TESTE `impacto-cancelamentos`
- **Arquivo:** `src/lib/metrics/fiscal/impacto-cancelamentos.test.ts` (criar).
- **Fazer:** SPEC 4.3. Where esperado = `{ entradaSaida:'1', situacaoNfe:'cancelada', ...periodo, ...empresa }`.
  Saida `{ totalNotas, valor }`.
- **Verificar:** `npx jest .../impacto-cancelamentos.test.ts` -> FALHA.
- **Resultado:** teste vermelho.

### C10. Implementar `impacto-cancelamentos`
- **Arquivo:** `src/lib/metrics/fiscal/impacto-cancelamentos.ts` (criar).
- **Fazer:** `aggregate(_sum.vrNf)` + `count` sobre o where acima. Cabecalho registra a nota de
  data (emissao em jan, cancelada em mar conta em jan por `dataEmissao`).
- **Verificar:** `npx jest .../impacto-cancelamentos.test.ts` -> VERDE; `tsc`.
- **Resultado:** parcela de cancelamentos do fechamento.

### C11. TESTE `faturamento-entrada`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-entrada.test.ts` (criar).
- **Fazer:** SPEC 4.5. Where esperado = `{ entradaSaida:'0', situacaoNfe:'autorizada', ...periodo, ...empresa }`.
  Teste assegura `entradaSaida:'0'`. Saida `{ totalNotas, valor }`.
- **Verificar:** `npx jest .../faturamento-entrada.test.ts` -> FALHA.
- **Resultado:** teste vermelho.

### C12. Implementar `faturamento-entrada`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-entrada.ts` (criar).
- **Fazer:** `aggregate(_sum.vrNf)` + `count`. Cabecalho registra a armadilha: ENTRADA aqui sao
  notas proprias de compra (`fato_nota_fiscal`), NAO os DF-e (`fato_dfe`); a F1 nao soma as duas
  fontes.
- **Verificar:** `npx jest .../faturamento-entrada.test.ts` -> VERDE; `tsc`.
- **Resultado:** ENTRADA (compras proprias).

### C13. TESTE `faturamento-saida` (delega autorizado)
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-saida.test.ts` (criar).
- **Fazer:** SPEC 4.4. Spy/mock no modulo `faturamento-autorizado`; assegurar que
  `faturamentoSaida(prisma, input)` chama `faturamentoAutorizado(prisma, input)` e retorna o
  resultado identico, sem SQL proprio.
- **Verificar:** `npx jest .../faturamento-saida.test.ts` -> FALHA.
- **Resultado:** teste vermelho da delegacao.

### C14. Implementar `faturamento-saida`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-saida.ts` (criar).
- **Fazer:** importar e DELEGAR `faturamentoAutorizado(prisma, input)`. Existe so para parear
  com ENTRADA. Cabecalho deixa claro.
- **Verificar:** `npx jest .../faturamento-saida.test.ts` -> VERDE; `tsc`.
- **Resultado:** SAIDA = autorizado (venda), via delegacao, sem duplicacao.

### C15. TESTE `faturamento-por-empresa`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-por-empresa.test.ts` (criar).
- **Fazer:** SPEC 4.6. Mock `fatoNotaFiscal.findMany({ select: { empresaId, vrNf, empresaNome } })`
  com varias empresas + linhas `empresaId=null`. Mock `dimEmpresaGrupo.findMany` para resolver
  nomes. Assertar: agrupamento SO por `empresaId` (`Map<number|null,...>`), linha `null` vira
  bucket "sem empresa", nome resolvido por `odooId` na dim com fallback para `empresaNome` mais
  recente do fato; saida = lista `{ empresaId, empresaNome, totalNotas, valor }` ordenada por
  `valor` desc com a linha null por ultimo, mais
  `{ totalGrupo, empresasComFaturamento, valorSemEmpresa, totalNotasSemEmpresa }`. NAO recebe
  filtro de empresa.
- **Verificar:** `npx jest .../faturamento-por-empresa.test.ts` -> FALHA.
- **Resultado:** teste vermelho do comparativo de filiais.

### C16. Implementar `faturamento-por-empresa`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-por-empresa.ts` (criar).
- **Fazer:** resolver `idsNaoVenda`,
  `findMany({ where: { entradaSaida:'1', situacaoNfe:'autorizada', ...buildNaturezaVendaWhere(...), ...buildPeriodoWhere(...) }, select: { empresaId, vrNf, empresaNome } })`.
  Agregar em `Map<number|null,{totalNotas,valor,empresaNomeFato}>`. Segundo passo:
  `dimEmpresaGrupo.findMany({ where: { odooId: { in: idsNaoNulos } }, select: { odooId, nome } })`,
  montar nome por `odooId` com fallback ao `empresaNome` do fato. Ordenar valor desc, null por
  ultimo. Computar agregados. Cabecalho: "NUNCA agrupar pelo par (empresaId, empresaNome)".
- **Verificar:** `npx jest .../faturamento-por-empresa.test.ts` -> VERDE; `tsc`.
- **Resultado:** metrica do comparativo de filiais, com linha null destacada.

### C17. TESTE `faturamento-por-operacao` (natureza + flag ehVenda)
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-por-operacao.test.ts` (criar).
- **Fazer:** SPEC 4.7. Where = saida autorizada SEM excluir nao-venda. Agrupa por
  `naturezaOperacaoId` (possivelmente nulo) -> `findMany` + `Map` (NAO groupBy). Nome em 2o
  passo. Flag `ehVenda` vem de `idsNaoVenda`. Saida: lista `{ naturezaOperacaoId,
  naturezaOperacaoNome, ehVenda, totalNotas, valor }` ordenada valor desc, mais
  `{ total, valorGeral, valorVenda, valorNaoVenda }`. Teste: `valorGeral` == soma de tudo,
  `valorVenda` == soma das `ehVenda=true`. Ranking trava em `limit`.
- **Verificar:** `npx jest .../faturamento-por-operacao.test.ts` -> FALHA.
- **Resultado:** teste vermelho da decomposicao por natureza.

### C18. Implementar `faturamento-por-operacao`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-por-operacao.ts` (criar).
- **Fazer:** conforme C17. Aceita `empresaId` (filtro).
  `findMany({ select: { naturezaOperacaoId, naturezaOperacaoNome, vrNf } })`, `Map` por id,
  resolver nome (fallback ao desnormalizado, nao depender de JOIN com `raw_sped_natureza_operacao`,
  SPEC armadilha 4.7), marcar `ehVenda = !idsNaoVenda.includes(id)`, ordenar, aplicar
  `limit/offset`, agregados.
- **Verificar:** `npx jest .../faturamento-por-operacao.test.ts` -> VERDE; `tsc`.
- **Resultado:** natureza decomposta, fecha com 4.1b/4.1 exato.

### C19. TESTE `faturamento-por-cfop` (sobre item, groupBy no banco)
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-por-cfop.test.ts` (criar).
- **Fazer:** SPEC 4.8. Fonte `fato_nota_fiscal_item`. Where esperado = `{ entradaSaida:'1',
  situacaoNfe:'autorizada', ...periodo(dataEmissao item), ...empresa(empresaId item) }` (todos
  desnormalizados no item gracas ao Bloco A). Agrupa por `cfopId` via
  `groupBy({ by: ['cfopId'], _sum: { vrNf }, _count: true })` (chave raramente nula, SPEC 3.4),
  linha `cfopId=null` tratada como "sem CFOP". Valor = `SUM(item.vrNf)` (rateado). Nome em 2o
  passo. Saida: lista `{ cfopId, cfopNome, totalLinhas, valor }` valor desc, mais
  `{ total, valorGeral }`. Ranking trava em `limit`. Teste mocka `groupBy`.
- **Verificar:** `npx jest .../faturamento-por-cfop.test.ts` -> FALHA.
- **Resultado:** teste vermelho do CFOP por item.

### C20. Implementar `faturamento-por-cfop`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-por-cfop.ts` (criar).
- **Fazer:** conforme C19. `prisma.fatoNotaFiscalItem.groupBy`. Resolver `cfopNome` em 2o passo
  (pelo `cfopNome` do proprio item mais recente por `cfopId`, ou findMany distinto). Cabecalho
  registra: usa `item.vrNf` (rateado, nunca cabecalho x num itens); fechamento por TOLERANCIA,
  nao exato (SPEC 4.8/9.1); CFOP saida = `5/6/7.xxx`, entrada = `1/2/3.xxx` (corrige o "9.xxx"
  errado do dossie 6.8). Filtro `entradaSaida='1'` separa saida.
- **Verificar:** `npx jest .../faturamento-por-cfop.test.ts` -> VERDE; `tsc`.
- **Resultado:** CFOP por empresa direto no item, sem `documentoId IN (...)`.

### C21. TESTE `faturamento-recebido` (por pedido real + gap no eixo nota)
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-recebido.test.ts` (criar).
- **Fazer:** SPEC 4.9 corrigida pelo spike C0. Mockar `fatoPedido` (`empresaId`, `vrNf`),
  `fatoPedidoParcela` (`pedidoId`, `parcelaFaturada`, `finanLancamentoId`) e
  `fatoFinanceiroLancamentoItem` (`lancamentoId`, `pedidoId`, `vrPagoTotal`, `vrSaldo`). Testar:
  (a) eixo PEDIDO: "faturado" = soma de parcelas `parcelaFaturada=true`; "recebido" = soma de
  `vrPagoTotal` dos `FatoFinanceiroLancamentoItem` ligados via
  `parcela.finanLancamentoId == lancamentoItem.lancamentoId` (ponte REAL provada no C0), por
  empresa via `FatoPedido.empresaId`, rotulado "por pedido, nao por nota individual";
  (b) eixo NOTA individual: retorna estado de gap honesto (sem `notaId` no pedido) ->
  `{ disponivelPorPedido: true, disponivelPorNota: false, gap: '...' }`, NUNCA numero por nota;
  (c) proxy por participante so se habilitado.
- **Verificar:** `npx jest .../faturamento-recebido.test.ts` -> FALHA.
- **Resultado:** teste vermelho do elo, com a ponte correta (lancamento item) e gap no eixo nota.

### C22. Implementar `faturamento-recebido`
- **Arquivo:** `src/lib/metrics/fiscal/faturamento-recebido.ts` (criar).
- **Fazer:** entregar SO o que a ponte `pedido->financeiro` provada no C0 habilita: faturado vs
  recebido por pedido (e por empresa), via `FatoPedidoParcela.finanLancamentoId ->
  FatoFinanceiroLancamentoItem.lancamentoId` (`vrPagoTotal`). Marcar o eixo NOTA como gap, sem
  chutar. Proxy por participante DESLIGADO por padrao (so liga se o E2E G5 provar que
  `participanteId` bate entre `fato_nota_fiscal` e `fato_financeiro_titulo`). Cabecalho documenta
  o campo que falta para a Fase 2 (`pedidoId`/`chaveNfe` em `fato_nota_fiscal`) E corrige a SPEC
  4.9: o "recebido" vem de `FatoFinanceiroLancamentoItem` (que tem `lancamentoId`/`pedidoId`/
  `vrPagoTotal`), NUNCA de `FatoFinanceiroTitulo` (que nao tem `lancamentoId` nem `pedidoId`).
- **Verificar:** `npx jest .../faturamento-recebido.test.ts` -> VERDE; `tsc`.
- **Resultado:** metrica honesta: por-pedido real (ponte de lancamento item), gap no eixo nota.

### C23. Barrel `index.ts` das metricas
- **Arquivo:** `src/lib/metrics/fiscal/index.ts` + `src/lib/metrics/index.ts` (criar).
- **Fazer:** `fiscal/index.ts` re-exporta EXATAMENTE estas 11 funcoes (uma por modulo):
  `faturamentoAutorizado`, `faturamentoAutorizadoTotal`, `faturamentoBruto`,
  `faturamentoNaoAutorizado`, `impactoCancelamentos`, `faturamentoSaida`, `faturamentoEntrada`,
  `faturamentoPorEmpresa`, `faturamentoPorOperacao`, `faturamentoPorCfop`, `faturamentoRecebido`.
  `metrics/index.ts` re-exporta `./fiscal` e `./_shared/types`.
- **Verificar:** `npx tsc --noEmit`; `import { faturamentoAutorizado } from '@/lib/metrics/fiscal'`
  compila; conferir que as 11 ids estao listadas.
- **Resultado:** ponto unico de import das metricas (11 exports nominais).

---

## BLOCO D , 5 TOOLS MCP NOVAS

> Fonte: SPEC 3.8, 6, 7.1, 7.3. Padrao de tool: SPEC 3.8 + modelo real
> `mcp/tools/fiscal/faturamento-periodo.ts` (linhas 1-79) e paginacao em
> `faturamento-por-cliente.ts`. Toda tool nova: `dominio: "fiscal"`; resolve `empresaRef` no
> handler ANTES da metrica; injeta `escopoEmpresa`; `withFreshness` + `enriquecerEnvelope`.
> Cada tool com `*.test.ts`.

### D0a. TESTE do helper de escopo (ramo grupo)
- **Arquivo:** `mcp/tools/fiscal/_escopo-empresa.test.ts` (criar).
- **Fazer:** testar `montarEscopoEmpresa(prisma, undefined, recorte)` (sem `empresaRef`):
  retorna `escopoEmpresa: { tipo:'grupo', empresasComFaturamento: M, empresasCadastradas: N,
  valorSemEmpresa: X, aviso }`. **Decisao de fonte fechada:** `N = dimEmpresaGrupo.count({ where: { ativo: true } })`;
  `M` e `X` SAO DERIVADOS DO RESULTADO de `faturamentoPorEmpresa` (mesma metrica C16, fonte
  unica): `M` = numero de linhas com `empresaId != null` e `valor > 0`; `X` = a linha
  `empresaId=null` (`valorSemEmpresa`). NAO fazer `findMany` distinto separado (evita 2 fontes).
  Mock de `faturamentoPorEmpresa` e de `dimEmpresaGrupo.count`.
- **Verificar:** `npx jest mcp/tools/fiscal/_escopo-empresa.test.ts` -> FALHA.
- **Resultado:** teste vermelho do ramo grupo, com fonte de M/X decidida (resultado de por-empresa).

### D0b. TESTE + impl do helper de escopo (ramos unica/ambigua/nenhuma) e impl do grupo
- **Arquivo:** `mcp/tools/fiscal/_escopo-empresa.ts` (criar).
- **Fazer:** `montarEscopoEmpresa(prisma, empresaRef?, recorte)`:
  - sem `empresaRef`: ramo grupo (D0a), `M`/`X` do resultado de `faturamentoPorEmpresa`,
    `N` de `dimEmpresaGrupo.count({ where: { ativo: true } })`.
  - com `empresaRef`: chama `resolverEmpresa`: `unica` -> `{ empresaId, escopoEmpresa: { tipo:'empresa', empresaId, empresaNome, cnpj, aviso } }`;
    `ambigua` -> sinal de desambiguacao (`candidatas`); `nenhuma` -> aviso + roda como grupo.
  Estender o `.test.ts` com os 3 ramos (unica, ambigua, nenhuma) e o ramo grupo verde.
- **Verificar:** `npx jest mcp/tools/fiscal/_escopo-empresa.test.ts` -> VERDE; `tsc`.
- **Resultado:** logica de escopo/aviso centralizada, reusada por D1-D5 e Bloco E.

### D1. TESTE + tool `faturamento-por-empresa` (comparativo, gated)
- **Arquivos:** `mcp/tools/fiscal/faturamento-por-empresa.ts` + `.test.ts` (criar). (TESTE
  primeiro -> vermelho; depois a tool -> verde, dentro desta task.)
- **Fazer:** `id: "fiscal_faturamento_por_empresa"`, `dominio: "fiscal"`,
  `gatedRoles: ['admin','super_admin']` (SPEC 4.6/7.3). `inputSchema`: `periodoDe?`, `periodoAte?`
  (NAO recebe `empresaRef`). Handler chama metrica `faturamentoPorEmpresa`, embrulha em
  `withFreshness(['fato_nota_fiscal'])` + `enriquecerEnvelope`. Lista TODAS (~20<50). Teste
  assegura `gatedRoles` presente, linha null exibida, agregados no envelope.
- **Verificar:** `npx jest mcp/tools/fiscal/faturamento-por-empresa.test.ts` -> VERDE; `tsc`.
- **Resultado:** tool de comparativo de filiais, restrita a admin/super_admin.

### D2. TESTE + tool `faturamento-por-operacao`
- **Arquivos:** `mcp/tools/fiscal/faturamento-por-operacao.ts` + `.test.ts`.
- **Fazer:** `id: "fiscal_faturamento_por_operacao"`, `dominio: "fiscal"` (sem gate).
  `inputSchema`: `periodoDe?`, `periodoAte?`, `empresaRef?`, `...paginacaoInputShape`. Handler:
  `montarEscopoEmpresa` -> `empresaId`; chama `faturamentoPorOperacao`; injeta `escopoEmpresa`,
  `ehVenda` por linha, `valorVenda/valorNaoVenda` no envelope. Trava em N via
  `resolverPaginacao`/`montarPaginacaoMeta`. `withFreshness(['fato_nota_fiscal'])`.
- **Verificar:** `npx jest .../faturamento-por-operacao.test.ts` -> VERDE; `tsc`.
- **Resultado:** tool de natureza com escopo de empresa.

### D3. TESTE + tool `faturamento-por-cfop`
- **Arquivos:** `mcp/tools/fiscal/faturamento-por-cfop.ts` + `.test.ts`.
- **Fazer:** `id: "fiscal_faturamento_por_cfop"`, `dominio: "fiscal"`. Input igual a D2.
  Handler: escopo -> `empresaId`; metrica `faturamentoPorCfop`;
  `withFreshness(['fato_nota_fiscal','fato_nota_fiscal_item'])`. Aviso no envelope: usa
  `item.vrNf` rateado, fechamento por tolerancia. Trava em N. (Teste passa com mock; numeros
  reais so apos F-reprocesso popular as colunas do item.)
- **Verificar:** `npx jest .../faturamento-por-cfop.test.ts` -> VERDE; `tsc`.
- **Resultado:** tool de CFOP por empresa (numeros reais so apos F-reprocesso).

### D4. TESTE + tool `faturamento-nao-autorizado`
- **Arquivos:** `mcp/tools/fiscal/faturamento-nao-autorizado.ts` + `.test.ts`.
- **Fazer:** `id: "fiscal_faturamento_nao_autorizado"`, `dominio: "fiscal"`. Input: `periodoDe?`,
  `periodoAte?`, `empresaRef?`. Handler: escopo -> `empresaId`; metrica `faturamentoNaoAutorizado`;
  expoe `porSituacao` no `dados`. `withFreshness(['fato_nota_fiscal'])`.
- **Verificar:** `npx jest .../faturamento-nao-autorizado.test.ts` -> VERDE; `tsc`.
- **Resultado:** tool com decomposicao por situacao.

### D5. TESTE + tool `faturamento-recebido` (contrato de gap FIXADO)
- **Arquivos:** `mcp/tools/fiscal/faturamento-recebido.ts` + `.test.ts`.
- **Fazer:** `id: "fiscal_faturamento_recebido"`, `dominio: "fiscal"`. Input: `periodoDe?`,
  `periodoAte?`, `empresaRef?`, `eixo?: 'pedido'|'nota'` (default `'pedido'`). Handler: escopo ->
  `empresaId`; metrica `faturamentoRecebido`. **Contrato do eixo `nota` FIXADO:** a tool retorna
  um **envelope de gap honesto** (`{ disponivelPorPedido: true, disponivelPorNota: false, gap: '...' }`)
  e **NAO grava nada** em `feature_requests`. O registro de lacuna e responsabilidade do AGENTE,
  que chama a tool `registrar_lacuna` (`mcp/tools/caminho3/registrar-lacuna.ts`, que grava via
  `ctx.prisma.featureRequest.createMany`) como passo separado (Caminho 3a). A tool de faturamento
  NUNCA chama `featureRequest` por dentro nem chuta numero por nota. Teste assegura: eixo
  `pedido` -> numero real rotulado "por pedido"; eixo `nota` -> envelope de gap, sem `prisma.featureRequest`
  chamado. `withFreshness` sobre as tabelas do elo.
- **Verificar:** `npx jest .../faturamento-recebido.test.ts` -> VERDE; `tsc`.
- **Resultado:** tool de recebido (por pedido real + gap no eixo nota, sem auto-gravar lacuna).

### D6. Registrar as 5 tools no index fiscal
- **Arquivo:** `mcp/tools/fiscal/index.ts` (imports + array `fiscalTools`).
- **Fazer:** importar `fiscalFaturamentoPorEmpresa`, `fiscalFaturamentoPorOperacao`,
  `fiscalFaturamentoPorCfop`, `fiscalFaturamentoNaoAutorizado`, `fiscalFaturamentoRecebido`;
  adicionar as 5 ao array `fiscalTools` com cast `as ToolEntry`.
- **Verificar:** `npx tsc --noEmit`; um script que lista o catalogo mostra as 5 novas ids.
- **Resultado:** 5 tools registradas no catalogo fiscal.

### D7. Atualizar as contagens e listas de `integration.test.ts` (as 5 tools quebram os literais)
- **Arquivo:** `mcp/__tests__/integration.test.ts`.
- **Fazer:** as 5 tools novas quebram os literais existentes (`93`, `102`, `FISCAL_IDS`,
  `TODOS_IDS`, contagens por role). Aplicar:
  1. `FISCAL_IDS` (a partir da linha 151): adicionar as 5 ids
     (`fiscal_faturamento_por_empresa`, `fiscal_faturamento_por_operacao`,
     `fiscal_faturamento_por_cfop`, `fiscal_faturamento_nao_autorizado`,
     `fiscal_faturamento_recebido`). `TODOS_IDS` ja espalha `...FISCAL_IDS`, entao herda as 5.
  2. Catalogo bruto: `expect(catalogo).toHaveLength(102)` (linha 259) passa a `107` (102 + 5;
     comentario do bloco atualizado: 86 tools de leitura + 9 write = ... recontar e ajustar o
     comentario explicativo para bater).
  3. **super_admin e admin (gated incluido):** as 5 ids aparecem para admin/super_admin. A tool
     `por_empresa` tem `gatedRoles: ['admin','super_admin']`, e o `visibleTools` mostra tool
     gated para roles na lista (mesmo padrao de `bi_consulta_avancada`, confirmado em
     `mcp/catalog/registry.ts`). Logo super_admin/admin: `93 -> 98`. Atualizar TODOS os literais
     `93` ligados a super_admin/admin (linhas 236, 273, 281, 578) para `98`, e
     `ids.toHaveLength(93)` correlatos.
  4. **manager/viewer (NAO veem a gated, veem as 4 sem gate):** as 4 tools fiscais novas SEM
     gate sao de dominio `fiscal`. Conferir no fixture se manager/viewer recebem dominio
     `fiscal` (o fixture atual usa `["estoque","financeiro"]`): se NAO recebem fiscal, as 4 NAO
     entram nas contagens 29/15/20/6 e elas ficam inalteradas; so confirmar isso explicitamente
     no teste. Se o fixture conceder fiscal a algum role, somar +4 (nao +5, a gated nao conta)
     na contagem desse role. Decidir pela leitura do fixture e ajustar so o que muda.
  5. Rodar a suite inteira de `integration.test.ts` e zerar vermelhos de contagem.
- **Verificar:** `npx jest mcp/__tests__/integration.test.ts` -> VERDE.
- **Resultado:** contagens e listas do catalogo refletem as 5 tools novas e o gate de
  `por_empresa`, sem teste vermelho.

---

## BLOCO E , REFACTOR DAS TOOLS/QUERIES EXISTENTES

> Fonte: SPEC 3.7 (criterio de pronto, impede 2 fontes de verdade), 4.10, 7.2. Ordem: E1-E4
> (fiscal.ts delega para o canonico) antes de E5-E13 (tools consomem). Cada refactor mantem a
> logica que funciona, so troca a fonte do `where` e adiciona empresa/escopo.

### E1. `queryFaturamentoPeriodo` delega o where canonico (contrato de retorno FIXADO)
- **Arquivo:** `src/lib/reports/queries/fiscal.ts` (linhas 10-31).
- **Decisao de contrato (fechada):** `queryFaturamentoPeriodo` **MANTEM** a chave publica
  `valorFaturado` no objeto de retorno e a forma atual (`findMany`+reduce ou aggregate, como
  hoje). So troca a FONTE INTERNA do `where`. NAO renomeia para `valor` nem passa a delegar a
  `faturamentoAutorizado` no retorno (isso quebraria os 3 usos de `d.valorFaturado` em
  `mcp/tools/fiscal/faturamento-periodo.ts`, linhas 45-80). Assim a tool E5 nao precisa mexer no
  mapeamento de valor, so adicionar `empresaRef`/escopo.
- **Fazer:** trocar o `periodoWhere` inline (linhas 14-22, que usa `lte`) por
  `buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte)`; aplicar
  `buildNaturezaVendaWhere(await idsNaoVenda(prisma))` e `buildEmpresaWhere(filtros.empresaId)`
  ao `where` (assinatura ganha `empresaId?`). O retorno continua `{ totalNotas, valorFaturado }`.
  ATENCAO: o numero vai mudar onde houver devolucao/transferencia (SPEC 8.2.7), comportamento
  correto.
- **Verificar:** criar `src/lib/reports/queries/fiscal.test.ts` cobrindo o novo where (borda
  exclusiva + natureza + empresa) ANTES do refactor (TDD), depois `npx jest .../fiscal.test.ts`
  -> VERDE; `tsc`.
- **Resultado:** faturamento-periodo usa a definicao canonica (borda exclusiva, natureza de
  venda, empresa) sem mudar a chave publica `valorFaturado`.

### E2. `queryNotasEmitidas` usa o where canonico de saida autorizada
- **Arquivo:** `src/lib/reports/queries/fiscal.ts` (funcao `queryNotasEmitidas`).
- **Fazer:** trocar o `periodoWhere` inline por `buildPeriodoWhere`; manter `entradaSaida:'1'`
  via helper canonico. `queryNotasEmitidas` LISTA notas (nao so faturamento de venda): NAO
  aplicar `buildNaturezaVendaWhere` aqui. Adicionar `empresaId?` opcional via `buildEmpresaWhere`.
  Documentar no codigo o porque (lista != metrica de venda).
- **Verificar:** `npx jest .../notas-emitidas.test.ts` + `tsc`.
- **Resultado:** notas-emitidas com borda exclusiva e empresa, sem mudar a semantica de lista.

### E3. `queryFaturamentoPorCliente` ganha empresa + where canonico
- **Arquivo:** `src/lib/reports/queries/fiscal.ts` (funcao `queryFaturamentoPorCliente`).
- **Fazer:** assinatura ganha `empresaId?`; aplicar `buildPeriodoWhere` + `buildEmpresaWhere` +
  `buildNaturezaVendaWhere` (e "faturamento por cliente" = venda). Manter o agrupamento por
  cliente existente.
- **Verificar:** `npx jest .../faturamento-por-cliente.test.ts` + `tsc`.
- **Resultado:** faturamento-por-cliente com corte por empresa.

### E4. `queryProdutosFaturados` ganha empresa (mantem vrProdutos)
- **Arquivo:** `src/lib/reports/queries/fiscal.ts` (funcao `queryProdutosFaturados`).
- **Fazer:** assinatura ganha `empresaId?`; o filtro de empresa no item agora e DIRETO
  (`empresaId` desnormalizado pelo Bloco A), nao via `documentoId IN`. Trocar `periodoWhere`
  inline (hoje `lte`) por `buildPeriodoWhere`. MANTER `vrProdutos` (ranking de produto, SPEC 9.7),
  documentar no codigo a excecao consciente.
- **Verificar:** `npx jest .../produtos-faturados.test.ts` + `tsc`.
- **Resultado:** produtos-faturados por empresa, vrProdutos preservado e rotulado.

### E5. Tool `faturamento-periodo`: empresaRef + escopo
- **Arquivo:** `mcp/tools/fiscal/faturamento-periodo.ts` (linhas 9-79).
- **Fazer:** `inputSchema` ganha `empresaRef: z.string().trim().min(1).optional().describe(...)`.
  Handler chama `montarEscopoEmpresa` ANTES de `queryFaturamentoPeriodo` (passando `empresaId`
  resolvido); injeta `escopoEmpresa` no `shape()`; atualiza o texto de `aviso` para citar a
  exclusao de devolucao/transferencia (4.0). O mapeamento de `d.valorFaturado` (linhas 45-80)
  permanece intacto (E1 manteve a chave). Sem mexer no envelope/freshness (linhas 62-78).
- **Verificar:** `tsc` + criar `faturamento-periodo.test.ts` cobrindo escopo grupo vs empresa.
- **Resultado:** a tool mais usada ganha corte por empresa + aviso de escopo.

### E6. Tool `notas-emitidas`: empresaRef + escopo
- **Arquivo:** `mcp/tools/fiscal/notas-emitidas.ts`. Teste: `notas-emitidas.test.ts` (EXISTE).
- **Fazer:** mesmo movimento de E5 (adicionar `empresaRef`, resolver via `montarEscopoEmpresa`,
  injetar `escopoEmpresa`, manter envelope). Propagar `empresaId` para `queryNotasEmitidas`.
- **Verificar:** `npx jest mcp/tools/fiscal/notas-emitidas.test.ts` (estender com caso de
  empresa) + `tsc`.
- **Resultado:** notas-emitidas com escopo de empresa.

### E7. Tool `notas-recebidas`: empresaRef + escopo
- **Arquivo:** `mcp/tools/fiscal/notas-recebidas.ts`. Teste: `notas-recebidas.test.ts` (EXISTE).
- **Fazer:** igual a E6.
- **Verificar:** `npx jest mcp/tools/fiscal/notas-recebidas.test.ts` + `tsc`.
- **Resultado:** notas-recebidas com escopo de empresa.

### E8. Tool `faturamento-por-cliente`: empresaRef + escopo
- **Arquivo:** `mcp/tools/fiscal/faturamento-por-cliente.ts`. Teste:
  `faturamento-por-cliente.test.ts` (EXISTE).
- **Fazer:** igual a E6; propaga `empresaId` para `queryFaturamentoPorCliente` (E3).
- **Verificar:** `npx jest mcp/tools/fiscal/faturamento-por-cliente.test.ts` + `tsc`.
- **Resultado:** faturamento-por-cliente (tool) com escopo de empresa.

### E9. Tool `produtos-faturados`: empresaRef + escopo + aviso vrProdutos
- **Arquivo:** `mcp/tools/fiscal/produtos-faturados.ts`. Teste: `produtos-faturados.test.ts`
  (EXISTE).
- **Fazer:** igual a E6; propaga `empresaId` para `queryProdutosFaturados` (E4); adicionar ao
  `aviso`/envelope: "ranking usa vrProdutos (sem impostos)" (SPEC 9.7).
- **Verificar:** `npx jest mcp/tools/fiscal/produtos-faturados.test.ts` + `tsc`.
- **Resultado:** produtos-faturados (tool) com escopo de empresa e ressalva de valor.

### E10. Tool `impostos-periodo`: empresaRef + escopo (TESTE antes, pois nao existe)
- **Arquivo:** `mcp/tools/fiscal/impostos-periodo.ts`. Teste: `impostos-periodo.test.ts`
  (NAO EXISTE -> criar).
- **Fazer:** (a) criar `impostos-periodo.test.ts` cobrindo o handler com e sem `empresaRef`
  (escopo grupo vs empresa) -> vermelho; (b) editar a tool: adicionar `empresaRef`, resolver via
  `montarEscopoEmpresa`, injetar `escopoEmpresa`, propagar `empresaId` para a query de impostos.
- **Verificar:** `npx jest mcp/tools/fiscal/impostos-periodo.test.ts` -> VERDE; `tsc`.
- **Resultado:** impostos-periodo com escopo de empresa, coberto por teste novo.

### E11. Tool `faturamento-mensal-serie`: propagar empresaRef (delega periodo)
- **Arquivo:** `mcp/tools/fiscal/faturamento-mensal-serie.ts`. Teste:
  `faturamento-mensal-serie.test.ts` (verificar: se NAO existe, criar cobrindo a propagacao).
- **Fazer:** `inputSchema` ganha `empresaRef?`; resolver via `montarEscopoEmpresa`; propagar
  `empresaId` ao input de `queryFaturamentoPeriodo` (delega, SPEC 4.10; herda o realinhamento de
  E1 automaticamente). Injetar `escopoEmpresa`.
- **Verificar:** `npx jest mcp/tools/fiscal/faturamento-mensal-serie.test.ts` -> VERDE; `tsc`.
- **Resultado:** mensal-serie propaga empresa, herdando o where canonico de E1.

### E12a. TESTE `faturamento-por-marca` (fragment SQL, indice $4)
- **Arquivo:** `mcp/tools/fiscal/faturamento-por-marca.test.ts` (verificar: criar se nao existe).
- **Fazer:** teste do handler com e sem `empresaRef`. Sem empresa: SQL final sem `AND fnfi.empresa_id`.
  Com empresa: o `$queryRawUnsafe` recebe `AND fnfi.empresa_id = $4` concatenado no WHERE e `[..., empresaId]`
  nos params (o alias do item e `fnfi`; os params atuais sao `$1` periodoDe, `$2` periodoAte,
  `$3` limite, entao o fragment de empresa entra como `$4`).
- **Verificar:** `npx jest mcp/tools/fiscal/faturamento-por-marca.test.ts` -> FALHA.
- **Resultado:** teste vermelho do fragment com alias `fnfi` e parametro `$4`.

### E12b. Tool `faturamento-por-marca`: empresaRef via SQL fragment + ressalva vrProdutos
- **Arquivo:** `mcp/tools/fiscal/faturamento-por-marca.ts` (raw na linha ~59-69).
- **Fazer:** `inputSchema` ganha `empresaRef?`. Handler resolve empresa via `montarEscopoEmpresa`
  -> `empresaId`; chama `buildEmpresaSqlFragment(empresaId, 'fnfi', 4)` (alias do item `fnfi`,
  parametro `$4`), concatena `frag.sql` no WHERE e `frag.params` apos os 3 params atuais
  (`periodoDe`, `periodoAte`, `limite`). `LIMIT $3` continua. Declarar no `aviso`/envelope: "valor
  por marca usa vrProdutos (sem impostos), pode ser 5-30% menor que o faturamento autorizado;
  nao cruzar diretamente" (SPEC 4.10/9.7). O alias `fnfi` ja tem `empresa_id` (desnormalizado
  pelo Bloco A).
- **Verificar:** `npx jest mcp/tools/fiscal/faturamento-por-marca.test.ts` -> VERDE; `tsc`.
- **Resultado:** por-marca com empresa (alias `fnfi`, `$4`), ressalva de valor declarada.

### E13a. TESTE `faturamento-por-uf` (fragment SQL, indice $3, LIMIT interpolado)
- **Arquivo:** `mcp/tools/fiscal/faturamento-por-uf.test.ts` (verificar: criar se nao existe).
- **Fazer:** teste do handler com e sem `empresaRef`. ATENCAO: `por-uf` usa `$1::timestamp`
  (periodoDe), `$2::timestamp` (periodoAte) e `LIMIT ${limite}` INTERPOLADO (nao parametrizado),
  alias da nota `nf`. Logo o fragment de empresa entra como `$3` (proximo posicional livre). Com
  empresa: SQL recebe `AND nf.empresa_id = $3` e params `[..., empresaId]`.
- **Verificar:** `npx jest mcp/tools/fiscal/faturamento-por-uf.test.ts` -> FALHA.
- **Resultado:** teste vermelho do fragment com alias `nf` e parametro `$3`.

### E13b. Tool `faturamento-por-uf`: empresaRef via SQL fragment
- **Arquivo:** `mcp/tools/fiscal/faturamento-por-uf.ts` (raw na linha ~65-76, ja soma `vr_nf`).
- **Fazer:** `inputSchema` ganha `empresaRef?`. Handler resolve via `montarEscopoEmpresa` ->
  `empresaId`; `buildEmpresaSqlFragment(empresaId, 'nf', 3)` (alias da nota `nf`, parametro `$3`,
  pois `LIMIT ${limite}` e interpolado, nao consome `$N`). Concatena no WHERE. SEM ressalva de
  valor (ja soma `nf.vr_nf`, SPEC 4.10).
- **Verificar:** `npx jest mcp/tools/fiscal/faturamento-por-uf.test.ts` -> VERDE; `tsc`.
- **Resultado:** por-uf com empresa (alias `nf`, `$3`), sem ressalva.

### E14. Auditar criterio de pronto do refactor (SPEC 3.7)
- **Arquivo:** N/A (grep de verificacao).
- **Fazer:** `grep -rn 'entradaSaida: "1"' src/lib/reports/queries/fiscal.ts` e conferir que toda
  ocorrencia do filtro "saida autorizada" passa por helper canonico OU esta explicitamente
  justificada (lista, nao metrica de venda). Nenhuma clausula `lte` de periodo inline pode
  sobreviver nas funcoes de faturamento.
- **Verificar:** o grep nao encontra clausula inline orfa de periodo/saida-autorizada nas
  funcoes de faturamento.
- **Resultado:** zero duas-fontes-de-verdade; criterio 3.7 cumprido.

---

## BLOCO F , REBUILD DE CONTAINERS + REPROCESSO DO BUILDER

> Fonte: CLAUDE.md secao 2.1 (regra de raiz). Schema mudou (Bloco A) -> rebuildar TODOS; codigo
> de `src/lib/metrics`, `src/lib/reports/queries`, `mcp/**` mudou -> `mcp` + `app`(worker). O
> reprocesso do builder roda DEPOIS do rebuild do worker (worker so executa o codigo novo do
> Bloco A com a imagem nova).

### F1. Rebuild da imagem do app (atualiza app + worker)
- **Fazer:** `docker compose build app` (a imagem `nexus-odoo:local` carrega o worker, que NAO
  tem build proprio). Depois `docker compose up -d --force-recreate worker app`.
- **Verificar:** `docker image inspect nexus-odoo:local --format '{{.Created}}'` = agora;
  `docker inspect nexus-odoo-worker-1 --format '{{.State.StartedAt}}'` posterior ao ultimo commit
  dos blocos A/E. Conferir tambem dentro do container que o builder novo esta presente:
  `docker exec nexus-odoo-worker-1 grep -c "situacaoNfe" src/worker/fatos/fato-nota-fiscal-item.ts`
  retorna > 0.
- **Resultado:** worker e app com schema novo + codigo novo (worker pronto para o reprocesso).

### F2. Rebuild do mcp
- **Fazer:** `docker compose up -d --build mcp` (mcp tem build proprio).
- **Verificar:** `docker inspect nexus-odoo-mcp-1 --format '{{.State.StartedAt}}'` posterior ao
  ultimo commit de `mcp/**` e `src/lib/metrics/**`; o catalogo do mcp lista as 5 tools novas.
- **Resultado:** servidor MCP com metricas e tools novas em producao local.

### F3. Reprocessar o builder (popular `empresa_id`/`situacao_nfe` no item)
- **Arquivo:** N/A (executa o builder dentro do worker novo).
- **Fazer:** o gatilho canonico de reprocesso e `runBuilders(prisma, "incremental")` no registry
  `src/worker/fatos/registry.ts` (a entrada `{ nome: "fato_nota_fiscal_item", cycle:
  "incremental", run: rebuildFatoNotaFiscalItem }` esta la). O script que dispara isso e
  `scripts/f4l-build-fatos.ts` (chama `runBuilders(prisma, "snapshot")` e depois
  `runBuilders(prisma, "incremental")`). Rodar DENTRO do container worker (imagem nova do F1):
  `docker exec nexus-odoo-worker-1 npx tsx --env-file=.env.local scripts/f4l-build-fatos.ts`.
  (Reprocessa todos os fatos incrementais, incluindo `fato_nota_fiscal_item`, que agora popula
  as 2 colunas novas.)
- **Verificar:**
  `SELECT COUNT(*) FILTER (WHERE empresa_id IS NOT NULL) AS com_empresa, COUNT(*) FILTER (WHERE situacao_nfe IS NOT NULL) AS com_situacao, COUNT(*) AS total FROM fato_nota_fiscal_item;`
  -> a fracao com `empresa_id`/`situacao_nfe` preenchidos casa a fracao de notas-mae com esses
  campos (orfaos com `documentoId` sem nota ficam null, esperado, SPEC 9.1).
- **Resultado:** `fato_nota_fiscal_item` com `empresa_id`/`situacao_nfe` populados; tool CFOP por
  empresa exercivel contra dado real.

### F4. Registrar rebuild + reprocesso no HISTORY
- **Arquivo:** `docs/agents/HISTORY.md` (append).
- **Fazer:** linha `scope=infra summary=rebuild app+worker+mcp + reprocesso fato_nota_fiscal_item pos F1 faturamento (schema item empresaId/situacaoNfe)`.
- **Verificar:** linha presente.
- **Resultado:** multi-agente avisado do rebuild + reprocesso.

---

## BLOCO G , VERIFICACAO E2E CONTRA CACHE REAL

> Fonte: SPEC 8. Regra de raiz: subir servico, popular fatos, exercer contra cache real e
> conferir numeros. `tsc`/`jest` com mock NAO bastam. Escolher um periodo amplo com dado real
> (ex.: um mes fechado recente) e uma matriz conhecida para os cortes. **Pre-requisito: F3
> (reprocesso) ja rodou.**

### G0. Pre-flight de premissas (antes de confiar em qualquer numero)
- **Fazer (SQL no cache):**
  1. `SELECT DISTINCT situacao_nfe FROM fato_nota_fiscal;` (valida lista de 9.2).
  2. `SELECT DISTINCT natureza_operacao_nome FROM fato_nota_fiscal;` (revisa termos nao-venda de
     B9; se aparecer natureza nao prevista, ajustar `NATUREZAS_NAO_VENDA_TERMOS`).
  3. `SELECT DISTINCT empresa_id FROM fato_nota_fiscal WHERE empresa_id IS NOT NULL;` subconjunto
     de `SELECT odoo_id FROM dim_empresa_grupo;` (identidade de empresa).
  4. `SELECT COUNT(*) FROM fato_nota_fiscal WHERE entrada_saida IS NULL;` (3a categoria).
  5. `SELECT COUNT(*), MAX(data_emissao) FROM fato_nota_fiscal WHERE EXTRACT(HOUR FROM data_emissao) <> 0;` (borda 3.5).
  6. `SELECT COUNT(*) FROM dim_empresa_grupo WHERE ativo;` (~20).
- **Resultado:** premissas confirmadas no dado; ajustes aplicados onde divergiu.

### G1. Fechamento bruto/autorizado-total/cancelado/nao-autorizado (criterio 1.2)
- **Fazer:** para o periodo amplo, exercer as tools/metricas e conferir
  `BRUTO == AUTORIZADO_TOTAL + IMPACTO_CANCELAMENTOS + NAO_AUTORIZADO` (tolerancia zero, mesma
  fonte). Conferir `AUTORIZADO (venda) <= AUTORIZADO_TOTAL`. **Sobre "parcela negativa":** as 3
  parcelas sao `SUM(vrNf)` de conjuntos disjuntos de notas, todas >=0 por construcao; um valor
  negativo so pode vir de uma LINHA com `vrNf<0` (nota com valor negativo, ex.: vrNf editado
  pos-cancelamento). Logar (nao falhar) e investigar o REGISTRO especifico de `vrNf<0`, nao uma
  "parcela" do fechamento.
- **Resultado:** as 3 parcelas fecham o bruto exatamente; venda e subconjunto.

### G2. Fechamento do corte por empresa (criterio 1.2, sem ruido de sync)
- **Fazer:** resolver `idsNaoVenda(prisma)` UMA vez e usar a MESMA lista para as duas metricas do
  fechamento (`faturamentoPorEmpresa` e `faturamentoAutorizado` do grupo); OU pausar o worker
  durante o E2E (`docker compose stop worker`), porque o cron de 3min pode repopular
  `natureza_operacao_nome` entre as duas queries e divergir as listas de `idsNaoVenda`,
  quebrando o "tolerancia zero" falsamente. Conferir
  `SUM(POR_EMPRESA.valor sobre TODAS as linhas, incluindo empresaId=null) == FATURAMENTO_AUTORIZADO do grupo`
  para o mesmo periodo. Tolerancia zero. NAO testar contra soma de N chamadas
  `faturamentoAutorizado(empresaRef=X)` (excluem null, somam menos, documentado). Conferir que a
  linha null aparece exibida (risco 9.3). Religar o worker ao fim (`docker compose start worker`).
- **Resultado:** o corte por empresa fecha com o total do grupo via POR_EMPRESA, sem ruido de
  sync concorrente.

### G3. Default avisa + resolucao de empresa
- **Fazer:** `fiscal_faturamento_periodo` sem `empresaRef` -> `escopoEmpresa.tipo='grupo'`,
  `empresasComFaturamento=M`, `valorSemEmpresa` presente. Com `empresaRef` de uma matriz ->
  `tipo='empresa'`, nome+CNPJ corretos. `resolverEmpresa` por odooId/CNPJ/nome-exato -> `unica`;
  nome parcial 2+ -> `ambigua` (lista); inexistente -> `nenhuma` (roda como grupo com aviso).
- **Resultado:** aviso de escopo e resolucao corretos em todos os ramos.

### G4. POR_OPERACAO e POR_CFOP fecham
- **Fazer:** POR_OPERACAO: `valorGeral == AUTORIZADO_TOTAL` e `valorVenda == AUTORIZADO (venda)`
  (exato, mesma fonte cabecalho); devolucao/transferencia com `ehVenda=false`. POR_CFOP:
  `valorGeral` bate `AUTORIZADO_TOTAL` DENTRO da tolerancia de rateio (<=R$0,01/nota acumulada OU
  <0,1% relativo), E contar/logar itens orfaos (`documentoId`/`empresaId` sem nota). CFOP por
  empresa <= CFOP do grupo. (So roda com sentido apos F3 ter populado `empresa_id`/`situacao_nfe`
  no item.)
- **Resultado:** natureza fecha exato; CFOP fecha por tolerancia com orfaos contados.

### G5. Sem regressao + recebido
- **Fazer:** comparar `fiscal_faturamento_periodo` (sem empresaRef) antes/depois do refactor;
  diferenca == devolucoes/transferencias do periodo (== `POR_OPERACAO.valorNaoVenda`); se o
  periodo nao tiver nao-venda, numero identico. RECEBIDO: (a) "faturado vs recebido por pedido"
  responde numero real rotulado "por pedido" (via ponte `parcela.finanLancamentoId ->
  lancamento_item.lancamentoId -> vrPagoTotal`, conforme C0); (b) eixo nota individual -> envelope
  de gap honesto, NAO numero (a tool nao grava lacuna; quem grava e o agente via
  `registrar_lacuna`); (c) proxy participante so com rotulo e so se os `participanteId` baterem
  entre `fato_nota_fiscal` e `fato_financeiro_titulo` (testar a igualdade; se nao bater, manter
  desligado).
- **Resultado:** regressao explicada pela exclusao de nao-venda; recebido honesto.

### G6. Sanidade de negocio
- **Fazer:** o faturamento total do grupo bate a ordem de grandeza esperada; a maior filial em
  POR_EMPRESA faz sentido (matriz lidera). Numero que nao fecha vira investigacao ate a certeza
  (regra de raiz), nao entrega com ressalva.
- **Resultado:** numeros coerentes com a operacao real, ou investigados ate fechar.

---

## BLOCO H , CODE REVIEW + AUDITORIA FINAL

### H1. `/gsd-code-review`
- **Fazer:** rodar `/gsd-code-review` sobre os arquivos tocados (metricas, helpers, tools,
  builder, fiscal.ts). Conferir os checklists da SPEC 9: (a) nenhuma metrica de cabecalho usou
  `vrProdutos`/`vrFatura` por engano (9.7); (b) nenhuma metrica novou `groupBy` por
  empresa/natureza/situacao (9.9, so CFOP usa groupBy); (c) toda comparacao de `entradaSaida` e
  `=== "1"`/`=== "0"`, nunca truthy (9.8); (d) toda tool nova tem `dominio: "fiscal"` e a de
  comparativo tem `gatedRoles` (7.3); (e) cabecalho de regra canonica presente em cada metrica;
  (f) `faturamento-recebido` usa `FatoFinanceiroLancamentoItem` (nao `FatoFinanceiroTitulo`) para
  o recebido, e nao grava `feature_request` por dentro.
- **Verificar:** sem achado material aberto; `npx tsc --noEmit` + `npx jest` (suite fiscal +
  `integration.test.ts`) + `npx eslint` verdes na worktree.
- **Resultado:** codigo auditado, checklists da SPEC 9 confirmados.

### H2. Verificacao final + evidencia E2E
- **Fazer:** `superpowers:verification-before-completion`: rodar a suite inteira, confirmar E2E
  (G) verde com evidencia (numeros reais anexados ao resumo), e so entao declarar a F1 pronta.
- **Verificar:** evidencia E2E + suite verde anexadas.
- **Resultado:** F1 verificada com dado real.

### H3. Atualizar STATUS.md + HISTORY (fechamento da fase) + abrir PR
- **Arquivos:** `STATUS.md`, `docs/agents/HISTORY.md`.
- **Fazer:** atualizar `STATUS.md` (ponto de retomada exigido pelo CLAUDE.md): F1 entregue,
  proxima fase/bloco. Append em `HISTORY.md` com o fechamento da F1 (metricas + tools + schema +
  E2E). Abrir PR (Claude abre; corpo com avaliacao, evidencia E2E, tsc/jest/eslint verdes).
- **Verificar:** `STATUS.md` e `HISTORY.md` atualizados; PR aberto. Merge para main = decisao
  humana.
- **Resultado:** F1 pronta para PR, com continuidade de sessao garantida.

---

## CONTAGEM E ARQUIVOS

- **Bloco A:** A0-A7 (8 tasks). **Bloco B:** B1-B9 (9). **Bloco C:** C0-C23 (24, com C0 spike).
  **Bloco D:** D0a-D7 (9). **Bloco E:** E1-E14 (16, com E12/E13 desdobrados em a/b).
  **Bloco F:** F1-F4 (4). **Bloco G:** G0-G6 (7). **Bloco H:** H1-H3 (3). **Total: 80 tasks.**
- **Criar:** 4 helpers `_shared` (types, periodo, empresa, naturezas) + 11 modulos de metrica +
  2 barrels + 5 tools novas + 1 helper de escopo + testes correspondentes.
- **Estender:** `src/worker/fatos/fato-nota-fiscal-item.test.ts` (ja existe).
- **Alterar:** `prisma/schema.prisma` (+migration), `src/worker/fatos/fato-nota-fiscal-item.ts`,
  `src/lib/reports/queries/fiscal.ts`, 9 tools fiscais existentes, `mcp/tools/fiscal/index.ts`,
  `mcp/__tests__/integration.test.ts` (contagens), `docs/agents/HISTORY.md`, `STATUS.md`.

## NOTA SOBRE A SPEC (divergencias spec-vs-plano, o plano e a fonte)

- **SPEC 5.1** descreve `buildEmpresaSqlFragment(empresaId?, paramIndex)` com 2 args; o plano usa
  3 args `(empresaId, alias, paramIndex)` porque E12/E13 precisam de aliases diferentes (`fnfi`
  vs `nf`). O plano prevalece. SPEC 5.1 ficou desatualizada.
- **SPEC 4.9** descreve o recebido via "titulo baixado/pago por finanLancamentoId", o que e
  estruturalmente impossivel (`FatoFinanceiroTitulo` nao tem `lancamentoId` nem `pedidoId`). O
  plano (C0 spike + C22) corrige para `FatoFinanceiroLancamentoItem.lancamentoId` + `vrPagoTotal`.
  O plano prevalece.
