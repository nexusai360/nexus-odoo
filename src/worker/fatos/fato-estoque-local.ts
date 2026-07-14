// src/worker/fatos/fato-estoque-local.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import {
  classificarLocal,
  type ClassificacaoLocal,
} from "../../lib/estoque/classificacao-local";

export interface FatoLocalRow {
  odooId: number;
  nome: string | null;
  nomeCompleto: string | null;
  tipo: string | null;
  nivel: number | null;
  localSuperiorId: number | null;
  estoqueEmMaos: boolean;
  calculaExtratoSaldo: boolean;
  temProprietario: boolean;
  classificacao: ClassificacaoLocal;
}

/** No Odoo, um many2one vazio vem como `false`; preenchido, como [id, "rotulo"]. */
function temProprietario(valor: unknown): boolean {
  return Array.isArray(valor);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function inteiro(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function mapLocalRow(raw: Record<string, unknown>): FatoLocalRow {
  const local = {
    odooId: Number(raw.id),
    nomeCompleto: texto(raw.nome_completo),
    estoqueEmMaos: raw.estoque_em_maos === true,
    calculaExtratoSaldo: raw.calcula_extrato_saldo === true,
    temProprietario: temProprietario(raw.proprietario_local_id),
  };
  return {
    ...local,
    nome: texto(raw.nome),
    tipo: texto(raw.tipo),
    nivel: inteiro(raw.nivel),
    localSuperiorId: relId(raw.local_superior_id as OdooM2O),
    classificacao: classificarLocal(local),
  };
}

/** Reconstrói fato_estoque_local a partir de raw_estoque_local. */
export async function rebuildFatoEstoqueLocal(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawEstoqueLocal.findMany({
    where: { rawDeleted: false },
    select: { data: true },
  });
  const mapped = rawRows
    .map((r) => mapLocalRow(r.data as Record<string, unknown>))
    .filter((m) => Number.isFinite(m.odooId));

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoEstoqueLocal.deleteMany({});
      if (mapped.length) {
        await tx.fatoEstoqueLocal.createMany({
          data: mapped.map((m) => ({ ...m, atualizadoEm: new Date() })),
        });
      }
      await markFatoBuilt(tx, "fato_estoque_local");
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  return mapped.length;
}
