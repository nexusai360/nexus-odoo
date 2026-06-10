# Fase 2 , Intercompany + Receita Consolidada Externa , Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Versão: **v3** (pós 2 reviews adversariais , fiscal + arquitetura, validadas no cache real). Pronto para execução.
> Base: SPEC v3 `docs/superpowers/specs/2026-06-09-f2-intercompany-receita-consolidada-design.md`.

## 0. Mudanças aplicadas das 2 reviews do plano (rastreabilidade)

**Números-meta CONFIRMADOS no cache real (algoritmo do plano):** receitaExterna R$ 897.233.379,31;
receitaIntragrupoEliminavel R$ 418.573.611,29; receitaIndividualTotal R$ 1.315.806.990,60
(== F1.totalReceita, reconciliação fecha exata); intercompanyBrutoVrProdutos R$ 679.479.247,31;
notas intra/ext 6.230/28.186. (Pós-B1 esses valores mudam levemente, ver abaixo.)

**Review fiscal (BLOQUEIOS):**
- **B1: a cascata ainda perde R$ 39,7 mi de intragrupo** porque parte dos nomes traz o CNPJ com
  caracteres Unicode (ZWJ U+200D entre blocos, non-breaking hyphen U+2011). A regex estrita não
  casa. **Correção (Task 1):** `extrairRaizCnpjDeTexto` normaliza invisíveis e tolera separadores
  Unicode + teste com `"26‍.308‍.789/0001‑36"`. Pós-correção: receitaExterna cai ~R$ 257 mil,
  bruto sobe ~R$ 39,7 mi (valores exatos saem do E2E; bandas largas).
- **B2: o E2E não travava valores absolutos.** **Correção (Task 9):** checks de banda nos 3 números
  + alinhar o SQL de referência à MESMA base/gate do código.

**Review arquitetura (BLOQUEIOS):**
- **B1: `extrairRaizCnpj` deve exigir 14 dígitos** (senão CPF de 11 dígitos vira "raiz" e um PF
  do grupo entra no Set). **Correção (Task 1):** gate `=== 14` + teste com CPF → null.
- **B5: faltavam testes unitários dos 2 formatadores novos.** **Correção (Task 7):** describe por
  formatador em `responder.test.ts`.
- **B6: a allowlist tem um teste `.skip`, então não valida o registry.** **Correção (Task 7):**
  teste não-skipado `ehFormatadorGenerico(formatadorPorTool("fiscal_receita_consolidada")) === false`
  para as 2 tools.
- **M1 (decisão): reconciliação cruzada F1==F2 é E2E-only**, NÃO campo de saída de produção
  (evita acoplar a métrica à F1 e mock duplo). Corrige a SPEC §4.2/§7 (reconciliação verificada
  no E2E, não exposta na tool). A interface `ReceitaConsolidadaResultado` não tem `reconciliacao`.
- **M3: E2E checa cobertura do join** (itens cujo `documentoId` não está no mapa de notas == 0).

**Goal:** Entregar a receita consolidada externa (visão C, eliminando intercompany via CPC 36) e a matriz intercompany, com marcação intragrupo robusta (cascata documentoDigits→CNPJ do nome) e reconciliação cruzada com a Fase 1.

**Architecture:** Nova camada de dado/lógica de grupo em `src/lib/fiscal/grupo/` (raízes CNPJ + extração + marcação de nota). Duas métricas puras em `src/lib/metrics/fiscal/` (`receitaConsolidada`, `matrizIntercompany`) que NÃO usam `$queryRaw`: combinam `groupBy` nativo no item com `findMany` de notas, fazendo o join em memória (mesma classificação por id-representante da Fase 1, garantindo reconciliação). Duas tools MCP novas + dois formatadores. Tudo TDD; E2E contra o cache real + rebuild do `mcp`.

**Tech Stack:** TypeScript, Prisma, Zod, Jest, `@modelcontextprotocol/sdk`.

---

## Decisões de design travadas

1. **Sem `$queryRaw`, sem migration.** A métrica faz 3 acessos nativos: (a) `groupBy(['documentoId','cfopId'])` no item; (b) `findMany distinct cfopId` para o nome representante (igual F1); (c) `findMany` das notas `{odooId,empresaId,empresaNome,participanteId,participanteNome}`. Join em memória por `documentoId`.
2. **Marcação em cascata.** `ehNotaIntragrupo(nota, participantesGrupo)` = `participantesGrupo.has(participanteId)` OU `extrairRaizCnpjDeTexto(participanteNome) ∈ RAIZES_GRUPO`.
3. **Reconciliação por construção.** Mesmo recorte (saída autorizada + período no item + empresa), mesma classificação (`classificarCfop(extrairCfop(nomeRepresentante))`) da F1. Invariante: `receitaIndividualTotal == totalReceita(F1)`.
4. **Separar 3 números:** `intercompanyBrutoVrProdutos` (todas operações intra), `receitaIntragrupoEliminavel` (só ehReceita intra), `receitaExterna` (ehReceita externa). `receitaExterna + receitaIntragrupoEliminavel == receitaIndividualTotal`.
5. **Contagem de notas** = `odooId` distintos por classe (do mapa de notas), nunca `_count` de itens.
6. **`Number(Decimal)`** em toda soma (groupBy nativo, sem bigint do raw).
7. **Formatador** lê só `_DESTAQUE`; matriz via `topLinhasJson` (top 10, `JSON.parse` com fallback).

---

## Estrutura de arquivos

