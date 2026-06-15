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

// Fonte unica das chaves de array (F4 Apresentacao, Onda 1.2). Subconjunto
// VALOR = chaves que o V2 (anti-invencao) varre buscando valor citado.
import {
  validateV10Percentuais,
  validateV11RankingItem,
  validateV12Consistencia,
  validateV13Proveniencia,
} from "./v-claims";
import { ARRAY_KEYS_VALOR } from "../../../../mcp/lib/array-keys";

export type ValidationFailReason =
  | "V1"
  | "V2"
  | "V3"
  | "V4"
  | "V5"
  | "V6"
  | "V7"
  | "V8"
  | "V9"
  | "V10"
  | "V11"
  | "V12"
  | "V13"
  | null;

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
    /** Contrato de lista (Fase B): ordenacao declarada + visao top pronta. */
    ordenadoPor?: string;
    topMaiores?: Array<{ nome: string; valor: number }>;
    /** Marcadores de lista incompleta (V6 nao verifica nestes casos). */
    _amostraReduzida?: unknown;
    _listaTruncada?: boolean;
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
  /**
   * Onda M (Arquitetura 3.0) M.6: fontes de memoria que FORAM injetadas no
   * prompt deste turno (toolDigests de turnos antigos + respostas assistant
   * da janela). Numeros presentes aqui sao LEGITIMOS , sem isso o V2
   * reprovaria qualquer resposta correta baseada em memoria da conversa.
   */
  fontesMemoria?: string[];
}

/**
 * Valores numericos presentes nas fontes de memoria injetadas. Cobre os dois
 * formatos que convivem ali: prosa pt-BR das respostas da janela
 * ("R$ 6.334.712,46") e os toolDigests em formato US ("headlineValor=6334712.46").
 */
function valoresDaMemoria(ctx: ValidationContext): number[] {
  const out: number[] = [];
  for (const fonte of ctx.fontesMemoria ?? []) {
    // pt-BR (mesmo parser usado na resposta do LLM)
    for (const n of extrairNumeros(fonte)) out.push(n.valor);
    // US decimal dos digests: 6334712.46
    for (const m of fonte.matchAll(/(?<![\d.,])(\d+\.\d{1,2})(?![\d])/g)) {
      const v = Number(m[1]);
      if (!Number.isNaN(v)) out.push(v);
    }
  }
  return out;
}

