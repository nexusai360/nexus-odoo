/**
 * Classificacao dos locais de estoque do Odoo.
 *
 * A arvore de locais tem tres raizes , `Proprio`, `Terceiros` e `Virtual` , e a
 * diretoria somava as tres no valor de estoque. So a primeira e estoque que existe
 * dentro de casa; `Virtual` (R$ 10,2 mi) e `Terceiros` (R$ 6,1 mi) inflavam o KPI em
 * 60%.
 *
 * A regra NAO e uma lista de nomes: o proprio Odoo distingue um deposito de verdade
 * dos demais locais da arvore Propria (showroom, assistencia tecnica, locais de razao
 * social, inativos) pelos campos `estoque_em_maos`, `calcula_extrato_saldo` e
 * `proprietario_local_id`. Classificar por texto seria fragil , existem, por exemplo,
 * dois locais com o nome identico "Proprio / INATIVO".
 *
 * Ordem das regras importa: `Demonstracao` e FILHA de `Terceiros`, entao ela e testada
 * antes, senao seria excluida junto com o resto da arvore.
 */

export type ClassificacaoLocal = "fisico" | "demonstracao" | "fora";

export interface LocalBruto {
  odooId: number;
  /** `nome_completo` hierarquico do raw ("Proprio / Jds - Matriz DF"), separado por " / ". */
  nomeCompleto: string | null;
  estoqueEmMaos: boolean;
  calculaExtratoSaldo: boolean;
  temProprietario: boolean;
}

/** Separador da hierarquia no `nome_completo` do Odoo. */
const SEPARADOR = " / ";

/** Raiz da arvore do estoque proprio. */
const RAIZ_PROPRIO = "Próprio";

/** Prefixo da subarvore de demonstracao (filha de Terceiros). */
const PREFIXO_DEMONSTRACAO = "Terceiros / Demonstração";

/**
 * Showroom. Vive sob "Proprio", mas o que esta la e vitrine, nao estoque vendavel.
 * E a unica excecao de negocio que o dado do Odoo nao expressa sozinho.
 */
export const SHOWROOM_ODOO_ID = 35;

export function classificarLocal(local: LocalBruto): ClassificacaoLocal {
  if (local.odooId === SHOWROOM_ODOO_ID) return "demonstracao";

  const nomeCompleto = local.nomeCompleto ?? "";
  if (nomeCompleto.startsWith(PREFIXO_DEMONSTRACAO)) return "demonstracao";

  const raiz = nomeCompleto.split(SEPARADOR)[0];
  const ehDepositoReal =
    raiz === RAIZ_PROPRIO &&
    local.estoqueEmMaos &&
    local.calculaExtratoSaldo &&
    local.temProprietario;

  return ehDepositoReal ? "fisico" : "fora";
}
