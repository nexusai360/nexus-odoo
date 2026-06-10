# SPEC , Fase 2: Intercompany + Receita Consolidada Externa

> Versão: **v3** (pós 2 reviews adversariais , fiscal + arquitetura, ambas validadas no cache real). Pronta para PLAN.
> Base: perícia `docs/superpowers/research/2026-06-09-pericia-faturamento-consolidado.md` (§2, §4, §7)
> e a Tabela de Regras da Fase 1 (`src/lib/fiscal/regras/`).
> Escopo ESTRITO. Ponte completa (Fase 3) e margem (Fase 4) são fases seguintes.

## 0. Mudanças aplicadas das 2 reviews (rastreabilidade)

**Review fiscal (BLOQUEIOS, validados no cache real):**
- **Marcação intercompany por `documento_digits` perde ~R$ 239 mi de intragrupo** (parceiros do
  grupo sem CNPJ no `fato_parceiro`, mas com CNPJ embutido no `participante_nome`). Medido:
  via doc = 3.801 notas / R$ 440,4 mi; **via doc OU nome = 6.230 notas / R$ 679,5 mi**. Como a
  visão C é "o faturamento real do dono", subnotificar infla a receita externa. **Correção:
  marcação em CASCATA** (documentoDigits do parceiro → fallback: raiz CNPJ extraída do
  `participante_nome` → `RAIZES_GRUPO`).
- **Confusão "bruto intercompany" (R$ 440/679 mi vr_nf) × "receita intragrupo eliminável"**
  (só a parcela `ehReceita` das notas intra). CPC 36 elimina a venda intragrupo, NÃO a
  transferência/remessa física. **Correção:** separar `intercompanyBrutoVrNf` (auditoria) de
  `receitaIntragrupoEliminavel` (~R$ 418 mi, entra na visão C). E2E trava nos números certos.
- **Devolução: `finalidade_nfe=4` de SAÍDA é majoritariamente devolução de COMPRA** (CFOP
  6202/6209..., `ehReceita=false`, NÃO deduz receita). A devolução de venda real (cliente
  externo devolve) é ENTRADA (CFOP 1202/2202, ~R$ 14,86 mi externa). **Correção:** dedução de
  receita usa `deduzReceita=true` da Tabela F1 sobre ENTRADAS, não `finalidade=4` de saída;
  fica FORA do escopo F2 (vai para a ponte/Fase 3), com a definição corrigida.

**Review arquitetura (BLOQUEIOS):**
- **`$queryRaw` com JOIN é a pior opção** (Decimal vira string, COUNT vira bigint, lista de
  ids no SQL, risco de double-count e de recorte temporal divergente). **Correção: duas
  queries NATIVAS + join em memória**, sem raw e sem migration (detalhe em §4.2). O item já
  tem `dataEmissao/entradaSaida/empresaId/situacaoNfe` desnormalizados; só falta o participante.
- **Reconciliação F1==F2 frágil** se o `cfop_nome` for resolvido por caminho diferente.
  **Correção:** F2 classifica por `cfopId` resolvendo o nome via **id-representante idêntico
  ao da F1** (`findMany distinct cfopId`), filtra por `i.dataEmissao` (do item) e conta nota
  com `documentoId` distinto.
- **`documento_digits` ≠ `documento`** (este tem máscara/prefixo `BR-`). Usar **`documentoDigits`**
  (indexado). `documento_id` JÁ tem índice (`@@index([documentoId])`); o JOIN lógico em memória
  dispensa índice de `participante_id`.
- **Matriz via `topLinhasJson`**: cravar shape `{vendedor,comprador,valor}`, limite top 10,
  `JSON.parse` com fallback `[]`.

## 1. Objetivo

Entregar a **visão C** da perícia , a **receita consolidada externa** ("o faturamento real" do
dono): só vendas a clientes FORA do grupo, eliminando o intercompany (venda intragrupo, CPC 36).
Introduzir a **marcação intercompany** robusta (cascata doc→nome) e combiná-la com a
classificação fiscal da Fase 1 (`ehReceita`). Entregar também a **matriz intercompany**
(quem vende para quem dentro do grupo), instrumento de auditoria.

