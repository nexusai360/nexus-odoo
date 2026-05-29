export type Balde = "A" | "B" | "C";

export type PrevisaoAtivacao = "em_uso" | "instalado_sem_uso" | "sem_sinal";

export type Motivo =
  | "transient"
  | "sufixo_tecnico"
  | "prefixo_ui_infra"
  | "volume_acima_threshold"
  | "baixo_volume_dominio_negocio"
  | "baixo_volume_nao_negocio"
  | "acesso_negado"
  | "abstract_ou_inexistente";

export type TipoErroRpc = "acesso_negado" | "abstract" | "transitorio";

/** Modelo como sai do schema.json (normalizado). */
export interface ModeloSchema {
  modelo: string; // chave técnica, ex.: "sped.mdfe"
  descricao: string; // schema.name, ex.: "MDF-e"
  transient: boolean;
}

export interface EntradaBalde {
  dominio: string;
  descricao: string;
  balde: Balde;
  count: number | null;
  transient: boolean;
  motivo: Motivo;
  previsao_ativacao?: PrevisaoAtivacao;
}

export interface NaoClassificado {
  modelo: string;
  erro: string;
}

export interface ContagemBaldes {
  A: number;
  B: number;
  C: number;
  nao_classificados: number;
}

export interface ResultadoBaldes {
  gerado_em: string;
  fonte_schema: string;
  rodou_sob_uid: number | null;
  thresholds: { balde_a_min: number; balde_b_max: number };
  totais: ContagemBaldes & { total: number };
  por_dominio: Record<string, ContagemBaldes>;
  modelos: Record<string, EntradaBalde>;
  nao_classificados: NaoClassificado[];
}
