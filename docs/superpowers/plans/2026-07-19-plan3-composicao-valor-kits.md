# PLAN 3 , Composição de valor dos kits (Fase 2: rateio + painel + tools)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps com checkbox (`- [ ]`). UI sempre inline com `ui-ux-pro-max`.

**Versão:** v1 (aguarda review adversarial #1 → v2 → review #2 → v3)

**Goal:** Substituir o método manual de Excel do time (que "joga o valor todo na estrutura e zera o painel") por um rateio honesto no sistema: distribuir o valor de venda de um kit entre seus componentes, proporcional ao custo, e mostrar isso num **painel de composição de valor dos kits** na Diretoria + **tool(s) do Nex**. Fiel à reunião (transcrição §3-4).

**Architecture:** Fonte da verdade = ERP Odoo. Valor a ratear = valor REAL da venda (`fato_pedido_item.vr_produtos`, que varia por desconto). Pesos = `preco_custo` do componente (fallback preço de venda de tabela `fato_preco`). Rateio proporcional com fechamento por maior resto (soma exata). Resolve o bug de kits com múltiplas BOMs (corrige a Fase 1 de quebra). NÃO persegue preço por cliente/período/série (campos vazios na Tauga, fora da reunião , ver perícia).

**Tech Stack:** TypeScript, Prisma v7 (Postgres `nexus_odoo_l1`), worker BullMQ, Next.js 16 (App Router), MCP, Jest/TDD.

## Global Constraints

- **ERP Odoo é a fonte da verdade.**
- **4 pontas** (Diretoria, Relatórios 1.0, Relatórios 2.0, Nex): a função e a query de composição são compartilhadas.
- **Proibido travessão (em dash)** em qualquer texto.
- **Sem PR/merge** até o dono liberar.
- **Migration aditiva.** Sem reset do banco de dev.
- **Rebuild de container** conforme CLAUDE.md §2.1 (worker via `docker compose build app`; mcp via `up -d --build mcp`).
- **UI só na sessão principal + `ui-ux-pro-max`.** Design system: violet, tokens semânticos, Lucide, sem emoji, dark+light, 375px.
- **Honestidade do dado:** onde faltar preço de componente (18,8%), o painel MOSTRA o buraco, não inventa. Margem NÃO é vendida como exata (custo é snapshot de hoje).

## Achados de perícia (base do plano , `docs/superpowers/research/2026-07-19-plan3-pericia-completa-valor-kits.md`)

1. **Valor real a ratear** = `fato_pedido_item.vr_produtos` (valor comercial da venda; filtrar `=0` = bonificação). Varia 4-6x entre vendas do mesmo kit. Fonte mais limpa (NF é mais suja).
2. **Pesos** = `fato_produto.preco_custo` do componente (diferenciado: estrutura cara vs painel barato). Fallback: preço de venda de tabela `fato_preco` (tabela_id 3 "Venda Padrão", 5 "Venda Smart") → `fato_produto.preco_venda`.
3. **Custo histórico NÃO existe** (`vr_custo` é lixo). Margem só aproximada. Preço por **cliente/período/série NÃO existe** no cache.
4. **Cobertura:** 118/135 kits (87,4%) com todos os componentes precificados; 52/277 componentes (18,8%) sem preço de venda.
5. **BOM múltipla:** 4 kits com >1 lista (431, 607, 1281 são "kit"; 21287 é "unid"). A Fase 1 (`desmembrarDemanda`) soma todas as listas e **duplica** componentes. `data_ativacao`/`data_inativacao` (só no raw `raw_sped_produto_lista_material`) resolvem: preferir ativada e não-inativada, desempate pela mais recente. Só o 1281 tem impacto vivo (latente).

## File Structure

**Frente V , Função de rateio (núcleo)**
- Create: `src/lib/estoque/desmembrar-valor.ts` + `.test.ts`.

**Frente W , Resolver BOM ativa (corrige Fase 1)**
- Modify: `prisma/schema.prisma` (`FatoListaMaterialItem`: `listaDataAtivacao`, `listaInativa`).
- Create: migration aditiva.
- Modify: `src/worker/fatos/fato-lista-material.ts` (materializar ativação da lista, do raw `raw_sped_produto_lista_material`).
- Create: `src/lib/estoque/resolver-bom.ts` + `.test.ts` (escolhe a lista ativa, agrega por componente).
- Modify: `src/lib/diretoria/queries/estoque.ts` (a montagem do `bomPorPai` na necessidade de compra usa `resolverBom`).

**Frente X , Query de composição (compartilhada, 4 pontas)**
- Create: `src/lib/reports/queries/composicao-kit.ts` + `.test.ts`.

**Frente Y , Painel na Diretoria (UI)**
- Modify/Create: componente de composição de kit em `src/components/diretoria/**` + registro no catálogo/rota de estoque.

**Frente Z , Tools do Nex**
- Create: `mcp/tools/estoque/composicao-kit.ts` (+ registro em `mcp/tools/estoque/index.ts`, `mcp/catalog/index.ts`, `tool-triggers.data.ts`).
- Modify: `src/lib/agent/bi-schema-reference.ts` (BOM + preço), `src/lib/agent/router/domain-vocabulary.ts` (vocabulário de kit/composição).

---

## FRENTE V , Função de rateio

### Task V1: `desmembrarValor` (rateio proporcional com fechamento por maior resto)

**Files:**
- Create: `src/lib/estoque/desmembrar-valor.ts`
- Test: `src/lib/estoque/desmembrar-valor.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface PesoComponente { componenteId: number; peso: number; }
  export interface ValorComponente { componenteId: number; valor: number; }
  export function desmembrarValor(totalCentavos: number, pesos: PesoComponente[]): ValorComponente[];
  ```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "@jest/globals";
import { desmembrarValor } from "./desmembrar-valor";

describe("desmembrarValor", () => {
  it("rateia proporcional ao peso e fecha a soma exata (maior resto)", () => {
    // total 100,00 (10000 centavos), pesos 1:1:1 -> 3333,3334,3333 (soma 10000)
    const r = desmembrarValor(10000, [
      { componenteId: 1, peso: 1 },
      { componenteId: 2, peso: 1 },
      { componenteId: 3, peso: 1 },
    ]);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(10000); // soma exata
    expect(r.map((x) => x.valor).sort((a, b) => a - b)).toEqual([3333, 3333, 3334]);
  });

  it("estrutura cara leva mais que painel barato (proporcional ao custo)", () => {
    // total 50000 centavos, estrutura peso 8000, painel peso 2000 -> 80%/20%
    const r = desmembrarValor(50000, [
      { componenteId: 10, peso: 8000 },
      { componenteId: 20, peso: 2000 },
    ]);
    expect(r.find((x) => x.componenteId === 10)!.valor).toBe(40000);
    expect(r.find((x) => x.componenteId === 20)!.valor).toBe(10000);
  });

  it("todos os pesos zero: divide igualmente (fallback), soma exata", () => {
    const r = desmembrarValor(10000, [
      { componenteId: 1, peso: 0 },
      { componenteId: 2, peso: 0 },
      { componenteId: 3, peso: 0 },
    ]);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(10000);
  });

  it("lista vazia devolve vazio; total zero devolve zeros", () => {
    expect(desmembrarValor(10000, [])).toEqual([]);
    const r = desmembrarValor(0, [{ componenteId: 1, peso: 5 }]);
    expect(r).toEqual([{ componenteId: 1, valor: 0 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/estoque/desmembrar-valor.test.ts` , FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

```typescript
export interface PesoComponente { componenteId: number; peso: number; }
export interface ValorComponente { componenteId: number; valor: number; }

/**
 * Rateia um total (em CENTAVOS, inteiro) entre componentes proporcional ao peso, com
 * fechamento por MAIOR RESTO: a soma dos rateados é exatamente o total (sem centavo perdido).
 * Peso = quantidade x preco_custo do componente (definido por quem chama). Se a soma dos
 * pesos e 0, divide igualmente (fallback honesto). Trabalha em inteiro para nao vazar centavo.
 */
export function desmembrarValor(
  totalCentavos: number,
  pesos: PesoComponente[],
): ValorComponente[] {
  if (pesos.length === 0) return [];
  const total = Math.round(totalCentavos);
  const somaPesos = pesos.reduce((s, p) => s + Math.max(0, p.peso), 0);
  // Fallback: sem pesos validos, divide igualmente.
  const base = somaPesos > 0 ? pesos.map((p) => Math.max(0, p.peso)) : pesos.map(() => 1);
  const somaBase = base.reduce((s, x) => s + x, 0);

  // Piso (floor) de cada parte + resto fracionario, para distribuir os centavos que sobram.
  const brutos = base.map((peso) => (total * peso) / somaBase);
  const piso = brutos.map((x) => Math.floor(x));
  let sobra = total - piso.reduce((s, x) => s + x, 0);
  // Maior resto primeiro (desempate por indice estavel).
  const ordem = brutos
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  const valor = [...piso];
  for (let k = 0; k < sobra; k++) valor[ordem[k % ordem.length].i] += 1;

  return pesos.map((p, i) => ({ componenteId: p.componenteId, valor: valor[i] }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/estoque/desmembrar-valor.test.ts` , PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/estoque/desmembrar-valor.ts src/lib/estoque/desmembrar-valor.test.ts
git commit -m "V1: funcao pura desmembrarValor (rateio proporcional, fechamento por maior resto)"
```

---

## FRENTE W , Resolver BOM ativa (corrige a Fase 1)

### Task W1: Materializar a ativação da lista no fato

**Files:**
- Modify: `prisma/schema.prisma` (`FatoListaMaterialItem`)
- Create: migration aditiva
- Modify: `src/worker/fatos/fato-lista-material.ts`

**Interfaces:**
- Produces: colunas `fato_lista_material_item.lista_data_ativacao` (timestamp null), `lista_inativa` (bool).

- [ ] **Step 1: Schema + migration aditiva**

No model `FatoListaMaterialItem`, após `listaId`:
```prisma
  listaDataAtivacao DateTime? @map("lista_data_ativacao")
  listaInativa      Boolean   @default(false) @map("lista_inativa")
```
Migration:
```sql
ALTER TABLE "fato_lista_material_item" ADD COLUMN "lista_data_ativacao" TIMESTAMP;
ALTER TABLE "fato_lista_material_item" ADD COLUMN "lista_inativa" BOOLEAN NOT NULL DEFAULT false;
```
Rodar `npx prisma migrate deploy` + `npx prisma generate`.

- [ ] **Step 2: Builder materializa a ativação (do raw da lista)**

Em `fato-lista-material.ts`: montar um Map `listaId -> { dataAtivacao, inativa }` a partir de `raw_sped_produto_lista_material` (chaves `data_ativacao`, `data_inativacao`; `false`/vazio = null/não-inativa) ANTES da transação, e preencher os 2 campos por item. Teste no `fato-lista-material.test.ts`.

- [ ] **Step 3: E2E**

Rebuild + confirmar que as listas nunca-ativadas (607/lista 1, 1281/lista 161) ficam com `lista_data_ativacao IS NULL`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/worker/fatos/fato-lista-material.ts src/worker/fatos/fato-lista-material.test.ts
git commit -m "W1: materializa ativacao da lista (data_ativacao/inativa) no fato da BOM"
```

### Task W2: `resolverBom` (escolhe a lista ativa, agrega por componente)

**Files:**
- Create: `src/lib/estoque/resolver-bom.ts` + `.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface LinhaBom { componenteProdutoId: number; componenteNome: string | null; quantidade: number; listaId: number | null; listaDataAtivacao: Date | null; listaInativa: boolean; }
  export interface ComponenteResolvido { componenteProdutoId: number; componenteNome: string | null; quantidade: number; }
  /** Dado todas as linhas de BOM de UM kit (varias listas), escolhe a lista ativa e agrega por componente. */
  export function resolverBom(linhas: LinhaBom[]): { componentes: ComponenteResolvido[]; listaEscolhida: number | null; multiplasListas: boolean };
  ```

- [ ] **Step 1: Write the failing test** (casos: 1 lista; 2 listas com uma nunca ativada; 2 listas ativas mesma data → maior lista_id; componente repetido na lista soma quantidade).

- [ ] **Step 2..4: Implement + test + commit**

Regra: descartar `listaInativa`; entre as restantes preferir as com `listaDataAtivacao != null`; escolher a lista de maior `listaDataAtivacao` (desempate maior `listaId`); agregar quantidade por componente dentro da lista escolhida; `multiplasListas=true` quando havia >1 lista candidata.

```bash
git commit -m "W2: resolverBom escolhe a lista ativa e agrega componentes (base do rateio e da Fase 1)"
```

### Task W3: Necessidade de compra usa a BOM resolvida (corrige a duplicação)

**Files:**
- Modify: `src/lib/diretoria/queries/estoque.ts` (montagem do `bomPorPai`, ~1030-1050)

- [ ] **Step 1: Failing test** garantindo que, para um kit com 2 listas (componente compartilhado), a demanda NÃO duplica o componente.
- [ ] **Step 2..4:** trocar a montagem crua de `bomPorPai` (que hoje empilha todas as listas) por `resolverBom` por pai; rodar `npx jest`, E2E do 1281 (POWERMILL) na necessidade de compra sem duplicar; commit.

```bash
git commit -m "W3: necessidade de compra usa a BOM ativa (corrige duplicacao de componente em kits multi-lista)"
```

---

## FRENTE X , Query de composição (compartilhada)

### Task X1: `queryComposicaoKit`

**Files:**
- Create: `src/lib/reports/queries/composicao-kit.ts` + `.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ComponenteComposicao {
    componenteId: number; nome: string | null; quantidade: number;
    precoCusto: number | null; precoVendaPadrao: number | null; precoVendaSmart: number | null;
    valorRateado: number;      // rateio do valor de referencia (em reais)
    percentual: number;        // % do kit
    semPreco: boolean;         // sinaliza componente sem custo nem venda
  }
  export interface ComposicaoKit {
    kitId: number; kitNome: string | null; ehMatrix: boolean;
    valorReferencia: number;   // valor usado para ratear (ver base)
    baseValor: "venda_real_media" | "preco_tabela_padrao" | "preco_tabela_smart";
    componentes: ComponenteComposicao[];
    multiplasListas: boolean; coberturaCompleta: boolean;  // false se algum componente sem preco
  }
  export function queryComposicaoKit(prisma, kitId: number, opts?: { base?: ... }): Promise<ComposicaoKit | null>;
  ```

- [ ] **Steps:** buscar o kit (unidade "kit"); `resolverBom` para os componentes; custo/venda de cada (`fato_produto` + `fato_preco` tab 3/5); valor de referência = média do `vr_produtos/quantidade` das vendas reais do kit (fallback preço de tabela do kit); `desmembrarValor` sobre os pesos de custo (fallback venda de tabela); montar % e flags. Teste com mock cobrindo Matrix (estrutura vs painel) e componente sem preço. Commit.

```bash
git commit -m "X1: queryComposicaoKit (rateio do valor de venda por componente, custo+tabelas, cobertura honesta)"
```

---

## FRENTE Y , Painel na Diretoria (UI, ui-ux-pro-max)

### Task Y1: Painel de composição de valor dos kits

**Files:**
- Create/Modify: componente em `src/components/diretoria/**` + rota/registro em `src/app/(protected)/diretoria/estoque/**` (ou nova sub-aba)

- [ ] **Step 1: ui-ux-pro-max** para o layout (lista de kits + detalhe de composição: barra estrutura vs painel, tabela de componentes com custo/venda/rateado/%, badge Matrix/acessório, aviso quando cobertura incompleta).
- [ ] **Step 2..: Implement inline** (reuso de DataTable/KpiButton/tokens; sem emoji; dark+light; 375px; estado vazio e "sem preço" acionáveis).
- [ ] **E2E visual:** screenshot dark+light; conferir num kit Matrix (estrutura ~46-80%, painel 14-25%) e num acessório.

```bash
git commit -m "Y1: painel de composicao de valor dos kits na Diretoria (estrutura vs painel, honesto)"
```

---

## FRENTE Z , Tools do Nex + BI

### Task Z1: Tool `estoque_composicao_kit`

**Files:**
- Create: `mcp/tools/estoque/composicao-kit.ts` + registro (`index.ts`, `mcp/catalog/index.ts`, `tool-triggers.data.ts`)
- Modify: `src/lib/agent/bi-schema-reference.ts`, `src/lib/agent/router/domain-vocabulary.ts`

- [ ] **Steps:** tool que recebe um kit (nome/id) e devolve a composição (`queryComposicaoKit`), com resposta humanizada ("o kit X é composto por: estrutura R$ N (P%), painel R$ M (Q%)..."). BI schema documenta `fato_lista_material_item` + preços. Vocabulário: "do que é feito o kit", "composição do kit", "quanto vale a estrutura/painel". Rebuild mcp. Commit.

```bash
git commit -m "Z1: tool composicao_kit do Nex + BI schema + vocabulario (4a ponta)"
```

---

## Verificação final da onda (perícia do PLAN 3)

- [ ] `npx tsc --noEmit` e `npx jest` verdes.
- [ ] E2E real: composição de um kit Matrix (estrutura vs painel, painel 14-25%) e de um acessório batem com o cache; kit com componente sem preço mostra o buraco.
- [ ] **BOM dupla corrigida:** necessidade de compra do 1281 não duplica componente.
- [ ] **4 pontas:** o mesmo rateio na Diretoria (painel) e no Nex (tool); função/query compartilhadas.
- [ ] Perícia da onda (subagente): rateio fecha soma exata; fallback correto; sem travessão; sem invariante quebrado (aAtenderDoItem intacto); honestidade do dado (margem não vendida como exata).
- [ ] STATUS/HISTORY atualizados. Relatório ao dono: "painel vale 14-25%, não zero"; gaps de cliente/período documentados.

## Pontos abertos para a review adversarial #1

1. **Base do valor de referência:** média das vendas reais do kit, ou última venda, ou preço de tabela? A média mistura descontos de eras diferentes. Definir o mais honesto e útil para o painel.
2. **Peso do rateio:** custo (reproduz "estrutura leva o valor") vs preço de venda de tabela. O doc-mãe recomenda custo; confirmar e tratar componente sem custo (fallback venda).
3. **Onde na Diretoria:** sub-aba nova em Estoque, ou bloco no catálogo montável? Menor atrito e consistência.
4. **W3 risco:** mudar o `bomPorPai` da necessidade de compra pode alterar números da Fase 1 já validada , garantir que só muda os 3 kits multi-lista (E2E).
5. **Fallback de valor de referência** quando o kit nunca foi vendido (sem `vr_produtos`): usar preço de tabela do kit; se o kit não tem preço, marcar sem-referência.
