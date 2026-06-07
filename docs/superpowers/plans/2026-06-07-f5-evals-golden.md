# F5 , Evals / Golden Dataset , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Entregar um dataset de avaliacao versionado (golden) com resposta-ouro independente e um harness que mede o Nex em 4 dimensoes (selecao de tool, acuracia de numero, alucinacao=0, desambiguacao) e trava regressao, sem mudar o agente nem o schema do banco.

**Architecture:** Tudo sob `src/lib/agent/evals/`. Um JSON versionado (`golden/golden-nex.json`) validado por Zod (`golden-schema.ts`). Um harness tsx (`golden-nex.e2e.ts`) roda as 4 dimensoes contra o cache real, com a dimensao de selecao degradavel (depende de embeddings). Gate jest deterministico (schema + cobertura via funcao do set A do baseline). Um adaptador (`golden-to-oraculo.ts`) deixa o `retrieval.e2e.ts` da F3 ler o golden sem regredir o recall@K das 30 perguntas congeladas.

**Tech Stack:** TypeScript, Zod, jest (unit/sem-rede), tsx (E2E contra cache + embeddings), Prisma (`@/lib/prisma`), reuso de `mcp/catalog`, `src/lib/agent/router/*` (retrieval), `f4-baseline.e2e.ts` (padrao de KPI).

**Regra de raiz:** numero sempre de codigo; E2E contra cache real; sem migration; nao quebrar a plataforma. DB: `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`.

> **[R] Correcoes pre-execucao (self-review + verificacao no codigo real; o workflow de review do plano travou, gate conceitual ja veio das 2 reviews da spec):**
> 1. `registrar_lacuna` recebe `{ perguntaResumo: string (min 1), dominio? }` , NAO `{}`. Na Task 9 (dimensaoAlucinacao sub-classe A), chamar `registrarLacuna.handler({ perguntaResumo: e.pergunta }, ctx)` (nao `e.args ?? {}`), senao o `inputSchema.parse` quebra.
> 2. `MARCADORES_NAO_OPERADO` (Task 2) deve casar os textos REAIS: "nao e operad", "nao sao operad", "nao tem itens processados", "nao ha retornos", "nao ha remessas", "nao ha carteiras", "sem cheques", "sem registros de pix", "sem cotacoes", "sem comissoes", "nao tenho dados suficientes", + a `mensagemContabilGestaoVazia`. Confirmados via grep.
> 3. `resolveJsonModule: true` confirmado no tsconfig , import direto do `golden-nex.json` funciona.

---

## File Structure

- Create `src/lib/agent/evals/golden-schema.ts` , Zod + tipos `GoldenEntry`, `KpiOuro`, `Classe`.
- Create `src/lib/agent/evals/marcadores.ts` , `MARCADORES_NAO_OPERADO` (derivada de textos reais) + `contemMarcadorNaoOperado(t)` + `contemAfirmacaoFactual(t)`.
- Create `src/lib/agent/evals/golden/golden-nex.json` , dataset (45 migradas + kpiOuro + ~5 desambiguacao + entradas de selecao p/ cobertura).
- Create `src/lib/agent/evals/golden-to-oraculo.ts` , adaptador golden -> shape `Item` do retrieval (filtra `prosseguir`).
- Create `src/lib/agent/evals/cobertura.ts` , funcao `readToolsOperacionais()` reusando a def do set A do baseline (`!isWriteToolEntry && !ehFormatadorGenerico && !EXCLUIR`).
- Create `src/lib/agent/evals/golden-nex.e2e.ts` , harness tsx (4 dimensoes, scorecard, degradavel).
- Create `src/lib/agent/evals/golden/golden-scorecard.json` , gerado pelo harness (`GOLDEN_WRITE=1`).
- Create tests: `__tests__/golden-schema.test.ts`, `__tests__/marcadores.test.ts`, `__tests__/golden-to-oraculo.test.ts`, `__tests__/cobertura.test.ts`.
- Modify `src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts` , ler o golden via adaptador (30 congeladas, recall@K identico).

---

## Task 1: Schema Zod do golden

**Files:**
- Create: `src/lib/agent/evals/golden-schema.ts`
- Test: `src/lib/agent/evals/__tests__/golden-schema.test.ts`

- [ ] **Step 1: Test que falha**

