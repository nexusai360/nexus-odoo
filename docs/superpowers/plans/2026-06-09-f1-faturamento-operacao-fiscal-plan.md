# Fase 1 , Tabela de Regras + Faturamento por Operação Fiscal , Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Versão: **v3** (pós 2 reviews adversariais , fiscal + arquitetura, ambas validadas no dado real). Pronto para execução.
> Base: SPEC v3 `docs/superpowers/specs/2026-06-09-f1-faturamento-operacao-fiscal-design.md`.
> Perícia: `docs/superpowers/research/2026-06-09-pericia-faturamento-consolidado.md`.

## 0. Mudanças aplicadas das 2 reviews do plano (rastreabilidade)

**Review fiscal (validada no cache real `nexus`/`nexus_odoo_l1`):**
- Credenciais de TODA query estavam erradas (`postgres`/`nexus_odoo`). Corrigido para `-U nexus -d nexus_odoo_l1` (Tasks 9, 10). DB real confirmado no `docker-compose.yml`.
- `6932` (serviço de transporte, R$ 160.580) caía em `remessa` pela regex de serviço cobrir só `933`. Corrigido: mapa `5932/6932`→`servico` + regex `93[23]` (Tasks 3, 4) + teste (Task 5).
- `5949/6949` ("Outra saída", R$ 11,78 mi) caía em `remessa` (substância errada). Corrigido: const `OUTRAS` + mapa `5949/6949`→`outras` (Task 3) + teste (Task 5).
- `5918/6918` (devolução de consignação, R$ 13,9k) caía em `remessa`. Corrigido: mapa →`devolucao_compra` (Task 3) + teste (Task 5).
- Número de reconciliação produto×nota: real **R$ 113.198,89 / 0,006%** (não "0,06%"). Corrigido na Decisão 3 e RADAR. (O delta de base da tool `item.vrNf`→`item.vrProdutos` é outro número, **R$ 28.432,83 / 0,0015%**, confirmado e correto , Decisão 6.)

**Review arquitetura (validada no código real):**
- Destino do teste do formatador cravado: `mcp/lib/responder.test.ts` (existe) , removida a bifurcação "criar novo" (Task 8).
- `sem_cfop` confirmado no union `CategoriaGerencial` e em `ROTULO_CATEGORIA` (Task 1); `sem_cfop ∈ totalNaoReceita` documentado (Task 6).
- `Number()` na conversão `Decimal`→number confirmado no `groupBy` dos itens (Task 6 já o faz); reforçado em comentário.
- Contrato do formatador validado: `calcularExtras` repassa `_DESTAQUE` íntegro ao stub e `_RESPOSTA = fmt(stub)` é o que vai ao LLM; `topLinhasJson` (string) sobrevive ao `Record<string,string|number>`. Sem bloqueio.
- `humanizeName` removido do formatador (rótulos já vêm limpos; evita mutilar "5102 - Venda...") , Task 8 + teste modo cfop.

**Goal:** Evoluir a tool/métrica existente `fiscal_faturamento_por_cfop` para classificar o faturamento de saída por **operação fiscal** (CFOP cru e categoria gerencial), com flag `ehReceita` que separa venda real de movimentação que não é receita, sustentada por uma **Tabela de Regras** parametrizável e versionada.

**Architecture:** Nova camada de dado puro em `src/lib/fiscal/regras/` (tipos + mapa curado de CFOP + fallback por prefixo + classificador), sem dependência de Prisma. A métrica `faturamentoPorCfop` passa a usar `groupBy` por `cfopId` sobre `vr_produtos`, classifica cada grupo via a Tabela de Regras e agrega por `cfop` ou por `categoria`. A tool mantém o id `fiscal_faturamento_por_cfop` (evolução, não nova tool) e o formatador `fmtFaturamentoPorCfop` ganha as duas ramificações. Tudo TDD; verificação E2E contra o cache real + rebuild do `mcp`.

**Tech Stack:** TypeScript, Prisma (`@prisma/adapter-pg`), Zod, Jest, `@modelcontextprotocol/sdk`.

---

## Decisões de design travadas (resolvem ambiguidades antes da execução)

1. **MAPA vs PREFIXO.** O `MAPA_CFOP` enumera os CFOPs curados de alto valor/risco (venda, exportação, serviço, transferência, devolução, venda de ativo, simples faturamento, bonificação). Grupos numerosos e de baixo risco (remessa/retorno `x90x..x94x`, entrada anômala `1xxx/2xxx`) ficam no **fallback por prefixo**, não enumerados. Precedência: **mapa vence o prefixo**; prefixo vence o fallback conservador.

2. **Contrato do formatador (CRÍTICO).** O formatador LIVE só enxerga `env._DESTAQUE` / `env._agregado` (comprovado em `mcp/lib/responder.ts:1566` , `calcularExtras` monta um stub sem as linhas reais). Logo o novo `fmtFaturamentoPorCfop` lê **tudo de `_DESTAQUE`**, incluindo uma string JSON `topLinhasJson` (top 8 linhas `{rotulo, valor, ehReceita}`) que a tool serializa. Não passamos `titulos` (dispararia `topPorParticipante` com shape errado).

3. **Reconciliação produto×nota.** Compara `Σ item.vrProdutos` (base da métrica) com `Σ nota.vrProdutos` do cabeçalho (`fato_nota_fiscal`), no mesmo `where`. Diferença real medida = **R$ 113.198,89 / 0,006%** (item R$ 1.858.733.003,84 vs cabeçalho R$ 1.858.846.202,73). A observação é calibrada como "fecha por tolerância", **não** vendida como achado grande. (A `observacao` da métrica é gerada dinamicamente com `pct.toFixed(2)`, então acompanha o dado.)

4. **`deduzReceita` é informativo na F1.** Entra no tipo e no mapa, mas a métrica F1 **não subtrai** nada por ele (uso real na Fase 3 / ponte). Só `ehReceita` define `totalReceita`.

5. **`sem_cfop`.** Grupo `cfopId === null` vira linha própria categoria `sem_cfop` (≈ R$ 23,3 mi) **e** alimenta `_DESTAQUE.semCfopValor` para o aviso de gap. Nunca entra em `outras`.

6. **Base muda de `vrNf` (rateado) para `vrProdutos`.** Delta de base medido no item: **R$ 28.432,83 / 0,0015%** (`Σ item.vrProdutos` − `Σ item.vrNf`). Ínfimo, mas muda número de tool em produção: registrar no RADAR. (Não confundir com a reconciliação produto×nota da Decisão 3, que compara item vs cabeçalho.)

---

## Estrutura de arquivos

**Criar:**
- `src/lib/fiscal/regras/tipos.ts` , `CategoriaGerencial` (union) + `RegraOperacao` (interface). Zero lógica.
- `src/lib/fiscal/regras/extrair-cfop.ts` , `extrairCfop(cfopNome): string | null`. Pura.
- `src/lib/fiscal/regras/cfop-mapa.ts` , `MAPA_CFOP: Record<string, RegraOperacao>` curado.
- `src/lib/fiscal/regras/cfop-prefixo.ts` , `regraPorPrefixo(cfop4): RegraOperacao | null` com precedência fixa.
- `src/lib/fiscal/regras/classificar.ts` , `classificarCfop(cfop4: string | null): RegraOperacao`.
- `src/lib/fiscal/regras/index.ts` , API pública (re-exporta tipos + funções + mapa).
- `src/lib/fiscal/regras/__tests__/extrair-cfop.test.ts`
- `src/lib/fiscal/regras/__tests__/classificar.test.ts`
- `src/lib/reports/__tests__/e2e/f1-faturamento-operacao-fiscal.e2e.ts` , E2E contra cache real.

