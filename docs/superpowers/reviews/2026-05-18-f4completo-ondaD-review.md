# Review — F4 completo, Onda D (Cadastros)

**Data:** 2026-05-18
**Branch:** `feat/mcp-dominios-completos`
**Commits revisados:** `50f43d8`, `ddf5875`, `128135c`, `d55f5e8`, `e9f97a7`, `536ef1a`, `2e5cf90`
**Escopo:** builder `fato_parceiro` + 3 tools de cadastros + catálogo (28 tools).

---

## Veredito: APROVADO COM RESSALVAS

A Onda D está conforme o plano (`2026-05-18-f4-completo.md` §D.1–D.8) e a
SPEC v3 §3.3. Build verde em `tsc` (raiz + mcp), `eslint` e `jest`
(97 suites / 755 testes). Nenhum achado CRÍTICO. As ressalvas são MENORES,
de UX/robustez, e não bloqueiam o merge.

### Verificação executada

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | verde (sem saída) |
| `npx tsc -p mcp/tsconfig.json` | verde (sem saída) |
| `npx eslint src/ mcp/` | verde (sem saída) |
| `npx jest` | 97 suites / 755 testes — todos passam |

### Contagem por severidade

- CRÍTICO: 0
- IMPORTANTE: 0
- MENOR: 4

---

## Conformidade

### Builder `fato-parceiro.ts` (D.1)

- `rebuildFatoParceiro` registrado em `registry.ts` com `cycle: "incremental"`. OK.
- `findMany` filtra `rawDeleted: false`. OK.
- `$transaction` com `deleteMany` + (`createMany` sob `if (mapped.length)`) +
  `markFatoBuilt(tx, "fato_parceiro")` — guard R2-I2 presente, `markFatoBuilt`
  dentro da transação. OK.
- Mapeamento conforme research §3.2: `ehCliente`←`customer`,
  `ehFornecedor`←`supplier`, `ehEmpresa`←`is_company`, `documento`←`vat`,
  `uf`←`relNome(state_id)`, `pais`←`relNome(country_id)`,
  `telefone`←`phone ?? mobile` (P-I8), `email`←`email`. OK.
- Mapper não produz `atualizadoEm` (campo `@default(now())`). OK — testado.

### `FATO_FONTE` (D.2)

- `freshness.ts` estende `FATO_FONTE` com
  `fato_parceiro: { model: "res.partner", mode: "incremental" }`. OK.

### Tools (D.4–D.6)

- As 3 tools têm `inputSchema` Zod, `inputSchemaShape: inputSchema.shape`,
  `dominio: "cadastros"`, `withFreshness(["fato_parceiro"])`. OK.
- `cadastro_buscar_parceiro`: `OR` de `contains` + `mode: "insensitive"` em
  `nome`/`nomeCompleto`/`documento`; `take` com default 20. OK.
- `cadastro_contar_parceiros`: `inputSchema = z.object({})`, `dados` só com
  escalares; `withFreshness` sem `isVazio` cai no ramo "ok" — conforme o
  plano D.6 Step 5. OK.
- `cadastro_parceiros_por_uf`: agrupamento em memória (`Map`) — justificado
  no comentário; ordenação por `quantidade` desc. OK.

### Catálogo (D.7)

- `cadastrosTools` importado e concatenado em `mcp/catalog/index.ts`. OK.
- `integration.test.ts` migrado `25 → 28` (estoque 6 + financeiro 6 +
  caminho3 2 + comercial 5 + fiscal 6 + cadastros 3 = 28). Conta confere. OK.
- `CADASTROS_IDS` criado e somado a `TODOS_IDS`; igualdade de conjuntos
  preservada. OK.
- Assertivas de perfil P1–P5 não alteradas; `it()` extra cobre `admin`
  (vê as 3) e `viewer` sem `cadastros` (não vê). OK.
- `cadastros` presente no enum `ReportDomain` do Prisma — RBAC por domínio
  funciona estruturalmente. OK.

---

## Achados

### MENOR-1 — Busca por documento não normaliza pontuação

`vat` no Odoo OCA é gravado **formatado** (`12.345.678/0001-99`,
`123.456.789-00` — confirmado no fixture e na research §3.2). O
`cadastro_buscar_parceiro` usa `contains` literal: uma busca por
`"12345678"` (dígitos puros, como o usuário tipicamente digita no WhatsApp)
**não casa** com o documento formatado. A tool acerta nome, mas a busca por
CNPJ/CPF é frágil. Recomendação para uma onda futura: normalizar
(remover `.`, `/`, `-`) tanto o termo quanto uma coluna `documentoDigitos`
derivada, ou aplicar `regexp_replace` no `where`. Não bloqueia — a busca por
nome cobre o caso comum.

### MENOR-2 — `cadastro_contar_parceiros` retorna "ok" mesmo com cache vazio

Com `totalParceiros = 0` (cache nunca populado mas builder já rodou),
`withFreshness` cai no ramo "ok" por não haver array em `dados`. O plano
D.6 aceita explicitamente esse comportamento, então é **conformidade ok**.
Ainda assim, do ponto de vista do agente IA, um "ok" com quatro zeros é
ambíguo — não distingue "operação sem parceiros" de "cache não populado".
A precondição R2-I7 da onda (`count(*) > 0`) mitiga em produção. Registro
como MENOR para visibilidade; nenhuma ação exigida nesta onda.

### MENOR-3 — `ativo` divergente do `@default(true)` do schema

`mapParceiroRow` faz `ativo: Boolean(raw.active)`. Se `raw.active` estiver
ausente/`false`, o mapper grava `ativo: false` explícito, sobrepondo o
`@default(true)` da coluna `FatoParceiro.ativo`. A research §3.2 afirma
`active` é `true` em **todos** os 6545 registros do cache, então na prática
não há impacto hoje. É uma inconsistência latente: se o Odoo um dia enviar
`active` ausente, o registro entra inativo silenciosamente. Comportamento
aceitável (espelha a fonte), apenas registrado.

### MENOR-4 — `cadastro_parceiros_por_uf` sem limite de linhas

A tool devolve **todas** as UFs (`findMany` sem `take`, agrupamento em
memória sobre as 6545 linhas). Para `res.partner` o domínio é pequeno
(~27 UFs + `null`), então não há risco de payload. Apenas note que, ao
contrário de `buscar-parceiro`, não há teto — consistente com a natureza
agregada da tool. Sem ação.

---

## Pontos positivos

- Cobertura de teste sólida: `fato-parceiro.test.ts` cobre fallback
  `phone ?? mobile`, `state_id`/`country_id = false`, ausência de
  `atualizadoEm`, guard `if (mapped.length)` e `markFatoBuilt`.
- `cadastros.test.ts` exercita limite default/custom, filtro
  `apenasClientes` e ordenação desc.
- Fixtures derivados de dados reais da research (6545 parceiros, top UF DF).
- Mapper defensivo: todo campo string passa por `typeof === "string"`,
  tolerando o `false` que o Odoo retorna para campos vazios.
- Comentários de topo dos arquivos documentam fonte, filtro e decisões.

---

## Recomendação

Merge liberado. Os 4 achados MENORES são candidatos a backlog —
nenhum exige correção dentro da Onda D. MENOR-1 (busca por documento
normalizada) é o de maior valor para a frente WhatsApp (F5) e merece
um `feature_request` ou item de onda futura.
