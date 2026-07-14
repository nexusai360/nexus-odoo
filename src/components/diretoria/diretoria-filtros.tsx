// A barra de filtros da Diretoria: período + empresa, juntos, no mesmo lugar, em TODAS as
// telas (Visão geral, Vendas, Pedidos, Estoque).
//
// Por que ela existe (dono, 2026-07-14): os filtros só apareciam na Visão geral. Nas outras
// telas o usuário via números sem saber de que período eram, e não conseguia recortar por
// empresa. Pior: cada tela tinha uma barra montada à mão, então "colocar o filtro em todas"
// era copiar e colar quatro vezes, e esquecer uma.
//
// Ela vive ACIMA das abas de propósito. As abas são estado do cliente e trocam sem recarregar
// a página; o filtro é estado da URL e recarrega o servidor. Se a barra ficasse dentro de uma
// aba, sumiria ao trocar de aba. Fora delas, continua visível e aplicada o tempo todo.
//
// O filtro é a URL (`?periodo=`, `?de=`, `?ate=`, `?empresa=`), não estado de componente: o
// link é compartilhável, o botão voltar do navegador funciona, e o server component lê direto.

import { DiretoriaPeriodBar } from "@/components/diretoria/diretoria-period-bar";
import {
  DiretoriaEmpresaSelect,
  type EmpresaOpcao,
} from "@/components/diretoria/diretoria-empresa-select";

export function DiretoriaFiltros({
  empresas,
  /** Texto curto dizendo o que o período recorta nesta tela (ex.: "notas e pedidos"). */
  aviso,
}: {
  empresas: EmpresaOpcao[];
  aviso?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/40 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DiretoriaPeriodBar />
        <DiretoriaEmpresaSelect empresas={empresas} />
      </div>
      {aviso ? <p className="text-xs text-muted-foreground">{aviso}</p> : null}
    </div>
  );
}
