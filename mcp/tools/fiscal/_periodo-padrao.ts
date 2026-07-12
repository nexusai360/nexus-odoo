// mcp/tools/fiscal/_periodo-padrao.ts
// Resolve o periodo das tools fiscais. Sem periodo informado, o cache acumula ANOS
// (2013..hoje) e o numero fica enganoso. Decisao do usuario (2026-06-09): assumir o
// ANO CORRENTE como default, e a resposta SEMPRE explicita o periodo coberto.

import { corteAtual, corteLabel, clampIsoAoCorte, avisoCorte } from "@/lib/corte-dados.js";

/**
 * Texto honesto padrao quando o periodo pedido e inteiramente anterior ao
 * corte de dados (Limpa 2026+, spec §5). O cache nao guarda pre-2026; dizer
 * "nao ha registros" seria mentira , os dados existem, mas so no Odoo.
 */
export function textoHonestoPreCorte(): string {
  return (
    `${avisoCorte()} Documentos anteriores a ${corteLabel()} continuam no Odoo, mas nao ` +
    "sao consultaveis pelo Nex."
  );
}

/** @deprecated use textoHonestoPreCorte() , o corte agora e configuravel. */
export const TEXTO_HONESTO_PRE_CORTE = textoHonestoPreCorte();

export interface PeriodoResolvido {
  periodoDe: string;
  periodoAte: string;
  /** true quando o periodo foi assumido (ano corrente), nao informado pelo usuario. */
  assumido: boolean;
  /** rotulo legivel para a resposta, ex.: "2026 (ano corrente, ate 2026-06-09)". */
  label: string;
  /** true quando o periodo pedido termina ANTES do corte de dados (cache vazio por regra). */
  preCorte: boolean;
  /** true quando o inicio pedido era anterior ao corte e foi grampeado nele. */
  cortado: boolean;
  /** Frase pronta de aviso quando o periodo coberto difere do pedido (undefined quando nao ha o que avisar). */
  aviso?: string;
}

/**
 * Usa `de`+`ate` quando o PAR esta completo; senao assume o ano corrente (1o de janeiro
 * ate hoje). `hoje` e injetavel para teste determinístico.
 */
export function resolverPeriodoFiscal(
  de: string | undefined,
  ate: string | undefined,
  hoje: Date = new Date(),
): PeriodoResolvido {
  const corte = corteAtual();
  if (de && ate) {
    // O inicio e grampeado ao corte: perguntar "desde 2024" devolve o que a plataforma tem,
    // a partir do marco zero, e a resposta diz isso (nunca finge cobrir o que nao cobre).
    const deClamped = clampIsoAoCorte(de.slice(0, 10), corte);
    const cortado = deClamped !== de.slice(0, 10);
    const preCorte = ate.slice(0, 10) < corte;
    return {
      periodoDe: deClamped,
      periodoAte: ate,
      assumido: false,
      label: cortado
        ? `${deClamped} a ${ate} (a plataforma so tem dados a partir de ${corteLabel(corte)})`
        : `${de} a ${ate}`,
      preCorte,
      cortado,
      aviso: cortado || preCorte ? avisoCorte(corte) : undefined,
    };
  }
  const hojeStr = hoje.toISOString().slice(0, 10);
  // Sem periodo informado (ou par incompleto): do corte ate hoje (antes assumia 1o de
  // janeiro, o que passava a impressao de cobrir um intervalo que a plataforma nao tem).
  // O piso do corte entra SEMPRE , consulta "sem periodo" nunca varre o historico inteiro.
  return {
    periodoDe: corte,
    periodoAte: hojeStr,
    assumido: true,
    label: `${corteLabel(corte)} a ${hojeStr} (todo o periodo disponivel)`,
    preCorte: false,
    cortado: !!de && de.slice(0, 10) < corte,
    aviso: `Sem periodo completo informado: considerei de ${corteLabel(corte)} (data de inicio das analises) ate hoje.`,
  };
}
