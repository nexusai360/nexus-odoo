# SPEC , Fase 2: Intercompany + Receita Consolidada Externa

> Versão: **v1** (vai para 2 reviews adversariais , fiscal + arquitetura , antes do plano).
> Base: perícia `docs/superpowers/research/2026-06-09-pericia-faturamento-consolidado.md` (§2, §4, §7)
> e a Tabela de Regras entregue na Fase 1 (`src/lib/fiscal/regras/`).
> Escopo ESTRITO. Ponte completa (Fase 3) e margem (Fase 4) são fases seguintes.

## 1. Objetivo

Entregar a **visão C** da perícia , a **receita consolidada externa** ("o faturamento real"
do dono): só vendas a clientes FORA do grupo, eliminando o intercompany (venda intragrupo),
conforme CPC 36. Para isso, introduzir a **marcação intercompany** (participante da nota ∈
grupo) e combiná-la com a classificação fiscal da Fase 1 (`ehReceita`). Entregar também a
**matriz intercompany** (quem vende para quem dentro do grupo), instrumento de auditoria.

## 2. Premissas validadas no dado real (2026-06-09)

- **Identificação intercompany:** `fato_nota_fiscal.participante_id` → `fato_parceiro.odoo_id`
  → CNPJ (`documento_digits`/`documento`, 8 primeiros dígitos = raiz) ∈ raízes do grupo.
  - **Confirmado:** intercompany = **3.801 notas / R$ 440.402.630,35**; externo = 30.615 notas
    (R$ 1,42 bi). Bate exatamente com a perícia.
- **Raízes de CNPJ do grupo (8 dígitos):** `07390039, 10557556, 18282961, 33718546, 34161829,
  34461908, 35156509, 45424185, 62673999`. (38 parceiros do grupo no `fato_parceiro`.)
- **O item NÃO tem `participanteId` desnormalizado** (só `documentoId`). Logo, combinar a
  classificação fiscal (item/CFOP) com a marcação intercompany (participante da nota) exige
  **JOIN item→nota**. Decisão técnica: `$queryRaw` com JOIN, classificação em memória (sem
  mudança de schema / re-sync). Há índice em `documento_id`? (Verificar no plano; senão a
  query ainda é viável , 138k itens.)
- Todas as 34.416 notas de saída autorizada têm `participante_id`.

## 3. Decisões de política (perícia §7, canônicas)

- **Intercompany:** aparece na receita INDIVIDUAL por empresa (visão B, já existe) e é
  ELIMINADO na receita consolidada externa (visão C). CPC 36.
- **Receita consolidada externa** = Σ `item.vrProdutos` dos itens com `ehReceita=true`
  (Tabela de Regras da Fase 1) **de notas cujo participante NÃO é do grupo**.
- **Devolução externa** (finalidade_nfe=4, participante externo) reduz a receita externa
  (deduz). Devolução intragrupo não altera a externa (a venda original já foi eliminada).
  > F2 entrega a receita externa BRUTA (antes de devoluções); a dedução de devoluções
  > externas é refinamento que pode entrar aqui ou na ponte (Fase 3) , decidir nas reviews.
- **Bonificação** não é receita (já tratado na Fase 1; ortogonal).
- A marcação intercompany usa o **CNPJ raiz** (8 dígitos), não o estabelecimento, para pegar
  matriz+filiais do mesmo grupo econômico.

## 4. Componentes

### 4.1 Marcação intercompany , `src/lib/fiscal/grupo/`

Separar DADO de LÓGICA, reusável (Fase 3 também usa):

```
src/lib/fiscal/grupo/
  raizes-cnpj.ts    # RAIZES_GRUPO: ReadonlySet<string> (8 digitos). Dado curado.
  cnpj.ts           # extrairRaizCnpj(doc): string|null (8 digitos, imune a mascara). Pura.
  participantes-grupo.ts # carregarParticipantesGrupo(prisma): Promise<Set<number>>
                         #   (odoo_id dos parceiros cujo CNPJ raiz ∈ RAIZES_GRUPO)
  index.ts
  __tests__/
```

- `RAIZES_GRUPO`: as 9 raízes acima. **Parametrizável** (futuro: tabela/config); F2 hardcoda
  com fonte documentada (perícia §2). Inclui comentário de proveniência.
- `extrairRaizCnpj(doc)`: remove não-dígitos, pega 8 primeiros, valida 14 dígitos de CNPJ
  (ou aceita ≥8). Pura, testável.
- `carregarParticipantesGrupo(prisma)`: 1 query em `fato_parceiro`, devolve `Set<number>` de
  `odoo_id` do grupo. Cacheável por request (não por processo , dado muda no sync).

### 4.2 Métrica , `src/lib/metrics/fiscal/receita-consolidada.ts`

`receitaConsolidada(prisma, input)`:
- **Fonte:** `$queryRaw` com JOIN `fato_nota_fiscal_item i` × `fato_nota_fiscal n`
  (`n.odoo_id = i.documento_id`), `where` saída autorizada + período + empresa (no item).
