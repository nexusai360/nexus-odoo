# PLAN v3 (consolidada apos 2 reviews) , Fase 2 do Nex: Resolucao de Entidades + Desambiguacao

**Data:** 2026-06-06
**Branch:** feat/nex-reconstrucao
**Spec fonte:** `docs/superpowers/specs/2026-06-06-f2-entidades-desambiguacao-spec.md` (v3)
**Molde reusado:** `src/lib/metrics/_shared/empresa.ts` (`resolverEmpresa`, em producao na F1), `mcp/tools/cadastros/detalhar-parceiro.ts` (molde das tools de detalhe), `mcp/tools/caminho3/registrar-lacuna.ts` (canal de log).
**Modo:** autonomo. TDD por unidade testavel (teste vermelho ANTES da impl, sempre tasks separadas).

> **Consolidacao v3.** Esta versao aplica os achados das 2 reviews adversariais do plano. Principais correcoes:
> - **Granularidade.** O Bloco B passou a decompor cada resolvedor em sub-tasks por ramo (mapeador, ramos exatos, ramo fuzzy, filtros). O E2E (Bloco G) virou 1 task por entidade + 1 por assert critico. O Bloco A separou `levenshtein`/`normalizar`/`scoreFuzzy` e `_lacuna` em pares teste/impl. As 4 tools de detalhe (Bloco D) viraram pares teste/impl.
> - **Ordem.** Bloco C (schema + `documentoDigits`) foi movido para ANTES do resolvedor de parceiro. O parceiro agora vive no Bloco C-bis (apos C), nao mais no meio do Bloco B. O export de `./parceiro` no barrel so e adicionado no C-bis. Nenhuma task do Bloco B referencia `documentoDigits`.
> - **Determinismo de algoritmo.** O ramo "codigo sem pontos" da conta contabil/referencial foi cravado (carga por prefixo + comparacao `replace(/\./g,"")` em JS, com caso anti-falso-positivo). O backfill SQL alinhou com o builder via `NULLIF`. O gate F4 passou a checar tambem string vazia.
> - **integration.test.** O Bloco E foi decomposto: arrays `*_IDS`, `TODOS_IDS`/`toEqual`, contagens globais com a aritmetica do gating cravada, teste novo de gate de role para `contabil_detalhar_conta`, e os titulos/comentarios desatualizados.
> - **Fixtures.** A coleta de fixtures virou tasks numeradas (B0 e G0) com os SELECTs exatos e resultado registrado em arquivo.
> - **Schema-truth.** Cada tool de detalhe ganhou um passo de verificacao de campo no schema antes de cravar o output (`ncmCodigo`, `dataAprovacao`, `vrNf`, `empresaNome`).
> - **Barrel.** O barrel reconcilia o tipo divergente de empresa (`EmpresaResolucao` sem `score`/`criterio`) com um adaptador documentado.
> - **G4 (log).** Virou teste de unidade do helper + insercao manual via tool existente em Node local (na Fase 2 nao existe agente).

> **Convencoes deste plano**
> - Raiz de trabalho = a WORKTREE `branches/feat-nex-reconstrucao/`. Todo path abaixo e relativo a ela.
> - Verificacao de tipo: `npx tsc --noEmit` (raiz). Lint: `npx eslint <arquivo>`. Testes: `npx jest <caminho>`.
> - TDD: a task de teste vem ANTES da task de implementacao do mesmo modulo; o teste deve estar VERMELHO ao escrever (sem o modulo) e VERDE ao fim da impl. Vale para TODA unidade testavel, sem excecao.
> - Proibido travessao (em dash) em qualquer arquivo gerado.
> - Banco de cache real: `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "<SQL>"`.
> - Rebuild com schema novo (Bloco F): SEMPRE da worktree e com `--env-file .env.local`, senao crash loop.

---

## ORDEM GERAL DOS BLOCOS (top-down, sem armadilha)

1. **Bloco A** , helpers `_shared` (types, _fuzzy decomposto, _documento, _classificar-ref, sinonimias, _lacuna decomposto, barrel parcial). Sem dependencia externa.
2. **Bloco B** , 8 resolvedores que NAO dependem de schema novo (armazem, produto, NF, conta contabil, conta referencial, pedido, natureza, centro), cada um decomposto em sub-tasks por ramo. Parceiro NAO esta aqui.
3. **Bloco C** , migration `documentoDigits` + indices + `prisma generate` + builder do worker + backfill (`migrate deploy`). Desbloqueia o parceiro.
4. **Bloco C-bis** , `resolverParceiro` (depende de `documentoDigits` no client gerado). Aqui se adiciona o export de `./parceiro` ao barrel.
5. **Bloco D** , 4 tools de detalhe-por-id (pares teste/impl).
6. **Bloco E** , registro no catalogo + fix decomposto do integration.test.
7. **Bloco F** , rebuild app/worker/mcp da worktree + reprocesso/backfill conferido.
8. **Bloco G** , E2E contra cache real, 1 task por entidade + asserts criticos + log.
9. **Bloco H** , code review final + verificacao consolidada.

Regra de raiz da migration: **`migrate deploy` + SQL manual idempotente, nunca `migrate dev`** (drift pre-existente). Rebuild **sempre da worktree, sempre `--env-file .env.local`**; o worker se atualiza via `build app` (nao `build worker`, que e no-op).

---

## BLOCO A , Helpers `_shared` de `src/lib/entities/`

Pre-requisito de todos os 9 resolvedores. Ordem interna fixa: types -> _fuzzy (levenshtein -> normalizar -> scoreFuzzy) -> _documento -> _classificar-ref -> sinonimias -> _lacuna -> barrel.

### A0. Esqueleto de diretorio
- **Arquivo:** `src/lib/entities/` (criar pasta).
- **Acao:** criar a pasta vazia. Nenhum conteudo ainda.
- **Verificacao:** `test -d src/lib/entities && echo ok`.
- **Resultado:** diretorio existe.

### A1. Tipos genericos do resolvedor
- **Arquivo:** `src/lib/entities/types.ts` (novo).
- **Acao:** declarar exatamente os tipos da spec secao 3.2, sem nada a mais:
  - `interface ResolverOpcoes { topN?: number; limiarFuzzy?: number; margemFolga?: number; filtros?: Record<string, unknown> }`
  - `interface Candidata<T> { entidade: T; score: number }` (comentario: score 1 = exato; <1 = fuzzy)
  - `type Resolucao<T> = { status:"unica"; entidade:T; score:number } | { status:"ambigua"; candidatas:Candidata<T>[]; criterio:"documento"|"codigo"|"chave"|"nome" } | { status:"nenhuma" }`
  - `type Resolver<T> = (prisma: PrismaClient, ref: string, opcoes?: ResolverOpcoes) => Promise<Resolucao<T>>`
  - importar `PrismaClient` de `../../generated/prisma/client`.
- **Verificacao:** `npx tsc --noEmit` verde.
- **Resultado:** tipos compilam; nenhum runtime ainda.

### A2a. Teste de `levenshtein` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/_fuzzy.test.ts` (novo; bloco `describe("levenshtein")`).
- **Acao:** testar `levenshtein(a,b)` de `../_fuzzy` (ainda inexistente): `("kitten","sitting") => 3`; `("","") => 0`; `("abc","") => 3`; `("flaw","lawn") => 2`; simetria `levenshtein(a,b) === levenshtein(b,a)`.
- **Verificacao:** `npx jest src/lib/entities/__tests__/_fuzzy.test.ts -t "levenshtein"` VERMELHO (modulo nao existe).
- **Resultado:** teste do algoritmo critico falha por import inexistente.

### A2b. Impl `levenshtein`
- **Arquivo:** `src/lib/entities/_fuzzy.ts` (novo).
- **Acao:** exportar `levenshtein(a: string, b: string): number` , matriz DP classica iterativa, sem libs, sem normalizacao interna (recebe as strings cruas).
- **Verificacao:** `npx jest src/lib/entities/__tests__/_fuzzy.test.ts -t "levenshtein"` VERDE; `npx tsc --noEmit`.
- **Resultado:** algoritmo de distancia isolado e correto.

### A3a. Teste de `normalizar` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/_fuzzy.test.ts` (acrescentar `describe("normalizar")`).
- **Acao:** testar `normalizar(s)` de `../_fuzzy` (ainda inexistente): `"Acucar  ESTEIRA "` => `"acucar esteira"`; `"Esteira"` com acento (`"Estação"`) => `"estacao"` (NFD + `replace(/\p{Diacritic}/gu,"")`); `"  a   b  "` => `"a b"` (colapsa espacos internos + trim); `""` => `""`.
- **Verificacao:** `npx jest ... -t "normalizar"` VERMELHO.
- **Resultado:** teste do normalizador falha por export ausente.

### A3b. Impl `normalizar`
- **Arquivo:** `src/lib/entities/_fuzzy.ts`.
- **Acao:** exportar `normalizar(s: string): string` = lowercase, `normalize("NFD").replace(/\p{Diacritic}/gu,"")`, trim, colapsa espacos internos (`replace(/\s+/g," ")`).
- **Verificacao:** `npx jest ... -t "normalizar"` VERDE; `npx tsc --noEmit`.
- **Resultado:** normalizador pronto.

### A3c. Teste de `scoreFuzzy` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/_fuzzy.test.ts` (acrescentar `describe("scoreFuzzy")`).
- **Acao:** testar `scoreFuzzy(a,b)` de `../_fuzzy` (ainda inexistente): iguais => 1; `"esteira"` vs `"estewra"` => ~0.857 (tolerancia 0.01); totalmente diferentes (`"abc"` vs `"xyzqwe"`) => < 0.4; ambos vazios => 1; normaliza antes (`"Esteira "` vs `"esteira"` => 1).
- **Verificacao:** `npx jest ... -t "scoreFuzzy"` VERMELHO.
- **Resultado:** teste do score composto falha por export ausente.

### A3d. Impl `scoreFuzzy`
- **Arquivo:** `src/lib/entities/_fuzzy.ts`.
- **Acao:** exportar `scoreFuzzy(a: string, b: string): number` , normaliza os dois lados via `normalizar`, retorna 1 se ambos vazios, senao `1 - levenshtein(na, nb)/Math.max(na.length, nb.length)`.
- **Verificacao:** `npx jest src/lib/entities/__tests__/_fuzzy.test.ts` (suite inteira) VERDE; `npx tsc --noEmit`.
- **Resultado:** helper fuzzy completo (levenshtein + normalizar + scoreFuzzy).

