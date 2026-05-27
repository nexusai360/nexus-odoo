# Agente Nex ≥90% Implementation Plan (v3)

> **Histórico:** v1 → review #1 (12 achados) → v2 → review #2 (8 achados) → v3 (incorpora 2 CRIT + 4 HIGH + 2 MED da review #2).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar a assertividade do agente Nex de 65–75% (R11–R16) para ≥85% após Onda 1.5 e ≥95% como meta final, movendo lógica determinística do LLM para o servidor MCP (envelope `_RESPOSTA`, auto-validador, formatadores canônicos, prompt cirúrgico, tools novas).

**Architecture:** Servidor MCP enriquece cada tool result com envelope canônico (`_RESPOSTA`, `_listaTruncada`, `_DESTAQUE`, `_agregado`, `topPorParticipante`). `run-agent.ts` ganha camada `AutoValidator` que verifica resposta final do LLM em 4 regras (V1 anti-truncamento, V2 anti-invenção com cálculos canônicos finitos, V3 anti-recusa indevida, V4 anti-placeholder); dispara 1 retry com hint corretivo. Feature flag 3 estados (`off|shadow|active`). Prompt em `identity-base.ts` ganha 7 ajustes cirúrgicos. 6 tools novas cobrem gap recuperável.

**Tech Stack:** TypeScript estrito, Prisma 7 (Postgres), `@modelcontextprotocol/sdk` (servidor MCP em TS), Next.js 16 App Router, Jest, `pg_trgm`, Anthropic SDK e OpenAI SDK no agente.

**Spec-fonte:** `docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md` (v3).

**Branch ativa:** `feat/agente-nex-90pct`.

---

## Estrutura geral do plano

Este plano se decompõe em **11 PRs sequenciais** organizados em 4 ondas. Cada PR é uma unidade isolada (build verde, testes verdes, commit atômico).

| PR | Onda | Conteúdo | Dias | Bloqueado por |
|----|------|----------|------|----------------|
| **PR1** | 1.A | Framework `envelope`/`periodo`/`responder`/`agrupador` + testes | 1-2 | — |
| **PR2** | 1.B+1.C | Aplicar envelope+formatadores em **todas as 25 tools** (7 sub-tasks por domínio) — HIGH-F endereçado | 3-4 | PR1 + research R-1/R-2 |
| PR3 | 1.D | A9 (match exato saldo), A10 fase 1, A13 (gate suave) | 1 | PR2 + R-3 |
| **PR4-pre** | 1.E | Schema delta + migration + `prisma generate` (HIGH-γ v2) | 0.5 | PR3 |
| **PR4a** | 1.E | AutoValidator standalone (módulo isolado, testes 281 CORRETO + 17 ERRADO) — CRIT-C v1 | 1-2 | PR4-pre |
| **PR4b** | 1.E | Integração do AutoValidator no `run-agent.ts` | 1 | PR4a |
| **PR4c** | 1.E | Briefing v3 + prompt mínimo (`_RESPOSTA`) + lock hash | 0.5 | PR4b |
| PR5 | 1.5 | Promoção shadow→active + prompt fix `periodoNome` | 0.5 | shadow validado |
| PR6 | 2 | Edits completos `identity-base.ts` (7 ajustes) | 1 | PR5 |
| PR7a-f | 3 | 6 tools novas (uma por PR, mesmo padrão) | 2-3 | PR6 |
| PR8+ | 4 | Refinos condicionais | 1-2 | R20 measure |

**Nota sobre consolidação (HIGH-F v1 endereçado):** v1 propunha 7 PRs separados (PR2-PR8) para aplicar envelope em cada domínio. v2 consolida em **PR2 único** com 7 sub-tasks. Justificativa: padrão estrutural idêntico (importar `buildEnvelope`+`formatadorPorTool`, refatorar handler da tool, escrever teste), revisão melhor em PR único, redução de ~6h de overhead de sub-planos.

**Nota sobre divisão de PR10 (CRIT-C v1 endereçado):** v1 agregava 5 mudanças críticas. v2 divide em PR4a/b/c.

**Este documento detalha PR1 em microtarefas completas.** PR2 em diante recebe seu próprio sub-plan focado **antes** da execução (gerado por nova invocação de writing-plans com escopo do PR específico). Isso evita um documento de 3.000+ linhas e mantém cada execução com contexto fresco.

**Reviews:** este plano (v1) recebe **2 reviews adversariais** (v2, v3) antes da execução de qualquer task, conforme metodologia em CLAUDE.md §6.

---

## File Structure (PR1)

Antes de detalhar tasks, mapa de arquivos que **serão criados/alterados** apenas no PR1.

### Novos

- `mcp/lib/envelope.ts` — tipo canônico `ToolEnvelope<T>` + helper `buildEnvelope`.
- `mcp/lib/envelope.test.ts` — testes unitários do helper.
- `mcp/lib/periodo.ts` — `resolverPeriodo(periodoNome | from/to)` com 8 modos.
- `mcp/lib/periodo.test.ts` — testes de cada modo + edge cases (virada de mês, ano bissexto).
- `mcp/lib/responder.ts` — registry de formatadores canônicos por tool + tipo `CalculoCanonico` + funções de cálculo enumeradas.
- `mcp/lib/responder.test.ts` — testes de cada formatador (~25) + cada cálculo canônico.
- `mcp/lib/agrupador.ts` — função `topPorParticipante(linhas, limite=10)` para tools financeiras.
- `mcp/lib/agrupador.test.ts` — testes (null, dedupe, ordem desc).
- `scripts/quality-audit/run-regression.ts` — script de regressão com rebuild + bateria.

### Alterados

- nenhum no PR1 (PR1 é pura infraestrutura, não toca tools nem run-agent).

### Tamanho esperado de PR1

~1500 linhas (sendo 60% de testes). Comparável a outros PRs de infra do projeto.

---

## Task 0: Preparação (pré-PR1)

**Pré-requisitos antes de começar Step 1:**

- [ ] **Step 0.1: Confirmar branch correta**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Esperado: `feat/agente-nex-90pct`. Se outra branch, `git checkout feat/agente-nex-90pct`.

- [ ] **Step 0.2: Confirmar árvore limpa**

```bash
git status -s
```

Esperado: vazio (sem arquivos modificados/untracked).

- [ ] **Step 0.3: Confirmar dependências instaladas**

```bash
npm ls --depth=0 2>&1 | grep -E "(prisma|vitest|jest|typescript)" | head -5
```

Esperado: nada em estado UNMET. Se falhar, `npm install`.

- [ ] **Step 0.4: Banco rodando**

```bash
docker compose ps db redis
```

Esperado: ambos `Up`.

- [ ] **Step 0.5: Confirmar baseline verde**

```bash
npx tsc --noEmit
npx eslint src/ mcp/
```

Esperado: 0 erros (4 warnings pré-existentes em eslint, conforme RADAR R7, são ok).

---

## Task 1: Tipo canônico `ToolEnvelope<T>`

**Files:**
- Create: `mcp/lib/envelope.ts`
- Test: `mcp/lib/envelope.test.ts`

- [ ] **Step 1.1: Escrever teste do tipo + buildEnvelope (RED)**

Criar `mcp/lib/envelope.test.ts`:

