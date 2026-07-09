// src/lib/fiscal/regras/index.ts
// API publica da Tabela de Regras fiscal (reusada pelas Fases 2-4).
export type { CategoriaGerencial, RegraOperacao } from "./tipos";
export { ROTULO_CATEGORIA } from "./tipos";
export { extrairCfop } from "./extrair-cfop";
export { MAPA_CFOP } from "./cfop-mapa";
export { regraPorPrefixo } from "./cfop-prefixo";
export { classificarCfop } from "./classificar";
export { classificaEtapaDemanda } from "./classifica-etapa-demanda";
export type { EstagioDemanda, GatilhosEtapa } from "./classifica-etapa-demanda";
export { classificaOperacao } from "./classifica-operacao";
export type {
  ClassificacaoOperacao,
  EntradaClassificacaoOperacao,
} from "./classifica-operacao";
export { notaEhVendaExterna } from "./nota-venda-externa";
export type { NotaParaVendaExterna } from "./nota-venda-externa";
export { notaEhDevolucaoDeVenda, faturamentoLiquido } from "./nota-devolucao-venda";
export type { NotaParaDevolucaoVenda } from "./nota-devolucao-venda";
