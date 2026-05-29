# R2 Discovery enxuto, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classificar os 652 modelos do Odoo da Tauga em 3 baldes (A=tem dado, B=legítimo vazio, C=inútil técnico) via `search_count` JSON-RPC + heurísticas offline, gerando `discovery/odoo-schema/baldes.json` e o relatório `docs/discovery/2026-05-29-baldes.md`.

**Architecture:** Lógica de verdade pura e testável em `src/lib/discovery/baldes/` (jest só varre `src/` e `mcp/`); wrapper de I/O CLI em `scripts/discovery/baldes/run.ts` que reusa o `OdooClient` do worker. Filtro offline marca C-técnico sem RPC; sobreviventes recebem `search_count`; precedência determinística decide A/B/C; erros classificados por tipo.

**Tech Stack:** TypeScript, `OdooClient` (`src/worker/odoo/client.ts`), `tsx --env-file=.env.local`, jest + ts-jest.

**SPEC base:** `docs/superpowers/specs/2026-05-29-r2-discovery-enxuto-spec.md` v3.

**Versão do plano:** v3 (final, vai para execução). Aplica review #1
(`reviews/2026-05-29-r2-plan-review-1.md`, P1-P3/P5) e review #2
(`reviews/2026-05-29-r2-plan-review-2.md`, Q1-Q2): `aggregate.ts` testado, seção
"Balde C por motivo" no relatório, import header de `classify.ts` consolidado.

---

## Estrutura de arquivos

- `src/lib/discovery/baldes/types.ts` , tipos do domínio (sem runtime).
- `src/lib/discovery/baldes/constants.ts` , thresholds e listas de prefixos/sufixos.
- `src/lib/discovery/baldes/classify.ts` , funções puras de classificação.
- `src/lib/discovery/baldes/classify.test.ts` , TDD da classificação.
- `src/lib/discovery/baldes/error-kind.ts` , mapeia erro do OdooClient para `TipoErroRpc`.
- `src/lib/discovery/baldes/error-kind.test.ts` , TDD do mapeamento de erro.
- `src/lib/discovery/baldes/count-client.ts` , `searchCount(client, model)` (client injetado, testável com fake).
- `src/lib/discovery/baldes/count-client.test.ts` , TDD do wrapper.
- `src/lib/discovery/baldes/aggregate.ts` , `agregar(modelos, nao)` recomputa totais/por_dominio (P1).
- `src/lib/discovery/baldes/aggregate.test.ts` , TDD da agregação (incl. caso merge).
- `src/lib/discovery/baldes/report.ts` , `gerarRelatorio(resultado)` markdown puro.
- `src/lib/discovery/baldes/report.test.ts` , TDD do relatório.
- `scripts/discovery/baldes/run.ts` , orquestrador CLI (I/O), E2E.
- `package.json` , script `discovery:baldes`.

---

## Task 1: Tipos e constantes

**Files:**
- Create: `src/lib/discovery/baldes/types.ts`
- Create: `src/lib/discovery/baldes/constants.ts`

- [ ] **Step 1: Criar types.ts**

```ts
// src/lib/discovery/baldes/types.ts
export type Balde = "A" | "B" | "C";

export type PrevisaoAtivacao = "em_uso" | "instalado_sem_uso" | "sem_sinal";

export type Motivo =
  | "transient"
  | "sufixo_tecnico"
  | "prefixo_ui_infra"
  | "volume_acima_threshold"
  | "baixo_volume_dominio_negocio"
  | "baixo_volume_nao_negocio"
  | "acesso_negado"
  | "abstract_ou_inexistente";

export type TipoErroRpc = "acesso_negado" | "abstract" | "transitorio";

/** Modelo como sai do schema.json (normalizado). */
export interface ModeloSchema {
  modelo: string; // chave técnica, ex.: "sped.mdfe"
  descricao: string; // schema.name, ex.: "MDF-e"
  transient: boolean;
}

export interface EntradaBalde {
  dominio: string;
  descricao: string;
  balde: Balde;
  count: number | null;
  transient: boolean;
  motivo: Motivo;
  previsao_ativacao?: PrevisaoAtivacao;
}

export interface NaoClassificado {
  modelo: string;
  erro: string;
}

export interface ContagemBaldes {
  A: number;
  B: number;
  C: number;
  nao_classificados: number;
}

export interface ResultadoBaldes {
  gerado_em: string;
  fonte_schema: string;
  rodou_sob_uid: number | null;
  thresholds: { balde_a_min: number; balde_b_max: number };
  totais: ContagemBaldes & { total: number };
  por_dominio: Record<string, ContagemBaldes>;
  modelos: Record<string, EntradaBalde>;
  nao_classificados: NaoClassificado[];
}
```

- [ ] **Step 2: Criar constants.ts**

```ts
// src/lib/discovery/baldes/constants.ts
/** count > 50 (ou seja, >= 51) vira Balde A. */
export const BALDE_A_MIN = 51;
/** count entre 0 e 50 (inclusive) é candidato a Balde B. */
export const BALDE_B_MAX = 50;

/** Sufixos de nome técnico (modelo termina com um destes -> C-técnico). */
export const SUFIXOS_TECNICOS = [
  ".base",
  ".metodos",
  ".arvore",
  ".wizard",
  ".modelo.impressao",
  ".impressao",
  ".configuracao.base",
  ".configuracao",
  ".settings",
  ".mixin",
] as const;

/** Prefixos de módulos puramente UI/infra/sistema do Odoo -> C-técnico. */
export const PREFIXOS_UI_INFRA = new Set<string>([
  "ir",
  "ks_dashboard_ninja",
  "ks",
  "web_editor",
  "web",
  "report",
  "mail",
  "discuss",
  "bus",
  "base_import",
  "base",
  "hardware",
  "change",
  "api",
]);

/** Prefixos reconhecidos como domínio de negócio (baixo volume -> Balde B). */
export const PREFIXOS_NEGOCIO = new Set<string>([
  "sped",
  "finan",
  "contabil",
  "pedido",
  "estoque",
  "producao",
  "crm",
  "relatorio",
  "wms",
  "auditoria",
  "rh",
  "res",
  "reinf",
]);

/** Os 5 domínios prioritários do roadmap (destaque no relatório). */
export const DOMINIOS_PRIORITARIOS = ["sped", "crm", "pedido", "finan", "contabil"] as const;
```

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS (sem erros).

