// src/lib/estoque/guarda-sanidade.ts
// Decide se uma rodada de captura grava (base/ok) ou e recusada. Defende contra o pull
// parcial do Odoo, que encolhe o fato legitimamente (o builder tem sucesso a partir do raw
// menor) e faria a captura gravar centenas de baixas falsas e permanentes numa tabela
// append-only.
//
// Limiar ABSOLUTO, nao percentual: o desaparecimento real observado e ~1 chave em todo o
// periodo, entao um teto na casa de dezenas ja e folgado, e 20% (~920 chaves) nunca dispararia.
// Rota de saida: uma queda real e persistente (K recusas seguidas com contagem estavel)
// destrava numa nova base, senao a serie morreria no primeiro evento de negocio de verdade.
export type StatusRodada = "base" | "ok" | "recusada";

export interface DecisaoRodada {
  status: StatusRodada;
  motivo: string | null;
}

export interface EstadoGuarda {
  baixasNestaRodada: number;
  temBaseAnterior: boolean;
  recusadasSeguidas: number;
}

export const TETO_BAIXAS = 50;
export const RECUSADAS_ATE_REBASE = 3;

export function decidirRodada(e: EstadoGuarda): DecisaoRodada {
  if (!e.temBaseAnterior) return { status: "base", motivo: null };
  if (e.baixasNestaRodada <= TETO_BAIXAS) return { status: "ok", motivo: null };
  if (e.recusadasSeguidas >= RECUSADAS_ATE_REBASE) {
    return {
      status: "base",
      motivo: `queda persistente (${e.baixasNestaRodada} baixas por ${e.recusadasSeguidas} rodadas): aceita como nova base`,
    };
  }
  return {
    status: "recusada",
    motivo: `${e.baixasNestaRodada} baixas acima do teto de ${TETO_BAIXAS}: rodada recusada`,
  };
}
