# O1 SPED Fiscal (DF-e de entrada) , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox.

**Goal:** Entregar cobertura de DF-e de entrada (notas de fornecedores capturadas eletronicamente) no Nex: 1 raw novo (`sped.consulta.dfe.item`), 1 fato (`FatoDfe`), 3 tools MCP, visível no painel "Estado da ingestão".

**Architecture:** Raw sync (MODEL_CATALOG) -> `raw_sped_consulta_dfe_item` -> builder `fato-dfe.ts` -> `fato_dfe` -> 3 tools fiscais lendo do fato com `withFreshness`. 100% aditivo.

**Tech Stack:** Prisma (`raw_*`/`fato_*`), worker BullMQ, `@modelcontextprotocol/sdk` (mcp), Zod, jest.

**SPEC base:** `docs/superpowers/specs/2026-05-29-o1-sped-fiscal-spec.md` v3.
**Dossiê de padrões:** embutido abaixo (extraído dos arquivos reais).
**Versão do plano:** v3 (aplica `reviews/2026-05-30-o1-plan-reviews.md`: PR1-1
`consultaId`, PR1-2 workaround de drift, PR1-3 comando da bateria, PR1-4 delta +3,
PR2-1 handler-template completo).

---

## Task 0: Investigação do raw real (decisões de produto)

> Antes de codar, confirmar 3 itens contra o dado real (a SPEC os deixou abertos
> por dependerem do shape). Sem isso, risco de campo errado.

- [ ] **Step 1: Script temporário de inspeção (NÃO comitar)**

Criar `scripts/discovery/_tmp-dfe-shape.ts`:
```ts
import { clientFromEnv } from "../../src/worker/odoo/client";
async function main() {
  const c = clientFromEnv("read"); await c.authenticate();
  const fields = await c.fieldsGet("sped.consulta.dfe.item");
  const interest = ["chave","numero","modelo","cnpj_cpf","participante_id","vr_nf",
    "data_hora_emissao","data_hora_recebimento","manifestacao","pode_manifestar",
    "consulta_id","write_date"];
  for (const f of interest) console.log(f, "::", (fields as any)[f]?.type, (fields as any)[f]?.string);
  const sample = await c.searchRead("sped.consulta.dfe.item", [], interest, { limit: 3, order: "id desc" });
  console.log(JSON.stringify(sample, null, 2));
}
main();
```
Run: `npx tsx --env-file=.env.local scripts/discovery/_tmp-dfe-shape.ts`

- [ ] **Step 2: Decidir e anotar (no topo do builder, como comentário)**
  - (a) `cycle`: existe `write_date`? Sim -> `incremental`. Não -> `snapshot`.
  - (b) "pendente de manifestação": `manifestacao` vazio/false. Confirmar se
    `pode_manifestar=true` refina (ex.: manifestação vazia mas já fechada).
  - (c) `empresaId`: `consulta_id` traz o id do lote; decidir se sincroniza também
    `sped.consulta.dfe` (35 regs) para resolver `empresa_id`. Default: **sim**
    (barato, enriquece), vira +1 no MODEL_CATALOG. Se o item já trouxer empresa
    direta, dispensar.

- [ ] **Step 3: Deletar o script temporário**
Run: `rm scripts/discovery/_tmp-dfe-shape.ts` (não deve sujar a árvore).

---

## Task 1: Modelos Prisma (RawSpedConsultaDfeItem + FatoDfe) + migration

**Files:** `prisma/schema.prisma`

- [ ] **Step 1: Adicionar o raw model** (junto ao cluster sped, ~linha 819)
```prisma
model RawSpedConsultaDfeItem {
  odooId        Int       @id @map("odoo_id")
  data          Json
  odooWriteDate DateTime? @map("odoo_write_date")
  syncedAt      DateTime  @default(now()) @map("synced_at")
  rawDeleted    Boolean   @default(false) @map("raw_deleted")

  @@index([odooWriteDate])
  @@index([rawDeleted])
  @@map("raw_sped_consulta_dfe_item")
}
```
(Se Task 0c = sim, adicionar também `RawSpedConsultaDfe` com `@@map("raw_sped_consulta_dfe")`, mesmo shape.)