- Agrupa por `(n.participante_id ∈ grupo ? intercompany : externo, i.cfop_id)`,
  `_sum(i.vr_produtos)`, `_count`.
- Em memória: classifica cada `cfopId` via `classificarCfop` (Fase 1); soma:
  - `receitaExterna` = Σ vrProdutos onde `ehReceita && externo`.
  - `receitaIntragrupo` = Σ vrProdutos onde `ehReceita && intercompany` (a parte eliminada).
  - `receitaIndividualTotal` = receitaExterna + receitaIntragrupo (visão B, confere com a Fase 1).
  - `intercompanyTotal` (todas as operações intragrupo, receita ou não) , para a ponte.
- **Saída:** `{ receitaExterna, receitaIntragrupo, receitaIndividualTotal, intercompanyTotal,
  notasIntercompany, notasExternas, percentualIntragrupo, reconciliacao }`.
- **Reconciliação cruzada:** `receitaIndividualTotal` (F2) deve casar com `totalReceita` da
  métrica da Fase 1 (mesmo recorte). Expor a diferença (esperado ~0).

### 4.3 Métrica , `src/lib/metrics/fiscal/matriz-intercompany.ts`

`matrizIntercompany(prisma, input)`: vendedor (emitente `empresa_id`/nome) × comprador
(participante do grupo) com valor e contagem. Detecta divergências e concentra o intragrupo.
Saída: `linhas: { vendedorId, vendedorNome, compradorId, compradorNome, valor, totalNotas }[]`,
ordenado por valor desc, + `total`.

### 4.4 Tools MCP , `mcp/tools/fiscal/`

- `fiscal_receita_consolidada` (NOVA): receita externa real + composição (externa vs
  intragrupo) + percentual eliminado. Triggers: "faturamento real", "receita consolidada",
  "quanto vendemos para fora do grupo", "receita sem intercompany", "faturamento do grupo
  eliminando intercompany". Formatador dedicado.
- `fiscal_intercompany` (NOVA): matriz vendedor×comprador do grupo + total intragrupo.
  Triggers: "vendas entre empresas do grupo", "intercompany", "quanto uma empresa vende para
  outra do grupo", "matriz de transferencias intragrupo". Formatador dedicado.
- Ambas: envelope padrão (`withFreshness` + `enriquecerEnvelope`), `_DESTAQUE` com escalares
  (+ `topLinhasJson` para a matriz), entram em `TOOLS_QUE_PRECISAM_FORMATADOR`.

### 4.5 Formatadores , `mcp/lib/responder.ts` (COMPARTILHADO, editar inline)

- `fmtReceitaConsolidada`: "Receita consolidada externa (sem intercompany): R$ X. Do
  faturamento individual de R$ Y, R$ Z (W%) é venda intragrupo e foi eliminada."
- `fmtIntercompany`: total intragrupo + top pares vendedor→comprador (de `topLinhasJson`).

## 5. Fora de escopo

- Ponte de reconciliação completa A→C (Fase 3, tool `ponte_faturamento`).
- Margem/custo (Fase 4). DRE/lucro (bloqueado: contábil vazio).
- Dedução de devoluções externas da receita: decidir nas reviews se entra na F2 ou Fase 3.
- Desnormalizar `participanteId` no item (mudança de schema): evitar; usar JOIN.

## 6. Estratégia de teste (TDD + E2E real)

- Unit `extrairRaizCnpj`: 14 dígitos, com máscara, < 8 dígitos, nulo.
- Unit `carregarParticipantesGrupo` (mock prisma): filtra por raiz.
- Unit `receitaConsolidada` (mock `$queryRaw`): externo vs intragrupo, soma ehReceita,
  reconciliação com Fase 1, percentual.
- Unit `matrizIntercompany` (mock): agrupamento vendedor×comprador.
- Tool/formatador: shape + frase (mock).
- **E2E cache real:** intercompany = R$ 440.402.630,35 / 3.801 notas (trava com SQL
  independente); receitaIndividualTotal (F2) == totalReceita (F1, R$ 1.315.806.990,60);
  receitaExterna = receitaIndividualTotal − receitaIntragrupo; percentual ~24% do bruto.
  Rebuild do `mcp` antes de validar via tool.

## 7. Critérios de aceite

- Receita consolidada externa eliminando intercompany, com composição explícita.
- Reconciliação cruzada com a Fase 1 fecha (receita individual total bate).
- Matriz intercompany lista pares vendedor→comprador do grupo.
- Intercompany = R$ 440,4 mi confirmado contra SQL independente.
- tsc + jest verdes; E2E real confere os números; tools no catálogo + formatadores.

## 8. Riscos

- JOIN item→nota em 138k itens: confirmar índice em `documento_id` (senão avaliar custo).
- `participante_id` nulo em alguma nota (validado: nenhuma nota de saída autorizada tem nulo).
- Parceiro do grupo sem CNPJ preenchido escaparia da marcação: medir cobertura no E2E.
- Raízes hardcoded: documentar e deixar ponto de parametrização futura.
