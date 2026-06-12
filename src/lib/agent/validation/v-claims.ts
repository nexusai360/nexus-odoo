// src/lib/agent/validation/v-claims.ts
// Onda P (Arquitetura 3.0) P.3/P.4 , V-claims: verificacao de ALEGACOES.
//
// Os validadores V1-V9 conferem numeros e enquadramento; os V-claims conferem
// o que a resposta AFIRMA sobre os numeros:
//   V10 (shadow): percentuais/variacoes recomputados , todo "X%" citado deve
//        ser literal das fontes ou derivavel de um par (a,b) delas.
//   V11 (active): superlativo singular ("o maior...") deve apontar para o
//        topMaiores[0] do envelope , conservador: so reprova quando a resposta
//        destaca claramente OUTRO item do ranking.
//   V12 (shadow, freshness-aware): mesma tool+chave com valor divergente da
//        memoria da conversa sem mencionar atualizacao , P.4 da spec; so vira
//        blocking com dados de producao provando precisao.
//   V13 (shadow): proveniencia declarada , resposta numerica precisa de
//        periodo/recorte declarado (P.2; a regra de prompt e o outro lado).
//
// Spec: docs/superpowers/specs/2026-06-12-nex-arquitetura-3-design.md §3.3.

import type { ValidationContext, ValidationOutcome } from "./auto-validator";

function normaliza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Todos os numeros (US e pt-BR) de um texto/objeto serializado das fontes. */
function numerosDasFontes(ctx: ValidationContext): number[] {
  const out: number[] = [];
  const push = (v: number) => {
    if (Number.isFinite(v)) out.push(v);
  };
  for (const tr of ctx.toolResults) {
    const raw = JSON.stringify(tr.dados ?? {});
    for (const m of raw.matchAll(/-?\d+(?:\.\d+)?/g)) push(Number(m[0]));
  }
  for (const fonte of ctx.fontesMemoria ?? []) {
    for (const m of fonte.matchAll(/-?\d+(?:\.\d+)?/g)) push(Number(m[0]));
    // pt-BR: 1.234.567,89
    for (const m of fonte.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}/g)) {
      push(Number(m[0].replace(/\./g, "").replace(",", ".")));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// V10: percentuais e variacoes recomputados (SHADOW)
// ---------------------------------------------------------------------------

const PCT_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?%/g;
const PCT_TOLERANCIA = 0.6; // pontos percentuais (cobre arredondamento de 1 casa)
const MAX_NUMS_PAR = 80; // cap do O(n^2)

export function validateV10Percentuais(
  ctx: ValidationContext,
): ValidationOutcome | null {
  const pcts: number[] = [];
  for (const m of ctx.llmResponse.matchAll(PCT_RE)) {
    const v = Number(m[1].replace(",", "."));
    if (Number.isFinite(v) && v > 0 && v <= 400) pcts.push(v);
  }
  if (pcts.length === 0) return null;

  const fontes = numerosDasFontes(ctx);
  const base = fontes.filter((n) => Math.abs(n) >= 0.01).slice(0, MAX_NUMS_PAR);

  const naoDerivados = pcts.filter((p) => {
    // (a) literal nas fontes (a tool ja calculou o percentual)
    if (fontes.some((n) => Math.abs(n - p) <= 0.05)) return false;
    // (b) razao a/b*100 ou variacao (a-b)/b*100 de algum par
    for (const a of base) {
      for (const b of base) {
        if (b === 0) continue;
        if (Math.abs((a / b) * 100 - p) <= PCT_TOLERANCIA) return false;
        if (Math.abs(Math.abs((a - b) / b) * 100 - p) <= PCT_TOLERANCIA) return false;
      }
    }
    return true;
  });
  if (naoDerivados.length === 0) return null;

  return {
    ok: false,
    reason: "V10",
    hint:
      `O percentual ${naoDerivados[0]}% citado na resposta nao e derivavel de nenhum ` +
      "par de numeros das fontes (toolResults/memoria). Recalcule a partir dos numeros " +
      "reais ou remova o percentual.",
    detalhe: `V10:pct_nao_derivado:${naoDerivados.map((p) => p).join(",")}`,
  };
}

// ---------------------------------------------------------------------------
// V11: item do superlativo confere com topMaiores[0] (ACTIVE, conservador)
// ---------------------------------------------------------------------------

const SUPERLATIVO_SINGULAR_RE =
  /\b(o maior|a maior|o principal|a principal|quem mais|lidera|em primeiro lugar|no topo)\b/i;

const TOKENS_GENERICOS = new Set([
  "ltda", "eireli", "epp", "s.a", "sa", "me", "comercio", "industria",
  "industrial", "matriz", "filial", "brasil", "grupo", "cia", "companhia",
  "produtos", "equipamentos", "servicos", "esportivos", "de", "do", "da", "dos", "das",
]);

function tokensSignificativos(nome: string): string[] {
  return normaliza(nome)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !TOKENS_GENERICOS.has(t));
}

