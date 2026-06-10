// src/lib/fiscal/regras/tipos.ts
// Tabela de Regras fiscal , DADO e CONTRATO (zero logica). Reusada pelas Fases 2-4.

/** Categoria gerencial de uma operacao fiscal, derivada do CFOP. */
export type CategoriaGerencial =
  | "venda"
  | "exportacao"
  | "servico"
  | "transferencia"
  | "devolucao_venda"
  | "devolucao_compra"
  | "remessa"
  | "retorno"
  | "simples_faturamento"
  | "bonificacao"
  | "venda_ativo"
  | "entrada_anomala"
  | "sem_cfop"
  | "outras";

/** Regra de classificacao de uma operacao fiscal. */
export interface RegraOperacao {
  categoria: CategoriaGerencial;
  /** Entra no faturamento de mercadoria/servico do grupo? */
  ehReceita: boolean;
  /** F1: INFORMATIVO (nao subtrai aqui). Usado na ponte/Fase 3. */
  deduzReceita: boolean;
  /** Movimenta estoque fisico? */
  afetaEstoque: boolean;
  /** FUTURO (Fase 2): marcar intragrupo quando o participante e do grupo. */
  ehIntercompanySeGrupo: boolean;
}

/** Rotulo legivel por categoria, para UI/formatador. */
export const ROTULO_CATEGORIA: Record<CategoriaGerencial, string> = {
  venda: "Venda",
  exportacao: "Exportacao",
  servico: "Servico",
  transferencia: "Transferencia",
  devolucao_venda: "Devolucao de venda",
  devolucao_compra: "Devolucao de compra",
  remessa: "Remessa",
  retorno: "Retorno",
  simples_faturamento: "Simples faturamento",
  bonificacao: "Bonificacao",
  venda_ativo: "Venda de ativo",
  entrada_anomala: "Entrada anomala",
  sem_cfop: "Sem CFOP (sem classificacao fiscal)",
  outras: "Outras operacoes",
};
