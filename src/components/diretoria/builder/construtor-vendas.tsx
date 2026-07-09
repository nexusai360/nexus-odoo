"use client";

// Wrapper client do construtor para a tela de Vendas. Injeta o renderBloco de
// vendas. Sem filtros de dimensão por enquanto (só a pílula de período global).

import { ConstrutorGrid } from "./construtor-grid";
import { renderBlocoVendas } from "@/components/diretoria/blocos/blocos-vendas";
import type { VendasData } from "@/components/diretoria/vendas/vendas-screen";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";

export function ConstrutorVendas(props: {
  tela: DiretoriaArea;
  data: VendasData;
  layoutInicial: BlocoLayout[];
  dominios: string[];
  podeEditarPessoal: boolean;
  podeEditarGlobal: boolean;
}) {
  return <ConstrutorGrid {...props} renderBloco={renderBlocoVendas} comPeriodo={false} />;
}
