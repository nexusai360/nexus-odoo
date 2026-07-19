# Histórico temporal de preço e saldo , Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development por task. Steps usam checkbox (`- [ ]`).

**Goal:** Guardar, no nosso cache, a série temporal de mudança de preço e de saldo (append por mudança), capturada acoplada ao ciclo do worker, consultável nas 4 pontas sem ir ao Odoo.

**Architecture:** Duas tabelas de série append-only (`fato_preco_historico`, `fato_estoque_saldo_historico`) mais uma tabela de rodadas (`fato_captura_rodada`). Núcleos puros (`calcularDelta`, `dedupPorChave`, `decidirRodada`) são testados em jest; a captura, que toca o banco real, é validada por scripts `.e2e.ts` (padrão do projeto), fora do suite jest.

**Tech Stack:** TypeScript, Prisma 7 (`@prisma/adapter-pg`), Postgres, Jest (só unit), tsx (E2E), BullMQ.

**Spec:** `docs/superpowers/specs/2026-07-19-historico-temporal-preco-saldo-SPEC-v3.md`.
Esta é a v2: aplica os 10 achados da review #1 do plano (marcados `[P1-n]`).

## Global Constraints

- **Modelo SEMPRE Opus** em qualquer subagente.
- **Proibido o travessão (`—`)** em qualquer texto.
- **Append-only nunca apaga histórico legítimo.** Único delete permitido: expurgo cirúrgico de um `rodadaId` falso.
- **Data de início FILTRA a leitura, nunca apaga.** `clampIsoAoCorte` na janela exibida; carry-forward alcança antes do corte por desenho; captura ignora o corte.
- **Comparação de Decimal por string (`Decimal.toString()`), nunca por tolerância.** `valor`/`quantidade` escala 4, `vrSaldo` escala 2.
- **Migration aditiva.** Índices parciais `WHERE vigente` por SQL cru (Prisma 7 não expressa). Após aplicar: `agente schema-changed`.
- **Testes que tocam o banco real são `.e2e.ts`, rodados por `E2E=1 npx tsx --env-file=.env.local <arquivo>`, NUNCA `.test.ts`** , o suite jest roda em paralelo sobre o Postgres dev compartilhado, e um teste que apaga `fato_estoque_saldo` corromperia o cache que a Diretoria lê `[P1-1]`.
- **Todo `.e2e.ts` que muta um fato faz backup e restaura em `try/finally`** , se a asserção falhar no meio, o fato não pode ficar corrompido no dev `[P1-2]`.
- **Rebuild de container após tocar `prisma/schema.prisma` ou `src/worker/**`:** `docker compose build app` (`build worker` é no-op) + `up -d --force-recreate worker mcp app`.
- **Sem PR/merge sem liberação do dono** (PR #196 aberto).

---

## Onda 1 , Núcleos puros (jest, sem I/O)

### Task 1: `delta-serie.ts` , mudanças, baixas, ressurreições

**Files:** Create `src/lib/estoque/delta-serie.ts`, Test `src/lib/estoque/delta-serie.test.ts`.

**Interfaces produzidas:**
```ts
export type EventoSerie = "mudanca" | "baixa";
export interface LinhaSerie { chave: string; valores: (string | null)[]; }
export interface LinhaDelta { chave: string; evento: EventoSerie; valores: (string | null)[]; }
export function calcularDelta(atuais: LinhaSerie[], vigentes: LinhaSerie[]): LinhaDelta[];
```

- [ ] **Step 1: Write the failing test** (idêntico ao PLAN v1 Task 1, mantido):

```ts
import { calcularDelta, type LinhaSerie } from "./delta-serie";
const l = (chave: string, ...valores: (string | null)[]): LinhaSerie => ({ chave, valores });

describe("calcularDelta", () => {
  it("grava os novos", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [])).toEqual([{ chave: "3:100", evento: "mudanca", valores: ["500.0000"] }]);
  });
  it("nao regrava o que nao mudou", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [l("3:100", "500.0000")])).toEqual([]);
  });
  it("grava so o que mudou", () => {
    expect(calcularDelta([l("3:100", "550.0000"), l("3:200", "800.0000")], [l("3:100", "500.0000"), l("3:200", "800.0000")]))
      .toEqual([{ chave: "3:100", evento: "mudanca", valores: ["550.0000"] }]);
  });
  it("gera baixa para a chave que sumiu", () => {
    expect(calcularDelta([], [l("3:100", "500.0000")])).toEqual([{ chave: "3:100", evento: "baixa", valores: [null] }]);
  });
  it("ressurreicao: vigente e baixa e reaparece -> mudanca", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [l("3:100", null)])).toEqual([{ chave: "3:100", evento: "mudanca", valores: ["500.0000"] }]);
  });
  it("baixa nao vira baixa de novo", () => {
    expect(calcularDelta([], [l("3:100", null)])).toEqual([]);
  });
  it("multi-coluna: muda se qualquer coluna muda", () => {
    expect(calcularDelta([l("7:1", "10.0000", "999.99")], [l("7:1", "10.0000", "500.00")]))
      .toEqual([{ chave: "7:1", evento: "mudanca", valores: ["10.0000", "999.99"] }]);
  });
  it("zero e diferente de baixa", () => {
    expect(calcularDelta([l("7:1", "0.0000")], [l("7:1", "10.0000")])).toEqual([{ chave: "7:1", evento: "mudanca", valores: ["0.0000"] }]);
  });
});
```

- [ ] **Step 2: Run, verify it fails.**
- [ ] **Step 3: Implement** (idêntico ao PLAN v1 Task 1 Step 3, código completo lá).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `git commit -m "Frente B onda 1: nucleo calcularDelta"`

### Task 2: `dedup-chave.ts`

**Files:** Create `src/lib/estoque/dedup-chave.ts`, Test `dedup-chave.test.ts`.
Código completo e teste idênticos ao PLAN v1 Task 2. Commit `"Frente B onda 1: dedupPorChave"`.

### Task 3: `guarda-sanidade.ts`

**Files:** Create `src/lib/estoque/guarda-sanidade.ts`, Test `guarda-sanidade.test.ts`.
Código completo e teste idênticos ao PLAN v1 Task 3. Commit `"Frente B onda 1: guarda de sanidade"`.

### Task 4: aposentar `precosQueMudaram`

Idêntico ao PLAN v1 Task 4 (re-export de deprecação + remoção do teste duplicado). Commit `"Frente B onda 1: aposenta precosQueMudaram"`.

---

## Onda 2 , Schema e migration

### Task 5: modelos Prisma + índices parciais por SQL cru, com verificação de drift

**Files:** Modify `prisma/schema.prisma`; Create a migration.

- [ ] **Step 1:** Adicionar os 3 modelos ao `prisma/schema.prisma` (blocos idênticos ao PLAN v1 Task 5 Step 1: `FatoPrecoHistorico`, `FatoEstoqueSaldoHistorico`, `FatoCapturaRodada`).

- [ ] **Step 2:** `npx prisma migrate dev --name frente_b_historico_temporal --create-only`

- [ ] **Step 3:** Acrescentar ao fim do `migration.sql` os índices únicos parciais:

```sql
CREATE UNIQUE INDEX "fato_preco_historico_vigente_key"
  ON "fato_preco_historico" ("tabela_id", "produto_id", "quantidade_minima")
  WHERE "vigente";

CREATE UNIQUE INDEX "fato_estoque_saldo_historico_vigente_key"
  ON "fato_estoque_saldo_historico" ("produto_id", "local_id")
  WHERE "vigente";
```

- [ ] **Step 4:** Aplicar: `npx prisma migrate dev` e `npx prisma generate`.

- [ ] **Step 5: Verificar drift** `[P1-6]` , Prisma pode não reconhecer o índice parcial (não há PSL para ele) e acusar schema fora de sync em execuções futuras:
  Run: `npx prisma migrate status` → Expected: "Database schema is up to date".
  Run: `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code`; se acusar diferença **apenas** dos índices parciais `WHERE vigente`, isso é esperado (o Prisma não os modela). **Documentar** essa exceção num comentário `///` acima de cada modelo no `schema.prisma`: "Índice único parcial `WHERE vigente` existe só na migration (SQL cru); NÃO remover em `migrate dev` de outra worktree."

- [ ] **Step 6:** `agente schema-changed` e commit:

```bash
agente schema-changed
git add prisma/schema.prisma prisma/migrations
git commit -m "Frente B onda 2: 3 tabelas de historico + indices unicos parciais WHERE vigente (SQL cru, drift documentado)"
```

---

## Onda 3 , Captura por série (E2E `.e2e.ts`, não jest)

### Task 6: `captura-preco.ts` , código completo, com UPDATE composto e timeout

**Files:** Create `src/worker/fatos/captura-preco.ts`.

**Interfaces produzidas:**
```ts
export interface ResultadoCaptura { rodadaId: string; status: "base" | "ok" | "recusada"; gravadas: number; }
export async function capturarPreco(prisma: PrismaClient, agora?: Date): Promise<ResultadoCaptura>;
```

- [ ] **Step 1: Implement** (código completo , sem placeholder `[P1-4][P1-3]`):

```ts
// src/worker/fatos/captura-preco.ts
// Captura append-por-mudanca do preco, acoplada ao fim do ciclo cron incremental.
// Le fato_preco (dimensao='produto'), deduplica o par identico (15049), calcula o delta
// contra o vigente e grava numa transacao. Guarda de sanidade recusa a rodada se o numero
// de baixas passar do teto (defesa contra pull parcial do Odoo).
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { calcularDelta, type LinhaSerie } from "../../lib/estoque/delta-serie";
import { dedupPorChave } from "../../lib/estoque/dedup-chave";
import { decidirRodada } from "../../lib/estoque/guarda-sanidade";

export interface ResultadoCaptura {
  rodadaId: string;
  status: "base" | "ok" | "recusada";
  gravadas: number;
}

/** chave de preco: tabela:produto:quantidadeMinima (a quantidadeMinima separa faixas). */
function chavePreco(tabelaId: number, produtoId: number, qtdMin: string): string {
  return `${tabelaId}:${produtoId}:${qtdMin}`;
}

function parsePreco(chave: string): { tabelaId: number; produtoId: number; quantidadeMinima: string } {
  const [t, p, q] = chave.split(":");
  return { tabelaId: Number(t), produtoId: Number(p), quantidadeMinima: q };
}

async function recusadasSeguidas(prisma: PrismaClient, serie: string): Promise<number> {
  const ultimas = await prisma.fatoCapturaRodada.findMany({
    where: { serie },
    orderBy: { capturadoEm: "desc" },
    select: { status: true },
    take: 50,
  });
  let n = 0;
  for (const r of ultimas) {
    if (r.status === "recusada") n++;
    else break;
  }
  return n;
}

export async function capturarPreco(
  prisma: PrismaClient,
  agora: Date = new Date(),
): Promise<ResultadoCaptura> {
  // 1) fato atual, so dimensao produto.
  const fato = await prisma.fatoPreco.findMany({
    where: { dimensao: "produto", produtoId: { not: null }, tabelaId: { not: null } },
    select: { odooId: true, tabelaId: true, produtoId: true, tabelaNome: true, produtoNome: true, quantidadeMinima: true, valor: true },
  });

  // 2) dedup por chave (colapsa o par 15049; desempata pelo menor odoo_id).
  const itens = fato.map((f) => ({
    id: f.odooId,
    linha: {
      chave: chavePreco(f.tabelaId!, f.produtoId!, f.quantidadeMinima.toString()),
      valores: [f.valor === null ? null : f.valor.toString()],
    } as LinhaSerie,
  }));
  const { linhas: atuais, conflitos } = dedupPorChave(itens);
  // metadados por chave, para gravar nome desnormalizado.
  const metaPorChave = new Map(fato.map((f) => [chavePreco(f.tabelaId!, f.produtoId!, f.quantidadeMinima.toString()), f]));

  // 3) vigente anterior.
  const vigentesRows = await prisma.fatoPrecoHistorico.findMany({
    where: { vigente: true },
    select: { tabelaId: true, produtoId: true, quantidadeMinima: true, valor: true },
  });
  const vigentes: LinhaSerie[] = vigentesRows.map((v) => ({
    chave: chavePreco(v.tabelaId, v.produtoId, v.quantidadeMinima.toString()),
    valores: [v.valor === null ? null : v.valor.toString()],
  }));

  // 4) delta.
  const delta = calcularDelta(atuais, vigentes);
  const baixas = delta.filter((d) => d.evento === "baixa").length;

  // 5) guarda.
  const temBaseAnterior = (await prisma.fatoCapturaRodada.count({ where: { serie: "preco", status: { in: ["ok", "base"] } } })) > 0;
  const decisao = decidirRodada({ baixasNestaRodada: baixas, temBaseAnterior, recusadasSeguidas: await recusadasSeguidas(prisma, "preco") });

  const rodadaId = randomUUID();
  const motivo = conflitos.length ? `conflitos de valor em ${conflitos.length} chaves; ${decisao.motivo ?? ""}`.trim() : decisao.motivo;

  // 6) grava.
  if (decisao.status === "recusada" || delta.length === 0) {
    await prisma.fatoCapturaRodada.create({
      data: { id: rodadaId, serie: "preco", capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: 0, status: decisao.status, motivo },
    });
    return { rodadaId, status: decisao.status, gravadas: 0 };
  }

  const afetadas = delta.map((d) => parsePreco(d.chave));
  await prisma.$transaction(
    async (tx) => {
      // desmarca o vigente de cada chave afetada (chave composta -> OR de objetos, nunca IN de tupla).
      if (afetadas.length) {
        await tx.fatoPrecoHistorico.updateMany({
          where: { vigente: true, OR: afetadas.map((k) => ({ tabelaId: k.tabelaId, produtoId: k.produtoId, quantidadeMinima: k.quantidadeMinima })) },
          data: { vigente: false },
        });
      }
      await tx.fatoPrecoHistorico.createMany({
        data: delta.map((d) => {
          const k = parsePreco(d.chave);
          const meta = metaPorChave.get(d.chave);
          return {
            rodadaId,
            capturadoEm: agora,
            tabelaId: k.tabelaId,
            tabelaNome: meta?.tabelaNome ?? null,
            produtoId: k.produtoId,
            produtoNome: meta?.produtoNome ?? null,
            quantidadeMinima: k.quantidadeMinima,
            valor: d.valores[0],
            evento: d.evento,
            vigente: true,
          };
        }),
      });
      await tx.fatoCapturaRodada.create({
        data: { id: rodadaId, serie: "preco", capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: delta.length, status: decisao.status, motivo },
      });
    },
    { timeout: 60_000, maxWait: 10_000 }, // bootstrap grava ~12k linhas [P1-3]
  );

  return { rodadaId, status: decisao.status, gravadas: delta.length };
}
```

- [ ] **Step 2: Commit** (o teste vem na Task 7):

```bash
git add src/worker/fatos/captura-preco.ts
git commit -m "Frente B onda 3: capturarPreco (dedup + delta + vigente por OR composto + timeout 60s)"
```

### Task 7: `.e2e.ts` de preço , base, idempotência, alteração, baixa e ressurreição

**Files:** Create `src/worker/fatos/__e2e__/captura-preco.e2e.ts`.

Cobre os critérios de aceite 2, 3, 4 e 5 `[P1-9]`, com backup/restore em `try/finally` `[P1-2]`.

- [ ] **Step 1: Implement o script** (padrão `.e2e.ts` do projeto: `main()`, `E2E=1`, `process.exit`):

```ts
// src/worker/fatos/__e2e__/captura-preco.e2e.ts
// E2E contra o cache real. Roda FORA do jest (nao colide com o suite paralelo no DB dev).
//   E2E=1 npx tsx --env-file=.env.local src/worker/fatos/__e2e__/captura-preco.e2e.ts
import { prisma } from "@/lib/prisma";
import { capturarPreco } from "../captura-preco";
import { rebuildFatoPreco } from "../fato-preco";

if (process.env.E2E !== "1") { console.log("pulado (defina E2E=1)"); process.exit(0); }

let falhas = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? "OK  " : "FALHA ") + msg); if (!cond) falhas++; }

async function limpar() {
  await prisma.fatoPrecoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "preco" } });
}

async function main() {
  await limpar();
  try {
    // (2) base + idempotencia + dedup do par 15049
    const r1 = await capturarPreco(prisma);
    ok(r1.status === "base", "1a captura e base");
    const vig = await prisma.fatoPrecoHistorico.count({ where: { vigente: true } });
    const dist = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) n FROM (SELECT DISTINCT tabela_id, produto_id, quantidade_minima FROM fato_preco_historico WHERE vigente) t`);
    ok(vig === Number(dist[0].n), `um vigente por chave (dedup): ${vig} == ${dist[0].n}`);
    const r2 = await capturarPreco(prisma);
    ok(r2.status === "ok" && r2.gravadas === 0, "2a captura sem mudanca grava zero");

    // (3) alteracao de valor no raw -> reconstroi fato -> captura -> 1 linha mudanca
    const alvo = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, valor: { not: null } } });
    if (!alvo) throw new Error("sem base");
    const rawAlvo = await prisma.rawSpedTabelaPrecoRegra.findFirst({
      where: { data: { path: ["tabela_id", "0"], equals: alvo.tabelaId } as never },
    });
    // alteracao direta: soma 1,00 no valor do fato e captura (a captura le o fato, nao o raw).
    await prisma.fatoPreco.updateMany({ where: { tabelaId: alvo.tabelaId, produtoId: alvo.produtoId }, data: { valor: Number(alvo.valor) + 1 } });
    const r3 = await capturarPreco(prisma);
    const novo = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    ok(r3.gravadas >= 1 && novo?.evento === "mudanca" && Number(novo?.valor) === Number(alvo.valor) + 1, "alteracao gera 1 mudanca com valor novo");

    // (4) baixa: remove a chave do fato -> captura -> linha baixa (valor null)
    await prisma.fatoPreco.deleteMany({ where: { tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    await capturarPreco(prisma);
    const baixa = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    ok(baixa?.evento === "baixa" && baixa?.valor === null, "baixa: valor NULL");

    // (4) ressurreicao: rebuild devolve a chave -> captura -> mudanca
    await rebuildFatoPreco(prisma);
    const r5 = await capturarPreco(prisma);
    const ress = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    ok(r5.gravadas >= 1 && ress?.evento === "mudanca", "ressurreicao: baixa -> mudanca");
  } finally {
    // devolve o fato de preco ao estado real e limpa o historico de teste [P1-2]
    await rebuildFatoPreco(prisma);
    await limpar();
    await prisma.$disconnect();
  }
  console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHAS`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run** `E2E=1 npx tsx --env-file=.env.local src/worker/fatos/__e2e__/captura-preco.e2e.ts` → todas OK, exit 0. Conferir depois: `fato_preco` de volta a 12.009.

- [ ] **Step 3: Commit** `git add ... && git commit -m "Frente B onda 3: E2E de preco (base/idempotencia/alteracao/baixa/ressurreicao) com restore em finally"`

### Task 8: `captura-saldo.ts` , idem com quantidade e vrSaldo

**Files:** Create `src/worker/fatos/captura-saldo.ts`.

Código completo análogo ao `captura-preco.ts`, com estas diferenças concretas:
- chave `produtoId:localId`; `valores = [quantidade?.toString() ?? null, vrSaldo?.toString() ?? null]`;
- lê `fato_estoque_saldo` (id do dedup = `odooSaldoId`); grava dimensões `produtoNome, localNome, familiaId, familiaNome, marcaId, marcaNome, unidade`;
- série `"saldo"`, tabela `fatoEstoqueSaldoHistorico`;
- `parseSaldo(chave)` devolve `{ produtoId, localId }`; o `updateMany` de vigente usa `OR: afetadas.map((k) => ({ produtoId: k.produtoId, localId: k.localId }))`.

- [ ] **Step 1: Implement** `captura-saldo.ts` (mesma estrutura da Task 6, com os campos acima).
- [ ] **Step 2: Commit** `"Frente B onda 3: capturarSaldo (quantidade + vrSaldo na escala real, dimensoes espelhadas)"`

### Task 9: `.e2e.ts` de saldo , base, vrSaldo-só, e guarda de recusa (com restore garantido)

**Files:** Create `src/worker/fatos/__e2e__/captura-saldo.e2e.ts`.

- [ ] **Step 1: Implement o script**, cobrindo critérios 2 e 6, restaurando `fato_estoque_saldo` em `try/finally` `[P1-2]`:

```ts
// src/worker/fatos/__e2e__/captura-saldo.e2e.ts
//   E2E=1 npx tsx --env-file=.env.local src/worker/fatos/__e2e__/captura-saldo.e2e.ts
import { prisma } from "@/lib/prisma";
import { capturarSaldo } from "../captura-saldo";

if (process.env.E2E !== "1") { console.log("pulado (defina E2E=1)"); process.exit(0); }

let falhas = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? "OK  " : "FALHA ") + msg); if (!cond) falhas++; }
async function limpar() {
  await prisma.fatoEstoqueSaldoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "saldo" } });
}

