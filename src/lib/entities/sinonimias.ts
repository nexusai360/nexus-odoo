import { normalizar } from "./_fuzzy";

// Vocabulario de negocio -> filtro deterministico (spec secao 6). Valores confirmados
// contra o cache real (gate A8): pedido 9 tipos, situacao NF 7, entrada_saida {0,1},
// natureza contabil {01,02,04}. Termo desconhecido SEMPRE retorna null (nunca chuta).

type Tabela = Record<string, Record<string, unknown>>;

const tipoParceiro: Tabela = {
  cliente: { ehCliente: true },
  fornecedor: { ehFornecedor: true },
  empresa: { ehEmpresa: true },
};

const statusProduto: Tabela = {
  ativo: { ativo: true },
  inativo: { ativo: false },
};

const etapaPedido: Tabela = {
  aberto: { etapaFinaliza: false },
  finalizado: { etapaFinaliza: true },
};

const tipoPedido: Tabela = {
  venda: { tipo: "venda" },
  compra: { tipo: "compra" },
  "devolucao de venda": { tipo: "devolucao_venda" },
  transferencia: { tipo: { in: ["transferencia_entrada", "transferencia_saida", "transferencia_solicitacao"] } },
  inventario: { tipo: "inventario" },
  producao: { tipo: "producao" },
  romaneio: { tipo: "romaneio" },
};

const sentidoNf: Tabela = {
  entrada: { entradaSaida: "0" },
  saida: { entradaSaida: "1" },
};

const SITUACOES_NF = ["autorizada", "cancelada", "denegada", "em_digitacao", "enviada", "inutilizada", "rejeitada"];
const situacaoNf: Tabela = Object.fromEntries(SITUACOES_NF.map((s) => [s, { situacaoNfe: s }]));

const naturezaContabil: Tabela = {
  "01": { natureza: "01" },
  "02": { natureza: "02" },
  "04": { natureza: "04" },
};

const CATEGORIAS: Record<string, Tabela> = {
  tipoParceiro,
  statusProduto,
  etapaPedido,
  tipoPedido,
  sentidoNf,
  situacaoNf,
  naturezaContabil,
};

/** Resolve um termo de negocio para um filtro Prisma deterministico, ou null se desconhecido. */
export function resolverSinonimia(categoria: string, termo: string): Record<string, unknown> | null {
  const tabela = CATEGORIAS[categoria];
  if (!tabela) return null;
  return tabela[normalizar(termo)] ?? null;
}
