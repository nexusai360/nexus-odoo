// src/worker/fatos/registry.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { rebuildFatoEstoqueSaldo } from "./fato-estoque-saldo";
import { rebuildFatoEstoqueMovimento } from "./fato-estoque-movimento";
import { rebuildFatoProdutoParado } from "./fato-produto-parado";

export interface FatoBuilderEntry {
  nome: string;
  cycle: "snapshot" | "incremental";
  run: (prisma: PrismaClient) => Promise<number>;
}

export const FATO_BUILDERS: FatoBuilderEntry[] = [
  { nome: "fato_estoque_saldo", cycle: "snapshot", run: rebuildFatoEstoqueSaldo },
  { nome: "fato_estoque_movimento", cycle: "snapshot", run: rebuildFatoEstoqueMovimento },
  { nome: "fato_produto_parado", cycle: "snapshot", run: rebuildFatoProdutoParado },
];

/**
 * Executa todos os builders do `cycle` dado. Isola falhas: um builder com erro
 * não impede os demais de rodar.
 */
export async function runBuilders(
  prisma: PrismaClient,
  cycle: "snapshot" | "incremental",
  builders: FatoBuilderEntry[] = FATO_BUILDERS,
): Promise<void> {
  for (const { nome, cycle: builderCycle, run } of builders) {
    if (builderCycle !== cycle) continue;
    try {
      const n = await run(prisma);
      console.log(`[worker] ${nome} reconstruído: ${n} linhas`);
    } catch (err) {
      console.error(`[worker] falha ao reconstruir ${nome}:`, err);
    }
  }
}
