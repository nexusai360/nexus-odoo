/**
 * scripts/ab-cerebro.ts , Fase A0.1 do milestone "Nex Especialista"
 *
 * Harness agêntico A/B de MODELO: roda casos do golden dataset pelo caminho
 * REAL (runAgent + MCP + LLM via llmOverride), por candidato, medindo:
 *   - seleção de tool (toolEsperada ∈ tools chamadas)         , 124 casos
 *   - número-ouro (kpiOuro presente na RESPOSTA final)        , casos com ouro
 *   - alucinação numérica (número na resposta sem fonte nos toolResults)
 *   - custo end-to-end do turno (todas as origens do LlmUsage da conversa)
 *   - latência por turno
 *
 * Diferente de golden-nex.e2e.ts (que chama tool.handler direto, sem LLM),
 * este harness mede o CÉREBRO. Conversas em canal "backtest" (não poluem a bubble).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/ab-cerebro.ts \
 *     --models "openai:gpt-5.4-mini,openai:gpt-5.4" [--limit 60] [--concurrency 3]
 */
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { runAgent } from "@/lib/agent/run-agent";
import { createConversation } from "@/lib/agent/conversation";
import type { LlmProvider } from "@/lib/agent/llm/types";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface GoldenEntry {
  id: string;
  pergunta: string;
  dominio: string;
  classe: string;
  toolEsperada: string;
  /** Follow-up contextual: turnos anteriores na mesma conversa (nao avaliados). */
  turnosAntes?: string[];
  /** Onda M (T0.2): assercoes na RESPOSTA de turnos intermediarios (1-based,
   *  indexa turnosAntes). Mede memoria/anafora ao longo da conversa. */
  expectativasPorTurno?: { turno: number; deveConter: string[] }[];
  /** Tools alternativas que também respondem a pergunta por completo. */
  toolsAceitas?: string[];
  kpiOuro?: {
    chave: string;
    valor: number;
    match: string;
    /** SQL executável contra o cache , quando presente, o harness executa AO
     *  VIVO e compara com o valor ATUAL (mata o drift de snapshot: o smoke
     *  A0 mostrou kpiOuro estático envelhecendo contra o cache vivo). */
    fonteOuroSql?: string;
  }[];
  esperaAmbiguidade?: boolean;
  /** Onda C: avaliacao da resposta. Casos com esperaNaResposta entram
   *  OBRIGATORIAMENTE na amostra (como os comOuro). */
  esperaNaResposta?: string[];
  proibidoNaResposta?: string[];
}

/** Comparacao de substring tolerante a caixa e acento. */
function normalizaTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const PROIBIDO_GLOBAL = ["não consigo te responder", "nao foi possivel obter"];