- [ ] **Step 2: Adicionar o fato model** (junto a FatoNotaFiscal, ~linha 1885)
```prisma
model FatoDfe {
  odooId          Int       @id @map("odoo_id")
  chave           String?
  numero          String?
  modelo          String?
  cnpjFornecedor  String?   @map("cnpj_fornecedor")
  fornecedorId    Int?      @map("fornecedor_id")
  fornecedorNome  String?   @map("fornecedor_nome")
  vrNf            Decimal   @default(0) @map("vr_nf") @db.Decimal(18, 2)
  dataEmissao     DateTime? @map("data_emissao")
  dataRecebimento DateTime? @map("data_recebimento")
  manifestacao    String?
  podeManifestar  Boolean   @default(false) @map("pode_manifestar")
  consultaId      Int?      @map("consulta_id") // id do LOTE sped.consulta.dfe (review PR1-1); empresa real fica p/ enriquecimento futuro
  atualizadoEm    DateTime  @default(now()) @map("atualizado_em")

  @@index([dataEmissao])
  @@index([cnpjFornecedor])
  @@index([manifestacao])
  @@map("fato_dfe")
}
```

- [ ] **Step 3: Gerar a migration (AVISAR o usuário antes , Postgres dev compartilhado)**
Anunciar: "vou aplicar uma migration aditiva (raw_sped_consulta_dfe_item + fato_dfe); muda o schema do DB dev compartilhado". Depois:
Run: `npx prisma migrate dev --name o1_dfe_entrada`
Run: `agente schema-changed`
Expected: migration aplicada, `prisma generate` automático.

> **Workaround de drift (review PR1-2):** se `migrate dev` pedir RESET por drift
> pré-existente (já ocorreu no R2-ctx), NÃO resetar. Gerar o SQL com
> `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
> (ou o diff apropriado), aplicar via psql/`$executeRawUnsafe`, e
> `npx prisma migrate resolve --applied o1_dfe_entrada`. Mesma estratégia do R2-ctx.

- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(o1): schema raw_sped_consulta_dfe_item + fato_dfe (migration aditiva)"
```

---

## Task 2: MODEL_CATALOG + testes de contagem

**Files:** `src/worker/catalog/model-catalog.ts`, `src/worker/catalog/model-catalog.test.ts`

- [ ] **Step 1: Adicionar entrada(s)** no array (cluster sped, ~linha 66)
```ts
  { odooModel: "sped.consulta.dfe.item", mode: "incremental" },
```
(+ `{ odooModel: "sped.consulta.dfe", mode: "incremental" },` se Task 0c=sim.)
E atualizar o comentário do cabeçalho (linha 2) com a nova contagem incremental.

- [ ] **Step 2: Atualizar o teste de contagem (TDD reverso: bumpar o esperado)**
Em `model-catalog.test.ts:50-51`: `toHaveLength(113)` -> `114` (ou `115`).
E criar/usar `const MODELOS_O1 = new Set(["sped.consulta.dfe.item"/*, "sped.consulta.dfe"*/]);`
adicionando ao filtro de cobertura (~linha 71): `&& !MODELOS_O1.has(m)`.

- [ ] **Step 3: Rodar**
Run: `npx jest src/worker/catalog/model-catalog.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/worker/catalog/model-catalog.ts src/worker/catalog/model-catalog.test.ts
git commit -m "feat(o1): registra sped.consulta.dfe.item no MODEL_CATALOG (painel 113->114)"
```

---

## Task 3: Builder fato-dfe.ts (TDD)

**Files:** `src/worker/fatos/fato-dfe.ts`, `src/worker/fatos/fato-dfe.test.ts`, `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste do mapper + rebuild (falha primeiro)**
`fato-dfe.test.ts` (padrão de `fato-nota-fiscal.test.ts`):
```ts
import { mapDfeRow, rebuildFatoDfe } from "./fato-dfe";

const baseRaw: Record<string, unknown> = {
  id: 1, chave: "352401...", numero: "123", modelo: "55",
  cnpj_cpf: "12345678000199", participante_id: [10, "Fornecedor X"],
  vr_nf: "1500.00", data_hora_emissao: "2026-01-15 10:00:00",
  data_hora_recebimento: "2026-01-16 09:00:00", manifestacao: "conhecido",
  pode_manifestar: false, consulta_id: [3, "Lote NSU"],
};

