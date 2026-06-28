// Gating de blocos (Onda 1, RBAC nível 1). Filtra os blocos cujo componente o
// usuário NÃO pode ver, ANTES de qualquer query (barreira no server). A função é
// pura: recebe um predicado `pode(capability)` já resolvido pelo chamador.
import type { BlocoLayout } from "./layout";
import { componentePorId } from "./catalogo";

/**
 * Mantém só os blocos cujo componente existe no catálogo E cuja capability o
 * usuário possui. Bloco de componente desconhecido é descartado.
 */
export function filtrarPermitidos(
  blocos: BlocoLayout[],
  pode: (capability: string) => boolean,
): BlocoLayout[] {
  return blocos.filter((b) => {
    const comp = componentePorId(b.componenteId);
    if (!comp) return false;
    return pode(comp.capability);
  });
}