**Criar:**
- `src/lib/fiscal/grupo/raizes-cnpj.ts` , `RAIZES_GRUPO: ReadonlySet<string>`.
- `src/lib/fiscal/grupo/cnpj.ts` , `extrairRaizCnpj`, `extrairRaizCnpjDeTexto`. Puras.
- `src/lib/fiscal/grupo/participantes-grupo.ts` , `carregarParticipantesGrupo`, `ehNotaIntragrupo`.
- `src/lib/fiscal/grupo/index.ts` , API pública.
- `src/lib/fiscal/grupo/__tests__/cnpj.test.ts`
- `src/lib/fiscal/grupo/__tests__/participantes-grupo.test.ts`
- `src/lib/metrics/fiscal/receita-consolidada.ts` (+ `.test.ts`)
- `src/lib/metrics/fiscal/matriz-intercompany.ts` (+ `.test.ts`)
- `mcp/tools/fiscal/receita-consolidada.ts`
- `mcp/tools/fiscal/intercompany.ts`
- `src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts`

**Modificar:**
- `src/lib/metrics/fiscal/index.ts` , exporta as 2 métricas.
- `mcp/tools/fiscal/index.ts` , registra as 2 tools.
- `mcp/lib/responder.ts` , 2 formatadores + allowlist `TOOLS_QUE_PRECISAM_FORMATADOR`.
- `mcp/catalog/tool-triggers.data.ts` , triggers das 2 tools.

---

## Task 1: Raízes CNPJ + extração (TDD)

**Files:**
- Create: `src/lib/fiscal/grupo/raizes-cnpj.ts`, `src/lib/fiscal/grupo/cnpj.ts`
- Test: `src/lib/fiscal/grupo/__tests__/cnpj.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/fiscal/grupo/__tests__/cnpj.test.ts
import { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "../cnpj";

describe("extrairRaizCnpj", () => {
  it("pega os 8 primeiros digitos de um CNPJ (14 digitos)", () => {
    expect(extrairRaizCnpj("34161829000430")).toBe("34161829");
  });
  it("limpa mascara antes de extrair", () => {
    expect(extrairRaizCnpj("34.161.829/0004-30")).toBe("34161829");
  });
  it("exige 14 digitos: CPF (11) nao e raiz de CNPJ (B1 review)", () => {
    expect(extrairRaizCnpj("34161829000")).toBeNull(); // 11 dig = CPF
    expect(extrairRaizCnpj("123")).toBeNull();
    expect(extrairRaizCnpj(null)).toBeNull();
    expect(extrairRaizCnpj("")).toBeNull();
  });
});

describe("extrairRaizCnpjDeTexto", () => {
  it("extrai a raiz do 1o CNPJ mascarado embutido em texto livre", () => {
    const nome = "Jht SP Comercio - Filial SE 34.161.829/0004-30 - Razao [34.161.829/0004-30]";
    expect(extrairRaizCnpjDeTexto(nome)).toBe("34161829");
  });
  it("tolera Unicode no CNPJ: ZWJ (U+200D) + non-breaking hyphen (U+2011) (B1 review)", () => {
    const nome = "Matrix - Jht SP 26‍.308‍.789/0001‑36 Ltda";
    expect(extrairRaizCnpjDeTexto(nome)).toBe("26308789");
  });
  it("retorna null quando nao ha CNPJ no texto", () => {
    expect(extrairRaizCnpjDeTexto("Cliente Externo Ltda")).toBeNull();
    expect(extrairRaizCnpjDeTexto(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/grupo/__tests__/cnpj.test.ts`
Expected: FAIL ("Cannot find module '../cnpj'").

- [ ] **Step 3: Implementar**

```ts
// src/lib/fiscal/grupo/raizes-cnpj.ts
/**
 * Raizes de CNPJ (8 digitos) dos estabelecimentos do grupo economico.
 * Fonte: pericia 2026-06-09 §2 (parseado das notas do cache). PONTO DE
 * PARAMETRIZACAO FUTURA: virar tabela/config quando o grupo mudar.
 */
export const RAIZES_GRUPO: ReadonlySet<string> = new Set([
  "07390039", "10557556", "18282961", "33718546", "34161829",
  "34461908", "35156509", "45424185", "62673999",
]);
```

```ts
// src/lib/fiscal/grupo/cnpj.ts
/**
 * Raiz (8 digitos) de um CNPJ (14 digitos) ja-digitos ou mascarado. Null se nao tiver
 * exatamente 14 digitos , um CPF (11) NAO tem raiz de CNPJ (review arquitetura B1).
 */
export function extrairRaizCnpj(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const digits = doc.replace(/\D/g, "");
  return digits.length === 14 ? digits.slice(0, 8) : null;
}

/**
 * Raiz do 1o CNPJ embutido em texto livre. Tolera Unicode (zero-width joiner U+200D,
 * non-breaking hyphen U+2011) que aparece no participante_nome do cache (review fiscal B1):
 * primeiro remove caracteres invisiveis, depois casa 14 digitos no padrao 2-3-3-4-2 com
 * separadores nao-digito flexiveis.
 */
export function extrairRaizCnpjDeTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpo = texto.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const m = limpo.match(/(\d{2})\D?(\d{3})\D?(\d{3})\D{0,2}(\d{4})\D?(\d{2})/);
  if (!m) return null;
  const digits = m.slice(1, 6).join("");
  return digits.length === 14 ? digits.slice(0, 8) : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/grupo/__tests__/cnpj.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fiscal/grupo/raizes-cnpj.ts src/lib/fiscal/grupo/cnpj.ts src/lib/fiscal/grupo/__tests__/cnpj.test.ts
git commit -m "feat(fiscal): raizes CNPJ do grupo + extracao de raiz (doc e texto livre)"
```

---

## Task 2: `carregarParticipantesGrupo` + `ehNotaIntragrupo` (TDD)

