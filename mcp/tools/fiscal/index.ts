// mcp/tools/fiscal/index.ts
// Índice do domínio fiscal. Exporta o array de tools (20 tools).
import type { ToolEntry } from "../../catalog/types.js";
import { fiscalFaturamentoPeriodo } from "./faturamento-periodo.js";
import { fiscalNotasEmitidas } from "./notas-emitidas.js";
import { fiscalNotasRecebidas } from "./notas-recebidas.js";
import { fiscalImpostosPeriodo } from "./impostos-periodo.js";
import { fiscalFaturamentoPorCliente } from "./faturamento-por-cliente.js";
import { fiscalProdutosFaturados } from "./produtos-faturados.js";
import { fiscalNotasRecebidasPorFornecedor } from "./notas-recebidas-por-fornecedor.js";
import { fiscalApuracao } from "./apuracao-fiscal.js";
import { fiscalCartaCorrecao } from "./carta-correcao.js";
import { fiscalContarNotas } from "./contar-notas.js";
import { fiscalCertificados } from "./certificados.js";
import { fiscalReferenciaBuscar } from "./referencia-buscar.js";
import { fiscalFaturamentoPorMarca } from "./faturamento-por-marca.js";
import { fiscalFaturamentoMensalSerie } from "./faturamento-mensal-serie.js";
import { fiscalFaturamentoPorUf } from "./faturamento-por-uf.js";
import { fiscalNotasEmitidasPorCliente } from "./notas-emitidas-por-cliente.js";
import { fiscalNotasEmitidasPorProduto } from "./notas-emitidas-por-produto.js";
import { fiscalDfeImportadosPeriodo } from "./dfe-importados-periodo.js";
import { fiscalDfePorFornecedor } from "./dfe-por-fornecedor.js";
import { fiscalDfePendentesManifestacao } from "./dfe-pendentes-manifestacao.js";
import { fiscalMdfeManifestos } from "./mdfe-manifestos.js";
import { fiscalReinfEventos } from "./reinf-eventos.js";
// F1 (faturamento + corte por empresa)
import { fiscalFaturamentoPorEmpresa } from "./faturamento-por-empresa.js";
import { fiscalFaturamentoPorOperacao } from "./faturamento-por-operacao.js";
import { fiscalFaturamentoPorCfop } from "./faturamento-por-cfop.js";
import { fiscalFaturamentoNaoAutorizado } from "./faturamento-nao-autorizado.js";
import { fiscalFaturamentoRecebido } from "./faturamento-recebido.js";
import { fiscalDetalharNota } from "./detalhar-nota.js";
// F2 (intercompany + receita consolidada)
import { fiscalReceitaConsolidada } from "./receita-consolidada.js";
import { fiscalIntercompany } from "./intercompany.js";
// F3 (ponte de reconciliacao)
import { fiscalPonteFaturamento } from "./ponte-faturamento.js";
// F4 (margem bruta aproximada)
import { fiscalMargemAproximada } from "./margem-aproximada.js";

export const fiscalTools: ToolEntry[] = [
  fiscalFaturamentoPeriodo as ToolEntry,
  fiscalNotasEmitidas as ToolEntry,
  fiscalNotasRecebidas as ToolEntry,
  fiscalImpostosPeriodo as ToolEntry,
  fiscalFaturamentoPorCliente as ToolEntry,
  fiscalProdutosFaturados as ToolEntry,
  fiscalNotasRecebidasPorFornecedor as ToolEntry,
  fiscalApuracao as ToolEntry,
  fiscalCartaCorrecao as ToolEntry,
  fiscalContarNotas as ToolEntry,
  fiscalCertificados as ToolEntry,
  fiscalReferenciaBuscar as ToolEntry,
  fiscalFaturamentoPorMarca as ToolEntry,
  fiscalFaturamentoMensalSerie as ToolEntry,
  fiscalFaturamentoPorUf as ToolEntry,
  fiscalNotasEmitidasPorCliente as ToolEntry,
  fiscalNotasEmitidasPorProduto as ToolEntry,
  // O1 (onda DF-e de entrada)
  fiscalDfeImportadosPeriodo as ToolEntry,
  fiscalDfePorFornecedor as ToolEntry,
  fiscalDfePendentesManifestacao as ToolEntry,
  // B2 (onda fiscal complementar)
  fiscalMdfeManifestos as ToolEntry,
  fiscalReinfEventos as ToolEntry,
  // F1 (faturamento + corte por empresa)
  fiscalFaturamentoPorEmpresa as ToolEntry,
  fiscalFaturamentoPorOperacao as ToolEntry,
  fiscalFaturamentoPorCfop as ToolEntry,
  fiscalFaturamentoNaoAutorizado as ToolEntry,
  fiscalFaturamentoRecebido as ToolEntry,
  // F2 (Bloco D , detalhe por odooId)
  fiscalDetalharNota as ToolEntry,
  // F2 (intercompany + receita consolidada externa)
  fiscalReceitaConsolidada as ToolEntry,
  fiscalIntercompany as ToolEntry,
  // F3 (ponte de reconciliacao)
  fiscalPonteFaturamento as ToolEntry,
  // F4 (margem bruta aproximada)
  fiscalMargemAproximada as ToolEntry,
];
