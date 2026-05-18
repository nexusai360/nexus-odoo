# Review — F4 completo, Onda B (Comercial)

- **Data:** 2026-05-18
- **Branch:** `feat/mcp-dominios-completos`
- **Commits revisados:** `82e404d`, `920a192`, `cc7c9f9`, `58f68eb`, `ab0f73b`, `bf37b50`, `480833a`, `31c1475`, `729a385`, `c2410be`, `fa89955`
- **Escopo:** 2 builders (`fato_pedido`, `fato_pedido_parcela`) + 5 tools de comercial + `FATO_FONTE` + harness.

## Veredito: APROVADO COM RESSALVAS

Contagem: **1 CRÍTICO · 1 IMPORTANTE · 2 MENORES**.

A onda está funcionalmente sólida — builders corretos, schema/RBAC/harness conformes ao plano,
4 das 5 tools batem ao centavo contra o banco. Há **um bug factual** em duas tools (`pedidos_atrasados`,
`parcelas_a_vencer`): tratamento de fronteira do dia divergente do padrão canônico do domínio
financeiro, comprovado no E2E (13 parcelas somem de `parcelas_a_vencer`).

---

## CRÍTICO

### C1 — Fronteira do dia: `hoje` cru com hora em `pedidos_atrasados` e `parcelas_a_vencer`

`src/lib/reports/queries/comercial.ts`:
- `queryPedidosAtrasados` — `where: { dataVencimento: { lt: hoje } }` (linha 93)
- `queryParcelasAVencer` — `where: { dataVencimento: { gte: hoje, lte: limite } }` (linha 125)

Ambas recebem `hoje` do handler como `new Date()` — **instante atual com hora**. As datas de
`fato_pedido_parcela.dataVencimento` são gravadas pelo builder como `T00:00:00` local
(`new Date(\`${raw.data_vencimento}T00:00:00\`)`).

Consequência (comprovada no E2E, executado às ~11:28 UTC):
- `parcelas_a_vencer`: filtro `dataVencimento >= hoje` exclui **13 parcelas que vencem hoje**
  (`00:00 < 11:28`). Tool retornou **227 linhas / R$ 3.078.106,51**; o correto
  (`>= início do dia`) é **240 linhas / R$ 4.189.626,12**. Diferença de **R$ 1.111.519,61**.
- `pedidos_atrasados`: filtro `dataVencimento < hoje` é o espelho — uma parcela que vence
  **hoje** (00:00) é contada como **atrasada**, embora não esteja vencida. Hoje não há parcela
  vencendo exatamente hoje não-faturada na ponta de `atrasados` (resultado E2E bateu por
  coincidência da data), mas o critério está errado e quebra em qualquer dia com vencimento no dia.

O domínio financeiro **já resolveu isto e documentou o porquê**:
`src/lib/reports/queries/financeiro.ts:218` — *"Só títulos abertos E com dataVencimento <
início do dia de hoje estão vencidos"* — e normaliza com
`inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())`. As tools de
comercial **ignoraram esse padrão canônico** da onda irmã. A SPEC §3.1 manda priorizar
"atraso por parcela vencida não faturada" — uma parcela que vence hoje **não está vencida**.

Os testes do núcleo (`comercial.test.ts`) passam `hoje` já em `T00:00:00`, o que **mascara o
bug** — o defeito só aparece no handler real (`new Date()`).

**Correção:** normalizar `hoje` para início do dia dentro de `queryPedidosAtrasados` e
`queryParcelasAVencer` (ou no shape, antes de chamar a query), espelhando
`queryTitulosVencidos`. `pedidos_atrasados` deve usar `lt: inicioDoDia`; `parcelas_a_vencer`
deve usar `gte: inicioDoDia`. Adicionar caso de teste com parcela vencendo exatamente "hoje".

---

## IMPORTANTE

### I1 — `valorTotal` de `pedidos_por_etapa`/`por_vendedor` soma `vrNf` zerado para pedidos não faturados

As tools `comercial_pedidos_por_etapa`, `comercial_pedidos_por_vendedor` e
`comercial_pedidos_periodo` somam `vrNf`. O E2E mostra `valorTotal` total de **R$ 4.648.124,43**
sobre 71 pedidos — mas 28 pedidos estão na etapa "Emite NF Consumidor Final" e 41 não estão em
etapa final (`etapaFinaliza=false`). `vr_nf` é o valor da nota fiscal: para pedido ainda não
faturado tende a ser **0**, enquanto `vr_produtos` carrega o valor real do orçamento.

A SPEC §3.1 diz que "valor do pedido vem de `vrProdutos`/`vrNf`" e o `aviso` declara que usa
`vrNf` porque `vr_total` está zerado — mas **não** distingue que `vrNf` também é zero para
pedidos não faturados. Resultado: somar `vrNf` num agrupamento por etapa subnotifica o valor
das etapas iniciais (orçamentos abertos aparecem com R$ 0). Não é bug de código — o builder
mapeia ambos os campos corretamente — mas a **escolha de métrica** pode enganar o consumidor
do MCP. Recomendação: ou usar `vrProdutos` como valor do pedido em `por_etapa`/`por_vendedor`,
ou enriquecer o `aviso` para deixar explícito que etapas pré-faturamento aparecem com valor zero.
Decisão de produto — registrar e confirmar, não corrigir cego.

