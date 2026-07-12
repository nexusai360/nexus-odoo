"use server";

// Configuracao da DIRETORIA (Configuracao > Diretoria > Vendas).
// Hoje tem um parametro: o indice de valorizacao do estoque (o valor a custo e dividido por
// ele para virar o KPI). Fonte unica do valor: src/lib/indice-estoque.ts.

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  INDICE_ESTOQUE_KEY,
  INDICE_ESTOQUE_PADRAO,
  INDICE_ESTOQUE_MIN,
  INDICE_ESTOQUE_MAX,
  indiceValido,
  invalidarCacheIndice,
} from "@/lib/indice-estoque";

export const diretoriaConfigSchema = z.object({
  indiceValorEstoque: z
    .number()
    .refine(indiceValido, `Use um número entre ${INDICE_ESTOQUE_MIN} e ${INDICE_ESTOQUE_MAX}.`),
});

export type DiretoriaConfig = z.infer<typeof diretoriaConfigSchema>;

export async function getDiretoriaConfig(): Promise<DiretoriaConfig> {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") throw new Error("Acesso negado");

  const row = await prisma.appSetting.findUnique({ where: { key: INDICE_ESTOQUE_KEY } });
  const bruto = typeof row?.value === "number" ? row.value : Number(row?.value);
  return {
    indiceValorEstoque: indiceValido(bruto) ? bruto : INDICE_ESTOQUE_PADRAO,
  };
}

export async function updateDiretoriaConfig(input: unknown) {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") throw new Error("Acesso negado");

  const parsed = diretoriaConfigSchema.parse(input);

  await prisma.appSetting.upsert({
    where: { key: INDICE_ESTOQUE_KEY },
    update: { value: parsed.indiceValorEstoque, updatedById: me.id },
    create: {
      key: INDICE_ESTOQUE_KEY,
      value: parsed.indiceValorEstoque,
      category: "diretoria",
      updatedById: me.id,
    },
  });

  // O KPI le o indice de um cache de processo: derruba para o valor novo valer na proxima tela.
  invalidarCacheIndice();
  await logAudit({
    userId: me.id,
    action: "setting_updated",
    targetType: "diretoria_config",
    details: { scope: "diretoria", ...parsed },
  });
  return { ok: true };
}
