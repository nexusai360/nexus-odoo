// Barrel das metricas fiscais canonicas da F1 (11 metricas, uma por modulo).
export { faturamentoAutorizado } from "./faturamento-autorizado";
export { faturamentoAutorizadoTotal } from "./faturamento-autorizado-total";
export { faturamentoBruto } from "./faturamento-bruto";
export { faturamentoNaoAutorizado } from "./faturamento-nao-autorizado";
export { impactoCancelamentos } from "./impacto-cancelamentos";
export { faturamentoSaida } from "./faturamento-saida";
export { faturamentoEntrada } from "./faturamento-entrada";
export { faturamentoPorEmpresa } from "./faturamento-por-empresa";
export { faturamentoPorOperacao } from "./faturamento-por-operacao";
export { faturamentoPorCfop } from "./faturamento-por-cfop";
export { faturamentoRecebido } from "./faturamento-recebido";
// F2 (intercompany + receita consolidada externa)
export { receitaConsolidada } from "./receita-consolidada";
export { matrizIntercompany } from "./matriz-intercompany";
// F2.5 (unificacao: serie mensal + por cliente, sobre o core compartilhado)
export { faturamentoSerieMensal } from "./faturamento-serie-mensal";
export { faturamentoPorClienteCanon } from "./faturamento-por-cliente-canon";
