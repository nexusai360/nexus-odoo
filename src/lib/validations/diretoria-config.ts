import { z } from "zod";

import {
  INDICE_ESTOQUE_MIN,
  INDICE_ESTOQUE_MAX,
  indiceValido,
} from "@/lib/indice-estoque";

/**
 * Configuracao da Diretoria (Configuracao > Diretoria > Vendas).
 *
 * Fica FORA da server action de proposito: um arquivo "use server" so pode exportar funcoes
 * async, entao o schema (um objeto) precisa morar aqui.
 */
export const diretoriaConfigSchema = z.object({
  indiceValorEstoque: z
    .number()
    .refine(indiceValido, `Use um número entre ${INDICE_ESTOQUE_MIN} e ${INDICE_ESTOQUE_MAX}.`),
});

export type DiretoriaConfig = z.infer<typeof diretoriaConfigSchema>;
