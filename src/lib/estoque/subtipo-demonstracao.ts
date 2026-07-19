import { SHOWROOM_ODOO_ID } from "./classificacao-local";

/** Raiz da árvore do estoque próprio (mesma constante lógica de classificacao-local). */
const RAIZ_PROPRIO = "Próprio";
const SEPARADOR = " / ";

/**
 * Sub-tipo de um local JA classificado como demonstração (ver classificarLocal).
 * A reunião pediu o painel de demonstração em 2 blocos:
 * - "nosso": nossos depósitos de demonstração (raiz "Próprio": showroom + JDSDEMO),
 *   sem nota de demonstração;
 * - "cliente": produto na casa do cliente com nota de demonstração (raiz "Terceiros").
 *
 * Derivado da raiz do `nome_completo`; o showroom é reconhecido pelo id (exceção que o
 * dado do Odoo não expressa sozinho, igual em classificarLocal).
 */
export function subtipoDemonstracao(
  nomeCompleto: string | null,
  odooId: number,
): "nosso" | "cliente" {
  if (odooId === SHOWROOM_ODOO_ID) return "nosso";
  const raiz = (nomeCompleto ?? "").split(SEPARADOR)[0];
  return raiz === RAIZ_PROPRIO ? "nosso" : "cliente";
}