### A4. Teste do `_documento` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/_documento.test.ts` (novo).
- **Acao:** testar `soDigitos(s)` e `classificarDocumento(s)` de `../_documento`:
  - `soDigitos("BR-07.390.039/0001-01")` => `"07390039000101"` (CS5, descarta `BR` e mascara).
  - `soDigitos("07.390.039/0001-01")` => mesmo `"07390039000101"`.
  - `soDigitos("07390039000101")` => igual (idempotente).
  - `soDigitos("BR-")` => `""` (sem digitos; importante para o alinhamento com o backfill, ver C).
  - `classificarDocumento` retorna `"cnpj"` para 14 digitos, `"cpf"` para 11, `null` para outros tamanhos.
- **Verificacao:** `npx jest src/lib/entities/__tests__/_documento.test.ts` VERMELHO.
- **Resultado:** teste falha por modulo ausente.

### A5. Impl `_documento`
- **Arquivo:** `src/lib/entities/_documento.ts` (novo).
- **Acao:** `soDigitos(s: string): string` = `s.replace(/\D/g, "")`; `classificarDocumento(s: string): "cnpj"|"cpf"|null` com base no length de `soDigitos`.
- **Verificacao:** `npx jest src/lib/entities/__tests__/_documento.test.ts` VERDE.
- **Resultado:** normalizador de documento pronto (alimenta resolverParceiro e a coluna `documentoDigits`).

### A6. Teste do `_classificar-ref` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/_classificar-ref.test.ts` (novo).
- **Acao:** testar `classificarRef(ref)` de `../_classificar-ref`, retornando `"id" | "documento" | "codigo_numerico_longo" | "chave_nfe" | "texto"`:
  - `"123"` => `"id"` (casa `^\d{1,9}$`).
  - `"07390039000101"` (14 d) => `"documento"`.
  - `"7891234567895"` (13 d, EAN >=7) => `"codigo_numerico_longo"`.
  - chave de 44 digitos => `"chave_nfe"`.
  - `"esteira T600"` => `"texto"`.
  - chave de 50 digitos ou com letra => `"texto"` (spec 4.4: so `^\d{44}$` roteia para chave NFe; 9/41/50 ou com letra NAO).
  - regra de precedencia documentada em comentario: 14 e 11 digitos sao `documento` ANTES de `codigo_numerico_longo`; `^\d{44}$` e `chave_nfe`; demais `>=7` numericos sao `codigo_numerico_longo`; `1-9` digitos e `id`.
- **Verificacao:** `npx jest src/lib/entities/__tests__/_classificar-ref.test.ts` VERMELHO.
- **Resultado:** teste falha por modulo ausente.

### A7. Impl `_classificar-ref`
- **Arquivo:** `src/lib/entities/_classificar-ref.ts` (novo).
- **Acao:** `classificarRef(ref: string)` com a precedencia da A6, usando `soDigitos`/`classificarDocumento` do `_documento`. Ordem: trim -> `^\d{44}$`? chave_nfe -> documento (11/14 d exatos via classificarDocumento)? documento -> `^\d{1,9}$`? id -> `^\d{7,}$`? codigo_numerico_longo -> senao texto.
- **Verificacao:** `npx jest src/lib/entities/__tests__/_classificar-ref.test.ts` VERDE.
- **Resultado:** classificador da entrada pronto (spec 3.3 passo 1).

### A8. Confronto dos valores de sinonimia contra o cache (gate de dado)
- **Arquivo:** nenhum (passo de verificacao de dado, registra evidencia inline no comentario da A10).
- **Acao:** rodar, anotando os DISTINCT reais:
  - `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "SELECT DISTINCT tipo FROM fato_pedido ORDER BY 1;"`
  - `... "SELECT DISTINCT situacao_nfe FROM fato_nota_fiscal ORDER BY 1;"`
  - `... "SELECT DISTINCT entrada_saida FROM fato_nota_fiscal ORDER BY 1;"`
  - `... "SELECT DISTINCT natureza FROM fato_conta_contabil ORDER BY 1;"`
- **Verificacao:** saidas batem com a spec (pedido 9 tipos; situacao 7; entrada_saida {0,1}; natureza {01,02,04}). Se divergir, PARAR e ajustar a A10 ao dado real (a spec erra para o dado, nunca o contrario).
- **Resultado:** de-para de sinonimias confirmado antes de codar.

### A9. Teste de `sinonimias` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/sinonimias.test.ts` (novo).
- **Acao:** testar `resolverSinonimia(categoria, termo)` de `../sinonimias`, uma entrada por linha da spec secao 6:
  - tipo parceiro: "cliente" => `{ ehCliente: true }`; "fornecedor" => `{ ehFornecedor: true }`; "empresa" => `{ ehEmpresa: true }`.
  - status produto: "ativo" => `{ ativo: true }`; "inativo" => `{ ativo: false }`.
  - etapa pedido: "aberto" => `{ etapaFinaliza: false }`; "finalizado" => `{ etapaFinaliza: true }`.
  - tipo pedido: "venda" => `{ tipo: "venda" }`; "compra" => `{ tipo: "compra" }`; "devolucao de venda" => `{ tipo: "devolucao_venda" }`; "transferencia" => `{ tipo: { in: ["transferencia_entrada","transferencia_saida","transferencia_solicitacao"] } }`; "inventario"/"producao"/"romaneio" idem singular.
  - sentido NF: "entrada" => `{ entradaSaida: "0" }`; "saida" => `{ entradaSaida: "1" }`.
  - situacao NF: os 7 valores reais retornam `{ situacaoNfe: "<valor>" }`.
  - natureza contabil: so 01/02/04 mapeados; termo fora => `null`.
  - termo desconhecido em qualquer categoria => `null` (nunca chuta).
- **Verificacao:** `npx jest src/lib/entities/__tests__/sinonimias.test.ts` VERMELHO.
- **Resultado:** teste falha por modulo ausente.

### A10. Impl `sinonimias`
- **Arquivo:** `src/lib/entities/sinonimias.ts` (novo).
- **Acao:** tabela estatica TS por categoria (`tipoParceiro`, `statusProduto`, `etapaPedido`, `tipoPedido`, `sentidoNf`, `situacaoNf`, `naturezaContabil`), normalizando o termo de entrada via `normalizar` do `_fuzzy`. `resolverSinonimia(categoria, termo): Record<string,unknown> | null`. De-para de natureza contabil restrito a 01/02/04 com rotulo confirmado pelo dossie contabil; comentario citando A8.
- **Verificacao:** `npx jest src/lib/entities/__tests__/sinonimias.test.ts` VERDE; `npx eslint src/lib/entities/sinonimias.ts`.
- **Resultado:** vocabulario de negocio deterministico pronto.

### A11a. Teste de `formatarLacunaAmbiguidade` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/_lacuna.test.ts` (novo).
- **Acao:** testar `formatarLacunaAmbiguidade(entidade, termo, qtd)` de `../_lacuna` (ainda inexistente):
  - `("produto","esteira", 4)` => `ambiguidade:produto:"esteira" (4 candidatas)`.
  - termo de 100 chars => truncado a 80 chars no resultado (spec secao 8).
  - confirmar que a funcao NAO chama Prisma nem grava nada (chamada pura, sem mock de banco).
- **Verificacao:** `npx jest src/lib/entities/__tests__/_lacuna.test.ts` VERMELHO.
- **Resultado:** teste falha por modulo ausente.

### A11b. Impl `formatarLacunaAmbiguidade`
- **Arquivo:** `src/lib/entities/_lacuna.ts` (novo).
- **Acao:** `formatarLacunaAmbiguidade(entidade: string, termo: string, qtd: number): string` => `ambiguidade:<entidade>:"<termo truncado 80>" (<qtd> candidatas)`. Sem efeito colateral.
- **Verificacao:** `npx jest src/lib/entities/__tests__/_lacuna.test.ts` VERDE; `npx tsc --noEmit`.
- **Resultado:** helper de payload de lacuna pronto (o agente da Fase 3 que chama `registrar_lacuna`).

### A12. Barrel `index.ts` parcial + reconciliacao do tipo de empresa
- **Arquivo:** `src/lib/entities/index.ts` (novo).
- **Acao:**
  - reexportar `./types`, `./_fuzzy`, `./_documento`, `./_classificar-ref`, `./sinonimias`, `./_lacuna`.
  - reexportar `resolverEmpresa` de `../metrics/_shared/empresa`.
  - **Reconciliar o tipo divergente.** `EmpresaResolucao` (em `empresa.ts`) usa `{ status:"unica"; empresa:... }` sem `score`/`criterio`, divergindo de `Resolucao<T>`. NAO reexportar `EmpresaResolucao` cru. Em vez disso, declarar e exportar do barrel um adaptador documentado `resolverEmpresaGenerica(prisma, ref, opcoes?): Promise<Resolucao<EmpresaEntidade>>` que chama `resolverEmpresa` e envelopa: `unica` ganha `score: 1`; ambiguidade de empresa (se existir no retorno atual) vira `{ status:"ambigua", candidatas, criterio:"nome" }`; nenhuma vira `{ status:"nenhuma" }`. Comentario no topo do barrel explicando que empresa permanece intocada (em producao) e que o adaptador uniformiza a API para a Fase 3, sem editar `empresa.ts`. Resolvedores das demais entidades sao adicionados ao barrel no fim de cada impl do Bloco B (e o parceiro so no Bloco C-bis).
- **Verificacao:** `npx tsc --noEmit`.
- **Resultado:** ponto unico de import; a API exposta para a Fase 3 e uniforme (`Resolucao<T>` para todas, inclusive empresa via adaptador). Cresce no Bloco B e C-bis.

---

## BLOCO B , 8 resolvedores que NAO dependem de schema novo (TDD por ramo)

> Parceiro NAO esta neste bloco (depende de `documentoDigits`, ver Bloco C-bis). Cada resolvedor vive em `src/lib/entities/<entidade>.ts`, exporta `const DEFAULTS_<ENTIDADE> = { topN, limiarFuzzy, margemFolga }` e `resolver<Entidade>(prisma, ref, opcoes?)`. Ordem dos ramos = spec 3.3/5: classificarRef -> id -> chave forte -> codigo longo exato -> nome fuzzy (com folga); filtros de `opcoes.filtros` como `where` adicional. **Sempre filtra no banco (`where`), nunca `findMany()` cego (spec 3.4); excecoes de cardinalidade baixa documentadas no proprio comentario.**
>
> **Cada resolvedor e decomposto em sub-tasks por ramo** para que cada unidade de logica seja verificavel isoladamente. O export ao barrel `index.ts` e adicionado na ultima sub-task de impl de cada resolvedor.

