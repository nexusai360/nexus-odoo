# PLAN 2 , Número do Mercos (parsear obs → coluna no fato → 4 pontas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Versão:** v3 (FINAL , reviews #1 e #2 aplicadas; pronto para execução TDD)

**Mudanças v2 → v3 (após review #2, que achou o problema central do M6):**
- **M6 reescrito , Mercos é 1:N, não 1:1 (premissa falsa da v2 corrigida):** medido no cache, 115 de 646 números de Mercos (18%) aparecem em >1 pedido do Odoo (um Mercos vira ROM/transferência/entregas parciais , o domínio desta branch). Ex.: Mercos 46605 → 8 pedidos; Mercos 2213 → 2. Um `findFirst` devolveria 1 pedido arbitrário em silêncio. Agora: busca por Mercos usa `findMany`, com **precedência do match exato de `numeroMercos`** sobre o `contains` do número Odoo (senão um alvo de 4 dígitos casaria por substring o miolo NNNN de um PV alheio , colisão que CRESCE conforme a sequência PV do ano avança). Se N>1 pedidos casam o Mercos, a tool retorna a LISTA dos números Odoo; se N=1, a situação daquele; se 0, cai no `numero contains` antigo.
- **Teste do M6** passa a inspecionar `findMany.mock.calls[0][0].where` (padrão de `comercial.test.ts:53`) e a stubbar os `$queryRaw` de itens/trilha, senão o teste não prova o `where` e/ou estoura.
- **M4** nomeia explicitamente o bloco `entregasParciais` (blocos-pedidos.tsx tem 3 tabelas com header "Número"/"Pedido"; a coluna vai só na de entregas parciais).
- **Critério de aceite** do E2E: `>= ~794 e crescente` (o builder materializa só `rawDeleted=false`; a base cresce).
- **M2 commit** sem "(+indice)" (resíduo do v1; a task já decidiu sem índice).
- **NÃO aplicar `(?<![a-z])` antes de "mercos" (L2 da review):** blindaria "comercos"/"e-mercos" (0 casos no dado) mas perderia o `PEDIDOMERCOS:45110` real (1 caso desejado, tem "O" antes). Trade-off ruim; mantido o regex sem lookbehind, risco latente registrado.

**Mudanças v1 → v2 (após review #1):**

**Mudanças v1 → v2 (após review #1):**
- **Regex corrigido (bug crítico):** `\b` antes de "mercos" NÃO barra "mercosul" (a fronteira fica antes do "m"; "mercosul" começa numa fronteira). O regex do v1 quebraria o próprio teste. Novo regex: `/mercos(?!ul)[^0-9]{0,10}([0-9]{4,7})/i` , o lookahead negativo `(?!ul)` barra "mercosul", `{4,7}` cobre crescimento do CRM sem falso positivo. Medido: 794/797, distribuição {4:34, 5:760}, zero mercosul. Sem o `\b`, também pega "PEDIDOMERCOS:45110" (grudado).
- **Critério de aceite alinhado para 794** (o regex furado do v1 dava 793).
- **Índice removido:** o PLAN 1 adicionou `modalidade_frete` sem índice; `numero_mercos` segue o mesmo padrão (tabela de 2461 linhas, seq scan sub-ms, o builder reconstruiria o índice todo ciclo à toa).
- **Busca reversa decidida (Mercos→pedido):** o goal é "cruzar o pedido do Odoo com o do Mercos". Nova Task M6: `queryPedidoSituacao` passa a casar TAMBÉM pelo `numeroMercos` (além do número do Odoo), para "situação do pedido Mercos 43203" funcionar a qualquer usuário do Nex, sem tool nova nem depender do BI admin.

**Goal:** O número de referência do pedido no Mercos (CRM de vendas externo) existe hoje só como texto livre em `raw_pedido_documento.data->>'obs'`. Materializar como coluna estruturada `numero_mercos` no `fato_pedido` (parseando o obs no builder) e expor nas 4 pontas (relatório de entregas + relatórios + Nex), para o time cruzar o pedido do Odoo com o do Mercos.

**Architecture:** Fonte da verdade = o texto do Odoo (o obs). Extração por regex pura e testada, materializada no builder (sem re-sync: o texto já está ingerido). Coluna aditiva no fato. Rótulo/exibição na borda.

**Tech Stack:** TypeScript, Prisma v7 (Postgres cache `nexus_odoo_l1`), worker BullMQ, Next.js 16, MCP, Jest/TDD.

## Global Constraints

- **ERP Odoo é a fonte da verdade.** O número Mercos vem do obs do Odoo, não inventado.
- **4 pontas consistentes** (Diretoria, Relatórios 1.0, Relatórios 2.0, Nex): a mesma extração alimenta todas.
- **Proibido travessão (em dash)** em qualquer texto.
- **Sem PR/merge** até o dono liberar.
- **Sem re-sync** (o obs já está no cache). Migration **aditiva**.
- **Rebuild de container** após mudança: `src/worker/**` → `docker compose build app` (worker não tem build próprio) + `up -d --force-recreate worker`; `prisma/schema.prisma` → todos; `src/lib/reports/queries/**` → `mcp`.

## Achados de perícia (cache `nexus_odoo_l1`, 2026-07-19)

1. **Onde:** `raw_pedido_documento.data->>'obs'` (campo presente em 2461/2461 pedidos ativos). **797** pedidos têm "mercos" (case-insensitive) no obs; formato predominante `PEDIDO MERCOS: NNNNN`.
2. **Regex final `mercos(?!ul)[^0-9]{0,10}([0-9]{4,7})` (case-insensitive):** extrai **794 de 797** (99,6%). Distribuição do número: **4 dígitos (34), 5 dígitos (760)**. Nenhum de 1-3 ou 6-7 dígitos. O `(?!ul)` barra "mercosul" (o `\b` NÃO barra, ver mudanças v1→v2).
3. **Zero falso positivo de "mercosul"** (0 ocorrências).
4. **Os 3 escapes:** (a) `PEDIDO MERCOS: DEMONSTRAÇÃO` , correto escapar (não há número); (b) `PEDIDO N°44746 MERCOS` , número ANTES da palavra (1 caso); (c) `PEDIDO MERCOS REFERENTE: 46018` , "REFERENTE: " (12 chars) excede a folga de 10 não-dígitos (1 caso). Decisão de escopo do regex final na review (aumentar folga p/ pegar "REFERENTE"? tratar número-antes? ou aceitar 794/797).
5. **Cobertura total:** 794 de 2461 pedidos (~32%), consistente com o doc-mãe (~33%). Os demais pedidos simplesmente não têm Mercos (venda não originada no CRM).

## File Structure

- Create: `src/lib/fiscal/regras/numero-mercos.ts` (extração pura) + `.test.ts`.
- Modify: `prisma/schema.prisma` (model `FatoPedido`) , coluna `numeroMercos`.
- Create: `prisma/migrations/<ts>_fato_pedido_numero_mercos/migration.sql` (aditiva).
- Modify: `src/worker/fatos/fato-pedido.ts` (`FatoPedidoRow`, `mapPedidoRow`) , materializar.
- Modify: `src/lib/diretoria/queries/entregas-parciais.ts` (select, tipo, montagem) + `src/components/diretoria/blocos/blocos-pedidos.tsx` (coluna).
- Modify: `src/lib/agent/bi-schema-reference.ts` (coluna no fato_pedido) + `src/lib/agent/router/domain-vocabulary.ts` (vocabulário) + `src/lib/reports/queries/comercial.ts` (`queryPedidoSituacao`) + `mcp/tools/comercial/pedido-situacao.ts` (saída/schema).

---

## Task M1: Função pura de extração do número Mercos

**Files:**
- Create: `src/lib/fiscal/regras/numero-mercos.ts`
- Test: `src/lib/fiscal/regras/numero-mercos.test.ts`

**Interfaces:**
- Produces: `extrairNumeroMercos(obs: string | null | undefined): string | null`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "@jest/globals";
import { extrairNumeroMercos } from "./numero-mercos";

describe("extrairNumeroMercos", () => {
  it("extrai o número do formato padrão PEDIDO MERCOS: NNNNN", () => {
    expect(extrairNumeroMercos("PEDIDO MERCOS: 43203")).toBe("43203");
    expect(extrairNumeroMercos("PEDIDO MERCOS: 3095")).toBe("3095");
  });
  it("é case-insensitive e tolera variações de espaçamento", () => {
    expect(extrairNumeroMercos("Pedido Mercos 44142")).toBe("44142");
    expect(extrairNumeroMercos("mercos:31737")).toBe("31737");
  });
  it("não extrai quando não há número após 'mercos' (ex.: DEMONSTRAÇÃO)", () => {
    expect(extrairNumeroMercos("PEDIDO MERCOS: DEMONSTRAÇÃO")).toBeNull();
  });
  it("não confunde 'mercosul' com Mercos", () => {
    expect(extrairNumeroMercos("Operacao Mercosul 12345")).toBeNull();
  });
  it("devolve null para obs sem mercos, nulo ou vazio", () => {
    expect(extrairNumeroMercos("Pedido normal sem referencia")).toBeNull();
    expect(extrairNumeroMercos(null)).toBeNull();
    expect(extrairNumeroMercos(undefined)).toBeNull();
    expect(extrairNumeroMercos("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/fiscal/regras/numero-mercos.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

```typescript
/**
 * Extrai o número de referência do pedido no Mercos (CRM de vendas externo) do texto
 * livre `obs` do pedido do Odoo. A FONTE DA VERDADE é o texto do Odoo; esta função só
 * o estrutura. Formato real (medido no cache): "PEDIDO MERCOS: NNNNN", 4-5 dígitos.
 *
 * `(?!ul)` barra "mercosul" (um `\b` ANTES de "mercos" não barraria, pois "mercosul"
 * começa numa fronteira de palavra). `[^0-9]{0,10}` tolera ": ", " ", "N " etc. entre a
 * palavra e o número. `{4,7}` cobre 4-5 dígitos de hoje e crescimento do CRM sem falso
 * positivo. Retorna só os dígitos, ou null.
 */
const RE_MERCOS = /mercos(?!ul)[^0-9]{0,10}([0-9]{4,7})/i;

export function extrairNumeroMercos(obs: string | null | undefined): string | null {
  if (!obs) return null;
  const m = RE_MERCOS.exec(obs);
  return m ? m[1] : null;
}
```

> Nota: `{4,7}` (não `{1,7}`) porque os números reais têm 4-5 dígitos; restringir evita capturar um dígito solto espúrio, e o teto 7 é folga de futuro. `(?!ul)` barra "mercosul". Escopo aceito: 794/797 (os 2 escapes restantes , "número antes de mercos" e "REFERENTE:" , são 2 casos raros; cobri-los arriscaria falso positivo, não compensa).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/fiscal/regras/numero-mercos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fiscal/regras/numero-mercos.ts src/lib/fiscal/regras/numero-mercos.test.ts
git commit -m "M1: extracao pura do numero do Mercos do obs do pedido"
```

## Task M2: Coluna `numeroMercos` no fato_pedido (schema + migration aditiva)

**Files:**
- Modify: `prisma/schema.prisma` (model `FatoPedido`, após `modalidadeFrete`)
- Create: `prisma/migrations/<ts>_fato_pedido_numero_mercos/migration.sql`

**Interfaces:**
- Produces: coluna `fato_pedido.numero_mercos` (text, nullable); campo Prisma `FatoPedido.numeroMercos`. Sem índice (segue o padrão de `modalidade_frete` do PLAN 1; tabela de 2461 linhas, seq scan sub-ms, o builder reconstruiria o índice todo ciclo à toa).

- [ ] **Step 1: Add field to the model**

Em `FatoPedido`, após `modalidadeFrete`:
```prisma
  numeroMercos     String?   @map("numero_mercos")
```
Sem `@@index` (consistência com `modalidade_frete`).

- [ ] **Step 2: Create the additive migration SQL**

`prisma/migrations/<ts>_fato_pedido_numero_mercos/migration.sql`:
```sql
ALTER TABLE "fato_pedido" ADD COLUMN "numero_mercos" TEXT;
```

- [ ] **Step 3: Apply + regenerate**

Run: `npx prisma migrate deploy` (confirmar coluna via information_schema) e `npx prisma generate`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "M2: coluna aditiva numero_mercos no fato_pedido"
```

## Task M3: Builder materializa o número Mercos

**Files:**
- Modify: `src/worker/fatos/fato-pedido.ts` (`FatoPedidoRow`, `mapPedidoRow`)
- Test: `src/worker/fatos/fato-pedido.test.ts`

**Interfaces:**
- Consumes: `raw.obs`, `extrairNumeroMercos` (M1).
- Produces: `FatoPedidoRow.numeroMercos: string | null`.

- [ ] **Step 1: Write the failing test**

Adicionar a `fato-pedido.test.ts`:
```typescript
it("materializa o número do Mercos a partir do obs", () => {
  const raw = { ...rawBase, obs: "PEDIDO MERCOS: 43203" };
  const result = mapPedidoRow(raw as Record<string, unknown>, ETAPA_FINALIZA_MAP);
  expect(result.numeroMercos).toBe("43203");
});
it("numeroMercos null quando o obs não tem Mercos", () => {
  const result = mapPedidoRow(rawBase, ETAPA_FINALIZA_MAP);
  expect(result.numeroMercos).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/worker/fatos/fato-pedido.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Importar `extrairNumeroMercos`. Adicionar `numeroMercos: string | null;` a `FatoPedidoRow`. Em `mapPedidoRow`:
```typescript
  numeroMercos: extrairNumeroMercos(
    typeof raw.obs === "string" ? raw.obs : null,
  ),
```
(O `createMany` usa `...row` spread; nada mais a fazer no insert.)

- [ ] **Step 4: Run test + E2E**

Run: `npx jest src/worker/fatos/fato-pedido.test.ts` (PASS). E2E contra o cache (após popular): confirmar **>= ~794** pedidos com `numero_mercos` não-nulo (o builder só materializa `rawDeleted=false`; a base cresce), 4-5 dígitos, zero de 1-3 ou >5 dígitos, zero "mercosul".
```bash
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tAc \
  "SELECT count(*) FILTER (WHERE numero_mercos IS NOT NULL) AS com, count(*) AS total FROM fato_pedido;"
```

- [ ] **Step 5: Commit**

```bash
git add src/worker/fatos/fato-pedido.ts src/worker/fatos/fato-pedido.test.ts
git commit -m "M3: builder materializa numero_mercos no fato_pedido + E2E"
```

## Task M4: Número Mercos no Relatório de Entregas Parciais

**Files:**
- Modify: `src/lib/diretoria/queries/entregas-parciais.ts` (select, tipo `LinhaEntregaParcial`, montagem)
- Modify: `src/components/diretoria/blocos/blocos-pedidos.tsx` (coluna)
- Test: `src/lib/diretoria/queries/entregas-parciais.test.ts`

**Interfaces:**
- Consumes: `FatoPedido.numeroMercos`.
- Produces: `LinhaEntregaParcial.numeroMercos: string | null`.

- [ ] **Step 1: Write the failing test**

Adicionar `numeroMercos?: string | null` ao tipo `Pedido` do mock e um caso que verifica que a linha carrega o número.

- [ ] **Step 2: Run/verify fail**

Run: `npx jest entregas-parciais`.

- [ ] **Step 3: Implement**

Em `entregas-parciais.ts`: `select: { numeroMercos: true, ... }` (o `findMany` próprio da query, linhas 153-165, que já traz `modalidadeFrete`); tipo `numeroMercos: string | null`; montagem `numeroMercos: p.numeroMercos ?? null`. Na UI, APENAS no componente da tabela de entregas parciais (`TabelaEntregasParciais`, que lê `d.entregasParciais`, header "Pedido" , NÃO os blocos `pendentes`/`maisParadas`): `mercos: l.numeroMercos ?? DASH` no map e coluna `{ key: "mercos", header: "Nº Mercos", tipo: "texto" }` logo após "Pedido".

- [ ] **Step 4: Run tests**

Run: `npx jest entregas-parciais` (PASS) + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diretoria/queries/entregas-parciais.ts src/components/diretoria/blocos/blocos-pedidos.tsx src/lib/diretoria/queries/entregas-parciais.test.ts
git commit -m "M4: coluna Nº Mercos no relatorio de entregas parciais"
```

## Task M5: Número Mercos nas pontas do Nex (BI + tool + vocabulário)

**Files:**
- Modify: `src/lib/agent/bi-schema-reference.ts` (coluna `numero_mercos` no `fato_pedido`)
- Modify: `src/lib/agent/router/domain-vocabulary.ts` (termos Mercos no domínio comercial)
- Modify: `src/lib/reports/queries/comercial.ts` (`queryPedidoSituacao`: tipo + saída)
- Modify: `mcp/tools/comercial/pedido-situacao.ts` (schema Zod + string de resposta)
- Test: `src/lib/reports/queries/comercial.test.ts`

**Interfaces:**
- Consumes: `FatoPedido.numeroMercos`.

- [ ] **Step 1: BI schema + vocabulário**

Em `bi-schema-reference.ts`, adicionar `numero_mercos TEXT` (comentário: número de referência do pedido no Mercos, CRM de vendas externo) ao bloco `fato_pedido`. Em `domain-vocabulary.ts` (domínio comercial), acrescentar termos ("número do Mercos", "pedido do Mercos", "referência Mercos") e um gatilho `/\bmercos\b/i`.

- [ ] **Step 2: queryPedidoSituacao + tool (com teste)**

Adicionar `numeroMercos: string | null` ao tipo de saída de `queryPedidoSituacao` e mapear `numeroMercos: pedido.numeroMercos` (findFirst já traz a row). No `pedido-situacao.ts`: `numeroMercos: z.string().nullable()` no schema e `${p.numeroMercos ? \`, Mercos ${p.numeroMercos}\` : ""}` na resposta. Teste em `comercial.test.ts` (mock com `numeroMercos: "43203"`, assert na saída).

- [ ] **Step 3: Run tests + rebuild mcp**

Run: `npx jest comercial pedido-situacao domain-vocabulary drift` (PASS) + `npx tsc --noEmit` + `docker compose up -d --build mcp`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/bi-schema-reference.ts src/lib/agent/router/domain-vocabulary.ts src/lib/reports/queries/comercial.ts src/lib/reports/queries/comercial.test.ts mcp/tools/comercial/pedido-situacao.ts
git commit -m "M5: numero do Mercos nas pontas do Nex (BI + vocab + tool pedido_situacao)"
```

## Task M6: Busca reversa , `pedido_situacao` acha pelo número do Mercos (tratando 1:N)

**Files:**
- Modify: `src/lib/reports/queries/comercial.ts` (`queryPedidoSituacao`: tipo de retorno + lógica de match)
- Modify: `mcp/tools/comercial/pedido-situacao.ts` (schema + resposta do caso "vários pedidos")
- Test: `src/lib/reports/queries/comercial.test.ts`

**Interfaces:**
- Consumes: `FatoPedido.numeroMercos`.
- Produces: novo campo no retorno `multiplosMercos: { numeroMercos: string; pedidos: string[] } | null`.

> **Por que assim (review #2):** o número do Mercos é **1:N** com pedidos do Odoo (18% dos Mercos têm >1 pedido; um Mercos vira ROM/transferência/entregas). Um `findFirst` devolveria 1 pedido arbitrário em silêncio , inaceitável. E `numero contains alvo` casaria por substring o miolo NNNN de um PV alheio (colisão crescente). Solução: quando o alvo parece um número Mercos (4-7 dígitos puros), buscar `numeroMercos` exato PRIMEIRO; N>1 → listar os pedidos; N=1 → situação dele; N=0 → cair no `numero contains` antigo.

- [ ] **Step 1: Write the failing test**

Em `comercial.test.ts`, dois casos (seguindo o padrão de mock existente, que stubba `fatoPedido.findFirst`/`findMany`, `fatoPedidoHistorico.findMany` e `$queryRaw`):
```typescript
it("busca por número de Mercos com 1 pedido devolve a situação dele", async () => {
  const mockPrisma = {
    fatoPedido: {
      findMany: jest.fn().mockResolvedValue([
        { odooId: 1, numero: "PV-2037/26", numeroMercos: "43203", etapaNome: "Sep",
          bucketDemanda: "ABERTA", categoriaOperacao: "venda", operacaoNome: "Venda",
          modalidadeFrete: "0", empresaNome: "Matrix", participanteNome: "A", vendedorNome: "Ana",
          vrProdutos: "1000.00", dataOrcamento: new Date("2026-04-02T00:00:00Z"),
          dataAprovacao: null, dataPrevista: null, pendenciaEtapa: null },
      ]),
      findFirst: jest.fn(),
    },
    fatoPedidoHistorico: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as import("@/generated/prisma/client").PrismaClient;

  const r = await queryPedidoSituacao(mockPrisma, { numero: "43203" });
  // buscou por numeroMercos exato, nao por contains do numero Odoo
  expect((mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0].where)
    .toEqual({ numeroMercos: "43203" });
  expect(r.encontrado).toBe(true);
  expect(r.pedido?.numero).toBe("PV-2037/26");
  expect(r.multiplosMercos).toBeNull();
});

it("busca por Mercos com vários pedidos devolve a LISTA, não escolhe um", async () => {
  const mockPrisma = {
    fatoPedido: {
      findMany: jest.fn().mockResolvedValue([
        { odooId: 1, numero: "PV-0473/26", numeroMercos: "2213", dataOrcamento: new Date("2026-04-02T00:00:00Z") },
        { odooId: 2, numero: "PV-2536/26", numeroMercos: "2213", dataOrcamento: new Date("2026-05-02T00:00:00Z") },
      ]),
      findFirst: jest.fn(),
    },
    fatoPedidoHistorico: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  } as unknown as import("@/generated/prisma/client").PrismaClient;

  const r = await queryPedidoSituacao(mockPrisma, { numero: "2213" });
  expect(r.encontrado).toBe(false);
  expect(r.pedido).toBeNull();
  expect(r.multiplosMercos).toEqual({ numeroMercos: "2213", pedidos: ["PV-0473/26", "PV-2536/26"] });
});
```

- [ ] **Step 2: Run/verify fail**

Run: `npx jest comercial` , FAIL (`multiplosMercos` inexistente / busca por contains).

- [ ] **Step 3: Implement the precedence + 1:N**

No tipo de retorno de `queryPedidoSituacao`, adicionar `multiplosMercos: { numeroMercos: string; pedidos: string[] } | null` (e retorná-lo `null` em todos os returns existentes). No início da função, antes do `findFirst` atual:
```typescript
const alvo = filtros.numero.trim();
// Precedencia da busca reversa por Mercos: se o alvo parece um numero de Mercos
// (4-7 digitos puros), casa numeroMercos EXATO primeiro. Mercos e 1:N com pedidos do
// Odoo, entao tratamos a lista; e a precedencia evita o `contains` casar o miolo NNNN
// de um PV alheio por substring.
if (/^[0-9]{4,7}$/.test(alvo)) {
  const porMercos = await prisma.fatoPedido.findMany({
    where: { numeroMercos: alvo },
    orderBy: { dataOrcamento: "desc" },
  });
  if (porMercos.length > 1) {
    return {
      encontrado: false, foraDaJanela: false, pedido: null, trilha: [], itens: [],
      pendencia: null,
      multiplosMercos: { numeroMercos: alvo, pedidos: porMercos.map((p) => p.numero ?? "?") },
    };
  }
  if (porMercos.length === 1) {
    // segue o fluxo normal usando porMercos[0] como `pedido` (mesma logica de trilha/itens
    // que hoje roda sobre o resultado do findFirst): reaproveitar, atribuindo pedido = porMercos[0].
  }
  // porMercos.length === 0: cai no fluxo antigo (numero contains), abaixo.
}
```
Refatorar para que, quando `porMercos.length === 1`, o `pedido` usado no restante da função seja `porMercos[0]` (extrair o "corpo" que monta trilha/itens/pendencia numa função interna que recebe o pedido, para não duplicar). Manter o `findFirst` por `numero contains` apenas para o caso 0-hit de Mercos ou alvo não-numérico.

- [ ] **Step 4: Tool , caso "vários pedidos"**

Em `pedido-situacao.ts`: adicionar `multiplosMercos` ao schema de saída (`z.object({ numeroMercos: z.string(), pedidos: z.array(z.string()) }).nullable()`), e no formatador, quando `multiplosMercos != null`, responder algo como: `O numero de Mercos ${n.numeroMercos} corresponde a ${n.pedidos.length} pedidos no Odoo: ${n.pedidos.join(", ")}. Consulte um deles pelo numero do pedido.`

- [ ] **Step 5: Run tests + rebuild mcp**

Run: `npx jest comercial pedido-situacao` (PASS) + `npx tsc --noEmit` + `docker compose up -d --build mcp`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/queries/comercial.ts src/lib/reports/queries/comercial.test.ts mcp/tools/comercial/pedido-situacao.ts
git commit -m "M6: busca reversa por Mercos tratando 1:N (lista quando varios, precedencia sobre contains)"
```

---

## Verificação final da onda (perícia do PLAN 2)

- [ ] `npx tsc --noEmit` verde; `npx jest` verde.
- [ ] E2E real: `numero_mercos` populado em ~794 pedidos, 4-5 dígitos, zero "mercosul".
- [ ] 4 pontas: o mesmo número aparece na Diretoria (relatório entregas), no Nex (pedido_situacao/BI) e disponível no fato para relatórios.
- [ ] Perícia da onda (subagente): confere no código que a extração é a mesma função nas pontas, sem regex duplicado divergente; que a coluna não zera no rebuild; sem travessão.
- [ ] STATUS.md e HISTORY.md atualizados.

## Decisões fechadas (v2, pela review #1)

- **Regex:** `mercos(?!ul)[^0-9]{0,10}([0-9]{4,7})` , barra mercosul via lookahead, 794/797, `{4,7}` à prova de futuro. Os 2 escapes raros (número antes / "REFERENTE:") aceitos (cobri-los arriscaria falso positivo).
- **Sem índice:** consistência com `modalidade_frete` (PLAN 1); tabela pequena, índice reconstruído todo ciclo à toa.
- **Busca reversa:** Task M6 , `pedido_situacao` casa também por `numeroMercos`.
- **4 pontas:** relatório de entregas (Diretoria) + Nex (pedido_situacao/BI/vocab). Reports 1.0/2.0 não têm relatório de pedido-por-número hoje (igual ao PLAN 1); herdam do fato quando tiverem. `comercial-cotacao.ts` (fato_cotacao) não é alvo.

## Decisões fechadas (v3, pela review #2)

- **Regex:** `mercos(?!ul)[^0-9]{0,10}([0-9]{4,7})` , confirmado em Node (mercosul→null, PEDIDOMERCOS grudado→ok, mercos.→ok). 794/797. Sem lookbehind (perderia PEDIDOMERCOS real).
- **Estado do regex:** sem flag `g`, `.exec` seguro (review #2 confirmou).
- **M6 (busca reversa) é 1:N:** precedência do `numeroMercos` exato (alvo 4-7 dígitos puros) sobre o `contains`; N>1 → lista; N=1 → situação; N=0 → contains antigo. Resolve a colisão por substring (crescente) e não escolhe pedido arbitrário.
- **Zero pedido Odoo com `numero` puramente numérico** (todos "PREFIXO-NNNN/AA"), mas o `contains` casaria o miolo , por isso a precedência do match exato.

## Riscos latentes registrados (não bloqueiam; documentados)

- **"comercos"/"e-mercos" + dígitos** viraria número falso (0 casos hoje). Não blindado com `(?<![a-z])` porque isso perderia o `PEDIDOMERCOS:45110` real.
- **Input "Mercos 43203" (com texto)** não casa a busca reversa (`numeroMercos` exato). O agente da F5 extrai o número puro antes de chamar a tool; aceitável.