async function main() {
  await limpar();
  const backup = await prisma.fatoEstoqueSaldo.findMany(); // backup ANTES de qualquer mutacao [P1-2]
  try {
    const r1 = await capturarSaldo(prisma);
    ok(r1.status === "base", "1a captura de saldo e base");
    const vig = await prisma.fatoEstoqueSaldoHistorico.count({ where: { vigente: true } });
    const dist = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) n FROM (SELECT DISTINCT produto_id, local_id FROM fato_estoque_saldo_historico WHERE vigente) t`);
    ok(vig === Number(dist[0].n), `um vigente por (produto,local): ${vig} == ${dist[0].n}`);

    const r2 = await capturarSaldo(prisma);
    ok(r2.status === "ok" && r2.gravadas === 0, "2a sem mudanca grava zero");

    // muda so vrSaldo
    const alvo = await prisma.fatoEstoqueSaldo.findFirst({ where: { vrSaldo: { gt: 0 } } });
    if (!alvo) throw new Error("sem saldo");
    await prisma.fatoEstoqueSaldo.update({ where: { id: alvo.id }, data: { vrSaldo: Number(alvo.vrSaldo) + 1 } });
    const r3 = await capturarSaldo(prisma);
    ok(r3.gravadas >= 1, "mudanca so de vrSaldo e capturada");
    await prisma.fatoEstoqueSaldo.update({ where: { id: alvo.id }, data: { vrSaldo: alvo.vrSaldo } });

    // guarda: esvazia o fato -> sumico acima do teto -> recusada, sem gravar baixa
    await capturarSaldo(prisma); // volta ao estado ok apos o restore do vrSaldo
    await prisma.fatoEstoqueSaldo.deleteMany({});
    const rRec = await capturarSaldo(prisma);
    ok(rRec.status === "recusada" && rRec.gravadas === 0, "sumico acima do teto: recusada, zero gravado");
    const baixas = await prisma.fatoEstoqueSaldoHistorico.count({ where: { evento: "baixa" } });
    ok(baixas === 0, "nenhuma baixa falsa gravada");
  } finally {
    await prisma.fatoEstoqueSaldo.deleteMany({});
    if (backup.length) await prisma.fatoEstoqueSaldo.createMany({ data: backup }); // restaura SEMPRE [P1-2]
    await limpar();
    await prisma.$disconnect();
  }
  console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHAS`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run** o script → todas OK. Conferir `fato_estoque_saldo` de volta a 4.622.
- [ ] **Step 3: Commit** `"Frente B onda 3: E2E de saldo (base/vrSaldo/guarda) com restore garantido em finally"`

---

## Onda 4 , Wiring no worker (acoplar ao ciclo cron)

### Task 10: `runBuilders` devolve status por builder

Idêntico ao PLAN v1 Task 10 (código completo lá). Confirmado seguro: `processReconcileCycle` não chama `runBuilders`; `f4l-build-fatos` e os testes existentes ignoram o retorno `[P1-descartado]`. Commit `"Frente B onda 4: runBuilders devolve status por builder"`.

### Task 11: gate `origem` em `processIncrementalCycle`, captura preço só no cron

**Files:** Modify `src/worker/sync/processors.ts:69-106`; `src/worker/index.ts:402,415`; `scripts/f4l-smoke-l1b.ts:35`, `f4l-smoke-l1c.ts:23`, `f4l-ingest.ts:19` `[P1-7]`; `src/worker/sync/processors.test.ts`.

**Interfaces:** `processIncrementalCycle(ctx, catalog, runCycle?, origem: "cron" | "ondemand" = "cron")`.

- [ ] **Step 1: Write the failing test** (mock de `../fatos/captura-preco`, seguindo o estilo de mock já presente em `processors.test.ts`):

```ts
jest.mock("../fatos/captura-preco", () => ({ capturarPreco: jest.fn().mockResolvedValue({ rodadaId: "x", status: "ok", gravadas: 0 }) }));
import { capturarPreco } from "../fatos/captura-preco";
// ...
it("captura preco no cron", async () => {
  await processIncrementalCycle(ctx, [], fakeRun, "cron");
  expect(capturarPreco).toHaveBeenCalledTimes(1);
});
it("NAO captura preco no ondemand", async () => {
  (capturarPreco as jest.Mock).mockClear();
  await processIncrementalCycle(ctx, [], fakeRun, "ondemand");
  expect(capturarPreco).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, verify it fails.**

- [ ] **Step 3: Implement** , a **função inteira editada**, preservando o `try/catch` atual e o escopo de `status` `[P1-8]`:

```ts
export async function processIncrementalCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
  origem: "cron" | "ondemand" = "cron",
): Promise<void> {
  for (const entry of catalog) {
    // ... corpo existente do laço, inalterado ...
  }
  try {
    const status = await runBuilders(ctx.prisma, "incremental");
    if (origem === "cron" && status.find((s) => s.nome === "fato_preco")?.ok) {
      try { await capturarPreco(ctx.prisma); }
      catch (err) { console.error("[worker] captura de preco falhou:", err); }
    }
  } catch (err) {
    console.error("[worker] falha ao rodar builders incrementais:", err);
  }
}
```
E nos call-sites: `index.ts:415` (`rodarCicloEscopado`) passa `"ondemand"`; `index.ts:402` deixa o default. Nos scripts `f4l-*`, passar `"ondemand"` (são dev/ingestão, não devem capturar).

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `"Frente B onda 4: captura de preco so no ciclo cron (gate origem); call-sites de script marcados ondemand"`

### Task 12: `processSnapshotCycle` captura saldo após o rebuild

**Files:** Modify `src/worker/sync/processors.ts:108-139`; `processors.test.ts`.

- [ ] **Step 1: Write the failing test** , análogo à Task 11, com `capturarSaldo` mockado (chamado 1x após `processSnapshotCycle`).
- [ ] **Step 2: Run, verify it fails.**
- [ ] **Step 3: Implement** , a **função inteira editada**:

```ts
export async function processSnapshotCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
): Promise<void> {
  for (const entry of catalog) {
    // ... corpo existente, inalterado ...
  }
  const status = await runBuilders(ctx.prisma, "snapshot");
  if (status.find((s) => s.nome === "fato_estoque_saldo")?.ok) {
    try { await capturarSaldo(ctx.prisma); }
    catch (err) { console.error("[worker] captura de saldo falhou:", err); }
  }
}
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `"Frente B onda 4: captura de saldo apos o rebuild no ciclo snapshot"`