### B0. Coletar e registrar fixtures de chave forte (gate, roda uma vez antes do resto do B)
- **Arquivo:** `src/lib/entities/__tests__/fixtures-chave-forte.md` (novo, registro das evidencias).
- **Acao:** rodar os SELECTs abaixo e anotar, por entidade, 1 registro existente (odooId + chave forte + nome). Cada teste de impl do Bloco B referencia os valores deste arquivo nos mocks (mock retorna o shape do registro real, mantendo fidelidade ao dado):
  - armazem: `... -c "SELECT odoo_id, data->>'nome_unico' AS nome_unico, data->>'nome_completo' AS nome_completo, data->>'parent_path' AS parent_path, data->>'tipo' AS tipo FROM raw_estoque_local WHERE raw_deleted=false LIMIT 5;"`
  - produto: `... -c "SELECT odoo_id, nome, codigo_unico, codigo FROM fato_produto WHERE codigo_unico IS NOT NULL LIMIT 3;"`
  - nota fiscal: `... -c "SELECT odoo_id, serie, modelo, chave FROM fato_nota_fiscal WHERE length(chave)=44 LIMIT 3;"`
  - conta contabil: `... -c "SELECT odoo_id, codigo, nome FROM fato_conta_contabil LIMIT 5;"`
  - conta referencial: `... -c "SELECT odoo_id, codigo, nome, nome_completo FROM fato_contabil_conta_referencial LIMIT 3;"`
  - pedido: `... -c "SELECT odoo_id, numero, tipo FROM fato_pedido LIMIT 5;"`
  - natureza: `... -c "SELECT codigo, descricao FROM fato_referencia WHERE tabela='natureza_operacao' LIMIT 5;"`
  - centro: `... -c "SELECT DISTINCT centro_resultado_id, centro_resultado_nome FROM fato_financeiro_lancamento_item WHERE centro_resultado_id IS NOT NULL;"`
  - parceiro (para o Bloco C-bis): `... -c "SELECT odoo_id, nome, documento FROM fato_parceiro WHERE documento LIKE 'BR-%' LIMIT 3;"`
- **Verificacao:** `fixtures-chave-forte.md` preenchido com 1 registro real por entidade (8 do Bloco B + 1 de parceiro).
- **Resultado:** base factual dos mocks e dos E2E ancorada no dado real.

---

### Armazem (`resolverArmazem`)

`DEFAULTS_ARMAZEM = { topN:3, limiarFuzzy:0.8, margemFolga:0.1 }`. Fonte = `RawEstoqueLocal` (`data` Json, keys `id, nome, nome_completo, nome_unico, parent_path, local_superior_id, codigo_barras, nivel, tipo`; NAO existe `code`, spec 4.1).

### B1. Teste do mapeador `mapArmazemRow` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/armazem.test.ts` (novo; `describe("mapArmazemRow")`).
- **Acao:** testar `mapArmazemRow(row)` de `../armazem` (ainda inexistente): recebe `{ odooId, data: { nome, nome_completo, nome_unico, parent_path, nivel, tipo, codigo_barras } }` e retorna candidata `{ odooId, nome, nomeUnico, nomeCompleto, nivel, tipo }`; `codigo_barras` false/null NAO vira campo (ignorado); `data` com keys ausentes => campos `null`/undefined coerentes.
- **Verificacao:** `npx jest .../armazem.test.ts -t "mapArmazemRow"` VERMELHO.
- **Resultado:** contrato do mapeador Json->candidata fixado.

### B2. Impl `mapArmazemRow`
- **Arquivo:** `src/lib/entities/armazem.ts` (novo).
- **Acao:** exportar `mapArmazemRow(row)` que extrai as keys do `data` Json para o shape da candidata. Funcao pura.
- **Verificacao:** `npx jest .../armazem.test.ts -t "mapArmazemRow"` VERDE; `npx tsc --noEmit`.
- **Resultado:** mapeador pronto.

### B3. Teste dos ramos exatos de armazem (id + nome_unico) (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/armazem.test.ts` (`describe("ramos exatos")`).
- **Acao:** mockar `prisma.rawEstoqueLocal.findUnique`/`findMany`. Casos:
  - ref = odooId string existente => `unica` score 1 (via `findUnique({ where:{ odooId } })`).
  - ref = `nome_unico` exato ("proprio") => `unica`.
  - ref = odooId inexistente => cai (nao retorna `unica` aqui).
- **Verificacao:** `npx jest .../armazem.test.ts -t "ramos exatos"` VERMELHO.
- **Resultado:** contrato dos ramos exatos fixado.

### B4. Impl ramos exatos de armazem
- **Arquivo:** `src/lib/entities/armazem.ts`.
- **Acao:** esqueleto de `resolverArmazem(prisma, ref, opcoes?)` com ramo id (`findUnique`) e ramo `nome_unico` exato (carrega base e compara `nome_unico` apos `mapArmazemRow`). Ainda sem fuzzy.
- **Verificacao:** `npx jest .../armazem.test.ts -t "ramos exatos"` VERDE.
- **Resultado:** ramos exatos prontos.

### B5. Teste do ramo fuzzy-hierarquico de armazem (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/armazem.test.ts` (`describe("ramo fuzzy hierarquico")`).
- **Acao:** mockar `findMany` retornando varios locais. Casos:
  - `nome_completo` aproximado: 1 acima do limiar 0.8 com folga => `unica`.
  - varios proximos => `ambigua` `criterio:"nome"`, candidatas ordenadas por score desc, `length<=topN` (3).
  - nome que so casa o ULTIMO segmento de `nome_completo` (hierarquia `parent_path`, armadilha 4.1a) => casa via ultimo segmento (assert especifico desse ramo nao-trivial).
  - inexistente => `nenhuma`.
- **Verificacao:** `npx jest .../armazem.test.ts -t "ramo fuzzy"` VERMELHO.
- **Resultado:** contrato do ramo fuzzy-hierarquico (a logica nao-trivial do parent_path) fixado.

### B6. Impl ramo fuzzy-hierarquico de armazem
- **Arquivo:** `src/lib/entities/armazem.ts`.
- **Acao:** ramo fuzzy sobre `nome_completo` E sobre o ultimo segmento de `nome_completo` (split por separador do `parent_path`/`/`), `scoreFuzzy`, ordena, aplica `margemFolga`. Carregar so as colunas necessarias de `RawEstoqueLocal` com `where: { rawDeleted: false }`; comentario: `findMany` aceitavel por cardinalidade (~centenas de locais), ao contrario de parceiro/produto.
- **Verificacao:** `npx jest .../armazem.test.ts -t "ramo fuzzy"` VERDE.
- **Resultado:** ramo fuzzy-hierarquico pronto.

### B7. Teste dos filtros de armazem (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/armazem.test.ts` (`describe("filtros")`).
- **Acao:** nome generico ("Estoque") com varios matches => `ambigua`; com `opcoes.filtros.tipo` (ou `local_superior_id`) desempata para `unica`.
- **Verificacao:** `npx jest .../armazem.test.ts -t "filtros"` VERMELHO.
- **Resultado:** contrato dos filtros fixado.

### B8. Impl filtros de armazem + export no barrel
- **Arquivo:** `src/lib/entities/armazem.ts` + `src/lib/entities/index.ts`.
- **Acao:** aplicar `opcoes.filtros` (`tipo`, `local_superior_id`) ao conjunto antes de decidir ambiguidade. Exportar `DEFAULTS_ARMAZEM`. Adicionar `export * from "./armazem"` ao barrel.
- **Verificacao:** `npx jest .../armazem.test.ts` (suite inteira) VERDE; `npx tsc --noEmit`.
- **Resultado:** `resolverArmazem` completo.

---

### Produto (`resolverProduto`)

`DEFAULTS_PRODUTO = { topN:5, limiarFuzzy:0.8, margemFolga:0.1 }`. Fonte = `FatoProduto`.

### B9. Teste dos ramos exatos de produto (id + codigoUnico/codigoBarras + codigo) (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/produto.test.ts` (novo; `describe("ramos exatos")`).
- **Acao:** mockar `prisma.fatoProduto`. Casos:
  - id => `unica`.
  - `codigoUnico`/`codigoBarras` (EAN) exato, indexado, `IS NOT NULL` pre-filtro => `unica`.
  - `codigo` interno exato => `unica`.
  - EAN de >=7 digitos inexistente => `nenhuma`, NUNCA fuzzy de nome contendo substring (CS4).
- **Verificacao:** `npx jest .../produto.test.ts -t "ramos exatos"` VERMELHO.
- **Resultado:** contrato dos ramos exatos de produto fixado.

### B10. Impl ramos exatos de produto
- **Arquivo:** `src/lib/entities/produto.ts` (novo).
- **Acao:** `resolverProduto` com ramos id -> codigoUnico/codigoBarras (exato, `where: { codigoUnico: ref }`/`codigoBarras`, `not: null`) -> codigo (exato). Curto-circuito CS4: quando `classificarRef` => codigo numerico longo e nao casa exato, retorna `nenhuma` sem fuzzy.
- **Verificacao:** `npx jest .../produto.test.ts -t "ramos exatos"` VERDE.
- **Resultado:** ramos exatos prontos.

### B11. Teste do ramo fuzzy de produto (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/produto.test.ts` (`describe("ramo fuzzy")`).
- **Acao:** nome fuzzy limiar 0.8, top-5; ambiguidade => `ambigua` `criterio:"nome"`, `length<=5`; candidatas inativas com score penalizado, por ultimo, mas presentes com `ativo:false`; candidata shape `{ odooId, nome, codigo, codigoUnico, marcaNome, familiaNome, ativo }`.
- **Verificacao:** `npx jest .../produto.test.ts -t "ramo fuzzy"` VERMELHO.
- **Resultado:** contrato do ramo fuzzy de produto fixado.

### B12. Impl ramo fuzzy de produto
- **Arquivo:** `src/lib/entities/produto.ts`.
- **Acao:** ramo nome `where: { nome: { contains: termo, mode:"insensitive" } }` pre-filtra, depois `scoreFuzzy`. Penalizar score de inativo (`score*0.9`) sem esconder; inativos por ultimo.
- **Verificacao:** `npx jest .../produto.test.ts -t "ramo fuzzy"` VERDE.
- **Resultado:** ramo fuzzy pronto.

