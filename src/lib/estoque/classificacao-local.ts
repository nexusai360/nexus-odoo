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
  /**
   * O dono do local (`proprietario_local_id`) e uma empresa do PROPRIO grupo, e nao um
   * terceiro de verdade. No Odoo isso vem do participante marcado `eh_empresa`. Opcional:
   * quem nao informa fica com o comportamento antigo (o local de Terceiros continua fora),
   * que e o lado seguro.
   */
  proprietarioEhEmpresaDoGrupo?: boolean;
}

/** Separador da hierarquia no `nome_completo` do Odoo. */
const SEPARADOR = " / ";

/** Raiz da arvore do estoque proprio. */
const RAIZ_PROPRIO = "Próprio";

/** Raiz da arvore de mercadoria em poder de terceiros. */
const RAIZ_TERCEIROS = "Terceiros";

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
  // JDSDEMO nosso: local de demonstracao PROPRIO (sob "Proprio"), sem nota de
  // demonstracao, identificado por "JDS DEMO"/"demo" no nome. Regra da reuniao
  // (dono, 2026-07-19): "tudo que tem demonstracao no nome vai para demonstracao;
  // mais o JDSDEMO (nossos depositos de demo), exclusivamente". Testado ANTES do
  // deposito real, senao um JDSDEMO com estoque em maos cairia em "fisico".
  if (raiz === RAIZ_PROPRIO && /\bjds\s*demo\b|\bdemo\b/i.test(nomeCompleto)) {
    return "demonstracao";
  }

  // Em transferencia: mercadoria NOSSA em transito entre depositos proprios (documentos TRANSF-*,
  // ex. Matriz DF -> Filial SE). Decisao do dono (reuniao 2026-07-19, transcricao bruta): "esta em
  // transferencia, entra como estoque proprio, com contagem de proprio". O local "EM TRANSFERENCIA"
  // (Odoo id 446) HOJE e invisivel ao usuario de integracao por uma record rule do Odoo ("Local de
  // estoque - Empresas permitidas - acesso limitado"), entao ainda NAO chega ao cache; esta regra ja
  // fica pronta para quando o acesso for liberado e o local passar a sincronizar. Classificado por
  // NOME (o id pode variar entre ambientes). "Transporte(s)" de cliente nao casa (transporte, nao
  // transferencia). Testado ANTES do deposito real (o local nem esta sob "Proprio").
  if (/transfer[eê]ncia/i.test(nomeCompleto)) return "fisico";

  // Intercompany: local pendurado direto em "Terceiros" cujo DONO e uma das empresas do
  // proprio grupo (JDS / JHT / JIB / KS / CS / JMF). A mercadoria trocou de CNPJ dentro de
  // casa; nao virou estoque de terceiro. Decisao do dono (reuniao 2026-07-19): "e terceiro,
  // mas e nosso , conta como proprio". Caso real: o local 285 (R$ 3,86 mi), Jds Matriz DF
  // guardando mercadoria da Jht SP.
  //
  // Duas restricoes deliberadas:
  // - so o filho DIRETO de "Terceiros" (dois segmentos). As subarvores , `Demonstração`
  //   (ja tratada acima) e `Feira`/`Patrimônio` , sao equipamento posicionado fora, nao
  //   deposito, mesmo quando o dono e do grupo.
  // - o dono e reconhecido pelo cadastro do Odoo (`sped.participante.eh_empresa`), nao por
  //   texto de CNPJ no nome do local, que muda de formato e ja veio com caractere invisivel.
  const segmentos = nomeCompleto.split(SEPARADOR);
  if (
    segmentos.length === 2 &&
    segmentos[0] === RAIZ_TERCEIROS &&
    local.proprietarioEhEmpresaDoGrupo === true
  ) {
    return "fisico";
  }

  const ehDepositoReal =
    raiz === RAIZ_PROPRIO &&
    local.estoqueEmMaos &&
    local.calculaExtratoSaldo &&
    local.temProprietario;

  return ehDepositoReal ? "fisico" : "fora";
}