**Modificar:**
- `src/lib/metrics/fiscal/faturamento-por-cfop.ts` , evolui a métrica (base `vrProdutos`, `agruparPor`, categorias, reconciliação, semCfop).
- `src/lib/metrics/fiscal/faturamento-por-cfop.test.ts` , atualiza os testes da métrica para o novo shape.
- `mcp/tools/fiscal/faturamento-por-cfop.ts` , input `agruparPor`, novo `dados`, `_DESTAQUE` com `topLinhasJson` + aviso de gap.
- `mcp/lib/responder.ts:917` , reescreve `fmtFaturamentoPorCfop` (duas ramificações + lista + receita + reconciliação). **Compartilhado: editar inline.**
- `mcp/catalog/tool-triggers.data.ts:76` , acrescenta os triggers de "operação fiscal/categoria".
- `docs/RADAR.md` , registra a mudança de base (`vrNf`→`vrProdutos`).

---

## Task 1: Tipos da Tabela de Regras

**Files:**
- Create: `src/lib/fiscal/regras/tipos.ts`

- [ ] **Step 1: Escrever os tipos (não há teste , é só declaração de tipo)**

```ts
// src/lib/fiscal/regras/tipos.ts
// Tabela de Regras fiscal , DADO e CONTRATO (zero logica). Reusada pelas Fases 2-4.

/** Categoria gerencial de uma operacao fiscal, derivada do CFOP. */
export type CategoriaGerencial =
  | "venda"
  | "exportacao"
  | "servico"
  | "transferencia"
  | "devolucao_venda"
  | "devolucao_compra"
  | "remessa"
  | "retorno"
  | "simples_faturamento"
  | "bonificacao"
  | "venda_ativo"
  | "entrada_anomala"
  | "sem_cfop"
  | "outras";

/** Regra de classificacao de uma operacao fiscal. */
export interface RegraOperacao {
  categoria: CategoriaGerencial;
  /** Entra no faturamento de mercadoria/servico do grupo? */
  ehReceita: boolean;
  /** F1: INFORMATIVO (nao subtrai aqui). Usado na ponte/Fase 3. */
  deduzReceita: boolean;
  /** Movimenta estoque fisico? */
  afetaEstoque: boolean;
  /** FUTURO (Fase 2): marcar intragrupo quando o participante e do grupo. */
  ehIntercompanySeGrupo: boolean;
}

/** Rotulo legivel por categoria, para UI/formatador. */
export const ROTULO_CATEGORIA: Record<CategoriaGerencial, string> = {
  venda: "Venda",
  exportacao: "Exportacao",
  servico: "Servico",
  transferencia: "Transferencia",
  devolucao_venda: "Devolucao de venda",
  devolucao_compra: "Devolucao de compra",
  remessa: "Remessa",
  retorno: "Retorno",
  simples_faturamento: "Simples faturamento",
  bonificacao: "Bonificacao",
  venda_ativo: "Venda de ativo",
  entrada_anomala: "Entrada anomala",
  sem_cfop: "Sem CFOP",
  outras: "Outras operacoes",
};
```

- [ ] **Step 2: Verificar que compila**

Run: `cd '<repo>' && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i 'regras/tipos' || echo 'tipos OK'`
Expected: `tipos OK` (sem erro de tipo no arquivo novo).

- [ ] **Step 3: Commit**

```bash
git add src/lib/fiscal/regras/tipos.ts
git commit -m "feat(fiscal): tipos da Tabela de Regras (CategoriaGerencial + RegraOperacao)"
```

---

## Task 2: `extrairCfop` (TDD)

**Files:**
- Create: `src/lib/fiscal/regras/extrair-cfop.ts`
- Test: `src/lib/fiscal/regras/__tests__/extrair-cfop.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/fiscal/regras/__tests__/extrair-cfop.test.ts
import { extrairCfop } from "../extrair-cfop";

describe("extrairCfop", () => {
  it("extrai os 4 digitos do inicio do nome com codigo", () => {
    expect(extrairCfop("5102 - Venda de mercadoria adquirida")).toBe("5102");
    expect(extrairCfop("6152 - Transferencia de mercadoria")).toBe("6152");
  });
  it("aceita cfop sem separador e com espacos", () => {
    expect(extrairCfop("  6108  Venda")).toBe("6108");
    expect(extrairCfop("7101")).toBe("7101");
  });
  it("retorna null para nome sem 4 digitos iniciais", () => {
    expect(extrairCfop("Venda de mercadoria")).toBeNull();
    expect(extrairCfop("510 - parcial")).toBeNull();
  });
  it("retorna null para nulo/vazio", () => {
    expect(extrairCfop(null)).toBeNull();
    expect(extrairCfop("")).toBeNull();
    expect(extrairCfop("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/regras/__tests__/extrair-cfop.test.ts`
Expected: FAIL ("Cannot find module '../extrair-cfop'").

- [ ] **Step 3: Implementar**

```ts
// src/lib/fiscal/regras/extrair-cfop.ts
/**
 * Extrai os 4 digitos iniciais de um cfopNome desnormalizado do item, que vem no
 * padrao "5102 - Venda de mercadoria...". Pura, sem dependencia. Retorna null
 * quando nao ha exatamente 4 digitos no inicio (apos trim).
 */
export function extrairCfop(cfopNome: string | null | undefined): string | null {
  if (!cfopNome) return null;
  const m = cfopNome.trim().match(/^(\d{4})(?!\d)/);
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/regras/__tests__/extrair-cfop.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fiscal/regras/extrair-cfop.ts src/lib/fiscal/regras/__tests__/extrair-cfop.test.ts
git commit -m "feat(fiscal): extrairCfop (4 digitos do cfopNome) com testes"
```

---

## Task 3: `MAPA_CFOP` curado

**Files:**
- Create: `src/lib/fiscal/regras/cfop-mapa.ts`

> O mapa é dado curado do Apêndice A da SPEC v3 (validado no dado real). Usa um helper
> `mapear(lista, regra)` para DRY (uma regra aplicada a vários CFOPs), mantendo 1 linha
> lógica por CFOP. **A Task 9 (curadoria contra o cache real) revisa este mapa com o
> `SELECT DISTINCT cfop_nome` real; nesta task ele nasce do Apêndice A.**

- [ ] **Step 1: Escrever o mapa**

