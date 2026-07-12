"use server";

import { prisma } from "@/lib/prisma";
import { getCorteDados } from "@/lib/corte-dados";

/**
 * Data mínima do calendário da Diretoria: o CORTE DE DADOS configurado em Configuração
 * (marco zero da plataforma). Antes era a primeira nota do cache, o que deixava escolher
 * períodos que a plataforma não cobre de verdade. Retorna `yyyy-mm-dd`.
 */
export async function getDiretoriaMinDate(): Promise<string | null> {
  return getCorteDados(prisma);
}
