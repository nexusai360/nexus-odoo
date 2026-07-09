// src/lib/fiscal/regras/venda-futura-policy.ts
//
// POLÍTICA DE VENDA FUTURA (CFOP 5922/6922) , PONTO ÚNICO E ENGATILHADO.
//
// "Venda futura" = a empresa emite a nota de SIMPLES FATURAMENTO (5922/6922) para
// cobrar o cliente antes de entregar; depois emite a REMESSA de entrega futura
// (CFOP x117: 5117/6117) quando a mercadoria de fato sai.
//
// Decisão do usuário (2026-07-08): reconhecer a RECEITA na REMESSA (x117), NÃO na
// emissão da nota de simples faturamento , evita contar a mesma venda duas vezes.
// Esse é o comportamento PADRÃO abaixo (ambas as flags = false).
//
// CONFIRMADO pela Mariane (2026-07-08): a nota 5922/6922 "é a venda futura, a nota
// que NÃO tem movimentação de estoque"; ao entregar, gera um pedido derivado com
// CFOP x117 (5117/6117), "a venda de fato", e "considera essa operação x117, se não
// concluída, como demanda aberta". Ou seja: (a) FATURAMENTO segue na remessa x117
// (flag = false, mantido); (b) a DEMANDA é a remessa x117 (categoria `venda`), e o
// simples faturamento 5922/6922 NÃO é demanda , isso vive em `classifica-operacao.ts`
// (`CATEGORIAS_DEMANDA` sem `simples_faturamento`), não nas flags abaixo.
//
// >>> COMO MUDAR (está ENGATILHADO): basta trocar a flag correspondente para true.
//     A mudança propaga para TODA a plataforma (Nex, relatórios e diretoria), pois
//     tudo lê a mesma classificação (`classificaOperacao`/`isVendaExterna`) e o
//     mesmo cálculo de estoque disponível.
//
// ATENÇÃO ao virar RECONHECE_FATURAMENTO_NA_EMISSAO para true: é preciso garantir
// que o x117 (remessa) da MESMA venda não seja contado de novo (senão duplica a
// receita). O teste `classifica-operacao.test.ts` que trava "5922 não é receita"
// vai falhar de propósito , é o lembrete para validar a de-para antes de publicar.
export const VENDA_FUTURA = {
  /**
   * FATURAMENTO: onde a receita da venda futura é reconhecida.
   * - false (padrão): só na REMESSA (x117). As notas 5922/6922 ficam FORA do
   *   faturamento (`is_venda_externa=false`).
   * - true: na EMISSÃO da 5922/6922 (entra no faturamento). Exige de-para para o
   *   x117 da mesma venda não contar de novo.
   */
  RECONHECE_FATURAMENTO_NA_EMISSAO: false as boolean,

  /**
   * ESTOQUE: se a mercadoria de venda futura já faturada (5922/6922) sai do
   * "estoque disponível" (fica reservada) até a remessa física.
   * - false (padrão): não reserva , a mercadoria segue contada como disponível.
   * - true: subtrai do disponível os itens de pedidos de simples faturamento
   *   (categoria_operacao='simples_faturamento'), tratando-os como comprometidos.
   */
  RESERVA_ESTOQUE_ATE_REMESSA: false as boolean,
} as const;

/** CFOPs de simples faturamento de venda futura (a emissão que cobra antes de entregar). */
export const CFOPS_VENDA_FUTURA = new Set(["5922", "6922"]);
