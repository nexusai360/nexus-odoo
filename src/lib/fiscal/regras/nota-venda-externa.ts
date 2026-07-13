// src/lib/fiscal/regras/nota-venda-externa.ts
// Regra canonica de "nota de VENDA EXTERNA REAL". Funcao PURA. Usada pela
// materializacao (fato_nota_fiscal.is_venda_externa) e por metricas em memoria.
// Ver SPEC v3 secao 3 e docs/superpowers/plans/2026-07-11-faturamento-venda-operacao.md.

import { VENDA_FUTURA } from "./venda-futura-policy";

/** Operacao de venda: o nome da operacao fiscal contem "venda". */
export const OPERACAO_VENDA_TERMO = "venda";
/**
 * Termos que, mesmo com "venda" no nome da operacao, NAO sao faturamento de mercadoria:
 *   - "interna": venda interna = transferencia faturada entre empresas do grupo;
 *   - "imobilizado": "Venda de bens do ativo imobilizado 5551/6551" e baixa de ativo, nao
 *     receita (o cfop-mapa ja tratava 5551/6551 assim , as duas camadas agora concordam).
 */
export const OPERACAO_NAO_VENDA_TERMOS = ["interna", "imobilizado"] as const;
/** @deprecated use OPERACAO_NAO_VENDA_TERMOS. */
export const OPERACAO_INTERNA_TERMO = "interna";
/** finalidade_nfe "4" = devolucao/retorno. Saida que nao e venda. */
export const FINALIDADE_DEVOLUCAO = "4";

/**
 * VENDA FUTURA , as duas pernas, identificadas pelo CFOP que a Tauga escreve no NOME da
 * operacao fiscal ("Simples Faturamento para Entrega Futura 5922/6922 - Lucro Presumido",
 * "Remessa de Mercadoria Originada de Encomenda 5117/6117 - Presumido"). Nenhuma das duas
 * tem a palavra "venda" no nome, entao antes desta regra a receita da venda futura nao
 * entrava em NENHUMA das pernas , sumia do faturamento (R$ 538 mil desde 16/03/2026).
 *
 * Qual das duas e receita quem decide e `VENDA_FUTURA.RECONHECE_FATURAMENTO_NA_EMISSAO`
 * (venda-futura-policy.ts). Padrao (decisao do dono, 2026-07-13): a receita e a REMESSA.
 * Sao mutuamente exclusivas por construcao, entao a mesma venda nunca conta duas vezes.
 */
const CFOPS_SIMPLES_FATURAMENTO_FUTURO = ["5922", "6922"] as const;
const CFOPS_REMESSA_ENTREGA_FUTURA = ["5117", "6117"] as const;

/** A nota que cobra o cliente antes de entregar (nao movimenta estoque). */
export function ehOperacaoSimplesFaturamentoFuturo(operacaoNome: string | null): boolean {
  const op = (operacaoNome ?? "").toLowerCase();
  return CFOPS_SIMPLES_FATURAMENTO_FUTURO.some((cfop) => op.includes(cfop));
}

/** A nota que entrega a mercadoria ja faturada (a venda de fato). */
export function ehOperacaoRemessaEntregaFutura(operacaoNome: string | null): boolean {
  const op = (operacaoNome ?? "").toLowerCase();
  return CFOPS_REMESSA_ENTREGA_FUTURA.some((cfop) => op.includes(cfop));
}

export interface NotaParaVendaExterna {
  /** '1' = saida; '0' = entrada. */
  entradaSaida: string | null;
  /** literal 'autorizada' = nota valida (outros: em_digitacao, cancelada, ...). */
  situacaoNfe: string | null;
  /** '55' = NF-e, '65' = NFC-e (venda a consumidor). A venda real concentra em
   *  55 (hoje 100%); 65 incluido por alinhamento a spec (57=CT-e, 03/23 fora). */
  modelo: string | null;
  /** nome da operacao fiscal da nota (sped.documento.operacao_id), ex.: "AOP1 - Venda LR". */
  operacaoNome: string | null;
  /** finalidade_nfe da nota ('4' = devolucao). */
  finalidadeNfe: string | null;
  /** participante e do proprio grupo (triangulacao/venda interna). */
  intragrupo: boolean;
}

const MODELOS_VENDA = new Set(["55", "65"]);

/**
 * A OPERACAO FISCAL e o criterio primario de venda: contem "venda" e NAO contem "interna"
 * (a "venda interna" e transferencia faturada entre empresas do grupo), e a finalidade nao
 * e devolucao. E o mesmo criterio que o Odoo usa , conferido pelo dono contra o Odoo:
 * julho/2026 = R$ 7.242.504,80 em 136 notas.
 *
 * Por que a operacao, e nao a natureza nem o CFOP:
 *   - natureza: "venda" e "venda interna" tem a MESMA natureza ("VENDA DE MERCADORIA...");
 *     filtrar por ela conta a venda interna como faturamento (inflava milhoes).
 *   - CFOP de receita: nao separa venda de servico/outra saida/entrega futura, e derruba a
 *     nota de venda que nao tem item no cache (1 nota em julho, R$ 3.220,00). Ficou fora da
 *     condicao, mas segue disponivel para as metricas que agregam por CFOP.
 */
export function ehOperacaoVenda(n: {
  operacaoNome: string | null;
  finalidadeNfe: string | null;
}): boolean {
  if (n.finalidadeNfe === FINALIDADE_DEVOLUCAO) return false;

  // Venda futura antes do teste de "venda" no nome: as duas pernas (5922 e x117) sao
  // faturamento em substancia, mas nenhuma traz a palavra "venda" na operacao. A policy
  // diz qual delas e a receita, e a outra fica fora para nao duplicar.
  if (ehOperacaoSimplesFaturamentoFuturo(n.operacaoNome)) {
    return VENDA_FUTURA.RECONHECE_FATURAMENTO_NA_EMISSAO;
  }
  if (ehOperacaoRemessaEntregaFutura(n.operacaoNome)) {
    return !VENDA_FUTURA.RECONHECE_FATURAMENTO_NA_EMISSAO;
  }

  const op = (n.operacaoNome ?? "").toLowerCase();
  if (!op.includes(OPERACAO_VENDA_TERMO)) return false;
  return !OPERACAO_NAO_VENDA_TERMOS.some((t) => op.includes(t));
}

/**
 * Verdadeiro somente quando a nota e uma venda a cliente externo real:
 * saida + autorizada + modelo NF-e/NFC-e (55/65) + operacao de venda (nao interna, nao
 * devolucao) + destinatario fora do grupo.
 */
export function notaEhVendaExterna(n: NotaParaVendaExterna): boolean {
  return (
    n.entradaSaida === "1" &&
    n.situacaoNfe === "autorizada" &&
    n.modelo !== null &&
    MODELOS_VENDA.has(n.modelo) &&
    ehOperacaoVenda(n) &&
    !n.intragrupo
  );
}
