// src/lib/agent/router/anafora-heuristica.ts
// Onda M (Arquitetura 3.0) T4.3 , resolucao deterministica de anafora.
//
// Antes de gastar LLM no CQR (reformulateQuestion), tenta resolver pronome/
// elipse por regra, lendo o focoAtual (working memory) e as entidades recentes
// da conversa (ConversationEntity, recencia por turno). Tres saidas:
//   - resolvida: pergunta reescrita/expandida (vai direto pro re-embedding);
//   - ambigua: 2+ candidatos com mesma recencia , NAO reformula (a regra 12b
//     do prompt pede clarificacao curta ao usuario);
//   - nao-anaforica: segue o caminho LLM (CQR) que ja existia.
// A saida e usada APENAS para rotear (re-embedding); nunca entra no prompt.
import type { FocoAtual } from "@/lib/agent/memoria/foco-atual";

export interface EntidadeRecente {
  tipo: string;
  rotulo: string;
  ultimoTurno: number;
}

export type ResultadoAnafora =
  | { status: "resolvida"; reformulada: string }
  | { status: "ambigua" }
  | { status: "nao-anaforica" };

const TIPOS_FEMININOS = new Set(["empresa", "familia", "uf"]);

/** normaliza o substantivo citado para o tipo canonico do focoAtual */
function normalizarTipo(t: string): string {
  const low = t.toLowerCase();
  if (low === "família" || low === "familia") return "familia";
  if (low === "estado") return "uf";
  return low;
}

const PRONOME_TIPADO_RE =
  /\b(d|n)?(?:ess[ea]|est[ea]|aquel[ea]|mesm[oa])\s+(produto|vendedor|empresa|cliente|fam[ií]lia|uf|estado)\b/i;

const PRONOME_GENERICO_RE = /\b(ele|ela|dele|dela|deles|delas)\b/i;

const PERIODO_NA_PERGUNTA_RE =
  /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|ontem|hoje|amanh[ãa]|semana|m[eê]s|ano|trimestre|semestre|\d{4}|\d{1,2}\/\d{1,2})\b/i;

type Candidato = { rotulo: string } | "ambigua" | null;

function maisRecenteDoTipo(
  tipo: string,
  foco: FocoAtual | null,
  entidades: EntidadeRecente[],
): Candidato {
  const daTabela = entidades
    .filter((e) => normalizarTipo(e.tipo) === tipo)
    .sort((a, b) => b.ultimoTurno - a.ultimoTurno);
  if (daTabela.length >= 2 && daTabela[0].ultimoTurno === daTabela[1].ultimoTurno) {
    return "ambigua";
  }
  if (daTabela.length >= 1) return { rotulo: daTabela[0].rotulo };

  const doFoco = (foco?.entidades ?? []).filter((e) => normalizarTipo(e.tipo) === tipo);
  if (doFoco.length >= 2) return "ambigua"; // foco nao tem recencia interna
  if (doFoco.length === 1) return { rotulo: doFoco[0].rotulo };
  return null;
}

export function resolverAnaforaDeterministica(
  pergunta: string,
  foco: FocoAtual | null,
  entidadesRecentes: EntidadeRecente[],
): ResultadoAnafora {
  // 1) Pronome demonstrativo tipado: "esse produto", "dessa empresa"...
  const tipado = pergunta.match(PRONOME_TIPADO_RE);
  if (tipado) {
    const prep = (tipado[1] ?? "").toLowerCase();
    const tipo = normalizarTipo(tipado[2]);
    const cand = maisRecenteDoTipo(tipo, foco, entidadesRecentes);
    if (cand === "ambigua") return { status: "ambigua" };
    if (cand) {
      const fem = TIPOS_FEMININOS.has(tipo);
      const prefixo = prep === "d" ? (fem ? "da " : "do ") : prep === "n" ? (fem ? "na " : "no ") : "";
      const reformulada = pergunta.replace(
        PRONOME_TIPADO_RE,
        `${prefixo}${tipo} "${cand.rotulo}"`,
      );
      return { status: "resolvida", reformulada };
    }
    return { status: "nao-anaforica" };
  }

  // 2) Pronome generico: "ele/ela/dele/dela" , entidade mais recente, se unica.
  if (PRONOME_GENERICO_RE.test(pergunta)) {
    const doFoco = foco?.entidades ?? [];
    if (doFoco.length === 1) {
      return {
        status: "resolvida",
        reformulada: `${pergunta} (referindo-se a ${doFoco[0].tipo} ${doFoco[0].rotulo})`,
      };
    }
    if (doFoco.length >= 2) return { status: "ambigua" };
    const topo = entidadesRecentes
      .slice()
      .sort((a, b) => b.ultimoTurno - a.ultimoTurno);
    if (topo.length >= 1) {
      if (topo.length >= 2 && topo[0].ultimoTurno === topo[1].ultimoTurno) {
        return { status: "ambigua" };
      }
      return {
        status: "resolvida",
        reformulada: `${pergunta} (referindo-se a ${topo[0].tipo} ${topo[0].rotulo})`,
      };
    }
    return { status: "nao-anaforica" };
  }

  // 3) Elipse curta "e ...?": herda metrica/entidades do foco; o periodo do
  //    foco so entra se a pergunta nao trouxe um periodo novo.
  if (/^\s*e\s+/i.test(pergunta) && pergunta.trim().length <= 60) {
    if (!foco?.metrica) return { status: "nao-anaforica" };
    const partes: string[] = [foco.metrica.nome];
    if (foco.entidades?.length) {
      partes.push(`entidades: ${foco.entidades.map((e) => e.rotulo).join(", ")}`);
    }
    if (foco.periodo && !PERIODO_NA_PERGUNTA_RE.test(pergunta)) {
      partes.push(`período ${foco.periodo.inicio} a ${foco.periodo.fim}`);
    }
    return {
      status: "resolvida",
      reformulada: `${pergunta} (contexto: ${partes.join("; ")})`,
    };
  }

  return { status: "nao-anaforica" };
}