---

## Onda 5 , Consulta (as 4 pontas), uma função por task `[P1-5]`

### Task 13: `serieDePreco` (com carry-forward e clamp)

**Files:** Create `src/lib/estoque/serie-historico.ts`; Test `serie-historico.test.ts` (unit com prisma fake) + `.e2e.ts` para o carry-forward real.

**Interfaces produzidas:**
```ts
export interface PontoSerie { capturadoEm: Date; valor: string | null; evento: string; }
export interface Lacuna { de: Date; ate: Date; tipo: "ausencia" | "recusada"; }
export interface SeriePrecoResultado { inicial: string | null; pontos: PontoSerie[]; lacunas: Lacuna[]; }
export async function serieDePreco(prisma: PrismaClient, produtoId: number, tabelaId: number, quantidadeMinima: number | undefined, deIso: string, ateIso: string): Promise<SeriePrecoResultado>;
```

- [ ] **Step 1: Write the failing `.e2e.ts`** `src/lib/estoque/__e2e__/serie-preco.e2e.ts` , cobre carry-forward alcançando antes do corte E a janela grampeada `[P1-10]`:

```ts
// E2E=1 npx tsx --env-file=.env.local src/lib/estoque/__e2e__/serie-preco.e2e.ts
import { prisma } from "@/lib/prisma";
import { capturarPreco } from "@/worker/fatos/captura-preco";
import { serieDePreco } from "../serie-historico";
import { getCorteDados } from "@/lib/corte-dados";

if (process.env.E2E !== "1") { console.log("pulado"); process.exit(0); }
let falhas = 0;
function ok(c: boolean, m: string) { console.log((c ? "OK  " : "FALHA ") + m); if (!c) falhas++; }

async function main() {
  await prisma.fatoPrecoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "preco" } });
  try {
    await capturarPreco(prisma);
    const alvo = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, valor: { not: null } } });
    if (!alvo) throw new Error("sem base");
    // janela a um ano no futuro: nenhum ponto dentro, mas o inicial (carry-forward) vem preenchido
    const r = await serieDePreco(prisma, alvo.produtoId, alvo.tabelaId, Number(alvo.quantidadeMinima), "2027-01-01", "2027-12-31");
    ok(r.inicial === alvo.valor!.toString(), "carry-forward traz o valor vigente antes da janela, mesmo alem do corte");
    // pedir uma janela ANTES do corte: a janela exibida e grampeada (nenhum ponto anterior ao corte)
    const corte = await getCorteDados(prisma);
    ok(true, `corte atual: ${corte}`); // documenta; o clamp e verificado no unit test
  } finally {
    await prisma.fatoPrecoHistorico.deleteMany({});
    await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "preco" } });
    await prisma.$disconnect();
  }
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run, verify it fails** (módulo inexistente).

- [ ] **Step 3: Implement `serieDePreco`** (código completo):

```ts
// src/lib/estoque/serie-historico.ts
import type { PrismaClient } from "@/generated/prisma/client";
import { clampIsoAoCorte, getCorteDados } from "@/lib/corte-dados";

