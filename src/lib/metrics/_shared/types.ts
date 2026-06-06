// Tipos compartilhados da camada de metricas canonicas (F1).

export interface FaturamentoInput {
  periodoDe?: string;
  periodoAte?: string;
  empresaId?: number;
  limit?: number;
  offset?: number;
}

export interface FaturamentoResultado {
  totalNotas: number;
  valor: number;
}

export interface FaturamentoEmpresaLinha {
  empresaId: number | null;
  empresaNome: string | null;
  totalNotas: number;
  valor: number;
}

export interface EmpresaCandidata {
  odooId: number;
  nome: string;
  cnpj: string | null;
  tipo: string;
}

export type EmpresaResolucao =
  | { status: "unica"; empresa: EmpresaCandidata }
  | { status: "ambigua"; candidatas: EmpresaCandidata[] }
  | { status: "nenhuma" };
