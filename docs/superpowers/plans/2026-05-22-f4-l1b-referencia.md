# F4 L1b — Camada de referência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar as 27 tabelas de referência fiscal/cadastral/geográfica como `raw`, e expor o subconjunto de lookup (15 tabelas) por um `fato_referencia` unificado e a tool `referencia_buscar`.

**Architecture:** Reusa os padrões da L1a/L1c. 27 modelos `Raw*` + `MODEL_CATALOG`. Um único `FatoReferencia (tabela, codigo, descricao)` alimentado por um builder que achata os 15 `raw_*` de lookup conforme um mapa por tabela. Tool `referencia_buscar` lê o fato via `withFreshness`.

**Tech Stack:** TypeScript, Prisma v7, Postgres, `@modelcontextprotocol/sdk`, Zod, Jest.

**Spec:** `docs/superpowers/specs/2026-05-22-f4-l1b-referencia-spec.md` (v3).

---

## Inventário dos 27 modelos

`rawTableFor` converte `sped.x.y` → `raw_sped_x_y`; o modelo Prisma é o PascalCase.

**Grupo A — lookup (15)** — `model | RawModel | tabela (no fato) | campo código | campo descrição`:

```
sped.ncm                | RawSpedNcm              | ncm               | codigo      | descricao
sped.cfop               | RawSpedCfop             | cfop              | codigo      | descricao
sped.cest               | RawSpedCest             | cest              | codigo      | descricao
sped.cnae               | RawSpedCnae             | cnae              | codigo      | descricao
sped.nbs                | RawSpedNbs              | nbs               | codigo      | descricao
sped.natureza.operacao  | RawSpedNaturezaOperacao | natureza_operacao | codigo      | nome
sped.unidade            | RawSpedUnidade          | unidade           | codigo      | nome
sped.cst.icms           | RawSpedCstIcms          | cst_icms          | codigo      | nome
sped.cst.icms.sn        | RawSpedCstIcmsSn        | cst_icms_sn       | codigo      | nome
sped.cst.ipi            | RawSpedCstIpi           | cst_ipi           | codigo      | nome
sped.cst.pis.cofins     | RawSpedCstPisCofins     | cst_pis_cofins    | codigo      | nome
sped.cst.cibs           | RawSpedCstCibs          | cst_cibs          | cst_cibs    | nome_cst_cibs
sped.municipio          | RawSpedMunicipio        | municipio         | codigo_ibge | nome
sped.pais               | RawSpedPais             | pais              | codigo_bacen| nome
sped.estado             | RawSpedEstado           | estado            | uf          | nome
```

**Grupo B — raw apenas (12)** — `model | RawModel`:

```
sped.condicao.pagamento         | RawSpedCondicaoPagamento
sped.feriado                    | RawSpedFeriado
sped.aliquota.icms.proprio      | RawSpedAliquotaIcmsProprio
sped.aliquota.icms.st           | RawSpedAliquotaIcmsSt
sped.aliquota.inss              | RawSpedAliquotaInss
sped.aliquota.ipi               | RawSpedAliquotaIpi
sped.aliquota.irpf              | RawSpedAliquotaIrpf
sped.aliquota.iss               | RawSpedAliquotaIss
sped.aliquota.pis.cofins        | RawSpedAliquotaPisCofins
sped.aliquota.simples.aliquota  | RawSpedAliquotaSimplesAliquota
sped.aliquota.simples.anexo     | RawSpedAliquotaSimplesAnexo
sped.aliquota.simples.teto      | RawSpedAliquotaSimplesTeto
```

---

## Task 1: 27 modelos `Raw*` + `FatoReferencia` + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_f4l_referencia/migration.sql` (gerada)

- [ ] **Step 1: Adicionar os 27 modelos `Raw*`**

Em `prisma/schema.prisma`, junto dos demais `Raw*`. Cada um segue **exatamente** este molde (idêntico a `RawSpedCertificado`), trocando o nome do model e o `@@map`:

```prisma
model RawSpedNcm {
  odooId        Int       @id @map("odoo_id")
  data          Json
  odooWriteDate DateTime? @map("odoo_write_date")
  syncedAt      DateTime  @default(now()) @map("synced_at")
  rawDeleted    Boolean   @default(false) @map("raw_deleted")

  @@index([odooWriteDate])
  @@index([rawDeleted])
  @@map("raw_sped_ncm")
}
```

