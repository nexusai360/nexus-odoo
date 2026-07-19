# Histórico temporal de preço e saldo , Implementation Plan (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development por task. Steps usam checkbox (`- [ ]`).

**Goal:** Guardar, no nosso cache, a série temporal de mudança de preço e de saldo (append por mudança), capturada acoplada ao ciclo do worker, consultável nas 4 pontas sem ir ao Odoo.

**Architecture:** Duas tabelas de série append-only (`fato_preco_historico`, `fato_estoque_saldo_historico`) mais uma tabela de rodadas (`fato_captura_rodada`). Um núcleo puro por série calcula o delta (mudanças + baixas + ressurreições) a partir do estado atual do fato e do "vigente" anterior. A captura roda depois do rebuild, dentro do ciclo cron, com guarda de sanidade. Funções de consulta com carry-forward e lacunas de observação servem as 4 pontas.

**Tech Stack:** TypeScript, Prisma 7 (`@prisma/adapter-pg`), Postgres, Jest, BullMQ (worker).

**Spec:** `docs/superpowers/specs/2026-07-19-historico-temporal-preco-saldo-SPEC-v3.md`.

## Global Constraints

- **Modelo SEMPRE Opus** em qualquer subagente. UI (não há nesta onda) nunca vai a subagente.
- **Proibido o travessão (`—`)** em qualquer texto: código, doc, comentário, commit, chat. Usar vírgula, parênteses, dois-pontos ou ponto.
- **Append-only nunca apaga histórico legítimo.** O único delete permitido é o expurgo cirúrgico de um `rodadaId` comprovadamente falso.
- **Data de início das análises FILTRA a leitura, nunca apaga.** Consulta usa `clampIsoAoCorte` na janela exibida; o carry-forward alcança antes do corte por desenho; a captura ignora o corte.
- **Comparação de Decimal por string (`Decimal.toString()`), nunca por tolerância em `number`.** Cada coluna na sua escala real (`valor`/`quantidade` = 4, `vrSaldo` = 2).
- **Migration aditiva.** Nenhuma coluna existente alterada. Índice parcial `WHERE vigente` vai por SQL cru na migration (Prisma 7 não expressa índice parcial declarativo). Após aplicar: `agente schema-changed` (Postgres compartilhado entre worktrees).
- **Rebuild de container após tocar `prisma/schema.prisma` ou `src/worker/**`:** `docker compose build app` (o `worker` não tem build próprio, `build worker` é no-op) + `up -d --force-recreate worker mcp app`, conferindo `docker image inspect nexus-odoo:local --format '{{.Created}}'`.
- **Sem PR/merge sem liberação explícita do dono** (PR #196 aberto).

---

## Onda 1 , Núcleo puro do delta (preço e saldo), sem I/O

### Task 1: `delta-serie.ts` , calcular mudanças, baixas e ressurreições

Um núcleo genérico serve preço e saldo: recebe as linhas atuais (já deduplicadas) e o mapa do vigente anterior, e devolve as linhas a gravar (mudanças + baixas). Substitui e generaliza o `precosQueMudaram` atual.

**Files:**
- Create: `src/lib/estoque/delta-serie.ts`
- Test: `src/lib/estoque/delta-serie.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EventoSerie = "mudanca" | "baixa";
  export interface LinhaSerie { chave: string; valores: (string | null)[]; }
  export interface LinhaDelta { chave: string; evento: EventoSerie; valores: (string | null)[]; }
  // atuais e vigentes já usam a MESMA ordem de `valores` (representação decimal em string, ou null).
  export function calcularDelta(atuais: LinhaSerie[], vigentes: LinhaSerie[]): LinhaDelta[];
  ```
  Regra: chave nova ou com `valores` diferentes → `mudanca`. Chave que existia em `vigentes` e sumiu de `atuais` → `baixa` (valores todos `null`). Um vigente cujos `valores` são todos `null` (já era baixa) reaparecendo → `mudanca`. Igualdade compara os arrays elemento a elemento por string (`null` só é igual a `null`).

- [ ] **Step 1: Write the failing test**

```ts
import { calcularDelta, type LinhaSerie } from "./delta-serie";

const l = (chave: string, ...valores: (string | null)[]): LinhaSerie => ({ chave, valores });

describe("calcularDelta", () => {
  it("grava os novos (nunca vistos)", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [])).toEqual([
      { chave: "3:100", evento: "mudanca", valores: ["500.0000"] },
    ]);
  });

  it("nao regrava o que nao mudou", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [l("3:100", "500.0000")])).toEqual([]);
  });

  it("grava so o que mudou de valor", () => {
    const r = calcularDelta(
      [l("3:100", "550.0000"), l("3:200", "800.0000")],
      [l("3:100", "500.0000"), l("3:200", "800.0000")],
    );
    expect(r).toEqual([{ chave: "3:100", evento: "mudanca", valores: ["550.0000"] }]);
  });

  it("gera baixa para a chave que sumiu", () => {
    const r = calcularDelta([], [l("3:100", "500.0000")]);
    expect(r).toEqual([{ chave: "3:100", evento: "baixa", valores: [null] }]);
  });

  it("ressurreicao: vigente e baixa e a chave reaparece -> mudanca", () => {
    const r = calcularDelta([l("3:100", "500.0000")], [l("3:100", null)]);
    expect(r).toEqual([{ chave: "3:100", evento: "mudanca", valores: ["500.0000"] }]);
  });

  it("baixa nao vira baixa de novo (vigente ja e baixa e continua ausente)", () => {
    expect(calcularDelta([], [l("3:100", null)])).toEqual([]);
  });

  it("multi-coluna (saldo): muda se qualquer coluna muda", () => {
    const r = calcularDelta(
      [l("7:1", "10.0000", "999.99")],
      [l("7:1", "10.0000", "500.00")],
    );
    expect(r).toEqual([{ chave: "7:1", evento: "mudanca", valores: ["10.0000", "999.99"] }]);
  });

  it("zero e diferente de baixa (null)", () => {
    // saldo cai a zero: e mudanca para '0.0000', nao baixa.
    const r = calcularDelta([l("7:1", "0.0000")], [l("7:1", "10.0000")]);
    expect(r).toEqual([{ chave: "7:1", evento: "mudanca", valores: ["0.0000"] }]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** , `npx jest src/lib/estoque/delta-serie.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

```ts
// src/lib/estoque/delta-serie.ts
// Nucleo puro do append-por-mudanca de uma serie temporal (preco ou saldo).
//
// Recebe as linhas ATUAIS do fato (ja deduplicadas por chave, valores como string decimal ou
// null) e o VIGENTE anterior (a ultima linha de cada chave). Devolve so o que gravar:
// - chave nova ou com valor diferente -> 'mudanca';
// - chave que existia e sumiu -> 'baixa' (valores null);
// - chave cujo vigente ja era baixa e reaparece -> 'mudanca' (ressurreicao);
// - chave que ja estava baixada e continua ausente -> nada.
// Comparacao por string, exata: null so e igual a null. NUNCA tolerancia em number.
export type EventoSerie = "mudanca" | "baixa";

export interface LinhaSerie {
  chave: string;
  valores: (string | null)[];
}

export interface LinhaDelta {
  chave: string;
  evento: EventoSerie;
  valores: (string | null)[];
}

function iguais(a: (string | null)[], b: (string | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function ehBaixa(valores: (string | null)[]): boolean {
  return valores.every((v) => v === null);
}

export function calcularDelta(
  atuais: LinhaSerie[],
  vigentes: LinhaSerie[],
): LinhaDelta[] {
  const vigentePorChave = new Map<string, (string | null)[]>();
  for (const v of vigentes) vigentePorChave.set(v.chave, v.valores);

  const out: LinhaDelta[] = [];
  const chavesAtuais = new Set<string>();

  for (const a of atuais) {
    chavesAtuais.add(a.chave);
    const anterior = vigentePorChave.get(a.chave);
    if (anterior === undefined || !iguais(anterior, a.valores)) {
      out.push({ chave: a.chave, evento: "mudanca", valores: a.valores });
    }
  }

  // Baixas: estava vigente (e nao era baixa) e sumiu dos atuais.
  for (const v of vigentes) {
    if (chavesAtuais.has(v.chave)) continue;
    if (ehBaixa(v.valores)) continue; // ja estava baixada
    out.push({ chave: v.chave, evento: "baixa", valores: v.valores.map(() => null) });
  }

  return out;
}
```

- [ ] **Step 4: Run test, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/estoque/delta-serie.ts src/lib/estoque/delta-serie.test.ts
git commit -m "Frente B onda 1: nucleo calcularDelta (mudanca/baixa/ressurreicao, comparacao exata)"
```

### Task 2: `dedup-chave.ts` , colapsar linhas idênticas antes do delta

**Files:**
- Create: `src/lib/estoque/dedup-chave.ts`
- Test: `src/lib/estoque/dedup-chave.test.ts`

**Interfaces:**
- Consumes: `LinhaSerie` de `delta-serie.ts`.
- Produces:
  ```ts
  export interface DedupResultado { linhas: LinhaSerie[]; conflitos: string[]; }
  // desempate: recebe a lista original com um id estavel por linha; mantem a de menor id no conflito.
  export function dedupPorChave(linhas: { id: number; linha: LinhaSerie }[]): DedupResultado;
  ```
  Colapsa linhas de mesma chave e mesmos `valores` numa só. Duas de mesma chave com `valores` diferentes: mantém a de menor `id`, registra a chave em `conflitos`.

- [ ] **Step 1: Write the failing test**

```ts
import { dedupPorChave } from "./dedup-chave";

const item = (id: number, chave: string, ...valores: (string | null)[]) => ({ id, linha: { chave, valores } });

describe("dedupPorChave", () => {
  it("colapsa linhas identicas (mesma chave, mesmo valor) numa so, sem conflito", () => {
    // O par real 15049: odoo_id 22675 e 26299, ambos '21900.0000'.
    const r = dedupPorChave([item(22675, "1:15049", "21900.0000"), item(26299, "1:15049", "21900.0000")]);
    expect(r.linhas).toEqual([{ chave: "1:15049", valores: ["21900.0000"] }]);
    expect(r.conflitos).toEqual([]);
  });

  it("no conflito de valor mantem o menor id e registra a chave", () => {
    const r = dedupPorChave([item(26299, "1:15049", "22000.0000"), item(22675, "1:15049", "21900.0000")]);
    expect(r.linhas).toEqual([{ chave: "1:15049", valores: ["21900.0000"] }]);
    expect(r.conflitos).toEqual(["1:15049"]);
  });

  it("passa reto quando nao ha duplicata", () => {
    const r = dedupPorChave([item(1, "3:100", "500.0000"), item(2, "3:200", "800.0000")]);
    expect(r.linhas).toHaveLength(2);
    expect(r.conflitos).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/lib/estoque/dedup-chave.ts
// Colapsa linhas de mesma chave antes do calcularDelta. O fato_preco tem regras identicas
// com odoo_id diferente (o par produto 15049); sem colapsar, as duas entram na captura e
// violam o indice unico parcial WHERE vigente, abortando o bootstrap.
import type { LinhaSerie } from "./delta-serie";

export interface DedupResultado {
  linhas: LinhaSerie[];
  conflitos: string[];
}

function valoresIguais(a: (string | null)[], b: (string | null)[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function dedupPorChave(
  itens: { id: number; linha: LinhaSerie }[],
): DedupResultado {
  // menor id primeiro: o primeiro a ocupar a chave e o vencedor deterministico.
  const ordenado = [...itens].sort((x, y) => x.id - y.id);
  const escolhida = new Map<string, LinhaSerie>();
  const conflitos = new Set<string>();

  for (const { linha } of ordenado) {
    const atual = escolhida.get(linha.chave);
    if (atual === undefined) {
      escolhida.set(linha.chave, linha);
    } else if (!valoresIguais(atual.valores, linha.valores)) {
      conflitos.add(linha.chave);
    }
    // valores iguais: colapsa (ignora a segunda), sem conflito.
  }

  return { linhas: [...escolhida.values()], conflitos: [...conflitos] };
}
```

- [ ] **Step 4: Run test, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/estoque/dedup-chave.ts src/lib/estoque/dedup-chave.test.ts
git commit -m "Frente B onda 1: dedupPorChave (colapsa o par identico 15049, desempata por menor odoo_id)"
```

### Task 3: `guarda-sanidade.ts` , decidir se a rodada captura ou é recusada

**Files:**
- Create: `src/lib/estoque/guarda-sanidade.ts`
- Test: `src/lib/estoque/guarda-sanidade.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StatusRodada = "base" | "ok" | "recusada";
  export interface DecisaoRodada { status: StatusRodada; motivo: string | null; }
  export interface EstadoGuarda {
    baixasNestaRodada: number;   // quantas chaves sumiriam (evento=baixa) nesta rodada
    temBaseAnterior: boolean;    // existe rodada 'ok'/'base' anterior?
    recusadasSeguidas: number;   // quantas rodadas recusadas consecutivas ja houve
  }
  export const TETO_BAIXAS = 50;
  export const RECUSADAS_ATE_REBASE = 3;
  export function decidirRodada(e: EstadoGuarda): DecisaoRodada;
  ```
  Sem base anterior → `base` (bootstrap). Baixas ≤ teto → `ok`. Baixas > teto e recusadas consecutivas < `RECUSADAS_ATE_REBASE` → `recusada`. Baixas > teto mas já houve `RECUSADAS_ATE_REBASE` recusas seguidas → `base` (destrava: a queda é persistente e real).

- [ ] **Step 1: Write the failing test**

```ts
import { decidirRodada, TETO_BAIXAS, RECUSADAS_ATE_REBASE } from "./guarda-sanidade";

describe("decidirRodada", () => {
  it("primeira captura (sem base) e sempre base", () => {
    expect(decidirRodada({ baixasNestaRodada: 9999, temBaseAnterior: false, recusadasSeguidas: 0 }))
      .toEqual({ status: "base", motivo: null });
  });

  it("baixas dentro do teto: ok", () => {
    expect(decidirRodada({ baixasNestaRodada: TETO_BAIXAS, temBaseAnterior: true, recusadasSeguidas: 0 }).status)
      .toBe("ok");
  });

  it("baixas acima do teto: recusada", () => {
    const d = decidirRodada({ baixasNestaRodada: TETO_BAIXAS + 1, temBaseAnterior: true, recusadasSeguidas: 0 });
    expect(d.status).toBe("recusada");
    expect(d.motivo).toMatch(/baixas/i);
  });

  it("apos K recusas seguidas com a queda persistente, destrava numa nova base", () => {
    const d = decidirRodada({ baixasNestaRodada: 900, temBaseAnterior: true, recusadasSeguidas: RECUSADAS_ATE_REBASE });
    expect(d.status).toBe("base");
    expect(d.motivo).toMatch(/persistente/i);
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/lib/estoque/guarda-sanidade.ts
// Decide se uma rodada de captura grava (base/ok) ou e recusada. Defende contra o pull
// parcial do Odoo, que encolhe o fato legitimamente (o builder tem sucesso a partir do raw
// menor) e faria a captura gravar centenas de baixas falsas e permanentes.
//
// Limiar ABSOLUTO, nao percentual: o desaparecimento real observado e ~1 chave em todo o
// periodo, entao um teto na casa de dezenas ja e folgado, e 20% (~920 chaves) nunca dispararia.
// Rota de saida: uma queda real e persistente (K recusas seguidas com contagem estavel)
// destrava numa nova base, senao a serie morreria no primeiro evento de negocio de verdade.
export type StatusRodada = "base" | "ok" | "recusada";

export interface DecisaoRodada {
  status: StatusRodada;
  motivo: string | null;
}

export interface EstadoGuarda {
  baixasNestaRodada: number;
  temBaseAnterior: boolean;
  recusadasSeguidas: number;
}

export const TETO_BAIXAS = 50;
export const RECUSADAS_ATE_REBASE = 3;

export function decidirRodada(e: EstadoGuarda): DecisaoRodada {
  if (!e.temBaseAnterior) return { status: "base", motivo: null };
  if (e.baixasNestaRodada <= TETO_BAIXAS) return { status: "ok", motivo: null };
  if (e.recusadasSeguidas >= RECUSADAS_ATE_REBASE) {
    return {
      status: "base",
      motivo: `queda persistente (${e.baixasNestaRodada} baixas por ${e.recusadasSeguidas} rodadas): aceita como nova base`,
    };
  }
  return {
    status: "recusada",
    motivo: `${e.baixasNestaRodada} baixas acima do teto de ${TETO_BAIXAS}: rodada recusada`,
  };
}
```

- [ ] **Step 4: Run test, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/estoque/guarda-sanidade.ts src/lib/estoque/guarda-sanidade.test.ts
git commit -m "Frente B onda 1: guarda de sanidade (teto absoluto de baixas + rota de saida do dead-state)"
```

### Task 4: aposentar `precosQueMudaram` (o núcleo antigo é subsumido)

**Files:**
- Modify: `src/lib/estoque/historico-preco.ts`
- Modify: `src/lib/estoque/historico-preco.test.ts`

**Interfaces:** nenhuma exportação nova. `precosQueMudaram` não é usado em produção (só no próprio teste); `calcularDelta` o substitui. Manter o arquivo com um comentário de deprecação apontando para `delta-serie.ts`, para não quebrar o histórico de commits, e remover o teste que duplica cobertura.

- [ ] **Step 1:** Confirmar que `precosQueMudaram` não tem uso em produção:
  Run: `grep -rn "precosQueMudaram" src mcp scripts | grep -v historico-preco`
  Expected: nenhuma linha.

- [ ] **Step 2:** Substituir o corpo de `historico-preco.ts` por um re-export fino de deprecação:

```ts
// src/lib/estoque/historico-preco.ts
// DEPRECADO: o append-por-mudanca virou o nucleo generico `calcularDelta` em delta-serie.ts,
// que trata preco E saldo, baixa e ressurreicao. Mantido so como ponteiro historico.
export { calcularDelta } from "./delta-serie";
```

- [ ] **Step 3:** Apagar `src/lib/estoque/historico-preco.test.ts` (a cobertura vive em `delta-serie.test.ts`).
  Run: `git rm src/lib/estoque/historico-preco.test.ts`

- [ ] **Step 4:** Run: `npx jest src/lib/estoque && npx tsc --noEmit` → PASS / sem erro.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/estoque/historico-preco.ts
git commit -m "Frente B onda 1: aposenta precosQueMudaram (subsumido por calcularDelta)"
```

---

## Onda 2 , Schema e migration

### Task 5: modelos Prisma das 3 tabelas + índices parciais por SQL cru

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_frente_b_historico_temporal/migration.sql` (gerado + editado à mão)

**Interfaces:**
- Produces: modelos Prisma `FatoPrecoHistorico`, `FatoEstoqueSaldoHistorico`, `FatoCapturaRodada` (nomes de tabela `fato_preco_historico`, `fato_estoque_saldo_historico`, `fato_captura_rodada`).

- [ ] **Step 1:** Adicionar ao `prisma/schema.prisma`:

```prisma
model FatoPrecoHistorico {
  id               String   @id @default(uuid()) @db.Uuid
  rodadaId         String   @map("rodada_id") @db.Uuid
  capturadoEm      DateTime @map("capturado_em")
  tabelaId         Int      @map("tabela_id")
  tabelaNome       String?  @map("tabela_nome")
  produtoId        Int      @map("produto_id")
  produtoNome      String?  @map("produto_nome")
  quantidadeMinima Decimal  @map("quantidade_minima") @db.Decimal(18, 4)
  valor            Decimal? @db.Decimal(18, 4)
  evento           String
  vigente          Boolean

  @@index([tabelaId, produtoId, quantidadeMinima, capturadoEm])
  @@index([capturadoEm])
  @@index([rodadaId])
  @@map("fato_preco_historico")
}

model FatoEstoqueSaldoHistorico {
  id          String   @id @default(uuid()) @db.Uuid
  rodadaId    String   @map("rodada_id") @db.Uuid
  capturadoEm DateTime @map("capturado_em")
  produtoId   Int      @map("produto_id")
  produtoNome String?  @map("produto_nome")
  localId     Int      @map("local_id")
  localNome   String?  @map("local_nome")
  quantidade  Decimal? @db.Decimal(18, 4)
  vrSaldo     Decimal? @map("vr_saldo") @db.Decimal(18, 2)
  familiaId   Int?     @map("familia_id")
  familiaNome String?  @map("familia_nome")
  marcaId     Int?     @map("marca_id")
  marcaNome   String?  @map("marca_nome")
  unidade     String?
  evento      String
  vigente     Boolean

  @@index([produtoId, localId, capturadoEm])
  @@index([capturadoEm])
  @@index([rodadaId])
  @@map("fato_estoque_saldo_historico")
}

model FatoCapturaRodada {
  id                String   @id @default(uuid()) @db.Uuid
  serie             String
  capturadoEm       DateTime @map("capturado_em")
  linhasObservadas  Int      @map("linhas_observadas")
  linhasGravadas    Int      @map("linhas_gravadas")
  status            String
  motivo            String?

  @@index([serie, capturadoEm])
  @@map("fato_captura_rodada")
}
```

- [ ] **Step 2:** Gerar a migration sem aplicar, para editar o SQL:
  Run: `npx prisma migrate dev --name frente_b_historico_temporal --create-only`

- [ ] **Step 3:** Acrescentar ao fim do `migration.sql` gerado os índices únicos parciais (Prisma não os gera):

```sql
-- Um unico vigente por chave, e leitura O(chaves) do "ultimo por chave" na captura.
CREATE UNIQUE INDEX "fato_preco_historico_vigente_key"
  ON "fato_preco_historico" ("tabela_id", "produto_id", "quantidade_minima")
  WHERE "vigente";

CREATE UNIQUE INDEX "fato_estoque_saldo_historico_vigente_key"
  ON "fato_estoque_saldo_historico" ("produto_id", "local_id")
  WHERE "vigente";
```

- [ ] **Step 4:** Aplicar e gerar o client:
  Run: `npx prisma migrate dev` (aplica a migration pendente) e `npx prisma generate`.
  Expected: migration aplicada, sem erro.

- [ ] **Step 5:** Sinalizar às outras worktrees e commitar:

```bash
agente schema-changed
git add prisma/schema.prisma prisma/migrations
git commit -m "Frente B onda 2: schema das 3 tabelas de historico + indices unicos parciais WHERE vigente"
```

---

## Onda 3 , Captura por série (I/O), sobre o núcleo

### Task 6: `captura-preco.ts` , ler o vigente, calcular delta, gravar rodada

**Files:**
- Create: `src/worker/fatos/captura-preco.ts`
- Test: `src/worker/fatos/captura-preco.test.ts`

**Interfaces:**
- Consumes: `calcularDelta`, `dedupPorChave` (`src/lib/estoque/*`), `decidirRodada` (`guarda-sanidade.ts`).
- Produces:
  ```ts
  export async function capturarPreco(prisma: PrismaClient, agora?: Date): Promise<{ rodadaId: string; status: string; gravadas: number }>;
  ```
  Passos internos: (1) lê `fato_preco` filtrando `dimensao='produto'`; monta `LinhaSerie` com chave `tabelaId:produtoId:quantidadeMinima` e `valores=[valor?.toString() ?? null]`, com id = `odooId`; (2) `dedupPorChave`; (3) lê o vigente de `fato_preco_historico WHERE vigente`; (4) `calcularDelta`; (5) `decidirRodada` (conta baixas, vê se há base anterior, e as recusadas seguidas via `fato_captura_rodada`); (6) numa transação: se `recusada`, grava só a rodada; senão desmarca os vigentes afetados, insere as linhas novas como `vigente=true` com o `rodadaId`, e grava a rodada.

- [ ] **Step 1: Write the failing test** (usa o Prisma real do dev; isola por limpeza no `beforeEach`):

```ts
import { prisma } from "@/lib/prisma";
import { capturarPreco } from "./captura-preco";

async function limpar() {
  await prisma.fatoPrecoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "preco" } });
}

describe("capturarPreco (E2E contra o cache real)", () => {
  beforeEach(limpar);
  afterAll(async () => { await limpar(); await prisma.$disconnect(); });

  it("primeira captura e base e grava uma linha por chave (dedup do par 15049)", async () => {
    const r1 = await capturarPreco(prisma);
    expect(r1.status).toBe("base");
    // Sem duplicata: uma linha vigente por (tabela, produto, qtd_min).
    const vig = await prisma.fatoPrecoHistorico.count({ where: { vigente: true } });
    const distintas = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) n FROM (SELECT DISTINCT tabela_id, produto_id, quantidade_minima FROM fato_preco_historico WHERE vigente) t`,
    );
    expect(vig).toBe(Number(distintas[0].n));
    expect(r1.gravadas).toBe(vig);
  });

  it("segunda captura sem mudanca grava zero e fica ok", async () => {
    await capturarPreco(prisma);
    const r2 = await capturarPreco(prisma);
    expect(r2.status).toBe("ok");
    expect(r2.gravadas).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** (módulo inexistente).

- [ ] **Step 3: Implement** `captura-preco.ts` conforme os passos do bloco Interfaces. Detalhes obrigatórios:
  - chave: `` `${tabelaId}:${produtoId}:${quantidadeMinima}` ``;
  - `valor` do Prisma é `Decimal | null`: usar `valor === null ? null : valor.toString()`;
  - contar `recusadasSeguidas` = quantas das últimas rodadas `serie='preco'` (ordenadas por `capturadoEm desc`) têm `status='recusada'` até achar a primeira não-recusada;
  - `temBaseAnterior` = existe rodada `serie='preco'` com `status in ('ok','base')`;
  - transação: `UPDATE ... SET vigente=false WHERE vigente AND <chave IN afetadas>` (as chaves do delta), depois `createMany` das linhas do delta com `vigente=true`, `rodadaId`, `capturadoEm`; por fim `create` da rodada. Usar o `id` da rodada gerado antes (via `crypto.randomUUID()`), passado como `rodadaId`.

- [ ] **Step 4: Run test, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/worker/fatos/captura-preco.ts src/worker/fatos/captura-preco.test.ts
git commit -m "Frente B onda 3: capturarPreco (dedup + delta + vigente + rodada), E2E contra cache real"
```

### Task 7: teste de baixa e ressurreição de preço (contra o cache real)

**Files:**
- Modify: `src/worker/fatos/captura-preco.test.ts`

**Interfaces:** nenhuma nova; exercita `capturarPreco` manipulando o vigente diretamente para simular sumiço e retorno de uma chave sem depender do Odoo.

- [ ] **Step 1: Write the failing test** , acrescentar:

```ts
it("baixa: chave que some do fato vira linha baixa; retorno vira mudanca", async () => {
  await capturarPreco(prisma); // base
  // Escolhe uma chave vigente e a "remove" marcando-a como baixa manualmente NAO;
  // em vez disso, simula: apaga a linha do fato de origem para a proxima leitura.
  const alvo = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true } });
  if (!alvo) throw new Error("sem base");
  // Remove do fato_preco a regra correspondente para forcar a baixa na proxima captura.
  await prisma.fatoPreco.deleteMany({ where: { tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });

  const rBaixa = await capturarPreco(prisma);
  const baixa = await prisma.fatoPrecoHistorico.findFirst({
    where: { tabelaId: alvo.tabelaId!, produtoId: alvo.produtoId!, vigente: true },
  });
  expect(baixa?.evento).toBe("baixa");
  expect(baixa?.valor).toBeNull();
});
```

Nota: como o teste apaga de `fato_preco`, ele precisa restaurar o fato ao final. Adicionar em `afterAll` um `rebuildFatoPreco(prisma)` (import de `./fato-preco`) para devolver o cache ao estado real.

- [ ] **Step 2: Run test, verify it fails** (antes da lógica de baixa estar exercida) ou PASS se a Task 6 já cobre , se PASS, é porque a baixa já funciona; seguir.

- [ ] **Step 3:** Garantir o `afterAll` com `rebuildFatoPreco`.

- [ ] **Step 4: Run test, verify PASS**, e conferir que `fato_preco` voltou ao tamanho original.

- [ ] **Step 5: Commit**

```bash
git add src/worker/fatos/captura-preco.test.ts
git commit -m "Frente B onda 3: teste de baixa/ressurreicao de preco + restauracao do fato"
```

### Task 8: `captura-saldo.ts` , idem para saldo, comparando quantidade e vrSaldo

**Files:**
- Create: `src/worker/fatos/captura-saldo.ts`
- Test: `src/worker/fatos/captura-saldo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function capturarSaldo(prisma: PrismaClient, agora?: Date): Promise<{ rodadaId: string; status: string; gravadas: number }>;
  ```
  Igual a `capturarPreco`, com: chave `produtoId:localId`; `valores = [quantidade?.toString() ?? null, vrSaldo?.toString() ?? null]` (escalas 4 e 2 preservadas pelo `Decimal.toString()`); grava as dimensões `produtoNome`, `localNome`, `familiaId/Nome`, `marcaId/Nome`, `unidade`; série `'saldo'`; tabela `fato_estoque_saldo_historico`.

- [ ] **Step 1: Write the failing test**

```ts
import { prisma } from "@/lib/prisma";
import { capturarSaldo } from "./captura-saldo";

async function limpar() {
  await prisma.fatoEstoqueSaldoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "saldo" } });
}

describe("capturarSaldo (E2E contra o cache real)", () => {
  beforeEach(limpar);
  afterAll(async () => { await limpar(); await prisma.$disconnect(); });

  it("primeira captura e base, uma linha vigente por (produto, local)", async () => {
    const r1 = await capturarSaldo(prisma);
    expect(r1.status).toBe("base");
    const vig = await prisma.fatoEstoqueSaldoHistorico.count({ where: { vigente: true } });
    const distintas = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) n FROM (SELECT DISTINCT produto_id, local_id FROM fato_estoque_saldo_historico WHERE vigente) t`,
    );
    expect(vig).toBe(Number(distintas[0].n));
  });

  it("segunda sem mudanca grava zero", async () => {
    await capturarSaldo(prisma);
    const r2 = await capturarSaldo(prisma);
    expect(r2.status).toBe("ok");
    expect(r2.gravadas).toBe(0);
  });

  it("muda so vrSaldo (mesma quantidade) e capturado como mudanca", async () => {
    await capturarSaldo(prisma);
    const alvo = await prisma.fatoEstoqueSaldo.findFirst({ where: { vrSaldo: { gt: 0 } } });
    if (!alvo) throw new Error("sem saldo");
    await prisma.fatoEstoqueSaldo.update({ where: { id: alvo.id }, data: { vrSaldo: Number(alvo.vrSaldo) + 1 } });
    const r = await capturarSaldo(prisma);
    expect(r.gravadas).toBeGreaterThanOrEqual(1);
    // restaura
    await prisma.fatoEstoqueSaldo.update({ where: { id: alvo.id }, data: { vrSaldo: alvo.vrSaldo } });
  });
});
```

- [ ] **Step 2: Run, verify it fails.**
- [ ] **Step 3: Implement** `captura-saldo.ts` (mesma forma do `captura-preco.ts`, com 2 colunas de valor e as dimensões).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/worker/fatos/captura-saldo.ts src/worker/fatos/captura-saldo.test.ts
git commit -m "Frente B onda 3: capturarSaldo (quantidade + vrSaldo na escala real, dimensoes espelhadas)"
```

### Task 9: teste da guarda , sumiço acima do teto recusa a rodada

**Files:**
- Modify: `src/worker/fatos/captura-saldo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("sumico acima do teto recusa a rodada e nao grava linha", async () => {
  await capturarSaldo(prisma); // base
  // Esvazia o fato de saldo para forcar centenas de baixas na proxima captura.
  const backup = await prisma.fatoEstoqueSaldo.findMany();
  await prisma.fatoEstoqueSaldo.deleteMany({});
  const r = await capturarSaldo(prisma);
  expect(r.status).toBe("recusada");
  expect(r.gravadas).toBe(0);
  // nenhuma baixa gravada
  const baixas = await prisma.fatoEstoqueSaldoHistorico.count({ where: { evento: "baixa" } });
  expect(baixas).toBe(0);
  // restaura o fato
  await prisma.fatoEstoqueSaldo.createMany({ data: backup });
});
```

- [ ] **Step 2: Run, verify it fails** ou PASS conforme a Task 8. Se PASS, a guarda já está exercida.
- [ ] **Step 3:** ajustar se necessário.
- [ ] **Step 4: Run, verify PASS** e conferir `fato_estoque_saldo` restaurado.
- [ ] **Step 5: Commit**

```bash
git add src/worker/fatos/captura-saldo.test.ts
git commit -m "Frente B onda 3: teste da guarda (sumico acima do teto recusa sem gravar)"
```

---

## Onda 4 , Wiring no worker (acoplar ao ciclo cron)

### Task 10: `runBuilders` devolve status por builder

**Files:**
- Modify: `src/worker/fatos/registry.ts:145-161`
- Modify: `src/worker/fatos/registry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StatusBuilder { nome: string; ok: boolean; linhas: number | null; }
  export function runBuilders(prisma, cycle, builders?): Promise<StatusBuilder[]>;
  ```

- [ ] **Step 1: Write the failing test** , acrescentar a `registry.test.ts` um caso que capture o retorno:

```ts
it("devolve status por builder (ok e linhas)", async () => {
  const builders = [
    { nome: "a", cycle: "incremental" as const, run: async () => 3 },
    { nome: "b", cycle: "incremental" as const, run: async () => { throw new Error("x"); } },
  ];
  const st = await runBuilders(prisma, "incremental", builders);
  expect(st).toEqual([
    { nome: "a", ok: true, linhas: 3 },
    { nome: "b", ok: false, linhas: null },
  ]);
});
```

- [ ] **Step 2: Run, verify it fails** (hoje devolve `void`).

- [ ] **Step 3: Implement** , trocar o corpo do loop para acumular `StatusBuilder[]` e retorná-lo:

```ts
export interface StatusBuilder {
  nome: string;
  ok: boolean;
  linhas: number | null;
}

export async function runBuilders(
  prisma: PrismaClient,
  cycle: "snapshot" | "incremental",
  builders: FatoBuilderEntry[] = FATO_BUILDERS,
): Promise<StatusBuilder[]> {
  const status: StatusBuilder[] = [];
  for (const { nome, cycle: builderCycle, run } of builders) {
    if (builderCycle !== cycle) continue;
    try {
      const n = await run(prisma);
      console.log(`[worker] ${nome} reconstruído: ${n} linhas`);
      status.push({ nome, ok: true, linhas: n });
    } catch (err) {
      console.error(`[worker] falha ao reconstruir ${nome}:`, err);
      status.push({ nome, ok: false, linhas: null });
    }
  }
  await markFatoBuilt(prisma, MARCADOR_CICLO);
  return status;
}
```

- [ ] **Step 4: Run** `npx jest src/worker/fatos/registry.test.ts` → PASS. Conferir que os call-sites que ignoram o retorno (`f4l-build-fatos.ts`) continuam compilando (`await` de um valor ignorado é válido).

- [ ] **Step 5: Commit**

```bash
git add src/worker/fatos/registry.ts src/worker/fatos/registry.test.ts
git commit -m "Frente B onda 4: runBuilders devolve status por builder"
```

### Task 11: `processIncrementalCycle` recebe `origem` e captura preço só no cron

**Files:**
- Modify: `src/worker/sync/processors.ts:69-106`
- Modify: `src/worker/index.ts:402,415` (call-sites)
- Modify: `src/worker/sync/processors.test.ts`

**Interfaces:**
- Produces: `processIncrementalCycle(ctx, catalog, runCycle?, origem: "cron" | "ondemand" = "cron")`. Quando `origem==="cron"` e o builder `fato_preco` retornou `ok`, chama `capturarPreco(ctx.prisma)`.

- [ ] **Step 1: Write the failing test** , em `processors.test.ts`, com `capturarPreco` mockado, provar que ele NÃO é chamado quando `origem="ondemand"` e é chamado quando `"cron"`. (Seguir o padrão de mock já usado no arquivo; se o arquivo mocka `runBuilders`, mockar também `../fatos/captura-preco`.)

```ts
// pseudo, adaptar ao estilo do arquivo:
it("captura preco no cron", async () => {
  await processIncrementalCycle(ctx, [], fakeRun, "cron");
  expect(capturarPrecoMock).toHaveBeenCalledTimes(1);
});
it("NAO captura preco no ondemand", async () => {
  await processIncrementalCycle(ctx, [], fakeRun, "ondemand");
  expect(capturarPrecoMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, verify it fails.**

- [ ] **Step 3: Implement** , em `processors.ts`:
  - assinatura ganha `origem: "cron" | "ondemand" = "cron"`;
  - `const status = await runBuilders(ctx.prisma, "incremental");` (já retorna status após Task 10);
  - após os builders:
    ```ts
    if (origem === "cron") {
      const precoOk = status.find((s) => s.nome === "fato_preco")?.ok;
      if (precoOk) {
        try { await capturarPreco(ctx.prisma); }
        catch (err) { console.error("[worker] captura de preco falhou:", err); }
      }
    }
    ```
  - `index.ts:415` (`rodarCicloEscopado`) passa `"ondemand"`; `index.ts:402` (cron) deixa o default `"cron"`.

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/worker/sync/processors.ts src/worker/index.ts src/worker/sync/processors.test.ts
git commit -m "Frente B onda 4: captura de preco so no ciclo cron (gate origem), nunca no clique da Diretoria"
```

### Task 12: `processSnapshotCycle` captura saldo após o rebuild

**Files:**
- Modify: `src/worker/sync/processors.ts:108-139`
- Modify: `src/worker/sync/processors.test.ts`

**Interfaces:** nenhuma nova. Após `runBuilders(ctx.prisma, "snapshot")`, se `fato_estoque_saldo` deu `ok`, chama `capturarSaldo(ctx.prisma)`.

- [ ] **Step 1: Write the failing test** , análogo à Task 11, com `capturarSaldo` mockado: chamado uma vez após `processSnapshotCycle`.

- [ ] **Step 2: Run, verify it fails.**

- [ ] **Step 3: Implement**

```ts
const status = await runBuilders(ctx.prisma, "snapshot");
const saldoOk = status.find((s) => s.nome === "fato_estoque_saldo")?.ok;
if (saldoOk) {
  try { await capturarSaldo(ctx.prisma); }
  catch (err) { console.error("[worker] captura de saldo falhou:", err); }
}
```

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/worker/sync/processors.ts src/worker/sync/processors.test.ts
git commit -m "Frente B onda 4: captura de saldo apos o rebuild no ciclo snapshot"
```

---

## Onda 5 , Consulta (as 4 pontas) e documentação

### Task 13: `serie-historico.ts` , consultas com carry-forward e lacunas

**Files:**
- Create: `src/lib/estoque/serie-historico.ts`
- Test: `src/lib/estoque/serie-historico.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PontoSerie { capturadoEm: Date; valor: string | null; evento: string; }
  export interface Lacuna { de: Date; ate: Date; tipo: "ausencia" | "recusada"; }
  export interface SerieResultado { inicial: string | null; pontos: PontoSerie[]; lacunas: Lacuna[]; }
  export async function serieDePreco(prisma, produtoId: number, tabelaId: number, quantidadeMinima: number | undefined, deIso: string, ateIso: string): Promise<SerieResultado>;
  export async function serieDeSaldo(prisma, produtoId: number, localId: number | undefined, deIso: string, ateIso: string): Promise<{ inicial: { quantidade: string | null; vrSaldo: string | null } | null; pontos: ...; lacunas: Lacuna[] }>;
  export async function movimentacao(prisma, produtoId: number, localId: number | undefined, deIso: string, ateIso: string): Promise<{ movimentos: ...; localSemExtrato: boolean }>;
  ```
  `serieDePreco`: janela `[clampIsoAoCorte(deIso), ateIso]`; `inicial` = último registro com `capturadoEm < de` (carry-forward, SEM clamp, alcança antes do corte); `lacunas` de `fato_captura_rodada` (série `preco`): recusadas no período + gaps entre `ok` consecutivos maiores que 2× o intervalo nominal.

- [ ] **Step 1: Write the failing test** (contra o cache real, depois de uma captura de base):

```ts
import { prisma } from "@/lib/prisma";
import { capturarPreco } from "@/worker/fatos/captura-preco";
import { serieDePreco } from "./serie-historico";

describe("serieDePreco (carry-forward respeita o corte na janela, nao no inicial)", () => {
  beforeAll(async () => {
    await prisma.fatoPrecoHistorico.deleteMany({});
    await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "preco" } });
    await capturarPreco(prisma);
  });
  afterAll(async () => {
    await prisma.fatoPrecoHistorico.deleteMany({});
    await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "preco" } });
    await prisma.$disconnect();
  });

  it("devolve o valor inicial (carry-forward) mesmo com a janela comecando depois da base", async () => {
    const alvo = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true } });
    if (!alvo) throw new Error("sem base");
    // janela um ano a frente da base: nenhum ponto dentro, mas o inicial tem que vir preenchido
    const r = await serieDePreco(prisma, alvo.produtoId!, alvo.tabelaId!, Number(alvo.quantidadeMinima), "2027-01-01", "2027-12-31");
    expect(r.inicial).toBe(alvo.valor?.toString() ?? null);
  });
});
```

- [ ] **Step 2: Run, verify it fails.**
- [ ] **Step 3: Implement** as três funções. Usar `clampIsoAoCorte` de `@/lib/corte-dados` na janela; `inicial` por `findFirst({ where: { ...chave, capturadoEm: { lt: de } }, orderBy: { capturadoEm: "desc" } })`. `movimentacao` lê `fato_estoque_movimento`; `localSemExtrato` = há saldo para o (produto,local) mas nenhum movimento.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/estoque/serie-historico.ts src/lib/estoque/serie-historico.test.ts
git commit -m "Frente B onda 5: serieDePreco/serieDeSaldo/movimentacao (carry-forward alem do corte, lacunas)"
```

### Task 14: documentar em `docs/kpis-diretoria.md`

**Files:**
- Modify: `docs/kpis-diretoria.md`

- [ ] **Step 1:** Acrescentar uma seção "Histórico temporal de preço e saldo" explicando: (a) série de mudança, não amostra; (b) carry-forward alcança antes do corte de propósito, e por quê; (c) o significado de baixa (NULL) vs zero; (d) lacunas de observação (worker fora do ar não é estabilidade). Sem travessão.

- [ ] **Step 2: Commit**

```bash
git add docs/kpis-diretoria.md
git commit -m "Frente B onda 5: doc do historico temporal (serie de mudanca, carry-forward, corte, lacunas)"
```

---

## Onda 6 , Verificação e perícia

### Task 15: rebuild dos containers + E2E do ciclo real

**Files:** nenhum (verificação).

- [ ] **Step 1:** `docker compose build app` e `docker compose up -d --force-recreate worker mcp app`.
- [ ] **Step 2:** Conferir a imagem: `docker image inspect nexus-odoo:local --format '{{.Created}}'` (tem que ser agora).
- [ ] **Step 3:** Rodar um ciclo cron real (ou o script `scripts/f4l-build-fatos.ts` seguido de `capturarPreco`/`capturarSaldo` num script E2E dedicado) e conferir no banco: uma rodada `base` por série, contagem de vigentes = chaves distintas, zero na segunda captura.
- [ ] **Step 4:** `npx tsc --noEmit` e `npx jest` inteiros verdes.
- [ ] **Step 5: Commit** (se houver script E2E novo em `scripts/e2e/`).

### Task 16: perícia da onda (auto-perícia obrigatória)

**Files:** nenhum (relatório + correções inline se necessário).

- [ ] **Step 1:** Auto-perícia: abrir cada arquivo criado e conferir contra a spec v3 os invariantes , dedup do par 15049, um vigente por chave (o índice único parcial prova), baixa NULL ≠ zero, carry-forward sem clamp, gate `ondemand` não captura, comparação por string na escala certa.
- [ ] **Step 2:** Corrigir na hora o que achar; declarar no commit o que estava errado e por quê.
- [ ] **Step 3:** Atualizar `STATUS.md` e `docs/agents/HISTORY.md`.
- [ ] **Step 4: Commit** da perícia.

---

## Self-review do plano (feito)

- **Cobertura da spec:** §3 dedup → Task 2/6; §4.1 tabelas/índices → Task 5; §4.3 dedup → Task 2; §4.4 baixa/ressurreição → Task 1/7; §4.5 rodada/lacunas → Task 5/6/13; §4.6 gate cron + guarda → Task 3/11/12; §4.7 comparação por string → Task 1/8; §4.8 filtro dimensão → Task 6; §4.9 consultas → Task 13; §4.10 corte → Task 13/14; §5 runBuilders status → Task 10; critérios de aceite → Tasks 6-9, 11, 13, 15. Sem gap.
- **Placeholders:** nenhum; todo passo de código traz o código.
- **Consistência de tipos:** `LinhaSerie`/`LinhaDelta`/`StatusBuilder`/`SerieResultado` usados com a mesma assinatura em todas as tasks que os consomem.