```ts
// src/lib/fiscal/regras/cfop-mapa.ts
import type { RegraOperacao } from "./tipos";

function mapear(lista: string[], regra: RegraOperacao): Record<string, RegraOperacao> {
  const out: Record<string, RegraOperacao> = {};
  for (const cfop of lista) out[cfop] = regra;
  return out;
}

const VENDA: RegraOperacao = { categoria: "venda", ehReceita: true, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: true };
const EXPORTACAO: RegraOperacao = { categoria: "exportacao", ehReceita: true, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const SERVICO: RegraOperacao = { categoria: "servico", ehReceita: true, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: true };
const TRANSFER_ESTOQUE: RegraOperacao = { categoria: "transferencia", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const TRANSFER_SIMPLES: RegraOperacao = { categoria: "transferencia", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
const DEV_COMPRA: RegraOperacao = { categoria: "devolucao_compra", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const DEV_VENDA: RegraOperacao = { categoria: "devolucao_venda", ehReceita: false, deduzReceita: true, afetaEstoque: true, ehIntercompanySeGrupo: false };
const VENDA_ATIVO: RegraOperacao = { categoria: "venda_ativo", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const SIMPLES_FAT: RegraOperacao = { categoria: "simples_faturamento", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
const BONIFICACAO: RegraOperacao = { categoria: "bonificacao", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const OUTRAS: RegraOperacao = { categoria: "outras", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };

/**
 * Mapa curado de CFOP -> regra. Fonte: Apendice A da SPEC v3 (validado no dado real).
 * `ehReceita` na otica de faturamento de mercadoria/servico do grupo (intercompany e
 * ortogonal, tratado na Fase 2 via ehIntercompanySeGrupo). Grupos numerosos de baixo
 * risco (remessa/retorno, entrada anomala) ficam no fallback por prefixo, nao aqui.
 */
export const MAPA_CFOP: Record<string, RegraOperacao> = {
  // Venda (propria + revenda colapsadas nesta fase , ambas receita).
  ...mapear(["5101", "5102", "6101", "6102", "6107", "6108", "5403", "6403", "5405", "6404"], VENDA),
  // Venda fora do estabelecimento / entrega futura (faturamento da venda , receita).
  ...mapear(["5117", "6117", "5119", "6119", "5120", "6120"], VENDA),
  // Exportacao.
  ...mapear(["7101", "7102", "7105", "7106", "7127", "7949"], EXPORTACAO),
  // Servico (ISSQN + transporte) , receita, nao remessa. 5932/6932 = servico de transporte
  // (review fiscal: 6932 = R$ 160.580 caia em remessa pela regex cobrir so 933).
  ...mapear(["5933", "6933", "5353", "6353", "5301", "6301", "5932", "6932"], SERVICO),
  // Transferencia entre estabelecimentos (movimenta estoque).
  ...mapear(["5151", "5152", "6151", "6152", "5409", "6409"], TRANSFER_ESTOQUE),
  // Transferencia de servico/ativo/credito (sem estoque fisico).
  ...mapear(["5552", "6552", "5557", "6557", "5601", "6601"], TRANSFER_SIMPLES),
  // Devolucao de COMPRA (saida que devolve ao fornecedor) , NAO deduz receita.
  ...mapear(["5202", "5210", "6202", "6210", "5411", "6411", "5209", "6209"], DEV_COMPRA),
  // Devolucao de VENDA (informativo deduz; F1 nao subtrai).
  ...mapear(["1201", "1202", "2202", "1410", "1411", "2410", "2411"], DEV_VENDA),
  // Venda de ativo imobilizado , fora do faturamento de mercadoria.
  ...mapear(["5551", "6551"], VENDA_ATIVO),
  // Entrega futura: simples faturamento (a receita reconhece no x117 da venda).
  ...mapear(["5922", "6922"], SIMPLES_FAT),
  // Bonificacao/brinde/doacao , nao e receita por padrao.
  ...mapear(["5910", "6910"], BONIFICACAO),
  // Devolucao de consignacao (review fiscal: 6918 caia em remessa). Nao e receita.
  ...mapear(["5918", "6918"], DEV_COMPRA),
  // "Outra saida nao especificada" (5949/6949 = R$ 11,78 mi). Lixeira fiscal: NAO e
  // remessa (substancia indefinida). Fica em `outras` com visibilidade, fora da receita.
  ...mapear(["5949", "6949"], OUTRAS),
};
```

- [ ] **Step 2: Verificar compilação**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -i 'cfop-mapa' || echo 'mapa OK'`
Expected: `mapa OK`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fiscal/regras/cfop-mapa.ts
git commit -m "feat(fiscal): MAPA_CFOP curado (Apendice A da spec v3)"
```

---

## Task 4: `regraPorPrefixo` (fallback por grupo, com precedência)

**Files:**
- Create: `src/lib/fiscal/regras/cfop-prefixo.ts`

> Testado junto do classificador na Task 5 (o prefixo é detalhe interno do classificador).
> A precedência é a regra crítica do Achado 1 da review fiscal.

- [ ] **Step 1: Implementar**

```ts
// src/lib/fiscal/regras/cfop-prefixo.ts
import type { RegraOperacao } from "./tipos";

/**
 * Fallback por grupo de CFOP para codigos nao curados no MAPA_CFOP. A ORDEM e
 * critica (primeira que casar vence): entrada > servico > transferencia > ativo >
 * devolucao > simples faturamento > remessa/retorno > venda. Assim 6152
 * (transferencia) nunca cai em venda, e x922 (simples faturamento) nunca vira
 * remessa generica. Recebe o CFOP ja em 4 digitos. Retorna null quando nenhum
 * grupo casa (o classificador aplica entao o fallback conservador "outras").
 */
export function regraPorPrefixo(cfop: string): RegraOperacao | null {
  // 1. Entrada (1xxx/2xxx) aparecendo como saida = anomalia.
  if (/^[12]\d{3}$/.test(cfop)) {
    return { categoria: "entrada_anomala", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
  }
  // 2. Servico (ISSQN 933 + transporte 932) ou faixa 35x. 93[23] cobre 6932 (transporte).
  if (/^[567](93[23]|35\d)$/.test(cfop)) {
    return { categoria: "servico", ehReceita: true, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: true };
  }
  // 3. Transferencia: 15x / 552 / 557 / 601 / 409.
  if (/^[567](15\d|552|557|601|409)$/.test(cfop)) {
    return { categoria: "transferencia", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 4. Venda de ativo: 551.
  if (/^[567]551$/.test(cfop)) {
    return { categoria: "venda_ativo", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 5. Devolucao de compra (saida): 20x / 41x / 21x.
  if (/^[567](20\d|41\d|21\d)$/.test(cfop)) {
    return { categoria: "devolucao_compra", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 6. Simples faturamento (entrega futura): 922.
  if (/^[567]922$/.test(cfop)) {
    return { categoria: "simples_faturamento", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
  }
  // 7. Remessa/retorno: 90x..94x (exceto 922/933 ja tratados acima).
  if (/^[567]9[0-4]\d$/.test(cfop)) {
    return { categoria: "remessa", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 8. Venda (POR ULTIMO): 10x / 40x / 117 / 119 / 120.
  if (/^[567](10\d|40\d|117|119|120)$/.test(cfop)) {
    return { categoria: "venda", ehReceita: true, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: true };
  }
  return null;
}
```

- [ ] **Step 2: Verificar compilação**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -i 'cfop-prefixo' || echo 'prefixo OK'`
Expected: `prefixo OK`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fiscal/regras/cfop-prefixo.ts
git commit -m "feat(fiscal): regraPorPrefixo com precedencia fiscal (entrada>servico>transf>...>venda)"
```

---

## Task 5: `classificarCfop` + `index.ts` (TDD, com regressões fiscais)

**Files:**
- Create: `src/lib/fiscal/regras/classificar.ts`
- Create: `src/lib/fiscal/regras/index.ts`
- Test: `src/lib/fiscal/regras/__tests__/classificar.test.ts`

- [ ] **Step 1: Escrever o teste que falha (inclui as regressões fiscais)**

