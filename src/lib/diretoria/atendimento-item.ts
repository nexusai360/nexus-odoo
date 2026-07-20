// Invariante ÚNICO de "quanto falta entregar de um item de pedido".
//
// Esta é a peça compartilhada entre o card "Demandas a entregar" (grão-pedido, em
// `enriquecerComAAtender`) e o Relatório de Entregas Parciais (grão-item). É a MESMA métrica:
// no mesmo período e na mesma empresa, os dois somam exatamente o mesmo número (a demanda a
// entregar segue a pílula de período, não o corte de leitura, D8/RF-A5/A6). Se divergirem no
// mesmo escopo, é bug. Por isso a regra mora aqui, testada isoladamente, e ninguém a reescreve.
//
// Regra (a mesma de sempre, ver `atendimento-status.ts`):
//   - `jobOk` = o job de atendimento completou recentemente. Aí confia-se no saldo do Odoo
//     (`quantidadeAAtender`); quando ele vier nulo, é 0 (nada pendente).
//   - `jobOk=false` = o cache ainda não sabe o que foi entregue: cai na quantidade cheia,
//     uniformemente, e a tela avisa.
//   - Piso em zero: o Odoo devolve "a atender" NEGATIVO quando entregaram a mais; sem o piso,
//     o excesso de um pedido abateria a falta de outro.

export interface ItemAtendimento {
  quantidade: unknown;
  quantidadeAAtender: unknown;
  vrProdutos: unknown;
  produtoId: number | null;
}

export interface LinhaAtendida {
  /** Quantidade que ainda falta entregar (com piso em zero). */
  aAtender: number;
  /** aAtender × custo unitário (0 se o produto não tem custo). */
  custoLinha: number;
  /** aAtender × preço de venda unitário (vrProdutos / quantidade cheia). */
  vendaLinha: number;
  /** true quando o produto existe mas não tem custo cadastrado. */
  semCusto: boolean;
  /** true quando a linha não aponta para um produto. */
  semProduto: boolean;
}

export function aAtenderDoItem(
  item: ItemAtendimento,
  custoDe: (produtoId: number) => number | undefined,
  jobOk: boolean,
): LinhaAtendida {
  const cheia = Number(item.quantidade ?? 0);
  const aAtender = Math.max(
    0,
    jobOk ? Number(item.quantidadeAAtender ?? 0) : cheia,
  );
  const custoUnit = item.produtoId != null ? custoDe(item.produtoId) : undefined;
  const precoUnit = cheia > 0 ? Number(item.vrProdutos ?? 0) / cheia : 0;

  return {
    aAtender,
    custoLinha: aAtender * (custoUnit ?? 0),
    vendaLinha: aAtender * precoUnit,
    semProduto: item.produtoId == null,
    semCusto:
      item.produtoId != null && (custoUnit == null || custoUnit <= 0),
  };
}