## 2. Premissas validadas no dado real (2026-06-09)

- **`fato_nota_fiscal.participante_id` nunca é nulo** no recorte saída autorizada (34.416 notas).
- **`participante_nome` traz o CNPJ embutido** no padrão `"... NN.NNN.NNN/NNNN-NN - Razao [NN.NNN.NNN/NNNN-NN]"`.
- **Marcação intercompany em cascata** (medido):
  - via `documentoDigits` do parceiro: 3.801 notas / R$ 440,4 mi.
  - via doc OU CNPJ do nome: **6.230 notas / R$ 679,5 mi** (a definição correta).
- **Raízes de CNPJ do grupo (8 díg):** `07390039, 10557556, 18282961, 33718546, 34161829,
  34461908, 35156509, 45424185, 62673999` (perícia §2).
- **JOIN item→nota íntegro:** 0 itens órfãos; 101 notas sem item (R$ 113 mil, imaterial).
- **`documentoId` já indexado** (`schema.prisma @@index([documentoId])`). O item NÃO tem
  `participanteId` desnormalizado.

## 3. Decisões de política (perícia §7, canônicas; corrigidas pelas reviews)

- **Intercompany:** aparece na receita INDIVIDUAL por empresa (visão B, já existe) e é
  ELIMINADO na receita consolidada externa (visão C). CPC 36 elimina o leg de venda intragrupo
  A→B, preservando a venda externa final de B (sem dupla contagem).
- **Receita consolidada externa** = Σ `item.vrProdutos` dos itens com `ehReceita=true` (Tabela
  F1) **de notas cujo participante NÃO é do grupo** (cascata doc→nome).
- **Eliminável ≠ bruto:** só a parcela `ehReceita` das notas intra é eliminada da receita
  (transferência/remessa intra não são receita; já saem na F1).
- **Devolução (FORA do escopo F2, definição corrigida para a Fase 3):** a dedução por devolução
  usa `deduzReceita=true` da Tabela F1 sobre notas de ENTRADA autorizada (CFOP 1202/2202),
  NÃO `finalidade_nfe=4` de saída (que é devolução de compra). Volume externo ~R$ 14,86 mi.
- **Bonificação** não é receita (já tratado na Fase 1; ortogonal).
- Marcação usa o **CNPJ raiz (8 dígitos)** para pegar matriz+filiais do mesmo grupo econômico.

## 4. Componentes

### 4.1 Marcação intercompany , `src/lib/fiscal/grupo/`

Separar DADO de LÓGICA, reusável (Fase 3 também usa):

```
src/lib/fiscal/grupo/
  raizes-cnpj.ts    # RAIZES_GRUPO: ReadonlySet<string> (8 digitos). Dado curado + proveniencia.
  cnpj.ts           # extrairRaizCnpj(doc): string|null (8 digitos de string ja-digitos/mascarada).
                    # extrairRaizCnpjDeTexto(texto): string|null (1o CNPJ NN.NNN.NNN/... no texto livre).
  participantes-grupo.ts
                    # carregarParticipantesGrupo(prisma): Promise<Set<number>>
                    #   (odoo_id dos parceiros cujo raiz(documentoDigits) ∈ RAIZES_GRUPO)
                    # ehNotaIntragrupo(nota, participantesGrupo): boolean
                    #   cascata: participantesGrupo.has(participanteId)
                    #         || extrairRaizCnpjDeTexto(participanteNome) ∈ RAIZES_GRUPO
  index.ts
  __tests__/
```

- `RAIZES_GRUPO`: as 9 raízes acima, hardcoded com proveniência (perícia §2) + comentário de
  ponto de parametrização futura. É a fonte de verdade; o fallback por nome é defesa contra
  cadastro incompleto (registrar como gap de ingestão).
- `extrairRaizCnpj(doc)`: opera sobre `documentoDigits` (já limpo); defensivamente remove
  não-dígitos; pega 8 primeiros se houver ≥14 (CNPJ) ou ≥8. Pura.
- `extrairRaizCnpjDeTexto(texto)`: regex do 1o CNPJ mascarado, normaliza e pega 8 dígitos. Pura.