**Files:**
- Create: `src/lib/fiscal/grupo/participantes-grupo.ts`
- Test: `src/lib/fiscal/grupo/__tests__/participantes-grupo.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/fiscal/grupo/__tests__/participantes-grupo.test.ts
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../participantes-grupo";
import type { PrismaClient } from "../../../../generated/prisma/client";

describe("carregarParticipantesGrupo", () => {
  it("devolve Set de odooId cujos parceiros tem raiz CNPJ do grupo", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { odooId: 11, documentoDigits: "34161829000430" }, // grupo
      { odooId: 22, documentoDigits: "99999999000199" }, // externo
      { odooId: 33, documentoDigits: null }, // sem doc
    ]);
    const prisma = { fatoParceiro: { findMany } } as unknown as PrismaClient;
    const set = await carregarParticipantesGrupo(prisma);
    expect(set.has(11)).toBe(true);
    expect(set.has(22)).toBe(false);
    expect(set.has(33)).toBe(false);
  });
});

describe("ehNotaIntragrupo", () => {
  const grupo = new Set<number>([11]);
  it("true quando participante esta no Set (via documento)", () => {
    expect(ehNotaIntragrupo({ participanteId: 11, participanteNome: "X" }, grupo)).toBe(true);
  });
  it("true via fallback do CNPJ no nome quando participante nao esta no Set", () => {
    const nota = { participanteId: 77, participanteNome: "Jds - 18.282.961/0001-00 [18.282.961/0001-00]" };
    expect(ehNotaIntragrupo(nota, grupo)).toBe(true);
  });
  it("false para participante externo sem CNPJ do grupo no nome", () => {
    expect(ehNotaIntragrupo({ participanteId: 77, participanteNome: "Cliente Externo" }, grupo)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/grupo/__tests__/participantes-grupo.test.ts`
Expected: FAIL ("Cannot find module '../participantes-grupo'").

- [ ] **Step 3: Implementar**