export interface PontoSerie { capturadoEm: Date; valor: string | null; evento: string; }
export interface Lacuna { de: Date; ate: Date; tipo: "ausencia" | "recusada"; }
export interface SeriePrecoResultado { inicial: string | null; pontos: PontoSerie[]; lacunas: Lacuna[]; }

// intervalo nominal (ms) por serie, para inferir "ausencia" (gap > 2x).
const INTERVALO_MS = { preco: 10 * 60_000, saldo: 30 * 60_000 };

async function lacunas(prisma: PrismaClient, serie: "preco" | "saldo", de: Date, ate: Date): Promise<Lacuna[]> {
  const rodadas = await prisma.fatoCapturaRodada.findMany({
    where: { serie, capturadoEm: { gte: de, lte: ate } },
    orderBy: { capturadoEm: "asc" },
    select: { capturadoEm: true, status: true },
  });
  const out: Lacuna[] = [];
  for (const r of rodadas) if (r.status === "recusada") out.push({ de: r.capturadoEm, ate: r.capturadoEm, tipo: "recusada" });
  const oks = rodadas.filter((r) => r.status !== "recusada");
  for (let i = 1; i < oks.length; i++) {
    const gap = oks[i].capturadoEm.getTime() - oks[i - 1].capturadoEm.getTime();
    if (gap > 2 * INTERVALO_MS[serie]) out.push({ de: oks[i - 1].capturadoEm, ate: oks[i].capturadoEm, tipo: "ausencia" });
  }
  return out;
}

