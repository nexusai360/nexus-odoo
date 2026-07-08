// src/lib/fiscal/regras/nota-devolucao-venda.ts
// Regra canonica de DEVOLUCAO DE VENDA (para o faturamento LIQUIDO). Funcao PURA.
// Ponto do erro corrigido (verificacao #2): devolucao de venda e ENTRADA fin.4
// CFOP 1202/2202 (nao a SAIDA fin.4, que e devolucao de COMPRA, CFOP 5202/6202,
// R$84M, nada a ver com receita). Ver SPEC v3 secao 2 [v3-C1].

import type { CategoriaGerencial } from "./tipos";

export interface NotaParaDevolucaoVenda {
  /** '0' = ENTRADA (a devolucao de venda entra na empresa). */
  entradaSaida: string | null;
  situacaoNfe: string | null;
  modelo: string | null;
  /** categoria do CFOP do item (classificarCfop). 1202/2202 => devolucao_venda. */
  categoria: CategoriaGerencial;
  intragrupo: boolean;
}

/** Nota que reduz o faturamento de venda (devolucao de venda de cliente externo). */
export function notaEhDevolucaoDeVenda(n: NotaParaDevolucaoVenda): boolean {
  return (
    n.entradaSaida === "0" &&
    n.situacaoNfe === "autorizada" &&
    n.modelo === "55" &&
    n.categoria === "devolucao_venda" &&
    !n.intragrupo
  );
}

/** Faturamento liquido = bruto de venda externa menos devolucoes de venda. */
export function faturamentoLiquido(brutoVendaExterna: number, devolucoesDeVenda: number): number {
  return brutoVendaExterna - devolucoesDeVenda;
}
