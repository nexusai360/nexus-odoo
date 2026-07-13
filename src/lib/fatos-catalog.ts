// src/lib/fatos-catalog.ts
//
// Catálogo de exibição dos fatos (camada derivada do cache). É a fonte única
// para a aba "Fatos" do painel "Estado da ingestão". Cada entrada descreve um
// fato_* construído pelo worker a partir de um modelo de ingestão (raw).
//
// Sincronia garantida por teste (fatos-catalog.test.ts):
//   - nomes batem com os modelos fato_* do prisma/schema.prisma (menos
//     fato_build_state, que é tabela de controle, não um fato de negócio);
//   - `modo` bate com o cycle do builder em src/worker/fatos/registry.ts;
//   - `fonte` bate com o model de FATO_FONTE em mcp/lib/freshness.ts.
//
// Pure: sem imports de server-only. Pode ser usado no cliente e no servidor.

export type FatoModo = "incremental" | "snapshot";

export interface FatoCatalogEntry {
  /** Nome do fato = nome da tabela (igual ao @@map e ao id em fato_build_state). */
  nome: string;
  /** Domínio de negócio, usado para agrupar e filtrar. */
  dominio: string;
  /** Ciclo do worker que reconstrói o fato (igual ao cycle em FATO_BUILDERS). */
  modo: FatoModo;
  /** Modelo Odoo de origem (o raw que alimenta o fato), exibido como referência. */
  fonte: string;
}