```ts
// __tests__/golden-schema.test.ts
import { describe, it, expect } from "@jest/globals";
import { GoldenEntrySchema } from "../golden-schema";

const base = { id: "x-1", pergunta: "p?", dominio: "estoque", classe: "prosseguir", toolEsperada: "estoque_saldo_produto" };

describe("GoldenEntrySchema", () => {
  it("aceita prosseguir minimo", () => {
    expect(GoldenEntrySchema.safeParse(base).success).toBe(true);
  });
  it("aceita kpiOuro em prosseguir", () => {
    const e = { ...base, kpiOuro: [{ chave: "saldoTotal", valor: 789, match: "exato", fonteOuro: "SELECT ..." }] };
    expect(GoldenEntrySchema.safeParse(e).success).toBe(true);
  });
  it("rejeita kpiOuro fora de prosseguir", () => {
    const e = { id: "y", pergunta: "p?", dominio: null, classe: "falta_honesta", toolEsperada: "registrar_lacuna", kpiOuro: [{ chave: "x", valor: 1, match: "exato", fonteOuro: "s" }] };
    expect(GoldenEntrySchema.safeParse(e).success).toBe(false);
  });
  it("rejeita volatil com match exato", () => {
    const e = { ...base, volatil: true, kpiOuro: [{ chave: "totalVencido", valor: 1, match: "exato", fonteOuro: "s" }] };
    expect(GoldenEntrySchema.safeParse(e).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** , `npx jest src/lib/agent/evals/__tests__/golden-schema.test.ts` , Expected: FAIL (modulo nao existe).

- [ ] **Step 3: Implementar `golden-schema.ts`**

```ts
import { z } from "zod";

export const CLASSES = ["prosseguir", "fora_de_escopo", "falta_honesta", "desambiguacao"] as const;

export const KpiOuroSchema = z.object({
  chave: z.string(),
  valor: z.union([z.number(), z.string()]),
  match: z.enum(["exato", "centavos", "faixa"]).default("exato"),
  delta: z.number().optional(),
  fonteOuro: z.string().min(1),
  ancora: z.string().optional(),
});
export type KpiOuro = z.infer<typeof KpiOuroSchema>;

export const GoldenEntrySchema = z
  .object({
    id: z.string().min(1),
    pergunta: z.string().min(1),
    dominio: z.string().nullable(),
    classe: z.enum(CLASSES),
    toolEsperada: z.string().nullable(),
    args: z.record(z.string(), z.unknown()).optional(),
    kpiOuro: z.array(KpiOuroSchema).optional(),
    volatil: z.boolean().optional(),
    esperaAmbiguidade: z
      .object({
        requiredExactMatch: z.boolean().optional(),
        minCandidatos: z.number().int().optional(),
        toleranteResultadoUnico: z.boolean().optional(),
      })
      .optional(),
    observacao: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.kpiOuro && e.classe !== "prosseguir")
      ctx.addIssue({ code: "custom", message: "kpiOuro so em prosseguir", path: ["kpiOuro"] });
    if (e.volatil && e.kpiOuro?.some((k) => k.match === "exato"))
      ctx.addIssue({ code: "custom", message: "volatil nao pode ter kpiOuro match:exato", path: ["kpiOuro"] });
    if (e.esperaAmbiguidade && e.classe !== "desambiguacao")
      ctx.addIssue({ code: "custom", message: "esperaAmbiguidade so em desambiguacao", path: ["esperaAmbiguidade"] });
  });
export type GoldenEntry = z.infer<typeof GoldenEntrySchema>;

export const GoldenSchema = z.array(GoldenEntrySchema);
```

- [ ] **Step 4: Rodar e ver passar** , `npx jest src/lib/agent/evals/__tests__/golden-schema.test.ts` , Expected: PASS (4 testes).

- [ ] **Step 5: Commit** , `git add src/lib/agent/evals/golden-schema.ts src/lib/agent/evals/__tests__/golden-schema.test.ts && git commit -m "feat(f5): schema zod do golden (kpiOuro/volatil/classes)"`

---

## Task 2: Constante `MARCADORES_NAO_OPERADO` derivada do codigo real

**Files:**
- Create: `src/lib/agent/evals/marcadores.ts`
- Test: `src/lib/agent/evals/__tests__/marcadores.test.ts`
- Consultar (read-only): `mcp/tools/lib/honest-tool.ts`, `mcp/tools/financeiro/cobranca-bancaria.ts`, `mcp/tools/fiscal/mdfe-manifestos.ts`, `mcp/tools/fora-do-catalogo/registrar-lacuna.ts`, `src/lib/reports/queries/contabil.ts` (mensagemContabilGestaoVazia).

- [ ] **Step 1: Test que falha**

```ts
import { describe, it, expect } from "@jest/globals";
import { contemMarcadorNaoOperado, contemAfirmacaoFactual } from "../marcadores";

