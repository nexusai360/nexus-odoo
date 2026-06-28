// Adaptador dos paths do pacote @svg-maps/brazil para o nosso componente.
// O pacote exporta default { viewBox, locations: [{ id (minúsculo), name, path }] }.
// Normalizamos o id para a sigla maiúscula (UF) usada no resto do app.

import brazilMap from "@svg-maps/brazil";

interface SvgMapLocation {
  id: string;
  name: string;
  path: string;
}
interface SvgMap {
  viewBox: string;
  locations: SvgMapLocation[];
}

const mapa = brazilMap as unknown as SvgMap;

export const BRAZIL_VIEWBOX = mapa.viewBox;

export interface UfPath {
  uf: string; // sigla maiúscula
  nome: string;
  path: string;
}

export const UF_PATHS: UfPath[] = mapa.locations.map((l) => ({
  uf: l.id.toUpperCase(),
  nome: l.name,
  path: l.path,
}));
