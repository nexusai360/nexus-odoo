"use client";

// Wrapper client do construtor para a tela de Pedidos & Entregas. Injeta o
// renderBloco de pedidos. Sem filtros de dimensão por enquanto.

import { ConstrutorGrid } from "./construtor-grid";
import { renderBlocoPedidos } from "@/components/diretoria/blocos/blocos-pedidos";
import type { PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";

export function ConstrutorPedidos(props: {
  tela: DiretoriaArea;
  data: PedidosData;
  layoutInicial: BlocoLayout[];
  dominios: string[];
  podeEditarPessoal: boolean;
  podeEditarGlobal: boolean;
}) {
  return <ConstrutorGrid {...props} renderBloco={renderBlocoPedidos} comPeriodo={false} />;
}