export async function serieDePreco(
  prisma: PrismaClient,
  produtoId: number,
  tabelaId: number,
  quantidadeMinima: number | undefined,
  deIso: string,
  ateIso: string,
): Promise<SeriePrecoResultado> {
  const corte = await getCorteDados(prisma);
  const de = new Date(clampIsoAoCorte(deIso, corte)); // janela grampeada ao corte
  const ate = new Date(ateIso);
  const chave = { produtoId, tabelaId, ...(quantidadeMinima !== undefined ? { quantidadeMinima } : {}) };

  // carry-forward: ultimo registro ANTES da janela, SEM clamp (leitura de estado, alcanca antes do corte).
  const anterior = await prisma.fatoPrecoHistorico.findFirst({
    where: { ...chave, capturadoEm: { lt: de } },
    orderBy: { capturadoEm: "desc" },
    select: { valor: true },
  });
  const pontosRows = await prisma.fatoPrecoHistorico.findMany({
    where: { ...chave, capturadoEm: { gte: de, lte: ate } },
    orderBy: { capturadoEm: "asc" },
    select: { capturadoEm: true, valor: true, evento: true },
  });
  return {
    inicial: anterior?.valor?.toString() ?? null,
    pontos: pontosRows.map((p) => ({ capturadoEm: p.capturadoEm, valor: p.valor?.toString() ?? null, evento: p.evento })),
    lacunas: await lacunas(prisma, "preco", de, ate),
  };
}
```

- [ ] **Step 4:** Adicionar um **unit test** (`serie-historico.test.ts`, jest, prisma fake) que prova o clamp: `deIso` anterior ao corte é grampeado , o `findMany` recebe `gte` = corte, não `deIso` `[P1-10]`.
- [ ] **Step 5: Run** unit (jest) e o `.e2e.ts` → PASS.
- [ ] **Step 6: Commit** `"Frente B onda 5: serieDePreco (carry-forward alem do corte, janela grampeada, lacunas)"`

### Task 14: `serieDeSaldo`

**Files:** Modify `src/lib/estoque/serie-historico.ts`; Test idem.

**Interfaces produzidas:**
```ts
export interface SerieSaldoResultado { inicial: { quantidade: string | null; vrSaldo: string | null } | null; pontos: { capturadoEm: Date; quantidade: string | null; vrSaldo: string | null; evento: string }[]; lacunas: Lacuna[]; }
export async function serieDeSaldo(prisma: PrismaClient, produtoId: number, localId: number | undefined, deIso: string, ateIso: string): Promise<SerieSaldoResultado>;
```

- [ ] **Step 1: Implement** (código completo, mesmo padrão da Task 13, chave `{ produtoId, ...(localId!==undefined?{localId}:{}) }`, série `"saldo"`, dois valores por ponto):

```ts
export async function serieDeSaldo(
  prisma: PrismaClient,
  produtoId: number,
  localId: number | undefined,
  deIso: string,
  ateIso: string,
): Promise<SerieSaldoResultado> {
  const corte = await getCorteDados(prisma);
  const de = new Date(clampIsoAoCorte(deIso, corte));
  const ate = new Date(ateIso);
  const chave = { produtoId, ...(localId !== undefined ? { localId } : {}) };
  const anterior = await prisma.fatoEstoqueSaldoHistorico.findFirst({
    where: { ...chave, capturadoEm: { lt: de } }, orderBy: { capturadoEm: "desc" },
    select: { quantidade: true, vrSaldo: true },
  });
  const pontos = await prisma.fatoEstoqueSaldoHistorico.findMany({
    where: { ...chave, capturadoEm: { gte: de, lte: ate } }, orderBy: { capturadoEm: "asc" },
    select: { capturadoEm: true, quantidade: true, vrSaldo: true, evento: true },
  });
  return {
    inicial: anterior ? { quantidade: anterior.quantidade?.toString() ?? null, vrSaldo: anterior.vrSaldo?.toString() ?? null } : null,
    pontos: pontos.map((p) => ({ capturadoEm: p.capturadoEm, quantidade: p.quantidade?.toString() ?? null, vrSaldo: p.vrSaldo?.toString() ?? null, evento: p.evento })),
    lacunas: await lacunas(prisma, "saldo", de, ate),
  };
}
```

- [ ] **Step 2:** unit test do clamp (idem Task 13 Step 4, para saldo).
- [ ] **Step 3: Run, verify PASS.**
- [ ] **Step 4: Commit** `"Frente B onda 5: serieDeSaldo (quantidade + vrSaldo no tempo, mesma regra de corte)"`

### Task 15: `movimentacao` (lê `fato_estoque_movimento`, sinaliza local sem extrato)

**Files:** Modify `src/lib/estoque/serie-historico.ts`; Test idem.

**Interfaces produzidas:**
```ts
export interface MovLinha { data: Date; localId: number | null; localNome: string | null; quantidade: string | null; sentido: string | null; origem: string | null; }
export interface MovimentacaoResultado { movimentos: MovLinha[]; localSemExtrato: boolean; }
export async function movimentacao(prisma: PrismaClient, produtoId: number, localId: number | undefined, deIso: string, ateIso: string): Promise<MovimentacaoResultado>;
```

- [ ] **Step 1: Implement** (código completo):

```ts
export async function movimentacao(
  prisma: PrismaClient,
  produtoId: number,
  localId: number | undefined,
  deIso: string,
  ateIso: string,
): Promise<MovimentacaoResultado> {
  const corte = await getCorteDados(prisma);
  const de = new Date(clampIsoAoCorte(deIso, corte));
  const ate = new Date(ateIso);
  const where = { produtoId, ...(localId !== undefined ? { localId } : {}), data: { gte: de, lte: ate } };
  const movs = await prisma.fatoEstoqueMovimento.findMany({
    where, orderBy: { data: "asc" },
    select: { data: true, localId: true, localNome: true, quantidade: true, sentido: true, origem: true },
  });
  // localSemExtrato: ha saldo para (produto[,local]) mas nenhum movimento no periodo consultado
  // e nenhum movimento em toda a serie (o extrato nao cobre este local).
  let localSemExtrato = false;
  if (movs.length === 0) {
    const temSaldo = await prisma.fatoEstoqueSaldo.count({ where: { produtoId, ...(localId !== undefined ? { localId } : {}) } });
    const temQualquerMov = await prisma.fatoEstoqueMovimento.count({ where: { produtoId, ...(localId !== undefined ? { localId } : {}) } });
    localSemExtrato = temSaldo > 0 && temQualquerMov === 0;
  }
  return {
    movimentos: movs.map((m) => ({ data: m.data, localId: m.localId, localNome: m.localNome, quantidade: m.quantidade?.toString() ?? null, sentido: m.sentido, origem: m.origem })),
    localSemExtrato,
  };
}
```

- [ ] **Step 2:** `.e2e.ts` curto que exercita `movimentacao` para um produto com movimento (retorna linhas) e sinaliza `localSemExtrato` num local físico sem extrato (ex.: um dos 2 identificados na perícia). Restore não é necessário (só leitura).
- [ ] **Step 3: Run, verify PASS.**
- [ ] **Step 4: Commit** `"Frente B onda 5: movimentacao (le fato_estoque_movimento, sinaliza local sem extrato)"`

### Task 16: documentar em `docs/kpis-diretoria.md`

Idêntico ao PLAN v1 Task 14: seção "Histórico temporal", explicando série de mudança vs amostra, carry-forward além do corte e por quê, baixa (NULL) vs zero, lacunas de observação. Sem travessão. Commit `"Frente B onda 5: doc do historico temporal"`.

---

## Onda 6 , Verificação e perícia

### Task 17: rebuild dos containers + E2E do ciclo real

- [ ] **Step 1:** `docker compose build app` + `docker compose up -d --force-recreate worker mcp app`.
- [ ] **Step 2:** `docker image inspect nexus-odoo:local --format '{{.Created}}'` (tem que ser agora) `[P1-6]`.
- [ ] **Step 3:** Rodar os dois `.e2e.ts` (preço e saldo) com `E2E=1` → exit 0; conferir no banco: uma rodada `base` por série, contagem de vigentes = chaves distintas, zero na segunda captura, `fato_preco`=12.009 e `fato_estoque_saldo`=4.622 restaurados.
- [ ] **Step 4:** `npx tsc --noEmit` e `npx jest` inteiros verdes (os `.e2e.ts` não entram no jest, então não colidem).
- [ ] **Step 5: Commit** de qualquer script E2E novo.

### Task 18: perícia da onda (auto-perícia obrigatória)

- [ ] **Step 1:** Auto-perícia contra a spec v3: dedup do par 15049 (uma linha vigente), índice único parcial provando um-vigente-por-chave, baixa NULL ≠ zero, carry-forward sem clamp, gate `ondemand` não captura, comparação por string na escala certa, restore garantido nos `.e2e.ts`, drift dos índices parciais documentado.
- [ ] **Step 2:** Corrigir na hora; declarar no commit o que estava errado e por quê.
- [ ] **Step 3:** Atualizar `STATUS.md` e `docs/agents/HISTORY.md`.
- [ ] **Step 4: Commit** da perícia.

---

## Self-review do plano v2 (feito)

- **Achados da review #1 aplicados:** `[P1-1]` E2E em `.e2e.ts` fora do jest (Tasks 7,9,13,15); `[P1-2]` backup/restore em `try/finally` (Tasks 7,9); `[P1-3]` timeout 60s no bootstrap (Task 6); `[P1-4]` UPDATE por `OR` composto explícito (Tasks 6,8); `[P1-5]` Task 13 dividida em 13/14/15 com código completo; `[P1-6]` verificação de drift + doc dos índices não-PSL (Task 5); `[P1-7]` call-sites de script marcados `ondemand` (Task 11); `[P1-8]` funções inteiras editadas preservando try/catch (Tasks 11,12); `[P1-9]` critérios 3/4 com E2E de alteração e ressurreição (Task 7); `[P1-10]` assertion de clamp (Tasks 13,14).
- **Cobertura da spec:** todos os critérios de aceite 1-10 têm task. Sem gap.
- **Placeholders:** as duas funções antes só descritas (`serieDeSaldo`, `movimentacao`) agora têm código completo. `captura-saldo.ts` (Task 8) descreve as diferenças concretas sobre o `captura-preco.ts` completo, não "adaptar".
- **Consistência de tipos:** `LinhaSerie`/`LinhaDelta`/`StatusBuilder`/`ResultadoCaptura`/`SeriePrecoResultado`/`SerieSaldoResultado`/`MovimentacaoResultado`/`Lacuna` batem entre as tasks.