### 4.2 Métrica , `src/lib/metrics/fiscal/receita-consolidada.ts`

`receitaConsolidada(prisma, input)` , **SEM `$queryRaw`, SEM migration**:

1. **Q_itens:** `groupBy({ by:['documentoId','cfopId'], _sum:{vrProdutos:true}, _count:true })`
   no `fato_nota_fiscal_item`, `where` saída autorizada + `buildPeriodoWhere`(item) +
   `buildEmpresaWhere`(item). (Mesmo recorte/base da F1.)
2. **Q_nomes:** `findMany({ where:{cfopId:{in:ids}}, select:{cfopId,cfopNome}, distinct:['cfopId'] })`
   , id-representante idêntico ao da F1 → `extrairCfop` → `classificarCfop` por cfopId.
3. **Q_notas:** `findMany({ where:<mesmo recorte na nota>, select:{odooId,empresaId,empresaNome,
   participanteId,participanteNome} })` no `fato_nota_fiscal`. Monta `Map<odooId, {ehGrupo}>`
   via `ehNotaIntragrupo` (cascata doc→nome). `carregarParticipantesGrupo` 1x.
4. **Em memória:** para cada grupo `(documentoId,cfopId)`: `ehGrupo = mapaNota.get(documentoId)`,
   `regra = classif.get(cfopId)`; acumula:
   - `receitaExterna` += vrProdutos se `regra.ehReceita && !ehGrupo`.
   - `receitaIntragrupoEliminavel` += vrProdutos se `regra.ehReceita && ehGrupo`.
   - `intercompanyBrutoVrProdutos` += vrProdutos se `ehGrupo` (qualquer categoria).
   - `receitaIndividualTotal` = receitaExterna + receitaIntragrupoEliminavel.
- **Contagem de notas:** `notasIntragrupo`/`notasExternas` = nº de `odooId` distintos por classe
  (do `Map_notas`, NÃO `_count` de itens).
- **Saída:** `{ receitaExterna, receitaIntragrupoEliminavel, receitaIndividualTotal,
  intercompanyBrutoVrProdutos, notasIntragrupo, notasExternas, percentualEliminado,
  reconciliacao }`. `percentualEliminado` = receitaIntragrupoEliminavel / receitaIndividualTotal.
- **Conversão:** `Number(Decimal)` e `Number(_count)` (groupBy nativo, sem bigint do raw).
- **Reconciliação cruzada (campo de saída, observável em produção):** chamar a métrica da F1
  (`faturamentoPorCfop` agruparPor categoria) no mesmo recorte e expor
  `reconciliacao: { receitaF2: receitaIndividualTotal, receitaF1: totalReceita, diferenca, observacao }`.
  Invariante: diferença ~0. Segundo invariante: `receitaExterna + receitaIntragrupoEliminavel == receitaIndividualTotal`.

### 4.3 Métrica , `src/lib/metrics/fiscal/matriz-intercompany.ts`

`matrizIntercompany(prisma, input)`: usa Q_notas (cabeçalho) das notas intragrupo; agrupa em
memória por `(empresaId/empresaNome vendedor) × (participanteId/participanteNome comprador)`,
somando `vrProdutos` do cabeçalho. Comprador resolvido pelo `participanteNome` quando não há
parceiro no cache (cascata). Saída: `linhas:{ vendedorId, vendedorNome, compradorChave,
compradorNome, valor, totalNotas }[]` ordenado desc + `total`, `totalPares`.

### 4.4 Tools MCP , `mcp/tools/fiscal/`

- `fiscal_receita_consolidada` (NOVA): receita externa real + composição (externa vs
  intragrupo eliminável) + percentual eliminado. Triggers: "faturamento real", "receita
  consolidada", "quanto vendemos para fora do grupo", "receita sem intercompany", "faturamento
  do grupo eliminando intercompany", "sem contar vendas entre empresas do grupo". Formatador dedicado.
- `fiscal_intercompany` (NOVA): matriz vendedor×comprador do grupo + total intragrupo. Triggers:
  "vendas entre empresas do grupo", "intercompany", "quanto uma empresa vende para outra do
  grupo", "matriz de transferencias intragrupo". Formatador dedicado.