Repetir para os 27 modelos do Inventário (Grupo A + Grupo B), com `model` e `@@map` conforme as colunas `RawModel` e a regra `rawTableFor`. Agrupar sob um comentário `// ─── F4 L1b — camada de referência ───`.

- [ ] **Step 2: Adicionar o modelo `FatoReferencia`**

Junto dos demais `Fato*`:

```prisma
/// Entradas de referência (NCM, CFOP, município...) achatadas para lookup — F4 L1b.
model FatoReferencia {
  id        Int     @id @default(autoincrement())
  tabela    String
  codigo    String
  descricao String?

  @@index([tabela])
  @@index([tabela, codigo])
  @@map("fato_referencia")
}
```

- [ ] **Step 3: Gerar a migration**

Run: `set -a && . ./.env.local && set +a && npx prisma migrate dev --name f4l_referencia`
Expected: cria `prisma/migrations/<timestamp>_f4l_referencia/` com 28 `CREATE TABLE`; `prisma generate` roda.
Nota: `prisma migrate dev` precisa de `DATABASE_URL` no ambiente — `.env.local` não é auto-carregado, daí o `set -a && . ./.env.local`.

- [ ] **Step 4: Verificar typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: PASS. (Se o client parecer desatualizado, rodar `npx prisma generate` de novo — visto na L1c.)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(f4-l1b): schema raw das 27 tabelas de referencia + fato_referencia"
```

---

## Task 2: Entradas no `MODEL_CATALOG`

**Files:**
- Modify: `src/worker/catalog/model-catalog.ts`
- Modify: `src/worker/catalog/model-catalog.test.ts`

- [ ] **Step 1: Adicionar as 27 entradas**

Ao fim do array `MODEL_CATALOG` (depois de `pedido.faturamento`), sob um comentário `// F4 L1b — camada de referência`, uma linha por modelo do Inventário:

```typescript
  { odooModel: "sped.ncm", mode: "incremental" },
  { odooModel: "sped.cfop", mode: "incremental" },
  // ... (as 27, todas mode: "incremental")
```

- [ ] **Step 2: Atualizar o comentário-cabeçalho de contagem**

Topo do arquivo: `// 80 incremental | 5 snapshot | 2 estatico.` → `// 107 incremental | 5 snapshot | 2 estatico.`

- [ ] **Step 3: Atualizar `model-catalog.test.ts`**

- O `it("tem 87 modelos ...")` → `114`, `toHaveLength(114)`, e ajustar o texto (79 F0 + 5 L1a + 3 L1c + 27 L1b).
- Adicionar um `MODELOS_L1B` Set com os 27 `odooModel` do Inventário (entraram via sondagem, não pela varredura F0).
- No teste do discovery, o filtro `noCatalogo` exclui também `MODELOS_L1B`:
  `(m) => !MODELOS_L1A.has(m) && !MODELOS_L1C.has(m) && !MODELOS_L1B.has(m)`.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx jest src/worker/catalog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/catalog/model-catalog.ts src/worker/catalog/model-catalog.test.ts
git commit -m "feat(f4-l1b): registra as 27 tabelas de referencia no MODEL_CATALOG"
```

---

## Task 3: Builder `fato-referencia.ts`

**Files:**
- Create: `src/worker/fatos/fato-referencia.ts`
- Create: `src/worker/fatos/fato-referencia.test.ts`
- Modify: `src/worker/fatos/registry.ts`
- Modify: `mcp/lib/freshness.ts`

- [ ] **Step 1: Escrever o teste falho do mapeamento**

Criar `src/worker/fatos/fato-referencia.test.ts`:

```typescript
import { mapReferenciaRows, GRUPO_A } from "./fato-referencia";