### B13. Teste dos filtros de produto (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/produto.test.ts` (`describe("filtros")`).
- **Acao:** `opcoes.filtros.familiaId/marcaId` aplicado ao `where` antes de decidir ambiguidade.
- **Verificacao:** `npx jest .../produto.test.ts -t "filtros"` VERMELHO.
- **Resultado:** contrato dos filtros fixado.

### B14. Impl filtros de produto + export no barrel
- **Arquivo:** `src/lib/entities/produto.ts` + `src/lib/entities/index.ts`.
- **Acao:** aplicar `familiaId/marcaId`. Exportar `DEFAULTS_PRODUTO`. `export * from "./produto"` no barrel.
- **Verificacao:** `npx jest .../produto.test.ts` (suite) VERDE; `npx tsc --noEmit`.
- **Resultado:** `resolverProduto` completo.

---

### Nota Fiscal (`resolverNotaFiscal`)

`DEFAULTS_NOTA = { topN:3, limiarFuzzy:0.75, margemFolga:0.1 }`. Fonte = `FatoNotaFiscal`. Sem ramo nome real (NF nao tem nome textual).

### B15. Teste dos ramos exatos de NF (id + chave) (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/nota-fiscal.test.ts` (novo; `describe("ramos exatos")`).
- **Acao:** mockar `prisma.fatoNotaFiscal`. Casos:
  - id => `unica`.
  - `chave` de 44 digitos exata (`classificarRef`=="chave_nfe") => `unica`, `where: { chave }` (indexado pelo Bloco C).
  - chave de 9/41/50 digitos ou com letra => NAO roteia para ramo chave; sem outro match => `nenhuma` (spec 4.4 armadilha a).
  - `numero` NUNCA usado como chave (campo 100% null, spec 4.4); nenhum ramo o consulta.
- **Verificacao:** `npx jest .../nota-fiscal.test.ts -t "ramos exatos"` VERMELHO.
- **Resultado:** contrato dos ramos exatos de NF fixado.

### B16. Impl ramos exatos de NF
- **Arquivo:** `src/lib/entities/nota-fiscal.ts` (novo).
- **Acao:** ramo id `findUnique` -> ramo chave (so quando `^\d{44}$`, `where: { chave }`). Sem consulta a `numero`.
- **Verificacao:** `npx jest .../nota-fiscal.test.ts -t "ramos exatos"` VERDE.
- **Resultado:** ramos exatos prontos.

### B17. Teste do ramo lista por data+entradaSaida de NF (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/nota-fiscal.test.ts` (`describe("ramo lista por filtros")`).
- **Acao:** intervalo de data + `entradaSaida` via `opcoes.filtros` retorna lista (`ambigua` ou conjunto), NUNCA `unica` so por data; `situacaoNfe='cancelada'` aparece marcada na candidata, nao filtrada; candidata shape `{ odooId, serie, modelo, chave, situacaoNfe, participanteNome, dataEmissao, vrNf }`.
- **Verificacao:** `npx jest .../nota-fiscal.test.ts -t "ramo lista"` VERMELHO.
- **Resultado:** contrato do ramo lista fixado.

### B18. Impl ramo lista por filtros de NF + export no barrel
- **Arquivo:** `src/lib/entities/nota-fiscal.ts` + `src/lib/entities/index.ts`.
- **Acao:** ramo data+entradaSaida por `opcoes.filtros` (lista, nunca `unica` por data). Exportar `DEFAULTS_NOTA`. `export * from "./nota-fiscal"` no barrel.
- **Verificacao:** `npx jest .../nota-fiscal.test.ts` (suite) VERDE; `npx tsc --noEmit`.
- **Resultado:** `resolverNotaFiscal` completo.

---

### Conta Contabil (`resolverContaContabil`)

`DEFAULTS_CONTA = { topN:3, limiarFuzzy:0.75, margemFolga:0.1 }`. Fonte = `FatoContaContabil` (934 linhas; `codigo` NAO indexado, decisao C1; carga por prefixo justificada por cardinalidade).

### B19. Teste do ramo codigo (com e sem pontos) de conta contabil (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/conta-contabil.test.ts` (novo; `describe("ramo codigo")`).
- **Acao:** mockar `prisma.fatoContaContabil`. Casos cravados (algoritmo deterministico, anti-falso-positivo):
  - id => `unica`.
  - `codigo` "1.1.01.01" exato => `unica`.
  - "110101" (sem pontos) => carrega candidatos por prefixo numerico e compara `replace(/\./g,"")` em JS; casa o mesmo "1.1.01.01" => `unica` (spec 4.5 armadilha a).
  - **anti-falso-positivo:** "110101" NAO casa "1.1.01.011" (digits "11010101") , a comparacao e por IGUALDADE de digits, nunca `contains` (defesa do invariante "nunca entidade falsa").
- **Verificacao:** `npx jest .../conta-contabil.test.ts -t "ramo codigo"` VERMELHO.
- **Resultado:** contrato do ramo codigo (algoritmo cravado) fixado.

### B20. Impl ramo codigo de conta contabil
- **Arquivo:** `src/lib/entities/conta-contabil.ts` (novo).
- **Acao:** algoritmo exato:
  - ramo id `findUnique`.
  - ramo codigo: se `ref` contem ponto, `where: { codigo: ref.trim() }` exato. Se `ref` e so digitos (forma sem pontos), carregar candidatos por `where: { codigo: { startsWith: <primeiro digito de ref> } }` (reduz por prefixo, select so `odooId, codigo, nome, tipo, natureza`), e em JS comparar `cand.codigo.replace(/\./g,"") === ref` por IGUALDADE (nunca `contains`). Cardinalidade 934 justifica carga sem indice; comentario documentando o gap (igual armazem/centro).
- **Verificacao:** `npx jest .../conta-contabil.test.ts -t "ramo codigo"` VERDE.
- **Resultado:** ramo codigo deterministico, sem falso-positivo.

### B21. Teste do ramo nome de conta contabil (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/conta-contabil.test.ts` (`describe("ramo nome")`).
- **Acao:** nome fuzzy limiar 0.75 top-3 => ambiguidade `criterio:"nome"`; filtro `opcoes.filtros.natureza/tipo`; candidata shape `{ odooId, codigo, nome, tipo, natureza }`.
- **Verificacao:** `npx jest .../conta-contabil.test.ts -t "ramo nome"` VERMELHO.
- **Resultado:** contrato do ramo nome fixado.

### B22. Impl ramo nome + filtros de conta contabil + export no barrel
- **Arquivo:** `src/lib/entities/conta-contabil.ts` + `src/lib/entities/index.ts`.
- **Acao:** ramo nome `where: { nome: { contains, mode:"insensitive" } }` + `scoreFuzzy`; filtros natureza/tipo. Exportar `DEFAULTS_CONTA`. `export * from "./conta-contabil"` no barrel.
- **Verificacao:** `npx jest .../conta-contabil.test.ts` (suite) VERDE; `npx tsc --noEmit`.
- **Resultado:** `resolverContaContabil` completo (plano da empresa).

---

### Conta Referencial SPED (`resolverContaReferencial`)

`DEFAULTS_CONTA_REF = { topN:3, limiarFuzzy:0.75, margemFolga:0.1 }`. Fonte = `FatoContabilContaReferencial` (2.216 linhas; `codigo` JA indexado `@@index([codigo])`). Candidata inclui `nomeCompleto`.

### B23. Teste do ramo codigo de conta referencial (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/conta-referencial.test.ts` (novo; `describe("ramo codigo")`).
- **Acao:** mesmo molde da B19, fonte `fatoContabilContaReferencial`: id => `unica`; codigo com/sem pontos => `unica` (mesma logica de igualdade de digits, anti-falso-positivo); candidata shape `{ odooId, codigo, nome, nomeCompleto }`.
- **Verificacao:** `npx jest .../conta-referencial.test.ts -t "ramo codigo"` VERMELHO.
- **Resultado:** contrato fixado.

### B24. Impl ramo codigo de conta referencial
- **Arquivo:** `src/lib/entities/conta-referencial.ts` (novo).
- **Acao:** mesma logica da B20, fonte `fatoContabilContaReferencial`; aproveitar `@@index([codigo])` para o ramo exato com pontos (`where: { codigo }`); forma sem pontos por `startsWith` + igualdade de digits em JS.
- **Verificacao:** `npx jest .../conta-referencial.test.ts -t "ramo codigo"` VERDE.
- **Resultado:** ramo codigo pronto.

### B25. Teste do ramo nome de conta referencial (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/conta-referencial.test.ts` (`describe("ramo nome")`).
- **Acao:** fuzzy sobre `nomeCompleto` + `nome` limiar 0.75 top-3 => `ambigua` `criterio:"nome"`.
- **Verificacao:** `npx jest .../conta-referencial.test.ts -t "ramo nome"` VERMELHO.
- **Resultado:** contrato fixado.

### B26. Impl ramo nome de conta referencial + export no barrel
- **Arquivo:** `src/lib/entities/conta-referencial.ts` + `src/lib/entities/index.ts`.
- **Acao:** ramo nome fuzzy sobre `nomeCompleto`+`nome`. Exportar `DEFAULTS_CONTA_REF`. `export * from "./conta-referencial"` no barrel.
- **Verificacao:** `npx jest .../conta-referencial.test.ts` (suite) VERDE; `npx tsc --noEmit`.
- **Resultado:** `resolverContaReferencial` completo (entidade propria, spec 4.6).

---

### Pedido (`resolverPedido`)

`DEFAULTS_PEDIDO = { topN:3, margemFolga:0.1 }`. Fonte = `FatoPedido`. Sem ramo fuzzy de nome (pedido nao tem nome). Defesa = regex de formato `^[A-Z]+-\d+/\d{2}$`.

### B27. Teste do ramo numero de pedido (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/pedido.test.ts` (novo; `describe("ramo numero")`).
- **Acao:** mockar `prisma.fatoPedido`. Casos:
  - id => `unica`.
  - `numero` `^[A-Z]+-\d+/\d{2}$` (ex.: "DV-0001/26") exato => `unica`; mesmo numero em tipos diferentes => `ambigua`; `opcoes.filtros.tipo` desempata para `unica`.
  - "pedido 123" (fora do formato) => `nenhuma` (CS4 NAO se aplica; defesa e o regex, spec 4.7 armadilha a).
  - candidata shape `{ odooId, numero, tipo, etapaNome, participanteNome, dataOrcamento, vrProdutos }`.
