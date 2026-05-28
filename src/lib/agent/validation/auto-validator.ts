/**
 * AutoValidator: camada de validacao da resposta final do agente Nex.
 *
 * Roda apos o LLM gerar a resposta final, antes de devolver ao usuario. Se
 * detectar problema, retorna `outcome.ok=false` com `hint` corretivo, que o
 * `run-agent.ts` usa para disparar 1 retry.
 *
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A12
 * Laudo: docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md §2
 *
 * 4 validadores:
 *   V1 anti-truncamento  , rejeita "veio truncado" quando ha agregado
 *   V2 anti-invencao     , verifica numeros citados contra toolResults
 *   V3 anti-recusa       , rejeita "nao consegui obter" quando ha _RESPOSTA
 *   V4 anti-placeholder  , rejeita bullets com "nao consegui obter esse dado"
 *
 * Feature flag: AgentSettings.autoValidatorMode (off|shadow|active).
 */

export type ValidationFailReason = "V1" | "V2" | "V3" | "V4" | null;

/**
 * Estrutura minima do resultado de uma tool tal qual chega ao validator.
 * Tools que adotaram o envelope (Onda 1.B/C) trazem _RESPOSTA, _DESTAQUE,
 * _agregado e topPorParticipante. Demais tools ainda trazem so `dados`/`linhas`.
 */
export interface ToolResultLike {
  toolName: string;
  dados?: {
    _RESPOSTA?: string;
    _DESTAQUE?: Record<string, string | number>;
    _agregado?: Record<string, number | undefined>;
    topPorParticipante?: Array<{ nome: string; soma: number; n: number }>;
    titulos?: unknown[];
    linhas?: unknown[];
    serie?: unknown[];
    [k: string]: unknown;
  };
  /** Calculos canonicos disponiveis para essa tool (vide responder.ts). */
  calcsCanonicos?: Array<{
    nome: string;
    computar: (linhas: unknown[]) => number;
  }>;
}

export interface ValidationContext {
  question: string;
  llmResponse: string;
  toolResults: ToolResultLike[];
}

export interface ValidationOutcome {
  ok: boolean;
  reason: ValidationFailReason;
  /** Texto para usar como instrucao do retry. */
  hint: string;
  /** Detalhe categorizado, sem PII (persistido em retryDetail). */
  detalhe: string;
}

// ---------------------------------------------------------------------------
// V1: anti-truncamento
// ---------------------------------------------------------------------------

// V1 cobre apenas o sub-padrao "lista/resultado veio truncado/cortado/incompleto"
// e "retorno veio incompleto". O sub-padrao "nao consegui obter" e tratado por
// V3 (anti-recusa) para evitar dupla cobertura conflitante.
// Nota: usa \w* no final (em vez de \b) para casar variacoes truncad/truncada/
// truncadas/truncado/cortado/cortada/incompleto/incompleta.
const REGEX_V1_TRUNCAMENTO =
  /\b(veio\s+(truncad|cortad|incompleto|incompleta)\w*|listagem\s+veio\s+(truncad|cortad)\w*|retorno\s+veio\s+(incompleto|incompleta)\w*|sem\s+somat[óo]rio|sem\s+o\s+total\s+(fechado|exato)|consulta\s+veio\s+(truncad|cortad)\w*)/i;

function temAgregadoDisponivel(ctx: ValidationContext): boolean {
  for (const tr of ctx.toolResults) {
    const d = tr.dados;
    if (!d) continue;
    if (d._RESPOSTA && d._RESPOSTA.length > 0) return true;
    if (d._DESTAQUE && Object.keys(d._DESTAQUE).length > 0) return true;
    if (d._agregado && Object.keys(d._agregado).length > 0) return true;
    if (d.topPorParticipante && d.topPorParticipante.length > 0) return true;
  }
  return false;
}

function validateV1(ctx: ValidationContext): ValidationOutcome | null {
  if (!REGEX_V1_TRUNCAMENTO.test(ctx.llmResponse)) return null;
  if (!temAgregadoDisponivel(ctx)) return null;
  return {
    ok: false,
    reason: "V1",
    hint: "Sua resposta disse que veio truncado/incompleto, mas o resultado da tool ja traz o total/agregado. Use o campo _RESPOSTA ou _DESTAQUE/_agregado para entregar o total correto, sem declarar truncamento.",
    detalhe: "V1:trunc_com_agregado",
  };
}

// ---------------------------------------------------------------------------
// V2: anti-invencao
// ---------------------------------------------------------------------------

export interface NumeroExtraido {
  texto: string;
  valor: number;
  tipo: "moeda" | "inteiro" | "decimal";
}

/**
 * Extrai numeros monetarios e contagens da resposta do LLM. Ignora datas
 * (yyyy-mm-dd, dd/mm) e numeros < 5 (provavelmente referencia tipo "top 3").
 */
