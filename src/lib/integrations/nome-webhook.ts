/**
 * Comparação de nome de webhook , módulo PURO, sem Prisma.
 *
 * Fica fora de `nome-unico.ts` (que consulta o banco) porque os componentes de
 * client importam esta função para validar em tempo real; importar o módulo do
 * servidor arrastaria o Prisma/pg para o bundle do browser.
 */

/** Dois nomes são "o mesmo" ignorando espaços nas pontas e maiúsculas. */
export function mesmoNome(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
}