export const FATO_CATALOG: readonly FatoCatalogEntry[] = [
  // Estoque
  { nome: "fato_estoque_local", dominio: "Estoque", modo: "snapshot", fonte: "estoque.local" },
  { nome: "fato_estoque_saldo", dominio: "Estoque", modo: "snapshot", fonte: "estoque.saldo.hoje" },
  { nome: "fato_serial_saldo", dominio: "Estoque", modo: "snapshot", fonte: "estoque.saldo.rastreabilidade.hoje" },
  { nome: "fato_estoque_movimento", dominio: "Estoque", modo: "snapshot", fonte: "estoque.extrato" },
  { nome: "fato_produto_parado", dominio: "Estoque", modo: "snapshot", fonte: "estoque.saldo.hoje" },
  // Financeiro
  { nome: "fato_financeiro_saldo", dominio: "Financeiro", modo: "snapshot", fonte: "finan.banco.saldo.hoje" },
  { nome: "fato_financeiro_movimento", dominio: "Financeiro", modo: "incremental", fonte: "finan.fluxo.caixa" },
  { nome: "fato_financeiro_titulo", dominio: "Financeiro", modo: "incremental", fonte: "finan.pagamento.divida" },
  { nome: "fato_financeiro_lancamento_item", dominio: "Financeiro", modo: "incremental", fonte: "finan.lancamento.item" },
  // Comercial
  { nome: "fato_pedido", dominio: "Comercial", modo: "incremental", fonte: "pedido.documento" },
  { nome: "fato_pedido_parcela", dominio: "Comercial", modo: "incremental", fonte: "pedido.parcela" },
  { nome: "fato_pedido_historico", dominio: "Comercial", modo: "incremental", fonte: "pedido.documento.historico" },
  { nome: "fato_pedido_item", dominio: "Comercial", modo: "incremental", fonte: "sped.documento.item" },
  { nome: "fato_preco", dominio: "Comercial", modo: "incremental", fonte: "sped.tabela.preco.regra" },
  // Fiscal
  { nome: "fato_nota_fiscal", dominio: "Fiscal", modo: "incremental", fonte: "sped.documento" },
  { nome: "fato_nota_fiscal_item", dominio: "Fiscal", modo: "incremental", fonte: "sped.documento.item" },
  { nome: "fato_dfe", dominio: "Fiscal", modo: "incremental", fonte: "sped.consulta.dfe.item" },
  { nome: "fato_servico", dominio: "Fiscal", modo: "incremental", fonte: "sped.servico" },
  { nome: "fato_apuracao", dominio: "Fiscal", modo: "incremental", fonte: "sped.apuracao" },
  { nome: "fato_carta_correcao", dominio: "Fiscal", modo: "incremental", fonte: "sped.carta.correcao" },
  { nome: "fato_certificado", dominio: "Fiscal", modo: "incremental", fonte: "sped.certificado" },
  { nome: "fato_referencia", dominio: "Fiscal", modo: "incremental", fonte: "sped.ncm" },
  { nome: "fato_mdfe", dominio: "Fiscal", modo: "incremental", fonte: "sped.mdfe" },
  { nome: "fato_reinf_evento", dominio: "Fiscal", modo: "incremental", fonte: "reinf.evento" },
  // Contábil
  { nome: "fato_conta_contabil", dominio: "Contábil", modo: "incremental", fonte: "contabil.conta" },
  { nome: "fato_contabil_conta_referencial", dominio: "Contábil", modo: "incremental", fonte: "contabil.conta.referencial" },
  { nome: "fato_contabil_lancamento", dominio: "Contábil", modo: "incremental", fonte: "contabil.lancamento" },
  { nome: "fato_contabil_lancamento_item", dominio: "Contábil", modo: "incremental", fonte: "contabil.lancamento.item" },
  // Cadastros
  { nome: "fato_parceiro", dominio: "Cadastros", modo: "incremental", fonte: "res.partner" },
  // Produtos
  { nome: "fato_produto", dominio: "Produtos", modo: "incremental", fonte: "sped.produto" },
  // B3 , Financeiro / cobrança bancária
  { nome: "fato_retorno_item", dominio: "Financeiro", modo: "incremental", fonte: "finan.retorno.item" },
  { nome: "fato_retorno_bancario", dominio: "Financeiro", modo: "incremental", fonte: "finan.retorno" },
  { nome: "fato_remessa_bancaria", dominio: "Financeiro", modo: "incremental", fonte: "finan.remessa" },
  { nome: "fato_carteira_cobranca", dominio: "Financeiro", modo: "incremental", fonte: "finan.carteira" },
  { nome: "fato_cheque", dominio: "Financeiro", modo: "incremental", fonte: "finan.cheque" },
  { nome: "fato_pix", dominio: "Financeiro", modo: "incremental", fonte: "finan.pix" },
  // B4 , Comercial / cotação + comissão
  { nome: "fato_cotacao", dominio: "Comercial", modo: "incremental", fonte: "pedido.documento.cotacao" },
  { nome: "fato_comissao", dominio: "Comercial", modo: "incremental", fonte: "pedido.comissao" },
  // B5 , Produção
  { nome: "fato_producao_processo", dominio: "Produção", modo: "incremental", fonte: "producao.processo" },
  // B6 , Estoque avançado
  { nome: "fato_estoque_min_max", dominio: "Estoque", modo: "incremental", fonte: "estoque.minimo.maximo" },
  // B7 , CRM + Auditoria
  { nome: "fato_crm_pipeline", dominio: "CRM", modo: "incremental", fonte: "crm.pipeline" },
  { nome: "fato_auditoria_regra", dominio: "Auditoria", modo: "incremental", fonte: "auditoria.regra" },
  // Diretoria , Compras + Seriais
  { nome: "fato_compra", dominio: "Comercial", modo: "incremental", fonte: "pedido.documento" },
  { nome: "fato_serial", dominio: "Estoque", modo: "incremental", fonte: "sped.produto.lote.serie" },
];

/**
 * Rótulos de domínio por prefixo do modelo Odoo. Usado para agrupar a tabela
 * de modelos (aba "Modelos") no filtro de grupo. Prefixo = primeiro segmento
 * antes do ponto (ex.: "sped.documento" → "sped" → "Fiscal").
 */
const MODELO_DOMINIO_POR_PREFIXO: Record<string, string> = {
  sped: "Fiscal",
  reinf: "Fiscal",
  finan: "Financeiro",
  estoque: "Estoque",
  pedido: "Comercial",
  contabil: "Contábil",
  res: "Cadastros",
  producao: "Produção",
};

/** Domínio de negócio de um modelo de ingestão, derivado do prefixo. */
export function modeloDominio(model: string): string {
  const prefixo = model.split(".")[0];
  return MODELO_DOMINIO_POR_PREFIXO[prefixo] ?? "Outros";
}