export function extrairNumeros(texto: string): NumeroExtraido[] {
  const numeros: NumeroExtraido[] = [];
  const seen = new Set<string>();

  // Moeda BR: R$ 1.234,56 / R$1.234,56 / R$ 1234,56
  const reMoeda = /R\$\s*([\d.]+(?:,\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = reMoeda.exec(texto)) !== null) {
    const raw = (m[1] ?? "").replace(/\./g, "").replace(",", ".");
    const v = parseFloat(raw);
    if (!Number.isNaN(v) && !seen.has(m[0] ?? "")) {
      seen.add(m[0] ?? "");
      numeros.push({ texto: m[0] ?? "", valor: v, tipo: "moeda" });
    }
  }

  // Contagens: "519 pedidos", "170 notas", "70 cadastros"
  const reCont =
    /\b(\d{1,3}(?:\.\d{3})*)\s+(?:pedidos?|notas?|cadastros?|fornecedores?|clientes?|vendedores?|t[íi]tulos?|locais?|armaz[ée]ns?|produtos?|parcelas?|unidades?)\b/gi;
  while ((m = reCont.exec(texto)) !== null) {
    const raw = (m[1] ?? "").replace(/\./g, "");
    const v = parseFloat(raw);
    if (!Number.isNaN(v) && v >= 5 && !seen.has(m[0] ?? "")) {
      seen.add(m[0] ?? "");
      numeros.push({ texto: m[0] ?? "", valor: v, tipo: "inteiro" });
    }
  }

  return numeros;
}

/** Verifica se o valor aparece literal em alguma propriedade do envelope. */
function apareceLiteralEmEnvelope(
  valor: number,
  results: ToolResultLike[],
  toleranciaPct: number,
): boolean {
  for (const tr of results) {
    const d = tr.dados;
    if (!d) continue;
    const valoresCandidatos: number[] = [];
    if (d._DESTAQUE) {
      for (const v of Object.values(d._DESTAQUE)) {
        if (typeof v === "number") valoresCandidatos.push(v);
      }
    }
    if (d._agregado) {
      for (const v of Object.values(d._agregado)) {
        if (typeof v === "number") valoresCandidatos.push(v);
      }
    }
    if (d.topPorParticipante) {
      for (const t of d.topPorParticipante) {
        valoresCandidatos.push(t.soma);
        valoresCandidatos.push(t.n);
      }
    }
    // Varre linhas-array conhecidos buscando campos comuns
    for (const arrKey of ["titulos", "linhas", "serie", "top", "topMaiores"] as const) {
      const arr = (d as Record<string, unknown>)[arrKey];
      if (!Array.isArray(arr)) continue;
      // T-23 (2026-05-27): aceita array.length como valor derivado valido.
      // Cobre casos "X etapas listadas", "Y filiais" onde o LLM cita a
      // contagem de itens da lista.
      valoresCandidatos.push(arr.length);
      // Soma de campos numericos comuns das linhas (cobre LLM somando
      // subset como "total dos visiveis" sem precisar de calc canonico
      // dedicado para a tool).
      const sumByField: Record<string, number> = {};
      for (const item of arr) {
        if (typeof item !== "object" || item === null) continue;
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          if (typeof v === "number") {
            valoresCandidatos.push(v);
            sumByField[k] = (sumByField[k] ?? 0) + v;
          }
        }
      }
      for (const s of Object.values(sumByField)) valoresCandidatos.push(s);
    }
    const tol = Math.max(0.01, Math.abs(valor) * toleranciaPct);
    if (valoresCandidatos.some((v) => Math.abs(v - valor) <= tol)) return true;
  }
  return false;
}

/** Verifica se o valor aparece na pergunta original (ex: "top 10"). */
function apareceNaPergunta(valor: number, pergunta: string): boolean {
  const inteiros = pergunta.match(/\b\d+\b/g) ?? [];
  return inteiros.some((s) => {
    const n = parseInt(s, 10);
    return !Number.isNaN(n) && n === Math.round(valor);
  });
}

/** Verifica se o valor bate com algum calculo canonico. */
function bateComCalculoCanonico(
  valor: number,
  results: ToolResultLike[],
  toleranciaPct: number,
): boolean {
  for (const tr of results) {
    const calcs = tr.calcsCanonicos;
    if (!calcs || calcs.length === 0) continue;
    const linhas = (tr.dados?.titulos ?? tr.dados?.linhas ?? []) as unknown[];
    if (linhas.length === 0) continue;
    const tol = Math.max(0.01, Math.abs(valor) * toleranciaPct);
    for (const c of calcs) {
      try {
        const r = c.computar(linhas);
        if (Math.abs(r - valor) <= tol) return true;
      } catch {
        // ignora calculo que crashe
      }
    }
  }
  return false;
}