---

## MENORES

### M1 — `comercial_pedidos_atrasados` retorna 490 linhas sem paginação nem teto

E2E: a tool devolveu **490 linhas** num único payload (`totalAtrasado` R$ 24,1M). É o universo
real e `estado="ok"` é correto, mas 490 objetos num retorno de tool para um agente de IA é
volumoso. O plano não previu `limit`/`top` — fica como observação para a onda de polimento:
considerar um teto (ex.: top-N por valor) com o restante agregado, como boa prática de payload MCP.

### M2 — `comercial.ts` mantém export morto `_PC`

`src/lib/reports/queries/comercial.ts:11` — `export type { PrismaClient as _PC };` foi um
andaime do esqueleto (B.4) para evitar "no exports" antes das funções existirem. Com as 5
funções implementadas, o export é lixo. Remover.

---

## Conformidade — itens verificados OK

- **Builders:** `cycle: "incremental"` no `registry.ts` para ambos ✓; `rawDeleted: false` nos
  `findMany` ✓; `relId`/`relNome` para M2O ✓; `Number(...)` em todos os numéricos ✓; datas com
  `T00:00:00` ✓; guard `if (mapped.length)` no `createMany` ✓; `markFatoBuilt` dentro da
  `$transaction` ✓.
- **`fato_pedido` — Map de etapa final:** lê `raw_pedido_etapa` (`rawDeleted=false`) **antes**
  da transação, monta `Map<etapaId, finaliza>` com a flag `finaliza_pedido_confirmando` ✓.
  E2E confirma `etapaFinaliza`: 30 `true` / 41 `false`, batendo com `SELECT ... GROUP BY`.
- **Tools:** todas reusam o núcleo `comercial.ts` ✓; `inputSchema`/`outputSchema`/
  `inputSchemaShape: inputSchema.shape` presentes ✓; `withFreshness` com os fatos corretos ✓;
  `dominio: "comercial"` ✓; registradas em `mcp/tools/comercial/index.ts` e somadas ao
  `catalogo` ✓.
- **`pedidos_atrasados` — critério:** usa parcela vencida (`dataVencimento` no passado) **e**
  `parcelaFaturada=false` ✓ (ressalva da fronteira do dia em C1). `diasAtraso` calculado por
  linha na query via `mcp/lib/dias-atraso.ts` ✓.
- **`FATO_FONTE`:** `fato_pedido → pedido.documento`, `fato_pedido_parcela → pedido.parcela`,
  ambos `mode: "incremental"` ✓. Confirmado contra `SELECT model FROM sync_state` (existem
  `pedido.documento` e `pedido.parcela`).
- **Harness:** 12 ocorrências de catálogo total migradas `14 → 19` ✓; `COMERCIAL_IDS` adicionado
  a `TODOS_IDS` com igualdade de conjuntos ✓; assertivas de perfil P1–P5 mantidas em `13`/`7` ✓;
  `it()` de perfil usa só `admin`/`viewer` do fixture ✓.
- **Build/testes:** `npx tsc --noEmit` ✓; `npx tsc -p mcp/tsconfig.json` ✓;
  `npx jest` — 92 suites / 687 testes verdes ✓; `npx eslint src/ mcp/` — limpo ✓.

## Verificação E2E (cache real, role super_admin)

Builders rodados contra o cache: `fato_pedido` = **71** linhas, `fato_pedido_parcela` = **1925**.

| Tool | Resultado E2E | SELECT direto | Confere |
|---|---|---|---|
| `comercial_pedidos_periodo` | 71 pedidos / R$ 4.648.124,43 | 71 / 4.648.124,43 | ✓ |
| `comercial_pedidos_por_etapa` | 10 etapas, 71 pedidos, etapaFinaliza t=30/f=41 | t=30 / f=41 | ✓ |
| `comercial_pedidos_por_vendedor` | 7 vendedores, 71 pedidos, top=Jonatas Soares (29 ped / R$ 3.126.177,09) | 71 pedidos, ordem por valor correta | ✓ |
| `comercial_pedidos_atrasados` | 490 linhas / R$ 24.096.280,89 | 490 / 24.096.280,89 | ✓ |
| `comercial_parcelas_a_vencer` | **227 linhas / R$ 3.078.106,51** | **240 / R$ 4.189.626,12** | **✗ — bug C1** |

`fonteStatus` de todas as 5 tools: `status="ok"`, `ultimaSyncEm` data real não-nula
(`2026-05-18T00:23:...Z`) — `FATO_FONTE` validado.

Observação de fuso: `dataVencimento` serializado como `...T03:00:00.000Z` (gravado `T00:00:00`
local UTC-3, exibido em UTC). Consistente com o resto do projeto — não é achado.