- **Verificacao:** `npx jest .../pedido.test.ts -t "ramo numero"` VERMELHO.
- **Resultado:** contrato do ramo numero fixado.

### B28. Impl ramo numero de pedido
- **Arquivo:** `src/lib/entities/pedido.ts` (novo).
- **Acao:** ramo id `findUnique` -> ramo numero (valida regex de formato, `where: { numero }`; quando `opcoes.filtros.tipo`, `AND tipo`).
- **Verificacao:** `npx jest .../pedido.test.ts -t "ramo numero"` VERDE.
- **Resultado:** ramo numero pronto.

### B29. Teste do ramo lista por data/tipo/participante de pedido (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/pedido.test.ts` (`describe("ramo lista")`).
- **Acao:** intervalo data+tipo por `opcoes.filtros` => lista; `participanteId` por filtros => lista; nunca `unica` por data sozinha.
- **Verificacao:** `npx jest .../pedido.test.ts -t "ramo lista"` VERMELHO.
- **Resultado:** contrato do ramo lista fixado.

### B30. Impl ramo lista de pedido + export no barrel
- **Arquivo:** `src/lib/entities/pedido.ts` + `src/lib/entities/index.ts`.
- **Acao:** ramo data+tipo/participante por filtros (lista). Exportar `DEFAULTS_PEDIDO`. `export * from "./pedido"` no barrel.
- **Verificacao:** `npx jest .../pedido.test.ts` (suite) VERDE; `npx tsc --noEmit`.
- **Resultado:** `resolverPedido` completo.

---

### Natureza de Operacao (`resolverNaturezaOperacao`)

`DEFAULTS_NATUREZA = { topN:3, limiarFuzzy:0.75, margemFolga:0.1 }`. Fonte = `fato_referencia` (`tabela='natureza_operacao'`). NAMESPACE PROPRIO: ramo id global NAO se aplica. Candidata sem odooId.

### B31. Teste do ramo codigo (namespace) de natureza (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/natureza-operacao.test.ts` (novo; `describe("ramo codigo namespace")`).
- **Acao:** mockar `prisma.fatoReferencia` (filtro `tabela='natureza_operacao'`). Casos:
  - `codigo` "001" exato (string, leading zeros preservados) => `unica`.
  - **invariante de namespace:** ref "1" (ou "001") NAO casa odoo_id=1 de outra tabela; "001" nunca vira `Number()`; resolucao casa so `codigo` como string com zeros (spec 4.8 armadilha a).
  - candidata shape `{ codigo, descricao }` (sem odooId).
  - termo inexistente => `nenhuma`.
- **Verificacao:** `npx jest .../natureza-operacao.test.ts -t "ramo codigo"` VERMELHO.
- **Resultado:** contrato do ramo codigo com namespace fixado.

### B32. Impl ramo codigo (namespace) de natureza
- **Arquivo:** `src/lib/entities/natureza-operacao.ts` (novo).
- **Acao:** NAO usar `classificarRef` global. Primeiro `where: { tabela:"natureza_operacao", codigo: ref.trim() }` (string, leading zeros). Reusar `queryReferenciaBuscar` de `mcp/tools/fiscal/referencia-buscar` se exportada; senao replicar o `where` minimo com comentario apontando a fonte unica (spec 2/4.8).
- **Verificacao:** `npx jest .../natureza-operacao.test.ts -t "ramo codigo"` VERDE.
- **Resultado:** ramo codigo namespace pronto.

### B33. Teste do ramo descricao fuzzy de natureza (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/natureza-operacao.test.ts` (`describe("ramo descricao")`).
- **Acao:** `descricao` fuzzy => `ambigua` `criterio:"nome"`; 1 com folga => `unica`.
- **Verificacao:** `npx jest .../natureza-operacao.test.ts -t "ramo descricao"` VERMELHO.
- **Resultado:** contrato do ramo descricao fixado.

### B34. Impl ramo descricao de natureza + export no barrel
- **Arquivo:** `src/lib/entities/natureza-operacao.ts` + `src/lib/entities/index.ts`.
- **Acao:** fuzzy sobre `descricao` com `where: { tabela:"natureza_operacao", descricao: { contains, mode:"insensitive" } }`. Exportar `DEFAULTS_NATUREZA`. `export * from "./natureza-operacao"` no barrel.
- **Verificacao:** `npx jest .../natureza-operacao.test.ts` (suite) VERDE; `npx tsc --noEmit`.
- **Resultado:** `resolverNaturezaOperacao` completo (le `fato_referencia`, nao Json).

---

### Centro de Resultado (`resolverCentroResultado`)

`DEFAULTS_CENTRO = { topN:3, limiarFuzzy:0.75, margemFolga:0.1 }`. Fonte = DISTINCT em `FatoFinanceiroLancamentoItem` (so 6 distintos). Candidata `{ odooId, nome }`.

### B35. Teste de `resolverCentroResultado` (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/centro-resultado.test.ts` (novo).
- **Acao:** mockar `prisma.fatoFinanceiroLancamentoItem.findMany` com `distinct`. Casos:
  - id (=`centroResultadoId`) => `unica`.
  - nome fuzzy => `unica` com folga ou `ambigua`.
  - candidata shape `{ odooId, nome }`.
  - inexistente => `nenhuma`.
- **Verificacao:** `npx jest .../centro-resultado.test.ts` VERMELHO.
- **Resultado:** contrato fixado.

### B36. Impl `resolverCentroResultado` + export no barrel
- **Arquivo:** `src/lib/entities/centro-resultado.ts` (novo) + `src/lib/entities/index.ts`.
- **Acao:** `findMany({ where:{ centroResultadoId: { not: null } }, distinct:["centroResultadoId"], select:{ centroResultadoId:true, centroResultadoNome:true } })` (6 distintos, cardinalidade baixa documentada); ramo id por igualdade de `centroResultadoId`; ramo nome fuzzy. Exportar `DEFAULTS_CENTRO`. `export * from "./centro-resultado"` no barrel. Comentario: gap "so centros usados em lancamentos" (spec 4.9).
- **Verificacao:** `npx jest .../centro-resultado.test.ts` VERDE; `npx tsc --noEmit`; `npx eslint src/lib/entities/`.
- **Resultado:** `resolverCentroResultado` completo. Bloco B (8 resolvedores) fechado.

---

## BLOCO C , Migration `documentoDigits` + indices + builder + backfill

> **Ordem critica:** C1->C2 (schema + generate) ANTES do Bloco C-bis (parceiro) compilar. C3 (builder) e C4/C5 (migration manual + backfill) antes do E2E de documento (Bloco G).
> **Migration manual + `migrate deploy`, NUNCA `migrate dev`** (o banco tem drift pre-existente; `migrate dev` pediria reset e destruiria o cache). Spec secao 9.

### C1. Editar `schema.prisma`
- **Arquivo:** `prisma/schema.prisma`.
- **Acao:**
  - Em `FatoParceiro`: adicionar `documentoDigits String? @map("documento_digits")` e `@@index([documentoDigits])`.
  - Em `FatoNotaFiscal`: adicionar `@@index([chave])`.
  - NAO adicionar `@@index([codigo])` em `FatoContaContabil` (decisao: 934 linhas, carga por prefixo justificada na B20; deixar comentario `// codigo nao indexado: cardinalidade 934, ramo codigo carrega por startsWith`). `FatoContabilContaReferencial` ja tem `@@index([codigo])`.
- **Verificacao:** `npx prisma validate`.
- **Resultado:** schema com coluna e indices novos.

### C2. `prisma generate`
- **Arquivo:** `src/generated/prisma/**` (gerado).
- **Acao:** `npx prisma generate`.
- **Verificacao:** `grep -rq documentoDigits src/generated/prisma/`; `npx tsc --noEmit`.
- **Resultado:** client tipado com `documentoDigits`. **Desbloqueia o Bloco C-bis (parceiro).**

### C3. Builder do worker preenche `documentoDigits` (alinhado ao backfill)
- **Arquivo:** `src/worker/fatos/fato-parceiro.ts`.
- **Acao:** em `FatoParceiroRow` adicionar `documentoDigits: string | null`; em `mapParceiroRow` setar `documentoDigits = raw.vat ? (String(raw.vat).replace(/\D/g,"") || null) : null` (string vazia vira `null`). Reusar `soDigitos` de `src/lib/entities/_documento` se o worker puder importar de `src/lib`; senao replicar a uma linha com comentario apontando a fonte canonica. Atualizar `src/worker/fatos/fato-parceiro.test.ts` para conferir `documentoDigits` do `BR-07.390.039/0001-01` => `"07390039000101"`, e `documentoDigits` de `"BR-"` (sem digitos) => `null` (alinhamento com o backfill C4).
- **Verificacao:** `npx jest src/worker/fatos/fato-parceiro.test.ts` VERDE; `npx tsc --noEmit`.
- **Resultado:** builder preenche a coluna; string vazia normalizada para `null`, igual ao backfill.

### C4. Escrever a migration SQL manual (backfill alinhado com NULLIF)
- **Arquivo:** `prisma/migrations/<timestamp>_f2_entidades_documento_digits/migration.sql` (novo; timestamp `YYYYMMDDHHMMSS`).
- **Acao:** SQL idempotente:
  - `ALTER TABLE "fato_parceiro" ADD COLUMN IF NOT EXISTS "documento_digits" TEXT;`
  - `CREATE INDEX IF NOT EXISTS "fato_parceiro_documento_digits_idx" ON "fato_parceiro" ("documento_digits");`
  - `CREATE INDEX IF NOT EXISTS "fato_nota_fiscal_chave_idx" ON "fato_nota_fiscal" ("chave");`
  - backfill inline alinhado ao builder (string vazia => NULL): `UPDATE "fato_parceiro" SET "documento_digits" = NULLIF(regexp_replace("documento", '\D', '', 'g'), '') WHERE "documento" IS NOT NULL AND "documento_digits" IS NULL;`
- **Verificacao:** revisar SQL; o `NULLIF` garante que documento sem digitos (ex.: `"BR-"`) vire `NULL` igual ao builder (C3). Nenhuma execucao ainda.
- **Resultado:** migration pronta para `migrate deploy`, sem divergencia com o builder.