describe("mapReferenciaRows", () => {
  it("mapeia codigo/descricao por tabela (codigo+descricao)", () => {
    const linhas = mapReferenciaRows("cfop", [
      { data: { codigo: "1101", descricao: "Compra para industrialização" } },
    ]);
    expect(linhas).toEqual([
      { tabela: "cfop", codigo: "1101", descricao: "Compra para industrialização" },
    ]);
  });

  it("usa o campo nome quando a tabela é codigo+nome", () => {
    const linhas = mapReferenciaRows("cst_icms", [
      { data: { codigo: "00", nome: "00 - Tributada" } },
    ]);
    expect(linhas[0]).toEqual({ tabela: "cst_icms", codigo: "00", descricao: "00 - Tributada" });
  });

  it("usa os campos próprios de cst_cibs, municipio, pais, estado", () => {
    expect(mapReferenciaRows("cst_cibs", [{ data: { cst_cibs: "000", nome_cst_cibs: "Integral" } }])[0])
      .toEqual({ tabela: "cst_cibs", codigo: "000", descricao: "Integral" });
    expect(mapReferenciaRows("municipio", [{ data: { codigo_ibge: "5300108", nome: "Brasília" } }])[0])
      .toEqual({ tabela: "municipio", codigo: "5300108", descricao: "Brasília" });
    expect(mapReferenciaRows("estado", [{ data: { uf: "DF", nome: "Distrito Federal" } }])[0])
      .toEqual({ tabela: "estado", codigo: "DF", descricao: "Distrito Federal" });
  });

  it("GRUPO_A cobre as 15 tabelas de lookup", () => {
    expect(GRUPO_A).toHaveLength(15);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/worker/fatos/fato-referencia.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o builder**

Criar `src/worker/fatos/fato-referencia.ts`:

```typescript
// src/worker/fatos/fato-referencia.ts
// FONTE: os 15 raw_* de lookup da L1b (ver GRUPO_A).
// ESCOPO: tabela unificada de referência (tabela, codigo, descricao).
// CYCLE: incremental.
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";

export interface ReferenciaLinha {
  tabela: string;
  codigo: string;
  descricao: string | null;
}

type RawRef = { data: unknown };

/** Mapa das 15 tabelas de lookup: nome no fato + carregador do raw +
 * chaves de código e descrição dentro do JSONB `data`. */
export const GRUPO_A: {
  tabela: string;
  load: (p: PrismaClient) => Promise<RawRef[]>;
  codigo: string;
  descricao: string;
}[] = [
  { tabela: "ncm", load: (p) => p.rawSpedNcm.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "cfop", load: (p) => p.rawSpedCfop.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "cest", load: (p) => p.rawSpedCest.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "cnae", load: (p) => p.rawSpedCnae.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "nbs", load: (p) => p.rawSpedNbs.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "natureza_operacao", load: (p) => p.rawSpedNaturezaOperacao.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "unidade", load: (p) => p.rawSpedUnidade.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_icms", load: (p) => p.rawSpedCstIcms.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_icms_sn", load: (p) => p.rawSpedCstIcmsSn.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_ipi", load: (p) => p.rawSpedCstIpi.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_pis_cofins", load: (p) => p.rawSpedCstPisCofins.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_cibs", load: (p) => p.rawSpedCstCibs.findMany({ where: { rawDeleted: false } }), codigo: "cst_cibs", descricao: "nome_cst_cibs" },
  { tabela: "municipio", load: (p) => p.rawSpedMunicipio.findMany({ where: { rawDeleted: false } }), codigo: "codigo_ibge", descricao: "nome" },
  { tabela: "pais", load: (p) => p.rawSpedPais.findMany({ where: { rawDeleted: false } }), codigo: "codigo_bacen", descricao: "nome" },
  { tabela: "estado", load: (p) => p.rawSpedEstado.findMany({ where: { rawDeleted: false } }), codigo: "uf", descricao: "nome" },
];

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === false) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

/** Achata as linhas raw de UMA tabela em ReferenciaLinha[]. `codigoKey`/
 * `descricaoKey` vêm de GRUPO_A. Linhas sem código viram código "". */
export function mapReferenciaRows(
  tabela: string,
  rows: RawRef[],
): ReferenciaLinha[] {
  const cfg = GRUPO_A.find((g) => g.tabela === tabela);
  if (!cfg) throw new Error(`tabela de referência desconhecida: ${tabela}`);
  return rows.map((r) => {
    const data = r.data as Record<string, unknown>;
    return {
      tabela,
      codigo: str(data[cfg.codigo]) ?? "",
      descricao: str(data[cfg.descricao]),
    };
  });
}

/** Reconstrói fato_referencia a partir dos 15 raw_* de lookup. */
export async function rebuildFatoReferencia(prisma: PrismaClient): Promise<number> {
  const todas: ReferenciaLinha[] = [];
  for (const cfg of GRUPO_A) {
    const rows = await cfg.load(prisma);
    todas.push(...mapReferenciaRows(cfg.tabela, rows));
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoReferencia.deleteMany({});
      if (todas.length) {
        await tx.fatoReferencia.createMany({ data: todas });
      }
      await markFatoBuilt(tx, "fato_referencia");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return todas.length;
}
```

- [ ] **Step 4: Registrar o builder em `registry.ts`**

Import `rebuildFatoReferencia` e adicionar ao `FATO_BUILDERS`:

```typescript
  { nome: "fato_referencia", cycle: "incremental", run: rebuildFatoReferencia },
```

- [ ] **Step 5: Registrar em `FATO_FONTE` (`mcp/lib/freshness.ts`)**

`fato_referencia` vem de 15 modelos; `FATO_FONTE` aceita um. Usar `sped.ncm` como representativo (a maior tabela), com comentário:

```typescript
  // F4 L1b — fato_referencia vem de 15 modelos; sped.ncm é o representativo p/ fonteStatus.
  fato_referencia:           { model: "sped.ncm",                  mode: "incremental" },
```

- [ ] **Step 6: Rodar o teste e verificar**

Run: `npx prisma generate && npx jest src/worker/fatos/fato-referencia.test.ts src/worker/fatos/registry.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/worker/fatos/fato-referencia.ts src/worker/fatos/fato-referencia.test.ts src/worker/fatos/registry.ts mcp/lib/freshness.ts
git commit -m "feat(f4-l1b): builder fato_referencia (15 tabelas de lookup achatadas)"
```

---

## Task 4: Query `queryReferenciaBuscar`

**Files:**
- Create: `src/lib/reports/queries/referencia.ts`
- Create: `src/lib/reports/queries/referencia.test.ts`

- [ ] **Step 1: Escrever o teste falho**

Criar `src/lib/reports/queries/referencia.test.ts`:

```typescript
import { queryReferenciaBuscar } from "./referencia";

describe("queryReferenciaBuscar", () => {
  it("filtra por tabela e busca termo em codigo/descricao", async () => {
    const mockPrisma = {
      fatoReferencia: {
        findMany: jest.fn().mockResolvedValue([
          { tabela: "cfop", codigo: "5102", descricao: "Venda de mercadoria" },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as Parameters<typeof queryReferenciaBuscar>[0];

    const r = await queryReferenciaBuscar(mockPrisma, { tabela: "cfop", termo: "5102" });
    expect(r.total).toBe(1);
    expect(r.linhas[0]?.codigo).toBe("5102");
    const call = (mockPrisma.fatoReferencia.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.tabela).toBe("cfop");
    expect(call.where.OR).toHaveLength(2); // codigo + descricao
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/lib/reports/queries/referencia.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a query**

Criar `src/lib/reports/queries/referencia.ts`:

```typescript
// src/lib/reports/queries/referencia.ts
// Consulta da camada de referência (F4 L1b). Lê fato_referencia.
import type { PrismaClient } from "@/generated/prisma/client";

export interface ReferenciaLinha {
  tabela: string;
  codigo: string;
  descricao: string | null;
}

/** Busca entradas de uma tabela de referência nomeada por `termo` (ILIKE em
 * código e descrição). Sem `termo`, lista a tabela inteira. Devolve até
 * `limite` (padrão 50) linhas, com `total` e `truncado`. */
export async function queryReferenciaBuscar(
  prisma: PrismaClient,
  filtros: { tabela: string; termo?: string; limite?: number },
): Promise<{ linhas: ReferenciaLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 50;
  const termo = filtros.termo?.trim();
  const where = {
    tabela: filtros.tabela,
    ...(termo
      ? {
          OR: [
            { codigo: { contains: termo, mode: "insensitive" as const } },
            { descricao: { contains: termo, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.fatoReferencia.findMany({ where, orderBy: { codigo: "asc" }, take: limite }),
    prisma.fatoReferencia.count({ where }),
  ]);
  return {
    linhas: rows.map((r) => ({ tabela: r.tabela, codigo: r.codigo, descricao: r.descricao })),
    total,
    truncado: total > rows.length,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/lib/reports/queries/referencia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/queries/referencia.ts src/lib/reports/queries/referencia.test.ts
git commit -m "feat(f4-l1b): queryReferenciaBuscar"
```

---

## Task 5: Tool `referencia_buscar`

**Files:**
- Create: `mcp/tools/fiscal/referencia-buscar.ts`
- Modify: `mcp/tools/fiscal/index.ts`

- [ ] **Step 1: Criar a tool**

Criar `mcp/tools/fiscal/referencia-buscar.ts` (espelha `apuracao-fiscal.ts`; `dados` tem array `linhas` → `withFreshness` detecta "vazio" sozinho):

```typescript
// mcp/tools/fiscal/referencia-buscar.ts
// Tool MCP: referencia_buscar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryReferenciaBuscar } from "@/lib/reports/queries/referencia.js";
import { withFreshness } from "../../lib/freshness.js";

const TABELAS = [
  "ncm", "cfop", "cest", "cnae", "nbs", "natureza_operacao", "unidade",
  "cst_icms", "cst_icms_sn", "cst_ipi", "cst_pis_cofins", "cst_cibs",
  "municipio", "pais", "estado",
] as const;

const inputSchema = z.object({
  tabela: z.enum(TABELAS).describe("Tabela de referência a consultar."),
  termo: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Código ou parte da descrição. Sem termo, lista a tabela."),
  limite: z.number().int().min(1).max(200).optional(),
});

const linha = z.object({
  tabela: z.string(),
  codigo: z.string(),
  descricao: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
});

const fonteStatus = z.object({
  status: z.string(),
  ultimaSyncEm: z.string().nullable(),
});

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados,
    atualizadoEm: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalReferenciaBuscar: ToolEntry<Input, Output> = {
  id: "referencia_buscar",
  dominio: "fiscal",
  descricao:
    "Consulta as tabelas de referência fiscais, cadastrais e geográficas " +
    "(NCM, CFOP, CEST, CNAE, NBS, naturezas de operação, unidades, CSTs, " +
    "municípios, países, estados). Informe `tabela` e um `termo` (código ou " +
    "parte da descrição) para resolver 'o que é o código X'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_referencia"], () =>
      queryReferenciaBuscar(ctx.prisma, input),
    ),
};
```

- [ ] **Step 2: Registrar no índice fiscal**

Em `mcp/tools/fiscal/index.ts`, import + entrada no array `fiscalTools`:

```typescript
import { fiscalReferenciaBuscar } from "./referencia-buscar.js";
```
```typescript
  fiscalReferenciaBuscar as ToolEntry,
```

- [ ] **Step 3: Verificar typecheck do MCP**

Run: `npx tsc --noEmit -p mcp/tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mcp/tools/fiscal/referencia-buscar.ts mcp/tools/fiscal/index.ts
git commit -m "feat(f4-l1b): tool referencia_buscar"
```

---

## Task 6: Catálogo — contagem, IDs e snapshot

**Files:**
- Modify: `mcp/__tests__/integration.test.ts`
- Modify: `src/lib/mcp-catalog-snapshot.json` (regenerado)

- [ ] **Step 1: Atualizar `FISCAL_IDS` e as contagens**

Em `mcp/__tests__/integration.test.ts`:
- `FISCAL_IDS` ganha `"referencia_buscar"`.
- Catálogo de leitura **46 → 47**; catálogo bruto **47 → 48**. Pontos: `super_admin recebe EXATAMENTE 46 tools` → 47; `catálogo bruto ... 47 entradas` → 48; `super_admin vê todas as 46 tools` (2 asserções) → 47; `admin vê todas as 46 tools` → 47; `tools/list via HTTP retorna 46 tools` → 47. Se houver contagem literal de "tools de fiscal", incrementar.

- [ ] **Step 2: Rodar o teste de integração**

Run: `npx jest mcp/__tests__/integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Regenerar o snapshot**

Run: `npm run gen:mcp-catalog`
Expected: `Catálogo MCP serializado: 48 tools`.

- [ ] **Step 4: Verificar o teste do snapshot**

Run: `npx jest src/lib/actions/mcp-catalog-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/__tests__/integration.test.ts src/lib/mcp-catalog-snapshot.json
git commit -m "feat(f4-l1b): registra referencia_buscar no catalogo (47 tools) + snapshot"
```

---

## Task 7: `bi-schema-reference.ts` — `fato_referencia`

**Files:**
- Modify: `src/lib/agent/bi-schema-reference.ts`

- [ ] **Step 1: Adicionar o bloco `TABLE fato_referencia`**

Após o bloco `TABLE fato_certificado (...)`:

```sql
-- Tabelas de referência achatadas (NCM, CFOP, CEST, CNAE, NBS,
-- natureza_operacao, unidade, cst_icms, cst_icms_sn, cst_ipi,
-- cst_pis_cofins, cst_cibs, municipio, pais, estado). Filtre por `tabela`.
TABLE fato_referencia (
  id        INT PRIMARY KEY,
  tabela    TEXT,   -- qual tabela de referência (ver lista acima)
  codigo    TEXT,
  descricao TEXT
);
```

- [ ] **Step 2: Verificar o teste-trava**

Run: `npx jest src/lib/agent/bi-schema-reference.test.ts`
Expected: PASS (atualizar a lista esperada se o teste exigir).

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/bi-schema-reference.ts
git commit -m "feat(f4-l1b): fato_referencia no bi-schema-reference (Caminho 3c)"
```

---

## Task 8: Verde final

**Files:** nenhum (verificação).

- [ ] **Step 1: Bateria completa**

Run, confirmando sucesso de cada um:
- `npx tsc --noEmit`
- `npx tsc --noEmit -p mcp/tsconfig.json`
- `npx eslint mcp/tools/fiscal src/worker/fatos src/worker/catalog src/lib/reports/queries src/lib/agent`
- `npx jest`
- `npx next build`
- `docker compose build mcp`

Expected: tudo PASS.

- [ ] **Step 2: Commit (se algum verde exigiu ajuste)**

```bash
git add -A && git commit -m "chore(f4-l1b): ajustes da bateria de verde"
```

---

## Task 9: Ingestão e smoke test (parte da Onda I)

**Files:**
- Create: `scripts/f4l-smoke-l1b.ts` (smoke).

- [ ] **Step 1: Subir o stack e aplicar migration/GRANT**

Run:
- `docker compose up -d db redis`
- `set -a && . ./.env.local && set +a && npx prisma migrate deploy`
- `set -a && . ./.env && set +a && docker compose exec -T db psql -U nexus -d nexus_odoo_l1 -v mcp_pw="$MCP_DB_PASSWORD" -v bi_pw="$MCP_BI_DB_PASSWORD" < prisma/sql/provision-mcp.sql` (reaplica GRANT; `fato_referencia` é coberto pelo loop dinâmico).

- [ ] **Step 2: Escrever o smoke `scripts/f4l-smoke-l1b.ts`**

Espelha `scripts/f4l-smoke-l1c.ts`: filtra `MODEL_CATALOG` para os 27 modelos da L1b, roda `processIncrementalCycle` só neles, confere `count(raw_*)` vs `search_count` do Odoo para uma amostra (`sped.ncm`, `sped.cfop`, `sped.municipio`, `sped.estado`), chama `rebuildFatoReferencia`, e por fim `queryReferenciaBuscar(prisma, { tabela: "cfop", termo: "5102" })` e `{ tabela: "estado", termo: "DF" }`, imprimindo os resultados.

- [ ] **Step 3: Rodar o smoke**

Run: `tsx --env-file=.env.local scripts/f4l-smoke-l1b.ts`
Expected: contagens batem; `fato_referencia` com ~23k linhas; a busca de CFOP 5102 e estado DF retorna a descrição correta.

- [ ] **Step 4: Commit**

```bash
git add scripts/f4l-smoke-l1b.ts
git commit -m "test(f4-l1b): smoke da ingestao da camada de referencia"
```

---

## Critérios de pronto (da spec §4)

1. 27 `Raw*` + `MODEL_CATALOG` (`incremental`) + migration `f4l_referencia`.
2. `FatoReferencia` + builder + teste do mapeamento dos 15 tipos verde.
3. `referencia_buscar` visível para `fiscal`, ausente para quem não tem, responde.
4. `fato_referencia` no `bi-schema-reference.ts`; GRANT pelo loop dinâmico.
5. Catálogo +1 (47 leitura / 48 bruto); snapshot regenerado.
6. Verde: `tsc` raiz+mcp, `eslint`, `jest`, `next build`, `docker compose build mcp`.
7. Onda I: contagem conferida; `fato_referencia` construído; tool com dado real.
