// mcp/lib/periodo-corte.ts
//
// PISO DE LEITURA DAS TOOLS DO MCP , a data de inicio das analises (AppSetting
// `sync.corte_dados`, fonte unica em src/lib/corte-dados.ts).
//
// Este e o gemeo generico do `resolverPeriodoFiscal` (mcp/tools/fiscal/_periodo-padrao.ts):
// as tools fiscais ja passam por la; financeiro, comercial, estoque e contabil passam por
// aqui. A regra vale para toda tool que le HISTORICO (documento com data: nota, pedido,
// titulo, movimento de estoque, DF-e, lancamento contabil, serie mensal, acumulado):
//
//   1. o inicio do periodo pedido e grampeado na data de inicio das analises;
//   2. quando o agente NAO informa periodo, o piso e o corte (nunca varrer o cache inteiro);
//   3. a resposta diz o periodo que foi EFETIVAMENTE coberto, para o agente jamais afirmar
//      que cobriu um intervalo que a plataforma nao cobre.
//
// Nada e apagado: mover a data para tras faz o historico reaparecer na hora.
//
// NAO se aplica a cadastro (produto, parceiro, filial, plano de contas), a SALDO de estoque
// (foto do agora), a tabela de preco e a catalogo/metadado , la nao existe "documento com
// data" para grampear.

import {
  avisoCorte,
  corteAtual,
  corteLabel,
  janelaClampada,
} from "@/lib/corte-dados.js";

export interface PeriodoCorte {
  /** Inicio efetivo (AAAA-MM-DD), nunca anterior a data de inicio das analises. */
  periodoDe: string;
  /** Fim efetivo (AAAA-MM-DD). Sem `ate` informado, e hoje. */
  periodoAte: string;
  /** true quando o pedido comecava antes do corte e foi puxado para ele. */
  cortado: boolean;
  /** true quando nada foi informado e assumimos "do corte ate hoje". */
  assumido: boolean;
  /** true quando o periodo pedido termina ANTES do corte (a plataforma nao cobre nada dele). */
  preCorte: boolean;
  /** Rotulo do periodo coberto, para a resposta ("16/03/2026 a 2026-07-12 (...)"). */
  label: string;
  /** Frase pronta de aviso quando o periodo coberto difere do pedido; undefined quando nao ha o que avisar. */
  aviso?: string;
  /** Data de inicio das analises vigente (AAAA-MM-DD). */
  corte: string;
}

/**
 * Resolve o periodo de uma tool de historico ja grampeado ao corte.
 *
 * Devolve SEMPRE o par completo (`periodoDe` + `periodoAte`), porque varias queries do
 * projeto so aplicam o filtro de data quando recebem o par inteiro , passar o par resolvido
 * e o que garante o piso mesmo nas queries que ainda montam o where na mao.
 *
 * `hoje` e injetavel para teste deterministico.
 */
export function resolverPeriodoCorte(
  de?: string,
  ate?: string,
  hoje: Date = new Date(),
): PeriodoCorte {
  const corte = corteAtual();
  const j = janelaClampada(de, ate, corte);
  const hojeIso = hoje.toISOString().slice(0, 10);
  const periodoAte = j.ateIso ?? hojeIso;
  const assumido = !de && !ate;
  // Periodo inteiramente anterior ao corte: a plataforma nao tem nada dele (o dado continua
  // no Odoo, mas fora da janela de analise). Nao e "zero resultados", e "fora da janela".
  const preCorte = !!ate && ate.slice(0, 10) < corte;

  let label: string;
  let aviso: string | undefined;
  if (preCorte) {
    label = `${de ?? "inicio"} a ${ate} (anterior a ${corteLabel(corte)}: fora da janela de analise)`;
    aviso = avisoCorte(corte);
  } else if (j.cortado) {
    label = `${j.deIso} a ${periodoAte} (a plataforma so tem dados a partir de ${corteLabel(corte)})`;
    aviso = avisoCorte(corte);
  } else if (assumido) {
    label = `${j.deIso} a ${periodoAte} (todo o periodo disponivel)`;
    aviso = `Sem periodo informado: considerei de ${corteLabel(corte)} (data de inicio das analises) ate hoje.`;
  } else {
    label = `${j.deIso} a ${periodoAte}`;
  }

  return {
    periodoDe: j.deIso,
    periodoAte,
    cortado: j.cortado,
    assumido,
    preCorte,
    label,
    aviso,
    corte,
  };
}

/**
 * Mesmo contrato, para series/filtros cujo eixo e o MES ("AAAA-MM"), como
 * fato_estoque_movimento.mes. O mes do corte entra inteiro (ver clampMesAoCorte).
 */
export function mesesDoPeriodoCorte(p: PeriodoCorte): { mesDe: string; mesAte: string } {
  return { mesDe: p.periodoDe.slice(0, 7), mesAte: p.periodoAte.slice(0, 7) };
}
