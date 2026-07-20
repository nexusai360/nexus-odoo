# Review adversarial , Plano Fase 2 (coluna Etapa vira tag colorida)

Data: 2026-07-20. Base: código real do repo + cache. Só achados materiais.

---

## A1 [ALTA] , `formatarNomeEtapa` capitaliza SÓ a 1a letra da string; os testes (e a intenção do dono) querem a 1a letra de CADA clausula

**Evidência.** Implementação da Task 4 (plano, bloco GREEN):
`const sentenca = base.replace(/\p{L}/u, upper)` , sem flag `g`, capitaliza apenas
o **primeiro** caractere alfabético da string inteira.

Consequência para os ~25 nomes que começam com sigla (`VF -`, `V.O -`): a maiúscula cai
DENTRO da sigla e a palavra descritiva depois do `- ` fica minúscula.

Os próprios testes do plano exigem o contrário e **falhariam contra o GREEN**:
- L267 `"VF - Aguardando autorização"` , impl produz `"VF - aguardando autorização"`.
- L268 `"Correção - Emite NF"` , impl produz `"Correção - emite NF"`.
- L271 `"V.O - Input financeiro"` , impl produz `"V.O - input financeiro"`.
- L280 `"Transf sn matriz - filial"` contradiz L282 `toContain("SN")` (SN está na allowlist).

O research (linha 265/273) também mostra `"Correção - Emite NF"` e `"...Input..."` com
inicial maiúscula. Regra correta observada nos casos esperados: **sentence-case por
clausula separada por `" - "`** (1a letra alfabética de cada parte em maiúscula, resto
minúsculo), depois allowlist.

**Correção v2.** Trocar o passo 1 por: `split(/ - /)` , sentence-case cada parte com
`replace(/\p{L}/u, upper)` , `join(" - ")`; manter o passo 2 (allowlist) igual. Reescrever
o teste `TRANSF SN` para o output real (`"Transf SN matriz - Filial"`) e remover a
contradição. Sem isso, ~25 de 79 etapas saem com a palavra-chave em minúscula.

---

## A2 [MÉDIA] , Task 6 altera o `className` BASE de TODAS as tags, contrariando "zero regressão"