### C5. Aplicar migration + backfill (banco real)
- **Arquivo:** nenhum (operacao de banco).
- **Acao:** `npx prisma migrate deploy` (aplica so as pendentes, sem reset). Conferir backfill:
  - `... -c "SELECT count(*) FROM fato_parceiro WHERE documento_digits IS NOT NULL;"` deve casar com `SELECT count(*) FROM fato_parceiro WHERE documento IS NOT NULL AND regexp_replace(documento,'\D','','g') <> '';`.
  - `... -c "SELECT documento, documento_digits FROM fato_parceiro WHERE documento LIKE 'BR-%' LIMIT 3;"` (digits sem BR/mascara).
  - `... -c "\\d fato_nota_fiscal"` confirma indice em `chave`.
- **Verificacao:** contagens batem; indices presentes.
- **Resultado:** schema do cache em dia. **Rodar `agente schema-changed` (spec secao 9).**

---

## BLOCO C-bis , `resolverParceiro` (depende de `documentoDigits`)

> Posicionado APOS o Bloco C porque compila contra `documentoDigits` (gerado em C2). O export de `./parceiro` no barrel so e adicionado aqui; nenhuma task do Bloco B o adicionou. `DEFAULTS_PARCEIRO = { topN:3, limiarFuzzy:0.75, margemFolga:0.1 }`. Fonte = `FatoParceiro`.

### Cb1. Teste dos ramos exatos de parceiro (id + documento 3 formatos) (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/parceiro.test.ts` (novo; `describe("ramos exatos")`).
- **Acao:** mockar `prisma.fatoParceiro`. Casos:
  - ref id => `unica`.
  - ref = documento nos 3 formatos `BR-07.390.039/0001-01`, `07.390.039/0001-01`, `07390039000101` => a impl chama `findMany({ where: { documentoDigits: "07390039000101" } })` nos 3 casos => mesmo odooId, `unica` (CS5).
  - 2 parceiros com mesmo `documentoDigits` => `ambigua` `criterio:"documento"`.
- **Verificacao:** `npx jest .../parceiro.test.ts -t "ramos exatos"` VERMELHO (usa mock; nao toca banco, mas compila contra `documentoDigits` => exige C2 ja rodado).
- **Resultado:** contrato dos ramos exatos de parceiro fixado.

### Cb2. Impl ramos exatos de parceiro
- **Arquivo:** `src/lib/entities/parceiro.ts` (novo).
- **Acao:** ramo id `findUnique`; ramo documento via `classificarDocumento` -> `where: { documentoDigits: soDigitos(ref) }` (indexado, spec 3.4).
- **Verificacao:** `npx jest .../parceiro.test.ts -t "ramos exatos"` VERDE; `npx tsc --noEmit` (exige `documentoDigits` no client gerado, logo apos C2).
- **Resultado:** ramos exatos prontos.

### Cb3. Teste do ramo nome fuzzy de parceiro (TDD , vermelho)
- **Arquivo:** `src/lib/entities/__tests__/parceiro.test.ts` (`describe("ramo nome")`).
- **Acao:** nome fuzzy: 1 com folga => `unica`; homonimos => `ambigua` com `uf`/`cidade`/`dataCriacao` na candidata para desempate; candidata shape `{ odooId, nome, nomeCompleto, documento, ehCliente, ehFornecedor, uf, cidade }`.
- **Verificacao:** `npx jest .../parceiro.test.ts -t "ramo nome"` VERMELHO.
- **Resultado:** contrato do ramo nome fixado.

### Cb4. Impl ramo nome + filtros de parceiro + export no barrel
- **Arquivo:** `src/lib/entities/parceiro.ts` + `src/lib/entities/index.ts`.
- **Acao:** ramo nome `where: { OR: [{nome:{contains,mode:"insensitive"}},{nomeCompleto:{contains,mode:"insensitive"}}] }` pre-filtra, depois `scoreFuzzy`. Filtros `ehCliente/ehFornecedor/ehEmpresa` por `opcoes.filtros`. Exportar `DEFAULTS_PARCEIRO`. Adicionar AGORA `export * from "./parceiro"` ao barrel (primeira e unica vez).
- **Verificacao:** `npx jest .../parceiro.test.ts` (suite) VERDE; `npx tsc --noEmit`; `npx eslint src/lib/entities/`.
- **Resultado:** `resolverParceiro` completo (reusavel por `cadastro_buscar_parceiro`, sem duplicar). Barrel agora exporta os 9 resolvedores + empresa adaptada.

---

## BLOCO D , 4 tools de detalhe-por-id (molde `detalhar-parceiro`, pares teste/impl)

> Cada tool segue EXATAMENTE o molde `mcp/tools/cadastros/detalhar-parceiro.ts`: input `{ odooId: number().int().positive() }`, `withFreshness([tabela], handler, vazioSe)`, `enriquecerEnvelope`, `{ encontrado:false }` quando nao existe (nunca throw), output Zod. So aceitam odooId, logo nunca produzem ambiguidade (spec 7). **Cada tool tem verificacao de campo no schema antes de cravar o output** (regra de raiz: comprovar contra o dado, nao assumir).

### D0. Verificar campos do output contra `prisma/schema.prisma`
- **Arquivo:** nenhum (gate de schema-truth).
- **Acao:** conferir no `prisma/schema.prisma` a existencia de cada campo nao trivial citado nos outputs da spec secao 7:
  - `FatoProduto`: `ncmCodigo` existe? (se nao, remover do output da D2).
  - `FatoPedido`: `dataAprovacao`, `vrNf`, `empresaNome`, `etapaFinaliza` existem? (a spec 4.7 confirmou `dataOrcamento`, `vrProdutos`, `etapaFinaliza`, `etapaNome`, `participanteNome`, `vendedorNome`; conferir os demais; remover do output o que nao existir).
  - `FatoContaContabil`: `nivel`, `contaPaiNome`, `parentPath` existem?
  - `FatoNotaFiscal`: `vrProdutos`, `naturezaOperacaoNome` existem?
- **Verificacao:** `grep -nE "ncmCodigo|dataAprovacao|vrNf|empresaNome|contaPaiNome|parentPath|naturezaOperacaoNome|vrProdutos" prisma/schema.prisma` e anotar quais existem. Cada tool D2-D8 usa SO os campos confirmados aqui.
- **Resultado:** lista de campos confirmados por tool; nenhum output crava premissa nao comprovada.

### D1. Teste `cadastro_detalhar_produto` (TDD , vermelho)
- **Arquivo:** `mcp/tools/cadastros/__tests__/detalhar-produto.test.ts` (novo; criar `__tests__` se faltar).
- **Acao:** mockar `findFirst`/`findUnique` do `fato_produto` e `withFreshness`: (1) id existente => `encontrado:true` com os campos confirmados em D0; (2) id inexistente => `encontrado:false` sem throw (CS6); (3) validar contra o `outputSchema` Zod da tool.
- **Verificacao:** `npx jest mcp/tools/cadastros/__tests__/detalhar-produto.test.ts` VERMELHO.
- **Resultado:** contrato da tool fixado.

### D2. Impl `cadastro_detalhar_produto`
- **Arquivo:** `mcp/tools/cadastros/detalhar-produto.ts` (novo).
- **Acao:** `dominio:"cadastros"`, sem gatedRoles, fonte `fato_produto`. Output entidade com os campos confirmados em D0 (base: `{ odooId, nome, codigo, codigoUnico, codigoBarras, marcaNome, familiaNome, unidadeNome, precoVenda, precoCusto, ativo }` + `ncmCodigo` SE existir). `Decimal -> Number()` ou string seguindo o padrao das outras tools de produto. `_RESPOSTA` minimo.
- **Verificacao:** `npx jest mcp/tools/cadastros/__tests__/detalhar-produto.test.ts` VERDE; `npx tsc --noEmit`.
- **Resultado:** tool de detalhe de produto criada.

### D3. Teste `comercial_detalhar_pedido` (TDD , vermelho)
- **Arquivo:** `mcp/tools/comercial/__tests__/detalhar-pedido.test.ts` (novo).
- **Acao:** igual D1 para `fato_pedido`; id existente => `encontrado:true` com campos confirmados em D0; inexistente => `encontrado:false`; validar Zod.
- **Verificacao:** `npx jest mcp/tools/comercial/__tests__/detalhar-pedido.test.ts` VERMELHO.
- **Resultado:** contrato fixado.

### D4. Impl `comercial_detalhar_pedido`
- **Arquivo:** `mcp/tools/comercial/detalhar-pedido.ts` (novo).
- **Acao:** `dominio:"comercial"`, sem gatedRoles, fonte `fato_pedido`. Output com os campos confirmados em D0 (base: `{ odooId, numero, tipo, etapaNome, etapaFinaliza, participanteNome, vendedorNome, dataOrcamento, vrProdutos }` + `dataAprovacao`/`vrNf`/`empresaNome` SE existirem).
- **Verificacao:** `npx jest mcp/tools/comercial/__tests__/detalhar-pedido.test.ts` VERDE; `npx tsc --noEmit`.
- **Resultado:** tool de detalhe de pedido criada.

### D5. Teste `contabil_detalhar_conta` (TDD , vermelho) , inclui gate de role
- **Arquivo:** `mcp/tools/contabil/__tests__/detalhar-conta.test.ts` (novo).
- **Acao:** igual D1 para `fato_conta_contabil` + asserts especificos do gate:
  - id existente => `encontrado:true`; inexistente => `encontrado:false`; Zod valido.
  - a entry exporta `gatedRoles:["admin","super_admin"]` (assert estatico).
  - `assertToolAllowed` (ou helper equivalente do projeto) lanca `DomainDeniedError` para `viewer` e para `manager`; nao lanca para `admin`/`super_admin` (defesa de seguranca, spec 7). **Roles reais do sistema: super_admin/admin/manager/viewer , NAO existe "operador".**
- **Verificacao:** `npx jest mcp/tools/contabil/__tests__/detalhar-conta.test.ts` VERMELHO.
- **Resultado:** contrato + gate de role fixados.

### D6. Impl `contabil_detalhar_conta`
- **Arquivo:** `mcp/tools/contabil/detalhar-conta.ts` (novo).
- **Acao:** `dominio:"contabil"`, **`gatedRoles:["admin","super_admin"]`** (spec 7), fonte `fato_conta_contabil`. Output com os campos confirmados em D0 (base: `{ odooId, codigo, nome, tipo, natureza }` + `nivel`/`contaPaiNome`/`parentPath` SE existirem).
- **Verificacao:** `npx jest mcp/tools/contabil/__tests__/detalhar-conta.test.ts` VERDE; `npx tsc --noEmit`.
- **Resultado:** tool com gate de role criada.