function bateComMemoria(valor: number, memoria: number[], tol: number): boolean {
  for (const m of memoria) {
    const ref = Math.max(Math.abs(m), 0.01);
    if (Math.abs(valor - m) <= Math.max(ref * tol, 0.01)) return true;
  }
  return false;
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

const REGEX_TOOL_FACTUAL =
  /^(financeiro|fiscal|estoque|comercial|contabil|cadastro)_/;

/**
 * T-33 (Ronda 2): detecta "lacuna prematura" — turno chamou tool factual de
 * dominio (financeiro_*, fiscal_*, etc) E em seguida chamou registrar_lacuna.
 * Quando isso acontece, o LLM tinha o dado disponivel mas desistiu. O hint
 * do retry deve mencionar a tool factual especifica para forcar reuso.
 */
function detectarLacunaPrematura(ctx: ValidationContext): {
  ehLacunaPrematura: boolean;
  toolsFactuais: string[];
} {
  const toolNames = ctx.toolResults.map((tr) => tr.toolName);
  const usouLacuna = toolNames.includes("registrar_lacuna");
  const toolsFactuais = toolNames.filter((n) => REGEX_TOOL_FACTUAL.test(n));
  return { ehLacunaPrematura: usouLacuna && toolsFactuais.length > 0, toolsFactuais };
}

/** Anexa ao hint uma menção a tools factuais quando houve lacuna prematura. */
function ampliarHintComLacuna(baseHint: string, ctx: ValidationContext): string {
  const lac = detectarLacunaPrematura(ctx);
  if (!lac.ehLacunaPrematura) return baseHint;
  const unicas = [...new Set(lac.toolsFactuais)];
  return (
    baseHint +
    `\n\nATENCAO: voce chamou ${unicas.join(", ")} ANTES de chamar registrar_lacuna. ` +
    `Isso e' "lacuna prematura": o dado estava disponivel e voce desistiu. ` +
    `Use o conteudo dessa(s) tool(s) (especialmente _RESPOSTA, _DESTAQUE, topPorParticipante, topMaiores) ` +
    `para entregar a resposta sem registrar lacuna.`
  );
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
    for (const arrKey of ARRAY_KEYS_VALOR) {
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
  // Onda M (M.6): numeros vindos da memoria injetada sao fonte legitima.
  const memoria = valoresDaMemoria(ctx);
  const suspeitos: NumeroExtraido[] = [];
  for (const num of numeros) {
    if (apareceLiteralEmEnvelope(num.valor, ctx.toolResults, TOL)) continue;
    if (apareceNaPergunta(num.valor, ctx.question)) continue;
    if (bateComCalculoCanonico(num.valor, ctx.toolResults, TOL)) continue;
    if (bateComMemoria(num.valor, memoria, TOL)) continue;
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
  const baseHint =
    "Voce respondeu 'nao consegui obter' mas a tool ja retornou _RESPOSTA/_DESTAQUE/_agregado preenchidos. Use o campo _RESPOSTA da tool como base e entregue a informacao.";
  return {
    ok: false,
    reason: "V3",
    hint: ampliarHintComLacuna(baseHint, ctx),
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
// V5: anti-ignorou-_RESPOSTA
// ---------------------------------------------------------------------------
//
// Caso da Ronda 1 (laudo R17+R18): tool retorna `_RESPOSTA` curado com numeros
// e nomes, mas o LLM emite uma resposta independente que ignora completamente
// o conteudo entregue. Ex: tool diz "Total em aberto a receber: R$ 1.234.567,89
// em 42 titulos. Maior cliente: Smartfit (R$ 250.000)." e o LLM responde
// "Nao consegui fechar o total com seguranca, a lista veio parcial."
//
// V5 mede overlap de tokens entre o _RESPOSTA da tool e a resposta do LLM.
// Se < 25% dos tokens significativos do _RESPOSTA aparecem na resposta final,
// e o _RESPOSTA tinha conteudo nao-trivial (>= 3 tokens significativos),
// V5 falha.

/** Token significativo: palavra >= 4 chars que nao e stopword PT-BR comum. */
const STOPWORDS = new Set([
  "para",
  "pela",
  "pelo",
  "pelos",
  "pelas",
  "como",
  "isso",
  "esse",
  "esta",
  "este",
  "essa",
  "esses",
  "essas",
  "estes",
  "estas",
  "muito",
  "muita",
  "mais",
  "menos",
  "ainda",
  "depois",
  "antes",
  "tambem",
  "também",
  "outro",
  "outra",
  "outros",
  "outras",
  "todo",
  "toda",
  "todos",
  "todas",
  "qual",
  "quais",
  "quanto",
  "quanta",
  "quantos",
  "quantas",
  "quando",
  "onde",
  "porque",
  "porquê",
]);

function tokensSignificativos(texto: string): string[] {
  // Remove pontuacao, normaliza minusculas, separa por whitespace.
  const limpo = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacriticos pra comparar "saldo" == "saldo"
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  return limpo
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t))
    .filter((t, i, arr) => arr.indexOf(t) === i); // dedup
}

function temRespostaCuradaNaoTrivial(ctx: ValidationContext): {
  resposta: string;
  tokens: string[];
} | null {
  for (const tr of ctx.toolResults) {
    const r = tr.dados?._RESPOSTA;
    if (typeof r !== "string" || r.length < 20) continue;
    const tokens = tokensSignificativos(r);
    if (tokens.length >= 3) {
      return { resposta: r, tokens };
    }
  }
  return null;
}

/** Extrai numeros relevantes (moeda, contagens > 4) de um texto. */
function extrairNumerosRelevantes(texto: string): string[] {
  const nums = new Set<string>();
  // Moeda BR: "R$ 1.234,56" / "R$ 0,00" / "R$ 1234,56"
  for (const m of texto.matchAll(/R\$\s*[\d.]+(?:,\d{1,2})?/g)) {
    nums.add(m[0].replace(/\s+/g, ""));
  }
  // Contagens inteiras >= 5 (evita falso positivo com "3 dias", "top 5").
  for (const m of texto.matchAll(/\b(\d{1,3}(?:\.\d{3})*|\d+)\b/g)) {
    const raw = (m[1] ?? "").replace(/\./g, "");
    const v = Number(raw);
    if (!Number.isNaN(v) && v >= 5) nums.add(raw);
  }
  return [...nums];
}

/** Normaliza numero pra comparacao: "R$ 1.234,56" -> "1234.56", "5.000" -> "5000". */
function normNum(s: string): string {
  return s
    .replace(/R\$/g, "")
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:[^\d]|$))/g, "") // remove pontos de milhar
    .replace(",", ".");
}