```ts
// src/lib/fiscal/regras/__tests__/classificar.test.ts
import { classificarCfop } from "../classificar";

describe("classificarCfop , mapa curado", () => {
  it("venda: 5102 e 6108 sao receita", () => {
    expect(classificarCfop("5102")).toMatchObject({ categoria: "venda", ehReceita: true });
    expect(classificarCfop("6108")).toMatchObject({ categoria: "venda", ehReceita: true });
  });
  it("exportacao: 7101 e receita", () => {
    expect(classificarCfop("7101")).toMatchObject({ categoria: "exportacao", ehReceita: true });
  });
});

describe("classificarCfop , regressoes fiscais (review)", () => {
  it("(i) 6152 e TRANSFERENCIA, nao venda, e nao e receita", () => {
    const r = classificarCfop("6152");
    expect(r.categoria).toBe("transferencia");
    expect(r.ehReceita).toBe(false);
  });
  it("(ii) entrega futura nao dobra: 5922 simples_faturamento nao-receita; 5117 venda receita", () => {
    expect(classificarCfop("5922")).toMatchObject({ categoria: "simples_faturamento", ehReceita: false });
    expect(classificarCfop("5117")).toMatchObject({ categoria: "venda", ehReceita: true });
  });
  it("(iii) 6202 e DEVOLUCAO DE COMPRA, nao e receita e NAO deduz na F1", () => {
    const r = classificarCfop("6202");
    expect(r.categoria).toBe("devolucao_compra");
    expect(r.ehReceita).toBe(false);
    expect(r.deduzReceita).toBe(false);
  });
  it("(iv) 5933/6933 sao SERVICO (nao remessa)", () => {
    expect(classificarCfop("5933")).toMatchObject({ categoria: "servico" });
    expect(classificarCfop("6933")).toMatchObject({ categoria: "servico" });
  });
  it("venda de ativo 5551/6551 fora do faturamento de mercadoria", () => {
    expect(classificarCfop("5551")).toMatchObject({ categoria: "venda_ativo", ehReceita: false });
  });
  it("(v) 6932 e SERVICO de transporte (nao remessa), e receita", () => {
    expect(classificarCfop("6932")).toMatchObject({ categoria: "servico", ehReceita: true });
    expect(classificarCfop("5932")).toMatchObject({ categoria: "servico", ehReceita: true });
  });
  it("(vi) 5949/6949 'outra saida' caem em OUTRAS (nao remessa), nao-receita", () => {
    expect(classificarCfop("6949")).toMatchObject({ categoria: "outras", ehReceita: false });
    expect(classificarCfop("5949")).toMatchObject({ categoria: "outras", ehReceita: false });
  });
  it("(vii) 6918 devolucao de consignacao nao vira remessa", () => {
    expect(classificarCfop("6918")).toMatchObject({ categoria: "devolucao_compra", ehReceita: false });
  });
});

describe("classificarCfop , prefixo e fallback", () => {
  it("remessa nao curada cai no prefixo (5908 -> remessa, nao receita)", () => {
    expect(classificarCfop("5908")).toMatchObject({ categoria: "remessa", ehReceita: false });
  });
  it("entrada anomala: 1352 como saida -> entrada_anomala", () => {
    expect(classificarCfop("1352")).toMatchObject({ categoria: "entrada_anomala", ehReceita: false });
  });
  it("desconhecido cai no fallback conservador (outras, nao-receita)", () => {
    expect(classificarCfop("5999")).toMatchObject({ categoria: "outras", ehReceita: false });
  });
  it("null/sem cfop -> sem_cfop, nao-receita", () => {
    expect(classificarCfop(null)).toMatchObject({ categoria: "sem_cfop", ehReceita: false });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/regras/__tests__/classificar.test.ts`
Expected: FAIL ("Cannot find module '../classificar'").

- [ ] **Step 3: Implementar o classificador**

```ts
// src/lib/fiscal/regras/classificar.ts
import type { RegraOperacao } from "./tipos";
import { MAPA_CFOP } from "./cfop-mapa";
import { regraPorPrefixo } from "./cfop-prefixo";

const SEM_CFOP: RegraOperacao = { categoria: "sem_cfop", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
const FALLBACK: RegraOperacao = { categoria: "outras", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };

/**
 * Classifica um CFOP de 4 digitos em uma RegraOperacao. Precedencia:
 * 1) MAPA_CFOP (curado) ; 2) regraPorPrefixo (grupo, ordem fiscal) ;
 * 3) fallback conservador "outras" (na duvida NAO e receita). CFOP nulo/invalido
 * -> sem_cfop (linha propria + alerta de gap na metrica).
 */
export function classificarCfop(cfop: string | null | undefined): RegraOperacao {
  if (!cfop || !/^\d{4}$/.test(cfop)) return SEM_CFOP;
  return MAPA_CFOP[cfop] ?? regraPorPrefixo(cfop) ?? FALLBACK;
}
```

- [ ] **Step 4: Escrever o index público**

```ts
// src/lib/fiscal/regras/index.ts
// API publica da Tabela de Regras fiscal (reusada pelas Fases 2-4).
export type { CategoriaGerencial, RegraOperacao } from "./tipos";
export { ROTULO_CATEGORIA } from "./tipos";
export { extrairCfop } from "./extrair-cfop";
export { MAPA_CFOP } from "./cfop-mapa";
export { regraPorPrefixo } from "./cfop-prefixo";
export { classificarCfop } from "./classificar";
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd '<repo>' && npx jest src/lib/fiscal/regras/__tests__/`
Expected: PASS (todos , extrair-cfop + classificar).

- [ ] **Step 6: Commit**

```bash
git add src/lib/fiscal/regras/classificar.ts src/lib/fiscal/regras/index.ts src/lib/fiscal/regras/__tests__/classificar.test.ts
git commit -m "feat(fiscal): classificarCfop (mapa>prefixo>fallback) + index, com regressoes fiscais"
```

---

## Task 6: Evoluir a métrica `faturamentoPorCfop` (TDD)

**Files:**
- Modify: `src/lib/metrics/fiscal/faturamento-por-cfop.ts`
- Modify: `src/lib/metrics/fiscal/faturamento-por-cfop.test.ts`

> Mantém o nome `faturamentoPorCfop` e o `FaturamentoInput` existente, **acrescentando**
> `agruparPor`. Saída nova. Base muda para `vrProdutos` e usa `groupBy` + helpers de
> período/empresa. Reconciliação soma `vrProdutos` do cabeçalho `fato_nota_fiscal`.

- [ ] **Step 1: Reescrever o teste da métrica (mock prisma)**

```ts
// src/lib/metrics/fiscal/faturamento-por-cfop.test.ts
import { faturamentoPorCfop } from "./faturamento-por-cfop";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma(grupos: unknown[], nomes: unknown[], somaNotaProdutos: number) {
  const groupBy = jest.fn().mockResolvedValue(grupos);
  const findMany = jest.fn().mockResolvedValue(nomes);
  const aggregate = jest.fn().mockResolvedValue({ _sum: { vrProdutos: somaNotaProdutos } });
  const prisma = {
    fatoNotaFiscalItem: { groupBy, findMany },
    fatoNotaFiscal: { aggregate },
  } as unknown as PrismaClient;
  return { prisma, groupBy, findMany, aggregate };
}

describe("faturamentoPorCfop , agruparPor categoria (default)", () => {
  it("agrega CFOPs em categorias, totalReceita exclui nao-receita, semCfop em linha propria", async () => {
    const { prisma } = mockPrisma(
      [
        { cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 4 }, // 5102 venda (receita)
        { cfopId: 2, _sum: { vrProdutos: 700 }, _count: 2 },  // 6152 transferencia (nao-receita)
        { cfopId: 3, _sum: { vrProdutos: 300 }, _count: 1 },  // 5933 servico (receita)
        { cfopId: null, _sum: { vrProdutos: 50 }, _count: 1 }, // sem_cfop
      ],
      [
        { cfopId: 1, cfopNome: "5102 - Venda" },
        { cfopId: 2, cfopNome: "6152 - Transferencia" },
        { cfopId: 3, cfopNome: "5933 - Servico" },
      ],
      2049, // soma vrProdutos do cabecalho (reconciliacao ~ totalProdutos 2050)
    );

    const r = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });

    expect(r.agruparPor).toBe("categoria");
    expect(r.totalProdutos).toBe(2050);
    expect(r.totalReceita).toBe(1300); // venda 1000 + servico 300
    expect(r.totalNaoReceita).toBe(750); // transferencia 700 + semCfop 50
    expect(r.semCfop).toEqual({ totalItens: 1, valorProdutos: 50 });
    // linha de venda existe, marcada receita
    const venda = r.linhas.find((l) => l.chave === "venda");
    expect(venda).toMatchObject({ categoria: "venda", ehReceita: true, valorProdutos: 1000 });
    // reconciliacao
    expect(r.reconciliacao.somaProdutosItens).toBe(2050);
    expect(r.reconciliacao.somaProdutosNotas).toBe(2049);
    expect(r.reconciliacao.diferenca).toBeCloseTo(1, 5);
    // ordenado desc
    expect(r.linhas[0].valorProdutos).toBeGreaterThanOrEqual(r.linhas[1].valorProdutos);
  });
});

describe("faturamentoPorCfop , agruparPor cfop", () => {
  it("uma linha por CFOP, chave = codigo, rotulo = nome limpo", async () => {
    const { prisma, groupBy } = mockPrisma(
      [{ cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 4 }],
      [{ cfopId: 1, cfopNome: "5102 - Venda" }],
      1000,
    );
    const r = await faturamentoPorCfop(prisma, {
      agruparPor: "cfop",
      periodoDe: "2026-01-01",
      periodoAte: "2026-01-31",
      empresaId: 7,
    });
    expect(r.linhas[0]).toMatchObject({ chave: "5102", categoria: "venda", ehReceita: true, valorProdutos: 1000 });
    // where correto: saida autorizada, periodo, empresa, base vrProdutos
    const arg = groupBy.mock.calls[0][0];
    expect(arg._sum.vrProdutos).toBe(true);
    expect(arg.where.entradaSaida).toBe("1");
    expect(arg.where.situacaoNfe).toBe("autorizada");
    expect(arg.where.empresaId).toBe(7);
    expect(arg.where.dataEmissao).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd '<repo>' && npx jest src/lib/metrics/fiscal/faturamento-por-cfop.test.ts`
