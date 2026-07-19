// src/worker/fatos/captura-saldo.ts
// Captura append-por-mudanca do SALDO, acoplada ao fim do ciclo snapshot (depois do
// rebuildFatoEstoqueSaldo). Le fato_estoque_saldo, calcula o delta contra o vigente e grava
// em lotes. Grava quando quantidade OU vrSaldo mudam, cada uma na sua escala real (4 e 2), por
// comparacao de string decimal. A guarda recusa a rodada se as baixas passarem do teto.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { calcularDelta, type LinhaSerie } from "../../lib/estoque/delta-serie";
import { decidirRodada } from "../../lib/estoque/guarda-sanidade";
import type { ResultadoCaptura } from "./captura-preco";
import {
  LOTE_INSERT,
  LOTE_UPDATE,
  emLotes,
  recusadasSeguidas,
  temBaseAnterior,
} from "./captura-serie";

const SERIE = "saldo";

/** chave de saldo: produto:local. */
function chaveSaldo(produtoId: number, localId: number): string {
  return `${produtoId}:${localId}`;
}

function parseSaldo(chave: string): { produtoId: number; localId: number } {
  const [p, l] = chave.split(":");
  return { produtoId: Number(p), localId: Number(l) };
}

export async function capturarSaldo(
  prisma: PrismaClient,
  agora: Date = new Date(),
): Promise<ResultadoCaptura> {
  // 1) fato atual, sem nulos na chave (paridade com a captura de preco).
  const fato = await prisma.fatoEstoqueSaldo.findMany({
    where: { produtoId: { not: null }, localId: { not: null } },
    select: {
      odooSaldoId: true,
      produtoId: true,
      produtoNome: true,
      localId: true,
      localNome: true,
      quantidade: true,
      vrSaldo: true,
      familiaId: true,
      familiaNome: true,
      marcaId: true,
      marcaNome: true,
      unidade: true,
    },
  });

  // 2) monta as linhas (saldo nao tem duplicata de chave; dedup dispensavel, mas o id vem do
  //    odooSaldoId caso apareca no futuro).
  const metaPorChave = new Map<string, (typeof fato)[number]>();
  const atuais: LinhaSerie[] = fato.map((f) => {
    const chave = chaveSaldo(f.produtoId!, f.localId!);
    metaPorChave.set(chave, f);
    return {
      chave,
      valores: [
        f.quantidade === null ? null : f.quantidade.toString(),
        f.vrSaldo === null ? null : f.vrSaldo.toString(),
      ],
    };
  });

  // 3) vigente anterior.
  const vigentesRows = await prisma.fatoEstoqueSaldoHistorico.findMany({
    where: { vigente: true },
    select: { produtoId: true, localId: true, quantidade: true, vrSaldo: true },
  });
  const vigentes: LinhaSerie[] = vigentesRows.map((v) => ({
    chave: chaveSaldo(v.produtoId, v.localId),
    valores: [
      v.quantidade === null ? null : v.quantidade.toString(),
      v.vrSaldo === null ? null : v.vrSaldo.toString(),
    ],
  }));

  // 4) delta.
  const delta = calcularDelta(atuais, vigentes);
  const baixas = delta.filter((d) => d.evento === "baixa").length;

  // 5) guarda.
  const decisao = decidirRodada({
    baixasNestaRodada: baixas,
    temBaseAnterior: await temBaseAnterior(prisma, SERIE),
    recusadasSeguidas: await recusadasSeguidas(prisma, SERIE),
  });

  const rodadaId = randomUUID();

  if (decisao.status === "recusada" || delta.length === 0) {
    await prisma.fatoCapturaRodada.create({
      data: { id: rodadaId, serie: SERIE, capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: 0, status: decisao.status, motivo: decisao.motivo },
    });
    return { rodadaId, status: decisao.status, gravadas: 0 };
  }

  const afetadas = delta.map((d) => parseSaldo(d.chave));
  const linhasNovas = delta.map((d) => {
    const k = parseSaldo(d.chave);
    const meta = metaPorChave.get(d.chave);
    return {
      rodadaId,
      capturadoEm: agora,
      produtoId: k.produtoId,
      produtoNome: meta?.produtoNome ?? null,
      localId: k.localId,
      localNome: meta?.localNome ?? null,
      quantidade: d.valores[0],
      vrSaldo: d.valores[1],
      familiaId: meta?.familiaId ?? null,
      familiaNome: meta?.familiaNome ?? null,
      marcaId: meta?.marcaId ?? null,
      marcaNome: meta?.marcaNome ?? null,
      unidade: meta?.unidade ?? null,
      evento: d.evento,
      vigente: true,
    };
  });

  await prisma.$transaction(
    async (tx) => {
      if (vigentes.length > 0) {
        for (const lote of emLotes(afetadas, LOTE_UPDATE)) {
          await tx.fatoEstoqueSaldoHistorico.updateMany({
            where: { vigente: true, OR: lote.map((k) => ({ produtoId: k.produtoId, localId: k.localId })) },
            data: { vigente: false },
          });
        }
      }
      for (const lote of emLotes(linhasNovas, LOTE_INSERT)) {
        await tx.fatoEstoqueSaldoHistorico.createMany({ data: lote });
      }
      await tx.fatoCapturaRodada.create({
        data: { id: rodadaId, serie: SERIE, capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: delta.length, status: decisao.status, motivo: decisao.motivo },
      });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  return { rodadaId, status: decisao.status, gravadas: delta.length };
}