function validateV5(ctx: ValidationContext): ValidationOutcome | null {
  const curada = temRespostaCuradaNaoTrivial(ctx);
  if (!curada) return null;

  // V5b (Ronda 2): primeiro checa numeros ocultos. Se _RESPOSTA tem numero
  // factual (R$ X / N titulos / N etapas) e a resposta final NAO cita
  // NENHUM desses numeros, o LLM ignorou o dado entregue. Esse criterio
  // pega casos onde overlap textual e alto (palavras "receber", "titulos"
  // aparecem nos dois) mas o numero crucial sumiu.
  const numsCurados = extrairNumerosRelevantes(curada.resposta).map(normNum);
  if (numsCurados.length > 0) {
    const numsLLM = new Set(extrairNumerosRelevantes(ctx.llmResponse).map(normNum));
    const algumAparece = numsCurados.some((n) => numsLLM.has(n));
    if (!algumAparece) {
      const baseHint = `Os dados da tool trazem os numeros prontos ("${curada.resposta}"), mas voce nao citou nenhum deles. Reescreva a resposta com as suas palavras, em tom natural de conversa, citando os numeros principais EXATAMENTE como vieram (valores, contagens, nomes).`;
      return {
        ok: false,
        reason: "V5",
        hint: ampliarHintComLacuna(baseHint, ctx),
        detalhe: `V5b:numero_curado_ausente:${numsCurados.length}_curados_0_citados`,
      };
    }
  }

  // Onda humanizacao 2026-06-12: o check de overlap TEXTUAL foi removido de
  // proposito. Ele forcava o modelo a colar o texto tecnico do formatador
  // ("7 produto(s) encontrado(s)...") e era a raiz do tom robotico. A protecao
  // que importa (nao ignorar o DADO) continua acima, por NUMEROS: se a resposta
  // cita os numeros da _RESPOSTA, o texto e livre.
  return null;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// F3 (cerebro, onda 3b): checks NOVOS V6/V7. Sao SHADOW (telemetria), rodam
// fora do early-return de validateResponse (via runShadowChecks). Operam so
// sobre o que o envelope atual expoe; ausencia de metadado => "nao verificavel"
// (null), nunca falso positivo. Datas-no-periodo ficou para a F4 (periodoDe/Ate
// sao input, nao saem no envelope). Spec F3 secao 5.2.
// ---------------------------------------------------------------------------

const CAMPOS_VALOR_LINHA = [
  "valor",
  "valorTotal",
  "vrNf",
  "vr_nf",
  "soma",
  "total",
  "vrProdutos",
  "vr_produtos",
];
const CAMPOS_TOTAL_AGREGADO = ["total", "soma", "valorTotal", "valor", "valorFaturado"];

/** Extrai um numero do primeiro campo de valor conhecido de uma linha. */
function valorDaLinha(linha: unknown): number | null {
  if (!linha || typeof linha !== "object") return null;
  const obj = linha as Record<string, unknown>;
  for (const c of CAMPOS_VALOR_LINHA) {
    const v = obj[c];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Total declarado pelo proprio _agregado (primeiro campo conhecido numerico). */
function totalDeclarado(agregado: Record<string, number | undefined> | undefined): number | null {
  if (!agregado) return null;
  for (const c of CAMPOS_TOTAL_AGREGADO) {
    const v = agregado[c];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * V6: confere o total que o PROPRIO envelope declara (_agregado) contra a soma das
 * LINHAS que o proprio envelope retornou. Independe do texto do LLM (cobertura nova
 * vs V2, que olha numeros citados pelo LLM). Pega tool que se autocontradiz.
 * "Nao verificavel" (null) quando falta total declarado ou linhas com valor.
 */
export function validateV6(ctx: ValidationContext): ValidationOutcome | null {
  for (const tr of ctx.toolResults) {
    const dados = tr.dados;
    if (!dados) continue;
    // Nao verificavel quando a lista do envelope esta truncada/paginada: a soma
    // das linhas exibidas NAO cobre o total declarado (que e do conjunto inteiro).
    // Comparar geraria falso positivo. _amostraReduzida = corte do guard (24KB);
    // _listaTruncada = paginacao da propria tool.
    if (dados._amostraReduzida || dados._listaTruncada === true) continue;
    const total = totalDeclarado(dados._agregado);
    const linhas = Array.isArray(dados.linhas) ? dados.linhas : null;
    if (total === null || !linhas || linhas.length === 0) continue;
    const valores = linhas.map(valorDaLinha);
    if (valores.some((v) => v === null)) continue; // linha sem campo de valor => nao verificavel
    const soma = valores.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    const tol = Math.max(0.01, Math.abs(total) * 0.005); // 0.5% ou 1 centavo
    if (Math.abs(soma - total) > tol) {
      return {
        ok: false,
        reason: "V6",
        hint:
          "O total declarado pela tool nao bate com a soma das linhas retornadas. " +
          "Confira a coerencia antes de afirmar o numero.",
        detalhe: `V6:${tr.toolName}:total=${total}:soma=${soma}`,
      };
    }
  }
  return null;
}

/**
 * V7: heuristica conservadora de duplicacao por JOIN. Conta linhas IDENTICAS
 * (mesma serializacao) em dados.linhas; se a fracao de duplicatas exatas passa o
 * limiar (e ha linhas suficientes), sinaliza possivel fan-out de JOIN. Dados
 * distintos normais nao disparam. "Nao verificavel" com poucas linhas.
 */
export function validateV7(ctx: ValidationContext): ValidationOutcome | null {
  const MIN_LINHAS = 4;
  const LIMIAR_DUP = 0.4; // >=40% de linhas sao copias exatas de outra
  for (const tr of ctx.toolResults) {
    const linhas = tr.dados && Array.isArray(tr.dados.linhas) ? tr.dados.linhas : null;
    if (!linhas || linhas.length < MIN_LINHAS) continue;
    const vistos = new Map<string, number>();
    for (const l of linhas) {
      let chave: string;
      try {
        chave = JSON.stringify(l);
      } catch {
        chave = String(l);
      }
      vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
    }
    let duplicadas = 0;
    for (const n of vistos.values()) if (n > 1) duplicadas += n - 1;
    if (duplicadas / linhas.length >= LIMIAR_DUP) {
      return {
        ok: false,
        reason: "V7",
        hint:
          "A tool retornou muitas linhas identicas (possivel duplicacao por JOIN). " +
          "Verifique se o total nao esta inflado.",
        detalhe: `V7:${tr.toolName}:linhas=${linhas.length}:duplicadas=${duplicadas}`,
      };
    }
  }
  return null;
}

/** Pergunta que CONTESTA a resposta anterior (meta-pergunta): "por que nao
 *  apareceu X?", "faltou Y", "esta errado", "esses nao sao os maiores".
 *  Nesses turnos a resposta certa e' explicativa, nao a _RESPOSTA da tool. */
export const CONTESTACAO_RE =
  /\b(por\s*que|pq|porque)\s+n[aã]o\b|\bfalt(ou|aram|am|a)\b|\best[aá]\s+errad|\berrado[,.!\s]|\bn[aã]o\s+s[aã]o\s+(os|as)\b|\bcad[eê]\b|\bn[aã]o\s+(apareceu|aparecem|veio|vieram)\b/i;

/**
 * V9 , gap de fonte (Onda C Cobertura Cliente, 2026-06-11).
 *
 * Fronteira com o V3: o V3 pega recusa quando HA _RESPOSTA/agregado disponivel
 * (recusa com dado em maos). O V9 pega a recusa SECA quando NAO ha dado , o
 * certo nesses turnos e explicar a CAUSA citando o sistema/modulo/cadastro
 * ("o modulo de prospeccao existe, mas nao ha dados cadastrados"), nunca um
 * "nao consigo te responder" que parece defeito da plataforma. Regex local,
 * sem custo LLM; o retry instrui a citar a fonte. Pulado em CONTESTACAO
 * (regra 5b , a explicacao investigativa pode conter "nao consigo").
 */
const RECUSA_SECA_RE = /\bn[aã]o\s+(consigo|foi\s+poss[ií]vel|consegui)\b/i;
const MENCIONA_FONTE_RE = /\bsistema\b|m[oó]dulo|cadastr|registr|\bfonte\b|per[ií]odo|\bodoo\b/i;

export function validateV9(ctx: ValidationContext): ValidationOutcome | null {
  if (!RECUSA_SECA_RE.test(ctx.llmResponse)) return null;
  if (MENCIONA_FONTE_RE.test(ctx.llmResponse)) return null;
  // Recusas legitimas ficam fora: pergunta fora de escopo, ou lacuna ja
  // registrada (registrar_lacuna devolve respostaSugerida que explica a causa
  // , o retry da lacuna e tratado pelo prompt, nao pelo V9).
  if (REGEX_FORA_ESCOPO.test(ctx.question)) return null;
  if (ctx.toolResults.some((t) => t.toolName === "registrar_lacuna")) return null;
  return {
    ok: false,
    reason: "V9",
    hint:
      "Voce deu uma recusa seca ('nao consigo...'). Explique a CAUSA citando o " +
      "sistema/modulo/cadastro: se o dado nao existe na fonte, diga onde ele " +
      "entraria e que nao ha dados cadastrados; se parte da pergunta tem dado, " +
      "responda essa parte. Nunca deixe parecer defeito da plataforma.",
    detalhe: "V9:recusa_seca_sem_fonte",
  };
}

/** Palavras que alegam enquadramento de "maiores/top" na resposta. */
const ALEGA_MAIORES_RE =
  /\b(?:\d+\s+)?maiores\b|\btop\s*\d+\b|\bmais\s+(?:altos?|caras?|caros?|valiosos?)\b/i;

/**
 * V8 , enquadramento de lista (Fase B.6 do Nex Especialista, 2026-06-11).
 *
 * Caso forense #1 do laudo: o agente rotulou de "10 maiores" uma lista em
 * ordem arbitraria (titulos de R$ 5 mil apresentados como maiores quando havia
 * titulo de R$ 1,15 mi). O V8 exige SUSTENTACAO no tool result para a alegacao
 * "maiores/top": ou o envelope traz `topMaiores` (visao pronta), ou declara
 * `ordenadoPor` por valor/total desc. Sem sustentacao, retry com instrucao.
 */
export function validateV8(ctx: ValidationContext): ValidationOutcome | null {
  if (!ALEGA_MAIORES_RE.test(ctx.llmResponse)) return null;

  const comLista = ctx.toolResults.filter((tr) => {
    const d = tr.dados;
    if (!d) return false;
    return (
      Array.isArray(d.titulos) || Array.isArray(d.linhas) || Array.isArray(d.serie)
    );
  });
  if (comLista.length === 0) return null;

  const sustentado = comLista.some((tr) => {
    const d = tr.dados!;
    if (Array.isArray(d.topMaiores) && d.topMaiores.length > 0) return true;
    const ord = String(d.ordenadoPor ?? "").toLowerCase();
    return /(valor|total|saldo|quantidade)\s+desc/.test(ord);
  });
  if (sustentado) return null;

  return {
    ok: false,
    reason: "V8",
    hint:
      "Voce apresentou itens como 'os maiores', mas a lista da tool NAO esta " +
      "ordenada por valor (sem topMaiores e sem ordenadoPor de valor desc). " +
      "Use o campo topMaiores quando existir; senao, NAO rotule de 'maiores' , " +
      "descreva a lista pela ordenacao real declarada em ordenadoPor.",
    detalhe: `V8:enquadramento_maiores_sem_sustentacao:${comLista[0].toolName}`,
  };
}

/**
 * Roda os checks SHADOW novos (V6/V7) e retorna os que dispararam, SEM
 * short-circuit (ambos sempre avaliados). O run-agent loga para telemetria;
 * nao viram retry em shadow. Promocao a active (e a politica de falha) e
 * decidida no run-agent (decideRetryOuGap).
 */
export function runShadowChecks(ctx: ValidationContext): ValidationOutcome[] {
  const out: ValidationOutcome[] = [];
  const v6 = validateV6(ctx);
  if (v6) out.push(v6);
  const v7 = validateV7(ctx);
  if (v7) out.push(v7);
  // Onda P (V-claims): V10 percentuais recomputados, V12 consistencia entre
  // turnos (freshness-aware), V13 proveniencia declarada , todos SHADOW.
  for (const check of [validateV10Percentuais, validateV12Consistencia, validateV13Proveniencia]) {
    try {
      const r = check(ctx);
      if (r) out.push(r);
    } catch {
      // v-claims nunca derruba o validador principal
    }
  }
  return out;
}

// Entry point
// ---------------------------------------------------------------------------

export interface ValidatorFlags {
  v1Enabled?: boolean;
  v2Enabled?: boolean;
  v3Enabled?: boolean;
  v4Enabled?: boolean;
  v5Enabled?: boolean;
  v8Enabled?: boolean;
  v9Enabled?: boolean;
  v11Enabled?: boolean;
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
  const v5On = flags.v5Enabled ?? true;
  const v8On = flags.v8Enabled ?? true;

  // Ordem deliberada: V1 (truncamento) -> V3 (recusa explicita) -> V5
  // (ignorou _RESPOSTA, mais sutil) -> V4 (placeholder em bullet) -> V2
  // (invencao numerica). V5 depois de V3 porque a recusa textual e mais
  // facil de detectar; V5 captura casos onde a resposta nao parece recusa
  // mas diverge completamente do _RESPOSTA curado.
  if (v1On) {
    const r = validateV1(ctx);
    if (r) return r;
  }
  // CONTESTAÇÃO/meta-pergunta (caso "Pq nao aparecem essas empresas?",
  // pericia 2026-06-11): a resposta CERTA e' explicativa/investigativa, nao a
  // _RESPOSTA da tool. V3 (anti-recusa) e V5 (anti-divergencia da _RESPOSTA)
  // PUNIAM a explicacao e forcavam o agente a recolar a mesma resposta ,
  // era um dos motores do "papagaio engessado". Nesses turnos, pulamos V3/V5.
  const ehContestacao = CONTESTACAO_RE.test(ctx.question);
  if (v3On && !ehContestacao) {
    const r = validateV3(ctx);
    if (r) return r;
  }
  if (v5On && !ehContestacao) {
    const r = validateV5(ctx);
    if (r) return r;
  }
  if (v4On) {
    const r = validateV4(ctx);
    if (r) return r;
  }
  // V9 depois dos validadores de recusa MAIS especificos (V3 recusa com dado
  // em maos; V4 placeholder em bullet): recusa seca generica sem citar a
  // fonte. Tambem pulado em contestacao (regra 5b).
  if ((flags.v9Enabled ?? true) && !ehContestacao) {
    const r = validateV9(ctx);
    if (r) return r;
  }
  if (v2On) {
    const r = validateV2(ctx);
    if (r) return r;
  }
  // V8 por ultimo: enquadramento de lista (alegou "maiores" sem sustentacao).
  if (v8On) {
    const r = validateV8(ctx);
    if (r) return r;
  }
  // Onda P (V-claims): V11 , o item apontado como "o maior" confere com o
  // topMaiores[0] real. ACTIVE de nascenca (so reprova com evidencia clara de
  // item trocado; inconclusivo nao dispara).
  if (flags.v11Enabled ?? true) {
    try {
      const r = validateV11RankingItem(ctx);
      if (r) return r;
    } catch {
      // nunca derruba o validador principal
    }
  }
  return OK;
}
