// As opções do seletor de empresa, montadas uma vez só.
//
// Antes cada tela remontava essa lista à mão, e por isso o filtro só existia na Visão geral:
// levar para as outras significava copiar e colar o mesmo bloco. Aqui a lista nasce em um
// lugar e as quatro telas consomem.

import type { EmpresaFato } from "@/lib/metrics/_shared/empresa";
import type { EmpresaOpcao } from "@/components/diretoria/diretoria-empresa-select";

export function opcoesDeEmpresa(empresas: EmpresaFato[]): EmpresaOpcao[] {
  return empresas.map((e) => ({
    empresaId: e.empresaId,
    nome: e.nome,
    // Desambigua as homônimas (matriz e filial com o mesmo nome base).
    detalhe:
      e.tipo === "desconhecido"
        ? null
        : `${e.tipo === "matriz" ? "Matriz" : "Filial"}${e.uf ? ` ${e.uf}` : ""}`,
  }));
}
