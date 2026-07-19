// src/worker/fatos/captura-preco.ts
// Captura append-por-mudanca do PRECO, acoplada ao fim do ciclo cron incremental.
// Le fato_preco (dimensao='produto'), deduplica o par identico (produto 15049), calcula o
// delta contra o vigente e grava numa transacao em lotes. A guarda de sanidade recusa a rodada
// se o numero de baixas passar do teto (defesa contra pull parcial do Odoo).
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { calcularDelta, type LinhaSerie } from "../../lib/estoque/delta-serie";
import { dedupPorChave } from "../../lib/estoque/dedup-chave";
import { decidirRodada } from "../../lib/estoque/guarda-sanidade";
import {
  LOTE_INSERT,
  LOTE_UPDATE,
  emLotes,
  recusadasSeguidas,
  temBaseAnterior,
} from "./captura-serie";

export interface ResultadoCaptura {
  rodadaId: string;
  status: "base" | "ok" | "recusada";
  gravadas: number;
}

const SERIE = "preco";

/** chave de preco: tabela:produto:quantidadeMinima (a quantidadeMinima separa faixas). */
function chavePreco(tabelaId: number, produtoId: number, qtdMin: string): string {
  return `${tabelaId}:${produtoId}:${qtdMin}`;
}

function parsePreco(chave: string): { tabelaId: number; produtoId: number; quantidadeMinima: string } {
  const [t, p, q] = chave.split(":");
  return { tabelaId: Number(t), produtoId: Number(p), quantidadeMinima: q };
}

export async function capturarPreco(
  prisma: PrismaClient,
  agora: Date = new Date(),
): Promise<ResultadoCaptura> {
  // 1) fato atual, so dimensao produto e sem nulos na chave.
  const fato = await prisma.fatoPreco.findMany({
    where: { dimensao: "produto", produtoId: { not: null }, tabelaId: { not: null } },
    select: {
      odooId: true,
      tabelaId: true,
      produtoId: true,
      tabelaNome: true,
      produtoNome: true,
      quantidadeMinima: true,
      valor: true,
    },
  });

  // 2) dedup por chave (colapsa o par 15049; desempata pelo menor odoo_id).
  const metaPorChave = new Map<string, (typeof fato)[number]>();
  const itens = fato.map((f) => {
    const chave = chavePreco(f.tabelaId!, f.produtoId!, f.quantidadeMinima.toString());
    metaPorChave.set(chave, f);
    return {
      id: f.odooId,
      linha: { chave, valores: [f.valor === null ? null : f.valor.toString()] } as LinhaSerie,
    };
  });
  const { linhas: atuais, conflitos } = dedupPorChave(itens);

  // 3) vigente anterior.
  const vigentesRows = await prisma.fatoPrecoHistorico.findMany({
    where: { vigente: true },
    select: { tabelaId: true, produtoId: true, quantidadeMinima: true, valor: true },
  });
  const vigentes: LinhaSerie[] = vigentesRows.map((v) => ({
    chave: chavePreco(v.tabelaId, v.produtoId, v.quantidadeMinima.toString()),
    valores: [v.valor === null ? null : v.valor.toString()],
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
  const motivoBase = conflitos.length ? `conflitos de valor em ${conflitos.length} chaves` : null;
  const motivo = [motivoBase, decisao.motivo].filter(Boolean).join("; ") || null;

  // 6a) recusada ou nada a gravar: so registra a rodada.
  if (decisao.status === "recusada" || delta.length === 0) {
    await prisma.fatoCapturaRodada.create({
      data: { id: rodadaId, serie: SERIE, capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: 0, status: decisao.status, motivo },
    });
    return { rodadaId, status: decisao.status, gravadas: 0 };
  }

  // 6b) grava em lotes, numa transacao (bootstrap ~12k linhas nao pode estourar params/timeout).
  const afetadas = delta.map((d) => parsePreco(d.chave));
  const linhasNovas = delta.map((d) => {
    const k = parsePreco(d.chave);
    const meta = metaPorChave.get(d.chave);
    return {
      rodadaId,
      capturadoEm: agora,
      tabelaId: k.tabelaId,
      tabelaNome: meta?.tabelaNome ?? null,
      produtoId: k.produtoId,
      produtoNome: meta?.produtoNome ?? null,
      quantidadeMinima: k.quantidadeMinima,
      valor: d.valores[0],
      evento: d.evento,
      vigente: true,
    };
  });

  await prisma.$transaction(
    async (tx) => {
      // Desmarca o vigente das chaves afetadas SO se ja existe vigente (na base, nao ha).
      // Chave composta -> OR de objetos, em lotes (nunca um OR gigante).
      if (vigentes.length > 0) {
        for (const lote of emLotes(afetadas, LOTE_UPDATE)) {
          await tx.fatoPrecoHistorico.updateMany({
            where: {
              vigente: true,
              OR: lote.map((k) => ({ tabelaId: k.tabelaId, produtoId: k.produtoId, quantidadeMinima: k.quantidadeMinima })),
            },
            data: { vigente: false },
          });
        }
      }
      for (const lote of emLotes(linhasNovas, LOTE_INSERT)) {
        await tx.fatoPrecoHistorico.createMany({ data: lote });
      }
      await tx.fatoCapturaRodada.create({
        data: { id: rodadaId, serie: SERIE, capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: delta.length, status: decisao.status, motivo },
      });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  return { rodadaId, status: decisao.status, gravadas: delta.length };
}
