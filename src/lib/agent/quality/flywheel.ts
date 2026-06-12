// src/lib/agent/quality/flywheel.ts
// Onda P (Arquitetura 3.0) P.5 , flywheel MANUAL: falha de producao vira
// candidato a caso golden, numa fila revisada por humano/Claude.
//
// Parte pura: recebe as falhas mineradas (quality evals ruins, feedback
// negativo do usuario, retries do validador) e devolve candidatos dedupados
// com o esqueleto do caso golden pronto para revisao. O script
// scripts/flywheel-golden.ts faz a mineracao no banco e grava o JSON em
// docs/superpowers/research/flywheel/. A automacao total so vem depois de o
// processo provar taxa de candidatos uteis (corte deliberado da spec §3.3).

export interface FalhaProducao {
  origem: "quality_eval" | "feedback_usuario" | "validador_retry";
  conversationId: string;
  pergunta: string;
  resposta: string;
  motivo: string;
  criadoEm: string;
}

export interface CandidatoGolden {
  pergunta: string;
  resposta: string;
  conversationIds: string[];
  origens: string[];
  motivos: string[];
  /** Esqueleto a completar na revisao (dominio/toolEsperada/kpi). */
  casoGolden: {
    id: string;
    pergunta: string;
    dominio: string;
    classe: string;
    toolEsperada: string;
    esperaNaResposta: string[];
    observacao: string;
  };
}

function normaliza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+([?!.])/g, "$1")
    .trim();
}

function slug(s: string): string {
  return normaliza(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Dedupa falhas por pergunta normalizada (agrega motivos/origens), exclui
 * perguntas ja cobertas pelo golden atual e monta o esqueleto de caso.
 */
export function montarCandidatosGolden(
  falhas: FalhaProducao[],
  perguntasGoldenAtuais: string[],
): CandidatoGolden[] {
  const goldenNorm = new Set(perguntasGoldenAtuais.map(normaliza));
  const porPergunta = new Map<string, CandidatoGolden>();

  for (const f of falhas) {
    const chave = normaliza(f.pergunta);
    if (!chave || goldenNorm.has(chave)) continue;
    const atual = porPergunta.get(chave);
    if (atual) {
      atual.motivos.push(`${f.origem}: ${f.motivo}`);
      if (!atual.origens.includes(f.origem)) atual.origens.push(f.origem);
      if (!atual.conversationIds.includes(f.conversationId)) {
        atual.conversationIds.push(f.conversationId);
      }
      continue;
    }
    porPergunta.set(chave, {
      pergunta: f.pergunta,
      resposta: f.resposta,
      conversationIds: [f.conversationId],
      origens: [f.origem],
      motivos: [`${f.origem}: ${f.motivo}`],
      casoGolden: {
        id: `flywheel-${slug(f.pergunta)}`,
        pergunta: f.pergunta,
        dominio: "?",
        classe: "prosseguir",
        toolEsperada: "?",
        esperaNaResposta: [],
        observacao:
          `Candidato do flywheel (${f.criadoEm.slice(0, 10)}): falha real de producao. ` +
          "REVISAR: preencher dominio/toolEsperada e, se possivel, kpiOuro com fonteOuroSql.",
      },
    });
  }
  // Mais motivos = mais sinal: ordena por quantidade de evidencia.
  return [...porPergunta.values()].sort((a, b) => b.motivos.length - a.motivos.length);
}