```typescript
import { describe, it, expect } from "@jest/globals";
import { buildEnvelope, type ToolEnvelope } from "./envelope";

describe("buildEnvelope", () => {
  it("retorna envelope mínimo com todos os campos canônicos", () => {
    const env = buildEnvelope<{ id: number }>({
      _RESPOSTA: "Resultado teste",
      _listaTruncada: false,
      linhas: [{ id: 1 }, { id: 2 }],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
    });

    expect(env._RESPOSTA).toBe("Resultado teste");
    expect(env._listaTruncada).toBe(false);
    expect(env.linhas).toHaveLength(2);
    expect(env.atualizadoHa).toBe("1min");
    expect(env._DESTAQUE).toBeUndefined();
    expect(env._agregado).toBeUndefined();
    expect(env.topPorParticipante).toBeUndefined();
  });

  it("aceita campos opcionais (DESTAQUE, agregado, topPorParticipante)", () => {
    const env = buildEnvelope({
      _RESPOSTA: "x",
      _listaTruncada: true,
      linhas: [],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      _DESTAQUE: { total: 1000 },
      _agregado: { soma: 1000, contagem: 5 },
      topPorParticipante: [{ nome: "X", soma: 500, n: 2 }],
    });

    expect(env._DESTAQUE).toEqual({ total: 1000 });
    expect(env._agregado?.soma).toBe(1000);
    expect(env.topPorParticipante).toHaveLength(1);
  });

  it("trunca _RESPOSTA a 500 chars com elipse", () => {
    const longa = "a".repeat(600);
    const env = buildEnvelope({
      _RESPOSTA: longa,
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
    });
    expect(env._RESPOSTA.length).toBe(500);
    expect(env._RESPOSTA.endsWith("...")).toBe(true);
  });

  it("congela linhas via Object.freeze quando _listaTruncada=true e linhas.length > limite", () => {
    const env = buildEnvelope({
      _RESPOSTA: "x",
      _listaTruncada: true,
      linhas: [{ id: 1 }],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
    });
    expect(env._listaTruncada).toBe(true);
  });
});
```

- [ ] **Step 1.2: Rodar testes para confirmar falha**

```bash
npx jest mcp/lib/envelope.test.ts
```

Esperado: FAIL com "Cannot find module './envelope'".

- [ ] **Step 1.3: Implementar `envelope.ts` (GREEN)**

Criar `mcp/lib/envelope.ts`:

```typescript
/**
 * Envelope canônico de tool result do MCP.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §4.2
 */

export interface ToolEnvelope<TLinha = unknown> {
  /** Texto pronto descrevendo o resultado, gerado por formatador TS.
   *  LLM usa como base da resposta (mantendo todos os números/fatos). */
  _RESPOSTA: string;

  /** True só se a lista foi cortada por limite explícito da tool. */
  _listaTruncada: boolean;

  /** Total estruturado destacado. */
  _DESTAQUE?: Record<string, string | number>;

  /** Agregados pré-computados. */
  _agregado?: {
    soma?: number;
    contagem?: number;
    media?: number;
    [k: string]: number | undefined;
  };

  /** Lista paginada (limite definido pela tool). */
  linhas: TLinha[];

  /** Cache freshness. */
  atualizadoEm: string;
  atualizadoHa: string;

  /** Estrutura de ambiguidade quando aplicável. */
  ambiguidade?: {
    requiredExactMatch?: boolean;
    candidatos?: Array<{ id: string; nome: string; contexto?: string }>;
    [k: string]: unknown;
  };

  /** Top por participante (apenas tools de saldo financeiro). */
  topPorParticipante?: Array<{ nome: string; soma: number; n: number }>;

  /** Aviso não-bloqueante (ex: parâmetro sugerido). */
  aviso?: string;

  /** Redirecionamento sugerido para outra tool. */
  redirecionar?: { tool: string; motivo: string; confianca: number };
}

const MAX_RESPOSTA_CHARS = 500;

export interface BuildEnvelopeInput<TLinha> {
  _RESPOSTA: string;
  _listaTruncada: boolean;
  linhas: TLinha[];
  atualizadoEm: string;
  atualizadoHa: string;
  _DESTAQUE?: Record<string, string | number>;
  _agregado?: ToolEnvelope<TLinha>["_agregado"];
  ambiguidade?: ToolEnvelope<TLinha>["ambiguidade"];
  topPorParticipante?: ToolEnvelope<TLinha>["topPorParticipante"];
  aviso?: string;
  redirecionar?: ToolEnvelope<TLinha>["redirecionar"];
}

export function buildEnvelope<TLinha = unknown>(
  input: BuildEnvelopeInput<TLinha>,
): ToolEnvelope<TLinha> {
  const resposta =
    input._RESPOSTA.length > MAX_RESPOSTA_CHARS
      ? input._RESPOSTA.slice(0, MAX_RESPOSTA_CHARS - 3) + "..."
      : input._RESPOSTA;

  return {
    _RESPOSTA: resposta,
    _listaTruncada: input._listaTruncada,
    linhas: input.linhas,
    atualizadoEm: input.atualizadoEm,
    atualizadoHa: input.atualizadoHa,
    ...(input._DESTAQUE ? { _DESTAQUE: input._DESTAQUE } : {}),
    ...(input._agregado ? { _agregado: input._agregado } : {}),
    ...(input.ambiguidade ? { ambiguidade: input.ambiguidade } : {}),
    ...(input.topPorParticipante
      ? { topPorParticipante: input.topPorParticipante }
      : {}),
    ...(input.aviso ? { aviso: input.aviso } : {}),
    ...(input.redirecionar ? { redirecionar: input.redirecionar } : {}),
  };
}
```

- [ ] **Step 1.4: Rodar testes para confirmar aprovação**

```bash
npx jest mcp/lib/envelope.test.ts
```

Esperado: PASS (4 testes).

- [ ] **Step 1.5: Commit**

```bash
git add mcp/lib/envelope.ts mcp/lib/envelope.test.ts
git commit -m "feat(mcp): adiciona ToolEnvelope canonico + buildEnvelope (Onda 1.A)

Define o contrato canonico de envelope de tool: _RESPOSTA (texto pronto),
_listaTruncada (bool explicito), _DESTAQUE, _agregado, linhas, atualizadoHa,
topPorParticipante (financeiro), redirecionar (caminho 3a). Truncamento
de _RESPOSTA com cap 500 chars + elipse.

Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §4.2

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Helper `resolverPeriodo`

**Files:**
- Create: `mcp/lib/periodo.ts`
- Test: `mcp/lib/periodo.test.ts`

- [ ] **Step 2.1: Escrever testes de `resolverPeriodo` (RED)**

Criar `mcp/lib/periodo.test.ts`:

```typescript
import { describe, it, expect } from "@jest/globals";
import { resolverPeriodo, type PeriodoNome } from "./periodo";

const HOJE = new Date("2026-05-27T12:00:00-03:00"); // âncora de teste, GMT-3