Expected: FAIL (shape antigo: `r.agruparPor` undefined, `_sum.vrProdutos` não existe).

- [ ] **Step 3: Reescrever a métrica**

```ts
// src/lib/metrics/fiscal/faturamento-por-cfop.ts
import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { classificarCfop, extrairCfop, ROTULO_CATEGORIA } from "../../fiscal/regras";
import type { CategoriaGerencial } from "../../fiscal/regras";

export interface FaturamentoOperacaoInput extends FaturamentoInput {
  /** 'categoria' (default) agrega por categoria gerencial; 'cfop' lista por CFOP. */
  agruparPor?: "cfop" | "categoria";
}

export interface OperacaoLinha {
  chave: string; // "5102" (cfop) ou "venda" (categoria)
  rotulo: string; // nome limpo do CFOP ou rotulo da categoria
  categoria: CategoriaGerencial;
  ehReceita: boolean;
  totalItens: number;
  valorProdutos: number;
}

export interface Reconciliacao {
  somaProdutosItens: number;
  somaProdutosNotas: number;
  diferenca: number;
  observacao: string;
}

export interface FaturamentoPorCfopResultado {
  agruparPor: "cfop" | "categoria";
  linhas: OperacaoLinha[];
  total: number; // numero de linhas (full-set, antes do limit)
  totalProdutos: number;
  totalReceita: number;
  totalNaoReceita: number;
  semCfop: { totalItens: number; valorProdutos: number };
  reconciliacao: Reconciliacao;
}

interface GrupoClassificado {
  cfop4: string | null;
  categoria: CategoriaGerencial;
  ehReceita: boolean;
  rotuloCfop: string; // nome limpo do CFOP (ou "Sem CFOP")
  totalItens: number;
  valorProdutos: number;
}

/**
 * FATURAMENTO POR OPERACAO FISCAL. Base = item.vrProdutos (escolha do usuario;
 * difere do vr_nf rateado em ~0,0015%). groupBy nativo por cfopId, classificacao
 * em memoria via Tabela de Regras (src/lib/fiscal/regras). Saida em dois modos:
 * por categoria gerencial (default) ou por CFOP cru. totalReceita soma so ehReceita.
 * Reconcilia a soma dos itens com o vrProdutos do cabecalho (fato_nota_fiscal).
 */
export async function faturamentoPorCfop(
  prisma: PrismaClient,
  input: FaturamentoOperacaoInput,
): Promise<FaturamentoPorCfopResultado> {
  const agruparPor = input.agruparPor ?? "categoria";
  const where: Prisma.FatoNotaFiscalItemWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };

  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["cfopId"],
    _sum: { vrProdutos: true },
    _count: true,
    where,
  });

  const ids = grupos.map((g) => g.cfopId).filter((x): x is number => x !== null);
  const nomeRows = ids.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { cfopId: { in: ids } },
        select: { cfopId: true, cfopNome: true },
        distinct: ["cfopId"],
      })
    : [];
  const nomePorId = new Map(nomeRows.map((r) => [r.cfopId, r.cfopNome]));

  // Classifica cada grupo via Tabela de Regras.
  const classificados: GrupoClassificado[] = grupos.map((g) => {
    const cfopNome = g.cfopId === null ? null : (nomePorId.get(g.cfopId) ?? null);
    const cfop4 = extrairCfop(cfopNome);
    const regra = classificarCfop(cfop4);
    return {
      cfop4,
      categoria: regra.categoria,
      ehReceita: regra.ehReceita,
      rotuloCfop: cfop4 ? (cfopNome ?? cfop4) : "Sem CFOP",
      totalItens: g._count,
      valorProdutos: Number(g._sum.vrProdutos ?? 0),
    };
  });

  // sem_cfop tem ehReceita=false, entao esta DENTRO de totalNaoReceita; semCfop e um
  // subconjunto destacado dele. Invariante: totalReceita + totalNaoReceita === totalProdutos.
  const totalProdutos = classificados.reduce((s, c) => s + c.valorProdutos, 0);
  const totalReceita = classificados.filter((c) => c.ehReceita).reduce((s, c) => s + c.valorProdutos, 0);
  const totalNaoReceita = totalProdutos - totalReceita;

  const semCfopGrupo = classificados.filter((c) => c.categoria === "sem_cfop");
  const semCfop = {
    totalItens: semCfopGrupo.reduce((s, c) => s + c.totalItens, 0),
    valorProdutos: semCfopGrupo.reduce((s, c) => s + c.valorProdutos, 0),
  };

  // Monta as linhas conforme o modo.
  let linhas: OperacaoLinha[];
  if (agruparPor === "cfop") {
    linhas = classificados.map((c) => ({
      chave: c.cfop4 ?? "sem_cfop",
      rotulo: c.rotuloCfop,
      categoria: c.categoria,
      ehReceita: c.ehReceita,
      totalItens: c.totalItens,
      valorProdutos: c.valorProdutos,
    }));
  } else {
    const porCategoria = new Map<CategoriaGerencial, OperacaoLinha>();
    for (const c of classificados) {
      const atual = porCategoria.get(c.categoria);
      if (atual) {
        atual.totalItens += c.totalItens;
        atual.valorProdutos += c.valorProdutos;
      } else {
        porCategoria.set(c.categoria, {
          chave: c.categoria,
          rotulo: ROTULO_CATEGORIA[c.categoria],
          categoria: c.categoria,
          ehReceita: c.ehReceita,
          totalItens: c.totalItens,
          valorProdutos: c.valorProdutos,
        });
      }
    }
    linhas = [...porCategoria.values()];
  }
  linhas.sort((a, b) => b.valorProdutos - a.valorProdutos);
  const total = linhas.length;

  // Reconciliacao: soma vrProdutos do cabecalho no mesmo where (sem cfop no header).
  const headerWhere: Prisma.FatoNotaFiscalWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const headerAgg = await prisma.fatoNotaFiscal.aggregate({ _sum: { vrProdutos: true }, where: headerWhere });
  const somaProdutosNotas = Number(headerAgg._sum.vrProdutos ?? 0);
  const diferenca = totalProdutos - somaProdutosNotas;
  const pct = somaProdutosNotas !== 0 ? (Math.abs(diferenca) / somaProdutosNotas) * 100 : 0;
  const reconciliacao: Reconciliacao = {
    somaProdutosItens: totalProdutos,
    somaProdutosNotas,
    diferenca,
    observacao: `Soma dos itens e do cabecalho fecham por tolerancia (diferenca de ${pct.toFixed(2)}%).`,
  };

  // Paginacao do full-set (apos ordenar).
  if (input.limit !== undefined) {
    const off = input.offset ?? 0;
    linhas = linhas.slice(off, off + input.limit);
  }

  return { agruparPor, linhas, total, totalProdutos, totalReceita, totalNaoReceita, semCfop, reconciliacao };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd '<repo>' && npx jest src/lib/metrics/fiscal/faturamento-por-cfop.test.ts`
Expected: PASS (ambos os describes).

- [ ] **Step 5: Verificar tsc (a métrica é importada pela tool)**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -iE 'faturamento-por-cfop|fiscal/regras' || echo 'tsc OK'`
Expected: `tsc OK`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/metrics/fiscal/faturamento-por-cfop.ts src/lib/metrics/fiscal/faturamento-por-cfop.test.ts
git commit -m "feat(fiscal): metrica faturamentoPorCfop por operacao fiscal (vrProdutos, categoria, reconciliacao)"
```

