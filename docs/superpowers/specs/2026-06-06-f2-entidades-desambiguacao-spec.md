# SPEC v3 (consolidada apos 2 reviews) , Fase 2 do Nex: Resolucao de Entidades + Desambiguacao

**Data:** 2026-06-06
**Branch:** feat/nex-reconstrucao
**Fase:** 2 (Resolucao de Entidades + Desambiguacao)
**Status:** v3 consolidada. Incorpora os achados B1-B3, A1-A3, M1-M5, L1-L2 da review #1 e os achados CRITICO/ALTO/MEDIO/BAIXO da review #2. Todos os campos abaixo foram confrontados contra `nexus-odoo-db-1` / base `nexus_odoo_l1` (cache real) nesta sessao, com os `SELECT` registrados na secao 11.
**Fonte da verdade:** `docs/superpowers/research/2026-06-06-dossie-MASTER.md` secao 4.2; `docs/superpowers/research/2026-06-06-dossie-transversal.md` secao 1; dossies de dominio.
**Padrao a generalizar:** `src/lib/metrics/_shared/empresa.ts` (`resolverEmpresa`) + `mcp/tools/fiscal/_escopo-empresa.ts` (`montarEscopoEmpresa`), entregues e em producao na F1.

---

## 1. OBJETIVO + CRITERIO DE SUCESSO

### Objetivo
Transformar, em **codigo deterministico**, o termo livre que o usuario digita ("Matrix", "esteira T600X", "armazem de demonstracao", "pedido DV-0001/26", "1.1.01.01", "chave NFe de 44 digitos") na **entidade canonica correta do ERP** (sempre com `odoo_id`), seguindo uma estrategia uniforme de resolucao por chave (`id > chave forte exata > nome fuzzy`). Quando a entrada e ambigua, retornar **candidatas top-N com score** para o agente perguntar de volta, **nunca chutar uma entidade falsa**. Generaliza o padrao `resolverEmpresa` (ja feito) para: Armazem/Local, Parceiro, Produto, Nota Fiscal, Conta Contabil, Pedido, Natureza de Operacao, Conta Referencial SPED e Centro de Resultado.

