// src/lib/fiscal/regras/nota-venda-externa.ts
// Regra canonica de "nota de VENDA EXTERNA REAL". Funcao PURA. Usada pela
// materializacao (fato_nota_fiscal.is_venda_externa) e por metricas em memoria.
// Alinhada ao core carregarItensVendaComGrupo + ao review #2 (filtro de modelo).
// Ver SPEC v3 secao 3.

export interface NotaParaVendaExterna {
  /** '1' = saida; '0' = entrada. */
  entradaSaida: string | null;
  /** literal 'autorizada' = nota valida (outros: em_digitacao, cancelada, ...). */
  situacaoNfe: string | null;
  /** '55' = NF-e, '65' = NFC-e (venda a consumidor). A venda real concentra em
   *  55 (hoje 100%); 65 incluido por alinhamento a spec (57=CT-e, 03/23 fora). */
  modelo: string | null;
  /** algum item com CFOP de receita de venda (classificarCfop.ehReceita). */
  ehReceita: boolean;
  /** participante e do proprio grupo (triangulacao/venda interna). */
  intragrupo: boolean;
}

/**
 * Verdadeiro somente quando a nota e uma venda a cliente externo real:
 * saida + autorizada + modelo NF-e/NFC-e (55/65) + gera receita de venda + nao intragrupo.
 */
const MODELOS_VENDA = new Set(["55", "65"]);

export function notaEhVendaExterna(n: NotaParaVendaExterna): boolean {
  return (
    n.entradaSaida === "1" &&
    n.situacaoNfe === "autorizada" &&
    n.modelo !== null &&
    MODELOS_VENDA.has(n.modelo) &&
    n.ehReceita &&
    !n.intragrupo
  );
}
