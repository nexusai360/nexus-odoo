// src/worker/fatos/fato-serial-saldo.ts
//
// Onde cada serial esta, e quanto ele tem de saldo.
//
// O fato_serial antigo lista todo serial ja cadastrado no Odoo e nao sabe onde ele esta:
// dos 3.828 "em estoque", 100% tinham local nulo, porque a fonte dele (o cadastro de
// lote/serie) so preenche o local de quem JA SAIU. A tela mostrava uma lista de numeros,
// sem saldo e sem lugar , exatamente a reclamacao do colaborador.
//
// A fonte certa ja estava no cache e ninguem lia: a rastreabilidade do saldo de hoje, que
// casa serial + local + saldo. E dela que este fato nasce.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoSerialSaldoRow {
  odooId: number;
  serial: string;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  classificacao: string;
  saldo: number;
  valorCusto: number | null;
}

export function mapSerialSaldoRow(
  raw: Record<string, unknown>,
  classificacaoDeLocal: Map<number, string>,
  custoDeProduto: Map<number, number>,
): FatoSerialSaldoRow | null {
  const serial = relNome(raw.lote_serie_id as OdooM2O);
  const saldo = Number(raw.saldo ?? 0);

  // Serial sem numero nao e serial; saldo <= 0 nao esta em estoque (zerado ja saiu,
  // negativo e furo de inventario).
  if (!serial || !Number.isFinite(saldo) || saldo <= 0) return null;

  const localId = relId(raw.local_id as OdooM2O);
  const produtoId = relId(raw.produto_id as OdooM2O);
  const custo = produtoId != null ? custoDeProduto.get(produtoId) ?? null : null;

  return {
    odooId: Number(raw.id),
    serial,
    produtoId,
    produtoNome: relNome(raw.produto_id as OdooM2O),
    localId,
    localNome: relNome(raw.local_id as OdooM2O),
    // Local desconhecido nao vira estoque de casa: fail-closed, igual ao resto.
    classificacao:
      localId != null ? classificacaoDeLocal.get(localId) ?? "fora" : "fora",
    saldo,
    valorCusto: custo != null ? custo * saldo : null,
  };
}

/** Reconstrói fato_serial_saldo a partir de raw_estoque_saldo_rastreabilidade_hoje. */
export async function rebuildFatoSerialSaldo(
  prisma: PrismaClient,
): Promise<number> {
  const [rawRows, locais, produtos] = await Promise.all([
    prisma.rawEstoqueSaldoRastreabilidadeHoje.findMany({
      where: { rawDeleted: false },
      select: { data: true },
    }),
    prisma.fatoEstoqueLocal.findMany({
      select: { odooId: true, classificacao: true },
    }),
    prisma.fatoProduto.findMany({ select: { odooId: true, precoCusto: true } }),
  ]);

  const classificacaoDeLocal = new Map(
    locais.map((l) => [l.odooId, l.classificacao]),
  );
  const custoDeProduto = new Map(
    produtos.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]),
  );

  const mapped = rawRows
    .map((r) =>
      mapSerialSaldoRow(
        r.data as Record<string, unknown>,
        classificacaoDeLocal,
        custoDeProduto,
      ),
    )
    .filter((m): m is FatoSerialSaldoRow => m != null && Number.isFinite(m.odooId));

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoSerialSaldo.deleteMany({});
      if (mapped.length) {
        await tx.fatoSerialSaldo.createMany({
          data: mapped.map((m) => ({ ...m, atualizadoEm: new Date() })),
        });
      }
      await markFatoBuilt(tx, "fato_serial_saldo");
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
  return mapped.length;
}
