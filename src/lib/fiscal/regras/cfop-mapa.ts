// src/lib/fiscal/regras/cfop-mapa.ts
import type { RegraOperacao } from "./tipos";

function mapear(lista: string[], regra: RegraOperacao): Record<string, RegraOperacao> {
  const out: Record<string, RegraOperacao> = {};
  for (const cfop of lista) out[cfop] = regra;
  return out;
}

const VENDA: RegraOperacao = { categoria: "venda", ehReceita: true, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: true };
const EXPORTACAO: RegraOperacao = { categoria: "exportacao", ehReceita: true, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const SERVICO: RegraOperacao = { categoria: "servico", ehReceita: true, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: true };
const TRANSFER_ESTOQUE: RegraOperacao = { categoria: "transferencia", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const TRANSFER_SIMPLES: RegraOperacao = { categoria: "transferencia", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
const DEV_COMPRA: RegraOperacao = { categoria: "devolucao_compra", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const DEV_VENDA: RegraOperacao = { categoria: "devolucao_venda", ehReceita: false, deduzReceita: true, afetaEstoque: true, ehIntercompanySeGrupo: false };
const VENDA_ATIVO: RegraOperacao = { categoria: "venda_ativo", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const SIMPLES_FAT: RegraOperacao = { categoria: "simples_faturamento", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
const BONIFICACAO: RegraOperacao = { categoria: "bonificacao", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
const OUTRAS: RegraOperacao = { categoria: "outras", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };

/**
 * Mapa curado de CFOP -> regra. Fonte: Apendice A da SPEC v3 (validado no dado real).
 * `ehReceita` na otica de faturamento de mercadoria/servico do grupo (intercompany e
 * ortogonal, tratado na Fase 2 via ehIntercompanySeGrupo). Grupos numerosos de baixo
 * risco (remessa/retorno, entrada anomala) ficam no fallback por prefixo, nao aqui.
 */
export const MAPA_CFOP: Record<string, RegraOperacao> = {
  // Venda (propria + revenda colapsadas nesta fase , ambas receita).
  ...mapear(["5101", "5102", "6101", "6102", "6107", "6108", "5403", "6403", "5405", "6404"], VENDA),
  // Venda fora do estabelecimento / entrega futura (faturamento da venda , receita).
  ...mapear(["5117", "6117", "5119", "6119", "5120", "6120"], VENDA),
  // Exportacao.
  ...mapear(["7101", "7102", "7105", "7106", "7127", "7949"], EXPORTACAO),
  // Servico (ISSQN + transporte) , receita, nao remessa. 5932/6932 = servico de transporte
  // (review fiscal: 6932 = R$ 160.580 caia em remessa pela regex cobrir so 933).
  ...mapear(["5933", "6933", "5353", "6353", "5301", "6301", "5932", "6932"], SERVICO),
  // Transferencia entre estabelecimentos (movimenta estoque).
  ...mapear(["5151", "5152", "6151", "6152", "5409", "6409"], TRANSFER_ESTOQUE),
  // Transferencia de servico/ativo/credito (sem estoque fisico).
  ...mapear(["5552", "6552", "5557", "6557", "5601", "6601"], TRANSFER_SIMPLES),
  // Devolucao de COMPRA (saida que devolve ao fornecedor) , NAO deduz receita.
  ...mapear(["5202", "5210", "6202", "6210", "5411", "6411", "5209", "6209"], DEV_COMPRA),
  // Devolucao de VENDA (informativo deduz; F1 nao subtrai).
  ...mapear(["1201", "1202", "2202", "1410", "1411", "2410", "2411"], DEV_VENDA),
  // Venda de ativo imobilizado , fora do faturamento de mercadoria.
  ...mapear(["5551", "6551"], VENDA_ATIVO),
  // Entrega futura: simples faturamento (a receita reconhece no x117 da venda).
  ...mapear(["5922", "6922"], SIMPLES_FAT),
  // Bonificacao/brinde/doacao , nao e receita por padrao.
  ...mapear(["5910", "6910"], BONIFICACAO),
  // Devolucao de consignacao (review fiscal: 6918 caia em remessa). Nao e receita.
  ...mapear(["5918", "6918"], DEV_COMPRA),
  // "Outra saida nao especificada" (5949/6949 = R$ 11,78 mi). Lixeira fiscal: NAO e
  // remessa (substancia indefinida). Fica em `outras` com visibilidade, fora da receita.
  ...mapear(["5949", "6949"], OUTRAS),
};
