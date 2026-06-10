// src/lib/fiscal/regras/classificar.ts
import type { RegraOperacao } from "./tipos";
import { MAPA_CFOP } from "./cfop-mapa";
import { regraPorPrefixo } from "./cfop-prefixo";

const SEM_CFOP: RegraOperacao = { categoria: "sem_cfop", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
const FALLBACK: RegraOperacao = { categoria: "outras", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };

/**
 * Classifica um CFOP de 4 digitos em uma RegraOperacao. Precedencia:
 * 1) MAPA_CFOP (curado) ; 2) regraPorPrefixo (grupo, ordem fiscal) ;
 * 3) fallback conservador "outras" (na duvida NAO e receita). CFOP nulo/invalido
 * -> sem_cfop (linha propria + alerta de gap na metrica).
 */
export function classificarCfop(cfop: string | null | undefined): RegraOperacao {
  if (!cfop || !/^\d{4}$/.test(cfop)) return SEM_CFOP;
  return MAPA_CFOP[cfop] ?? regraPorPrefixo(cfop) ?? FALLBACK;
}