---

## Task 7: Evoluir a tool MCP `fiscal_faturamento_por_cfop`

**Files:**
- Modify: `mcp/tools/fiscal/faturamento-por-cfop.ts`

> Mantém o id. Acrescenta `agruparPor` ao input, novo `dados`, e monta `_DESTAQUE`
> com escalares + `topLinhasJson` (top 8 linhas serializadas) + `semCfopValor` para
> o aviso de gap. A tool é registrada por `mcp/tools/fiscal/index.ts` (sem mudança lá).

- [ ] **Step 1: Reescrever a tool**

```ts
// mcp/tools/fiscal/faturamento-por-cfop.ts
// Tool MCP: fiscal_faturamento_por_cfop , faturamento por operacao fiscal (CFOP/categoria)
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape } from "../../lib/paginacao.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
  agruparPor: z.enum(["cfop", "categoria"]).optional(),
  ...paginacaoInputShape,
});

const linha = z.object({
  chave: z.string(),
  rotulo: z.string(),
  categoria: z.string(),
  ehReceita: z.boolean(),
  totalItens: z.number().int(),
  valorProdutos: z.number(),
});

const dados = z.object({
  agruparPor: z.enum(["cfop", "categoria"]),
  linhas: z.array(linha),
  total: z.number().int(),
  totalProdutos: z.number(),
  totalReceita: z.number(),
  totalNaoReceita: z.number(),
  semCfop: z.object({ totalItens: z.number().int(), valorProdutos: z.number() }),
  reconciliacao: z.object({
    somaProdutosItens: z.number(),
    somaProdutosNotas: z.number(),
    diferenca: z.number(),
    observacao: z.string(),
  }),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados,
    atualizadoEm: z.string(),
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalFaturamentoPorCfop: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_cfop",
  dominio: "fiscal",
  descricao:
    "Faturamento de saida autorizado por operacao fiscal: agrupa por categoria gerencial (venda, servico, transferencia, devolucao...) ou por CFOP cru. Separa receita (venda/servico/exportacao) de movimentacao que nao e receita. Base: valor dos produtos no item. Aceita empresa e periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal", "fato_nota_fiscal_item"],
      async () => {
        const r = await faturamentoPorCfop(ctx.prisma, {
          periodoDe: input.periodoDe,
          periodoAte: input.periodoAte,
          empresaId: escopo.empresaId,
          agruparPor: input.agruparPor,
          limit: input.limit,
          offset: input.offset,
        });
        const gap =
          r.semCfop.valorProdutos > 0
            ? ` Atencao: R$ ${r.semCfop.valorProdutos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${r.semCfop.totalItens} itens sem CFOP (sem classificacao fiscal).`
            : "";
        return {
          agruparPor: r.agruparPor,
          linhas: r.linhas,
          total: r.total,
          totalProdutos: r.totalProdutos,
          totalReceita: r.totalReceita,
          totalNaoReceita: r.totalNaoReceita,
          semCfop: r.semCfop,
          reconciliacao: r.reconciliacao,
          escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
          aviso: escopo.escopo.aviso + " " + r.reconciliacao.observacao + gap,
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;

    const d = envelope.dados;
    const topLinhas = d.linhas.slice(0, 8).map((l) => ({ rotulo: l.rotulo, valor: l.valorProdutos, ehReceita: l.ehReceita }));
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_cfop", {
      destaque: {
        agruparPor: d.agruparPor,
        totalProdutos: d.totalProdutos,
        totalReceita: d.totalReceita,
        totalNaoReceita: d.totalNaoReceita,
        linhasCount: d.total,
        semCfopValor: d.semCfop.valorProdutos,
        diferencaReconc: d.reconciliacao.diferenca,
        topLinhasJson: JSON.stringify(topLinhas),
      },
      agregado: { soma: d.totalProdutos, contagem: d.total },
    });
  },
};
```

- [ ] **Step 2: Verificar tsc**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -iE 'tools/fiscal/faturamento-por-cfop' || echo 'tool OK'`
Expected: `tool OK`.

- [ ] **Step 3: Commit**

```bash
git add mcp/tools/fiscal/faturamento-por-cfop.ts
git commit -m "feat(mcp): tool fiscal_faturamento_por_cfop evoluida (agruparPor, receita, gap, reconciliacao)"
```

---

## Task 8: Reescrever o formatador `fmtFaturamentoPorCfop`

**Files:**
- Modify: `mcp/lib/responder.ts:917`

> Arquivo COMPARTILHADO , editar inline. O formatador só vê `_DESTAQUE` (contrato
> da linha 1566). Lê os escalares + faz `JSON.parse(topLinhasJson)` para listar.

- [ ] **Step 1: Substituir o corpo de `fmtFaturamentoPorCfop` (linhas 917-925)**

Trocar o `const fmtFaturamentoPorCfop ... };` atual por:

```ts
const fmtFaturamentoPorCfop: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const agruparPor = String(d.agruparPor ?? "categoria");
  const totalProdutos = Number(d.totalProdutos ?? env._agregado?.soma ?? 0);
  const totalReceita = Number(d.totalReceita ?? 0);
  const linhasCount = Number(d.linhasCount ?? env._agregado?.contagem ?? 0);
  const semCfopValor = Number(d.semCfopValor ?? 0);

  if (linhasCount === 0 || totalProdutos === 0) {
    return "Nenhum faturamento de saida autorizado por operacao fiscal no periodo.";
  }

  type TopLinha = { rotulo: string; valor: number; ehReceita: boolean };
  let top: TopLinha[] = [];
  try {
    const parsed = JSON.parse(String(d.topLinhasJson ?? "[]"));
    if (Array.isArray(parsed)) top = parsed as TopLinha[];
  } catch {
    top = [];
  }

  const unidade = agruparPor === "cfop"
    ? linhasCount === 1 ? "CFOP" : "CFOPs"
    : linhasCount === 1 ? "categoria" : "categorias";
  const cabeca =
    `Faturamento de saida autorizado por operacao fiscal (${agruparPor}): ${formatBRL(totalProdutos)} em ${linhasCount} ${unidade}. ` +
    `Receita (venda, servico, exportacao): ${formatBRL(totalReceita)}; o restante e movimentacao que nao e receita.`;
  const lista = top.map((l) => {
    const marca = l.ehReceita ? "receita" : "nao-receita";
    // rotulo ja vem limpo (ROTULO_CATEGORIA ou cfopNome "5102 - Venda..."); NAO passar
    // por humanizeName (mutilaria o codigo do CFOP e o hifen).
    return `- ${String(l.rotulo ?? "").trim()}: ${formatBRL(Number(l.valor ?? 0))} (${marca})`;
  });
  const partes = [cabeca, lista.length ? "Principais operacoes:" : "", ...lista].filter(Boolean);
  if (semCfopValor > 0) {
    partes.push(`Atencao: ${formatBRL(semCfopValor)} sem CFOP (sem classificacao fiscal).`);
  }
  return partes.join("\n");
};
```

- [ ] **Step 2: Verificar tsc**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | grep -iE 'responder.ts' || echo 'responder OK'`
Expected: `responder OK`.

- [ ] **Step 3: Teste unitário do formatador (anexar a `mcp/lib/responder.test.ts`)**

Destino confirmado: `mcp/lib/responder.test.ts` JÁ EXISTE e importa `formatadorPorTool`. Anexar o describe abaixo (o import de `formatadorPorTool` já está no topo do arquivo; não reimportar):

