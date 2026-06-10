// src/lib/fiscal/grupo/whitelist-grupo.ts
/**
 * Whitelist de participante_id (odoo_id) dos estabelecimentos do grupo economico,
 * VALIDADA no cache real (2026-06-10). E a 1a camada de `ehNotaIntragrupo`: torna a
 * marcacao intercompany resiliente quando o `fato_parceiro` esta corrompido
 * (documento_digits vazio) e o `participante_nome` da nota vier sem CNPJ legivel.
 *
 * Delta esperado HOJE = R$ 0: o fallback de nome ja captura todas as notas intragrupo
 * (auditoria fecha ao centavo por ano). A whitelist e BLINDAGEM, nao correcao , o ganho
 * e nao depender do regex de nome no futuro. O gate S0 (scripts/conferencia-fiscal.ts)
 * prova mecanicamente que a eliminacao nunca reduz abaixo do baseline pre-whitelist.
 * Ver RADAR R-intercompany-fallback-fragil.
 *
 * Criterio de inclusao (reproduzivel via SELECT, ver derivacao no PLAN v3 Task 1):
 * participante_id que aparece em nota de saida autorizada cujo participante_nome casa
 * RAIZES_GRUPO por CNPJ, E cujo cadastro (fato_parceiro.documento_digits) tem raiz no
 * grupo OU esta vazio mas com notas recorrentes (pids 2/9/10/11/12/13 , doc corrompido).
 * O pid 24 (Ijht Premium Car, doc raiz 34161829 no grupo) e membro legitimo , incluido.
 *
 * PONTO DE PARAMETRIZACAO FUTURA: virar tabela/config quando o grupo mudar.
 */
export const PARTICIPANTES_GRUPO_WHITELIST: ReadonlySet<number> = new Set([
  2, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24,
]);

/**
 * odoo_id RECICLADOS pelo Odoo para TERCEIROS (NAO sao o grupo). O RADAR os listava como
 * candidatos, mas a auditoria provou que o cadastro (fato_parceiro.documento_digits) aponta
 * para CNPJ FORA do grupo: 7719=Residencial Thais Carla, 8722=Jaguaribe Empreendimentos,
 * 8723=Vilmar Luiz Borges, 9552=Smartfit. Mantidos aqui so para travar (teste) que ninguem
 * os readicione por engano , se o Odoo reciclar de novo para um cliente externo com vendas,
 * incluí-los vazaria receita externa real para a eliminacao intragrupo.
 */
export const PARTICIPANTES_RECICLADOS_EXCLUIDOS: ReadonlySet<number> = new Set([
  7719, 8722, 8723, 9552,
]);