interface CaseResult {
  id: string;
  /** T0.2: null = caso sem expectativas por turno. */
  expectativasOk?: boolean | null;
  expectativasMiss?: string[];
  dominio: string;
  ok: boolean;
  toolsCalled: string[];
  toolOk: boolean | null;
  kpiOk: boolean | null;
  kpiMiss: string[];
  halucNums: number[];
  /** Onda C: avaliacao da resposta (esperaNaResposta/proibidoNaResposta). */
  respostaOk: boolean | null;
  respostaMiss: string[];
  custoUsd: number;
  durMs: number;
  erro?: string;
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

/** Extrai números de um texto pt-BR ("R$ 1.234,56", "-R$ 35,1", "49779", "31,7%").
 *  Cuidados (medidos no smoke A0): inteiro longo sem separador NÃO pode ser
 *  partido (alternativa pt-BR exige >=1 grupo de milhar); sinal antes de "R$"
 *  ("-R$ 35") pertence ao número. */
function extrairNumeros(texto: string): number[] {
  const out: number[] = [];
  // "-R$ 123" / "- R$ 123" → "-123" (sinal gruda no número)
  const t = texto.replace(/-\s*R\$\s*/g, "-").replace(/R\$\s*/g, "");
  const re = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/g;
  for (const m of t.match(re) ?? []) {
    let s = m;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function temNumero(fonte: number[], alvo: number, relTol = 0.005): boolean {
  return fonte.some(
    (f) => f === alvo || Math.abs(f - alvo) <= Math.max(0.51, Math.abs(alvo) * relTol),
  );
}

async function resolveApiKey(provider: string): Promise<{ apiKey: string; credentialId: string }> {
  const cred = await prisma.llmCredential.findFirst({ where: { provider } });
  if (!cred) throw new Error(`sem credencial para provider=${provider}`);
  return { apiKey: decrypt(cred.encryptedApiKey), credentialId: cred.id };
}

async function rodarCaso(
  e: GoldenEntry,
  userId: string,
  llm: { provider: LlmProvider; model: string; apiKey: string },
): Promise<CaseResult> {
  const t0 = performance.now();
  const toolsCalled: string[] = [];
  const toolPreviews: string[] = [];
  try {
    const conv = await createConversation(userId, "backtest");
    // Follow-up contextual: turnos anteriores rodam na MESMA conversa sem
    // serem avaliados; so o turno final (e.pergunta) conta tools/kpi.
    const expectativasMiss: string[] = [];
    let idxTurno = 0;
    for (const turno of e.turnosAntes ?? []) {
      idxTurno += 1;
      const prev = await runAgent({
        conversationId: conv.id,
        userId,
        userMessage: turno,
        channel: "backtest",
        isPlayground: false,
        source: "bubble",
        llmOverride: llm,
      });
      // T0.2: assercoes na resposta deste turno intermediario.
      const exps = (e.expectativasPorTurno ?? []).filter((x) => x.turno === idxTurno);
      if (prev.ok && exps.length) {
        const respTurno = normalizaTexto(prev.message ?? "");
        for (const exp of exps) {
          for (const esp of exp.deveConter) {
            if (!respTurno.includes(normalizaTexto(esp))) {
              expectativasMiss.push(`t${idxTurno}:faltou:${esp}`);
            }
          }
        }
      }
      if (!prev.ok) {
        return { id: e.id, dominio: e.dominio, ok: false, toolsCalled, toolOk: null, kpiOk: null, kpiMiss: [], halucNums: [], respostaOk: null, respostaMiss: [], custoUsd: 0, durMs: performance.now() - t0, erro: `turnoAntes falhou: ${prev.error}` };
      }
    }
    const r = await runAgent({
      conversationId: conv.id,
      userId,
      userMessage: e.pergunta,
      channel: "backtest",
      isPlayground: false,
      source: "bubble",
      llmOverride: llm,
      onEvent: (evt) => {
        if (evt.type === "tool_call") toolsCalled.push((evt as { toolName: string }).toolName);
        if (evt.type === "tool_result") {
          const p = (evt as { resultPreview?: string }).resultPreview;
          if (p) toolPreviews.push(p);
        }
      },
    });
    const durMs = performance.now() - t0;
    if (!r.ok) {
      return { id: e.id, dominio: e.dominio, ok: false, toolsCalled, toolOk: null, kpiOk: null, kpiMiss: [], halucNums: [], respostaOk: null, respostaMiss: [], custoUsd: 0, durMs, erro: r.error };
    }
    // custo end-to-end: TODAS as linhas de LlmUsage da conversa (loop + enhance +
    // guardrail + auto_validator + router) , conversa é nova, então é só somar.
    const usage = await prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT COALESCE(sum(cost_usd),0)::float c FROM llm_usage WHERE conversation_id = $1`,
      conv.id,
    );
    const custoUsd = usage[0]?.c ?? 0;

    // Juiz de alucinação: fonte = tool results AO VIVO (resultPreview do evento;
    // mensagens role='tool' NÃO são persistidas , medido no smoke A0).
    const fonteNums = [
      ...extrairNumeros(e.pergunta),
      ...toolPreviews.flatMap((p) => extrairNumeros(p)),
    ];
    const respNums = extrairNumeros(r.message ?? "");
    // número "relevante" (>=100 em módulo, exclui anos) na resposta sem fonte.
    const halucNums = toolPreviews.length
      ? respNums.filter(
          (n) => Math.abs(n) >= 100 && !(n >= 1990 && n <= 2035) && !temNumero(fonteNums, n),
        )
      : []; // sem previews não há juiz , não inventar veredito

    const toolOk =
      e.classe === "prosseguir"
        ? toolsCalled.includes(e.toolEsperada) ||
          (e.toolsAceitas ?? []).some((t) => toolsCalled.includes(t))
        : null;

    let kpiOk: boolean | null = null;
    const kpiMiss: string[] = [];
    if (e.kpiOuro?.length) {
      kpiOk = true;
      for (const k of e.kpiOuro) {
        // Verdade AO VIVO quando há SQL executável; senão o valor estático do
        // golden (sujeito a drift , registrado no kpiMiss com sufixo).
        let alvo = k.valor;
        let vivo = false;
        if (k.fonteOuroSql) {
          try {
            const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(k.fonteOuroSql);
            const v = Object.values(rows[0] ?? {})[0];
            if (v !== undefined && v !== null && Number.isFinite(Number(v))) {
              alvo = Number(v);
              vivo = true;
            }
          } catch {
            // SQL ouro quebrado: cai no estático e registra
          }
        }
        if (!temNumero(respNums, alvo)) {
          kpiOk = false;
          kpiMiss.push(`${k.chave}=${alvo}${vivo ? "" : " (estatico/drift?)"}`);
        }
      }
    }
    // Onda C: avaliacao da resposta (qualquer classe). Todas as esperadas
    // presentes; nenhuma proibida (locais + default global de recusa seca).
    let respostaOk: boolean | null = null;
    const respostaMiss: string[] = [];
    if (e.esperaNaResposta?.length || e.proibidoNaResposta?.length) {
      const resp = normalizaTexto(r.message ?? "");
      respostaOk = true;
      for (const esp of e.esperaNaResposta ?? []) {
        if (!resp.includes(normalizaTexto(esp))) {
          respostaOk = false;
          respostaMiss.push(`faltou:${esp}`);
        }
      }
      for (const pro of [...(e.proibidoNaResposta ?? []), ...PROIBIDO_GLOBAL]) {
        if (resp.includes(normalizaTexto(pro))) {
          respostaOk = false;
          respostaMiss.push(`proibido:${pro}`);
        }
      }
    }
    const expectativasOk = e.expectativasPorTurno?.length
      ? expectativasMiss.length === 0
      : null;
    return { id: e.id, dominio: e.dominio, ok: true, toolsCalled, toolOk, kpiOk, kpiMiss, halucNums, respostaOk, respostaMiss, expectativasOk, expectativasMiss, custoUsd, durMs };
  } catch (err) {
    return { id: e.id, dominio: e.dominio, ok: false, toolsCalled, toolOk: null, kpiOk: null, kpiMiss: [], halucNums: [], respostaOk: null, respostaMiss: [], custoUsd: 0, durMs: performance.now() - t0, erro: String(err).slice(0, 200) };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

function p50(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main() {
  const modelsArg = arg("models");
  if (!modelsArg) throw new Error('passe --models "provider:model,provider:model"');
  const limit = Number(arg("limit", "60"));
  const concurrency = Number(arg("concurrency", "3"));

  // T0.2: --file roda uma bateria dedicada (ex.: memoria-30-turnos.json)
  const goldenFile = arg("file", "src/lib/agent/evals/golden/golden-nex.json")!;
  const golden: GoldenEntry[] = JSON.parse(
    readFileSync(join(process.cwd(), goldenFile), "utf8"),
  );
  // amostra estratificada: TODOS os kpiOuro + distribui o resto por domínio.
  const comOuro = golden.filter((e) => e.kpiOuro?.length);
  // Onda C: casos com avaliacao de resposta sao inclusao OBRIGATORIA (como os
  // comOuro) , nunca disputam o round-robin, senao o aceite de honestidade
  // fica nao-deterministico.
  const comEspera = golden.filter(
    (e) => !e.kpiOuro?.length && (e.esperaNaResposta?.length || e.proibidoNaResposta?.length),
  );
  const semOuro = golden.filter(
    (e) =>
      !e.kpiOuro?.length &&
      !e.esperaNaResposta?.length &&
      !e.proibidoNaResposta?.length &&
      e.classe === "prosseguir",
  );
  const porDominio = new Map<string, GoldenEntry[]>();
  for (const e of semOuro) {
    porDominio.set(e.dominio, [...(porDominio.get(e.dominio) ?? []), e]);
  }
  const resto: GoldenEntry[] = [];
  let rodada = 0;
  while (resto.length < limit - comOuro.length - comEspera.length) {
    let pegou = false;
    for (const lista of porDominio.values()) {
      if (lista[rodada]) {
        resto.push(lista[rodada]);
        pegou = true;
        if (resto.length >= limit - comOuro.length - comEspera.length) break;
      }
    }
    if (!pegou) break;
    rodada++;
  }
  const casos = [...comOuro, ...comEspera, ...resto];
  console.log(`[ab] ${casos.length} casos (${comOuro.length} com kpiOuro), concurrency=${concurrency}`);

  const user = await prisma.user.findFirst({
    where: { isActive: true, platformRole: "super_admin" },
    select: { id: true },
  });
  if (!user) throw new Error("sem super_admin ativo");

  const outDir = join(process.cwd(), "docs/superpowers/research/ab-cerebro");
  mkdirSync(outDir, { recursive: true });

  for (const spec of modelsArg.split(",").map((s) => s.trim())) {
    const [provider, ...mm] = spec.split(":");
    const model = mm.join(":");
    const { apiKey } = await resolveApiKey(provider);
    console.log(`\n=== CANDIDATO ${provider}:${model} ===`);
    const t0 = Date.now();
    const results = await pool(casos, concurrency, (e) =>
      rodarCaso(e, user.id, { provider: provider as LlmProvider, model, apiKey }),
    );
    const okRuns = results.filter((r) => r.ok);
    const toolScored = okRuns.filter((r) => r.toolOk !== null);
    const kpiScored = okRuns.filter((r) => r.kpiOk !== null);
    const haluc = okRuns.filter((r) => r.halucNums.length > 0);
    const resumo = {
      candidato: `${provider}:${model}`,
      casos: results.length,
      erros: results.length - okRuns.length,
      toolCerta: toolScored.length
        ? `${toolScored.filter((r) => r.toolOk).length}/${toolScored.length} (${((100 * toolScored.filter((r) => r.toolOk).length) / toolScored.length).toFixed(1)}%)`
        : "n/a",
      kpiOuro: kpiScored.length
        ? `${kpiScored.filter((r) => r.kpiOk).length}/${kpiScored.length}`
        : "n/a",
      respostaOk: (() => {
        const scored = okRuns.filter((r) => r.respostaOk !== null);
        return scored.length
          ? `${scored.filter((r) => r.respostaOk).length}/${scored.length}`
          : "n/a";
      })(),
      memoriaPorTurno: (() => {
        const scored = okRuns.filter((r) => r.expectativasOk !== null && r.expectativasOk !== undefined);
        return scored.length
          ? `${scored.filter((r) => r.expectativasOk).length}/${scored.length}`
          : "n/a";
      })(),
      casosComSuspeitaAlucinacao: `${haluc.length}/${okRuns.length}`,
      custoP50Usd: p50(okRuns.map((r) => r.custoUsd)).toFixed(4),
      custoTotalUsd: okRuns.reduce((s, r) => s + r.custoUsd, 0).toFixed(2),
      latP50s: (p50(okRuns.map((r) => r.durMs)) / 1000).toFixed(1),
      duracaoTotalMin: ((Date.now() - t0) / 60000).toFixed(1),
    };
    console.log(JSON.stringify(resumo, null, 2));
    const slug = `${provider}-${model}`.replace(/[^a-z0-9.-]+/gi, "_");
    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify({ resumo, results }, null, 2));
    console.log(`[ab] detalhe: docs/superpowers/research/ab-cerebro/${slug}.json`);
    // falhas de tool pra inspecao rapida
    for (const r of okRuns.filter((x) => (x.expectativasMiss?.length ?? 0) > 0).slice(0, 10)) {
      console.log(`  [memoria-turno] ${r.id}: ${r.expectativasMiss!.join(" | ")}`);
    }
    for (const r of okRuns.filter((x) => x.toolOk === false).slice(0, 8)) {
      console.log(`  [tool-errada] ${r.id}: esperava ${casos.find((c) => c.id === r.id)?.toolEsperada}, chamou [${r.toolsCalled.join(",")}]`);
    }
  }
  await prisma.$disconnect();
  setTimeout(() => process.exit(0), 300);
}

main().catch((e) => {
  console.error("[ab] FATAL:", e);
  process.exit(1);
});