```ts
describe("fmtFaturamentoPorCfop", () => {
  const fmt = formatadorPorTool("fiscal_faturamento_por_cfop");
  const baseEnv = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" } as never;
  it("modo categoria: lista com marca de receita e aviso de gap", () => {
    const env = {
      ...baseEnv,
      _DESTAQUE: {
        agruparPor: "categoria",
        totalProdutos: 2050,
        totalReceita: 1300,
        linhasCount: 4,
        semCfopValor: 50,
        topLinhasJson: JSON.stringify([
          { rotulo: "Venda", valor: 1000, ehReceita: true },
          { rotulo: "Transferencia", valor: 700, ehReceita: false },
        ]),
      },
    };
    const txt = fmt(env as never);
    expect(txt).toContain("por operacao fiscal (categoria)");
    expect(txt).toContain("Receita");
    expect(txt).toContain("nao-receita");
    expect(txt).toContain("sem CFOP");
  });
  it("modo cfop: preserva o codigo+nome do CFOP sem mutilar", () => {
    const env = {
      ...baseEnv,
      _DESTAQUE: {
        agruparPor: "cfop",
        totalProdutos: 1000,
        totalReceita: 1000,
        linhasCount: 1,
        semCfopValor: 0,
        topLinhasJson: JSON.stringify([{ rotulo: "5102 - Venda de mercadoria", valor: 1000, ehReceita: true }]),
      },
    };
    const txt = fmt(env as never);
    expect(txt).toContain("por operacao fiscal (cfop)");
    expect(txt).toContain("5102 - Venda de mercadoria");
  });
  it("vazio quando nao ha linhas", () => {
    const txt = fmt({ ...baseEnv, _DESTAQUE: { totalProdutos: 0, linhasCount: 0 } } as never);
    expect(txt).toContain("Nenhum faturamento");
  });
});
```

- [ ] **Step 4: Rodar o teste do formatador**

Run: `cd '<repo>' && npx jest -t "fmtFaturamentoPorCfop"`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/responder.ts mcp/lib/responder.test.ts && git commit -m "feat(mcp): fmtFaturamentoPorCfop por operacao fiscal (categoria/cfop, receita, gap)"
```

---

## Task 9: Curadoria do `MAPA_CFOP` contra o cache real + triggers + RADAR

**Files:**
- Modify: `src/lib/fiscal/regras/cfop-mapa.ts` (se a curadoria achar CFOP faltante)
- Modify: `mcp/catalog/tool-triggers.data.ts:76`
- Modify: `docs/RADAR.md`

- [ ] **Step 1: Listar todos os CFOPs reais de saída autorizada (cache real)**

Run (credenciais reais: user `nexus`, db `nexus_odoo_l1` , confirmadas no `docker-compose.yml`):
```bash
cd '<repo>' && docker compose exec -T db psql -U nexus -d nexus_odoo_l1 -c "
SELECT substring(trim(cfop_nome) from '^[0-9]{4}') AS cfop, count(*) AS itens,
       to_char(sum(vr_produtos),'FM999G999G990D00') AS vr
FROM fato_nota_fiscal_item
WHERE entrada_saida='1' AND situacao_nfe='autorizada'
GROUP BY 1 ORDER BY sum(vr_produtos) DESC NULLS LAST;"
```
Expected: lista de ~58 CFOPs + linha NULL (~R$ 23,3 mi). **Conferir que todo CFOP de alto valor está no `MAPA_CFOP` ou cai num prefixo correto.** Para cada CFOP não coberto pelo mapa, validar a categoria que `regraPorPrefixo` daria (rodar mentalmente ou via um script de checagem) e, se a regra de prefixo divergir do esperado fiscal, **adicionar a linha ao `MAPA_CFOP`**.

- [ ] **Step 2: (Se necessário) acrescentar CFOPs faltantes ao mapa**

Editar `src/lib/fiscal/regras/cfop-mapa.ts` acrescentando os CFOPs reais não cobertos à lista da regra apropriada (ex.: um `6109` de venda entraria em `mapear([...,"6109"], VENDA)`). Reexecutar `npx jest src/lib/fiscal/regras/`.

- [ ] **Step 3: Acrescentar os triggers da tool**

Em `mcp/catalog/tool-triggers.data.ts`, substituir a linha 76 (`"fiscal_faturamento_por_cfop": [...]`) por:

```ts
  "fiscal_faturamento_por_cfop": ["qual CFOP e mais usado nas saidas", "faturamento por CFOP", "vendas agrupadas por codigo fiscal de operacao", "valor faturado por CFOP", "faturamento por operacao fiscal", "composicao do faturamento", "quanto e venda servico transferencia devolucao", "faturamento por categoria", "separar receita de transferencia e remessa"],
```

- [ ] **Step 4: Registrar no RADAR a mudança de base**

Em `docs/RADAR.md`, acrescentar entrada (próximo número Rxx disponível) com:
- Título: "Base da tool fiscal_faturamento_por_cfop migrou de vr_nf (rateado) para vr_produtos".
- Impacto: muda número de tool em produção em R$ 28.432,83 / ~0,0015% (delta `Σ item.vrProdutos` − `Σ item.vrNf`, medido no cache real). Classificação fiscal nova (categoria/ehReceita). Reconciliação produto×nota = R$ 113.198,89 / 0,006% (item vs cabeçalho).
- Mitigação: reconciliação produto×nota exposta na resposta; 7 testes de regressão fiscal (6152, 5922/5117, 6202, 5933/6933, 5551, 5932/6932, 5949/6949, 6918).

- [ ] **Step 5: Rodar tsc + jest do domínio**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | tail -5 && npx jest src/lib/fiscal src/lib/metrics/fiscal`
Expected: tsc sem erro novo; jest verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fiscal/regras/cfop-mapa.ts mcp/catalog/tool-triggers.data.ts docs/RADAR.md
git commit -m "feat(fiscal): curadoria do MAPA_CFOP no cache real + triggers + RADAR (base vrProdutos)"
```

---

## Task 10: Verificação E2E contra o cache real + rebuild do `mcp`

**Files:**
- Create: `src/lib/reports/__tests__/e2e/f1-faturamento-operacao-fiscal.e2e.ts`

> Regra de raiz (CLAUDE.md §9 [9]): tsc/jest não bastam. Exercer contra o cache real e
> conferir os números com SQL independente. Rebuild do `mcp` (§2.1) antes de validar via tool.

- [ ] **Step 1: Rebuild do mcp (a tool importa de src/lib/reports/queries; a métrica é importada pela tool)**

Run (o `mcp` tem `build:` próprio , CLAUDE.md §2.1):
```bash
cd '<repo>' && docker compose up -d --build mcp && docker inspect $(docker compose ps -q mcp) --format '{{.State.StartedAt}}'
```
Expected: `StartedAt` = agora (após o último commit). Se o container começou antes do commit da tool, o build não pegou , refazer.

- [ ] **Step 2: SQL de referência , total de receita por categoria (independente do TS)**

Run:
```bash
cd '<repo>' && docker compose exec -T db psql -U nexus -d nexus_odoo_l1 -c "
WITH base AS (
  SELECT substring(trim(cfop_nome) from '^[0-9]{4}') AS cfop, vr_produtos
  FROM fato_nota_fiscal_item
  WHERE entrada_saida='1' AND situacao_nfe='autorizada')
SELECT
  to_char(sum(vr_produtos),'FM999G999G990D00') AS total_produtos,
  to_char(sum(vr_produtos) FILTER (WHERE cfop IS NULL),'FM999G999G990D00') AS sem_cfop,
  count(*) FILTER (WHERE cfop IS NULL) AS itens_sem_cfop
FROM base;"
```
Expected: `total_produtos` ≈ R$ 1,858 bi; `sem_cfop` ≈ R$ 23.300.150,08; `itens_sem_cfop` = 364 (perícia, já confirmado nesta sessão).

- [ ] **Step 3: Escrever o E2E que chama a métrica contra o cache real**

```ts
// src/lib/reports/__tests__/e2e/f1-faturamento-operacao-fiscal.e2e.ts
import { PrismaClient } from "../../../../generated/prisma/client";
import { faturamentoPorCfop } from "../../../metrics/fiscal/faturamento-por-cfop";