- [ ] **Step 4: Commit**

```bash
git add src/lib/discovery/baldes/types.ts src/lib/discovery/baldes/constants.ts
git commit -m "feat(discovery): tipos e constantes da classificacao em baldes (R2)"
```

---

## Task 2: classify, dominioDe + classificarOffline

**Files:**
- Create: `src/lib/discovery/baldes/classify.ts`
- Test: `src/lib/discovery/baldes/classify.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/discovery/baldes/classify.test.ts
import { dominioDe, classificarOffline } from "./classify";
import type { ModeloSchema } from "./types";

const m = (modelo: string, transient = false): ModeloSchema => ({
  modelo,
  descricao: modelo,
  transient,
});

describe("dominioDe", () => {
  it("extrai o prefixo antes do primeiro ponto", () => {
    expect(dominioDe("sped.documento")).toBe("sped");
    expect(dominioDe("res.partner.bank")).toBe("res");
  });
  it("modelo sem ponto vira o próprio nome", () => {
    expect(dominioDe("calendar")).toBe("calendar");
  });
});

describe("classificarOffline", () => {
  it("transient -> C/transient", () => {
    expect(classificarOffline(m("finan.wizard.x", true))).toEqual({
      balde: "C",
      motivo: "transient",
    });
  });
  it("sufixo técnico -> C/sufixo_tecnico", () => {
    expect(classificarOffline(m("sped.documento.base"))).toEqual({
      balde: "C",
      motivo: "sufixo_tecnico",
    });
    expect(classificarOffline(m("res.config.settings"))).toEqual({
      balde: "C",
      motivo: "sufixo_tecnico",
    });
    expect(classificarOffline(m("finan.relatorio.configuracao"))).toEqual({
      balde: "C",
      motivo: "sufixo_tecnico",
    });
  });
  it("prefixo UI/infra -> C/prefixo_ui_infra", () => {
    expect(classificarOffline(m("ir.cron"))).toEqual({
      balde: "C",
      motivo: "prefixo_ui_infra",
    });
    expect(classificarOffline(m("mail.message"))).toEqual({
      balde: "C",
      motivo: "prefixo_ui_infra",
    });
  });
  it("modelo de negócio comum -> null (segue para RPC)", () => {
    expect(classificarOffline(m("sped.documento"))).toBeNull();
    expect(classificarOffline(m("res.partner"))).toBeNull();
  });
  it("transient tem precedência sobre prefixo de negócio", () => {
    expect(classificarOffline(m("sped.algo", true))).toEqual({
      balde: "C",
      motivo: "transient",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/discovery/baldes/classify.test.ts`
Expected: FAIL ("Cannot find module './classify'").

- [ ] **Step 3: Implementar classify.ts (parte 1)**

```ts
// src/lib/discovery/baldes/classify.ts
import { PREFIXOS_UI_INFRA, SUFIXOS_TECNICOS } from "./constants";
import type { Motivo, ModeloSchema } from "./types";

/** Prefixo técnico do modelo (texto antes do primeiro ponto). */
export function dominioDe(modelo: string): string {
  const i = modelo.indexOf(".");
  return i === -1 ? modelo : modelo.slice(0, i);
}

/**
 * Filtro offline: marca C-técnico sem RPC, ou retorna null para o modelo
 * seguir para a contagem. Precedência: transient > sufixo > prefixo UI/infra.
 */
export function classificarOffline(
  m: ModeloSchema,
): { balde: "C"; motivo: Motivo } | null {
  if (m.transient) return { balde: "C", motivo: "transient" };
  if (SUFIXOS_TECNICOS.some((s) => m.modelo.endsWith(s)))
    return { balde: "C", motivo: "sufixo_tecnico" };
  if (PREFIXOS_UI_INFRA.has(dominioDe(m.modelo)))
    return { balde: "C", motivo: "prefixo_ui_infra" };
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/discovery/baldes/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/baldes/classify.ts src/lib/discovery/baldes/classify.test.ts
git commit -m "feat(discovery): filtro offline de C-tecnico (transient/sufixo/prefixo) (R2)"
```

---

## Task 3: classify, classificarComCount

**Files:**
- Modify: `src/lib/discovery/baldes/classify.ts`
- Test: `src/lib/discovery/baldes/classify.test.ts`

- [ ] **Step 1: Adicionar testes (append no mesmo arquivo)**

```ts
// adicionar ao final de classify.test.ts
import { classificarComCount } from "./classify";

describe("classificarComCount", () => {
  it("count >= 51 -> A", () => {
    expect(classificarComCount(m("sped.documento"), 211000)).toEqual({
      balde: "A",
      motivo: "volume_acima_threshold",
    });
    expect(classificarComCount(m("crm.lead"), 51)).toEqual({
      balde: "A",
      motivo: "volume_acima_threshold",
    });
  });
  it("count <= 50 em prefixo de negócio -> B", () => {
    expect(classificarComCount(m("sped.mdfe"), 0)).toEqual({
      balde: "B",
      motivo: "baixo_volume_dominio_negocio",
    });
    expect(classificarComCount(m("crm.stage"), 5)).toEqual({
      balde: "B",
      motivo: "baixo_volume_dominio_negocio",
    });
  });
  it("count = 50 é fronteira de B (não A)", () => {
    expect(classificarComCount(m("finan.banco"), 50).balde).toBe("B");
  });
  it("count <= 50 em prefixo não-negócio -> C", () => {
    expect(classificarComCount(m("calendar.event"), 3)).toEqual({
      balde: "C",
      motivo: "baixo_volume_nao_negocio",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/discovery/baldes/classify.test.ts`