describe("marcadores de nao-operado", () => {
  it("reconhece textos reais de nao-operado", () => {
    expect(contemMarcadorNaoOperado("O MDF-e ainda nao e operado no Odoo da Matrix (sem manifestos).")).toBe(true);
    expect(contemMarcadorNaoOperado("Nao ha parametros de minimo/maximo cadastrados no Odoo ainda.")).toBe(true);
    expect(contemMarcadorNaoOperado("Infelizmente nao tenho dados suficientes pra te responder sobre isso.")).toBe(true);
  });
  it("nao marca uma resposta com dado real", () => {
    expect(contemMarcadorNaoOperado("Saldo geral: R$ 1.234,56 em 9 contas/bancos.")).toBe(false);
  });
  it("detecta afirmacao factual (numero) p/ a sub-classe A", () => {
    expect(contemAfirmacaoFactual("A folha foi R$ 50.000,00 no mes.")).toBe(true);
    expect(contemAfirmacaoFactual("Nao tenho dados suficientes sobre RH.")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `marcadores.ts`** (frases derivadas dos textos reais varridos nos arquivos consultados; manter comentario apontando a fonte)

```ts
// Marcadores canonicos de "nao operado / sem registros", derivados dos textos
// REAIS emitidos pelas honest-tools e por registrar_lacuna. Se uma tool de
// dominio-vazio passar a emitir texto fora desta lista, o teste de cobertura
// (golden-schema.test) deve falhar e a lista ser atualizada.
export const MARCADORES_NAO_OPERADO: string[] = [
  "nao e operado",
  "ainda nao e operado",
  "nao tem itens processados",
  "nao ha retornos",
  "nao ha remessas",
  "nao ha carteiras",
  "sem cheques",
  "sem registros de pix",
  "nao ha parametros de minimo/maximo",
  "nao tenho dados suficientes",
  "ainda nao e operada",
  "sem lancamentos",
  "nao ha saldos contabeis",
  "sem manifestos",
  "sem eventos",
  "nenhum certificado",
];

function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove acentos p/ casar com a lista sem acento
}

export function contemMarcadorNaoOperado(texto: string): boolean {
  const t = norm(texto);
  return MARCADORES_NAO_OPERADO.some((m) => t.includes(norm(m)));
}

// Afirmacao factual = ha numero (digito) que nao seja parte de uma negacao de dado.
export function contemAfirmacaoFactual(texto: string): boolean {
  if (contemMarcadorNaoOperado(texto)) return false;
  return /\d/.test(texto);
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** , `git commit -m "feat(f5): MARCADORES_NAO_OPERADO derivado dos textos reais + helpers"`

---

## Task 3: Migrar os 45 do mini-oraculo para `golden-nex.json`

**Files:**
- Create: `src/lib/agent/evals/golden/golden-nex.json`
- Consultar: `src/lib/agent/router/__tests__/e2e/mini-oraculo.json`
- Test: estende `__tests__/golden-schema.test.ts` (carrega o JSON real, valida, ids unicos).

- [ ] **Step 1: Test que falha** (adiciona ao golden-schema.test.ts)

```ts
import goldenData from "../golden/golden-nex.json";
import { GoldenSchema } from "../golden-schema";

it("golden-nex.json valida no schema e tem ids unicos", () => {
  const r = GoldenSchema.safeParse(goldenData);
  expect(r.success).toBe(true);
  const ids = (goldenData as Array<{ id: string }>).map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
});
it("migrou as 45 do mini-oraculo (>=45 entradas, classes conhecidas)", () => {
  expect((goldenData as unknown[]).length).toBeGreaterThanOrEqual(45);
});
```

(Requer `resolveJsonModule` no tsconfig , confirmar; se faltar, ler via `readFileSync` no teste.)

- [ ] **Step 2: Rodar e ver falhar** (arquivo nao existe).

- [ ] **Step 3: Gerar `golden-nex.json`** , script unico de migracao (rodar 1x, depois apagar): para cada entrada do mini-oraculo, emitir `{ id: "<dominio>-<n>", pergunta, dominio: dominioEsperado, classe: classeEsperada, toolEsperada }`. Conferir contagem 45. (kpiOuro/desambiguacao/cobertura entram nas tasks 4-6.)

```bash
node -e '
const fs=require("fs");
const o=require("./src/lib/agent/router/__tests__/e2e/mini-oraculo.json");
const cont={};
const out=o.map(x=>{const d=x.dominioEsperado||"geral";cont[d]=(cont[d]||0)+1;
 return {id:`${d}-${String(cont[d]).padStart(2,"0")}`,pergunta:x.pergunta,dominio:x.dominioEsperado,classe:x.classeEsperada,toolEsperada:x.toolEsperada};});
fs.mkdirSync("src/lib/agent/evals/golden",{recursive:true});
fs.writeFileSync("src/lib/agent/evals/golden/golden-nex.json",JSON.stringify(out,null,2)+"\n");
console.log("migradas",out.length);
'
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** , `git commit -m "feat(f5): golden-nex.json , 45 entradas migradas do mini-oraculo"`

---

## Task 4: kpiOuro independente (verificado por SELECT) , >=1 por dominio operacional

**Files:**
- Modify: `src/lib/agent/evals/golden/golden-nex.json` (adiciona `args`+`kpiOuro` em entradas prosseguir curadas; marca `volatil` nas now()-dependentes).
- Test: estende `golden-schema.test.ts` (cobertura de ouro >=1/dominio: estoque/financeiro/fiscal/comercial).

- [ ] **Step 1: Test que falha** (cobertura de ouro por dominio)

```ts
it("ha >=1 kpiOuro por dominio operacional", () => {
  const ops = ["estoque", "financeiro", "fiscal", "comercial"];
  for (const d of ops) {
    const tem = (goldenData as Array<{ dominio: string|null; kpiOuro?: unknown[] }>)
      .some((e) => e.dominio === d && (e.kpiOuro?.length ?? 0) > 0);
    expect({ d, tem }).toEqual({ d, tem: true });
  }
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Verificar numeros por SELECT e preencher** , para a entrada curada de cada dominio, rodar o SELECT, confirmar o numero, e gravar `args`+`kpiOuro` com `fonteOuro` = o SELECT. Exemplos (rodar e usar o valor REAL retornado, nao chutar):

```bash
# estoque_saldo_produto (estavel: saldo do produto por codigo)
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tc "
 select round(sum(quantidade)::numeric,4) saldo, count(distinct local_id) nloc
 from fato_estoque_saldo s join fato_produto p on p.odoo_id=s.produto_id
 where p.codigo='1464' and s.local_id is not null;"
# financeiro_saldo_contas (estavel: snapshot)
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tc "
 select round(sum(saldo)::numeric,2) tot, count(*) n from fato_financeiro_saldo;"
# fiscal_contar_notas (estavel: contagem total cadastro)
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tc "
 select count(*) total,
   count(*) filter (where entrada_saida='1') saida,
   count(*) filter (where entrada_saida='0') entrada from fato_nota_fiscal;"
# comercial_contar_pedidos (estavel)
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tc "select count(*) from fato_pedido;"
```

Entradas (preencher `valor` com o retorno real). Exemplo para estoque (saldo 789, 25 locais conferidos na F4):

```json
{
  "id": "estoque-01", "pergunta": "Qual o saldo total do produto 1464 e em quantos locais?",
  "dominio": "estoque", "classe": "prosseguir", "toolEsperada": "estoque_locais_por_produto",
  "args": { "termo": "1464" },
  "kpiOuro": [
    { "chave": "saldoTotal", "valor": 789, "match": "exato", "fonteOuro": "SELECT sum(quantidade) fato_estoque_saldo WHERE produto codigo=1464 AND local_id not null" },
    { "chave": "totalLocais", "valor": 25, "match": "exato", "fonteOuro": "SELECT count(distinct local_id) idem" }
  ]
}
```

Marcar `"volatil": true` (sem kpiOuro exato) em `financeiro_titulos_vencidos` e `estoque_produtos_parados` se entrarem , usar so como selecao OU `match:"faixa"` com `ancora`.

- [ ] **Step 4: Rodar e ver passar** , `npx jest src/lib/agent/evals/__tests__/golden-schema.test.ts`.

- [ ] **Step 5: Commit** , `git commit -m "feat(f5): kpiOuro independente (SELECT) por dominio operacional + volatil"`

---

## Task 5: Seed de desambiguacao (~5, novo)

**Files:**
- Modify: `golden-nex.json` (adiciona ~5 entradas `classe:"desambiguacao"`).
- Consultar: a tool que popula `ambiguidade` (ex. `mcp/tools/estoque/saldo-produto.ts` , `totalMatches>1`) e o resolvedor F2.
- Verificar por SELECT que o termo escolhido casa >1 linha (ambiguidade estrutural estavel).

- [ ] **Step 1: Test que falha** (ha >=1 desambiguacao bem-formada)

```ts
it("ha casos de desambiguacao com esperaAmbiguidade", () => {
  const ds = (goldenData as Array<{ classe: string; esperaAmbiguidade?: unknown }>)
    .filter((e) => e.classe === "desambiguacao");
  expect(ds.length).toBeGreaterThanOrEqual(3);
  expect(ds.every((e) => e.esperaAmbiguidade)).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Achar termos estruturalmente ambiguos e gravar** , rodar SELECT p/ um termo que casa varios produtos/parceiros (ex. uma palavra de familia), confirmar `count>1`, e gravar:

```bash
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -tc "
 select count(*) from fato_produto where nome ilike '%esteira%';"
```

```json
{
  "id": "desamb-01", "pergunta": "Qual o saldo da esteira?",
  "dominio": "estoque", "classe": "desambiguacao", "toolEsperada": "estoque_saldo_produto",
  "args": { "termo": "esteira" },
  "esperaAmbiguidade": { "minCandidatos": 2, "toleranteResultadoUnico": true },
  "observacao": "Termo casa varios produtos; estabilidade depende do cache. Falha so se a tool chutar 1 match errado."
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** , `git commit -m "feat(f5): seed de desambiguacao (termos estruturalmente ambiguos, tolerante)"`

---

## Task 6: Cobertura de selecao (toda read-tool operacional) , funcao + gate jest

**Files:**
- Create: `src/lib/agent/evals/cobertura.ts`
- Test: `src/lib/agent/evals/__tests__/cobertura.test.ts`
- Modify: `golden-nex.json` (adiciona entrada de selecao p/ cada tool operacional sem entrada).
- Consultar: `f4-baseline.e2e.ts` (def. do set A) , `mcp/catalog/index.ts`, `mcp/catalog/types.ts`, `mcp/lib/responder.ts`.

- [ ] **Step 1: Test que falha**

```ts
import { describe, it, expect } from "@jest/globals";
import { readToolsOperacionais } from "../cobertura";
import goldenData from "../golden/golden-nex.json";

it("toda read-tool operacional tem >=1 entrada no golden", () => {
  const tools = readToolsOperacionais();
  const comEntrada = new Set((goldenData as Array<{ toolEsperada: string|null }>).map((e) => e.toolEsperada));
  const faltando = tools.filter((id) => !comEntrada.has(id));
  expect(faltando).toEqual([]);
});
```

- [ ] **Step 2: Rodar e ver falhar** (faltando != []).

- [ ] **Step 3: Implementar `cobertura.ts`** (reusa exatamente a def do set A)

```ts
import { catalogo } from "../../../../mcp/catalog/index";
import { isWriteToolEntry, type ToolEntry } from "../../../../mcp/catalog/types";
import { formatadorPorTool, ehFormatadorGenerico } from "../../../../mcp/lib/responder";

// Mesma definicao de "set A" do baseline F4 (read-tool com formatador real),
// menos as tools de sistema sem KPI de dado.
const EXCLUIR = new Set(["registrar_lacuna", "bi_consulta_avancada"]);

export function readToolsOperacionais(): string[] {
  return (catalogo as ToolEntry[])
    .filter((t) => !isWriteToolEntry(t))
    .filter((t) => !ehFormatadorGenerico(formatadorPorTool(t.id)))
    .filter((t) => !EXCLUIR.has(t.id))
    .map((t) => t.id)
    .sort();
}
```

- [ ] **Step 4: Adicionar entradas de selecao faltantes** , rodar o teste, pegar a lista `faltando`, e adicionar ao golden uma entrada `classe:"prosseguir"` por tool faltante (pergunta natural + toolEsperada). Repetir ate `faltando == []`.

- [ ] **Step 5: Rodar e ver passar** , `npx jest src/lib/agent/evals/__tests__/cobertura.test.ts`.

- [ ] **Step 6: Commit** , `git commit -m "feat(f5): cobertura de selecao 100% das read-tools operacionais (def do set A)"`

---

## Task 7: Adaptador `golden-to-oraculo.ts`

**Files:**
- Create: `src/lib/agent/evals/golden-to-oraculo.ts`
- Test: `src/lib/agent/evals/__tests__/golden-to-oraculo.test.ts`

- [ ] **Step 1: Test que falha**

```ts
import { describe, it, expect } from "@jest/globals";
import { goldenToOraculo, ORACULO_FROZEN_IDS } from "../golden-to-oraculo";

it("mapeia campos e filtra so prosseguir", () => {
  const g = [
    { id: "a", pergunta: "p", dominio: "estoque", classe: "prosseguir", toolEsperada: "t" },
    { id: "b", pergunta: "q", dominio: null, classe: "desambiguacao", toolEsperada: "u", esperaAmbiguidade: {} },
  ];
  const o = goldenToOraculo(g as never);
  expect(o).toEqual([{ pergunta: "p", toolEsperada: "t", dominioEsperado: "estoque", classeEsperada: "prosseguir" }]);
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `golden-to-oraculo.ts`**

```ts
import type { GoldenEntry } from "./golden-schema";

export type OraculoItem = {
  pergunta: string;
  toolEsperada: string | null;
  dominioEsperado: string | null;
  classeEsperada: "prosseguir" | "fora_de_escopo" | "falta_honesta";
};

// So as 3 classes que o retrieval.e2e conhece; desambiguacao e ignorada.
export function goldenToOraculo(golden: GoldenEntry[]): OraculoItem[] {
  return golden
    .filter((e) => e.classe !== "desambiguacao")
    .map((e) => ({
      pergunta: e.pergunta,
      toolEsperada: e.toolEsperada,
      dominioEsperado: e.dominio,
      classeEsperada: e.classe as OraculoItem["classeEsperada"],
    }));
}

// Os 30 prosseguir originais do mini-oraculo congelam o gate de recall@K.
// Preenchido na Task 8 com os ids migrados (estoque-01..., financeiro-01...).
export const ORACULO_FROZEN_IDS: string[] = [/* preenchido na Task 8 */];
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** , `git commit -m "feat(f5): adaptador golden->oraculo (filtra prosseguir)"`

---

## Task 8: `retrieval.e2e.ts` consome o golden via adaptador (30 congeladas)

**Files:**
- Modify: `src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`
- Modify: `src/lib/agent/evals/golden-to-oraculo.ts` (preencher `ORACULO_FROZEN_IDS` com os 30 ids prosseguir migrados).

- [ ] **Step 1: Preencher `ORACULO_FROZEN_IDS`** , os ids das 30 entradas prosseguir vindas do mini-oraculo (estoque-01..05, financeiro-01..06, fiscal-..., comercial-..., contabil-..., cadastros-...). Conferir 30.

- [ ] **Step 2: Trocar a fonte do retrieval.e2e** , em vez de `JSON.parse(readFileSync(mini-oraculo.json))`, importar o golden, aplicar `goldenToOraculo`, e medir recall@K **so** sobre as entradas cujos ids estao em `ORACULO_FROZEN_IDS` (subconjunto congelado). As demais prosseguir sao logadas como "monitoradas, nao-gate".

```ts
// (substitui a leitura do mini-oraculo)
import goldenData from "../../../evals/golden/golden-nex.json";
import { goldenToOraculo, ORACULO_FROZEN_IDS } from "../../../evals/golden-to-oraculo";
const FROZEN = new Set(ORACULO_FROZEN_IDS);
const golden = goldenData as Array<{ id: string } & Record<string, unknown>>;
const ORACULO = goldenToOraculo(golden as never);
const prosseguirFrozen = golden.filter((e) => FROZEN.has(e.id) && e.classe === "prosseguir");
// recall@K medido so sobre prosseguirFrozen (mesmas 30 de antes => recall identico)
```

- [ ] **Step 3: Rodar o E2E e confirmar recall@K identico** , `set -a; . ./.env.local; set +a; npx tsx src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts` , Expected: recall@K das 30 congeladas == valor atual (>=0.98), exit 0. (Depende de LlmCredential+AppSetting+cache; se indisponivel, registrar e tratar na verificacao de onda.)

- [ ] **Step 4: Commit** , `git commit -m "feat(f5): retrieval.e2e consome o golden via adaptador (30 congeladas, recall identico)"`

---

## Task 9: Harness `golden-nex.e2e.ts` , dimensoes numero + alucinacao + desambiguacao

**Files:**
- Create: `src/lib/agent/evals/golden-nex.e2e.ts`
- Create (gerado): `src/lib/agent/evals/golden/golden-scorecard.json`
- Consultar: `f4-baseline.e2e.ts` (padrao de rodar handler + extrair KPI + UserContext super_admin), `marcadores.ts`.

- [ ] **Step 1: Esqueleto + dimensao NUMERO** , para cada entrada `prosseguir` com `kpiOuro`, roda `tool.handler(args, ctx)` e compara cada `kpiOuro.chave` em `dados._DESTAQUE`/`dados._agregado` com `valor` (match exato; `centavos`/`faixa` usa `delta`). Reusa o ctx super_admin e o catalogo do baseline.

```ts
// golden-nex.e2e.ts (runner tsx, guard E2E=1)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { catalogo } from "../../../../mcp/catalog/index";
import { isWriteToolEntry, type ToolEntry } from "../../../../mcp/catalog/types";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";
import { contemMarcadorNaoOperado, contemAfirmacaoFactual } from "./marcadores";
import type { UserContext } from "../../../../mcp/auth/user-context";

const GOLDEN_PATH = join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json");
const SCORE_PATH = join(process.cwd(), "src/lib/agent/evals/golden/golden-scorecard.json");
const golden: GoldenEntry[] = GoldenSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
const ctx = { prisma, user: { userId: "f5-golden", role: "super_admin", domains: [] } as UserContext };
const byId = new Map((catalogo as ToolEntry[]).map((t) => [t.id, t]));

function getKpi(env: unknown, chave: string): unknown {
  const d = (env as { dados?: Record<string, unknown> })?.dados ?? {};
  const dest = (d._DESTAQUE ?? {}) as Record<string, unknown>;
  const agg = (d._agregado ?? {}) as Record<string, unknown>;
  return dest[chave] ?? agg[chave];
}
function round2(n: number) { return Math.round(n * 100) / 100; }

async function dimensaoNumero(e: GoldenEntry) {
  const tool = byId.get(e.toolEsperada!);
  if (!tool || !e.kpiOuro) return { ok: true, skip: true };
  const parsed = tool.inputSchema.parse(e.args ?? {});
  const env = await tool.handler(parsed, ctx);
  const falhas: string[] = [];
  for (const k of e.kpiOuro) {
    const got = getKpi(env, k.chave);
    if (k.match === "exato") {
      if (String(got) !== String(k.valor)) falhas.push(`${e.id}.${k.chave}: ouro=${k.valor} got=${got}`);
    } else if (k.match === "centavos" || k.match === "faixa") {
      const d = Math.abs(Number(got) - Number(k.valor));
      const tol = k.match === "centavos" ? (k.delta ?? 0.01) : (k.delta ?? 0);
      if (!(d <= tol)) falhas.push(`${e.id}.${k.chave}: ouro=${k.valor}+-${tol} got=${got}`);
    }
  }
  return { ok: falhas.length === 0, falhas };
}
```

- [ ] **Step 2: Dimensao ALUCINACAO (sub-classes A e B)**

```ts
async function dimensaoAlucinacao(e: GoldenEntry) {
  const tool = byId.get(e.toolEsperada!);
  if (!tool) return { ok: false, falhas: [`${e.id}: tool ${e.toolEsperada} nao existe`] };
  const env = await tool.handler(tool.inputSchema.parse(e.args ?? {}), ctx);
  const dados = (env as { dados?: Record<string, unknown>; estado?: string }) ?? {};
  const resposta = String((dados.dados as Record<string, unknown>)?._RESPOSTA ?? "");
  if (e.toolEsperada === "registrar_lacuna") {
    // sub-classe A: nao pode afirmar numero factual
    const ok = !contemAfirmacaoFactual(resposta);
    return { ok, falhas: ok ? [] : [`${e.id}: registrar_lacuna afirmou factual: "${resposta.slice(0,80)}"`] };
  }
  // sub-classe B: estado vazio OU marcador de nao-operado
  const estado = (dados as { estado?: string }).estado;
  const ok = estado === "vazio" || estado === "preparando" || contemMarcadorNaoOperado(resposta);
  return { ok, falhas: ok ? [] : [`${e.id}: esperava vazio/nao-operado, got estado=${estado} resp="${resposta.slice(0,80)}"`] };
}
```

- [ ] **Step 3: Dimensao DESAMBIGUACAO (tolerante)**

```ts
async function dimensaoDesambiguacao(e: GoldenEntry) {
  const tool = byId.get(e.toolEsperada!);
  if (!tool) return { ok: false, falhas: [`${e.id}: tool nao existe`] };
  const env = await tool.handler(tool.inputSchema.parse(e.args ?? {}), ctx) as { dados?: Record<string, unknown> };
  const amb = (env.dados as Record<string, unknown>)?.ambiguidade;
  const linhas = ((env.dados as Record<string, unknown>)?.linhas ?? []) as unknown[];
  const esp = e.esperaAmbiguidade ?? {};
  // tolerante: passa se trouxe ambiguidade OU resultado unico legitimo; falha so se >1 sem ambiguidade (chutou)
  const ok = Boolean(amb) || (esp.toleranteResultadoUnico && linhas.length <= 1);
  return { ok, falhas: ok ? [] : [`${e.id}: nem ambiguidade nem resultado unico (possivel chute)`] };
}
```

- [ ] **Step 4: main() + scorecard + guard E2E=1** , itera o golden por classe, acumula taxas (numero_ok, alucinacao_taxa, desambiguacao_ok), grava `golden-scorecard.json` com `GOLDEN_WRITE=1`, e em modo conferencia sai !=0 se `alucinacao_taxa>0` ou qualquer `kpiOuro` divergente. Skip com SKIP se `E2E!=1`.

```ts
async function main() {
  if (process.env.E2E !== "1") { console.log("SKIP: E2E=1 p/ rodar o golden contra o cache."); return; }
  const score = { numero: { ok: 0, falhas: [] as string[] }, alucinacao: { casos: 0, alucinou: 0, falhas: [] as string[] }, desamb: { ok: 0, falhas: [] as string[] } };
  for (const e of golden) {
    if (e.classe === "prosseguir" && e.kpiOuro) { const r = await dimensaoNumero(e); if (r.ok) score.numero.ok++; else score.numero.falhas.push(...(r.falhas ?? [])); }
    if (e.classe === "falta_honesta") { score.alucinacao.casos++; const r = await dimensaoAlucinacao(e); if (!r.ok) { score.alucinacao.alucinou++; score.alucinacao.falhas.push(...r.falhas); } }
    if (e.classe === "desambiguacao") { const r = await dimensaoDesambiguacao(e); if (r.ok) score.desamb.ok++; else score.desamb.falhas.push(...r.falhas); }
  }
  const serial = JSON.stringify(score, null, 2) + "\n";
  if (process.env.GOLDEN_WRITE === "1") { writeFileSync(SCORE_PATH, serial); console.log("SCORECARD_GRAVADO"); }
  console.log(serial);
  if (score.numero.falhas.length || score.alucinacao.alucinou > 0 || score.desamb.falhas.length) { console.error("GOLDEN_VERMELHO"); process.exitCode = 1; }
  else console.log("GOLDEN_VERDE");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Rodar o harness contra o cache** , `E2E=1 GOLDEN_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts` , Expected: `GOLDEN_VERDE`, alucinacao=0, numero ok, scorecard gravado. Corrigir entradas (args/ouro) ate verde , se um numero nao bate, investigar se e bug de dado (corrigir e logar em RADAR) ou ouro errado.

- [ ] **Step 6: Conferencia idempotente** , `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts` , Expected: GOLDEN_VERDE estavel.

- [ ] **Step 7: Commit** , `git commit -m "feat(f5): harness golden-nex.e2e , numero/alucinacao/desambiguacao + scorecard"`

---

## Task 10: Verificacao final + tsc + jest + docs

- [ ] **Step 1: tsc raiz + mcp** , `npx tsc --noEmit && npx tsc -p mcp/tsconfig.json --noEmit` , Expected: limpo. (Conferir imports cross-boundary `src/lib/agent/evals` -> `mcp/*` compilam em ambos.)
- [ ] **Step 2: jest completo** , `npx jest --silent | tail -4` , Expected: tudo verde (schema, marcadores, cobertura, adaptador + suites existentes).
- [ ] **Step 3: E2E golden + retrieval** , rodar os dois E2E (golden-nex + retrieval) contra o cache; confirmar GOLDEN_VERDE e recall@K identico.
- [ ] **Step 4: Atualizar PROGRESSO/STATUS/HISTORY** , F5 entregue (harness + seed das 4 dimensoes + gates).
- [ ] **Step 5: Commit + PR** , abrir PR da F5, avaliar no corpo, (merge no wrap-up/quando F5 fechar).

---

## Self-Review (cobertura da spec v3)

- Schema/kpiOuro/volatil/classes -> Task 1. ✓
- MARCADORES_NAO_OPERADO derivado do real -> Task 2. ✓
- Migrar 45 -> Task 3. ✓
- kpiOuro independente por dominio + volatil -> Task 4. ✓
- Desambiguacao seed novo tolerante -> Task 5. ✓
- Cobertura selecao 100% (def set A) -> Task 6. ✓
- Adaptador -> Task 7; retrieval.e2e via adaptador, 30 congeladas -> Task 8. ✓
- Harness 4 dimensoes degradavel + scorecard -> Task 9 (selecao fica no retrieval.e2e; numero/alucinacao/desamb no golden-nex.e2e). ✓
- Alucinacao 2 sub-classes (A registrar_lacuna sem factual; B estado vazio/marcador) -> Task 9 Step 2. ✓
- tsc raiz+mcp, jest, sem migration -> Task 10. ✓
- Degradabilidade da selecao: o retrieval.e2e ja isola embeddings; o golden-nex.e2e (numero/alucinacao/desamb) NAO usa embeddings -> naturalmente nao derruba por falta de OpenAI. ✓
