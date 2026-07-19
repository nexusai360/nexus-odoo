# PLAN 3 , Composição de valor dos kits (Fase 2: rateio + painel + tools)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps com checkbox (`- [ ]`). UI sempre inline com `ui-ux-pro-max`.

**Versão:** v3 (FINAL , reviews #1 e #2 aplicadas; pronto para execução TDD)

**Mudanças v2 → v3 (após review #2):**
- **[MÉDIA] Contradição interna corrigida:** Goal/Architecture/Achado #1 agora dizem base = **preço de tabela** (venda real é visão SECUNDÁRIA, n>=5, mediana), coerente com X1 e as decisões fechadas. Insight da review: o **percentual estrutura/painel é INVARIANTE à base** (só depende dos pesos de custo); a base muda só o R$ absoluto. A manchete "painel vale X%" é robusta às duas bases.
- **[MÉDIA] `resolverBom` , buraco all-inactive fechado:** em multi-lista, se TODAS as listas forem inativas, `pool` cai para TODAS as listas (nunca vazio). Nunca retorna `componentes: []` com `linhas.length>0`. (Latente: nenhum kit vivo cai nisso hoje, mas fecha a classe de bug.)
- **[MÉDIA] Decomposição:** X1 vira X1a-d (tasks/commits reais); Z1 vira Z1a-c.
- **[BAIXA] Enum/interface:** `baseValor: "venda_real_mediana" | "preco_tabela_padrao" | "preco_tabela_smart" | "sem_referencia"`; interface ganha `nVendas`. Estado `sem_referencia` para os ~9% kits sem tabela nem venda.
- **[BAIXA] Travessão do ERP:** `unidade_nome`/`familia_nome` no cache contêm em-dash ("unid — Unidade"); sanitizar na exibição (painel e tool) para não furar a regra "sem travessão".
- **[BAIXA] Lista única INATIVADA** (só o kit 580, que é "unid" → não chega a nenhum consumidor, impacto vivo zero): manter "passa reto", mas adicionar teste do ramo e, se um dia um produto "kit" tiver a única BOM inativada, expor flag "BOM inativada no ERP".
- **Números alinhados:** 12 kits (não 17) têm componente sem custo E sem venda (perdem o % rateado); 123/135 mantêm. O "17" era sem preço de venda; o guard usa custo-nem-venda.

**Mudanças v1 → v2 (após review #1):**

**Mudanças v1 → v2 (após review #1, que pegou 2 regressões ALTA):**
- **[ALTA] `resolverBom` NÃO pode zerar kits de lista única.** Medido: 18 kits de lista única têm a lista nunca-ativada (17) ou inativada (1); a regra "preferir data_ativacao != null" os zeraria e eles sumiriam da necessidade de compra (regressão da Fase 1 além dos 3 kits multi-lista). Correção: **a escolha por ativação só se aplica quando o kit tem MÚLTIPLAS listas.** Kit de lista única passa reto (BOM idêntica à de hoje), independentemente de ativação. `resolverBom` nunca retorna `componentes: []` quando existem linhas. E2E do W3 verifica que os 131 kits de lista única ficam com a MESMA contagem de componentes de hoje.
- **[ALTA] Valor de referência do rateio: liderar por TABELA, não por média de vendas.** Só 55/135 kits (40,7%) têm venda com `vr_produtos>0`, e a média é robusta em ~27; média sobre 1-3 vendas engana. Base padrão do painel = **preço de venda de tabela** (Venda Padrão, cobre 90,7% dos kits). "Valor de venda real" vira visão SECUNDÁRIA, só quando n de vendas é suficiente (>=5), usando **mediana** (não média) e **expondo o n** na tela ("baseado em N vendas"). Declarar a cobertura (55/135 e a distribuição de n) na honestidade.
- **[MÉDIA] Componente sem preço (peso 0) não pode inflar os demais.** Quando a cobertura é incompleta, NÃO ratear 100%: reservar a fatia dos componentes sem preço como "não atribuído (R$ ?)" e ratear só o restante, deixando o buraco visível NO NÚMERO, não só num badge. `desmembrarValor` ganha um sinal de "sem peso" por componente.
- **[MÉDIA] Builder W1:** explicitar que é uma QUERY NOVA ao header `raw_sped_produto_lista_material` (o builder hoje lê só `raw_sped_produto_lista_material_item`). Sem ela, a ativação vem toda NULL.
- **[MÉDIA] Decomposição:** Y1 quebrado em Y1..Y5; X1 e Z1 em sub-tasks.
- **[BAIXA] Contrato reais↔centavos:** X1 converte `reais*100` (round) na entrada de `desmembrarValor` e `/100` na saída. Explícito.
- **[BAIXA] Desempate arbitrário** (431, 21287: duas listas válidas iguais) declarado como chute (maior lista_id), não verdade do ERP. Referência ao invariante corrigida: o invariante da Fase 1 é `saldoKitMontado` (não "aAtenderDoItem").
- **4 pontas:** esclarecido , a entrega é Diretoria (painel) + Nex (tool) consumindo a MESMA `queryComposicaoKit`; Relatórios 1.0/2.0 herdam a query quando ganharem um relatório de kit (não há hoje; não inventar), documentado.

**Goal:** Substituir o método manual de Excel do time (que "joga o valor todo na estrutura e zera o painel") por um rateio honesto no sistema: distribuir o valor de venda de um kit entre seus componentes, proporcional ao custo, e mostrar isso num **painel de composição de valor dos kits** na Diretoria + **tool(s) do Nex**. Fiel à reunião (transcrição §3-4).

**Architecture:** Fonte da verdade = ERP Odoo. **Valor a ratear (base) = preço de venda de TABELA do kit** (Venda Padrão, cobre 90,7%); valor real de venda (`fato_pedido_item.vr_produtos`) é visão SECUNDÁRIA só quando n>=5 vendas (mediana). Pesos = `preco_custo` do componente (fallback preço de venda de tabela). Rateio proporcional com fechamento por maior resto (soma exata). O **percentual estrutura/painel é invariante à base** (só depende dos pesos de custo). Resolve o bug de kits com múltiplas BOMs (corrige a Fase 1). NÃO persegue preço por cliente/período/série (campos vazios na Tauga, fora da reunião , ver perícia).

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

1. **Base do valor a ratear = preço de venda de tabela do kit** (Venda Padrão, 90,7%). Valor real de venda (`fato_pedido_item.vr_produtos`, filtrar `=0`) é visão SECUNDÁRIA só com n>=5 (mediana); cobre 55/135 kits, robusto em ~27. Média de 1-3 vendas engana.
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

Em `fato-lista-material.ts`: hoje o builder lê só `raw_sped_produto_lista_material_item` (os ITENS). **Adicionar uma QUERY NOVA ao header** `raw_sped_produto_lista_material` (`SELECT data FROM ...`, indexar por `odoo_id`), montar um Map `listaId -> { dataAtivacao, inativa }` (chaves `data_ativacao`, `data_inativacao`; `'false'`/vazio = null / não-inativa) ANTES da transação, e preencher os 2 campos por item (join `item.lista_id = header.odoo_id`, FK validada 139/139). Teste no `fato-lista-material.test.ts`.

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

- [ ] **Step 1: Write the failing tests** , casos CRÍTICOS:
  - **kit de lista única NUNCA ativada mantém a BOM** (não zera) , protege os 18 kits.
  - kit de lista única normal: BOM idêntica.
  - 2 listas, uma nunca ativada → escolhe a ativada (607, 1281).
  - 2 listas ativas mesma data → maior `listaId` (431, 21287), com `multiplasListas=true`.
  - componente repetido dentro da lista escolhida → soma quantidade.

- [ ] **Step 2..4: Implement + test + commit**

Regra CORRIGIDA (review #1): **a escolha por ativação só se aplica quando há >1 lista distinta.**
```
listas = distinct(linhas.listaId)
se listas.length <= 1:
    componentes = agregaPorComponente(TODAS as linhas)   # passa reto, idêntico à Fase 1
    return { componentes, listaEscolhida: listas[0] ?? null, multiplasListas: false }
# múltiplas listas: escolher UMA
candidatas = listas.filter(nao inativa)                  # descarta data_inativacao preenchida
se candidatas vazio: candidatas = listas                 # all-inactive: usa todas (nunca vazio)
ativadas = candidatas.filter(listaDataAtivacao != null)
pool = ativadas.length ? ativadas : candidatas           # NUNCA vazio
escolhida = pool ordenado por (listaDataAtivacao desc, listaId desc)[0]
componentes = agregaPorComponente(linhas da escolhida)
return { componentes, listaEscolhida: escolhida, multiplasListas: true }
```
NUNCA retornar `componentes: []` quando `linhas.length > 0`. Desempate por `listaId` é declarado chute (não verdade do ERP) para 431/21287.

```bash
git commit -m "V2/W2: resolverBom escolhe lista ativa SO em multi-lista (lista unica passa reto, sem zerar)"
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
    baseValor: "preco_tabela_padrao" | "preco_tabela_smart" | "venda_real_mediana" | "sem_referencia";
    nVendas: number;           // n de vendas reais (para a visao secundaria; 0 se base=tabela)
    componentes: ComponenteComposicao[];
    multiplasListas: boolean; coberturaCompleta: boolean;  // false se algum componente sem custo NEM venda
    // sanitizar em dash do ERP (unidade_nome "unid — Unidade") na exibicao
  }
  export function queryComposicaoKit(prisma, kitId: number, opts?: { base?: ... }): Promise<ComposicaoKit | null>;
  ```

- [ ] **Steps (decompor: X1a busca+resolverBom; X1b precos; X1c valor-referencia; X1d rateio+flags):**
  - Buscar o kit (unidade "kit"); `resolverBom` para os componentes.
  - Custo/venda de cada: `fato_produto.preco_custo`/`preco_venda` + `fato_preco` (tab 3 Venda Padrão, 5 Venda Smart).
  - **Valor de referência (corrigido, review #1): base padrão = preço de venda de TABELA do kit** (Venda Padrão; cobre 90,7%). Base secundária "venda real" só quando o kit tem **>=5 vendas** (`vr_produtos>0`), usando **MEDIANA** e expondo o **n** (`baseValor`, `nVendas`). Nunca liderar por média de 1-3 vendas.
  - **Rateio (contrato em centavos):** `desmembrarValor(Math.round(valorReferencia*100), pesos)`, pesos = `quantidade × preco_custo` do componente; saída `/100` → reais.
  - **Componente sem preço (peso 0), honestidade:** se algum componente não tem custo NEM venda, `coberturaCompleta=false` e o rateio do valor de venda NÃO é exibido como % do kit (seria enganoso, os precificados absorveriam 100%). Nesse caso exibir por componente o custo e o preço de tabela DIRETOS, com aviso "N componentes sem preço , rateio do valor indisponível". Só ratear o valorReferencia quando `coberturaCompleta`.
  - Teste com mock: Matrix (estrutura vs painel, cobertura completa), acessório, e kit com componente sem preço (checar que não infla). Commit.

```bash
git commit -m "X1: queryComposicaoKit (rateio do valor de venda por componente, custo+tabelas, cobertura honesta)"
```

---

## FRENTE Y , Painel na Diretoria (UI, ui-ux-pro-max)

### Task Y1: Painel de composição de valor dos kits

**Files:**
- Create/Modify: componente em `src/components/diretoria/**` + rota/registro em `src/app/(protected)/diretoria/estoque/**` (ou nova sub-aba)

Decompor (review #1) em: **Y1** design ui-ux-pro-max; **Y2** componente de detalhe de composição (barra estrutura vs painel, tabela custo/venda/rateado/%, badge Matrix/acessório, aviso cobertura incompleta); **Y3** lista/seleção de kit; **Y4** rota/registro na Diretoria (Estoque); **Y5** estados (vazio/erro/sem-preço) + E2E visual dark+light.
- [ ] **Y1: ui-ux-pro-max** (OBRIGATÓRIO antes de tocar UI).
- [ ] **Y2-Y4: Implement inline** (reuso de DataTable/KpiButton/tokens; sem emoji; dark+light; 375px).
- [ ] **Y5: estados + E2E visual:** screenshot dark+light; conferir num kit Matrix (estrutura vs painel 14-25%) e num acessório; kit com componente sem preço mostra o aviso.

```bash
git commit -m "Y1: painel de composicao de valor dos kits na Diretoria (estrutura vs painel, honesto)"
```

---

## FRENTE Z , Tools do Nex + BI

### Task Z1: Tool `estoque_composicao_kit`

**Files:**
- Create: `mcp/tools/estoque/composicao-kit.ts` + registro (`index.ts`, `mcp/catalog/index.ts`, `tool-triggers.data.ts`)
- Modify: `src/lib/agent/bi-schema-reference.ts`, `src/lib/agent/router/domain-vocabulary.ts`

Decompor (review #2): **Z1a** tool `estoque_composicao_kit` (usa `queryComposicaoKit`, resposta humanizada "o kit X: estrutura R$ N (P%), painel R$ M (Q%)...", sanitiza em dash) + registro (index/catalog/triggers); **Z1b** BI schema (`fato_lista_material_item` + preços); **Z1c** vocabulário ("do que é feito o kit", "composição do kit", "quanto vale a estrutura/painel") + rebuild mcp. Commit por sub-task.

```bash
git commit -m "Z1: tool composicao_kit do Nex + BI schema + vocabulario (4a ponta)"
```

---

## Verificação final da onda (perícia do PLAN 3)

- [ ] `npx tsc --noEmit` e `npx jest` verdes.
- [ ] E2E real: composição de um kit Matrix (estrutura vs painel, painel 14-25%) e de um acessório batem com o cache; kit com componente sem preço mostra o buraco.
- [ ] **BOM dupla corrigida:** necessidade de compra do 1281 não duplica componente.
- [ ] **4 pontas:** o mesmo rateio na Diretoria (painel) e no Nex (tool); função/query compartilhadas.
- [ ] Perícia da onda (subagente): rateio fecha soma exata; fallback correto; sem travessão; Fase 1 intacta nos 131 kits de lista única (invariante `saldoKitMontado` preservado); honestidade do dado (margem não vendida como exata; componente sem preço não infla).
- [ ] STATUS/HISTORY atualizados. Relatório ao dono: "painel vale 14-25%, não zero"; gaps de cliente/período documentados.

## Decisões fechadas (v2, pela review #1)

- **Valor de referência:** base = **preço de venda de tabela** (Venda Padrão, 90,7%); "venda real" só como visão secundária com n>=5 e MEDIANA + n exposto.
- **Peso do rateio:** **custo** (`quantidade × preco_custo`); componente sem custo → cobertura incompleta, rateio de valor não exibido como % (mostra custo/tabela diretos).
- **W3:** `resolverBom` só escolhe lista quando multi-lista; lista única passa reto (18 kits protegidos). E2E confirma 131 kits de lista única intactos.
- **Contrato centavos:** `Math.round(reais*100)` entra, `/100` sai.
- **Desempate 431/21287:** maior `listaId` (chute declarado, não verdade do ERP).

## Pontos abertos para a review adversarial #2

1. **Onde na Diretoria:** sub-aba nova em Estoque vs bloco no catálogo montável , definir o de menor atrito.
2. **Fallback de valor de referência** quando o kit não tem preço de tabela NEM venda: marcar `sem-referencia` e mostrar só custo por componente.
3. **Coerência da mediana:** confirmar que a mediana de venda real (visão secundária) e o preço de tabela (base) não se contradizem na tela de forma confusa , decidir a hierarquia visual.
4. **Y (UI):** confirmar a decomposição Y1-Y5 e o reuso de componentes existentes (não criar DataTable/Card novos).