```ts
// src/lib/fiscal/grupo/participantes-grupo.ts
import type { PrismaClient } from "../../../generated/prisma/client";
import { RAIZES_GRUPO } from "./raizes-cnpj";
import { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "./cnpj";

/**
 * Carrega o conjunto de participantes (odoo_id) cujo CNPJ raiz pertence ao grupo,
 * via fato_parceiro.documentoDigits. NAO cachear por processo (o dado muda no sync);
 * chamar 1x por request de metrica.
 */
export async function carregarParticipantesGrupo(prisma: PrismaClient): Promise<Set<number>> {
  const parceiros = await prisma.fatoParceiro.findMany({ select: { odooId: true, documentoDigits: true } });
  const set = new Set<number>();
  for (const p of parceiros) {
    const raiz = extrairRaizCnpj(p.documentoDigits);
    if (raiz && RAIZES_GRUPO.has(raiz)) set.add(p.odooId);
  }
  return set;
}

/**
 * Marcacao intercompany em cascata: participante no Set (via documento) OU raiz do
 * CNPJ embutido no participanteNome ∈ RAIZES_GRUPO (defesa contra parceiro do grupo
 * cadastrado sem CNPJ no fato_parceiro).
 */
export function ehNotaIntragrupo(
  nota: { participanteId: number | null; participanteNome: string | null },
  participantesGrupo: Set<number>,
): boolean {
  if (nota.participanteId !== null && participantesGrupo.has(nota.participanteId)) return true;
  const raiz = extrairRaizCnpjDeTexto(nota.participanteNome);
  return raiz !== null && RAIZES_GRUPO.has(raiz);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/grupo/__tests__/participantes-grupo.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Criar `index.ts` + commit**

```ts
// src/lib/fiscal/grupo/index.ts
export { RAIZES_GRUPO } from "./raizes-cnpj";
export { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "./cnpj";
export { carregarParticipantesGrupo, ehNotaIntragrupo } from "./participantes-grupo";
```

```bash
git add src/lib/fiscal/grupo/participantes-grupo.ts src/lib/fiscal/grupo/index.ts src/lib/fiscal/grupo/__tests__/participantes-grupo.test.ts
git commit -m "feat(fiscal): marcacao intercompany em cascata (participantes do grupo + ehNotaIntragrupo)"
```

---

## Task 3: Métrica `receitaConsolidada` (TDD)

**Files:**
- Create: `src/lib/metrics/fiscal/receita-consolidada.ts`, `src/lib/metrics/fiscal/receita-consolidada.test.ts`
- Modify: `src/lib/metrics/fiscal/index.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/metrics/fiscal/receita-consolidada.test.ts
import { receitaConsolidada } from "./receita-consolidada";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma() {
  // 2 notas: 100 (intragrupo, participante 11), 200 (externo, participante 99)
  const itemGroupBy = jest.fn().mockResolvedValue([
    { documentoId: 100, cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 2 }, // venda intragrupo
    { documentoId: 200, cfopId: 1, _sum: { vrProdutos: 3000 }, _count: 3 }, // venda externa
    { documentoId: 200, cfopId: 2, _sum: { vrProdutos: 500 }, _count: 1 }, // transferencia externa (nao receita)
  ]);
  const itemFindMany = jest.fn().mockResolvedValue([
    { cfopId: 1, cfopNome: "5102 - Venda" },
    { cfopId: 2, cfopNome: "6152 - Transferencia" },
  ]);
  const notaFindMany = jest.fn().mockResolvedValue([
    { odooId: 100, empresaId: 1, empresaNome: "Emp A", participanteId: 11, participanteNome: "Grupo X 34.161.829/0001-00" },
    { odooId: 200, empresaId: 1, empresaNome: "Emp A", participanteId: 99, participanteNome: "Cliente Externo" },
  ]);
  const parceiroFindMany = jest.fn().mockResolvedValue([{ odooId: 11, documentoDigits: "34161829000100" }]);
  const prisma = {
    fatoNotaFiscalItem: { groupBy: itemGroupBy, findMany: itemFindMany },
    fatoNotaFiscal: { findMany: notaFindMany },
    fatoParceiro: { findMany: parceiroFindMany },
  } as unknown as PrismaClient;
  return prisma;
}

describe("receitaConsolidada", () => {
  it("separa receita externa de intragrupo eliminavel e fecha o invariante", async () => {
    const r = await receitaConsolidada(mockPrisma(), {});
    expect(r.receitaExterna).toBe(3000); // venda externa
    expect(r.receitaIntragrupoEliminavel).toBe(1000); // venda intragrupo
    expect(r.receitaIndividualTotal).toBe(4000);
    expect(r.receitaExterna + r.receitaIntragrupoEliminavel).toBe(r.receitaIndividualTotal);
    expect(r.intercompanyBrutoVrProdutos).toBe(1000); // todas operacoes da nota 100
    expect(r.notasIntragrupo).toBe(1);
    expect(r.notasExternas).toBe(1);
    expect(r.receitaIntragrupoEliminavel).toBeLessThanOrEqual(r.intercompanyBrutoVrProdutos);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd '<repo>' && npx jest src/lib/metrics/fiscal/receita-consolidada.test.ts`
Expected: FAIL ("Cannot find module './receita-consolidada'").

- [ ] **Step 3: Implementar**

```ts
// src/lib/metrics/fiscal/receita-consolidada.ts
import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { classificarCfop, extrairCfop } from "../../fiscal/regras";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../fiscal/grupo";

export interface ReceitaConsolidadaResultado {
  receitaExterna: number;
  receitaIntragrupoEliminavel: number;
  receitaIndividualTotal: number;
  intercompanyBrutoVrProdutos: number;
  notasIntragrupo: number;
  notasExternas: number;
  percentualEliminado: number; // receitaIntragrupoEliminavel / receitaIndividualTotal
}

/**
 * RECEITA CONSOLIDADA EXTERNA (visao C, CPC 36). Combina a classificacao fiscal da
 * Fase 1 (ehReceita via cfopId) com a marcacao intercompany (participante da nota,
 * cascata doc->nome). SEM $queryRaw: groupBy nativo no item + findMany de notas,
 * join em memoria por documentoId. Mesmo recorte/classificacao da F1 (reconciliacao).
 */
export async function receitaConsolidada(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<ReceitaConsolidadaResultado> {
  const whereItem: Prisma.FatoNotaFiscalItemWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };

  // (a) groupBy item por documentoId+cfopId
  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["documentoId", "cfopId"],
    _sum: { vrProdutos: true },
    _count: true,
    where: whereItem,
  });

  // (b) nome representante por cfopId (igual F1) -> classificacao
  const ids = [...new Set(grupos.map((g) => g.cfopId).filter((x): x is number => x !== null))];
  const nomeRows = ids.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { cfopId: { in: ids } },
        select: { cfopId: true, cfopNome: true },
        distinct: ["cfopId"],
      })
    : [];
  const ehReceitaPorCfop = new Map<number, boolean>();
  for (const r of nomeRows) {
    if (r.cfopId === null) continue;
    ehReceitaPorCfop.set(r.cfopId, classificarCfop(extrairCfop(r.cfopNome)).ehReceita);
  }

  // (c) notas do mesmo recorte -> marcacao intragrupo
  const whereNota: Prisma.FatoNotaFiscalWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: whereNota,
    select: { odooId: true, participanteId: true, participanteNome: true },
  });
  const participantesGrupo = await carregarParticipantesGrupo(prisma);
  const ehGrupoPorNota = new Map<number, boolean>();
  for (const n of notas) ehGrupoPorNota.set(n.odooId, ehNotaIntragrupo(n, participantesGrupo));

  // (d) join em memoria
  let receitaExterna = 0;
  let receitaIntragrupoEliminavel = 0;
  let intercompanyBrutoVrProdutos = 0;
  for (const g of grupos) {
    const valor = Number(g._sum.vrProdutos ?? 0);
    const ehGrupo = g.documentoId !== null ? (ehGrupoPorNota.get(g.documentoId) ?? false) : false;
    const ehReceita = g.cfopId !== null ? (ehReceitaPorCfop.get(g.cfopId) ?? false) : false;
    if (ehGrupo) intercompanyBrutoVrProdutos += valor;
    if (ehReceita) {
      if (ehGrupo) receitaIntragrupoEliminavel += valor;
      else receitaExterna += valor;
    }
  }
  const receitaIndividualTotal = receitaExterna + receitaIntragrupoEliminavel;

  let notasIntragrupo = 0;
  let notasExternas = 0;
  for (const eh of ehGrupoPorNota.values()) {
    if (eh) notasIntragrupo++;
    else notasExternas++;
  }

  const percentualEliminado = receitaIndividualTotal > 0 ? receitaIntragrupoEliminavel / receitaIndividualTotal : 0;

  return {
    receitaExterna,
    receitaIntragrupoEliminavel,
    receitaIndividualTotal,
    intercompanyBrutoVrProdutos,
    notasIntragrupo,
    notasExternas,
    percentualEliminado,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd '<repo>' && npx jest src/lib/metrics/fiscal/receita-consolidada.test.ts`
Expected: PASS.

- [ ] **Step 5: Exportar no barrel + commit**

Em `src/lib/metrics/fiscal/index.ts`, acrescentar:
```ts
export { receitaConsolidada } from "./receita-consolidada";
```

```bash
git add src/lib/metrics/fiscal/receita-consolidada.ts src/lib/metrics/fiscal/receita-consolidada.test.ts src/lib/metrics/fiscal/index.ts
git commit -m "feat(fiscal): metrica receitaConsolidada (visao C, elimina intercompany, sem queryRaw)"
```

---

## Task 4: Métrica `matrizIntercompany` (TDD)

**Files:**
- Create: `src/lib/metrics/fiscal/matriz-intercompany.ts`, `src/lib/metrics/fiscal/matriz-intercompany.test.ts`
- Modify: `src/lib/metrics/fiscal/index.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/metrics/fiscal/matriz-intercompany.test.ts
import { matrizIntercompany } from "./matriz-intercompany";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma() {
  const notaFindMany = jest.fn().mockResolvedValue([
    { odooId: 100, empresaId: 1, empresaNome: "Emp A", participanteId: 11, participanteNome: "Grupo B 34.161.829/0001-00", vrProdutos: 1000 },
    { odooId: 101, empresaId: 1, empresaNome: "Emp A", participanteId: 11, participanteNome: "Grupo B 34.161.829/0001-00", vrProdutos: 500 },
    { odooId: 200, empresaId: 1, empresaNome: "Emp A", participanteId: 99, participanteNome: "Cliente Externo", vrProdutos: 9999 },
  ]);
  const parceiroFindMany = jest.fn().mockResolvedValue([{ odooId: 11, documentoDigits: "34161829000100" }]);
  return {
    fatoNotaFiscal: { findMany: notaFindMany },
    fatoParceiro: { findMany: parceiroFindMany },
  } as unknown as PrismaClient;
}

describe("matrizIntercompany", () => {
  it("agrega pares vendedor x comprador apenas para notas intragrupo", async () => {
    const r = await matrizIntercompany(mockPrisma(), {});
    expect(r.linhas).toHaveLength(1); // so o par intragrupo
    expect(r.linhas[0]).toMatchObject({ vendedorNome: "Emp A", valor: 1500, totalNotas: 2 });
    expect(r.total).toBe(1500);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd '<repo>' && npx jest src/lib/metrics/fiscal/matriz-intercompany.test.ts`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar**

```ts
// src/lib/metrics/fiscal/matriz-intercompany.ts
import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../fiscal/grupo";

export interface MatrizLinha {
  vendedorId: number | null;
  vendedorNome: string;
  compradorChave: string; // participanteId ou raiz CNPJ
  compradorNome: string;
  valor: number;
  totalNotas: number;
}

export interface MatrizIntercompanyResultado {
  linhas: MatrizLinha[];
  total: number;
  totalPares: number;
}

/** Matriz vendedor (emitente) x comprador (participante do grupo), so notas intragrupo. */
export async function matrizIntercompany(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<MatrizIntercompanyResultado> {
  const where: Prisma.FatoNotaFiscalWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const notas = await prisma.fatoNotaFiscal.findMany({
    where,
    select: { empresaId: true, empresaNome: true, participanteId: true, participanteNome: true, vrProdutos: true },
  });
  const participantesGrupo = await carregarParticipantesGrupo(prisma);

  const mapa = new Map<string, MatrizLinha>();
  for (const n of notas) {
    if (!ehNotaIntragrupo(n, participantesGrupo)) continue;
    const compradorChave = n.participanteId !== null ? `id:${n.participanteId}` : `nome:${n.participanteNome ?? ""}`;
    const chave = `${n.empresaId ?? "?"}->${compradorChave}`;
    const valor = Number(n.vrProdutos ?? 0);
    const atual = mapa.get(chave);
    if (atual) {
      atual.valor += valor;
      atual.totalNotas += 1;
    } else {
      mapa.set(chave, {
        vendedorId: n.empresaId,
        vendedorNome: n.empresaNome ?? "Desconhecido",
        compradorChave,
        compradorNome: n.participanteNome ?? "Desconhecido",
        valor,
        totalNotas: 1,
      });
    }
  }
  const linhas = [...mapa.values()].sort((a, b) => b.valor - a.valor);
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return { linhas, total, totalPares: linhas.length };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd '<repo>' && npx jest src/lib/metrics/fiscal/matriz-intercompany.test.ts`
Expected: PASS.

- [ ] **Step 5: Exportar no barrel + commit**

Em `src/lib/metrics/fiscal/index.ts` acrescentar `export { matrizIntercompany } from "./matriz-intercompany";`

```bash
git add src/lib/metrics/fiscal/matriz-intercompany.ts src/lib/metrics/fiscal/matriz-intercompany.test.ts src/lib/metrics/fiscal/index.ts
git commit -m "feat(fiscal): metrica matrizIntercompany (vendedor x comprador do grupo)"
```

---

## Task 5: Tool `fiscal_receita_consolidada`

**Files:**
- Create: `mcp/tools/fiscal/receita-consolidada.ts`

- [ ] **Step 1: Implementar a tool** (espelha o padrão de `mcp/tools/fiscal/faturamento-por-cfop.ts`)

```ts
// mcp/tools/fiscal/receita-consolidada.ts
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { receitaConsolidada } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
});

const dados = z.object({
  receitaExterna: z.number(),
  receitaIntragrupoEliminavel: z.number(),
  receitaIndividualTotal: z.number(),
  intercompanyBrutoVrProdutos: z.number(),
  notasIntragrupo: z.number().int(),
  notasExternas: z.number().int(),
  percentualEliminado: z.number(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalReceitaConsolidada: ToolEntry<Input, Output> = {
  id: "fiscal_receita_consolidada",
  dominio: "fiscal",
  descricao:
    "Receita consolidada externa do grupo (o faturamento real): vendas a clientes FORA do grupo, eliminando o intercompany (venda intragrupo, CPC 36). Mostra quanto do faturamento individual e venda entre empresas do grupo e foi eliminado. Aceita empresa e periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal", "fato_nota_fiscal_item"], async () => {
      const r = await receitaConsolidada(ctx.prisma, {
        periodoDe: input.periodoDe,
        periodoAte: input.periodoAte,
        empresaId: escopo.empresaId,
      });
      return {
        ...r,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso:
          escopo.escopo.aviso +
          ` Receita consolidada externa elimina o intercompany (CPC 36); ${(r.percentualEliminado * 100).toFixed(1)}% da receita individual e venda intragrupo.`,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "fiscal_receita_consolidada", {
      destaque: {
        receitaExterna: d.receitaExterna,
        receitaIntragrupoEliminavel: d.receitaIntragrupoEliminavel,
        receitaIndividualTotal: d.receitaIndividualTotal,
        percentualEliminado: d.percentualEliminado,
      },
      agregado: { soma: d.receitaExterna, contagem: d.notasExternas },
    });
  },
};
```

- [ ] **Step 2: Verificar tsc**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -iE 'receita-consolidada' || echo 'tool OK'`
Expected: `tool OK`.

- [ ] **Step 3: Commit**

```bash
git add mcp/tools/fiscal/receita-consolidada.ts
git commit -m "feat(mcp): tool fiscal_receita_consolidada (receita externa, elimina intercompany)"
```

---

## Task 6: Tool `fiscal_intercompany` + registro no catálogo

**Files:**
- Create: `mcp/tools/fiscal/intercompany.ts`
- Modify: `mcp/tools/fiscal/index.ts`

- [ ] **Step 1: Implementar a tool**

```ts
// mcp/tools/fiscal/intercompany.ts
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { matrizIntercompany } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
});

const linha = z.object({
  vendedorId: z.number().int().nullable(),
  vendedorNome: z.string(),
  compradorChave: z.string(),
  compradorNome: z.string(),
  valor: z.number(),
  totalNotas: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number(),
  totalPares: z.number().int(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalIntercompany: ToolEntry<Input, Output> = {
  id: "fiscal_intercompany",
  dominio: "fiscal",
  descricao:
    "Matriz de vendas entre empresas do mesmo grupo (intercompany): quem vendeu para quem dentro do grupo, com valor e contagem de notas. Aceita empresa e periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await matrizIntercompany(ctx.prisma, {
        periodoDe: input.periodoDe,
        periodoAte: input.periodoAte,
        empresaId: escopo.empresaId,
      });
      return {
        linhas: r.linhas,
        total: r.total,
        totalPares: r.totalPares,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso: escopo.escopo.aviso,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.linhas.slice(0, 10).map((l) => ({ vendedor: l.vendedorNome, comprador: l.compradorNome, valor: l.valor }));
    return enriquecerEnvelope(envelope, "fiscal_intercompany", {
      destaque: { total: d.total, totalPares: d.totalPares, topLinhasJson: JSON.stringify(top) },
      agregado: { soma: d.total, contagem: d.totalPares },
    });
  },
};
```

- [ ] **Step 2: Registrar as 2 tools em `mcp/tools/fiscal/index.ts`**

Acrescentar os imports (após a linha 32, `import { fiscalDetalharNota }...`):
```ts
// F2 (intercompany + receita consolidada)
import { fiscalReceitaConsolidada } from "./receita-consolidada.js";
import { fiscalIntercompany } from "./intercompany.js";
```
E no array `fiscalTools` (após `fiscalDetalharNota as ToolEntry,`):
```ts
  // F2 (intercompany + receita consolidada externa)
  fiscalReceitaConsolidada as ToolEntry,
  fiscalIntercompany as ToolEntry,
```

- [ ] **Step 3: Verificar tsc**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add mcp/tools/fiscal/intercompany.ts mcp/tools/fiscal/index.ts
git commit -m "feat(mcp): tool fiscal_intercompany (matriz vendedor x comprador) + registro no catalogo"
```

---

## Task 7: Formatadores + allowlist

**Files:**
- Modify: `mcp/lib/responder.ts`

- [ ] **Step 1: Adicionar os 2 formatadores** (perto dos demais `fmt*` fiscais; usar `formatBRL`).

```ts
const fmtReceitaConsolidada: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const externa = Number(d.receitaExterna ?? 0);
  const individual = Number(d.receitaIndividualTotal ?? 0);
  const intra = Number(d.receitaIntragrupoEliminavel ?? 0);
  const pct = Number(d.percentualEliminado ?? 0);
  if (individual === 0) {
    return "Nenhuma receita de saida autorizada no periodo para consolidar.";
  }
  return (
    `Receita consolidada externa (sem intercompany): ${formatBRL(externa)}. ` +
    `Do faturamento individual de ${formatBRL(individual)}, ${formatBRL(intra)} (${(pct * 100).toFixed(1)}%) ` +
    `e venda intragrupo e foi eliminada (CPC 36).`
  );
};

const fmtIntercompany: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const total = Number(d.total ?? env._agregado?.soma ?? 0);
  const totalPares = Number(d.totalPares ?? env._agregado?.contagem ?? 0);
  if (totalPares === 0 || total === 0) {
    return "Nenhuma venda entre empresas do grupo (intercompany) no periodo.";
  }
  type Par = { vendedor: string; comprador: string; valor: number };
  let top: Par[] = [];
  try {
    const parsed = JSON.parse(String(d.topLinhasJson ?? "[]"));
    if (Array.isArray(parsed)) top = parsed as Par[];
  } catch {
    top = [];
  }
  const lista = top.map((p) => `- ${String(p.vendedor).trim()} -> ${String(p.comprador).trim()}: ${formatBRL(Number(p.valor ?? 0))}`);
  const cabeca = `Vendas intercompany (entre empresas do grupo): ${formatBRL(total)} em ${totalPares} ${totalPares === 1 ? "par" : "pares"} vendedor-comprador.`;
  return [cabeca, lista.length ? "Principais:" : "", ...lista].filter(Boolean).join("\n");
};
```

- [ ] **Step 2: Registrar no mapa `formatadorPorTool` e na allowlist**

No objeto que mapeia toolName→formatador (onde está `"fiscal_faturamento_por_cfop": fmtFaturamentoPorCfop,`), acrescentar:
```ts
  "fiscal_receita_consolidada": fmtReceitaConsolidada,
  "fiscal_intercompany": fmtIntercompany,
```
Em `TOOLS_QUE_PRECISAM_FORMATADOR`, acrescentar:
```ts
  "fiscal_receita_consolidada",
  "fiscal_intercompany",
```

- [ ] **Step 3: Testes unitários dos 2 formatadores + allowlist real (B5/B6)**

Anexar a `mcp/lib/responder.test.ts` (imports `formatadorPorTool`, `ehFormatadorGenerico` já estão no topo):

```ts
describe("fmtReceitaConsolidada", () => {
  const fmt = formatadorPorTool("fiscal_receita_consolidada");
  const base = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("frase com receita externa e percentual eliminado", () => {
    const txt = fmt({ ...base, _DESTAQUE: { receitaExterna: 897, receitaIntragrupoEliminavel: 418, receitaIndividualTotal: 1315, percentualEliminado: 0.318 } } as never);
    expect(txt).toContain("Receita consolidada externa");
    expect(txt).toContain("intragrupo");
  });
  it("vazio quando individual e zero", () => {
    expect(fmt({ ...base, _DESTAQUE: { receitaIndividualTotal: 0 } } as never)).toContain("Nenhuma receita");
  });
});

describe("fmtIntercompany", () => {
  const fmt = formatadorPorTool("fiscal_intercompany");
  const base = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("lista top pares vendedor-comprador", () => {
    const txt = fmt({ ...base, _DESTAQUE: { total: 1500, totalPares: 1, topLinhasJson: JSON.stringify([{ vendedor: "Emp A", comprador: "Grupo B", valor: 1500 }]) } } as never);
    expect(txt).toContain("intercompany");
    expect(txt).toContain("Emp A");
    expect(txt).toContain("Grupo B");
  });
  it("topLinhasJson invalido cai no fallback sem estourar", () => {
    const txt = fmt({ ...base, _DESTAQUE: { total: 1500, totalPares: 1, topLinhasJson: "{quebrado" } } as never);
    expect(txt).toContain("intercompany");
  });
  it("vazio quando nao ha pares", () => {
    expect(fmt({ ...base, _DESTAQUE: { total: 0, totalPares: 0 } } as never)).toContain("Nenhuma venda entre empresas");
  });
});

describe("allowlist resolve formatador real (nao generico) para as tools F2", () => {
  it("fiscal_receita_consolidada e fiscal_intercompany tem formatador real", () => {
    expect(ehFormatadorGenerico(formatadorPorTool("fiscal_receita_consolidada"))).toBe(false);
    expect(ehFormatadorGenerico(formatadorPorTool("fiscal_intercompany"))).toBe(false);
  });
});
```

- [ ] **Step 4: Verificar tsc + jest**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -c 'error TS' && npx jest mcp/lib/responder.test.ts 2>&1 | tail -4`
Expected: `0` erros; responder.test verde (inclui os 3 describes novos).

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/responder.ts mcp/lib/responder.test.ts
git commit -m "feat(mcp): formatadores fmtReceitaConsolidada e fmtIntercompany + allowlist + testes"
```

---

## Task 8: Triggers

**Files:**
- Modify: `mcp/catalog/tool-triggers.data.ts`

- [ ] **Step 1: Acrescentar as entradas** (junto das demais `fiscal_*`)

```ts
  "fiscal_receita_consolidada": ["faturamento real", "receita consolidada", "quanto vendemos para fora do grupo", "receita sem intercompany", "faturamento do grupo eliminando intercompany", "sem contar vendas entre empresas do grupo", "receita externa do grupo"],
  "fiscal_intercompany": ["vendas entre empresas do grupo", "intercompany", "quanto uma empresa vende para outra do grupo", "matriz de transferencias intragrupo", "vendas intragrupo"],
```

- [ ] **Step 2: Verificar tsc + commit**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: `0`.

```bash
git add mcp/catalog/tool-triggers.data.ts
git commit -m "feat(mcp): triggers de fiscal_receita_consolidada e fiscal_intercompany"
```

---

## Task 9: E2E real + rebuild do `mcp`

**Files:**
- Create: `src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts`

- [ ] **Step 1: SQL de referência (intercompany via cascata)**

Run (credenciais reais `nexus`/`nexus_odoo_l1`):
```bash
cd '<repo>' && docker compose exec -T db psql -U nexus -d nexus_odoo_l1 -c "
WITH raizes(r) AS (VALUES ('07390039'),('10557556'),('18282961'),('33718546'),('34161829'),('34461908'),('35156509'),('45424185'),('62673999'))
SELECT count(*) notas_intra, to_char(sum(nf.vr_nf),'FM999G999G990D00') vr
FROM fato_nota_fiscal nf LEFT JOIN fato_parceiro p ON p.odoo_id = nf.participante_id
WHERE nf.entrada_saida='1' AND nf.situacao_nfe='autorizada'
  AND (left(regexp_replace(coalesce(p.documento_digits,''),'[^0-9]','','g'),8) IN (SELECT r FROM raizes)
   OR left(regexp_replace(substring(nf.participante_nome from '[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}'),'[^0-9]','','g'),8) IN (SELECT r FROM raizes));"
```
Expected: ~6.230 notas / R$ 679,5 mi (confirmado nesta sessão).

- [ ] **Step 2: Escrever o E2E** (padrão `main()` + `tsx`, igual ao E2E da Fase 1)

```ts
// src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts
// E2E real da Fase 2. Rodar: E2E=1 npx tsx --env-file=.env.local src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts
import { prisma } from "@/lib/prisma";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";
import { matrizIntercompany } from "@/lib/metrics/fiscal/matriz-intercompany";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/faturamento-por-cfop";

function check(c: boolean, m: string, e: string[]) { if (c) console.log(`OK ${m}`); else { console.error(`FALHOU ${m}`); e.push(m); } }
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

async function main() {
  if (process.env.E2E !== "1") { console.log("SKIP: defina E2E=1."); return; }
  const erros: string[] = [];

  const r = await receitaConsolidada(prisma, {});
  const f1 = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });
  console.log(`receitaExterna           = ${brl(r.receitaExterna)}`);
  console.log(`receitaIntragrupoElimin. = ${brl(r.receitaIntragrupoEliminavel)} (${(r.percentualEliminado*100).toFixed(1)}%)`);
  console.log(`receitaIndividualTotal   = ${brl(r.receitaIndividualTotal)}`);
  console.log(`intercompanyBrutoProd.   = ${brl(r.intercompanyBrutoVrProdutos)}`);
  console.log(`notas intra/ext          = ${r.notasIntragrupo} / ${r.notasExternas}`);
  console.log(`F1 totalReceita          = ${brl(f1.totalReceita)}`);

  check(r.receitaExterna > 0, "receitaExterna > 0", erros);
  check(Math.abs(r.receitaExterna + r.receitaIntragrupoEliminavel - r.receitaIndividualTotal) < 1, "externa + eliminavel == individual", erros);
  check(Math.abs(r.receitaIndividualTotal - f1.totalReceita) < 1, "receitaIndividualTotal == F1.totalReceita (reconciliacao)", erros);
  check(r.receitaIntragrupoEliminavel <= r.intercompanyBrutoVrProdutos, "eliminavel <= bruto intragrupo", erros);
  check(r.receitaExterna < r.receitaIndividualTotal, "receita externa menor que individual (houve eliminacao)", erros);
  // B2: travar valores absolutos em banda larga (absorve o ajuste do B1 ~R$40mi no bruto).
  const banda = (v: number, alvo: number, tol: number, nome: string) => check(Math.abs(v - alvo) < tol, `${nome} ~ ${alvo.toLocaleString("pt-BR")} (real ${v.toLocaleString("pt-BR")})`, erros);
  banda(r.receitaExterna, 897_000_000, 5_000_000, "receitaExterna");
  banda(r.receitaIntragrupoEliminavel, 418_600_000, 5_000_000, "receitaIntragrupoEliminavel");
  banda(r.intercompanyBrutoVrProdutos, 700_000_000, 50_000_000, "intercompanyBruto");
  check(r.notasIntragrupo >= 6000 && r.notasIntragrupo <= 6600, `notas intragrupo na banda 6000-6600 (real ${r.notasIntragrupo})`, erros);

  const m = await matrizIntercompany(prisma, {});
  console.log(`matriz: ${m.totalPares} pares, total ${brl(m.total)}`);
  check(m.totalPares > 0, "matriz tem pares intragrupo", erros);
  check(m.linhas.every((l) => l.valor > 0), "todas as linhas da matriz tem valor positivo", erros);

  await prisma.$disconnect();
  if (erros.length) { console.error(`\n${erros.length} falha(s).`); process.exitCode = 1; }
  else console.log(`\nTODAS as verificacoes E2E passaram.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Rodar o E2E**

Run: `cd '<repo>' && set -a && source .env.local; set +a && E2E=1 npx tsx --env-file=.env.local src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts`
Expected: todas as verificações OK. Conferir `receitaIndividualTotal == F1.totalReceita` (reconciliação fecha) e `notasIntragrupo ~ 6230`.

- [ ] **Step 4: Rebuild do `mcp`**

Run: `cd '<repo>' && docker compose up -d --build mcp && docker inspect $(docker compose ps -q mcp) --format '{{.State.StartedAt}}'`
Expected: StartedAt = agora.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts
git commit -m "test(fiscal): E2E receita consolidada + matriz intercompany contra cache real"
```

---

## Task 10: Verificação final + PROGRESSO + PR

- [ ] **Step 1: Suite + tsc**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -c 'error TS' && npx jest src/lib/fiscal src/lib/metrics/fiscal mcp/lib mcp/catalog 2>&1 | tail -6`
Expected: 0 erros; jest verde.

- [ ] **Step 2: Atualizar PROGRESSO** (`docs/superpowers/plans/PROGRESSO-faturamento-consolidado.md`): marcar Fase 2 concluída; números reais (receita externa, eliminável); apontar Fase 3 (ponte) como próxima.

- [ ] **Step 3: Push + PR** (título e body detalhando entrega, números do E2E, reconciliação com F1, fora de escopo).

```bash
cd '<repo>' && git push && gh pr create --title "feat(fiscal): Fase 2 , receita consolidada externa + intercompany" --body "<descricao com numeros do E2E, reconciliacao F1, CPC 36, fora de escopo>"
```

- [ ] **Step 4: Avisar o humano** (resumo em tópicos; aguardar "merge" explícito para `gh pr merge`).

---

## Self-Review (executada pelo autor do plano)

**Cobertura da spec v3:**
- §4.1 grupo (raízes/cnpj/participantes/index) → Tasks 1-2. ✅
- §4.2 receitaConsolidada (3 queries nativas, join memória, separação 3 números, reconciliação) → Task 3. ✅
- §4.3 matrizIntercompany → Task 4. ✅
- §4.4 tools → Tasks 5-6. §4.5 formatadores → Task 7. Triggers → Task 8. ✅
- §6 testes (unit + E2E real com reconciliação F1) → Tasks 1-4, 9. §7 critérios → Tasks 3,9,10. ✅

**Placeholders:** nenhum; todo step tem código/comando real (exceto o body do PR na Task 10 Step 3, preenchido na hora com os números do E2E).

**Consistência de tipos:** `RAIZES_GRUPO`, `extrairRaizCnpj`, `extrairRaizCnpjDeTexto`, `carregarParticipantesGrupo`, `ehNotaIntragrupo`, `ReceitaConsolidadaResultado`, `MatrizLinha`, `receitaIntragrupoEliminavel`, `intercompanyBrutoVrProdutos`, `topLinhasJson` , idênticos entre métrica/tool/formatador/teste. ✅

> Pontos para as reviews adversariais: (a) o `groupBy(['documentoId','cfopId'])` pode retornar dezenas de milhares de linhas , validar custo real no E2E; (b) confirmar que `fato_nota_fiscal` tem `vrProdutos` e `empresaNome` no select da matriz (tem , schema:2043/empresaNome); (c) a tool `fiscal_receita_consolidada` não pagina (resultado escalar) , ok; (d) checar se `montarEscopoEmpresa` aceita empresaRef undefined sem erro (padrão das tools F1).