describe("mapDfeRow", () => {
  it("mapeia escalares, m2o, data e decimal", () => {
    const r = mapDfeRow(baseRaw);
    expect(r.odooId).toBe(1);
    expect(r.cnpjFornecedor).toBe("12345678000199");
    expect(r.fornecedorId).toBe(10);
    expect(r.fornecedorNome).toBe("Fornecedor X");
    expect(r.vrNf).toBe(1500);
    expect(r.manifestacao).toBe("conhecido");
    expect(r.podeManifestar).toBe(false);
    expect(r.dataEmissao).toEqual(new Date("2026-01-15T10:00:00"));
  });
  it("trata false/ausente como null", () => {
    const r = mapDfeRow({ id: 2, cnpj_cpf: false, vr_nf: false, manifestacao: false, data_hora_emissao: false });
    expect(r.cnpjFornecedor).toBeNull();
    expect(r.vrNf).toBe(0);
    expect(r.manifestacao).toBeNull();
    expect(r.dataEmissao).toBeNull();
  });
  it("nao inclui atualizadoEm (default no schema)", () => {
    expect("atualizadoEm" in mapDfeRow(baseRaw)).toBe(false);
  });
});

describe("rebuildFatoDfe", () => {
  it("le raw, mapeia e popula em transacao", async () => {
    const mockTx = {
      fatoDfe: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
      fatoBuildState: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const mockPrisma = {
      rawSpedConsultaDfeItem: { findMany: jest.fn().mockResolvedValue([{ data: baseRaw }]) },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(mockTx)),
    } as unknown as Parameters<typeof rebuildFatoDfe>[0];
    const count = await rebuildFatoDfe(mockPrisma);
    expect(count).toBe(1);
    expect(mockTx.fatoDfe.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.fatoBuildState.upsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**
Run: `npx jest src/worker/fatos/fato-dfe.test.ts` , FAIL (módulo não existe).

- [ ] **Step 3: Implementar fato-dfe.ts** (padrão fato-nota-fiscal.ts)
```ts
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoDfeRow {
  odooId: number; chave: string | null; numero: string | null; modelo: string | null;
  cnpjFornecedor: string | null; fornecedorId: number | null; fornecedorNome: string | null;
  vrNf: number; dataEmissao: Date | null; dataRecebimento: Date | null;
  manifestacao: string | null; podeManifestar: boolean; consultaId: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(`${v.replace(" ", "T")}`) : null;

export function mapDfeRow(raw: Record<string, unknown>): FatoDfeRow {
  return {
    odooId: Number(raw.id),
    chave: str(raw.chave), numero: str(raw.numero), modelo: str(raw.modelo),
    cnpjFornecedor: str(raw.cnpj_cpf),
    fornecedorId: relId(raw.participante_id as OdooM2O),
    fornecedorNome: relNome(raw.participante_id as OdooM2O),
    vrNf: Number(raw.vr_nf ?? 0),
    dataEmissao: dt(raw.data_hora_emissao), dataRecebimento: dt(raw.data_hora_recebimento),
    manifestacao: str(raw.manifestacao),
    podeManifestar: raw.pode_manifestar === true,
    consultaId: relId(raw.consulta_id as OdooM2O), // id do lote (PR1-1)
  };
}

export async function rebuildFatoDfe(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedConsultaDfeItem.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapDfeRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoDfe.deleteMany({});
      if (mapped.length) await tx.fatoDfe.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_dfe");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
```

- [ ] **Step 4: Registrar no pipeline** , `src/worker/fatos/registry.ts`:
import `rebuildFatoDfe` e adicionar ao `FATO_BUILDERS`:
```ts
  { nome: "fato_dfe", cycle: "incremental", run: rebuildFatoDfe },
```

- [ ] **Step 5: Rodar e ver passar**
Run: `npx jest src/worker/fatos/fato-dfe.test.ts` , PASS.

- [ ] **Step 6: Commit**
```bash
git add src/worker/fatos/fato-dfe.ts src/worker/fatos/fato-dfe.test.ts src/worker/fatos/registry.ts
git commit -m "feat(o1): builder fato-dfe (de raw_sped_consulta_dfe_item) + registro no pipeline"
```

---

## Task 4: FATO_FONTE no freshness

**Files:** `mcp/lib/freshness.ts`

- [ ] **Step 1: Adicionar entrada** (cluster fiscal, ~linha 43)
```ts
  fato_dfe: { model: "sped.consulta.dfe.item", mode: "incremental" },
```
- [ ] **Step 2: tsc** Run: `npx tsc --noEmit` , PASS.
- [ ] **Step 3: Commit**
```bash
git add mcp/lib/freshness.ts
git commit -m "feat(o1): registra fato_dfe em FATO_FONTE (freshness)"
```

---

## Task 5: Query layer dfe (TDD, em src/lib/reports/queries)

> As tools delegam para funções de query testáveis (estilo B, padrão do fiscal).

**Files:** `src/lib/reports/queries/dfe.ts`, `src/lib/reports/queries/dfe.test.ts`

- [ ] **Step 1: Testes das 3 queries (mock prisma)** , `dfe.test.ts`:
Cobrir `queryDfeImportadosPeriodo` (filtro por dataEmissao, retorna linhas+totais),
`queryDfePorFornecedor` (group by cnpjFornecedor em memória, conta+soma vrNf),
`queryDfePendentesManifestacao` (where manifestacao null/empty). Mock
`prisma.fatoDfe.findMany`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `dfe.ts`** , 3 funções puras `(prisma, input) => dados`,
agregação em TS (padrão `queryFaturamentoPorCliente` em `fiscal.ts`). Normalizar
CNPJ no filtro com `.replace(/\D/g, "")`.

- [ ] **Step 4: Rodar e ver passar. Commit.**
```bash
git commit -m "feat(o1): queries dfe (periodo/por-fornecedor/pendentes-manifestacao) + testes"
```

---

## Task 6-8: As 3 tools MCP

**Files:** `mcp/tools/fiscal/dfe-importados-periodo.ts`, `dfe-por-fornecedor.ts`, `dfe-pendentes-manifestacao.ts`, `mcp/tools/fiscal/index.ts`

> Cada tool segue o `ToolEntry` canônico. Template COMPLETO (review PR2-1) da
> Task 6, as outras duas trocam só input/query/agregação:
```ts
// mcp/tools/fiscal/dfe-importados-periodo.ts
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { queryDfeImportadosPeriodo } from "../../../src/lib/reports/queries/dfe.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});
const linhaSchema = z.object({
  chave: z.string().nullable(), numero: z.string().nullable(),
  fornecedor: z.string().nullable(), cnpj: z.string().nullable(),
  valor: z.number(), dataEmissao: z.string().nullable(), manifestacao: z.string().nullable(),
});
const dados = z.object({
  linhas: z.array(linhaSchema), totalNotas: z.number().int(), valorTotal: z.number(),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(), _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});
const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(),
    atualizadoHa: z.string(), fonteStatus }),
]);
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalDfeImportadosPeriodo: ToolEntry<Input, Output> = {
  id: "fiscal_dfe_importados_periodo",
  dominio: "fiscal",
  descricao: "DF-e (notas de fornecedores capturadas eletronicamente) importadas no periodo. Diferente de 'notas recebidas' (documentos proprios de entrada).",
  inputSchemaShape: inputSchema.shape, inputSchema, outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_dfe"], () =>
      queryDfeImportadosPeriodo(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const cap = d.linhas.slice(0, 30);
    return enriquecerEnvelope(
      { ...envelope, dados: { ...d, linhas: cap } },
      "fiscal_dfe_importados_periodo",
      { destaque: { "DF-e": d.totalNotas, "Valor (pode ser 0)": d.valorTotal },
        agregado: { contagem: d.totalNotas, soma: d.valorTotal },
        listaTruncada: d.linhas.length > cap.length },
    );
  },
};
```
> - **Task 7 (`fiscal_dfe_por_fornecedor`):** input `{ periodoDe?, periodoAte?, top? }`;
>   query `queryDfePorFornecedor` (group by `cnpjFornecedor`); linha `{ cnpj, fornecedor,
>   qtdNotas, valorTotal }`; `_DESTAQUE` top fornecedor; `_agregado` { contagem, soma }.
> - **Task 8 (`fiscal_dfe_pendentes_manifestacao`):** input `{ periodoDe?, periodoAte? }`;
>   query `queryDfePendentesManifestacao` (where `manifestacao` null/empty, criterio Task 0b);
>   linha igual a importados; `_DESTAQUE` { Pendentes: total }.

- [ ] **Task 6:** `fiscal_dfe_importados_periodo` , lista DF-e do período + KPIs
  (qtd, soma vrNf com aviso "valor pode estar 0 nesta base"). Registrar em
  `index.ts` (import + array). Commit.
- [ ] **Task 7:** `fiscal_dfe_por_fornecedor` , agrega por `cnpjFornecedor`
  (qtd DF-e + soma vrNf), ordena por qtd, top N. Registrar. Commit.
- [ ] **Task 8:** `fiscal_dfe_pendentes_manifestacao` , lista DF-e com
  `manifestacao` vazio (critério da Task 0b), KPI de total pendente. Registrar. Commit.

Após cada tool: `npx tsc --noEmit && npx jest <tool ou query>`.

---

## Task 9: Bumps de contagem do catálogo MCP

**Files:** `mcp/__tests__/integration.test.ts`, `mcp/tools/fiscal/index.ts` (comentário)

- [ ] **Step 1:** `FISCAL_IDS` (linhas 139-157): +3 ids
  (`fiscal_dfe_importados_periodo`, `fiscal_dfe_por_fornecedor`, `fiscal_dfe_pendentes_manifestacao`).
- [ ] **Step 2:** contagens (review PR1-4: ler o número ATUAL e somar +3, não
  confiar no literal, pois outra mudança pode ter deslocado): super_admin/admin
  `toHaveLength(N)` -> `N+3`; `catalogo toHaveLength(M)` -> `M+3`. Hoje N=68, M=77
  (-> 71, 80). Comentário de `index.ts` "17 tools" -> "20".
- [ ] **Step 3:** Run `npx jest mcp/__tests__/integration.test.ts` , PASS. Commit.

---

## Task 10: Vocabulário do Router

**Files:** `src/lib/agent/router/domain-vocabulary.ts`, `domain-vocabulary.test.ts`

- [ ] **Step 1:** enriquecer o domínio `fiscal` (linhas 158-178): `description`
  e `forceIncludeOn` com `/df-?e/i`, `/manifesta[cç][aã]o/i`, `/notas? de fornecedor/i`,
  `/notas? importadas?/i`, `/compras eletr[oô]nicas/i`.
- [ ] **Step 2:** adicionar asserts no `domain-vocabulary.test.ts` (padrão linhas 73-94).
- [ ] **Step 3:** Run jest , PASS. Commit. (Nota: muda `VOCABULARY_VERSION` via hash ,
  rebuild `app` em prod.)

---

## Task 11: Verificação E2E + sync + rebuild + bateria

- [ ] **Step 1:** `npx tsc --noEmit && npx eslint src/ mcp/ && npx jest` , tudo verde.
- [ ] **Step 2:** Subir worker e sincronizar o modelo novo:
  `npm run worker` (ou disparar o job de sync). Confirmar que `raw_sped_consulta_dfe_item`
  populou (~6.288) e o builder rodou (`fato_dfe` populado).
- [ ] **Step 3:** **Painel "Estado da ingestão"** (`/configuracao`) mostra
  `sped.consulta.dfe.item` com status **ok**, registros > 0, contagem 113->114.
- [ ] **Step 4:** rebuild containers: `docker compose up -d --build worker mcp`.
- [ ] **Step 5:** **E2E dado real:** chamar as 3 tools contra o cache; conferir:
  `dfe_pendentes_manifestacao` ~5.667; `dfe_por_fornecedor` soma por cnpj coerente;
  `dfe_importados_periodo` qtd bate com count do raw no período.
- [ ] **Step 6:** Bateria R-X com perguntas DF-e (review PR1-3): rodar
  `pnpm tsx scripts/quality-audit/03-run-test-questions.ts --limit 300` (padrão
  R8-R23), com 3-5 perguntas DF-e novas adicionadas ao banco de perguntas; comparar
  com baseline 95,5% (relatório em `docs/agent-quality-review/`). >= 95,5% e sem
  regressão. (Vocabulário do Router, Task 10, precisa estar pronto antes , dep. PR2-3.)
- [ ] **Step 7:** `/gsd-code-review`. UI review n/a.
- [ ] **Step 8:** STATUS + HISTORY. PR (gated merge). Commit.

---

## Self-Review (cobertura da SPEC v3)

- §4 FatoDfe (campos reais): Task 1, 3. ✓
- §5 raw + MODEL_CATALOG + painel: Task 1, 2, 11.3. ✓
- §6 3 tools: Task 5-8. ✓
- §7 Router vocab: Task 10. ✓
- §9 painel ok 113->114: Task 11.3. ✓
- §10 verificação dado real + rebuild: Task 11. ✓
- §11 sequência: Task 0->11 na ordem. ✓
- §12 D6 (manifestação criterio) + cycle + lote: Task 0. ✓