// E2E real: requer DB do cache acessivel (DATABASE_URL). Skip se ausente.
const temDb = !!process.env.DATABASE_URL;
const d = temDb ? describe : describe.skip;

d("E2E f1 faturamento por operacao fiscal (cache real)", () => {
  const prisma = new PrismaClient();
  afterAll(async () => { await prisma.$disconnect(); });

  it("categoria: receita nunca infla acima do total de produtos e semCfop e material", async () => {
    const r = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });
    expect(r.totalProdutos).toBeGreaterThan(0);
    expect(r.totalReceita).toBeGreaterThan(0);
    expect(r.totalReceita).toBeLessThanOrEqual(r.totalProdutos);
    expect(r.totalReceita + r.totalNaoReceita).toBeCloseTo(r.totalProdutos, 0);
    // sem_cfop material (perícia ~ R$ 23,3 mi)
    expect(r.semCfop.valorProdutos).toBeGreaterThan(20_000_000);
    // transferencia NAO entra na receita
    const transf = r.linhas.find((l) => l.categoria === "transferencia");
    if (transf) expect(transf.ehReceita).toBe(false);
    // reconciliacao fecha por tolerancia (< 1%)
    const pct = Math.abs(r.reconciliacao.diferenca) / r.reconciliacao.somaProdutosNotas;
    expect(pct).toBeLessThan(0.01);
  });

  it("cfop: 6152 aparece como transferencia (nao venda) se presente", async () => {
    const r = await faturamentoPorCfop(prisma, { agruparPor: "cfop" });
    const l6152 = r.linhas.find((l) => l.chave === "6152");
    if (l6152) {
      expect(l6152.categoria).toBe("transferencia");
      expect(l6152.ehReceita).toBe(false);
    }
  });
});
```

- [ ] **Step 4: Rodar o E2E**

Run: `cd '<repo>' && npx jest src/lib/reports/__tests__/e2e/f1-faturamento-operacao-fiscal.e2e.ts`
Expected: PASS (2 testes). O `DATABASE_URL` do host (mesmo que os outros E2E em `src/lib/reports/__tests__/e2e/` usam, do `.env.local`, banco `nexus_odoo_l1`) precisa estar setado; se o describe vier `skip`, exportar o `DATABASE_URL` antes. Conferir manualmente que `semCfop.valorProdutos` bate com o SQL do Step 2 (R$ 23,3 mi).

- [ ] **Step 5: Smoke E2E via tool no MCP (opcional, recomendado)**

Subir o agente (localhost:3000 já roda na pasta principal) e perguntar ao Nex: "faturamento por operação fiscal" e "quanto é venda vs transferência". Conferir que a resposta separa receita de não-receita e cita o gap sem CFOP. (Validação de produto, não bloqueante se o E2E TS passou.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/__tests__/e2e/f1-faturamento-operacao-fiscal.e2e.ts
git commit -m "test(fiscal): E2E faturamento por operacao fiscal contra cache real"
```

---

## Task 11: Verificação final + PR

- [ ] **Step 1: Suite completa + tsc**

Run: `cd '<repo>' && npx tsc --noEmit 2>&1 | tail -5 && npx jest src/lib/fiscal src/lib/metrics/fiscal mcp 2>&1 | tail -25`
Expected: tsc verde; suites do domínio verdes.

- [ ] **Step 2: Atualizar o PROGRESSO**

Editar `docs/superpowers/plans/PROGRESSO-faturamento-consolidado.md`: marcar Fase 1 como concluída, registrar o que foi entregue (Tabela de Regras + métrica/tool/formatador evoluídos), e apontar Fase 2 (intercompany) como próxima.

- [ ] **Step 3: Push + PR**

```bash
cd '<repo>' && git push -u origin feat/nex-reconstrucao
gh pr create --title "feat(fiscal): Fase 1 , faturamento por operacao fiscal (CFOP/categoria) + Tabela de Regras" \
  --body "$(cat <<'EOF'
## O que entrega
Evolui a tool `fiscal_faturamento_por_cfop` para classificar o faturamento de saída por **operação fiscal**: agrupa por categoria gerencial (venda, serviço, transferência, devolução, remessa...) ou por CFOP cru, com flag `ehReceita` separando receita real de movimentação.

## Componentes
- **Tabela de Regras** versionada e testada em `src/lib/fiscal/regras/` (tipos + mapa curado + prefixo + classificador). Reusável pelas Fases 2-4.
- Métrica `faturamentoPorCfop` migrada para base `vr_produtos` + `groupBy` por `cfopId`, com `totalReceita`, `semCfop` e reconciliação produto×nota.
- Tool e formatador `fmtFaturamentoPorCfop` evoluídos (duas ramificações + aviso de gap).

## Regressões fiscais travadas por teste
- 6152 = transferência (não venda); 6202 = devolução de compra (não deduz); 5933/6933 = serviço (não remessa); entrega futura x922/x117 não dobra; venda de ativo fora; sem-CFOP (R$ 23,3 mi) em linha própria com alerta.

## Verificação
- tsc verde; jest do domínio verde (unit das regras + métrica + formatador).
- E2E contra o cache real: receita ≤ total de produtos, sem-CFOP material, reconciliação < 1%.
- RADAR registra a troca de base vr_nf→vr_produtos (~0,0015%).

## Fora de escopo (próximas fases / PRs próprios)
- Intercompany/eliminação (Fase 2), ponte (Fase 3), margem (Fase 4). Issue 1 (natureza) e Issue 2 (UI rótulos+stagger) em PRs próprios.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Avisar o humano (único ponto de aprovação)**

Reportar resumo final em tópicos e aguardar o "merge" explícito do usuário (merge autorizado, mas o `gh pr merge` exige a confirmação literal).

---

## Self-Review (executada pelo autor do plano)

**Cobertura da spec v3:**
- §3.1 Tabela de Regras (tipos/mapa/prefixo/extrair/classificar/index) → Tasks 1-5. ✅
- Precedência crítica (Achado 1 fiscal) → Task 4 + testes Task 5. ✅
- §3.2 Métrica (vrProdutos, groupBy, agruparPor, totalReceita, reconciliacao, semCfop) → Task 6. ✅
- §3.3 Tool (id mantido, agruparPor, aviso de gap) → Task 7. ✅
- §3.4 Formatador (duas ramificações, receita, reconciliação, gap) → Task 8. ✅
- §4 Estratégia de teste (unit extrair/classificar + regressões + métrica + formatador + E2E real) → Tasks 2,5,6,8,10. ✅
- §5 Critérios de aceite (receita não infla, 6152/6202/serviço/sem-CFOP, reconciliação, tsc+jest, RADAR) → Tasks 5,6,9,10,11. ✅
- Apêndice A (MAPA curado + curadoria no dado real) → Tasks 3,9. ✅
- Triggers + RADAR → Task 9. ✅

**Placeholders:** nenhum "TBD/implementar depois"; todo step tem código/comando real. ✅

**Consistência de tipos:** `RegraOperacao`, `CategoriaGerencial`, `classificarCfop`, `extrairCfop`, `ROTULO_CATEGORIA`, `FaturamentoOperacaoInput`, `OperacaoLinha`, `Reconciliacao`, `topLinhasJson`, `_DESTAQUE` , nomes idênticos em todas as tasks que os referenciam. ✅

> Pontos de atenção das reviews , TODOS resolvidos nesta sessão contra o dado/código real:
> (a) DB/role: confirmado `nexus`/`nexus_odoo_l1` (corrigido em Tasks 9, 10). (b) cabeçalho
> `fato_nota_fiscal` TEM `vr_produtos` (schema:2043) , reconciliação viável. (c) teste do
> responder vive em `mcp/lib/responder.test.ts` (existe) , cravado na Task 8. (d) 3 buracos
> de classificação (6932 serviço, 5949/6949 outras, 6918 devolução) corrigidos no mapa +
> regex + testes. (e) números de reconciliação (0,006%) e delta de base (0,0015%) cravados
> com SQL real e distinguidos. Plano pronto para execução TDD.