export function validateV11RankingItem(
  ctx: ValidationContext,
): ValidationOutcome | null {
  if (!SUPERLATIVO_SINGULAR_RE.test(ctx.llmResponse)) return null;

  const resp = normaliza(ctx.llmResponse);
  for (const tr of ctx.toolResults) {
    const top = tr.dados?.topMaiores;
    if (!Array.isArray(top) || top.length < 2) continue;
    const presente = (nome: string) =>
      tokensSignificativos(nome).some((t) => resp.includes(t));
    if (presente(String(top[0]?.nome ?? ""))) continue; // topo citado: ok
    const outroCitado = top
      .slice(1)
      .find((item) => presente(String((item as { nome?: string })?.nome ?? "")));
    if (outroCitado) {
      return {
        ok: false,
        reason: "V11",
        hint:
          `Voce destacou "${(outroCitado as { nome?: string }).nome}" como o maior, mas o ` +
          `primeiro do ranking real (topMaiores) e "${(top[0] as { nome?: string }).nome}". ` +
          "Corrija o item apontado como maior usando a ordem do topMaiores.",
        detalhe: `V11:item_errado_no_superlativo:${tr.toolName}`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// V12: consistencia entre turnos, freshness-aware (SHADOW , P.4)
// ---------------------------------------------------------------------------

const MENCAO_ATUALIZACAO_RE =
  /atualizad|sincroniz|mudou|mudanca|variou|agora (e|esta)|mais recente|novo valor|era r?\$?/i;
const V12_DIVERGENCIA_MIN = 0.005; // 0,5% relativo

export function validateV12Consistencia(
  ctx: ValidationContext,
): ValidationOutcome | null {
  if (MENCAO_ATUALIZACAO_RE.test(ctx.llmResponse)) return null;

  for (const tr of ctx.toolResults) {
    const destaque = tr.dados?._DESTAQUE as Record<string, unknown> | undefined;
    if (!destaque) continue;
    const digests = (ctx.fontesMemoria ?? []).filter((f) =>
      f.includes(`[${tr.toolName}]`),
    );
    for (const digest of digests) {
      for (const m of digest.matchAll(/(\w+)=(-?\d+(?:\.\d+)?)/g)) {
        const chave = m[1];
        const antigo = Number(m[2]);
        const atual = destaque[chave];
        if (typeof atual !== "number" || !Number.isFinite(antigo) || antigo === 0) continue;
        const divergencia = Math.abs(atual - antigo) / Math.abs(antigo);
        if (divergencia > V12_DIVERGENCIA_MIN) {
          return {
            ok: false,
            reason: "V12",
            hint:
              `A metrica ${chave} de ${tr.toolName} mudou desde um turno anterior ` +
              `(${antigo} -> ${atual}) e a resposta nao menciona a atualizacao. ` +
              "Cite que o numero foi atualizado em relacao ao que foi falado antes.",
            detalhe: `V12:divergencia_sem_mencao:${tr.toolName}:${chave}`,
          };
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// V13: proveniencia declarada em resposta numerica (SHADOW , P.2)
// ---------------------------------------------------------------------------

const MARCA_PROVENIENCIA_RE =
  /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|hoje|ontem|este ano|este mes|neste mes|ate agora|ate hoje|\d{4}|\d{1,2}\/\d{1,2}|na base|no cadastro|consultamos|conforme|com base|fonte|atualizado)\b/i;

export function validateV13Proveniencia(
  ctx: ValidationContext,
): ValidationOutcome | null {
  // numeros "relevantes": >= 100 em modulo (pt-BR ou US), excluindo anos.
  const nums: number[] = [];
  for (const m of ctx.llmResponse.matchAll(
    /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g,
  )) {
    const v = Number(m[0].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(v) && Math.abs(v) >= 100 && !(v >= 1990 && v <= 2035)) {
      nums.push(v);
    }
  }
  if (nums.length < 2) return null;
  if (MARCA_PROVENIENCIA_RE.test(ctx.llmResponse)) return null;

  return {
    ok: false,
    reason: "V13",
    hint:
      "A resposta traz numeros sem declarar o recorte (periodo, base ou criterio). " +
      "Inclua em uma linha curta de onde os numeros vem (ex.: periodo consultado, " +
      "base de notas autorizadas, cadastro atual).",
    detalhe: `V13:sem_proveniencia:${nums.length}_numeros`,
  };
}