Entregaveis concretos:
1. **Resolvedor generico** de entidades em `src/lib/entities/`, com contrato `ref + filtros` (secao 3.2) reusavel por todas as tools.
2. **Regra de desambiguacao uniforme** (id > chave forte exata > nome fuzzy Levenshtein; ambiguo => top-N com score; codigo numerico longo so casa exato), na secao 5.
3. **Tabela de sinonimias de negocio** confrontada com os valores reais do cache (familia, marca, etapa, natureza, status, tipo de parceiro), na secao 6.
4. **Tools MCP de "detalhe por id"** que hoje sao gap (dossie MASTER tier-1 #5): produto, pedido, conta contabil, nota fiscal por `odoo_id` (parceiro JA existe via `cadastro_detalhar_parceiro`).
5. **Log de ambiguidade** em `feature_requests`, reusando o canal de `registrar_lacuna` (a gravacao e disparada pelo agente via tool, nao por efeito colateral interno; secao 8).
6. **Indices de schema** para as chaves fortes nao indexadas (`fato_parceiro.documento` normalizado, `fato_nota_fiscal.chave`), pre-requisito da resolucao barata (secao 9).

### Criterio de sucesso (verificavel)
- **CS1.** Para cada entidade (9 resolvedores) existe `resolver<Entidade>(prisma, ref, opcoes?)` retornando `{ status: 'unica' | 'ambigua' | 'nenhuma' }`, com testes unitarios cobrindo os 3 ramos.
- **CS2.** Teste E2E contra o cache real: um termo conhecido de cada entidade (extraido do banco) resolve para o `odoo_id` correto comprovado por consulta direta.
- **CS3.** Termo deliberadamente ambiguo retorna `status: 'ambigua'` com `candidatas` ordenadas por `score` desc, com `score` exposto em cada candidata, e **nunca** `status: 'unica'`. Se nao houver ambiguidade natural no cache, o teste documenta e usa caso construido (secao 11 passo 5).
- **CS4.** Codigo numerico de >=7 digitos so resolve por match **exato** (id ou codigo), nunca por fuzzy de nome. Aplica-se a id, EAN e codigo contabil; **nao** se aplica a numero de pedido/NF (que sao alfanumericos, ver 4.4/4.6) , a defesa la e o regex de formato, nao o corte numerico.
- **CS5.** Documento (CNPJ/CPF) resolve igual com mascara, sem mascara e com o prefixo `BR-` (que o cache carrega). Comparacao normaliza **os dois lados** por `replace(/\D/g, '')`. Fixture obrigatoria com o `BR-` real.
- **CS6.** As 4 tools de detalhe-por-id retornam `{ encontrado: false }` (nao erro) quando o `odoo_id` nao existe, e o registro completo quando existe, validado por Zod.
- **CS7.** Quando o agente chama `registrar_lacuna` apos uma resolucao `ambigua`/`nenhuma` de uma tool de **busca por nome**, grava uma linha em `feature_requests` no formato de ambiguidade. As tools de **detalhe por id** nao logam ambiguidade (so aceitam `odooId`, nunca produzem ambiguidade; ver 8).
- **CS8.** `tsc` + `eslint` + `jest` verdes; a migration de indice aplica sem perda; nenhuma tool nova trunca em 10 (respeita take 50).

---

## 2. NAO-OBJETIVOS (fronteiras firmes)

- **Cerebro de orquestracao e Fase 3.** Esta fase NAO decide *quando* resolver, *qual* entidade o usuario quis, nem classifica intencao. Ela so **oferece a funcao** de resolver. Quem compoe (resolver parceiro -> filtrar pedidos dele) e o orquestrador (Fase 3); os resolvedores entregam as pecas.
- **Apresentacao / NLG e Fase 4.** Esta fase retorna `candidatas` estruturadas com `score`; o texto humanizado ("voce quis dizer A, B ou C?") e Fase 4. O campo `aviso` e placeholder minimo.
- **Nao construir fatos novos.** Todas as entidades ja tem fato/dim/raw populado. Se faltar um campo, a fase **documenta o gap**, nao cria fato.
- **Sem escrita no Odoo.** Resolucao e leitura pura do cache. Nenhuma `WriteToolEntry`.
- **Sem RAG / embeddings.** Fuzzy e Levenshtein deterministico em codigo, nunca LLM nem vetor.
- **Nao reescrever `resolverEmpresa` de forma destrutiva.** Empresa esta feito e em producao; e o *molde*. POReM o molde tem um anti-padrao de performance (`findMany()` sem `where`, ver 3.4) que **nao deve ser copiado**: os novos resolvedores filtram no banco. Empresa pode receber o mesmo refactor em passo opcional (base pequena, ~20 linhas, por isso passou), sem quebrar a assinatura atual.
- **Parceiro: nao duplicar.** Ja existem `cadastro_buscar_parceiro` e `cadastro_detalhar_parceiro`. A fase entrega `resolverParceiro` (resolucao 1:1) que essas tools podem reusar internamente, sem recriar busca/detalhe.
- **Natureza de operacao: nao criar fonte nova.** Ja existe `fato_referencia` (tabela `natureza_operacao`, 104 linhas = cadastro inteiro) e a tool `referencia_buscar`. `resolverNaturezaOperacao` le de `fato_referencia`, nao parseia Json de `raw_sped_natureza_operacao` (ver 4.7).

---

## 3. ARQUITETURA DO RESOLVEDOR GENERICO

### 3.1 Onde vivem os modulos
```
src/lib/entities/
  types.ts             -> tipos genericos (Resolucao<T>, Candidata<T> com score, ResolverOpcoes)
  _fuzzy.ts            -> Levenshtein + normalizacao (lower, sem acento, trim)
  _documento.ts        -> normaliza CNPJ/CPF: replace(/\D/g,'') nos DOIS lados; cache tem prefixo BR- + mascara
  _classificar-ref.ts  -> classifica a entrada: id | documento | codigo_numerico_longo | chave_nfe | texto
  sinonimias.ts        -> tabela de sinonimias confrontada com valores reais do cache
  armazem.ts           -> resolverArmazem
  parceiro.ts          -> resolverParceiro
  produto.ts           -> resolverProduto
  nota-fiscal.ts       -> resolverNotaFiscal
  conta-contabil.ts    -> resolverContaContabil
  conta-referencial.ts -> resolverContaReferencial
  pedido.ts            -> resolverPedido
  natureza-operacao.ts -> resolverNaturezaOperacao (le de fato_referencia)
  centro-resultado.ts  -> resolverCentroResultado
  index.ts             -> reexporta tudo
```
Empresa permanece em `src/lib/metrics/_shared/empresa.ts` (reexportada de `entities/index.ts`). Os defaults por entidade (topN, limiarFuzzy) vivem como **constante exportada no proprio modulo da entidade** e sao 100% sobrescritiveis por `opcoes` (a Fase 3 nunca edita `entities/`).

### 3.2 Assinatura unica reusavel com `ref` + `filtros`
```ts
export interface ResolverOpcoes {
  topN?: number;                      // default por entidade (produto 5, demais 3)
  limiarFuzzy?: number;               // default por entidade (produto/armazem 0.8, demais 0.75)
  margemFolga?: number;               // folga minima top1-top2 para promover a unica (default 0.1)
  filtros?: Record<string, unknown>;  // chaves compostas e desambiguadores: { tipo, serie, modelo, ehCliente, familiaId, ... }
}

export interface Candidata<T> { entidade: T; score: number; } // score: 1 = match exato; <1 = fuzzy

export type Resolucao<T> =
  | { status: "unica";   entidade: T; score: number }
  | { status: "ambigua"; candidatas: Candidata<T>[]; criterio: "documento" | "codigo" | "chave" | "nome" }
  | { status: "nenhuma" };

export type Resolver<T> = (
  prisma: PrismaClient,
  ref: string,                        // SEMPRE o identificador primario TEXTUAL da entidade
  opcoes?: ResolverOpcoes,            // chaves compostas/secundarias entram por opcoes.filtros
) => Promise<Resolucao<T>>;
```
Decisoes travadas pela review #2:
- **`ref` e sempre o identificador primario textual.** Chaves compostas e filtros secundarios entram por `opcoes.filtros`. Contrato exato de cada entidade composta esta cravado na secao 4 (qual campo e `ref`, quais sao `filtros`). Nada e "adiado para a Fase 3".
- **`score` faz parte do tipo.** `unica` carrega `score` (confianca); cada candidata ambigua carrega `score`. A regra de folga (secao 5) depende disso. O tipo nao joga fora a informacao que justifica a ordenacao.

### 3.3 Fluxo interno padrao (generalizado de `resolverEmpresa`)
1. `trim` + `classificarRef(ref)`.
2. **Ramo id**: `ref` casa `^\d{1,9}$` (faixa Int32 do `odoo_id`) -> `findUnique({ where: { odooId } })`. Achou: `unica` (score 1). Nao achou: cai para os ramos abaixo. **Excecao namespace**: entidades cujo codigo curto colide com id (natureza `codigo`="001", ver 4.7) tem ramo proprio; o ramo id global nao se aplica a elas.
3. **Ramo chave forte** (varia por entidade): CNPJ/CPF (so digitos, dois lados), EAN/`codigoUnico`/`codigoBarras`, chave NFe (`^\d{44}$`), codigo contabil. **Filtra no banco com `where` indexado** (secao 3.4), nunca `findMany()` total. Match exato: 1 => `unica`, N => `ambigua`, 0 => proximo ramo.
4. **Ramo codigo numerico longo (>=7 digitos)**: match **exato** por id/codigo; nunca cai para fuzzy de nome (CS4). So aplica a entidades cujo codigo e numerico (id, EAN, codigo contabil sem pontos).
5. **Ramo nome fuzzy**: `where contains insensitive` para pre-filtrar no banco, depois ordena por Levenshtein normalizado (>= limiar). 1 acima do limiar com folga sobre o 2o => `unica`; varios proximos => `ambigua` (top-N com score); nenhum => `nenhuma`.
6. **Filtros de desambiguacao** (`opcoes.filtros`): aplicados como `where` adicional antes de decidir ambiguidade.

### 3.4 Performance: filtrar no banco, nunca carregar a tabela (corrige M1, M2, A4 da review #2)
O molde `resolverEmpresa` faz `prisma.dimEmpresaGrupo.findMany()` sem `where` e filtra em JS , aceitavel para ~20 empresas, **inviavel** para parceiro (7.069 linhas), produto (3.774), NF (49.374), conta (934). **Regra desta fase:** todo ramo de chave forte e de nome usa `where` no banco:
- **Ramo chave forte por coluna indexada** (`codigoUnico`, `codigoBarras` ja indexados; `chave` e `documento` ganham indice nesta fase, secao 9): `where` exato no banco.
- **Ramo documento (CNPJ/CPF):** o cache guarda `BR-07.390.039/0001-01` (prefixo + mascara). Comparar so digitos exige normalizar os dois lados. Como `documento` nao tem coluna de digitos, a fase adiciona **coluna derivada `documentoDigits`** (so digitos, indexada) preenchida no builder do fato e por migration de backfill, e o ramo CNPJ filtra `where: { documentoDigits: <digitos> }`. Alternativa rejeitada: `findMany` + filtro em JS (varre 7k linhas por chamada).
- **Ramo nome:** `where: { nome: { contains: termo, mode: 'insensitive' } }` pre-filtra no banco; o Levenshtein roda so sobre o conjunto reduzido.

---

## 4. POR ENTIDADE (chave preferida -> fallback, campos reais confrontados, armadilhas)

Campos confirmados contra `prisma/schema.prisma` e contra o cache real (`SELECT`s na secao 11).

### 4.1 Armazem / Local , `resolverArmazem` (corrige B1, M_armazem)
- **Fonte primaria:** `RawEstoqueLocal` (cadastro completo de locais, cobre locais sem saldo). Mapear via `data` Json. Cruzar com `FatoEstoqueSaldo` (`localId`, `localNome`) so para enriquecer saldo, nao como fonte de existencia. **Decisao:** usar o raw como fonte do resolvedor corrige o gap "armazem sem saldo fica invisivel" da review #2.
- **Keys reais do Json (confirmadas):** `id`, `nome`, `nome_completo`, `nome_unico`, `nome_tag`, `parent_path`, `local_superior_id`, `codigo_barras`, `nivel`, `tipo`. **Nao existe key `code`.**
- **Chave -> fallback:** `odoo_id` (=`id`) -> `nome_unico` (slug estavel e unico, ex.: "proprio") exato -> `nome_completo` fuzzy.
- **Candidata:** `{ odooId, nome, nomeUnico, nomeCompleto, nivel, tipo }`.
- **Armadilhas:** (a) `nome_completo` e hierarquico pai>filho (`parent_path` reflete a arvore); ao casar nome, normalizar e tambem tentar o ultimo segmento de `nome_completo`; (b) nome generico ("Estoque") e ambiguo , `opcoes.filtros` por `tipo`/`local_superior_id` desempata; (c) `codigo_barras` existe mas pode ser `false`/null , usar so se preenchido; **nao** ha codigo sequencial de armazem.

### 4.2 Parceiro , `resolverParceiro` (corrige A1, M2)
- **Fonte:** `FatoParceiro`. Campos: `odooId, nome, nomeCompleto, documento, documentoDigits (novo), ehCliente, ehFornecedor, ehEmpresa, uf, cidade, dataCriacao`.
- **Chave -> fallback:** `odoo_id` -> `documentoDigits` (CNPJ/CPF so digitos, indexado) -> `nome`/`nomeCompleto` fuzzy.
- **Candidata:** `{ odooId, nome, nomeCompleto, documento, ehCliente, ehFornecedor, uf, cidade }`.
- **Armadilhas:** (a) **o cache guarda `BR-07.390.039/0001-01`** , prefixo `BR-` + mascara em 100% dos preenchidos; a normalizacao `replace(/\D/g,'')` descarta `BR` e a pontuacao nos dois lados; (b) parceiro pode ser cliente E fornecedor (overlap) , filtro `opcoes.filtros.ehCliente/ehFornecedor`; (c) homonimos , `dataCriacao`/`uf`/`cidade` como desempate exibido; (d) **nao duplicar** `cadastro_buscar_parceiro`/`cadastro_detalhar_parceiro` , esta funcao e a resolucao 1:1.

### 4.3 Produto , `resolverProduto`
- **Fonte:** `FatoProduto`. Campos: `odooId, nome, codigo, codigoUnico, codigoBarras, ativo, marcaId, marcaNome, familiaId, familiaNome, unidadeNome, precoVenda, precoCusto`.
- **Chave -> fallback:** `odoo_id` -> `codigoUnico`/`codigoBarras` (EAN, exato, indexados) -> `codigo` (interno, exato) -> `nome` fuzzy (limiar 0.8, top-5).
- **Candidata:** `{ odooId, nome, codigo, codigoUnico, marcaNome, familiaNome, ativo }`.
- **Armadilhas:** (a) `codigoUnico`/`codigoBarras` sao `String?` , pre-filtrar `IS NOT NULL`; (b) `codigo` e sequencial sem logica , preferir `codigoUnico`/`odoo_id`; (c) filtrar por familia/marca via `opcoes.filtros` quando ambiguo; (d) candidatas inativas vao por ultimo (score penalizado) mas nao escondidas, marcando `ativo`.

### 4.4 Nota Fiscal , `resolverNotaFiscal` (corrige B3, M2)
- **Fonte:** `FatoNotaFiscal`. Campos: `odooId, numero, serie, modelo, entradaSaida, situacaoNfe, chave, participanteId, participanteNome, naturezaOperacaoId, dataEmissao, vrNf`.
- **Realidade do dado (confirmada):** `numero` e **100% NULL** (0/49.374). `chave` tem lengths {44: 45.111, 50: 1.771, 9: 582, 41: 40}; ~1.870 notas sem chave; existem chaves com caractere nao-numerico.
- **Chave -> fallback:** `odoo_id` -> `chave` (somente quando casa `^\d{44}$`, indexada nesta fase) -> intervalo de data + `entradaSaida` (via `opcoes.filtros`, retorna lista, **nunca `unica` por data sozinha**).
- **Removido:** `numero+serie+modelo` como chave (impossivel, `numero` vazio). Documentado como gap: a numeracao da NF nao esta populada no cache; investigar de qual coluna/raw vem em onda futura (RADAR).
- **Candidata:** `{ odooId, serie, modelo, chave, situacaoNfe, participanteNome, dataEmissao, vrNf }`.
- **Armadilhas:** (a) `classificarRef` so roteia para o ramo chave NFe quando `^\d{44}$`; chaves de 9/41/50 ou com letra **nao** sao classificadas como NFe (origem dessas anomalias e ponto de RADAR, nao se classifica nem falha silenciosamente); (b) `chave` de 44d e unica em todo Odoo, mas 14 digitos (CNPJ) e id curto nunca colidem com 44; (c) `situacaoNfe='cancelada'` aparece nas candidatas marcada (excluir cancelada e regra de metrica, nao de identidade).

### 4.5 Conta Contabil , `resolverContaContabil` (e plano referencial separado, corrige M4)
- **Fonte:** `FatoContaContabil` (plano da empresa). Campos: `odooId, codigo, nome, tipo, nivel, natureza, contaPaiId, contaPaiNome, parentPath`.
- **Chave -> fallback:** `odoo_id` -> `codigo` (ex.: "1.1.01.01", unico no plano; normalizar removendo pontos para aceitar "110101") -> `nome` fuzzy (limiar 0.75, top-3).
- **Candidata:** `{ odooId, codigo, nome, tipo, natureza }`.
- **Armadilhas:** (a) `codigo` com pontos , normalizar nos dois lados no match exato; (b) filtrar por `natureza`/`tipo` via `opcoes.filtros` quando ambiguo; (c) `parentPath`/`contaPaiNome` para mostrar hierarquia.
- **Dois planos , decisao travada:** o plano referencial SPED existe como fato proprio (`FatoContabilContaReferencial`, **2.216 linhas confirmadas**). NAO e parametro de `opcoes`; e **entidade propria** (`resolverContaReferencial`, 4.6) porque tem candidata com campo distinto (`nomeCompleto`). `resolverContaContabil` resolve sempre o plano da empresa; o referencial e funcao separada porque o MASTER 3.5 lista `saldo_conta_referencial_data` como metrica.

### 4.6 Conta Referencial SPED , `resolverContaReferencial` (entidade propria, corrige M4)
- **Fonte:** `FatoContabilContaReferencial`. Inclui `nomeCompleto` (que `FatoContaContabil` nao tem).
- **Chave -> fallback:** `odoo_id` -> `codigo` (normalizado) -> `nomeCompleto`/`nome` fuzzy (limiar 0.75, top-3).
- **Candidata:** `{ odooId, codigo, nome, nomeCompleto }`.
- **Armadilha:** mesmo molde da conta contabil; a diferenca e a fonte e o `nomeCompleto` na candidata.

### 4.7 Pedido , `resolverPedido` (corrige B2)
- **Fonte:** `FatoPedido`. Campos: `odooId, numero, tipo, etapaId, etapaNome, etapaFinaliza, participanteId, participanteNome, vendedorId, vendedorNome, empresaId, dataOrcamento, vrProdutos`.
- **Realidade do dado (confirmada):** `tipo` ∈ `{compra, devolucao_venda, inventario, producao, romaneio, transferencia_entrada, transferencia_saida, transferencia_solicitacao, venda}` , **nao existe "ORC"/"VEN"**. `numero` e alfanumerico no formato `PREFIXO-NNNN/AA` (ex.: `DV-0001/26`, `TRANSF-0014/26`) , **nao e inteiro**.
- **Chave -> fallback:** `odoo_id` -> `numero` (regex `^[A-Z]+-\d+/\d{2}$`, exato; `opcoes.filtros.tipo` desempata quando o mesmo numero existe em tipos diferentes) -> intervalo de data + tipo (via filtros, lista) -> por parceiro (`opcoes.filtros.participanteId`, lista).
- **Candidata:** `{ odooId, numero, tipo, etapaNome, participanteNome, dataOrcamento, vrProdutos }`.
- **Armadilhas:** (a) "pedido 123" sem o formato canonico nao casa nada (o numero real e `DV-0001/26`); a defesa nao e "numero >=7 digitos" (CS4 nao se aplica, numero e alfanumerico) e sim o regex de formato; (b) `tipo` documentado como o enum real de 9 valores , a sinonimia de etapa (`etapaFinaliza`) continua valida; (c) "pedido do cliente X": resolver parceiro antes (composicao no orquestrador) e filtrar por `participanteId`.

### 4.8 Natureza de Operacao , `resolverNaturezaOperacao` (corrige A2 + CRITICO da review #2)
- **Fonte:** `fato_referencia` (filtro `tabela='natureza_operacao'`). **Confirmado: 104 linhas = cadastro inteiro** (igual ao raw, 104). Reusa a query de `referencia_buscar`. NAO parseia Json de `raw_sped_natureza_operacao` (eliminado para nao criar segunda fonte de verdade).
- **Campos de `fato_referencia`:** `codigo`, `descricao`, `tabela`.
- **Chave -> fallback:** `codigo` exato (ex.: "001", preservando leading zeros como string) -> `descricao` fuzzy. **Namespace proprio:** o ramo id global NAO se aplica , `codigo`="001" e curto e colidiria com `odoo_id=1`. Resolucao de natureza casa `codigo` como string com zeros, distinta de id.
- **Candidata:** `{ codigo, descricao }`.
- **Armadilhas:** (a) `codigo` numerico curto com leading zeros , tratar como string, nunca `Number()`; (b) cadastro inteiro coberto (104/104), sem gap de "so naturezas usadas em notas".

### 4.9 Centro de Resultado , `resolverCentroResultado` (decisao travada, corrige M3 + MEDIO review #2)
- **Decisao:** INCLUIR na F2. Esforco marginal (mesmo molde de armazem). Confirmado: 6 centros distintos em `FatoFinanceiroLancamentoItem`.
- **Fonte:** `DISTINCT (centroResultadoId, centroResultadoNome)` em `FatoFinanceiroLancamentoItem` (e tambem presente em `FatoFinanceiroMovimento`). Nao ha codigo.
- **Chave -> fallback:** `odoo_id` (=`centroResultadoId`) -> `centroResultadoNome` fuzzy.
- **Candidata:** `{ odooId, nome }`.
- **Armadilha:** so enxerga centros usados em lancamentos (gap documentado, mas com so 6 centros o impacto e baixo); se aparecer centro sem lancamento, RADAR.

---

## 5. DESAMBIGUACAO (regra uniforme)

- **Ordem de prioridade:** `id (1-9 digitos)` > `chave forte exata` (CNPJ/CPF, EAN/codigoUnico, chave NFe `^\d{44}$`, codigo contabil) > `codigo numerico longo exato` > `nome fuzzy`. Excecao: natureza de operacao tem namespace proprio (codigo string com zeros), nao passa pelo ramo id global.
- **Codigo numerico >=7 digitos:** somente match exato por id/codigo/EAN (CS4). **Nao** se aplica a numero de pedido/NF (alfanumericos) , la a defesa e o regex de formato.
- **Documento:** comparado **so por digitos** (`replace(/\D/g,'')`) nos **dois lados** (cache tem prefixo `BR-` + mascara). 11 digitos = CPF, 14 = CNPJ. Filtra por `documentoDigits` indexado (CS5).
- **Fuzzy (Levenshtein):** distancia normalizada `1 - dist/max(len)`; `score` = essa fracao. Limiar default 0.75; produto e armazem 0.8. Pre-filtro `contains insensitive` no banco; normalizar (lowercase, sem acento) os dois lados.
- **Quando `unica`:** exatamente 1 match por chave forte (`score` 1); OU no ramo nome, 1 candidato acima do limiar **com folga `margemFolga` sobre o 2o** (default 0.1). Senao `ambigua`.
- **Quando `ambigua`:** retorna `candidatas` (cada uma com `score`) ordenadas desc, cortadas em `topN`. Inclui `criterio` (documento|codigo|chave|nome).
- **Quando `nenhuma`:** zero candidatos por qualquer ramo. Nunca inventa.
- **Nunca entidade falsa:** invariante de codigo , na duvida, `ambigua`. **Politica conservadora ate calibrar:** os limiares (0.75/0.8) e a `margemFolga` (0.1) sao defaults nao calibrados; ate haver calibracao empirica com fixtures reais (secao 11), erra para `ambigua` (pergunta de volta) e nunca para `unica` falsa.

---

## 6. SINONIMIAS DE NEGOCIO (`sinonimias.ts`) , confrontadas com valores reais

Tabela estatica (TS), termo do usuario => filtro deterministico. Mapeamento de vocabulario para `where`, nao busca de entidade. Valores confirmados no cache:

- **Tipo de parceiro:** "cliente" => `{ ehCliente: true }`; "fornecedor" => `{ ehFornecedor: true }`; "empresa/PJ" => `{ ehEmpresa: true }`.
- **Status de produto:** "ativo" => `{ ativo: true }`; "inativo/arquivado" => `{ ativo: false }`.
- **Etapa de pedido:** "aberto/em aberto/andamento" => `{ etapaFinaliza: false }`; "fechado/finalizado/concluido" => `{ etapaFinaliza: true }`. Etapas nomeadas resolvem por `etapaNome` quando o dossie comercial trouxer o vocabulario.
- **Tipo de pedido (enum real, confirmado):** mapear vocabulario do usuario para os 9 valores reais , "venda" => `venda`; "compra" => `compra`; "devolucao de venda" => `devolucao_venda`; "transferencia" => `{transferencia_entrada, transferencia_saida, transferencia_solicitacao}` (familia); "inventario" => `inventario`; "producao" => `producao`; "romaneio" => `romaneio`. **Sem "ORC"/"VEN".**
- **Sentido de NF (confirmado {0,1}):** "entrada/compra" => `{ entradaSaida: '0' }`; "saida/venda" => `{ entradaSaida: '1' }`. (L1: codificacao 0/1 CONFIRMADA, nao e mais ponto aberto.)
- **Situacao de NF (7 valores reais, confirmados):** "autorizada" => `autorizada`; "cancelada" => `cancelada`; "denegada" => `denegada`; "rejeitada" => `rejeitada`; "inutilizada" => `inutilizada`; "em digitacao/digitando" => `em_digitacao`; "enviada" => `enviada`. Cobertura total dos 7.
- **Natureza contabil (3 valores reais, confirmados {01, 02, 04}):** mapa restrito a 01, 02, 04 com rotulo confrontado contra o dossie contabil. **Nao** criar entradas para 03/05..09 (nao existem no dado). De-para final fixado na execucao consultando o dossie.
- **Familia/Marca de produto:** NAO sao sinonimias estaticas , resolvem dinamicamente por `familiaNome`/`marcaNome` via `opcoes.filtros` no `resolverProduto`. A tabela so guarda apelidos fixos se o cliente usar (documentar, nao inventar).

Cada entrada de sinonimia tem teste. Nada de chute: o que esta acima foi confrontado com `SELECT DISTINCT` no cache.

---

## 7. TOOLS DE DETALHE-POR-ID (MCP)

Padrao identico a `cadastro_detalhar_parceiro` (`mcp/tools/cadastros/detalhar-parceiro.ts`): input `{ odooId }`, output `{ encontrado, <entidade>|null, _RESPOSTA }`, envelope `withFreshness` + enriquecimento, `dominio` declarado e `gatedRoles` quando o dado for sensivel. Gating real do projeto = `dominio` (filtra visibilidade por `user.domains`) + `gatedRoles` opcional (confirmado em `mcp/catalog/types.ts`), nao "RBAC do dominio" generico.

| Tool | Input | `dominio` | `gatedRoles` | Output (entidade) | Fonte | Status |
|---|---|---|---|---|---|---|
| `cadastro_detalhar_produto` | `{ odooId }` | `cadastros` | (nenhum) | `{ odooId, nome, codigo, codigoUnico, codigoBarras, marcaNome, familiaNome, unidadeNome, precoVenda, precoCusto, ativo, ncmCodigo }` | `FatoProduto` | GAP , criar |
| `comercial_detalhar_pedido` | `{ odooId }` | `comercial` | (nenhum) | `{ odooId, numero, tipo, etapaNome, etapaFinaliza, participanteNome, vendedorNome, empresaNome, dataOrcamento, dataAprovacao, vrProdutos, vrNf }` | `FatoPedido` | GAP , criar |
| `contabil_detalhar_conta` | `{ odooId }` | `contabil` | `['admin','super_admin']` (dado contabil sensivel) | `{ odooId, codigo, nome, tipo, natureza, nivel, contaPaiNome, parentPath }` | `FatoContaContabil` | GAP , criar |
| `fiscal_detalhar_nota` | `{ odooId }` | `fiscal` | (nenhum) | `{ odooId, serie, modelo, chave, entradaSaida, situacaoNfe, participanteNome, naturezaOperacaoNome, dataEmissao, vrNf, vrProdutos }` | `FatoNotaFiscal` | GAP , criar |
| `cadastro_detalhar_parceiro` | `{ odooId }` | `cadastros` | (ja existe) | (ja existe) | `FatoParceiro` | OK , reusar |

- Todas: `{ encontrado: false }` quando o id nao existe (nunca throw). `_RESPOSTA` minimo (texto definitivo e Fase 4).
- Aceitam **so `odooId` numerico**. Logo **nunca produzem ambiguidade** , o log de ambiguidade (secao 8) nao vive aqui.
- Cada `dominio`/`gatedRoles` da tabela e decisao de seguranca cravada nesta spec, nao implicita. `fiscal_detalhar_nota` remove `numero` do output (campo vazio no cache, ver 4.4).

---

## 8. LOG DE AMBIGUIDADE (`feature_requests`) , alinhado ao canon (corrige M_log review #2)

- O padrao canonico do projeto e: **a gravacao em `feature_requests` e disparada pelo AGENTE chamando a tool `registrar_lacuna`**, nao por efeito colateral interno de outra tool (confirmado em `mcp/tools/caminho3/registrar-lacuna.ts`).
- O **resolvedor permanece funcao pura** (`status:'ambigua'` no retorno, sem efeito colateral, testavel e idempotente).
- A ambiguidade nasce no resolvedor, sobe para a tool de **busca por nome** (que aceita texto), e o **agente (Fase 3)** decide chamar `registrar_lacuna` com um payload de ambiguidade (`dominio`, termo, qtd de candidatas). Helper opcional `formatarLacunaAmbiguidade(entidade, termo, qtd)` em `src/lib/entities/` so monta a string `ambiguidade:<entidade>:"<termo>" (<qtd> candidatas)` , nao grava nada.
- As tools de **detalhe por id** nao participam do log (so aceitam `odooId`, nunca ambiguas). CS7 reescrito para refletir isso.
- Sem PII alem do termo digitado e do `userId` ja presente no contexto MCP. Termo truncado a tamanho seguro.

---

## 9. IMPACTO NO CODIGO (incluindo migration de schema)

**Reusa (sem reescrever):**
- `resolverEmpresa` / `EmpresaResolucao` , molde da assinatura e do fluxo (corrigindo o `findMany()` cego, ver 3.4).
- `montarEscopoEmpresa` , molde do "escopo + aviso + desambiguar".
- `cadastro_detalhar_parceiro` , molde das 4 tools de detalhe; `resolverParceiro` pode alimentar `cadastro_buscar_parceiro`.
- `referencia_buscar` + `queryReferenciaBuscar` , fonte e query de natureza de operacao.
- `withFreshness`, `enriquecerEnvelope`, `paginacao` , infra de envelope.
- `registrar_lacuna` + `FeatureRequest` , canal de log (disparado pelo agente).
- Catalogo / `ToolEntry` (`dominio` + `gatedRoles`) , registro padrao.

**Novo:**
- `src/lib/entities/**` (9 resolvedores + helpers `_fuzzy`, `_documento`, `_classificar-ref`, `sinonimias`, `types`, `index`).
- 4 tools de detalhe (`cadastro_detalhar_produto`, `comercial_detalhar_pedido`, `contabil_detalhar_conta`, `fiscal_detalhar_nota`).
- `formatarLacunaAmbiguidade` (helper de string, sem efeito).
- Testes unitarios por resolvedor + por sinonimia + E2E.

**Mudanca de schema (migration, corrige M2 e contradicao do nao-objetivo antigo):**
- `FatoParceiro.documentoDigits String?` + `@@index([documentoDigits])`, preenchido no builder do fato e por backfill.
- `@@index([chave])` em `FatoNotaFiscal`.
- (Avaliar `@@index` em `codigo` de `FatoContaContabil`/`FatoContabilContaReferencial` se o ramo codigo for quente.)
- **Consequencia (regra de raiz §2.1):** schema mudou => rebuildar **todos** (app + mcp + worker) e rodar migration. O builder do fato de parceiro (worker) muda para preencher `documentoDigits`. Disparar `agente schema-changed` apos a migration.

**Containers afetados:** `src/lib/entities/**` e consumido pelas tools MCP => `mcp`. Tools de detalhe em `mcp/tools/**` => `mcp`. Migration de schema + builder => `worker` e `app`.

---

## 10. PLANO DE TESTE E2E CONTRA DADO REAL (obrigatorio)

Regra de raiz: `tsc`/`eslint`/`jest` nao bastam. Subir o servico e exercer contra o cache real.

1. **Coleta de fixtures reais:** por entidade, extrair 1 registro existente e anotar `odoo_id`, chave forte e nome. Ex.: 1 produto com `codigoUnico` not null, 1 conta com codigo "x.y.z", 1 nota com `chave` de 44d, 1 pedido com `numero` no formato `PREFIXO-NNNN/AA`, 1 parceiro com `documento` `BR-...`, 1 natureza com `codigo` "001", 1 centro de resultado.
2. **Teste por chave forte:** resolver pela chave e conferir `odoo_id` casa com o fixture (CS2).
3. **Teste por id:** resolver pelo `odoo_id` em string e conferir `unica`.
4. **Teste de documento:** mesmo parceiro com `BR-07.390.039/0001-01`, `07.390.039/0001-01` e `07390039000101` => mesmo `odoo_id` (CS5). Fixture com o `BR-` real obrigatoria.
5. **Teste de ambiguidade:** escolher um nome que comprovadamente casa N linhas e conferir `ambigua` com `candidatas` ordenadas por `score` e `length<=topN` (CS3). **Se nao existir ambiguidade natural no cache, documentar e usar caso construido** (reconhece a limitacao, nao assume dado ambiguo).
6. **Teste de codigo longo:** EAN/id de >=7 digitos inexistente => `nenhuma`; jamais um produto cujo nome contenha o substring (CS4). Para pedido, "pedido 123" (fora do formato `PREFIXO-NNNN/AA`) => `nenhuma`.
7. **Teste de inexistente:** id inexistente => `nenhuma`; tool de detalhe => `{ encontrado: false }` (CS6).
8. **Teste das tools de detalhe:** subir o MCP, chamar cada `*_detalhar_*` com id real e conferir campos canonicos contra o banco; conferir `gatedRoles` de `contabil_detalhar_conta`.
9. **Teste do log:** agente chama `registrar_lacuna` apos `ambigua` de uma tool de busca e confere 1 linha em `feature_requests` no formato esperado (CS7).
10. **Migration + rebuild:** aplicar migration de indices, backfill `documentoDigits`, `docker compose build app` + `up -d --force-recreate worker` + `up -d --build mcp`, conferir data da imagem e exercer as chamadas reais antes de declarar pronto (§2.1).

---

## 11. EVIDENCIAS DO CACHE REAL (SELECTs desta sessao, base `nexus_odoo_l1`)

- `raw_estoque_local` keys: inclui `nome_unico`, `nome_completo`, `nome_tag`, `parent_path`, `local_superior_id`, `codigo_barras`, `nivel`, `tipo`. **Sem `code`.** (B1 confirmado.)
- `raw_sped_natureza_operacao` keys: `codigo`, `codigo_unico`, `nome`, `nome_unico`. **Sem `code`.** (A2 confirmado.)
- `fato_referencia WHERE tabela='natureza_operacao'`: **104 linhas = raw total (104)** , cadastro inteiro coberto. (CRITICO review #2 confirmado.)
- `fato_pedido.tipo` DISTINCT: 9 valores `{compra, devolucao_venda, inventario, producao, romaneio, transferencia_entrada, transferencia_saida, transferencia_solicitacao, venda}`. `numero` amostra: `DV-0001/26`, `TRANSF-0014/26`. (B2 confirmado.)
- `fato_nota_fiscal.numero`: 49.374/49.374 NULL. `chave` lengths: {44: 45.111, 50: 1.771, 9: 582, 41: 40}. (B3 confirmado.)
- `fato_parceiro.documento` amostra: `BR-07.390.039/0001-01`. (A1 confirmado.)
- `fato_conta_contabil.natureza` DISTINCT: `{01, 02, 04}`. (A3 confirmado.)
- `fato_nota_fiscal.situacao_nfe` DISTINCT: 7 valores. (M5 confirmado.)
- `fato_nota_fiscal.entrada_saida` DISTINCT: `{0, 1}`. (L1 confirmado.)
- `fato_contabil_conta_referencial`: 2.216 linhas. (M4 confirmado.)
- centro de resultado em `fato_financeiro_lancamento_item`: 6 distintos. (M3 confirmado.)

---

## RESUMO

A Fase 2 generaliza o padrao `resolverEmpresa` (em producao) para um **resolvedor generico de entidades** em `src/lib/entities/`, cobrindo Armazem, Parceiro, Produto, Nota Fiscal, Conta Contabil, Conta Referencial SPED, Pedido, Natureza de Operacao e Centro de Resultado. Cada entidade ganha `resolver<Entidade>(prisma, ref, opcoes?)` com retorno discriminado `unica/ambigua/nenhuma`, `score` no tipo, e chaves compostas por `opcoes.filtros` (`ref` e sempre o identificador primario textual). A ordem uniforme e `id > chave forte exata > nome fuzzy`; codigo numerico >=7 digitos so casa exato, documento compara so digitos nos dois lados (cache tem prefixo `BR-`), e ambiguidade retorna candidatas top-N com score , nunca entidade falsa. Esta v3 corrigiu, contra o cache real, tres bloqueantes de dado (armazem sem `code`, pedido com tipo/numero ficticios, NF com `numero` 100% null) e seis achados de forma (natureza via `fato_referencia` e nao Json; `code`->`codigo`; natureza contabil so 01/02/04; situacao NF com 7 valores; indices ausentes de `chave`/`documento`; conta referencial e centro de resultado promovidos a entidades proprias). O molde `findMany()` cego foi substituido por filtragem no banco. Quatro tools de detalhe-por-id (produto, pedido, conta, nota) preenchem o gap tier-1 #5; o log de ambiguidade segue o canon (agente chama `registrar_lacuna`, resolvedor permanece puro). Inclui migration de indices (`documentoDigits`, `chave`). Tudo e leitura do cache, deterministico, com teste E2E contra o dado real obrigatorio. Orquestracao e apresentacao ficam para Fase 3 e Fase 4.
