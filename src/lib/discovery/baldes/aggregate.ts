import { dominioDe } from "./classify";
import type {
  ContagemBaldes,
  EntradaBalde,
  NaoClassificado,
  ResultadoBaldes,
} from "./types";

export const contagemZero = (): ContagemBaldes => ({
  A: 0,
  B: 0,
  C: 0,
  nao_classificados: 0,
});

/** Recomputa totais e por_dominio a partir do dict de modelos (fonte da verdade). */
export function agregar(
  modelos: Record<string, EntradaBalde>,
  nao: NaoClassificado[],
): Pick<ResultadoBaldes, "totais" | "por_dominio"> {
  const por: Record<string, ContagemBaldes> = {};
  const tot = contagemZero();
  for (const entrada of Object.values(modelos)) {
    por[entrada.dominio] ??= contagemZero();
    por[entrada.dominio][entrada.balde]++;
    tot[entrada.balde]++;
  }
  for (const n of nao) {
    const dom = dominioDe(n.modelo);
    por[dom] ??= contagemZero();
    por[dom].nao_classificados++;
    tot.nao_classificados++;
  }
  const total = tot.A + tot.B + tot.C + tot.nao_classificados;
  return { totais: { ...tot, total }, por_dominio: por };
}