### D7. Teste `fiscal_detalhar_nota` (TDD , vermelho)
- **Arquivo:** `mcp/tools/fiscal/__tests__/detalhar-nota.test.ts` (novo).
- **Acao:** igual D1 para `fato_nota_fiscal`; id existente => `encontrado:true` SEM `numero` (campo 100% null, spec 4.4/7); inexistente => `encontrado:false`; Zod valido.
- **Verificacao:** `npx jest mcp/tools/fiscal/__tests__/detalhar-nota.test.ts` VERMELHO.
- **Resultado:** contrato fixado.

### D8. Impl `fiscal_detalhar_nota`
- **Arquivo:** `mcp/tools/fiscal/detalhar-nota.ts` (novo).
- **Acao:** `dominio:"fiscal"`, sem gatedRoles, fonte `fato_nota_fiscal`. Output com campos confirmados em D0 (base: `{ odooId, serie, modelo, chave, entradaSaida, situacaoNfe, participanteNome, dataEmissao, vrNf }` + `naturezaOperacaoNome`/`vrProdutos` SE existirem), **SEM `numero`**.
- **Verificacao:** `npx jest mcp/tools/fiscal/__tests__/detalhar-nota.test.ts` VERDE; `npx tsc --noEmit`.
- **Resultado:** tool de detalhe de nota criada.

---

## BLOCO E , Registro no catalogo + fix decomposto do integration.test

### E0. Inspecionar o estado atual do integration.test (gate de aritmetica)
- **Arquivo:** nenhum (leitura).
- **Acao:** ler `mcp/__tests__/integration.test.ts` e anotar os numeros e estruturas reais HOJE (antes de qualquer mudanca): todos os `toHaveLength(N)` (visivel, catalogo bruto 88, agregado 107, por-dominio), os arrays `*_IDS` (incluindo `CONTABIL_IDS`), o helper `TODOS_IDS`, a assertiva `expect(ids).toEqual([...TODOS_IDS].sort())`, e os blocos de visibilidade por role. Tambem `grep -nE "toHaveLength|_IDS|TODOS_IDS|toEqual|7 tools|93|98|107|88" mcp/__tests__/integration.test.ts`.
- **Verificacao:** mapa anotado: cada `toHaveLength` com seu numero atual e o que ele conta; quais arrays alimentam `TODOS_IDS`; onde estao os titulos/comentarios desatualizados.
- **Resultado:** aritmetica do gate cravada antes de mexer (nao chutar).

### E1. Registrar as 4 tools nos indices de dominio
- **Arquivo:** `mcp/tools/cadastros/index.ts`, `mcp/tools/comercial/index.ts`, `mcp/tools/contabil/index.ts`, `mcp/tools/fiscal/index.ts`.
- **Acao:** importar e adicionar ao array exportado: `cadastroDetalharProduto`, `comercialDetalharPedido`, `contabilDetalharConta`, `fiscalDetalharNota` (1 por arquivo).
- **Verificacao:** `npx tsc --noEmit`.
- **Resultado:** as 4 tools entram no `catalogo` agregado (via `mcp/catalog/index.ts`).

### E2. Adicionar os 4 IDs aos arrays `*_IDS`
- **Arquivo:** `mcp/__tests__/integration.test.ts`.
- **Acao:** adicionar `cadastro_detalhar_produto` a `CADASTROS_IDS`, `comercial_detalhar_pedido` a `COMERCIAL_IDS`, `contabil_detalhar_conta` a `CONTABIL_IDS`, `fiscal_detalhar_nota` a `FISCAL_IDS`. Conferir que `TODOS_IDS` (que agrega os `*_IDS`) passa a conter os 4 (a assertiva `expect(ids).toEqual([...TODOS_IDS].sort())` depende disso).
- **Verificacao:** os 4 IDs aparecem em `TODOS_IDS` (inspecao); ainda pode haver `toHaveLength` vermelho (ajustado em E3/E4).
- **Resultado:** arrays por dominio e `TODOS_IDS` atualizados.

### E3. Ajustar os `toHaveLength` globais com a aritmetica do gating cravada
- **Arquivo:** `mcp/__tests__/integration.test.ts`.
- **Acao:** ajustar cada `toHaveLength` afetado usando a aritmetica de E0 (NAO chutar, mas a aritmetica esperada e):
  - catalogo bruto (agregado completo, hoje 107) => 111 (+4 tools de leitura).
  - catalogo bruto "88 entradas" (se afetado pelo agregado de leitura): conferir em E0 se as 4 tools entram nesse agregado; se sim, 88 => 92; se for outro recorte (so write), mantem.
  - total visivel para super_admin/admin (hoje 98) => 102 (ve as 4, inclusive a contabil gated).
  - total visivel para manager/viewer COM dominio contabil => sobe so +3 (produto+pedido+nota; a conta contabil e gated por role, nao aparece) => o numero desse bloco e `<base manager/viewer> + 3`, cravado a partir do valor de E0.
- **Verificacao:** rodar `npx jest mcp/__tests__/integration.test.ts`, ler cada diff "expected X received Y" e confirmar que Y bate com a aritmetica acima (catalogo +4, visivel admin +4, visivel manager/viewer +3). Qualquer divergencia => investigar (gate aplicado errado), nao so aceitar o Y.
- **Resultado:** contagens globais coerentes com o gating.

### E4. Teste novo de gate de role para `contabil_detalhar_conta`
- **Arquivo:** `mcp/__tests__/integration.test.ts`.
- **Acao:** adicionar bloco de teste: para um usuario com dominio `contabil` mas role `viewer` (e outro `manager`), o catalogo visivel NAO contem `contabil_detalhar_conta`; para `admin` e `super_admin` (com dominio contabil), CONTEM. Corrigir titulos/comentarios desatualizados encontrados em E0 (ex.: "admin ve as 7 tools de contabil" => 8; comentarios "93" remanescentes => valor atual).
- **Verificacao:** `npx jest mcp/__tests__/integration.test.ts` VERDE (incluindo o bloco novo).
- **Resultado:** defesa de seguranca da tool contabil coberta por teste; rede do catalogo verde.

### E5. Suite completa verde
- **Arquivo:** nenhum.
- **Acao:** `npx tsc --noEmit && npx eslint mcp/tools src/lib/entities src/worker/fatos && npx jest` (suite inteira).
- **Verificacao:** tsc, eslint e jest verdes (CS8).
- **Resultado:** baseline de codigo limpo antes do rebuild.

---

## BLOCO F , Rebuild de containers + reprocesso

> Schema mudou (Bloco C) => rebuildar **todos** (app+mcp+worker). `src/lib/entities/**` e consumido pelas tools => mcp. Tools de detalhe em `mcp/**` => mcp. Builder em `src/worker/**` => worker (via imagem do app). SEMPRE da worktree, SEMPRE `--env-file .env.local`. Spec secao 9/10 + regra de raiz CLAUDE.md 2.1.

### F1. Rebuild app (atualiza imagem `nexus-odoo:local` que o worker reusa)
- **Arquivo:** nenhum.
- **Acao (da worktree):** `docker compose --env-file .env.local build app`.
- **Verificacao:** `docker image inspect nexus-odoo:local --format '{{.Created}}'` retorna timestamp de AGORA.
- **Resultado:** imagem base atualizada com builder novo de parceiro.

### F2. Subir worker + app recriados + provar schema novo DENTRO do container
- **Arquivo:** nenhum.
- **Acao:** `docker compose --env-file .env.local up -d --force-recreate worker app`.
- **Verificacao:**
  - `docker inspect nexus-odoo-worker-1 --format '{{.State.StartedAt}}'` posterior ao build; container `Up`.
  - **Prova de codigo novo (nao so data, regra de raiz 2.1):** `docker exec nexus-odoo-worker-1 grep -rq documentoDigits src/generated/prisma/` (o client gerado dentro do container ja tem a coluna nova). Se nao tiver, o build nao pegou => `docker compose --env-file .env.local build app` de novo.
- **Resultado:** worker rodando codigo novo, schema novo comprovado no container.

### F3. Rebuild + subir mcp
- **Arquivo:** nenhum.
- **Acao:** `docker compose --env-file .env.local up -d --build mcp`.
- **Verificacao:** container `nexus-odoo-mcp-1` `Up`; `docker exec nexus-odoo-mcp-1 ls mcp/tools/cadastros/detalhar-produto.js` (ou equivalente compilado) existe; sem crash loop em `docker logs nexus-odoo-mcp-1 --tail 30`.
- **Resultado:** MCP servindo as 4 tools novas + resolvedores.

### F4. Reprocesso/backfill conferido no container
- **Arquivo:** nenhum.
- **Acao:** o backfill SQL (C5) ja preencheu o historico. Confirmar consistencia futura: investigar antes se existe comando direcionado de rebuild do fato parceiro (`grep -rE "rebuild|reprocess" src/worker/ | grep -i parceiro` ou conferir scripts em `package.json`). Cravar o caminho: se houver script, rodar `<comando exato encontrado>`; se NAO houver, aguardar 1 ciclo do cron incremental do worker (intervalo confirmado em `src/worker/**`, padrao ~3min) e reconferir. Gate final:
  - `... -c "SELECT count(*) FROM fato_parceiro WHERE documento IS NOT NULL AND (documento_digits IS NULL OR documento_digits='');"` => **0** (cobre null E string vazia, alinhado a C3/C4).
- **Verificacao:** zero linhas com documento preenchido (com digitos) e digits nulo/vazio.
- **Resultado:** coluna consistente em todo o cache; pronto para E2E.

---

## BLOCO G , E2E contra o cache real (obrigatorio, spec secao 10)

> Cada resolvedor exercido contra dado real (`nexus-odoo-db-1`), conferindo `unica`/`ambigua`/`nenhuma`. Runner: arquivo `resolvers.e2e.test.ts` que instancia o Prisma client real (DATABASE_URL do `.env.local`), guard por env `E2E=1`. **Uma task por entidade**, cada uma com seu fixture (G0/B0), seus 3 asserts (unica/ambigua/nenhuma) e sua verificacao isolada `E2E=1 npx jest ... -t "<entidade>"`. Arquivo unico, mas tasks por-entidade para isolar falha.