- Ambas: `withFreshness` + `enriquecerEnvelope`; `_DESTAQUE` com escalares (+ `topLinhasJson`
  na matriz, top 10 `{vendedor,comprador,valor}`); registrar em `mcp/tools/fiscal/index.ts` e
  em `TOOLS_QUE_PRECISAM_FORMATADOR`. Validar retrieval com perguntas-ouro (não confundir com
  `fiscal_faturamento_por_empresa`).

### 4.5 Formatadores , `mcp/lib/responder.ts` (COMPARTILHADO, editar inline)

- `fmtReceitaConsolidada`: "Receita consolidada externa (sem intercompany): R$ X. Do faturamento
  individual de R$ Y, R$ Z (W%) é venda intragrupo e foi eliminada." Lê escalares de `_DESTAQUE`.
- `fmtIntercompany`: total intragrupo + top pares vendedor→comprador (de `topLinhasJson`,
  `JSON.parse` com fallback `[]`).

## 5. Fora de escopo

- Ponte de reconciliação completa A→C (Fase 3, tool `ponte_faturamento`).
- **Dedução de devoluções externas** da receita (definição corrigida em §3) , Fase 3.
- Margem/custo (Fase 4). DRE/lucro (bloqueado: contábil vazio).
- Desnormalizar `participanteId` no item (migration) , evitado; usar duas queries nativas.
- Correção do cadastro de parceiros do grupo sem CNPJ no `fato_parceiro` , gap de ingestão.

## 6. Estratégia de teste (TDD + E2E real)

- Unit `extrairRaizCnpj` e `extrairRaizCnpjDeTexto`: 14 díg, mascarado, texto com CNPJ embutido,
  < 8 díg, nulo.
- Unit `ehNotaIntragrupo`: via Set (doc), via nome (parceiro sem doc), externo.
- Unit `receitaConsolidada` (mock prisma: groupBy + findMany x2): externo vs intragrupo, soma só
  ehReceita, separação eliminável × bruto, contagem de notas distinta, reconciliação.
- Unit `matrizIntercompany` (mock): pares vendedor×comprador, fallback nome.
- Tool/formatador: shape + frase (mock).
- **E2E cache real (trava com SQL independente):**
  - intercompany via cascata = **6.230 notas / R$ 679,5 mi** (vr_nf bruto, auditoria).
  - `receitaIndividualTotal` == `totalReceita` da F1 = **R$ 1.315.806.990,60**.
  - `receitaIntragrupoEliminavel` ~ **R$ 418 mi**; `receitaExterna` ~ **R$ 898 mi**
    (valores exatos confirmados pela métrica no E2E; invariante externa+eliminável==individual).
  - `receitaIntragrupoEliminavel <= intercompanyBrutoVrProdutos`.
  - Rebuild do `mcp` antes de validar via tool.

## 7. Critérios de aceite

- Receita consolidada externa eliminando intercompany (cascata doc→nome), composição explícita.
- Reconciliação cruzada com a Fase 1 fecha (receita individual total bate, exposta na saída).
- Separação clara `intercompanyBrutoVrProdutos` × `receitaIntragrupoEliminavel` × `receitaExterna`.
- Matriz intercompany lista pares vendedor→comprador do grupo (com fallback por nome).
- tsc + jest verdes; E2E real confere os números; tools no catálogo + formatadores reais.

## 8. Riscos

- Parceiro do grupo sem CNPJ no cache: mitigado pela cascata doc→nome; medir cobertura residual
  no E2E (deve sobrar ~0 intragrupo conhecido fora da marcação).
- `groupBy(['documentoId','cfopId'])` gera ~dezenas de milhares de grupos: memória moderada,
  aceitável; medir no E2E. `documentoId` já indexado.
- Estabilidade de `cfop_nome` por `cfopId`: resolver por id-representante (igual F1) blinda; o
  E2E inclui a checagem `COUNT(DISTINCT cfop_nome) por cfop_id`.
- Raízes hardcoded: documentar proveniência + ponto de parametrização futura.
