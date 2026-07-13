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
// RECONFIRMADO pelo dono (2026-07-13), agora com todas as letras: "só é para entrar em
// faturamento quando for 5117/6117. Venda futura não pode contar no mês para entrar no
// faturamento; só quando virar 5117/6117". É a decisão final para o assunto.
//
// O QUE ESTAVA QUEBRADO ATÉ O PR #187: a regra do faturamento (`nota-venda-externa.ts`)
// procurava a palavra "venda" no NOME da operação fiscal, e nem "Simples Faturamento para
// Entrega Futura 5922/6922" nem "Remessa de Mercadoria Originada de Encomenda 5117/6117"
// têm essa palavra. Resultado: a receita da venda futura não entrava em NENHUMA das duas
// pernas , sumia (R$ 538 mil desde 16/03/2026). A flag abaixo existia, mas só era lida pelo
// `cfop-mapa.ts`, que não alimenta o `is_venda_externa`: ela era inerte para o faturamento.
// Agora `nota-venda-externa.ts` lê esta flag, e as duas pernas são mutuamente exclusivas.
//
// ATENÇÃO ao virar RECONHECE_FATURAMENTO_NA_EMISSAO para true: as duas pernas viram de uma
// vez só (a 5922 passa a ser receita e o x117 sai), então a mesma venda não conta duas
// vezes. O teste `classifica-operacao.test.ts` que trava "5922 não é receita" vai falhar de
// propósito , é o lembrete para validar a de-para antes de publicar.
export const VENDA_FUTURA = {
  /**
   * FATURAMENTO: onde a receita da venda futura é reconhecida.
   * - false (padrão, decisão final do dono): só na REMESSA (x117), que entra no
   *   faturamento (`is_venda_externa=true`). As notas 5922/6922 ficam FORA.
   * - true: na EMISSÃO da 5922/6922 (entra no faturamento) e a remessa x117 sai,
   *   automaticamente, para não contar a mesma venda duas vezes.
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