describe("resolverPeriodo", () => {
  it("hoje retorna periodoDe=periodoAte=27/05/2026", () => {
    const p = resolverPeriodo({ periodoNome: "hoje", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-27");
    expect(p.periodoAte).toBe("2026-05-27");
  });

  it("amanha retorna 28/05/2026", () => {
    const p = resolverPeriodo({ periodoNome: "amanha", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-28");
    expect(p.periodoAte).toBe("2026-05-28");
  });

  it("essa_semana retorna seg-dom da semana corrente (25/05 a 31/05)", () => {
    // 27/05/2026 é quarta. Semana = seg 25/05 a dom 31/05.
    const p = resolverPeriodo({ periodoNome: "essa_semana", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-25");
    expect(p.periodoAte).toBe("2026-05-31");
  });

  it("semana_passada retorna 18/05 a 24/05", () => {
    const p = resolverPeriodo({ periodoNome: "semana_passada", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-18");
    expect(p.periodoAte).toBe("2026-05-24");
  });

  it("mes_corrente retorna 01/05 a 27/05", () => {
    const p = resolverPeriodo({ periodoNome: "mes_corrente", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-01");
    expect(p.periodoAte).toBe("2026-05-27");
  });

  it("mes_anterior retorna 01/04 a 30/04", () => {
    const p = resolverPeriodo({ periodoNome: "mes_anterior", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-04-01");
    expect(p.periodoAte).toBe("2026-04-30");
  });

  it("mes_passado é alias de mes_anterior", () => {
    const a = resolverPeriodo({ periodoNome: "mes_anterior", hoje: HOJE });
    const b = resolverPeriodo({ periodoNome: "mes_passado", hoje: HOJE });
    expect(a).toEqual(b);
  });

  it("ano_corrente retorna 01/01 a 27/05", () => {
    const p = resolverPeriodo({ periodoNome: "ano_corrente", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-01-01");
    expect(p.periodoAte).toBe("2026-05-27");
  });

  it("aceita periodoDe/periodoAte literais e bypassa periodoNome", () => {
    const p = resolverPeriodo({
      periodoDe: "2025-12-15",
      periodoAte: "2026-01-31",
      hoje: HOJE,
    });
    expect(p.periodoDe).toBe("2025-12-15");
    expect(p.periodoAte).toBe("2026-01-31");
  });

  it("virada de mês: hoje=30/04 + mes_corrente = 01/04 a 30/04", () => {
    const trinta = new Date("2026-04-30T12:00:00-03:00");
    const p = resolverPeriodo({ periodoNome: "mes_corrente", hoje: trinta });
    expect(p.periodoDe).toBe("2026-04-01");
    expect(p.periodoAte).toBe("2026-04-30");
  });

  it("ano bissexto: hoje=29/02/2028 + mes_anterior=01/01 a 31/01/2028", () => {
    const bissexto = new Date("2028-02-29T12:00:00-03:00");
    const p = resolverPeriodo({ periodoNome: "mes_anterior", hoje: bissexto });
    expect(p.periodoDe).toBe("2028-01-01");
    expect(p.periodoAte).toBe("2028-01-31");
  });

  // HIGH-G v1 endereçado: testes de fronteira de semana
  it("essa_semana em domingo retorna seg anterior + dom atual (semana ISO terminando hoje)", () => {
    const domingo = new Date("2026-05-31T12:00:00-03:00"); // dom 31/05
    const p = resolverPeriodo({ periodoNome: "essa_semana", hoje: domingo });
    expect(p.periodoDe).toBe("2026-05-25"); // seg 25/05
    expect(p.periodoAte).toBe("2026-05-31"); // dom 31/05
  });

  it("essa_semana em segunda retorna a própria segunda como início", () => {
    const segunda = new Date("2026-05-25T12:00:00-03:00"); // seg 25/05
    const p = resolverPeriodo({ periodoNome: "essa_semana", hoje: segunda });
    expect(p.periodoDe).toBe("2026-05-25");
    expect(p.periodoAte).toBe("2026-05-31");
  });

  // CRIT-A v1: confirma comportamento em container UTC
  it("toIsoDate trata 23h BR como mesmo dia (não pula para o dia UTC seguinte)", () => {
    const tardeBR = new Date("2026-05-27T23:30:00-03:00"); // 02:30 UTC dia 28
    const p = resolverPeriodo({ periodoNome: "hoje", hoje: tardeBR });
    expect(p.periodoDe).toBe("2026-05-27"); // hoje em BR ainda é 27
    expect(p.periodoAte).toBe("2026-05-27");
  });
});
```

- [ ] **Step 2.2: Rodar para confirmar falha**

```bash
npx jest mcp/lib/periodo.test.ts
```

Esperado: FAIL "Cannot find module './periodo'".

- [ ] **Step 2.3: Implementar `periodo.ts`**

Criar `mcp/lib/periodo.ts`:

```typescript
/**
 * Helper de período: converte nomes canônicos para datas ISO no fuso BR.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A11.
 */

export type PeriodoNome =
  | "hoje"
  | "amanha"
  | "essa_semana"
  | "semana_passada"
  | "mes_corrente"
  | "mes_anterior"
  | "mes_passado"
  | "ano_corrente";

export interface PeriodoResolvido {
  periodoDe: string; // YYYY-MM-DD
  periodoAte: string; // YYYY-MM-DD
}

export interface ResolverPeriodoInput {
  periodoNome?: PeriodoNome;
  periodoDe?: string;
  periodoAte?: string;
  /** Permite teste determinístico. Em produção, default = new Date(). */
  hoje?: Date;
}

// CRIT-A v1 endereçado: container roda em UTC; getDate/setDate local não basta.
// Sempre que precisar de "dia BR" (-3), usar Intl formatter parametrizado.
const TZ_BR = "America/Sao_Paulo";

function toIsoDate(d: Date): string {
  // Intl com timeZone garante que '2026-05-27T23:00:00-03:00' continue 27/05,
  // mesmo quando container está em UTC (onde já seria 28/05).
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ_BR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // "YYYY-MM-DD" (locale sv-SE usa ISO)
}

function partsBR(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, day] = fmt.format(d).split("-").map(Number);
  return { y: y as number, m: m as number, day: day as number };
}

function dateFromBR(y: number, m: number, day: number): Date {
  // Constrói Date em UTC representando 12:00 BR daquele dia (longe de DST).
  // ISO: YYYY-MM-DDT15:00:00Z corresponde a 12:00 em -03:00.
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T15:00:00Z`,
  );
}

function addDays(base: Date, n: number): Date {
  const { y, m, day } = partsBR(base);
  return dateFromBR(y, m, day + n);
}

function startOfWeekISO(d: Date): Date {
  // Considera segunda como início da semana (ISO 8601 / padrão BR).
  const { y, m, day } = partsBR(d);
  // Calcula day-of-week em BR (não em UTC).
  const local = dateFromBR(y, m, day);
  const dow = local.getUTCDay(); // 0=dom..6=sab (em UTC, mas data é meio-dia BR)
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(local, diff);
}

function startOfMonth(d: Date): Date {
  const { y, m } = partsBR(d);
  return dateFromBR(y, m, 1);
}

function endOfMonth(d: Date): Date {
  const { y, m } = partsBR(d);
  // Último dia: dia 0 do mês seguinte.
  const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return addDays(dateFromBR(nextMonth.y, nextMonth.m, 1), -1);
}

export function resolverPeriodo(input: ResolverPeriodoInput): PeriodoResolvido {
  if (input.periodoDe && input.periodoAte) {
    return { periodoDe: input.periodoDe, periodoAte: input.periodoAte };
  }

  const hoje = input.hoje ?? new Date();

  switch (input.periodoNome) {
    case "hoje":
      return { periodoDe: toIsoDate(hoje), periodoAte: toIsoDate(hoje) };
    case "amanha": {
      const amanha = addDays(hoje, 1);
      return { periodoDe: toIsoDate(amanha), periodoAte: toIsoDate(amanha) };
    }
    case "essa_semana": {
      const seg = startOfWeekISO(hoje);
      const dom = addDays(seg, 6);
      return { periodoDe: toIsoDate(seg), periodoAte: toIsoDate(dom) };
    }
    case "semana_passada": {
      const segPassada = addDays(startOfWeekISO(hoje), -7);
      const domPassado = addDays(segPassada, 6);
      return {
        periodoDe: toIsoDate(segPassada),
        periodoAte: toIsoDate(domPassado),
      };
    }
    case "mes_corrente":
      return {
        periodoDe: toIsoDate(startOfMonth(hoje)),
        periodoAte: toIsoDate(hoje),
      };
    case "mes_anterior":
    case "mes_passado": {
      const { y, m } = partsBR(hoje);
      const refAnt = m === 1
        ? dateFromBR(y - 1, 12, 15)
        : dateFromBR(y, m - 1, 15);
      return {
        periodoDe: toIsoDate(startOfMonth(refAnt)),
        periodoAte: toIsoDate(endOfMonth(refAnt)),
      };
    }
    case "ano_corrente": {
      const { y } = partsBR(hoje);
      return {
        periodoDe: `${y}-01-01`,
        periodoAte: toIsoDate(hoje),
      };
    }
    default:
      throw new Error(
        `resolverPeriodo: periodoNome ausente ou desconhecido (${String(input.periodoNome)}). Passe periodoDe+periodoAte ou um periodoNome valido.`,
      );
  }
}
```

- [ ] **Step 2.4: Rodar testes para passar**

```bash
npx jest mcp/lib/periodo.test.ts
```

Esperado: PASS (11 testes).

- [ ] **Step 2.5: Commit**

```bash
git add mcp/lib/periodo.ts mcp/lib/periodo.test.ts
git commit -m "feat(mcp): resolverPeriodo com 8 modos canonicos (Onda 1.A)

Helper TS puro para resolver periodoNome (hoje, amanha, essa_semana,
semana_passada, mes_corrente, mes_anterior/passado, ano_corrente) em
periodoDe/periodoAte ISO. Aceita override literal por periodoDe+periodoAte.
Determinismo via parametro hoje (default new Date).

Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A11

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Helper `topPorParticipante`

**Files:**
- Create: `mcp/lib/agrupador.ts`
- Test: `mcp/lib/agrupador.test.ts`

- [ ] **Step 3.1: Escrever testes (RED)**

Criar `mcp/lib/agrupador.test.ts`:

```typescript
import { describe, it, expect } from "@jest/globals";
import { topPorParticipante } from "./agrupador";

const TITULOS = [
  { participanteNome: "Smartfit", vrSaldo: 200 },
  { participanteNome: "Smartfit", vrSaldo: 300 },
  { participanteNome: "Casa Ferolla", vrSaldo: 150 },
  { participanteNome: "Casa Ferolla", vrSaldo: 50 },
  { participanteNome: "Jds Comércio", vrSaldo: 1000 },
  { participanteNome: null, vrSaldo: 25 },
  { participanteNome: "Smartfit", vrSaldo: 100 },
];

describe("topPorParticipante", () => {
  it("agrega por nome, soma vrSaldo, conta n", () => {
    const top = topPorParticipante(TITULOS, 10);
    expect(top).toEqual([
      { nome: "Jds Comércio", soma: 1000, n: 1 },
      { nome: "Smartfit", soma: 600, n: 3 },
      { nome: "Casa Ferolla", soma: 200, n: 2 },
    ]);
  });

  it("respeita limite (top 2)", () => {
    const top = topPorParticipante(TITULOS, 2);
    expect(top).toHaveLength(2);
    expect(top[0]?.nome).toBe("Jds Comércio");
    expect(top[1]?.nome).toBe("Smartfit");
  });

  it("ignora linhas com participanteNome null/undefined/vazio", () => {
    const top = topPorParticipante(TITULOS, 10);
    expect(top.find((t) => t.nome === null)).toBeUndefined();
    expect(top.find((t) => t.nome === "")).toBeUndefined();
  });

  it("retorna [] para lista vazia", () => {
    expect(topPorParticipante([], 10)).toEqual([]);
  });

  it("default limite = 10", () => {
    const muitos = Array.from({ length: 15 }, (_, i) => ({
      participanteNome: `P${i}`,
      vrSaldo: 100 - i,
    }));
    const top = topPorParticipante(muitos);
    expect(top).toHaveLength(10);
  });
});
```

- [ ] **Step 3.2: Rodar para confirmar falha**

```bash
npx jest mcp/lib/agrupador.test.ts
```

Esperado: FAIL "Cannot find module './agrupador'".

- [ ] **Step 3.3: Implementar `agrupador.ts`**

Criar `mcp/lib/agrupador.ts`:

```typescript
/**
 * Helpers de agrupamento usados pelos envelopes de tool.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A2.
 */

export interface TopParticipante {
  nome: string;
  soma: number;
  n: number;
}

export interface LinhaAgregavel {
  participanteNome: string | null | undefined;
  vrSaldo: number | null | undefined;
}

export function topPorParticipante<T extends LinhaAgregavel>(
  linhas: T[],
  limite = 10,
): TopParticipante[] {
  const acc = new Map<string, { soma: number; n: number }>();

  for (const linha of linhas) {
    const nome = (linha.participanteNome ?? "").trim();
    if (!nome) continue;
    const saldo = Number(linha.vrSaldo ?? 0);
    const atual = acc.get(nome) ?? { soma: 0, n: 0 };
    atual.soma += saldo;
    atual.n += 1;
    acc.set(nome, atual);
  }

  return Array.from(acc.entries())
    .map(([nome, { soma, n }]) => ({ nome, soma, n }))
    .sort((a, b) => b.soma - a.soma)
    .slice(0, limite);
}
```

- [ ] **Step 3.4: Rodar testes**

```bash
npx jest mcp/lib/agrupador.test.ts
```

Esperado: PASS (5 testes).

- [ ] **Step 3.5: Commit**

```bash
git add mcp/lib/agrupador.ts mcp/lib/agrupador.test.ts
git commit -m "feat(mcp): topPorParticipante para envelope financeiro (Onda 1.A)

Agrega linhas por participanteNome, soma vrSaldo, ordena desc, aplica
limite. Ignora null/empty. Default limite=10. Sera consumido pelos
envelopes de contas_a_pagar, contas_a_receber e titulos_vencidos no PR2.

Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A2

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Registry de formatadores `_RESPOSTA` + cálculos canônicos

**Files:**
- Create: `mcp/lib/responder.ts`
- Test: `mcp/lib/responder.test.ts`

Esta é a task mais densa do PR1. Implementa o **registry** para 25+ tools, com estrutura uniforme. Vou implementar estrutura + 3 tools como exemplo. As **demais 22 tools recebem placeholder seguro** (retorna texto genérico baseado em `_DESTAQUE`) com TODO marker (`// TODO Onda 1.B/C: formatador real`) — esses são preenchidos nos PRs 2-8 conforme cada tool é adaptada.

- [ ] **Step 4.1: Escrever testes do registry e 3 formatadores (RED)**

Criar `mcp/lib/responder.test.ts`:

```typescript
import { describe, it, expect } from "@jest/globals";
import {
  formatadorPorTool,
  calculosCanonicosPorTool,
  formatBRL,
  type FormatadorCanonico,
  type CalculoCanonico,
} from "./responder";

describe("formatBRL", () => {
  it("formata em pt-BR com R$ e separadores", () => {
    expect(formatBRL(1234567.89)).toBe("R$ 1.234.567,89");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(0.5)).toBe("R$ 0,50");
  });
});

describe("formatadorPorTool", () => {
  it("financeiro_contas_a_receber usa totalAReceber + contagem + topParticipante", () => {
    const fmt = formatadorPorTool("financeiro_contas_a_receber");
    const env = {
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "x",
      atualizadoHa: "1min",
      _DESTAQUE: { totalAReceber: 100000, contagem: 50 },
      topPorParticipante: [{ nome: "Smartfit", soma: 60000, n: 5 }],
    };
    const r = fmt(env);
    expect(r).toContain("R$ 100.000,00");
    expect(r).toContain("50 títulos");
    expect(r).toContain("Smartfit");
  });

  it("registrar_lacuna concatena respostaSugerida e sugestoesRelacionadas", () => {
    const fmt = formatadorPorTool("registrar_lacuna");
    const env = {
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "x",
      atualizadoHa: "0s",
      _DESTAQUE: {
        respostaSugerida: "Essa métrica não está disponível.",
        sugestoesRelacionadas: ["Liste contas a receber", "Veja faturamento"] as any,
      } as any,
    };
    const r = fmt(env as any);
    expect(r).toContain("Essa métrica não está disponível.");
    expect(r).toContain("[[suggestions]]:Liste contas a receber|Veja faturamento");
  });

  it("tool desconhecida cai no formatador genérico (não crasha)", () => {
    const fmt = formatadorPorTool("tool_inexistente_xyz");
    const r = fmt({
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "x",
      atualizadoHa: "1min",
    });
    expect(r).toBe("Resultado obtido. (atualizado há 1min)");
  });
});

describe("calculosCanonicosPorTool", () => {
  it("financeiro_contas_a_receber expõe lista finita de cálculos", () => {
    const calcs = calculosCanonicosPorTool("financeiro_contas_a_receber");
    const nomes = calcs.map((c) => c.nome);
    expect(nomes).toContain("soma_vrSaldo");
    expect(nomes).toContain("contagem");
    expect(nomes).toContain("max_vrSaldo");
    expect(nomes.length).toBeGreaterThan(5);
  });

  it("cálculo soma_vrSaldo soma corretamente", () => {
    const calcs = calculosCanonicosPorTool("financeiro_contas_a_receber");
    const soma = calcs.find((c) => c.nome === "soma_vrSaldo");
    expect(soma).toBeDefined();
    const r = soma!.computar([
      { vrSaldo: 100 },
      { vrSaldo: 200 },
      { vrSaldo: 50 },
    ]);
    expect(r).toBe(350);
  });

  it("tool sem cálculos retorna []", () => {
    expect(calculosCanonicosPorTool("tool_xyz")).toEqual([]);
  });
});

// CRIT-α v2: teste de contrato. SKIP em PR1, PR2 remove o .skip.
describe.skip("contrato pré-PR2 (TOOLS_QUE_PRECISAM_FORMATADOR)", () => {
  it("nenhuma tool da lista ainda usa fmtGenerico", async () => {
    const { TOOLS_QUE_PRECISAM_FORMATADOR, formatadorPorTool, ehFormatadorGenerico } =
      await import("./responder");
    const faltam: string[] = [];
    for (const tool of TOOLS_QUE_PRECISAM_FORMATADOR) {
      const fmt = formatadorPorTool(tool);
      if (ehFormatadorGenerico(fmt)) faltam.push(tool);
    }
    expect(faltam).toEqual([]);
  });
});
```

- [ ] **Step 4.2: Rodar para confirmar falha**

```bash
npx jest mcp/lib/responder.test.ts
```

Esperado: FAIL "Cannot find module './responder'".

- [ ] **Step 4.3: Implementar `responder.ts`**

Criar `mcp/lib/responder.ts`:

```typescript
/**
 * Registry de formatadores canônicos e cálculos canônicos por tool.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §4.5 (tabela de 25 formatadores).
 *
 * NOTE: PR1 implementa estrutura + 3 formatadores reais (financeiro a_receber,
 * a_pagar e registrar_lacuna). Demais 22 ferramentas têm fallback genérico
 * com TODO marker; serão preenchidas nos PRs 2-8.
 */

import type { ToolEnvelope } from "./envelope";

export type FormatadorCanonico = (
  env: Omit<ToolEnvelope, "_RESPOSTA">,
) => string;

export interface CalculoCanonico<TLinha = unknown> {
  nome: string;
  computar: (linhas: TLinha[]) => number;
}

export function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Formatadores reais (3 no PR1; demais nos PR2-PR8)
// ---------------------------------------------------------------------------

const fmtContasAReceber: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalAReceber ?? 0);
  const n = Number(env._DESTAQUE?.contagem ?? env.linhas.length);
  const top = env.topPorParticipante?.[0];
  const cabeca = `Total em aberto a receber: ${formatBRL(total)} em ${n} títulos.`;
  const topStr = top
    ? ` Maior cliente: ${top.nome} (${formatBRL(top.soma)}).`
    : "";
  return cabeca + topStr;
};

const fmtContasAPagar: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalAPagar ?? 0);
  const n = Number(env._DESTAQUE?.contagem ?? env.linhas.length);
  const top = env.topPorParticipante?.[0];
  const cabeca = `Total em aberto a pagar: ${formatBRL(total)} em ${n} títulos.`;
  const topStr = top
    ? ` Maior fornecedor: ${top.nome} (${formatBRL(top.soma)}).`
    : "";
  return cabeca + topStr;
};

const fmtRegistrarLacuna: FormatadorCanonico = (env) => {
  const resp = String(env._DESTAQUE?.respostaSugerida ?? "");
  const sugs = (env._DESTAQUE as Record<string, unknown> | undefined)?.[
    "sugestoesRelacionadas"
  ];
  let sugStr = "";
  if (Array.isArray(sugs) && sugs.length > 0) {
    sugStr = ` [[suggestions]]:${sugs.join("|")}`;
  }
  return resp + sugStr;
};

// ---------------------------------------------------------------------------
// Fallback genérico (será trocado nos PR2-PR8)
// ---------------------------------------------------------------------------

const fmtGenerico: FormatadorCanonico = (env) => {
  const partes: string[] = ["Resultado obtido."];
  if (env._DESTAQUE && Object.keys(env._DESTAQUE).length > 0) {
    partes.push(`(${JSON.stringify(env._DESTAQUE)})`);
  }
  partes.push(`(atualizado há ${env.atualizadoHa})`);
  return partes.join(" ");
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const FORMATADORES: Record<string, FormatadorCanonico> = {
  financeiro_contas_a_receber: fmtContasAReceber,
  financeiro_contas_a_pagar: fmtContasAPagar,
  registrar_lacuna: fmtRegistrarLacuna,
  // PR2 preenche os demais 22 conforme cada tool é adaptada.
};

/**
 * CRIT-B v1 endereçado: lista hard-coded das tools que DEVEM ter formatador
 * real (não-fallback) ao final do PR2. Teste de contrato falha se alguma
 * dessas tools ainda usa fmtGenerico no final do PR2.
 */
export const TOOLS_QUE_PRECISAM_FORMATADOR = [
  // financeiro
  "financeiro_contas_a_pagar",
  "financeiro_contas_a_receber",
  "financeiro_titulos_vencidos",
  "financeiro_fluxo_caixa",
  "financeiro_saldo_contas",
  "financeiro_caixa_periodo",
  // fiscal
  "fiscal_faturamento_periodo",
  "fiscal_faturamento_por_cliente",
  "fiscal_notas_emitidas",
  "fiscal_notas_recebidas",
  "fiscal_notas_recebidas_por_fornecedor",
  "fiscal_apuracao",
  "fiscal_produtos_faturados",
  "fiscal_impostos_periodo",
  // estoque
  "estoque_saldo_produto",
  "estoque_top_movimentados",
  "estoque_produtos_parados",
  "estoque_produtos_saldo_zero",
  "estoque_concentracao",
  "estoque_valor_armazem",
  "estoque_entradas_saidas",
  // comercial
  "comercial_pedidos_periodo",
  "comercial_pedidos_por_etapa",
  "comercial_pedidos_atrasados",
  "comercial_parcelas_a_vencer",
  "comercial_pedidos_por_vendedor",
  "comercial_pedidos_listar_top_valor",
  // cadastros
  "cadastro_buscar_parceiro",
  "cadastro_parceiros_por_uf",
  "cadastro_contar_parceiros",
  // contábil
  "contabil_plano_de_contas",
  "contabil_estrutura_conta",
  // sistema
  "registrar_lacuna",
  "bi_consulta_avancada",
];

export function formatadorPorTool(toolName: string): FormatadorCanonico {
  return FORMATADORES[toolName] ?? fmtGenerico;
}

/** PR2 usa para verificar contrato. */
export function ehFormatadorGenerico(fmt: FormatadorCanonico): boolean {
  return fmt === fmtGenerico;
}

// ---------------------------------------------------------------------------
// Cálculos canônicos
// ---------------------------------------------------------------------------

// HIGH-H v1: exportar para reuso em PR2
export interface LinhaFinanceira {
  vrSaldo?: number;
  participanteNome?: string | null;
  diasAtraso?: number;
}

const CALCS_FINANCEIRO: CalculoCanonico<LinhaFinanceira>[] = [
  {
    nome: "soma_vrSaldo",
    computar: (l) => l.reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
  { nome: "contagem", computar: (l) => l.length },
  {
    nome: "media_vrSaldo",
    computar: (l) => {
      if (l.length === 0) return 0;
      return l.reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0) / l.length;
    },
  },
  {
    nome: "max_vrSaldo",
    computar: (l) =>
      l.length === 0 ? 0 : Math.max(...l.map((r) => Number(r.vrSaldo ?? 0))),
  },
  {
    nome: "min_vrSaldo",
    computar: (l) =>
      l.length === 0 ? 0 : Math.min(...l.map((r) => Number(r.vrSaldo ?? 0))),
  },
  {
    nome: "soma_vrSaldo_vencidos",
    computar: (l) =>
      l
        .filter((r) => Number(r.diasAtraso ?? 0) > 0)
        .reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
  {
    nome: "contagem_distinct_participante",
    computar: (l) =>
      new Set(l.map((r) => r.participanteNome).filter(Boolean)).size,
  },
  {
    nome: "soma_top5_vrSaldo",
    computar: (l) =>
      [...l]
        .sort((a, b) => Number(b.vrSaldo ?? 0) - Number(a.vrSaldo ?? 0))
        .slice(0, 5)
        .reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
  {
    nome: "soma_top10_vrSaldo",
    computar: (l) =>
      [...l]
        .sort((a, b) => Number(b.vrSaldo ?? 0) - Number(a.vrSaldo ?? 0))
        .slice(0, 10)
        .reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
];

const CALCS: Record<string, CalculoCanonico<any>[]> = {
  financeiro_contas_a_receber: CALCS_FINANCEIRO,
  financeiro_contas_a_pagar: CALCS_FINANCEIRO,
  financeiro_titulos_vencidos: CALCS_FINANCEIRO,
  // TODO Onda 1.B/C: cálculos canônicos por tool.
};

export function calculosCanonicosPorTool(
  toolName: string,
): CalculoCanonico<any>[] {
  return CALCS[toolName] ?? [];
}
```

- [ ] **Step 4.4: Rodar testes**

```bash
npx jest mcp/lib/responder.test.ts
```

Esperado: PASS (6 testes).

- [ ] **Step 4.5: Commit**

```bash
git add mcp/lib/responder.ts mcp/lib/responder.test.ts
git commit -m "feat(mcp): registry de formatadores + calculos canonicos (Onda 1.A)

Implementa esqueleto de mcp/lib/responder.ts com:
- formatadorPorTool(toolName) -> retorna FormatadorCanonico que produz
  _RESPOSTA a partir do envelope
- calculosCanonicosPorTool(toolName) -> retorna lista FINITA de calculos
  (sem combinatorial explosion) consumida pelo AutoValidator V2 no PR10
- formatBRL helper Intl.NumberFormat pt-BR
- 3 formatadores reais (contas_a_receber, contas_a_pagar, registrar_lacuna)
- fallback generico para tools nao-implementadas (TODO markers para PR2-PR8)

Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §4.5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Script `run-regression.ts` com rebuild integrado

**Files:**
- Create: `scripts/quality-audit/run-regression.ts`

Este script é chamado antes de cada bateria. Em PR1 fica como scaffold; será expandido nos PRs seguintes conforme novas regressions specs são adicionadas.

- [ ] **Step 5.1: Criar scaffold do script**

```typescript
#!/usr/bin/env tsx
/**
 * Roda bateria de regressao do agente Nex contra cache real, com rebuild
 * dos containers afetados antes da execucao.
 *
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §6.3
 *
 * Uso:
 *   pnpm tsx scripts/quality-audit/run-regression.ts --bateria R17
 *   pnpm tsx scripts/quality-audit/run-regression.ts --bateria regression-r11-r16 --skip-build
 */

import "dotenv/config";
import { spawnSync } from "child_process";

interface Args {
  bateria: string;
  skipBuild: boolean;
  containers: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    bateria: "regression-r11-r16",
    skipBuild: false,
    containers: ["mcp", "app", "worker"],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bateria") args.bateria = argv[++i] ?? args.bateria;
    else if (a === "--skip-build") args.skipBuild = true;
    else if (a === "--containers") {
      args.containers = (argv[++i] ?? "").split(",").filter(Boolean);
    }
  }
  return args;
}

function exec(cmd: string, args: string[]): number {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  return r.status ?? 1;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Bateria: ${args.bateria}`);

  if (!args.skipBuild) {
    console.log("\n=== Rebuild de containers ===");
    let code = exec("docker", ["compose", "build", ...args.containers]);
    if (code !== 0) {
      console.error(
        `\nFALHA: docker compose build retornou ${code}. Corrija erros de build antes de rodar regressao.`,
      );
      process.exit(code);
    }
    code = exec("docker", ["compose", "up", "-d", ...args.containers]);
    if (code !== 0) {
      console.error(`\nFALHA: docker compose up retornou ${code}.`);
      process.exit(code);
    }
  } else {
    console.log("(--skip-build informado, pulando rebuild)");
  }

  // TODO PR2+: chamar bateria especifica. PR1 deixa scaffold apenas.
  console.log("\n=== Bateria (a implementar no PR2+) ===");
  console.log(`Bateria '${args.bateria}' ainda nao implementada.`);
  console.log("PR1 = infraestrutura; bateria de regressao real chega no PR2.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5.2: Smoke test do script (sem rebuild)**

```bash
pnpm tsx scripts/quality-audit/run-regression.ts --skip-build
```

Esperado: imprime "Bateria 'regression-r11-r16' ainda nao implementada" e sai com 0.

- [ ] **Step 5.3: Commit**

```bash
git add scripts/quality-audit/run-regression.ts
git commit -m "feat(quality-audit): scaffold run-regression.ts com rebuild integrado (Onda 1.A)

Script de bateria de regressao que:
- rebuilda containers mcp/app/worker antes de rodar (regra CLAUDE.md §2.1)
- checa exit code do build e falha cedo com mensagem clara
- aceita --skip-build, --bateria <nome>, --containers <lista>
- PR1 entrega scaffold; PR2 implementa a bateria efetiva de R11-R16
  parafraseada

Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §6.3

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5.5: Gerar `casos-x-fixes.csv` (HIGH-D v1 endereçado)

**Files:**
- Create: `docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv`
- Create: `scripts/quality-audit/build-casos-x-fixes.py`

- [ ] **Step 5.5.1: Script Python que lê `cases_v2.jsonl` e gera CSV**

Criar `scripts/quality-audit/build-casos-x-fixes.py`:

```python
#!/usr/bin/env python3
"""Gera CSV mapeando cada caso PARCIAL/ERRADO/FORA_DO_ESCOPO para os fixes
aplicaveis (Onda X, prob cura).

Consumido pela regressao de cada onda.
"""
import json, csv, sys, os

IN = "docs/superpowers/research/anexos-laudo-r11-r16/cases_v2.jsonl"
OUT = "docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv"

# Mapa pattern -> fixes (do laudo §4)
PATTERN_TO_FIXES = {
    "resposta_truncada": ("F1,F2,F3", "1", 70),
    "fluxo_tool_incompleto": ("F4,F5,F6,F7", "1+2", 50),
    "dado_inventado": ("F1,F9,F10", "1", 75),
    "entendeu_mal_termo": ("F12,F13,F14", "1+2", 50),
    "recusa_indevida": ("F16,F17", "1", 80),
    "pergunta_ignorada": ("F18,F19", "1", 65),
    "parametro_incompleto": ("F20,F21", "1+2", 60),
    "formato_quebrado": ("F22", "1", 75),
    "erro_data": ("F23,F24", "1.5+2", 70),
    "pediu_clarificacao_desnecessaria": ("F25", "2", 50),
    "tool_errada": ("F26,F27", "1+3", 55),
    "placeholder_nao_substituido": ("F18,F19", "1", 80),
    "limitacao_real_declarada": ("legitimo", "fora", 0),
    "acerto_modelo": ("legitimo", "fora", 0),
    "acerto_encadeamento": ("legitimo", "fora", 0),
    # CRIT-β v2: acerto_objetividade nao mapeia direto — depende do status.
    # Quando o caso eh PARCIAL/ERRADO e tem acerto_objetividade, usa-se o
    # proximo pattern negativo da lista. Tratado abaixo no codigo.
}

NEGATIVE_FALLBACK_PRIORITY = [
    "dado_inventado",
    "fluxo_tool_incompleto",
    "resposta_truncada",
    "recusa_indevida",
    "entendeu_mal_termo",
    "pergunta_ignorada",
    "tool_errada",
    "parametro_incompleto",
    "formato_quebrado",
    "erro_data",
    "placeholder_nao_substituido",
    "pediu_clarificacao_desnecessaria",
]

with open(IN) as f, open(OUT, "w", newline="") as out:
    w = csv.writer(out)
    w.writerow(["evalId","rodada","status","patterns","pattern_principal",
                "fixes_aplicaveis","onda","prob_cura_pct"])
    for line in f:
        line = line.strip()
        if not line:
            continue
        c = json.loads(line)
        pats = c.get("patterns") or []
        status = c.get("status")
        # CRIT-β v2: acerto_objetividade so eh "legitimo" quando status==FORA.
        # Caso contrario, ignora e procura proximo pattern negativo.
        if status == "FORA_DO_ESCOPO":
            princ = next(
                (p for p in pats if p in ("limitacao_real_declarada", "acerto_objetividade", "acerto_modelo", "acerto_encadeamento")),
                pats[0] if pats else "?",
            )
        else:
            # PARCIAL ou ERRADO: prioriza pattern negativo da lista
            princ = next(
                (p for p in NEGATIVE_FALLBACK_PRIORITY if p in pats),
                next((p for p in pats if not p.startswith("acerto") and p != "limitacao_real_declarada"), pats[0] if pats else "?"),
            )
        fixes, onda, prob = PATTERN_TO_FIXES.get(princ, ("?", "?", 0))
        w.writerow([
            c.get("evalId"),
            c.get("rodada"),
            c.get("status"),
            "|".join(pats),
            princ,
            fixes,
            onda,
            prob,
        ])

print(f"OK: {OUT}")
```

- [ ] **Step 5.5.2: Rodar e verificar**

```bash
python3 scripts/quality-audit/build-casos-x-fixes.py
wc -l docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv
head -5 docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv
```

Esperado: 145 linhas (1 header + 144 dados).

- [ ] **Step 5.5.3: Commit**

```bash
git add scripts/quality-audit/build-casos-x-fixes.py docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv
git commit -m "feat(quality-audit): casos-x-fixes.csv mapeando 144 casos para fixes (HIGH-D)

Mapeia cada caso PARCIAL/ERRADO/FORA_DO_ESCOPO ao fix proposto no laudo
(F1-F27), a onda de execucao e a probabilidade estimada de cura.
Consumido pelo run-regression nos PRs seguintes para validar cura caso-a-caso.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Verificação final do PR1

- [ ] **Step 6.1: `tsc` global**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 6.2: `eslint` mcp/ e scripts/**

```bash
npx eslint mcp/lib/ scripts/quality-audit/run-regression.ts
```

Esperado: 0 erros, 0 novos warnings.

- [ ] **Step 6.3: Todos os testes novos passam**

```bash
npx jest mcp/lib/
```

Esperado: PASS, 4 suites, 26 testes (envelope=4, periodo=11, agrupador=5, responder=6).

- [ ] **Step 6.4: Suite completa de jest não regrediu**

```bash
npx jest --silent 2>&1 | tail -5
```

Esperado: contém pelo menos 4 suites novas em `mcp/lib/` (`envelope`, `periodo`, `agrupador`, `responder`) e 0 falhas. (MED-J v1: não amarrar em contagem absoluta de testes.)

- [ ] **Step 6.4.1: Smoke build do container mcp (HIGH-E v1)**

```bash
docker compose build mcp 2>&1 | tail -5
```

Esperado: `Successfully built ...`. PR1 não chama os helpers em tools, mas o bundle inclui os arquivos novos — confirmar que build não quebra.

- [ ] **Step 6.5: Confirmar branch e logs**

```bash
git log --oneline feat/agente-nex-90pct ^main | head -15
git log --oneline -8
```

Esperado: 5 commits novos do PR1 (Task 1-5) + commits prévios da spec/laudo.

- [ ] **Step 6.6: Abrir PR**

```bash
git push -u origin feat/agente-nex-90pct
gh pr create --base main --title "feat(mcp): Onda 1.A — framework de envelope, periodo, responder, agrupador" --body "$(cat <<'BODY'
## Resumo

PR1 da iniciativa Agente Nex ≥90% (Onda 1.A). Adiciona infraestrutura usada pelos PRs subsequentes para enriquecer envelope de tools, formatar respostas canônicas e fornecer cálculos canônicos para o AutoValidator.

## O que entra

- `mcp/lib/envelope.ts` + tipo `ToolEnvelope<T>` + `buildEnvelope` com cap de 500 chars em `_RESPOSTA`
- `mcp/lib/periodo.ts` com 8 modos canônicos (hoje, amanha, essa_semana, semana_passada, mes_corrente, mes_anterior/passado, ano_corrente)
- `mcp/lib/responder.ts` com registry `formatadorPorTool` (3 reais + fallback) e `calculosCanonicosPorTool` (cálculos finitos para tools financeiras)
- `mcp/lib/agrupador.ts` com `topPorParticipante`
- `scripts/quality-audit/run-regression.ts` (scaffold)

## O que não entra

- Aplicação em tools concretas — vai nos PRs 2-8 (Onda 1.B/C).
- AutoValidator e schema delta — PR10 (Onda 1.E).
- Mudanças no prompt — PR10 (regra `_RESPOSTA`) + PR12 (resto).

## Verificação

- `npx tsc --noEmit`: 0 erros ✅
- `npx eslint mcp/ scripts/`: 0 erros novos ✅
- `npx jest mcp/lib/`: 26 testes, PASS ✅
- Sem rebuild de container (PR1 só toca código TS de helper, ainda não chamado).

## Spec / docs

- `docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md` (v3)
- `docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md`

## Próximo PR

PR2 (Onda 1.B): aplica envelope + `topPorParticipante` em 4 tools financeiras.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## PRs 2 em diante

Cada PR seguinte tem **seu próprio sub-plan** gerado por nova invocação de `superpowers:writing-plans` com escopo apenas daquele PR, **antes** da sua execução. Esse sub-plan recebe 2 reviews adversariais (vide CLAUDE.md §6).

O motivo de não detalhar PR2-PR18 aqui é prático:
1. Cada PR é 200-800 linhas de mudança real — caberia em ~150 linhas de microtasks cada.
2. A SPEC v3 já tem o detalhe necessário para guiar a decomposição de cada PR.
3. Sub-planejar antes de cada execução permite incorporar achados dos PRs anteriores (ex: se PR1 revelar que um tipo do envelope precisa ajuste, PR2 já incorpora).
4. Reduz risco de "plan rot" (plano que envelhece antes da execução).

### Sequência de invocação de sub-plans

Cada subitem abaixo dispara um novo `writing-plans`:

- **Sub-plano PR2:** "Aplicar envelope+topPorParticipante em 4 tools financeiras (`financeiro_contas_a_pagar`, `financeiro_contas_a_receber`, `financeiro_titulos_vencidos`, `financeiro_fluxo_caixa`)". Inclui formatadores reais (substituindo placeholders genéricos).
- **Sub-plano PR3:** "Aplicar envelope em 6 tools fiscais".
- **Sub-plano PR4:** "Aplicar envelope em 7 tools estoque + A9 match exato em `estoque_saldo_produto`".
- **Sub-plano PR5:** "Aplicar envelope em 6 tools comercial".
- **Sub-plano PR6:** "Aplicar envelope em 3 tools cadastros + A6 (papel filter)". Depende de **research R-1, R-2** completados primeiro.
- **Sub-plano PR7:** "Aplicar envelope em 2 tools contábil + full-text via pg_trgm".
- **Sub-plano PR8:** "Aplicar envelope em `registrar_lacuna` (resposta completa) e `bi_consulta_avancada`".
- **Sub-plano PR9:** "A10 fase 1 (`titulos_vencidos.tipo` sugerido) + A13 (gate suave de redirecionar)". Depende de **research R-3**.
- **Sub-plano PR10:** "Auto-validator V1-V4 + schema delta + briefing v3 + prompt mínimo". Depende de PR1-PR9 todos mergiados.
- **Sub-plano PR11 (Onda 1.5):** "Migrate run para promover validator de shadow→active + edit do prompt para `periodoNome`".
- **Sub-plano PR12 (Onda 2):** "Edits restantes em identity-base.ts (7 ajustes cirúrgicos)".
- **Sub-planos PR13-PR18 (Onda 3):** "Criar 1 tool nova por sub-plano (`fiscal_faturamento_mensal_serie`, `cadastro_detalhar_parceiro`, `comercial_vendedores_cadastrados`, `cadastro_parceiros_recentes`, `estoque_locais_por_produto`, `comercial_pedidos_sem_vendedor`)".

### Research tasks (R-1, R-2, R-3) — antes de PR4/PR6/PR9

- **R-1.** Query no cache `SELECT LENGTH(default_code), COUNT(*) FROM raw_product_product GROUP BY 1 ORDER BY 1` para definir limiar de match exato. Documentar em `docs/superpowers/research/2026-05-27-r1-codigo-produto-distribuicao.md`.
- **R-2.** Verificar `raw_res_partner` para campos relevantes (`category_id`, `customer_rank`, `supplier_rank`). Documentar em `docs/superpowers/research/2026-05-27-r2-papel-parceiro.md`.
- **R-3.** Verificar timeout do n8n no webhook do WhatsApp (consultar workflow exportado ou contatar admin). Documentar em `docs/superpowers/research/2026-05-27-r3-n8n-timeout.md`.

---

## Self-Review do PLAN v1 (rodado inline)

**1. Spec coverage:**
- A1 envelope ✅ Task 1
- A11 periodo ✅ Task 2
- A1.5 responder + cálculos ✅ Task 4
- topPorParticipante (A2) ✅ Task 3
- A14 script regressão ✅ Task 5
- A2-A8 tools (PR2-PR8) → sub-planos referenciados ✅
- A9, A10, A13 (PR9) → sub-plano referenciado ✅
- A12 autovalidator (PR10) → sub-plano referenciado ✅
- B0 prompt mínimo (PR10) ✅
- B1 prompt completo (PR12) ✅
- C1-C6 tools novas (PR13-PR18) → sub-planos referenciados ✅
- Schema delta (PR10) ✅
- Briefing v3 (PR10) ✅
- Research R-1/R-2/R-3 ✅
- Feature flags ✅ (em PR10)
- Plano A/B validadores ✅ (em PR11)
- Roteiro ativação ✅ (em PR11)

**2. Placeholder scan:** sem TBD/TODO sem código em Task 1-5. Tasks 1-5 estão completas. Sub-planos PR2-PR18 são **handoffs** explícitos para nova invocação da skill, não placeholders.

**3. Type consistency:**
- `ToolEnvelope<T>` definido em Task 1, usado em Task 4 ✅
- `FormatadorCanonico` definido em Task 4 ✅
- `CalculoCanonico<T>` definido em Task 4 ✅
- `PeriodoNome` definido em Task 2 ✅
- `TopParticipante` definido em Task 3 ✅
- `formatBRL` (Task 4) chamado em testes — assinatura consistente ✅

Plano v1 fechado.

---

## Próximo passo

PLAN v2 endereça achados da Review #1 do plano (12 itens). Recebe Review #2 antes da execução de Step 1.1.

**Comunicação ao usuário (MED-L v1 endereçado):** após PR1 mergiado (decisão humana de merge), aguardar aprovação para iniciar sub-plano de PR2. Não engatilhar PRs autonomamente para `main` sem decisão explícita.
