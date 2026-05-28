// mcp/tools/fiscal/index.ts
// Índice do domínio fiscal. Exporta o array de tools (6 tools , C.12).
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
];
