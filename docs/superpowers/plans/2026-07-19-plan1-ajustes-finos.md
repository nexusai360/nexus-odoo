# PLAN 1 , Ajustes finos (modalidade de frete, JDSDEMO/id 414, demonstração em 2 blocos)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Versão:** v2 (review adversarial #1 aplicada; aguarda review #2 mais profunda → v3)

**Mudanças da v1 → v2 (após review adversarial #1):**
- B1: corrigido erro de compilação (`const raiz` seria redeclarado); a regra JDSDEMO entra reusando a `raiz` já existente.
- B2: reduzida ao fix mínimo (`AND raw_deleted=false`), sem reescrever `queryValorArmazem` (a reescrita regredia o caminho de prefixo arbitrário da tool MCP `valor-armazem`). Medido: nenhum local deletado tem `vr_saldo>0`, então não muda número.
- Gate de 4 pontas: reescrito para consistência de **classificação/locais** (quais locais entram em cada balde), não de **valor absoluto**: a Diretoria valoriza a CUSTO (decisão canônica) e o Nex a `vr_saldo`; exigir "mesmo R$" seria impossível e não é o que a diretriz pede.
- Inventário de caminhos paralelos completado: incluído `mcp/tools/estoque/locais-por-produto.ts:161` (classifica demo por `includes("demonstra")`, 3º caminho) e os golden evals do Nex (`golden-nex.json`). Nova Task B4 os alinha.
- Nova Task A7: modalidade de frete também em `comercial.ts` (relatório de pedido das pontas 2/3), fechando as 4 pontas.
- A3: instrução corrigida (o `createMany` usa `...row` spread, não lista explícita de colunas); E2E com expected medido (2461 linhas, zero nulos, códigos 1:1257 0:1042 9:136 2:24 3:2, código 4 ausente).

**Goal:** Fechar 3 ajustes finos da perícia da reunião: (A) materializar a **modalidade de frete** (CIF/FOB/terceiros/próprio) como campo próprio, separada da operação fiscal; (B) reconhecer o **JDSDEMO nosso** (local de demonstração próprio) na regra de classificação de estoque, corrigindo a premissa errada sobre o id 414; (C) exibir o **estoque de demonstração em 2 blocos** (nossos JDSDEMO em cima, em cliente embaixo) no mesmo painel.

**Architecture:** Fonte da verdade = ERP Odoo. A modalidade de frete já é sincronizada (JSONB `data.modalidade_frete`), só falta materializar no fato e traduzir por um de-para puro reutilizável. A classificação de estoque tem fonte única (`classificacao-local.ts` → `fato_estoque_local.classificacao`) herdada pelas 4 pontas; o split de demonstração é uma dimensão de exibição derivada da raiz do local. Nenhum re-sync do Odoo é necessário.

**Tech Stack:** TypeScript, Prisma v7 (Postgres cache `nexus_odoo_l1`), Next.js 16 (App Router), Jest/TDD, worker BullMQ, MCP `@modelcontextprotocol/sdk`.

## Global Constraints

- **ERP Odoo é a fonte da verdade.** Nada de regra que diverge de como o Odoo classifica/funciona (diretriz do dono §10.1).
- **Consistência nas 4 pontas (§10.3, inegociável):** todo dado/regra criado ou ajustado alimenta IGUAL: (1) menu Diretoria e seus relatórios, (2) Relatórios 1.0, (3) Relatórios 2.0, (4) agente Nex (bubble in-app + WhatsApp via MCP). Toda task confere as 4 pontas.
- **Proibido o caractere travessão (em dash) em qualquer texto** (UI, docs, comentários, commits). Usar vírgula, parênteses, dois-pontos ou ponto.
- **Sem PR e sem merge** até o dono liberar explicitamente.
- **Sem re-sync do Odoo.** O dado já está no cache. Migrations são **aditivas** (nunca reset do banco de dev).
- **Rebuild de container após mudança:** mudou `src/worker/**` ou clientes Odoo → rebuild `worker` via `docker compose build app` (o worker não tem build próprio); mudou `prisma/schema.prisma` → rebuild todos; mudou `src/lib/reports/queries/**` → rebuild `mcp`. Ver CLAUDE.md §2.1.
- **Data de corte é filtro de leitura, nunca faxina.** Consultas novas respeitam `corte-dados.ts` quando lêem histórico.
- **UI sempre inline com a skill `ui-ux-pro-max`** (nunca subagente). Design system: primária violet, tokens semânticos, ícones Lucide, zero emoji, dark+light, responsivo 375px.

## Achados de perícia que fundamentam o plano (confrontados com o cache `nexus_odoo_l1` em 2026-07-19)

1. **modalidade_frete existe e é código NF-e.** Vive em `raw_pedido_documento.data->>'modalidade_frete'` (sincroniza automaticamente por varredura total de campos; não precisa allow-list). Valores medidos: `1`=FOB (1257), `0`=CIF (1042), `9`=Sem frete (136), `2`=Terceiros (24), `3`=Próprio remetente (2). O código `4` (Próprio destinatário) não aparece hoje mas é padrão NF-e e deve ser mapeado.
2. **A confusão modalidade≡operação está em 2 lugares:** `src/lib/diretoria/queries/entregas-parciais.ts:41` (comentário "modalidade e operação são o mesmo campo") + `:240` (`operacao: p.operacaoNome`), e `src/lib/diretoria/queries/vendas.ts:378` (`const modalidade = p.operacaoNome`, gráfico C-05 "Modalidades de operação"). O C-05 na verdade agrupa **operação fiscal**, não modalidade de frete.
3. **id 414 "Próprio / JDS DEMO SÃO PAULO" é lixo de cadastro, NÃO bug de builder.** Foi criado 2026-05-28 16:54:49 e removido 16:56:05 (76 segundos de vida) no Odoo; tem ZERO saldo, ZERO serial, ZERO movimento. O reconcile o marcou `rawDeleted=true` corretamente (Odoo não o retorna mais no `search`); o builder filtra `rawDeleted:false` (correto). Raw ativos 389 = fato 389, sem bug. **Não ressuscitar** (violaria a diretriz #1). A premissa do doc-mãe (§5/§11 "bug 389 de 390, corrigir ausência") está **refutada**.
4. **A regra de demonstração não reconhece "JDSDEMO nosso".** `classificarLocal` (`src/lib/estoque/classificacao-local.ts:45-59`) marca demonstração só por: id 35 (showroom) OU prefixo `"Terceiros / Demonstração"`. Um local sob raiz `"Próprio"` com "DEMO" no nome cairia em `fisico`/`fora`. A reunião pediu: "tudo que tem demonstração no nome vai para demonstração; MAIS o JDSDEMO (nossos depósitos de demo)". Hoje não há JDSDEMO ativo (só o 414 deletado), mas a regra deve existir para robustez e fidelidade à reunião.
5. **Demonstração hoje é UM bucket** (`queryEstoqueDemonstracao` → componente `EstoqueDemonstracao` A-13). Distribuição atual: 128 locais raiz `Terceiros` (em cliente) + 1 raiz `Próprio` (o showroom). O split "nossos × em cliente" é derivável pela raiz do `nomeCompleto`.
6. **Caminhos paralelos de classificação (risco de 4 pontas), inventário completo:**
   - (a) `queryValorArmazem` (`src/lib/reports/queries/estoque.ts:361-402`): tem DOIS caminhos, um por `classificacao` (já fact-based, via `whereLocalDoEscopo`) e um por **prefixo de subárvore arbitrário** (`nome_completo ILIKE`, usado pela tool MCP `valor-armazem.ts:95-97`). O caminho de prefixo **não filtra `rawDeleted`** (linha 378). Fix mínimo: `AND raw_deleted=false`. NÃO reescrever para classificação (quebraria o prefixo arbitrário). Medido: nenhum local `rawDeleted=true` tem `vr_saldo>0`, então hoje não muda número.
   - (b) `mcp/tools/estoque/locais-por-produto.ts:161`: classifica demonstração por `nome.includes("demonstra")` (substring). **Não reconhece "JDS DEMO"** (não contém "demonstra"). 3º caminho paralelo. A Task B4 o alinha à regra da fonte única.
   - (c) Golden evals do Nex (`golden-nex.json:1220`): SQL por `nome_completo LIKE 'Terceiros / Demonstração%'` e valoriza a `vr_saldo`. Hoje bate com o fato por coincidência (showroom id 35 tem **0 saldo**, 414 deletado). Quando um JDSDEMO-Próprio ativo com saldo aparecer, o golden subcontaria. A Task B4 documenta e alinha.
   - Observação de valorização: a Diretoria valoriza estoque a **CUSTO** (`quantidade × preco_custo`, decisão canônica do projeto), o Nex a **`vr_saldo`**. Isso é uma diferença de VALORIZAÇÃO pré-existente (não introduzida por este plano) e NÃO é objeto do PLAN 1. A consistência das 4 pontas aqui é de **classificação** (quais locais entram em cada balde), não de valor absoluto.
7. **Fonte única e helpers:** regra pura `classificacao-local.ts` → materializada em `fato_estoque_local.classificacao` (builder `src/worker/fatos/fato-estoque-local.ts:51`) → herdada via `src/lib/estoque/locais-por-classificacao.ts` por Diretoria (`src/lib/diretoria/queries/estoque.ts`), reports/MCP (`src/lib/reports/queries/estoque.ts`), seriais (`src/worker/fatos/fato-serial-saldo.ts:52`). Nex expõe enum `classificacao` em `mcp/lib/classificacao.ts:23` (`fisico|demonstracao|todos`).

---

## File Structure

**Frente A , Modalidade de frete**
- Create: `src/lib/fiscal/regras/modalidade-frete.ts` , de-para puro código NF-e → rótulo + tipo.
- Create: `src/lib/fiscal/regras/modalidade-frete.test.ts`
- Modify: `prisma/schema.prisma` (model `FatoPedido` ~2346-2379) , coluna `modalidadeFrete`.
- Create: `prisma/migrations/<ts>_fato_pedido_modalidade_frete/migration.sql` (aditiva).
- Modify: `src/worker/fatos/fato-pedido.ts` (`FatoPedidoRow`, `mapPedidoRow`) , materializar o código.
- Modify: `src/lib/diretoria/queries/entregas-parciais.ts` (select, tipo `LinhaEntregaParcial`, montagem da linha, comentário :41).
- Modify: `src/components/diretoria/blocos/blocos-pedidos.tsx` (coluna própria "Modalidade" separada de "Operação").
- Modify: `src/lib/diretoria/queries/vendas.ts:378` + rótulo do C-05 (`src/lib/diretoria/builder/catalogo.ts:112`) , corrigir o nome enganoso.
- Modify (ponta 4): expor a modalidade ao Nex , `src/lib/agent/router/domain-vocabulary.ts` e/ou tool de pedidos/entregas.
- Modify (pontas 2/3): `src/lib/reports/queries/comercial.ts` (relatório de pedido comercial que hoje expõe `operacaoNome`) , expor também a modalidade de frete.

**Frente B , JDSDEMO nosso na regra**
- Modify: `src/lib/estoque/classificacao-local.ts` (`classificarLocal`) + `src/lib/estoque/classificacao-local.test.ts`.
- Modify: `src/lib/reports/queries/estoque.ts:378` (`queryValorArmazem`, caminho de prefixo) , fix mínimo `AND raw_deleted=false` (NÃO reescrever o caminho de prefixo).
- Modify: `mcp/tools/estoque/locais-por-produto.ts:161` , alinhar o `includes("demonstra")` à regra da fonte única (Task B4).
- Doc: `src/lib/agent/evals/golden/golden-nex.json` , registrar/alinhar a divergência futura dos golden evals (Task B4).
- Doc: atualizar `docs/superpowers/research/2026-07-19-pericia-completa-reuniao.md` §5/§11 (414 é lixo, não bug).

**Frente C , Demonstração em 2 blocos**
- Create: `src/lib/estoque/subtipo-demonstracao.ts` (deriva "nosso" | "cliente") + `.test.ts`.
- Modify: `src/lib/diretoria/queries/estoque.ts` (`queryEstoqueDemonstracao` → 2 grupos).
- Modify: `src/components/diretoria/estoque/estoque-screen.tsx` (shape `EstoqueData.demonstracao`).
- Modify: `src/components/diretoria/blocos/blocos-estoque.tsx` (`EstoqueDemonstracao` → 2 sub-blocos).

---

## FRENTE A , Modalidade de frete

### Task A1: De-para puro código NF-e → rótulo de modalidade de frete

**Files:**
- Create: `src/lib/fiscal/regras/modalidade-frete.ts`
- Test: `src/lib/fiscal/regras/modalidade-frete.test.ts`

**Interfaces:**
- Produces: `rotuloModalidadeFrete(codigo: string | null | undefined): string` (rótulo curto para UI); `MODALIDADE_FRETE_LABELS: Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "@jest/globals";
import { rotuloModalidadeFrete } from "./modalidade-frete";

describe("rotuloModalidadeFrete", () => {
  it("mapeia os codigos NF-e para rotulos curtos", () => {
    expect(rotuloModalidadeFrete("0")).toBe("CIF (remetente)");
    expect(rotuloModalidadeFrete("1")).toBe("FOB (destinatario)");
    expect(rotuloModalidadeFrete("2")).toBe("Terceiros");
    expect(rotuloModalidadeFrete("3")).toBe("Proprio (remetente)");
    expect(rotuloModalidadeFrete("4")).toBe("Proprio (destinatario)");
    expect(rotuloModalidadeFrete("9")).toBe("Sem frete");
  });
  it("devolve rotulo neutro para nulo/desconhecido", () => {
    expect(rotuloModalidadeFrete(null)).toBe("Nao informada");
    expect(rotuloModalidadeFrete(undefined)).toBe("Nao informada");
    expect(rotuloModalidadeFrete("")).toBe("Nao informada");
    expect(rotuloModalidadeFrete("7")).toBe("Outra (7)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/fiscal/regras/modalidade-frete.test.ts`
Expected: FAIL ("Cannot find module './modalidade-frete'").

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * De-para da modalidade de frete da NF-e (campo `modFrete` / `modalidade_frete` do Odoo).
 * O Odoo guarda o codigo numerico como string; a fonte da verdade e o codigo,
 * o rotulo e so apresentacao. Reutilizavel pelas 4 pontas.
 */
export const MODALIDADE_FRETE_LABELS: Record<string, string> = {
  "0": "CIF (remetente)",
  "1": "FOB (destinatario)",
  "2": "Terceiros",
  "3": "Proprio (remetente)",
  "4": "Proprio (destinatario)",
  "9": "Sem frete",
};

export function rotuloModalidadeFrete(codigo: string | null | undefined): string {
  if (codigo == null || codigo === "") return "Nao informada";
  const conhecido = MODALIDADE_FRETE_LABELS[codigo];
  if (conhecido) return conhecido;
  return `Outra (${codigo})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/fiscal/regras/modalidade-frete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fiscal/regras/modalidade-frete.ts src/lib/fiscal/regras/modalidade-frete.test.ts
git commit -m "A1: de-para puro da modalidade de frete (codigo NF-e -> rotulo)"
```

### Task A2: Coluna `modalidadeFrete` no fato_pedido (schema + migration aditiva)

**Files:**
- Modify: `prisma/schema.prisma` (model `FatoPedido`)
- Create: `prisma/migrations/<timestamp>_fato_pedido_modalidade_frete/migration.sql`

**Interfaces:**
- Produces: coluna `fato_pedido.modalidade_frete` (text, nullable); campo Prisma `FatoPedido.modalidadeFrete`.

- [ ] **Step 1: Add the field to the model**

Em `prisma/schema.prisma`, no model `FatoPedido`, logo após `operacaoNome`:

```prisma
  modalidadeFrete String? @map("modalidade_frete")
```

- [ ] **Step 2: Create the additive migration SQL**

Create `prisma/migrations/<timestamp>_fato_pedido_modalidade_frete/migration.sql`:

```sql
ALTER TABLE "fato_pedido" ADD COLUMN "modalidade_frete" TEXT;
```

- [ ] **Step 3: Apply the migration to dev (no reset)**

Run: `npx prisma migrate deploy`
Expected: aplica só a nova migration; nenhum drop/reset. Confirmar com:
`docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='fato_pedido' AND column_name='modalidade_frete';"`
Expected: `modalidade_frete`.

- [ ] **Step 4: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "A2: coluna aditiva modalidade_frete no fato_pedido"
```

### Task A3: Builder materializa o código de modalidade de frete

**Files:**
- Modify: `src/worker/fatos/fato-pedido.ts` (`FatoPedidoRow` ~21-43, `mapPedidoRow` ~45-72)
- Test: `src/worker/fatos/fato-pedido.test.ts` (ou o arquivo de teste existente do builder)

**Interfaces:**
- Consumes: `raw.modalidade_frete` (string do JSONB).
- Produces: `FatoPedidoRow.modalidadeFrete: string | null`.

- [ ] **Step 1: Write the failing test**

Adicionar ao teste do builder de pedido (criar `src/worker/fatos/fato-pedido.test.ts` se não existir):

```typescript
import { describe, it, expect } from "@jest/globals";
import { mapPedidoRow } from "./fato-pedido";

describe("mapPedidoRow , modalidade de frete", () => {
  it("materializa o codigo cru de modalidade_frete", () => {
    const row = mapPedidoRow(
      { id: 1, modalidade_frete: "1" } as Record<string, unknown>,
      new Map(),
    );
    expect(row.modalidadeFrete).toBe("1");
  });
  it("aceita ausencia do campo", () => {
    const row = mapPedidoRow({ id: 2 } as Record<string, unknown>, new Map());
    expect(row.modalidadeFrete).toBeNull();
  });
});
```

> Nota ao executor: conferir a assinatura real de `mapPedidoRow` (o 2º argumento é o Map de etapas `etapaFinaliza`); ajustar a chamada do teste ao contrato real lido em `fato-pedido.ts:45-72`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/worker/fatos/fato-pedido.test.ts`
Expected: FAIL (`modalidadeFrete` undefined / propriedade inexistente).

- [ ] **Step 3: Add the field to the row type and mapper**

Em `FatoPedidoRow` adicionar `modalidadeFrete: string | null;`. Em `mapPedidoRow`, usar o helper de texto já existente no arquivo (mesmo padrão de `numero`):

```typescript
  modalidadeFrete: typeof raw.modalidade_frete === "string" && raw.modalidade_frete.length > 0
    ? raw.modalidade_frete
    : null,
```

Nada mais a fazer no insert: `rebuildFatoPedido` faz `createMany({ data: mapped })` espalhando a row inteira (`...row`), sem lista explícita de colunas (confirmado em `fato-pedido.ts:97-113`). Adicionar o campo a `FatoPedidoRow` + `mapPedidoRow` já faz o valor fluir para a coluna nova.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/worker/fatos/fato-pedido.test.ts`
Expected: PASS.

- [ ] **Step 5: Rebuild fato and verify E2E against real cache**

Rebuild o worker (imagem via `app`) e rode o build do fato_pedido, então confira que a distribuição do fato bate com o raw:

```bash
docker compose build app && docker compose up -d --force-recreate worker
# apos o build do fato_pedido rodar (ou disparar manualmente o rebuild):
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tAc \
  "SELECT modalidade_frete, count(*) FROM fato_pedido GROUP BY 1 ORDER BY 2 DESC;"
```

Expected (medido no raw, todos os 2461 pedidos têm a chave, zero sem-chave): os 5 códigos presentes `1:1257, 0:1042, 9:136, 2:24, 3:2`, **zero nulos** no fato para os pedidos com a chave, código `4` ausente hoje (mapeado para o futuro). Confirmar que a coluna não ficou tudo-nula.

- [ ] **Step 6: Commit**

```bash
git add src/worker/fatos/fato-pedido.ts src/worker/fatos/fato-pedido.test.ts
git commit -m "A3: builder materializa modalidade_frete no fato_pedido + E2E"
```

### Task A4: Coluna própria "Modalidade" no Relatório de Entregas Parciais (separada de "Operação")

**Files:**
- Modify: `src/lib/diretoria/queries/entregas-parciais.ts` (select ~156-164, tipo `LinhaEntregaParcial` ~32-49, montagem ~231-250, comentário :41)
- Modify: `src/components/diretoria/blocos/blocos-pedidos.tsx` (linha da tabela ~177-192, colunas ~193-211)

**Interfaces:**
- Consumes: `FatoPedido.modalidadeFrete`, `rotuloModalidadeFrete` (Task A1).
- Produces: `LinhaEntregaParcial.modalidade: string | null`.

- [ ] **Step 1: Write the failing test**

Adicionar ao teste de `entregas-parciais` (procurar `entregas-parciais.test.ts`; se não existir, criar cobrindo o mapeamento). Teste mínimo do mapeamento de modalidade:

```typescript
import { rotuloModalidadeFrete } from "../../fiscal/regras/modalidade-frete";
it("traduz o codigo de modalidade para rotulo na linha", () => {
  expect(rotuloModalidadeFrete("2")).toBe("Terceiros");
});
```

> Nota: o teste E2E real da query fica no Step 5; este passo garante o de-para na borda.

- [ ] **Step 2: Run test to verify current state**

Run: `npx jest src/lib/diretoria/queries/entregas-parciais.test.ts`
Expected: passa (só valida o de-para); serve de âncora.

- [ ] **Step 3: Add modalidade to query and type**

Em `entregas-parciais.ts`: adicionar `modalidadeFrete: true` ao `select` do pedido; adicionar `modalidade: string | null;` ao tipo `LinhaEntregaParcial`; na montagem da linha, `modalidade: rotuloModalidadeFrete(p.modalidadeFrete)`; **corrigir o comentário :41** para deixar claro que operação (fiscal) e modalidade (de frete) são campos distintos.

- [ ] **Step 4: Split the UI column**

Em `blocos-pedidos.tsx`: no map da linha adicionar `modalidade: l.modalidade ?? DASH`; nas colunas, trocar o header fundido `{ key: "operacao", header: "Operação / Modalidade" }` por duas colunas: `{ key: "operacao", header: "Operação" }` e `{ key: "modalidade", header: "Modalidade" }`.

- [ ] **Step 5: E2E against real cache**

Subir o dev, abrir Diretoria > Pedidos & Entregas > Entregas parciais, conferir a coluna "Modalidade" preenchida com rótulos (CIF/FOB/Terceiros/...). Screenshot dark + light.

- [ ] **Step 6: Commit**

```bash
git add src/lib/diretoria/queries/entregas-parciais.ts src/components/diretoria/blocos/blocos-pedidos.tsx
git commit -m "A4: coluna Modalidade separada de Operacao no relatorio de entregas"
```

### Task A5: Corrigir o rótulo enganoso do gráfico C-05 (operação, não modalidade)

**Files:**
- Modify: `src/lib/diretoria/queries/vendas.ts:378` (comentário/nomenclatura interna)
- Modify: `src/lib/diretoria/builder/catalogo.ts:112` (título do bloco C-05)

**Interfaces:**
- Nenhuma nova; só renomeia rótulo/comentário para não afirmar que operação fiscal é "modalidade".

- [ ] **Step 1: Rename the misleading label**

Em `catalogo.ts:112`, o título do C-05 passa de "Modalidades de operação (pedidos)" para "Operações fiscais (pedidos)". Em `vendas.ts`, ajustar apenas o **comentário** `:354` para deixar claro que agrupa por operação fiscal. **DECISÃO (review #1): manter a chave TS `modalidade` estável** (a interface `LinhaModalidade`, `blocos-vendas.tsx`, `render-componente.tsx`, `vendas-screen.tsx` dependem dela); mudar só o texto visível ao usuário evita quebra em cascata. A chave interna `modalidade` continua existindo; só o rótulo mente menos.

- [ ] **Step 2: Adjust tests**

Em `vendas.test.ts:240,249`, atualizar as expectativas de rótulo se o texto visível mudou.

- [ ] **Step 3: Run tests**

Run: `npx jest src/lib/diretoria/queries/vendas.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/diretoria/queries/vendas.ts src/lib/diretoria/builder/catalogo.ts src/lib/diretoria/queries/vendas.test.ts
git commit -m "A5: C-05 e operacao fiscal, nao modalidade de frete (rotulo honesto)"
```

### Task A6: Expor a modalidade de frete ao agente Nex (ponta 4)

**Files:**
- Modify: `src/lib/agent/router/domain-vocabulary.ts` (vocabulário de pedidos/entregas)
- Modify: `src/lib/agent/bi-schema-reference.ts` (declarar a coluna nova do fato para o BI/3c)

**Interfaces:**
- Consumes: `fato_pedido.modalidade_frete`.

- [ ] **Step 1: Declare the column in the BI schema reference**

Em `bi-schema-reference.ts`, na tabela `fato_pedido`, acrescentar a coluna `modalidade_frete` com a descrição (código NF-e do frete: 0 CIF, 1 FOB, 2 terceiros, 3/4 próprio, 9 sem frete) para o Caminho 3c (BI) enxergar.

- [ ] **Step 2: Add vocabulary terms**

Em `domain-vocabulary.ts`, adicionar termos ("modalidade de frete", "CIF", "FOB", "frete por conta de", "quem paga o frete") apontando para o domínio de pedidos/entregas.

- [ ] **Step 3: Run drift tests**

Run: `npx jest -t "drift"` (as travas que exigem registrar coluna/fato nova nos catálogos).
Expected: PASS.

- [ ] **Step 4: Rebuild mcp and smoke-test**

Run: `docker compose up -d --build mcp` e uma pergunta de smoke ao Nex ("qual a modalidade de frete dos pedidos abertos?") confirmando que o BI enxerga a coluna.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/router/domain-vocabulary.ts src/lib/agent/bi-schema-reference.ts
git commit -m "A6: expor modalidade_frete ao Nex (BI schema + vocabulario)"
```

### Task A7: Modalidade de frete no relatório de pedido comercial (pontas 2/3)

**Files:**
- Modify: `src/lib/reports/queries/comercial.ts` (a consulta de pedido que hoje retorna `operacaoNome` por pedido, ~linhas 307 e 415)

**Interfaces:**
- Consumes: `FatoPedido.modalidadeFrete`, `rotuloModalidadeFrete` (Task A1).
- Produces: campo de modalidade na linha do relatório comercial (Relatórios 1.0/2.0 e a tool MCP que lê `comercial.ts`).

> **Por que esta task existe (4 pontas):** a review adversarial #1 apontou que `comercial.ts` expõe `operacaoNome` por pedido e alimenta Relatórios 1.0, 2.0 e a tool MCP correspondente. Sem esta task, a modalidade só estaria na Diretoria e no BI do Nex, violando a diretriz das 4 pontas. Se o relatório comercial não tiver coluna de operação visível ao usuário (só interna), o executor confirma e, nesse caso, apenas garante o campo disponível no shape, documentando a decisão.

- [ ] **Step 1: Locate the pedido-level select**

Abrir `comercial.ts`, achar o `select` do pedido (onde `operacaoNome` é lido, ~307/415) e a interface da linha retornada. Confirmar quais relatórios/tools consomem essa função (grep por importadores de `comercial.ts`).

- [ ] **Step 2: Write the failing test**

Adicionar teste em `comercial.test.ts` garantindo que a linha do pedido carrega a modalidade traduzida (via `rotuloModalidadeFrete`) quando `modalidadeFrete` está presente.

- [ ] **Step 3: Add modalidadeFrete to select + line**

Adicionar `modalidadeFrete: true` ao select e `modalidade: rotuloModalidadeFrete(p.modalidadeFrete)` à linha (e ao tipo da linha).

- [ ] **Step 4: Run tests + rebuild mcp**

Run: `npx jest src/lib/reports/queries/comercial.test.ts` (PASS) e `docker compose up -d --build mcp`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/queries/comercial.ts src/lib/reports/queries/comercial.test.ts
git commit -m "A7: modalidade de frete no relatorio de pedido comercial (4 pontas)"
```

---

## FRENTE B , JDSDEMO nosso na regra de classificação

### Task B1: Reconhecer JDSDEMO nosso como demonstração em `classificarLocal`

**Files:**
- Modify: `src/lib/estoque/classificacao-local.ts` (`classificarLocal` 45-59, constantes)
- Modify: `src/lib/estoque/classificacao-local.test.ts`

**Interfaces:**
- Consumes: `LocalBruto` (já existe: `odooId`, `nomeCompleto`, `estoqueEmMaos`, `calculaExtratoSaldo`, `temProprietario`).
- Produces: mesma assinatura de `classificarLocal`; nova regra de demonstração para JDSDEMO nosso.

- [ ] **Step 1: Write the failing test**

```typescript
it("classifica JDSDEMO nosso (raiz Proprio + 'demo' no nome) como demonstracao", () => {
  expect(
    classificarLocal({
      odooId: 999,
      nomeCompleto: "Próprio / JDS DEMO SÃO PAULO",
      estoqueEmMaos: true,
      calculaExtratoSaldo: true,
      temProprietario: true,
    }),
  ).toBe("demonstracao");
});
it("nao confunde deposito proprio normal com demo", () => {
  expect(
    classificarLocal({
      odooId: 11,
      nomeCompleto: "Próprio / Jds - Matriz DF",
      estoqueEmMaos: true,
      calculaExtratoSaldo: true,
      temProprietario: true,
    }),
  ).toBe("fisico");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/estoque/classificacao-local.test.ts`
Expected: FAIL (JDSDEMO cai em "fisico").

- [ ] **Step 3: Add the JDSDEMO rule (order matters, sem redeclarar `raiz`)**

Em `classificarLocal`, a variável `const raiz = nomeCompleto.split(SEPARADOR)[0];` **já existe na linha 51**. NÃO redeclarar (causaria `TS2451: Cannot redeclare block-scoped variable 'raiz'`). Inserir a regra JDSDEMO **logo após a linha 51** (reusando `raiz`), antes do cálculo de `ehDepositoReal`:

```typescript
  const raiz = nomeCompleto.split(SEPARADOR)[0]; // <- linha 51, JA EXISTE, nao duplicar
  // JDSDEMO nosso: local de demonstracao proprio (sob "Proprio"), sem nota de
  // demonstracao, identificado por "JDS DEMO"/"demo" no nome. Regra da reuniao.
  if (raiz === RAIZ_PROPRIO && /\bjds\s*demo\b|\bdemo\b/i.test(nomeCompleto)) {
    return "demonstracao";
  }
  const ehDepositoReal =
    raiz === RAIZ_PROPRIO &&
    // ... resto inalterado
```

> Nota: `\bdemo\b` usa fronteira de palavra para não pegar "demo" como substring (ex.: "modelo" não bate). Medido: nenhum dos 16 locais físicos atuais tem "demo" como palavra isolada; só o 414 (Próprio, deletado) casa, e ele está fora do fato. Zero regressão hoje.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/estoque/classificacao-local.test.ts`
Expected: PASS.

- [ ] **Step 5: Rebuild + confirm no regression on real cache**

Rebuild worker e conferir que a contagem de físicos permanece 16 e demonstração não perde nenhum (o 414 continua fora por estar deletado):

```bash
docker compose build app && docker compose up -d --force-recreate worker
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tAc \
  "SELECT classificacao, count(*) FROM fato_estoque_local GROUP BY 1 ORDER BY 2 DESC;"
```

Expected: físico 16, demonstração 129, fora 244 (inalterado, pois não há JDSDEMO ativo hoje).

- [ ] **Step 6: Commit**

```bash
git add src/lib/estoque/classificacao-local.ts src/lib/estoque/classificacao-local.test.ts
git commit -m "B1: regra JDSDEMO nosso (Proprio + demo no nome) -> demonstracao"
```

### Task B2: Fix mínimo em `queryValorArmazem` , filtrar rawDeleted no caminho de prefixo

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts:378` (o SQL do caminho de prefixo de subárvore)

**Interfaces:** nenhuma nova; preserva os DOIS caminhos da função (classificação e prefixo arbitrário).

> **Escopo corrigido pela review #1:** `queryValorArmazem` tem dois caminhos. O caminho por `classificacao` já é fact-based e limpo. O caminho por **prefixo arbitrário** (`nome_completo ILIKE`, usado pela tool MCP `valor-armazem.ts:95-97` para consultar uma subárvore/depósito específico) NÃO pode ser trocado por classificação, senão a tool perde a capacidade de filtrar por prefixo livre. A única divergência real é a ausência de `raw_deleted=false` no SQL (linha 378), o que deixaria um local deletado (como o 414) entrar. Fix cirúrgico.

- [ ] **Step 1: Write the failing test**

Teste que garante que um local com `rawDeleted=true` NÃO aparece no resultado do caminho de prefixo. (Mock do prisma `$queryRaw`/`rawEstoqueLocal` no padrão de `estoque.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/reports/queries/estoque.test.ts`
Expected: FAIL (local deletado aparece).

- [ ] **Step 3: Add the rawDeleted filter to the prefix SQL**

Na query da linha ~376-381, acrescentar `AND raw_deleted = false` ao WHERE do `SELECT odoo_id FROM raw_estoque_local WHERE data->>'nome_completo' ILIKE $n`.

- [ ] **Step 4: Run test + confirm no number change**

Run: `npx jest src/lib/reports/queries/estoque.test.ts` (PASS). Medido: nenhum local `rawDeleted=true` tem `vr_saldo>0`, então o valor por armazém não muda hoje; o filtro é blindagem para o futuro.

- [ ] **Step 5: Rebuild mcp (a tool importa daqui)**

Run: `docker compose up -d --build mcp`

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/queries/estoque.ts src/lib/reports/queries/estoque.test.ts
git commit -m "B2: queryValorArmazem filtra rawDeleted no caminho de prefixo (blindagem)"
```

### Task B4: Alinhar os caminhos paralelos de classificação de demonstração (4 pontas)

**Files:**
- Modify: `mcp/tools/estoque/locais-por-produto.ts:161` (classifica demo por `nome.includes("demonstra")`)
- Modify: `src/lib/agent/evals/golden/golden-nex.json` (SQL golden que usa `LIKE 'Terceiros / Demonstração%'`)

**Interfaces:** nenhuma nova; alinha 2 consumidores à regra da fonte única.

> **Por que (4 pontas):** a review #1 achou 2 caminhos que classificam demonstração por texto, divergentes da regra `classificarLocal`. Hoje batem por coincidência (showroom id 35 tem 0 saldo; 414 deletado), mas a regra JDSDEMO (B1) habilita um futuro JDSDEMO-Próprio ativo que esses caminhos não reconheceriam (`includes("demonstra")` não casa "JDS DEMO"; `LIKE 'Terceiros/...'` ignora raiz Próprio).

- [ ] **Step 1: Align locais-por-produto.ts to the single source**

Trocar o `nome.includes("demonstra")` por consulta à `classificacao` do `fato_estoque_local` (herança da fonte única), ou por um helper compartilhado que reproduza `classificarLocal`. Confirmar com teste que "JDS DEMO" agora é reconhecido.

- [ ] **Step 2: Align the golden eval SQL**

Ajustar o SQL golden (`golden-nex.json:1220`) para refletir a regra completa de demonstração (incluir a raiz Próprio+demo, não só `Terceiros / Demonstração%`). Como golden é resposta esperada, atualizar o valor esperado se ele mudar; hoje não muda (0 saldo no Próprio-demo).

- [ ] **Step 3: Run eval/tests**

Run: `npx jest -t "golden"` e o teste da tool. Expected: PASS.

- [ ] **Step 4: Rebuild mcp**

Run: `docker compose up -d --build mcp`

- [ ] **Step 5: Commit**

```bash
git add mcp/tools/estoque/locais-por-produto.ts src/lib/agent/evals/golden/golden-nex.json
git commit -m "B4: alinha locais-por-produto e golden evals a regra unica de demonstracao"
```

### Task B3: Corrigir a premissa do doc-mãe sobre o id 414

**Files:**
- Modify: `docs/superpowers/research/2026-07-19-pericia-completa-reuniao.md` (§5, §7 linha H, §11)

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Rewrite the 414 finding**

Substituir "existe no raw mas está fora do fato (bug 389 de 390)" pela verdade medida: o id 414 foi criado e removido no Odoo em 76 segundos (2026-05-28), tem zero saldo/serial/movimento, o reconcile o marcou `rawDeleted=true` corretamente e o builder o filtra corretamente. Não é bug; não ressuscitar. A ação real foi criar a **regra** JDSDEMO nosso (Task B1) para o futuro.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/research/2026-07-19-pericia-completa-reuniao.md
git commit -m "B3: doc-mae, id 414 e lixo deletado no Odoo (nao bug); regra JDSDEMO cobre o futuro"
```

---

## FRENTE C , Demonstração em 2 blocos (nossos × em cliente)

### Task C1: Helper puro de sub-tipo de demonstração

**Files:**
- Create: `src/lib/estoque/subtipo-demonstracao.ts`
- Test: `src/lib/estoque/subtipo-demonstracao.test.ts`

**Interfaces:**
- Produces: `subtipoDemonstracao(nomeCompleto: string | null, odooId: number): "nosso" | "cliente"`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "@jest/globals";
import { subtipoDemonstracao } from "./subtipo-demonstracao";

describe("subtipoDemonstracao", () => {
  it("Proprio (showroom/JDSDEMO) e nosso", () => {
    expect(subtipoDemonstracao("Próprio / Showroom", 35)).toBe("nosso");
    expect(subtipoDemonstracao("Próprio / JDS DEMO SÃO PAULO", 999)).toBe("nosso");
  });
  it("Terceiros / Demonstracao e em cliente", () => {
    expect(subtipoDemonstracao("Terceiros / Demonstração / Academia X", 260)).toBe("cliente");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/estoque/subtipo-demonstracao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
import { SHOWROOM_ODOO_ID } from "./classificacao-local";

const RAIZ_PROPRIO = "Próprio";

/**
 * Sub-tipo de um local JA classificado como demonstracao:
 * - "nosso": nossos depositos de demo (raiz "Proprio": showroom + JDSDEMO).
 * - "cliente": produto na casa do cliente com nota de demonstracao (raiz "Terceiros").
 */
export function subtipoDemonstracao(
  nomeCompleto: string | null,
  odooId: number,
): "nosso" | "cliente" {
  if (odooId === SHOWROOM_ODOO_ID) return "nosso";
  const raiz = (nomeCompleto ?? "").split(" / ")[0];
  return raiz === RAIZ_PROPRIO ? "nosso" : "cliente";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/estoque/subtipo-demonstracao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/estoque/subtipo-demonstracao.ts src/lib/estoque/subtipo-demonstracao.test.ts
git commit -m "C1: helper de sub-tipo de demonstracao (nosso x cliente)"
```

### Task C2: `queryEstoqueDemonstracao` retorna 2 grupos

**Files:**
- Modify: `src/lib/diretoria/queries/estoque.ts` (`queryEstoqueDemonstracao` ~249, e `agrupaSaldo` se preciso um recorte por sub-tipo)

**Interfaces:**
- Consumes: `subtipoDemonstracao` (C1), `localIdsPorClassificacao(prisma, "demonstracao")`.
- Produces: `{ nossos: { linhas; valorGeral }, cliente: { linhas; valorGeral } }` (formato exato definido na review; manter compat com o shape atual como soma).

- [ ] **Step 1: Write the failing test**

Teste que, dado saldo em um local "Próprio" de demo e outro "Terceiros", a query separa os dois grupos com os valores certos. (Usar mock do prisma no padrão dos testes existentes de `diretoria/queries/estoque.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/diretoria/queries/estoque.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the split**

Buscar os locais de demonstração e seus `nomeCompleto`/`odooId` (via `fato_estoque_local`), classificar cada localId por `subtipoDemonstracao`, e agregar o saldo em dois grupos. Reaproveitar a valorização a custo do `agrupaSaldo`. Retornar os dois grupos e um total (para o card do KPI global de demonstração continuar batendo).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/diretoria/queries/estoque.test.ts`
Expected: PASS.

- [ ] **Step 5: E2E on real cache**

```bash
# valor de demonstracao por sub-tipo:
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tAc \
  "SELECT split_part(l.nome_completo,' / ',1) AS raiz, round(sum(s.quantidade*coalesce(p.preco_custo,0))::numeric,2) FROM fato_estoque_saldo s JOIN fato_estoque_local l ON l.odoo_id=s.local_id JOIN fato_produto p ON p.odoo_id=s.produto_id WHERE l.classificacao='demonstracao' AND s.quantidade>0 GROUP BY 1;"
```
Confirmar que a soma dos 2 grupos = valor total de demonstração exibido hoje.

- [ ] **Step 6: Commit**

```bash
git add src/lib/diretoria/queries/estoque.ts src/lib/diretoria/queries/estoque.test.ts
git commit -m "C2: query de demonstracao separa nossos (JDSDEMO) x em cliente"
```

### Task C3: Painel A-13 renderiza 2 sub-blocos (nossos em cima, cliente embaixo)

**Files:**
- Modify: `src/components/diretoria/estoque/estoque-screen.tsx` (shape `EstoqueData.demonstracao`)
- Modify: `src/components/diretoria/blocos/blocos-estoque.tsx` (`EstoqueDemonstracao` ~520-565)

**Interfaces:**
- Consumes: o retorno de 2 grupos da Task C2.

- [ ] **Step 1: ui-ux-pro-max**

Invocar `ui-ux-pro-max` para o layout dos 2 sub-blocos (mesmo painel, nossos em cima e em cliente embaixo, cada um com KPI de valor + tabela; comparação "tenho X de demonstração nossa e Y em cliente"). Design system: tokens semânticos, Lucide, sem emoji, dark+light, 375px.

- [ ] **Step 2: Update the shape**

Ajustar `EstoqueData.demonstracao` para carregar os 2 grupos (`nossos`, `cliente`) e o total.

- [ ] **Step 3: Render 2 sub-blocks**

Reescrever `EstoqueDemonstracao` para renderizar: um KPI-resumo (total + quebra nossos/cliente) e duas seções tituladas ("Demonstração nossa (JDSDEMO)" em cima, "Em cliente (com nota)" embaixo), cada uma com sua `DataTable`. Header da tabela "nossos" = "Nosso local"; da "cliente" = "Cliente / local". Estado vazio acionável em cada uma.

- [ ] **Step 4: E2E visual**

Subir dev, Diretoria > Estoque > painel de demonstração; screenshot dark + light; conferir responsivo 375px (tabelas rolam no contêiner).

- [ ] **Step 5: Commit**

```bash
git add src/components/diretoria/estoque/estoque-screen.tsx src/components/diretoria/blocos/blocos-estoque.tsx
git commit -m "C3: painel de demonstracao em 2 blocos (nossos x em cliente)"
```

---

## Verificação final da onda (perícia do PLAN 1)

- [ ] `npx tsc --noEmit` verde.
- [ ] `npx jest` verde (suíte completa).
- [ ] **4 pontas conferidas , consistência de CLASSIFICAÇÃO, não de valor absoluto:**
  - Modalidade de frete: o MESMO código→rótulo (via `rotuloModalidadeFrete`) aparece na Diretoria (relatório de entregas), no relatório comercial (Reports 1.0/2.0) e no Nex (BI/vocab). Um pedido dado tem a mesma modalidade em qualquer ponta.
  - Classificação de estoque: os MESMOS locais entram em cada balde (físico/demonstração/fora) nas 4 pontas, porque todas herdam `fato_estoque_local.classificacao` (após B2/B4 nenhum caminho paralelo diverge). **Não** se exige o mesmo R$: a Diretoria valoriza a custo e o Nex a `vr_saldo` (diferença de valorização pré-existente, fora do escopo do PLAN 1). Conferir a consistência dos LOCAIS, não do valor.
- [ ] **Perícia da onda:** reabrir cada arquivo tocado e confrontar com o plano; confirmar que (a) modalidade está separada da operação nas 4 pontas, (b) a regra JDSDEMO existe e não regrediu os físicos (16) nem demonstração (129 = 128 Terceiros + 1 showroom), (c) o painel de demonstração mostra 2 blocos com a soma dos 2 grupos = total exibido no card. Relatar o que foi verificado e descartado como falso positivo.
- [ ] STATUS.md e HISTORY.md atualizados.

---

## Pontos abertos para a review adversarial #2 (a serem resolvidos na v3)

Resolvidos na v2 pela review #1:
- ~~A5 escopo~~: decidido , renomear só o TEXTO VISÍVEL (`catalogo.ts:112` + rótulos), manter a chave TS `modalidade` estável para não quebrar `blocos-vendas.tsx`/`render-componente.tsx`/`vendas-screen.tsx` em cascata (Step 1 da A5 já reflete).
- ~~A6/A7 (4 pontas da modalidade)~~: decidido , BI+vocab no Nex (A6) e coluna no relatório comercial (A7). Sem tool dedicada (a reunião não pediu).
- ~~B1 regex~~: confirmado por medição , só o 414 (deletado) casa; zero regressão nos 16 físicos. Regex mantido com âncora `\bjds\s*demo\b` + `\bdemo\b`.

Ainda abertos para a review #2 decidir:
1. **Frente C nas 4 pontas:** o split "nosso/cliente" é visão da Diretoria. A regra (o que é demonstração) já é consistente nas 4 pontas após B1/B4. Definir se o SUB-TIPO precisa ser exposto além da Diretoria (Reports/Nex) ou se basta a Diretoria (a reunião pediu o painel 2 blocos especificamente na visão de estoque). Recomendação atual: só Diretoria; confirmar na review #2.
2. **C2 shape exato:** definir o formato de retorno (2 grupos + total) preservando o card global que lê `demonstracao.valorGeral` (`blocos-estoque.tsx:537`). Provável: manter `valorGeral` como soma dos 2 grupos + adicionar `nossos`/`cliente`.
3. **B4 golden eval:** confirmar que mexer no `golden-nex.json` não desestabiliza a suíte de evals do Nex (rodada de auditoria). Se for arriscado, degradar para só documentar a divergência futura e alinhar `locais-por-produto.ts` (o caminho de código real), deixando o golden para quando um JDSDEMO ativo existir.
