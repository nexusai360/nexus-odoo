// Geometria das UFs usada pelo BrazilMap. Os paths são uma versão SIMPLIFICADA
// (Ramer-Douglas-Peucker) dos contornos do pacote @svg-maps/brazil , o original
// trazia detalhe de litoral em excesso (5.857 pontos). A simplificação fica em
// `uf-paths.gen.ts`, gerada por `scripts/gen-uf-paths.mjs`. Para regerar (ex.:
// ajustar a tolerância), rode `node scripts/gen-uf-paths.mjs`.

import { BRAZIL_VIEWBOX as VIEWBOX, UF_PATHS_GEN } from "./uf-paths.gen";

export const BRAZIL_VIEWBOX = VIEWBOX;

export interface UfPath {
  uf: string; // sigla maiúscula
  nome: string;
  path: string;
}

export const UF_PATHS: UfPath[] = UF_PATHS_GEN;
