// mcp/tools/comercial/index.ts
// Exporta o array de tools do domínio comercial.
import type { ToolEntry } from "../../catalog/types.js";
import { comercialPedidosPeriodo } from "./pedidos-periodo.js";
import { comercialPedidosPorEtapa } from "./pedidos-por-etapa.js";
import { comercialPedidosPorVendedor } from "./pedidos-por-vendedor.js";
import { comercialPedidosAtrasados } from "./pedidos-atrasados.js";
import { comercialParcelasAVencer } from "./parcelas-a-vencer.js";
import { comercialPrecoProduto } from "./preco-produto.js";
import { comercialPrecoTabela } from "./preco-tabela.js";
import { comercialContarPedidos } from "./contar-pedidos.js";
import { comercialContarRegrasPreco } from "./contar-regras-preco.js";
import { comercialPedidosListarTopValor } from "./pedidos-listar-top-valor.js";
import { comercialVendedoresCadastrados } from "./vendedores-cadastrados.js";
import { comercialPedidosSemVendedor } from "./pedidos-sem-vendedor.js";
import { comercialProdutosPorMargem } from "./produtos-por-margem.js";
import { comercialPedidosPorUf } from "./pedidos-por-uf.js";
import { comercialProdutosPorFamilia } from "./produtos-por-familia.js";
import { comercialTempoMedioFechamento } from "./tempo-medio-fechamento.js";
import { comercialPedidoHistoricoEtapas } from "./pedido-historico-etapas.js";
import { comercialPedidoTravadosPorEtapa } from "./pedido-travados-por-etapa.js";

export const comercialTools: ToolEntry[] = [
  comercialPedidosPeriodo as ToolEntry,
  comercialPedidosPorEtapa as ToolEntry,
  comercialPedidosPorVendedor as ToolEntry,
  comercialPedidosAtrasados as ToolEntry,
  comercialParcelasAVencer as ToolEntry,
  comercialPrecoProduto as ToolEntry,
  comercialPrecoTabela as ToolEntry,
  comercialContarPedidos as ToolEntry,
  comercialContarRegrasPreco as ToolEntry,
  comercialPedidosListarTopValor as ToolEntry,
  comercialVendedoresCadastrados as ToolEntry,
  comercialPedidosSemVendedor as ToolEntry,
  comercialProdutosPorMargem as ToolEntry,
  comercialPedidosPorUf as ToolEntry,
  comercialProdutosPorFamilia as ToolEntry,
  comercialTempoMedioFechamento as ToolEntry,
  // O3 (onda Pedido , histórico de etapas)
  comercialPedidoHistoricoEtapas as ToolEntry,
  comercialPedidoTravadosPorEtapa as ToolEntry,
];