Expected: FAIL ("classificarComCount is not a function").

- [ ] **Step 3: Implementar (append em classify.ts)**

```ts
// adicionar a classify.ts
import { BALDE_A_MIN, PREFIXOS_NEGOCIO } from "./constants";
import type { Balde } from "./types";

/** Classifica um modelo que passou o filtro offline, dado o count medido. */
export function classificarComCount(
  m: ModeloSchema,
  count: number,
): { balde: Balde; motivo: Motivo } {
  if (count >= BALDE_A_MIN) return { balde: "A", motivo: "volume_acima_threshold" };
  if (PREFIXOS_NEGOCIO.has(dominioDe(m.modelo)))
    return { balde: "B", motivo: "baixo_volume_dominio_negocio" };
  return { balde: "C", motivo: "baixo_volume_nao_negocio" };
}
```

Nota: juntar os imports de `./constants` e `./types` numa linha cada no topo do
arquivo (não duplicar a declaração `import`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/discovery/baldes/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/baldes/classify.ts src/lib/discovery/baldes/classify.test.ts
git commit -m "feat(discovery): classificacao A/B/C por volume com threshold 50 (R2)"
```

---

## Task 4: classify, previsaoAtivacao

**Files:**
- Modify: `src/lib/discovery/baldes/classify.ts`
- Test: `src/lib/discovery/baldes/classify.test.ts`

- [ ] **Step 1: Adicionar testes**

```ts
// append em classify.test.ts
import { previsaoAtivacao } from "./classify";

describe("previsaoAtivacao", () => {
  it("count > 0 -> em_uso", () => {
    expect(previsaoAtivacao(5, [0, 0])).toBe("em_uso");
  });
  it("count 0 mas outro modelo do prefixo tem dado -> instalado_sem_uso", () => {
    expect(previsaoAtivacao(0, [0, 12, 0])).toBe("instalado_sem_uso");
  });
  it("count 0 e prefixo inteiro vazio -> sem_sinal", () => {
    expect(previsaoAtivacao(0, [0, 0])).toBe("sem_sinal");
    expect(previsaoAtivacao(0, [])).toBe("sem_sinal");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/discovery/baldes/classify.test.ts`
Expected: FAIL ("previsaoAtivacao is not a function").

- [ ] **Step 3: Implementar (append em classify.ts)**

```ts
// adicionar a classify.ts (importar PrevisaoAtivacao no import de ./types)
/**
 * Sinal de ativação de um modelo do Balde B.
 * @param count count do próprio modelo (0..50)
 * @param outrosCountsDoPrefixo counts dos demais modelos do mesmo prefixo
 */
export function previsaoAtivacao(
  count: number,
  outrosCountsDoPrefixo: number[],
): PrevisaoAtivacao {
  if (count > 0) return "em_uso";
  if (outrosCountsDoPrefixo.some((c) => c > 0)) return "instalado_sem_uso";
  return "sem_sinal";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/discovery/baldes/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Consolidar o topo de classify.ts (review Q2)**

Garantir que o cabeçalho de imports de `classify.ts` está EXATAMENTE assim (uma
linha por origem, sem duplicar `import` acumulado das Tasks 2-4):

```ts
import { BALDE_A_MIN, PREFIXOS_NEGOCIO, PREFIXOS_UI_INFRA, SUFIXOS_TECNICOS } from "./constants";
import type { Balde, Motivo, ModeloSchema, PrevisaoAtivacao } from "./types";
```

Run: `npx tsc --noEmit && npx jest src/lib/discovery/baldes/classify.test.ts`
Expected: PASS (sem erro de import duplicado).

- [ ] **Step 6: Commit**

```bash
git add src/lib/discovery/baldes/classify.ts src/lib/discovery/baldes/classify.test.ts
git commit -m "feat(discovery): sinal previsao_ativacao do Balde B (R2)"
```

---

## Task 5: error-kind, mapear erro do OdooClient para TipoErroRpc

**Files:**
- Create: `src/lib/discovery/baldes/error-kind.ts`
- Test: `src/lib/discovery/baldes/error-kind.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/discovery/baldes/error-kind.test.ts
import { tipoErroRpc, classificarComErro } from "./error-kind";
import {
  OdooError,
  OdooAccessError,
  OdooPoolExhaustedError,
  OdooUnavailableError,
  OdooMissingError,
  OdooInternalError,
  OdooRpcFault,
} from "@/worker/odoo/client";

describe("tipoErroRpc", () => {
  it("OdooAccessError -> acesso_negado", () => {
    expect(tipoErroRpc(new OdooAccessError("not allowed"))).toBe("acesso_negado");
  });
  it("pool/unavailable -> transitorio", () => {
    expect(tipoErroRpc(new OdooPoolExhaustedError("pool"))).toBe("transitorio");
    expect(tipoErroRpc(new OdooUnavailableError("503"))).toBe("transitorio");
  });
  it("OdooError puro (rede/timeout após retries) -> transitorio", () => {
    expect(tipoErroRpc(new OdooError("falhou após 3 tentativas"))).toBe("transitorio");
  });
  it("fault de servidor persistente não-acesso -> abstract", () => {
    expect(tipoErroRpc(new OdooMissingError("não existe"))).toBe("abstract");
    expect(tipoErroRpc(new OdooInternalError("erro"))).toBe("abstract");
    expect(tipoErroRpc(new OdooRpcFault({ data: { name: "X" } }))).toBe("abstract");
  });
  it("erro desconhecido (não-Odoo) -> transitorio", () => {
    expect(tipoErroRpc(new Error("network"))).toBe("transitorio");
  });
});

describe("classificarComErro", () => {
  it("acesso_negado -> C", () => {
    expect(classificarComErro("acesso_negado")).toEqual({
      balde: "C",
      motivo: "acesso_negado",
    });
  });
  it("abstract -> C", () => {
    expect(classificarComErro("abstract")).toEqual({
      balde: "C",
      motivo: "abstract_ou_inexistente",
    });
  });
  it("transitorio -> null (vai para nao_classificados)", () => {
    expect(classificarComErro("transitorio")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/discovery/baldes/error-kind.test.ts`
Expected: FAIL ("Cannot find module './error-kind'").

- [ ] **Step 3: Implementar error-kind.ts**

```ts
// src/lib/discovery/baldes/error-kind.ts
import {
  OdooError,
  OdooAccessError,
  OdooPoolExhaustedError,
  OdooUnavailableError,
} from "@/worker/odoo/client";
import type { Motivo, TipoErroRpc } from "./types";

/**
 * Classifica um erro do OdooClient por TIPO (nunca por texto: a Tauga responde
 * em pt-BR). Ver SPEC R2 §4.5 / review B2.
 * - OdooAccessError                       -> acesso_negado (C)
 * - OdooPoolExhaustedError/Unavailable    -> transitorio   (re-rodável)
 * - OdooError "puro" (rede/timeout)       -> transitorio
 * - qualquer outra subclasse de OdooError -> abstract       (fault persistente)
 * - erro não-Odoo                         -> transitorio    (conservador)
 */
export function tipoErroRpc(e: unknown): TipoErroRpc {
  if (e instanceof OdooAccessError) return "acesso_negado";
  if (e instanceof OdooPoolExhaustedError || e instanceof OdooUnavailableError)
    return "transitorio";
  if (e instanceof OdooError) {
    // OdooError exatamente (não subclasse) = "falhou após N tentativas" (rede/timeout).
    if (e.constructor === OdooError) return "transitorio";
    return "abstract";
  }
  return "transitorio";
}

/** Traduz o TipoErroRpc em balde C (com motivo) ou null (nao_classificado). */
export function classificarComErro(
  tipo: TipoErroRpc,
): { balde: "C"; motivo: Motivo } | null {
  if (tipo === "acesso_negado") return { balde: "C", motivo: "acesso_negado" };
  if (tipo === "abstract") return { balde: "C", motivo: "abstract_ou_inexistente" };
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/discovery/baldes/error-kind.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/baldes/error-kind.ts src/lib/discovery/baldes/error-kind.test.ts
git commit -m "feat(discovery): classificacao de erro RPC por tipo, nao por texto (R2)"
```

---

## Task 6: count-client, searchCount com client injetado

**Files:**
- Create: `src/lib/discovery/baldes/count-client.ts`
- Test: `src/lib/discovery/baldes/count-client.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/discovery/baldes/count-client.test.ts
import { searchCount } from "./count-client";
import { OdooAccessError, OdooMissingError } from "@/worker/odoo/client";

/** Client fake estruturalmente compatível (só o que searchCount usa). */
function fakeClient(behavior: (model: string) => Promise<number>) {
  return {
    executeKw: <T>(model: string) => behavior(model) as unknown as Promise<T>,
  };
}

describe("searchCount", () => {
  it("sucesso -> { ok:true, count }", async () => {
    const c = fakeClient(async () => 42);
    await expect(searchCount(c, "sped.documento")).resolves.toEqual({
      ok: true,
      count: 42,
    });
  });
  it("OdooAccessError -> { ok:false, tipo: acesso_negado }", async () => {
    const c = fakeClient(async () => {
      throw new OdooAccessError("not allowed");
    });
    const r = await searchCount(c, "ir.secret");
    expect(r).toMatchObject({ ok: false, tipo: "acesso_negado" });
  });
  it("fault persistente -> { ok:false, tipo: abstract }", async () => {
    const c = fakeClient(async () => {
      throw new OdooMissingError("não existe");
    });
    const r = await searchCount(c, "abstract.model");
    expect(r).toMatchObject({ ok: false, tipo: "abstract" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/discovery/baldes/count-client.test.ts`
Expected: FAIL ("Cannot find module './count-client'").

- [ ] **Step 3: Implementar count-client.ts**

```ts
// src/lib/discovery/baldes/count-client.ts
import { tipoErroRpc } from "./error-kind";
import type { TipoErroRpc } from "./types";

/** Interface mínima do client que searchCount precisa (facilita teste com fake). */
export interface ContadorRpc {
  executeKw<T>(model: string, method: string, args: unknown[], kwargs?: object): Promise<T>;
}

export type CountResult =
  | { ok: true; count: number }
  | { ok: false; tipo: TipoErroRpc; mensagem: string };

/** Conta registros de um modelo via search_count, classificando o erro por tipo. */
export async function searchCount(
  client: ContadorRpc,
  model: string,
): Promise<CountResult> {
  try {
    const count = await client.executeKw<number>(model, "search_count", [[]]);
    return { ok: true, count };
  } catch (e) {
    return {
      ok: false,
      tipo: tipoErroRpc(e),
      mensagem: e instanceof Error ? e.message : String(e),
    };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/discovery/baldes/count-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/baldes/count-client.ts src/lib/discovery/baldes/count-client.test.ts
git commit -m "feat(discovery): searchCount com client injetado e erro tipado (R2)"
```

---

## Task 7: report, gerarRelatorio markdown

**Files:**
- Create: `src/lib/discovery/baldes/report.ts`
- Test: `src/lib/discovery/baldes/report.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/discovery/baldes/report.test.ts
import { gerarRelatorio } from "./report";
import type { ResultadoBaldes } from "./types";

const base: ResultadoBaldes = {
  gerado_em: "2026-05-29T12:00:00.000Z",
  fonte_schema: "discovery/odoo-schema/schema.json",
  rodou_sob_uid: 11,
  thresholds: { balde_a_min: 51, balde_b_max: 50 },
  totais: { A: 1, B: 1, C: 1, nao_classificados: 0, total: 3 },
  por_dominio: {
    sped: { A: 1, B: 1, C: 0, nao_classificados: 0 },
    ir: { A: 0, B: 0, C: 1, nao_classificados: 0 },
  },
  modelos: {
    "sped.documento": {
      dominio: "sped",
      descricao: "Documento Fiscal",
      balde: "A",
      count: 211000,
      transient: false,
      motivo: "volume_acima_threshold",
    },
    "sped.mdfe": {
      dominio: "sped",
      descricao: "MDF-e",
      balde: "B",
      count: 0,
      transient: false,
      motivo: "baixo_volume_dominio_negocio",
      previsao_ativacao: "sem_sinal",
    },
    "ir.cron": {
      dominio: "ir",
      descricao: "Agendador",
      balde: "C",
      count: null,
      transient: false,
      motivo: "prefixo_ui_infra",
    },
  },
  nao_classificados: [],
};

describe("gerarRelatorio", () => {
  it("inclui sumário com totais", () => {
    const md = gerarRelatorio(base);
    expect(md).toContain("# Baldes");
    expect(md).toContain("Balde A");
    expect(md).toContain("211000");
  });
  it("destaca os domínios prioritários (só A e B acionáveis)", () => {
    const md = gerarRelatorio(base);
    expect(md).toContain("Domínios prioritários");
    expect(md).toContain("sped.documento"); // A
    expect(md).toContain("sped.mdfe"); // B
    expect(md).not.toContain("ir.cron"); // C-técnico não aparece nas linhas
  });
  it("mostra a descrição humana dos modelos", () => {
    expect(gerarRelatorio(base)).toContain("Documento Fiscal");
  });
  it("agrega o Balde C por motivo (spec §5.2)", () => {
    const md = gerarRelatorio(base);
    expect(md).toContain("Balde C por motivo");
    expect(md).toContain("prefixo_ui_infra");
  });
  it("não usa travessão", () => {
    expect(gerarRelatorio(base)).not.toContain("—");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/discovery/baldes/report.test.ts`
Expected: FAIL ("Cannot find module './report'").

- [ ] **Step 3: Implementar report.ts**

```ts
// src/lib/discovery/baldes/report.ts
import { DOMINIOS_PRIORITARIOS } from "./constants";
import type { EntradaBalde, ResultadoBaldes } from "./types";

function linhasModelos(
  modelos: Record<string, EntradaBalde>,
  filtro: (e: EntradaBalde) => boolean,
): string[] {
  return Object.entries(modelos)
    .filter(([, e]) => filtro(e))
    .sort((a, b) => (b[1].count ?? -1) - (a[1].count ?? -1))
    .map(([nome, e]) => {
      const c = e.count == null ? "n/d" : String(e.count);
      const prev = e.previsao_ativacao ? `, ${e.previsao_ativacao}` : "";
      return `| \`${nome}\` | ${e.descricao} | ${e.balde} | ${c} | ${e.motivo}${prev} |`;
    });
}

/** Gera o relatório markdown legível a partir do resultado da classificação. */
export function gerarRelatorio(r: ResultadoBaldes): string {
  const out: string[] = [];
  out.push("# Baldes do Discovery enxuto (R2)");
  out.push("");
  out.push(`Gerado em ${r.gerado_em} (uid ${r.rodou_sob_uid ?? "n/d"}).`);
  out.push(`Fonte: \`${r.fonte_schema}\`. Threshold A: count >= ${r.thresholds.balde_a_min}.`);
  out.push("");
  out.push("## Sumário");
  out.push("");
  out.push("| Balde | Significado | Modelos |");
  out.push("|---|---|---:|");
  out.push(`| Balde A | tem dado real (> ${r.thresholds.balde_b_max}) | ${r.totais.A} |`);
  out.push(`| Balde B | legítimo, vazio/baixo hoje | ${r.totais.B} |`);
  out.push(`| Balde C | inútil técnico | ${r.totais.C} |`);
  out.push(`| Não classificados | erro transitório de RPC | ${r.totais.nao_classificados} |`);
  out.push(`| **Total** | | **${r.totais.total}** |`);
  out.push("");

  out.push("## Por domínio");
  out.push("");
  out.push("| Domínio | A | B | C | Não class. |");
  out.push("|---|---:|---:|---:|---:|");
  for (const [dom, c] of Object.entries(r.por_dominio).sort()) {
    out.push(`| ${dom} | ${c.A} | ${c.B} | ${c.C} | ${c.nao_classificados} |`);
  }
  out.push("");

  out.push("## Domínios prioritários");
  out.push("");
  for (const dom of DOMINIOS_PRIORITARIOS) {
    const c = r.por_dominio[dom];
    out.push(`### ${dom}` + (c ? ` (A:${c.A} B:${c.B} C:${c.C})` : " (sem modelos)"));
    out.push("");
    if (c && c.C > 0) out.push(`_${c.C} técnicos (Balde C) omitidos desta lista._`);
    out.push("| Modelo | Descrição | Balde | Count | Motivo |");
    out.push("|---|---|---|---:|---|");
    // Só A e B (acionáveis); C é ruído na visão "o que vira tool" (review P3).
    out.push(...linhasModelos(r.modelos, (e) => e.dominio === dom && e.balde !== "C"));
    out.push("");
  }

  // Balde C por motivo (spec §5.2 / review Q1): auditabilidade do filtro.
  const cPorMotivo = new Map<string, number>();
  for (const e of Object.values(r.modelos)) {
    if (e.balde === "C") cPorMotivo.set(e.motivo, (cPorMotivo.get(e.motivo) ?? 0) + 1);
  }
  out.push("## Balde C por motivo");
  out.push("");
  out.push("| Motivo | Modelos |");
  out.push("|---|---:|");
  for (const [motivo, n] of [...cPorMotivo.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`| ${motivo} | ${n} |`);
  }
  out.push("");

  if (r.nao_classificados.length) {
    out.push("## Não classificados (re-rodar)");
    out.push("");
    out.push("```bash");
    out.push(
      `npm run discovery:baldes -- --only ${r.nao_classificados.map((n) => n.modelo).join(",")}`,
    );
    out.push("```");
    out.push("");
    for (const n of r.nao_classificados) {
      out.push(`- \`${n.modelo}\`: ${n.erro}`);
    }
    out.push("");
  }

  return out.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/discovery/baldes/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/baldes/report.ts src/lib/discovery/baldes/report.test.ts
git commit -m "feat(discovery): gerador de relatorio markdown dos baldes (R2)"
```

---

## Task 8: aggregate, recomputar totais/por_dominio (P1)

**Files:**
- Create: `src/lib/discovery/baldes/aggregate.ts`
- Test: `src/lib/discovery/baldes/aggregate.test.ts`

> Núcleo da garantia da review A7: agregados são SEMPRE derivados do dict
> `modelos` (fonte única da verdade), inclusive após merge no `--only`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/discovery/baldes/aggregate.test.ts
import { agregar } from "./aggregate";
import type { EntradaBalde, NaoClassificado } from "./types";

const e = (dominio: string, balde: "A" | "B" | "C"): EntradaBalde => ({
  dominio,
  descricao: dominio,
  balde,
  count: balde === "A" ? 100 : balde === "B" ? 0 : null,
  transient: false,
  motivo: balde === "A" ? "volume_acima_threshold" : "baixo_volume_dominio_negocio",
});

describe("agregar", () => {
  it("conta por balde e total", () => {
    const r = agregar(
      { "a.x": e("a", "A"), "a.y": e("a", "B"), "b.z": e("b", "C") },
      [],
    );
    expect(r.totais).toEqual({ A: 1, B: 1, C: 1, nao_classificados: 0, total: 3 });
  });
  it("agrupa por domínio", () => {
    const r = agregar({ "a.x": e("a", "A"), "a.y": e("a", "A") }, []);
    expect(r.por_dominio.a).toEqual({ A: 2, B: 0, C: 0, nao_classificados: 0 });
  });
  it("inclui nao_classificados no domínio e no total", () => {
    const nao: NaoClassificado[] = [{ modelo: "c.w", erro: "timeout" }];
    const r = agregar({ "a.x": e("a", "A") }, nao);
    expect(r.totais).toEqual({ A: 1, B: 0, C: 0, nao_classificados: 1, total: 2 });
    expect(r.por_dominio.c).toEqual({ A: 0, B: 0, C: 0, nao_classificados: 1 });
  });
  it("soma por domínio fecha com o total do domínio (partição)", () => {
    const r = agregar(
      { "a.x": e("a", "A"), "a.y": e("a", "B"), "a.z": e("a", "C") },
      [{ modelo: "a.w", erro: "x" }],
    );
    const d = r.por_dominio.a;
    expect(d.A + d.B + d.C + d.nao_classificados).toBe(4);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/discovery/baldes/aggregate.test.ts`
Expected: FAIL ("Cannot find module './aggregate'").

- [ ] **Step 3: Implementar aggregate.ts**

```ts
// src/lib/discovery/baldes/aggregate.ts
import { dominioDe } from "./classify";
import type {
  ContagemBaldes,
  EntradaBalde,
  NaoClassificado,
  ResultadoBaldes,
} from "./types";

export const contagemZero = (): ContagemBaldes => ({
  A: 0,
  B: 0,
  C: 0,
  nao_classificados: 0,
});

/** Recomputa totais e por_dominio a partir do dict de modelos (fonte da verdade). */
export function agregar(
  modelos: Record<string, EntradaBalde>,
  nao: NaoClassificado[],
): Pick<ResultadoBaldes, "totais" | "por_dominio"> {
  const por: Record<string, ContagemBaldes> = {};
  const tot = contagemZero();
  for (const entrada of Object.values(modelos)) {
    por[entrada.dominio] ??= contagemZero();
    por[entrada.dominio][entrada.balde]++;
    tot[entrada.balde]++;
  }
  for (const n of nao) {
    const dom = dominioDe(n.modelo);
    por[dom] ??= contagemZero();
    por[dom].nao_classificados++;
    tot.nao_classificados++;
  }
  const total = tot.A + tot.B + tot.C + tot.nao_classificados;
  return { totais: { ...tot, total }, por_dominio: por };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/discovery/baldes/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/baldes/aggregate.ts src/lib/discovery/baldes/aggregate.test.ts
git commit -m "feat(discovery): agregacao de totais/por_dominio derivada dos modelos (R2)"
```

---

## Task 9: run.ts, orquestrador CLI

**Files:**
- Create: `scripts/discovery/baldes/run.ts`

> Sem teste jest (vive em `scripts/`, fora dos roots). Validado no E2E (Task 10).
> O núcleo que ele chama já é 100% testado (Tasks 2 a 7).

- [ ] **Step 1: Implementar run.ts**

```ts
#!/usr/bin/env tsx
/**
 * R2 Discovery enxuto: classifica os 652 modelos do Odoo em 3 baldes.
 * Spec: docs/superpowers/specs/2026-05-29-r2-discovery-enxuto-spec.md v3.
 *
 * CLI:
 *   npm run discovery:baldes                # passe completo
 *   npm run discovery:baldes -- --dry-run   # imprime totais, não escreve
 *   npm run discovery:baldes -- --limit 30  # só os 30 primeiros (smoke)
 *   npm run discovery:baldes -- --only a.b,c.d  # reclassifica e faz merge
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { clientFromEnv, type OdooClient } from "@/worker/odoo/client";
import {
  classificarOffline,
  classificarComCount,
  previsaoAtivacao,
  dominioDe,
} from "@/lib/discovery/baldes/classify";
import { classificarComErro } from "@/lib/discovery/baldes/error-kind";
import { searchCount } from "@/lib/discovery/baldes/count-client";
import { agregar } from "@/lib/discovery/baldes/aggregate";
import { gerarRelatorio } from "@/lib/discovery/baldes/report";
import { BALDE_A_MIN, BALDE_B_MAX } from "@/lib/discovery/baldes/constants";
import type {
  EntradaBalde,
  ModeloSchema,
  NaoClassificado,
  ResultadoBaldes,
} from "@/lib/discovery/baldes/types";

const ROOT = process.cwd();
const SCHEMA_PATH = "discovery/odoo-schema/schema.json";
const JSON_OUT = "discovery/odoo-schema/baldes.json";
const REPORT_OUT = "docs/discovery/2026-05-29-baldes.md";
const CONCORRENCIA = 6;

interface SchemaEntry {
  name?: string;
  transient?: boolean;
}

interface CliArgs {
  dryRun: boolean;
  limit: number | null;
  only: string[] | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, limit: null, only: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = parseInt(argv[++i] ?? "0", 10);
    else if (a === "--only") args.only = (argv[++i] ?? "").split(",").filter(Boolean);
  }
  return args;
}

function carregarModelos(): ModeloSchema[] {
  const raw = JSON.parse(readFileSync(resolve(ROOT, SCHEMA_PATH), "utf8")) as Record<
    string,
    SchemaEntry
  >;
  return Object.entries(raw).map(([modelo, v]) => ({
    modelo,
    descricao: v.name ?? modelo,
    transient: Boolean(v.transient),
  }));
}

/** Roda fn sobre items com pool de concorrência fixo. */
async function comPool<T, R>(
  items: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return out;
}

async function classificarTudo(
  modelos: ModeloSchema[],
  client: OdooClient,
): Promise<{ modelos: Record<string, EntradaBalde>; nao: NaoClassificado[] }> {
  const entradas: Record<string, EntradaBalde> = {};
  const nao: NaoClassificado[] = [];
  // Counts por prefixo, para previsao_ativacao (precisa do panorama do prefixo).
  const countsPorPrefixo = new Map<string, number[]>();

  // Fase 1: offline + RPC, coletando counts.
  type Pendente = { m: ModeloSchema; count: number };
  const pendentesB: Pendente[] = [];
  await comPool(modelos, CONCORRENCIA, async (m) => {
    const off = classificarOffline(m);
    if (off) {
      entradas[m.modelo] = {
        dominio: dominioDe(m.modelo),
        descricao: m.descricao,
        balde: off.balde,
        count: null,
        transient: m.transient,
        motivo: off.motivo,
      };
      return;
    }
    const r = await searchCount(client, m.modelo);
    if (!r.ok) {
      const viaErro = classificarComErro(r.tipo);
      if (viaErro) {
        entradas[m.modelo] = {
          dominio: dominioDe(m.modelo),
          descricao: m.descricao,
          balde: viaErro.balde,
          count: null,
          transient: m.transient,
          motivo: viaErro.motivo,
        };
      } else {
        nao.push({ modelo: m.modelo, erro: r.mensagem });
      }
      return;
    }
    const cls = classificarComCount(m, r.count);
    const dom = dominioDe(m.modelo);
    countsPorPrefixo.set(dom, [...(countsPorPrefixo.get(dom) ?? []), r.count]);
    if (cls.balde === "B") {
      pendentesB.push({ m, count: r.count });
    }
    entradas[m.modelo] = {
      dominio: dom,
      descricao: m.descricao,
      balde: cls.balde,
      count: r.count,
      transient: m.transient,
      motivo: cls.motivo,
    };
  });

  // Fase 2: previsao_ativacao do Balde B (agora que temos counts por prefixo).
  // count > 0 já curto-circuita para em_uso dentro de previsaoAtivacao, então
  // passar a lista completa do prefixo como "outros" é equivalente e mais simples
  // (review P2): para count === 0, o próprio 0 não afeta o teste `.some(c > 0)`.
  for (const { m, count } of pendentesB) {
    const todos = countsPorPrefixo.get(dominioDe(m.modelo)) ?? [];
    entradas[m.modelo].previsao_ativacao = previsaoAtivacao(count, todos);
  }

  return { modelos: entradas, nao };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const client = clientFromEnv("read");
  const uid = await client.authenticate();

  let modelos = carregarModelos();
  if (args.only) {
    const set = new Set(args.only);
    modelos = modelos.filter((m) => set.has(m.modelo));
  } else if (args.limit != null) {
    modelos = modelos.slice(0, args.limit);
  }
  console.log(`[baldes] uid=${uid} modelos a classificar: ${modelos.length}`);

  const { modelos: novas, nao } = await classificarTudo(modelos, client);

  // Merge com baldes.json existente quando --only.
  let modelosFinais = novas;
  let naoFinais = nao;
  if (args.only && existsSync(resolve(ROOT, JSON_OUT))) {
    const prev = JSON.parse(readFileSync(resolve(ROOT, JSON_OUT), "utf8")) as ResultadoBaldes;
    modelosFinais = { ...prev.modelos, ...novas };
    const reprocessados = new Set(Object.keys(novas));
    naoFinais = [
      ...prev.nao_classificados.filter((n) => !reprocessados.has(n.modelo)),
      ...nao,
    ];
  }

  const { totais, por_dominio } = agregar(modelosFinais, naoFinais);
  const resultado: ResultadoBaldes = {
    gerado_em: new Date().toISOString(),
    fonte_schema: SCHEMA_PATH,
    rodou_sob_uid: uid,
    thresholds: { balde_a_min: BALDE_A_MIN, balde_b_max: BALDE_B_MAX },
    totais,
    por_dominio,
    modelos: modelosFinais,
    nao_classificados: naoFinais,
  };

  console.log(
    `[baldes] A=${totais.A} B=${totais.B} C=${totais.C} ` +
      `nao_class=${totais.nao_classificados} total=${totais.total}`,
  );

  if (args.dryRun) {
    console.log("[baldes] --dry-run: nada escrito.");
    return;
  }

  mkdirSync(resolve(ROOT, "docs/discovery"), { recursive: true });
  writeFileSync(resolve(ROOT, JSON_OUT), JSON.stringify(resultado, null, 2) + "\n");
  writeFileSync(resolve(ROOT, REPORT_OUT), gerarRelatorio(resultado));
  console.log(`[baldes] escrito ${JSON_OUT} e ${REPORT_OUT}`);
}

main().catch((e) => {
  console.error("[baldes] erro fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/discovery/baldes/run.ts
git commit -m "feat(discovery): orquestrador CLI do passe de baldes (R2)"
```

---

## Task 10: package.json, script discovery:baldes

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Adicionar a linha de script**

No bloco `"scripts"`, logo após `"gen:mcp-catalog"`, adicionar:

```json
    "discovery:baldes": "tsx --env-file=.env.local scripts/discovery/baldes/run.ts",
```

(garantir vírgula correta entre as entradas).

- [ ] **Step 2: Verificar que o script é reconhecido**

Run: `npm run discovery:baldes -- --dry-run --limit 5`
Expected: autentica, imprime totais de 5 modelos, "nada escrito". (Requer
`.env.local` com `ODOO_*` válidos; é a primeira chamada real ao Tauga.)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(discovery): npm script discovery:baldes (R2)"
```

---

## Task 11: Verificação E2E contra a Tauga + artefatos

**Files:**
- Generate: `discovery/odoo-schema/baldes.json`
- Generate: `docs/discovery/2026-05-29-baldes.md`

- [ ] **Step 1: tsc + eslint + jest verdes**

Run: `npx tsc --noEmit && npx eslint src/lib/discovery/ scripts/discovery/ && npx jest src/lib/discovery/`
Expected: tudo PASS.

- [ ] **Step 2: Passe completo contra a Tauga**

Run: `npm run discovery:baldes`
Expected: imprime `uid=<N>` e `A=.. B=.. C=.. nao_class=.. total=652`; escreve os 2
artefatos. Conferir (review P5/D5) que `uid` é o quase-admin (`joaozanini`, uid 11);
se o `.env.local` apontar usuário restrito, muitos `acesso_negado` falsos inflariam
o Balde C, então o passe definitivo deve rodar sob a credencial de maior alcance. O
`rodou_sob_uid` registrado no `baldes.json` documenta qual rodou.

- [ ] **Step 3: Gate de partição (review A6)**

Verificar no `baldes.json`:
- `totais.total === 652` e `A + B + C + nao_classificados === 652`.
- `totais.nao_classificados === 0` (se > 0, rodar `npm run discovery:baldes -- --only <lista>` e repetir).
- 0 não-classificados nos 5 prioritários (`sped`, `crm`, `pedido`, `finan`, `contabil`).

- [ ] **Step 4: Conferência de ground-truth (censo)**

Conferir no `baldes.json` que caem em Balde A:
- `sped.tabela.preco.regra` (censo: 11.864)
- `sped.consulta.dfe.item` (censo: 4.452)
- `sped.documento` (~211k da F4)
E que `crm.*` cai em Balde B com `previsao_ativacao: "sem_sinal"`.
Amostrar ~10 classificações no relatório e conferir se fazem sentido de negócio.

- [ ] **Step 5: Commit dos artefatos**

```bash
git add discovery/odoo-schema/baldes.json docs/discovery/2026-05-29-baldes.md
git commit -m "feat(discovery): baldes.json + relatorio dos 652 modelos classificados (R2)"
```

- [ ] **Step 6: Atualizar STATUS.md e HISTORY.md**

Marcar R2 entregue no `STATUS.md` (próxima etapa: O1 SPED Fiscal) e adicionar linha no `docs/agents/HISTORY.md`. Commit:

```bash
git add STATUS.md docs/agents/HISTORY.md
git commit -m "docs: R2 Discovery enxuto entregue; proxima etapa O1 (R2)"
```

---

## Self-Review (cobertura da spec)

- §4.1 offline C (transient/sufixo/prefixo): Task 2. ✓
- §4.2 A/B por count: Task 3. ✓
- §4.3 previsao_ativacao: Task 4. ✓
- §4.5 erro por tipo: Task 5. ✓
- §3/§4 search_count via OdooClient: Task 6 + Task 8. ✓
- §5.1 schema do baldes.json (count null, descricao, por_dominio c/ nao_class): Tasks 1, 8. ✓
- §5.2 relatório + 5 prioritários + Balde C por motivo: Task 7. ✓
- §6 idempotência (--only recomputa agregados via aggregate.ts, --dry-run, --limit): Tasks 8, 9. ✓
- §8 verificação + gate + ground-truth: Task 10. ✓
- D5 rodou_sob_uid: Task 8 (uid da autenticação). ✓
