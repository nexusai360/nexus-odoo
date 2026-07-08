// src/lib/fiscal/regras/classifica-operacao.ts
// Camada FINA acima do nucleo fiscal: combina a classificacao por CFOP
// (classificarCfop) com a deteccao de intragrupo (ehNotaIntragrupo) para dizer se
// uma operacao entra no FATURAMENTO DE VENDA e/ou na DEMANDA. Funcao PURA.
//
// O CFOP e recebido JA EXTRAIDO (4 digitos), tipicamente do item do pedido/nota
// (cfop_id/cfop_nome), NAO parseado do operacao_nome (que traz o CFOP no meio,
// ex.: "0-Venda Lucro Real 5102/6102/6108"). Peças entram como venda porque os
// itens carregam CFOP de venda (5102...), mesmo que o nome da operacao nao tenha CFOP.
// Ver SPEC v3 secao 3 e dossie pericia-fluxos-2026-07/02-03.

import { classificarCfop } from "./classificar";
import { ehNotaIntragrupo } from "../grupo";
import type { CategoriaGerencial } from "./tipos";

export interface EntradaClassificacaoOperacao {
  /** CFOP de 4 digitos ja extraido (ou null). */
  cfop: string | null;
  participanteId: number | null;
  participanteNome: string | null;
}

export interface ClassificacaoOperacao {
  categoria: CategoriaGerencial;
  /** A operacao gera receita de venda (do nucleo classificarCfop.ehReceita). */
  ehReceita: boolean;
  /** Participante e do proprio grupo (triangulacao/venda interna). */
  intragrupo: boolean;
  /** Entra no FATURAMENTO DE VENDA REAL (receita E nao intragrupo). */
  entraFaturamentoVenda: boolean;
  /** Entra na DEMANDA (venda a cliente comprometida; inclui venda futura /
   *  simples_faturamento porque a mercadoria segue comprometida; exclui
   *  transferencia/remessa/bonificacao/demonstracao e intragrupo). */
  entraDemanda: boolean;
}

/** Categorias que representam compromisso de venda a cliente (base da demanda). */
const CATEGORIAS_DEMANDA: ReadonlySet<CategoriaGerencial> = new Set<CategoriaGerencial>([
  "venda",
  "exportacao",
  "simples_faturamento",
]);

export function classificaOperacao(
  e: EntradaClassificacaoOperacao,
  participantesGrupo: Set<number>,
): ClassificacaoOperacao {
  const regra = classificarCfop(e.cfop);
  const intragrupo = ehNotaIntragrupo(
    { participanteId: e.participanteId, participanteNome: e.participanteNome },
    participantesGrupo,
  );

  const entraFaturamentoVenda = regra.ehReceita && !intragrupo;
  const entraDemanda = CATEGORIAS_DEMANDA.has(regra.categoria) && !intragrupo;

  return {
    categoria: regra.categoria,
    ehReceita: regra.ehReceita,
    intragrupo,
    entraFaturamentoVenda,
    entraDemanda,
  };
}