### G0. Coletar fixtures de ambiguidade + ancorar o fixture de documento backfillado
- **Arquivo:** `src/lib/entities/__tests__/e2e/fixtures.md` (novo, registro das evidencias).
- **Acao:** por entidade, alem da chave forte do B0, achar 1 nome que casa N>1 linhas (caso `ambigua`). Ex.: `... -c "SELECT nome, count(*) c FROM fato_produto GROUP BY nome HAVING count(*)>1 ORDER BY c DESC LIMIT 5;"`; idem parceiro. Se nao houver ambiguidade natural, DOCUMENTAR e usar caso construido (CS3). **Ancorar o fixture de documento:** `... -c "SELECT odoo_id, documento, documento_digits FROM fato_parceiro WHERE documento LIKE 'BR-%' AND documento_digits IS NOT NULL LIMIT 1;"` , registrar o `odoo_id` + os 3 formatos derivados (com BR/mascara, so mascara, so digitos) para o assert CS5.
- **Verificacao:** `fixtures.md` preenchido: por entidade 1 chave-forte + 1 nome ambiguo (ou nota de caso construido); 1 parceiro com `BR-` + digits backfillado + os 3 formatos.
- **Resultado:** base do E2E ancorada no dado.

### G1. E2E armazem
- **Arquivo:** `src/lib/entities/__tests__/e2e/resolvers.e2e.test.ts` (criar; `describe("armazem")`).
- **Acao:** 3 asserts: `nome_unico` real do fixture => `unica` odooId bate; nome ambiguo (ou construido) => `ambigua` ordenada por score `length<=topN`; `nome_unico` inexistente => `nenhuma`.
- **Verificacao:** `E2E=1 npx jest src/lib/entities/__tests__/e2e/resolvers.e2e.test.ts -t "armazem"` VERDE.
- **Resultado:** armazem comprovado contra cache real.

### G2. E2E produto
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("produto")`).
- **Acao:** `codigoUnico` real => `unica`; nome ambiguo => `ambigua`; EAN >=7 digitos inexistente => `nenhuma` (jamais fuzzy de substring, CS4).
- **Verificacao:** `E2E=1 npx jest ... -t "produto"` VERDE.
- **Resultado:** produto comprovado.

### G3. E2E nota fiscal
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("nota-fiscal")`).
- **Acao:** `chave` de 44d real => `unica`; chave de 50d/com letra => `nenhuma` (nao roteia); id inexistente => `nenhuma`.
- **Verificacao:** `E2E=1 npx jest ... -t "nota-fiscal"` VERDE.
- **Resultado:** NF comprovada.

### G4. E2E conta contabil
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("conta-contabil")`).
- **Acao:** `codigo` "x.y.z" real => `unica`; mesmo codigo sem pontos => `unica` (mesmo odooId); **anti-falso-positivo real:** um codigo sem pontos que e prefixo de outro NAO casa o mais longo; nome ambiguo => `ambigua`.
- **Verificacao:** `E2E=1 npx jest ... -t "conta-contabil"` VERDE.
- **Resultado:** conta contabil comprovada, com defesa anti-falso-positivo contra dado real.

### G5. E2E conta referencial
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("conta-referencial")`).
- **Acao:** `codigo` real => `unica`; `nomeCompleto` ambiguo => `ambigua`; inexistente => `nenhuma`.
- **Verificacao:** `E2E=1 npx jest ... -t "conta-referencial"` VERDE.
- **Resultado:** conta referencial comprovada.

### G6. E2E pedido
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("pedido")`).
- **Acao:** `numero` `PREFIXO-NNNN/AA` real => `unica`; "pedido 123" (fora do formato) => `nenhuma`; numero repetido em tipos diferentes => `ambigua` (ou `unica` com `filtros.tipo`).
- **Verificacao:** `E2E=1 npx jest ... -t "pedido"` VERDE.
- **Resultado:** pedido comprovado.

### G7. E2E natureza de operacao (com invariante de namespace)
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("natureza-operacao")`).
- **Acao:** `codigo` "001" real => `unica` com `codigo`/`descricao` corretos; **assert negativo de namespace:** ref "1" (ou "001") NAO retorna a entidade de odoo_id=1 de outra tabela (resolve so dentro de `fato_referencia` por `codigo` string); descricao ambigua => `ambigua`.
- **Verificacao:** `E2E=1 npx jest ... -t "natureza-operacao"` VERDE.
- **Resultado:** natureza comprovada; invariante de namespace provado contra dado real.

### G8. E2E centro de resultado
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("centro-resultado")`).
- **Acao:** id real (`centroResultadoId`) => `unica`; nome fuzzy => `unica`/`ambigua`; inexistente => `nenhuma`.
- **Verificacao:** `E2E=1 npx jest ... -t "centro-resultado"` VERDE.
- **Resultado:** centro comprovado.

### G9. E2E parceiro (documento nos 3 formatos, ancorado em G0)
- **Arquivo:** `resolvers.e2e.test.ts` (`describe("parceiro")`).
- **Acao:** usando o fixture ancorado em G0 (odooId + 3 formatos): resolver `BR-07.390.039/0001-01`, `07.390.039/0001-01` e `07390039000101` => os 3 retornam `unica` com o MESMO odooId (CS5, prova o backfill `documentoDigits`); nome ambiguo => `ambigua`; documento inexistente => `nenhuma`.
- **Verificacao:** `E2E=1 npx jest ... -t "parceiro"` VERDE.
- **Resultado:** parceiro comprovado; CS5 (3 formatos) provado contra o backfill real.

### G10. E2E das 4 tools de detalhe via MCP no container
- **Arquivo:** nenhum (exercicio manual/script).
- **Acao:** com fixtures reais, chamar cada `*_detalhar_*` (via `docker exec nexus-odoo-mcp-1` invocando o handler, ou pelo endpoint MCP local): id real => campos canonicos batem com o `SELECT` direto; id inexistente => `{ encontrado:false }` (CS6); `contabil_detalhar_conta` com role `viewer` => negado (`DomainDeniedError`), com `admin` => ok.
- **Verificacao:** saidas conferem com o banco; gating respeitado (viewer negado, admin ok).
- **Resultado:** tools de detalhe validadas end-to-end.

### G11. Teste do log de ambiguidade (unidade do helper + insercao via tool em Node local)
- **Arquivo:** `src/lib/entities/__tests__/_lacuna.integration.test.ts` (novo) ou script Node local.
- **Acao:** na Fase 2 NAO existe agente; o E2E e: (1) chamar `formatarLacunaAmbiguidade("produto","esteira",4)` em Node local => string esperada; (2) inserir essa string via a tool existente `registrar_lacuna` (chamando o handler diretamente em Node, passando `perguntaResumo` = a string), provando o formato de gravacao; (3) conferir 1 linha em `feature_requests`. Confirmar que as tools de detalhe NAO logam.
- **Verificacao:** `... -c "SELECT pergunta_resumo FROM feature_requests ORDER BY id DESC LIMIT 1;"` mostra `ambiguidade:produto:"esteira" (4 candidatas)`.
- **Resultado:** canal de log de ambiguidade comprovado (resolvedor permanece puro; sem runner de agente fantasma).

---

## BLOCO H , Code review final

### H1. `/gsd-code-review` dos arquivos da fase
- **Arquivo:** nenhum (auditoria).
- **Acao:** rodar `/gsd-code-review` sobre `src/lib/entities/**`, as 4 tools de detalhe, `src/worker/fatos/fato-parceiro.ts`, a migration e o integration.test. Focar: invariante "nunca entidade falsa" (na duvida `ambigua`), CS4 (codigo longo so exato), CS5 (documento 3 formatos), anti-falso-positivo do codigo contabil sem pontos, performance (nenhum `findMany` cego em parceiro/produto/NF; cardinalidade baixa documentada em armazem/conta/centro), Zod das tools, gating de `contabil_detalhar_conta` (viewer/manager negados).
- **Verificacao:** achados materiais corrigidos; review sem pendencia bloqueante.
- **Resultado:** fase auditada.

### H2. Verificacao final consolidada
- **Arquivo:** nenhum.
- **Acao:** `npx tsc --noEmit && npx eslint . && npx jest` (suite completa) + `E2E=1 npx jest src/lib/entities/__tests__/e2e/resolvers.e2e.test.ts` + reconfirmar containers `Up` e datas de imagem recentes. `superpowers:verification-before-completion` com evidencia colada.
- **Verificacao:** tudo verde; evidencia E2E registrada (CS1-CS8).
- **Resultado:** Fase 2 pronta para PR.

---

## RESUMO

O plano decompoe a Fase 2 em 9 blocos e ~80 tasks atomicas, cada uma com arquivo exato, acao, verificacao e resultado. Bloco A constroi os helpers `_shared` de `src/lib/entities/` decompostos por unidade testavel (`levenshtein`, `normalizar`, `scoreFuzzy`, `_documento`, `_classificar-ref`, `sinonimias`, `_lacuna`), e o barrel reconcilia o tipo divergente de empresa via adaptador. Bloco B entrega 8 resolvedores (armazem, produto, NF, conta contabil, conta referencial, pedido, natureza, centro), cada um decomposto em sub-tasks por ramo (mapeador, ramos exatos, ramo fuzzy/hierarquico, filtros), com TDD por ramo e fixtures reais coletados em B0. O ramo "codigo sem pontos" das contas foi cravado com comparacao por igualdade de digits e caso anti-falso-positivo. Bloco C faz a migration manual (`documentoDigits` + indices de `chave`), `prisma generate`, builder do worker e backfill via `migrate deploy`, com o backfill SQL alinhado ao builder por `NULLIF`. Bloco C-bis entrega o `resolverParceiro` depois do schema (unica dependencia cruzada), adicionando o export `./parceiro` ao barrel so aqui. Bloco D cria as 4 tools de detalhe em pares teste/impl, com gate de schema-truth (D0) antes de cravar outputs e gate de role testado para a conta contabil (viewer/manager negados). Bloco E decompoe o fix do integration.test (arrays `*_IDS`, `TODOS_IDS`/`toEqual`, contagens com a aritmetica do gating cravada, teste novo de role, titulos desatualizados). Bloco F rebuilda app/worker/mcp da worktree com `--env-file .env.local`, provando o schema novo dentro do container. Bloco G exerce cada resolvedor contra o cache real em 1 task por entidade (incluindo invariante de namespace da natureza e os 3 formatos de documento ancorados no backfill) + tools de detalhe + log. Bloco H roda code review e verificacao final.

### Primeira task concreta
**A0** , criar a pasta `src/lib/entities/`. Verificacao: `test -d src/lib/entities && echo ok`. Resultado: diretorio existe. Em seguida A1 (`src/lib/entities/types.ts` com `Resolucao<T>`/`Candidata<T>`/`ResolverOpcoes`/`Resolver<T>`, verificado por `npx tsc --noEmit`).
