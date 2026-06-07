// F5 Evals , adaptador do golden para o shape Item do retrieval.e2e da F3.
// So as 3 classes que o retrieval conhece; desambiguacao e ignorada.
import type { GoldenEntry } from "./golden-schema";

export type OraculoItem = {
  pergunta: string;
  toolEsperada: string | null;
  dominioEsperado: string | null;
  classeEsperada: "prosseguir" | "fora_de_escopo" | "falta_honesta";
};

export function goldenToOraculo(golden: GoldenEntry[]): OraculoItem[] {
  return golden
    .filter((e) => e.classe !== "desambiguacao")
    .map((e) => ({
      pergunta: e.pergunta,
      toolEsperada: e.toolEsperada,
      dominioEsperado: e.dominio,
      classeEsperada: e.classe as OraculoItem["classeEsperada"],
    }));
}

/** As 30 perguntas `prosseguir` originais do mini-oraculo congelam o gate de
 *  recall@K. Derivado por padrao de id (sem cravar lista a mao): as migradas
 *  nao tem prefixo cov-/ouro-/desamb-. As novas (cobertura/ouro/desamb) entram
 *  como "monitoradas, nao-gate". */
export function frozenProsseguir(golden: GoldenEntry[]): GoldenEntry[] {
  return golden.filter(
    (e) => e.classe === "prosseguir" && !/^(cov|ouro|desamb)-/.test(e.id),
  );
}