function validateV2(ctx: ValidationContext): ValidationOutcome | null {
  const numeros = extrairNumeros(ctx.llmResponse);
  if (numeros.length === 0) return null;
  // Tolerancia: 0.1% relativa, minimo R$0,01 (separa arredondamento de invencao).
  const TOL = 0.001;
  const suspeitos: NumeroExtraido[] = [];
  for (const num of numeros) {
    if (apareceLiteralEmEnvelope(num.valor, ctx.toolResults, TOL)) continue;
    if (apareceNaPergunta(num.valor, ctx.question)) continue;
    if (bateComCalculoCanonico(num.valor, ctx.toolResults, TOL)) continue;
    suspeitos.push(num);
  }
  if (suspeitos.length === 0) return null;
  const lista = suspeitos
    .slice(0, 3)
    .map((s) => s.texto)
    .join(", ");
  return {
    ok: false,
    reason: "V2",
    hint: `Os numeros que voce citou (${lista}) nao estao nos resultados nem sao soma/contagem das linhas. Use apenas valores presentes nos toolResults (campo _RESPOSTA, _DESTAQUE, _agregado, ou somas exatas das linhas).`,
    detalhe: `V2:numero_nao_derivado:${suspeitos[0]?.tipo ?? "?"}`,
  };
}

// ---------------------------------------------------------------------------
// V3: anti-recusa indevida
// ---------------------------------------------------------------------------

const REGEX_V3_RECUSA =
  /^\s*(N[ãa]o\s+consegui|Essa\s+informa[çc][ãa]o\s+n[ãa]o\s+est[áa]\s+dispon[íi]vel|Voc[êe]\s+tem\s+raz[ãa]o|N[ãa]o\s+consigo)/i;

/** Termos que indicam que a pergunta e legitimamente fora de escopo. */
const TERMOS_FORA_ESCOPO = [
  "meta",
  "margem",
  "liquidez",
  "regi[ãa]o",
  "estado",
  "marca",
  "vendedor\\s+cadastrado",
  "tempo\\s+m[ée]dio",
  "fechar\\s+meta",
  "bater\\s+meta",
  "interior",
  "folha",
  // T-23 (2026-05-27): termos extra identificados na analise raiz R17
  "entrega",
  "sem\\s+nota\\s+emitida",
  "sem\\s+cadastro",
  "rede\\s+de\\s+academias",
  "pra\\s+entrega",
  "entrega\\s+amanh[ãa]",
];

const REGEX_FORA_ESCOPO = new RegExp(
  TERMOS_FORA_ESCOPO.map((t) => `\\b${t}\\b`).join("|"),
  "i",
);

function validateV3(ctx: ValidationContext): ValidationOutcome | null {
  if (!REGEX_V3_RECUSA.test(ctx.llmResponse)) return null;
  if (!temAgregadoDisponivel(ctx)) return null;
  // Se a pergunta original menciona termo fora-de-escopo, recusa pode ser legitima.
  if (REGEX_FORA_ESCOPO.test(ctx.question)) return null;
  return {
    ok: false,
    reason: "V3",
    hint: "Voce respondeu 'nao consegui obter' mas a tool ja retornou _RESPOSTA/_DESTAQUE/_agregado preenchidos. Use o campo _RESPOSTA da tool como base e entregue a informacao.",
    detalhe: "V3:recusa_com_agregado",
  };
}

// ---------------------------------------------------------------------------
// V4: anti-placeholder em bullet
// ---------------------------------------------------------------------------

const REGEX_V4_PLACEHOLDER =
  /^[ \t]*[-\*][ \t].*n[ãa]o\s+consegui\s+obter\s+esse\s+dado/im;

function validateV4(ctx: ValidationContext): ValidationOutcome | null {
  if (!REGEX_V4_PLACEHOLDER.test(ctx.llmResponse)) return null;
  return {
    ok: false,
    reason: "V4",
    hint: "Voce escreveu 'nao consegui obter esse dado' como item de lista. Essa frase substitui a resposta inteira, nao serve como placeholder em bullets. Ou cite o valor real do toolResults, ou omita a linha.",
    detalhe: "V4:placeholder_em_bullet",
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface ValidatorFlags {
  v1Enabled?: boolean;
  v2Enabled?: boolean;
  v3Enabled?: boolean;
  v4Enabled?: boolean;
}

const OK: ValidationOutcome = {
  ok: true,
  reason: null,
  hint: "",
  detalhe: "",
};

/**
 * Roda os 4 validadores em ordem; primeira falha vence. Permite habilitar/
 * desabilitar individuais via flags (default = todos true).
 */
export function validateResponse(
  ctx: ValidationContext,
  flags: ValidatorFlags = {},
): ValidationOutcome {
  const v1On = flags.v1Enabled ?? true;
  const v2On = flags.v2Enabled ?? true;
  const v3On = flags.v3Enabled ?? true;
  const v4On = flags.v4Enabled ?? true;

  // Ordem deliberada: V1 (truncamento) -> V3 (recusa) -> V4 (placeholder em
  // bullet) -> V2 (invencao numerica). V4 antes de V2 porque problema cosmetico
  // de placeholder em bullet e mais especifico/util de capturar primeiro do que
  // a deteccao numerica geral, que tende a ser mais ruidosa.
  if (v1On) {
    const r = validateV1(ctx);
    if (r) return r;
  }
  if (v3On) {
    const r = validateV3(ctx);
    if (r) return r;
  }
  if (v4On) {
    const r = validateV4(ctx);
    if (r) return r;
  }
  if (v2On) {
    const r = validateV2(ctx);
    if (r) return r;
  }
  return OK;
}