**Evidência.** `data-table.tsx:637-640` , a base atual de toda tag `tipo:"tag"` é
`"inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border/60"`.
O render proposto na Task 6 substitui essa base por outra que acrescenta
`max-w-[220px] items-center truncate` e move `ring-border/60` para o ramo neutro. Isso
aplica truncagem/centralização às tags de **todas as 8 telas** (Situação em
`blocos-estoque.tsx:258/317/629` e `blocos-pedidos.tsx:64/106`, Financeiro `:210`,
`composicao-kit-bloco.tsx:97`), não só ao B-09. Rótulos são curtos, então o efeito é
pequeno, mas a afirmação do plano ("as 8 telas continuam idênticas / nenhuma passa
corKey") é imprecisa: a string base muda para todos.

**Correção v2.** Manter a base EXATA atual quando `!estilo` (sem `corKey`) e aplicar
`max-w-[220px] items-center truncate` apenas no ramo com `estilo` (cor por-linha). Assim
o caminho estático fica byte-a-byte igual = zero regressão de verdade. Rodar
`data-table.test.tsx` para confirmar.

---

## A3 [MÉDIA] , O campo auxiliar `etapaCor` (hex) polui a BUSCA global da tabela

**Evidência.** `data-table-utils.ts:53-57` , `filterRows` varre `Object.values(row)`,
ou seja TODOS os campos da linha, não só as colunas. A Task 7 injeta `etapaCor:
l.etapaCor` (ex.: `"#fa7e1e"`) no objeto de linha. Hoje o `linhas` do B-09
(`blocos-pedidos.tsx:177-194`) não tem NENHUM campo oculto, então esta é a 1a poluição
de busca da tabela: digitar `"fa7"`, `"ff"`, `"00"` etc. passa a casar linhas pela cor.
O CSV está OK (`export-csv.ts` usa só `colunasVisiveis`) e o filtro por coluna também
(itera `columns`). É só a busca livre.

**Correção v2.** Aceitar como baixo risco e DOCUMENTAR, ou (melhor) não guardar o hex
como campo de topo: passar a cor por um nome improvável de colidir e/ou fazer `filterRows`
varrer apenas chaves de coluna. Mínimo: registrar a decisão no plano (hoje o plano afirma
"etapaCor fica como dado auxiliar" sem notar a busca).

---

## A4 [BAIXA] , Trade-off cor: 0.14/0.4 provavelmente fraco demais para IDENTIFICAR a cor

**Evidência.** Task 3 usa bg a 0.14 e borda a 0.4 sobre o fundo do card, texto sempre
`text-foreground`. Isso RESOLVE o contraste AA nos dois temas (o hex saturado tipo
`#740001`/`#ffd500` só entra em alpha baixo, nunca no texto) , item 2 do briefing está
coberto. Porém, a 0.14 alpha, `#740001` (vinho) e `#00b159` (verde) viram lavagens quase
idênticas: o objetivo "mesma cor do Odoo" fica ilegível. `luminanciaRelativa` é construída
e testada mas **não é usada** por `derivarCorTag` (texto é sempre `text-foreground`).

**Correção v2.** Na calibração inline (Task 6 já delega ao `ui-ux-pro-max`): subir a borda
(ex.: 0.6/0.7) ou usar um dot Lucide na cor cheia para dar identidade sem quebrar AA.
Deixar explícito no plano que 0.14 é ponto de partida a validar visualmente contra
3-4 hexes reais (o plano já cita, mas a tensão "AA vs identidade" merece ser nomeada).

---

## A5 [BAIXA] , `mapaCorEtapa` não filtra `rawDeleted` (e etapaId vem do superset pré-UF)

**Evidência.** Task 5 (e): `prisma.rawPedidoEtapa.findMany({ where: { odooId: { in }}})`
sem `rawDeleted: false`. Hoje inócuo (research: 239 registros, 0 deletados), mas uma
reconciliação futura poderia trazer cor de etapa soft-deletada. E `etapaIds` sai de
`pedidos` (antes do filtro de UF), não de `pedidosEscopo` , superset inofensivo, só busca
alguns ids a mais.

**Correção v2.** Acrescentar `rawDeleted: false` no `where`. Opcional: derivar `etapaIds`
de `pedidosEscopo`. Ambos triviais.

---

## Confirmações (verificado e descartado como problema)

- **`etapaId` existe** em `FatoPedido` (`schema.prisma:559`) mas NÃO está no `select`
  atual (`entregas-parciais.ts:160-171`); a Task 5(d) adiciona , correto e necessário.
- **Modelo Prisma** `RawPedidoEtapa` (`raw_pedido_etapa`) confere; client `rawPedidoEtapa`.
- **Números/barras/colchetes/pontos** em `formatarNomeEtapa`: o token `[\p{L}\p{N}.]+`
  exclui `/` e `[]`, então `5922/6922`, `[SMARTFIT]`, `V.O` e `Transf.` são tratados
  corretamente (item 4 do briefing: SIM, trata). O único defeito é o A1 (clausula).
- **Allowlist**: cobre as siglas reais das 79 etapas. `FAT` (12+ ocorrências), `TRANSF`,
  `CONF`, `MOV` ficam minúsculos POR DECISÃO (plano já sinaliza ao dono). Recomendo elevar
  a visibilidade: `fat JDS x grupo` é visualmente estranho; sugerir ao dono incluir `FAT`
  e `TRANSF` por padrão. Não é bug, é decisão pendente.
- **cor=false (18 etapas)**: caminho neutro coberto por `corEtapaValida(false)->null` +
  `derivarCorTag(null)->null` -> pílula `bg-muted`. Testado (Task 1 e 3). OK.
- **RSC->client**: query devolve strings; `corKey` é nome de campo (string). Nenhuma
  função/componente atravessa. OK.
- **N+1 / clamp Fase 1A**: 1 query batched extra; não toca `janelaDemandaAberta` nem o
  filtro de período. Sem impacto no clamp. OK.
- **CSV / filtro por coluna**: `etapaCor` não vaza (usam só `columns`/`colunasVisiveis`).
