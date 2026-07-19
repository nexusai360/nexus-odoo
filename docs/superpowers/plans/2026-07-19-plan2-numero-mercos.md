# PLAN 2 , Número do Mercos (parsear obs → coluna no fato → 4 pontas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Versão:** v1 (aguarda review adversarial #1 → v2 → review #2 → v3)

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
2. **Regex `mercos[^0-9]{0,10}([0-9]{1,7})` (case-insensitive):** extrai **794 de 797** (99,6%). Distribuição do número: **4 dígitos (34), 5 dígitos (760)**. Nenhum de 1-3 ou 6-7 dígitos.
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
 * O `\b` antes de "mercos" evita casar "mercosul". `[^0-9]{0,10}` tolera ": ", " ",
 * "N " etc. entre a palavra e o número. Retorna só os dígitos, ou null.
 */
const RE_MERCOS = /\bmercos[^0-9]{0,10}([0-9]{4,6})/i;

export function extrairNumeroMercos(obs: string | null | undefined): string | null {
  if (!obs) return null;
  const m = RE_MERCOS.exec(obs);
  return m ? m[1] : null;
}
```

> Nota: `{4,6}` (não `{1,7}`) porque os números reais têm 4-5 dígitos; restringir evita capturar um dígito solto espúrio. `\b` barra "mercosul". Ponto para a review: aceitar 794/797 ou tentar cobrir "REFERENTE:" (folga maior) e "número antes de mercos" (2 casos).

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
- Produces: coluna `fato_pedido.numero_mercos` (text, nullable); campo Prisma `FatoPedido.numeroMercos`. Índice para busca por número.

- [ ] **Step 1: Add field + index to the model**

Em `FatoPedido`, após `modalidadeFrete`:
```prisma
  numeroMercos     String?   @map("numero_mercos")
```
E adicionar `@@index([numeroMercos])` ao bloco de índices (para "achar o pedido pelo número do Mercos").

- [ ] **Step 2: Create the additive migration SQL**

`prisma/migrations/<ts>_fato_pedido_numero_mercos/migration.sql`:
```sql
ALTER TABLE "fato_pedido" ADD COLUMN "numero_mercos" TEXT;
CREATE INDEX "fato_pedido_numero_mercos_idx" ON "fato_pedido"("numero_mercos");
```

- [ ] **Step 3: Apply + regenerate**

Run: `npx prisma migrate deploy` (confirmar coluna via information_schema) e `npx prisma generate`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "M2: coluna aditiva numero_mercos no fato_pedido (+indice)"
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

Run: `npx jest src/worker/fatos/fato-pedido.test.ts` (PASS). E2E contra o cache (após popular): confirmar ~794 pedidos com `numero_mercos` não-nulo, 4-5 dígitos.
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

`select: { numeroMercos: true, ... }`; tipo `numeroMercos: string | null`; montagem `numeroMercos: p.numeroMercos ?? null`. Na UI (`blocos-pedidos.tsx`): `mercos: l.numeroMercos ?? DASH` no map e coluna `{ key: "mercos", header: "Nº Mercos", tipo: "texto" }` (posicionar logo após "Pedido").

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

---

## Verificação final da onda (perícia do PLAN 2)

- [ ] `npx tsc --noEmit` verde; `npx jest` verde.
- [ ] E2E real: `numero_mercos` populado em ~794 pedidos, 4-5 dígitos, zero "mercosul".
- [ ] 4 pontas: o mesmo número aparece na Diretoria (relatório entregas), no Nex (pedido_situacao/BI) e disponível no fato para relatórios.
- [ ] Perícia da onda (subagente): confere no código que a extração é a mesma função nas pontas, sem regex duplicado divergente; que a coluna não zera no rebuild; sem travessão.
- [ ] STATUS.md e HISTORY.md atualizados.

## Pontos abertos para a review adversarial #1

1. **Regex final:** aceitar 794/797 (perde 2 casos raros: "número antes de mercos" e "REFERENTE:") ou estender? Custo/benefício de cada extensão vs risco de falso positivo.
2. **`{4,6}` vs `{1,7}`:** restringir a 4-6 dígitos é seguro? Há risco de um Mercos futuro com 6 dígitos (o CRM cresce)? `{4,7}` seria mais à prova de futuro sem perder precisão?
3. **Onde expor exatamente:** o Nº Mercos entra só no relatório de entregas + tool pedido_situacao, ou também em outros relatórios de pedido? (mesma lógica de 4 pontas do PLAN 1: onde o pedido é identificado, o Mercos ajuda).
4. **Índice:** `@@index([numeroMercos])` vale a pena? (uso: buscar pedido pelo nº Mercos , provável no Nex/relatórios).
